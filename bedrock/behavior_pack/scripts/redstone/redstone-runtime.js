import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { setFluidPumpRedstonePowered } from "../fluids/fluid-runtime.js";
import {
	getKineticWorldForTesting,
	setKineticChainGearshiftRedstonePower,
	setKineticClutchRedstonePowered,
	setKineticGearshiftRedstonePowered,
	setKineticSequencedGearshiftRedstonePowered
} from "../kinetics/kinetic-runtime.js";
import { getDepotFunnelRedstoneControls, setDepotFunnelRedstonePowered } from "../logistics/depot-runtime.js";
import { RedstoneSignalBus, redstoneControlId } from "./redstone-signal-bus.js";
import { COMPATIBILITY_REDSTONE_CONTROLS, REDSTONE_COMPATIBILITY_TARGET } from "./redstone-target.js";

const REDSTONE_TASK_BUDGET = 8;
const REDSTONE_TASK_GROUP = "redstone";
const CONTROLLED_BLOCKS = new Map(COMPATIBILITY_REDSTONE_CONTROLS);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function partitionFor(device) {
	return `${device.dimensionId}:${Math.floor(device.location.x / 16)}:${Math.floor(device.location.y / 16)}:${Math.floor(device.location.z / 16)}`;
}

function expectedBlockType(type) {
	for (const [blockType, deviceType] of CONTROLLED_BLOCKS)
		if (deviceType === type)
			return blockType;
	return undefined;
}

function deviceForBlock(block) {
	const type = CONTROLLED_BLOCKS.get(block?.typeId);
	if (!type)
		return undefined;
	const location = { ...block.location };
	return {
		dimensionId: block.dimension.id,
		id: redstoneControlId(block.dimension.id, location),
		location,
		type
	};
}

function applySignal({ available, device, power = 15 }) {
	// An unloaded block or an unavailable Script API must fail closed. A later
	// successful sample will reopen the device when the actual signal is zero.
	const powered = !available || power > 0;
	try {
		if (device.type === "clutch")
			return setKineticClutchRedstonePowered(device.dimensionId, device.location, powered);
		if (device.type === "gearshift")
			return setKineticGearshiftRedstonePowered(device.dimensionId, device.location, powered);
		if (device.type === "sequenced_gearshift")
			return setKineticSequencedGearshiftRedstonePowered(device.dimensionId, device.location, powered);
		if (device.type === "chain_gearshift")
			return setKineticChainGearshiftRedstonePower(device.dimensionId, device.location, available ? power : 15);
		if (device.type === "pump")
			return setFluidPumpRedstonePowered(device.dimensionId, device.location, powered);
		if (device.type === "funnel")
			return setDepotFunnelRedstonePowered(device.dimensionId, device.location, powered);
		throw new Error(`Unsupported redstone control type ${device.type}`);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not apply redstone signal at ${device.id}: ${error}`);
		return false;
	}
}

function readPower(device) {
	try {
		const dimension = world.getDimension(device.dimensionId);
		const block = dimension.getBlock(device.location);
		if (!block || block.typeId !== expectedBlockType(device.type))
			return undefined;
		if (typeof block.getRedstonePower !== "function")
			throw new Error("Block.getRedstonePower is unavailable in this Bedrock runtime");
		const power = block.getRedstonePower();
		return { available: true, power: Number.isInteger(power) ? power : 0 };
	} catch {
		return undefined;
	}
}

const bus = new RedstoneSignalBus({ onSignal: applySignal, readsPerTick: REDSTONE_TASK_BUDGET });
const store = new ShardedStateStore({
	keyPrefix: "createbedrock:redstone_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Redstone state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind === "device")
			return partitionFor(record.device);
		if (record?.kind === "network")
			return "redstone:network";
		throw new TypeError("Unknown redstone persistent record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function records() {
	const snapshot = bus.snapshot();
	return [
		...snapshot.devices.map(device => ({ device, kind: "device", partition: partitionFor(device) })),
		{ kind: "network", partition: "redstone:network", roundRobinAfter: snapshot.roundRobinAfter }
	];
}

function persist() {
	try {
		store.request(records());
	} catch (error) {
		console.warn(`[Create Bedrock] Could not persist redstone controls: ${error}`);
	}
}

function registerBlock(block) {
	const device = deviceForBlock(block);
	if (!device)
		return false;
	const changed = bus.register(device);
	if (!changed)
		return false;
	applySignal({ available: false, device });
	persist();
	return true;
}

function unregisterAt(dimensionId, location) {
	const removed = bus.unregister(redstoneControlId(dimensionId, location));
	if (removed)
		persist();
	return removed;
}

function bootstrapPersistedControls() {
	let registered = 0;
	const kineticNodes = getKineticWorldForTesting().snapshot().nodes;
	for (const node of kineticNodes) {
		if (!CONTROLLED_BLOCKS.has(node.typeId))
			continue;
		try {
			const block = world.getDimension(node.dimensionId).getBlock(node.location);
			registered += Number(registerBlock(block));
		} catch {
			// The owning chunk is unavailable. Its persisted redstone record, if any,
			// remains fail-closed until the block can be read again.
		}
	}
	for (const endpoint of getDepotFunnelRedstoneControls()) {
		try {
			const block = world.getDimension(endpoint.dimensionId).getBlock(endpoint.location);
			registered += Number(registerBlock(block));
		} catch {
			// See the kinetic bootstrap path above.
		}
	}
	return registered;
}

function restore() {
	let restored;
	try {
		restored = store.read();
	} catch (error) {
		console.warn(`[Create Bedrock] Could not read redstone controls: ${error}`);
		bootstrapPersistedControls();
		return;
	}
	if (!restored) {
		bootstrapPersistedControls();
		return;
	}
	if (restored.warnings.length > 0) {
		console.warn(`[Create Bedrock] Refusing ${restored.warnings.length} corrupt redstone state shard(s)`);
		bootstrapPersistedControls();
		return;
	}
	try {
		const devices = [];
		let roundRobinAfter;
		for (const record of restored.records) {
			if (record?.kind === "device") {
				if (record.partition !== partitionFor(record.device))
					throw new Error("Redstone device partition does not match its location");
				if (!expectedBlockType(record.device?.type))
					throw new Error("Redstone state contains an unsupported device type");
				devices.push(clone(record.device));
				continue;
			}
			if (record?.kind === "network") {
				if (record.partition !== "redstone:network" || roundRobinAfter !== undefined)
					throw new Error("Redstone network metadata is invalid");
				roundRobinAfter = record.roundRobinAfter;
				continue;
			}
			throw new Error("Redstone state contains an unknown record type");
		}
		bus.restore({ devices, roundRobinAfter });
		bootstrapPersistedControls();
		for (const device of bus.devices())
			applySignal({ available: false, device });
		if (devices.length > 0)
			console.warn(`[Create Bedrock] Restored ${devices.length} redstone controls`);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore redstone controls: ${error}`);
	}
}

export function getRedstoneDiagnostics() {
	return {
		...bus.diagnostics(),
		compatibilityTarget: REDSTONE_COMPATIBILITY_TARGET.id,
		outputMode: REDSTONE_COMPATIBILITY_TARGET.outputMode,
		persistence: store.diagnostics()
	};
}

export function registerRedstone() {
	registerKernelTaskGroup(REDSTONE_TASK_GROUP, REDSTONE_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			registerBlock(event.block);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not register redstone control: ${error}`);
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			unregisterAt(event.dimension.id, event.block.location);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not remove redstone control: ${error}`);
		}
	});
	registerTickHandler(() => {
		const wrote = store.tick();
		const pending = store.diagnostics().dirty || store.diagnostics().pendingActions > 0;
		if (wrote || pending)
			return wrote;
		return bus.tick(readPower).processed > 0;
	}, REDSTONE_TASK_GROUP);
	system.run(restore);
}
