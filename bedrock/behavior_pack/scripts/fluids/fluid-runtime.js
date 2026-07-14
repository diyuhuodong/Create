import { ItemStack, system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { BedrockEscrowRegistry } from "../logistics/bedrock-escrow-registry.js";
import { registerEscrowProtection } from "../logistics/external-escrow-runtime.js";
import { createBedrockWorldFluidEscrows } from "./bedrock-world-fluid-escrow.js";
import { planFluidBucketInteraction, settleFluidBucketInteraction } from "./fluid-container.js";
import { fluidTankId, FluidNetworkState } from "./fluid-network-state.js";
import { configureFluidRun, FLUID_FACING_OFFSETS, fluidDeviceId, fluidDeviceLocation, offsetFluidLocation } from "./fluid-topology.js";
import { fluidFromVanillaSource, VanillaWorldFluidPort } from "./world-fluid-port.js";
import { steamEngineOutput } from "../kinetics/steam-engine.js";

const FLUID_PIPE_BLOCK = "createbedrock:fluid_pipe";
const FLUID_TASK_BUDGET = 8;
const FLUID_TASK_GROUP = "fluids";
const FLUID_TANK_BLOCK = "createbedrock:fluid_tank";
const MECHANICAL_PUMP_BLOCK = "createbedrock:mechanical_pump";
const POWERED_SHAFT_BLOCK = "createbedrock:powered_shaft";
const STEAM_ENGINE_BLOCK = "createbedrock:steam_engine";
const NEIGHBOR_OFFSETS = [
	{ x: 1, y: 0, z: 0 },
	{ x: -1, y: 0, z: 0 },
	{ x: 0, y: 1, z: 0 },
	{ x: 0, y: -1, z: 0 },
	{ x: 0, y: 0, z: 1 },
	{ x: 0, y: 0, z: -1 }
];
let kineticWorldProvider;
const redstoneLockedPumpIds = new Set();
const worldFluidEscrows = new BedrockEscrowRegistry();
const state = new FluidNetworkState({
	externalPortFactory({ descriptor, id }) {
		return createWorldFluidPort(descriptor, id);
	},
	onError(error) {
		console.warn(`[Create Bedrock] Fluid state error: ${error}`);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

registerEscrowProtection(() => state.activeExternalEscrowIds());

function blockKind(block) {
	if (block?.typeId === FLUID_PIPE_BLOCK)
		return "pipe";
	if (block?.typeId === MECHANICAL_PUMP_BLOCK)
		return "pump";
	return undefined;
}

function fluidTankAt(dimension, location) {
	const block = dimension.getBlock(location);
	return block?.typeId === FLUID_TANK_BLOCK ? fluidTankId(dimension.id, block.location) : undefined;
}

function fluidSectionPartition(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

function snapshotBlock(block) {
	if (!block)
		return undefined;
	return {
		...(block.isWaterlogged === undefined ? {} : { isWaterlogged: block.isWaterlogged }),
		states: block.permutation.getAllStates(),
		typeId: block.typeId
	};
}

function worldFluidPortId(dimensionId, location) {
	return `world-fluid:${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function worldFluidDescriptor(dimensionId, kind, location) {
	return {
		dimensionId,
		kind,
		location: { x: location.x, y: location.y, z: location.z }
	};
}

function createWorldFluidPort(descriptor, id) {
	if ((descriptor?.kind !== "vanilla_world_source" && descriptor?.kind !== "vanilla_world_sink") || typeof descriptor.dimensionId !== "string" || !descriptor.location || !Number.isInteger(descriptor.location.x) || !Number.isInteger(descriptor.location.y) || !Number.isInteger(descriptor.location.z))
		throw new TypeError("Invalid persisted world-fluid endpoint descriptor");
	if (id !== worldFluidPortId(descriptor.dimensionId, descriptor.location))
		throw new Error("World-fluid endpoint identifier does not match its descriptor");
	const dimension = world.getDimension(descriptor.dimensionId);
	const location = { ...descriptor.location };
	return new VanillaWorldFluidPort({
		escrows: createBedrockWorldFluidEscrows({ anchor: location, dimension, registry: worldFluidEscrows }),
		id,
		readBlock() {
			return snapshotBlock(dimension.getBlock(location));
		},
		writeBlock(replacement) {
			const block = dimension.getBlock(location);
			if (!block)
				throw new Error("World-fluid source block is unavailable");
			block.setType(replacement.typeId);
		}
	});
}

function worldSourceAt(dimension, location) {
	const block = dimension.getBlock(location);
	if (!fluidFromVanillaSource(snapshotBlock(block)))
		return undefined;
	const descriptor = worldFluidDescriptor(dimension.id, "vanilla_world_source", location);
	const id = worldFluidPortId(dimension.id, location);
	state.registerExternalPort({
		descriptor,
		partition: fluidSectionPartition(dimension.id, location),
		port: createWorldFluidPort(descriptor, id)
	});
	return id;
}

function worldSinkAt(dimension, location) {
	const block = dimension.getBlock(location);
	const snapshot = snapshotBlock(block);
	if (!snapshot || snapshot.typeId !== "minecraft:air" || snapshot.isWaterlogged)
		return undefined;
	const descriptor = worldFluidDescriptor(dimension.id, "vanilla_world_sink", location);
	const id = worldFluidPortId(dimension.id, location);
	state.registerExternalPort({
		descriptor,
		partition: fluidSectionPartition(dimension.id, location),
		port: createWorldFluidPort(descriptor, id)
	});
	return id;
}

function tankIdentifier(block) {
	return fluidTankId(block.dimension.id, block.location);
}

function pumpRunning(block, kineticWorld) {
	return Math.abs(kineticWorld?.speedAt(block.dimension.id, block.location) ?? 0) > 0;
}

function topologyDeviceAt(dimension, location) {
	const block = dimension.getBlock(location);
	const kind = blockKind(block);
	if (!kind)
		return undefined;
	return {
		dimensionId: dimension.id,
		facing: block.permutation.getAllStates()["minecraft:facing_direction"],
		kind,
		location: { ...block.location }
	};
}

function configureDevice(block, kineticWorld) {
	const kind = blockKind(block);
	if (!kind)
		return false;
	const result = configureFluidRun({
		createLink(options) {
			if (options.kind === "pipe")
				state.createPipe(options);
			else
				state.createPump({
					...options,
					running: pumpRunning(block, kineticWorld) && !redstoneLockedPumpIds.has(fluidDeviceId("pump", block.dimension.id, block.location))
				});
		},
		destinationAt(location) {
			return fluidTankAt(block.dimension, location)
				?? (kind === "pump" ? worldSinkAt(block.dimension, location) : undefined);
		},
		device: topologyDeviceAt(block.dimension, block.location),
		deviceAt(location) {
			return topologyDeviceAt(block.dimension, location);
		},
		hasLink(id) {
			return state.hasLink(id);
		},
		sourceAt(location) {
			return fluidTankAt(block.dimension, location)
				?? (kind === "pump" ? worldSourceAt(block.dimension, location) : undefined);
		}
	});
	// A pump scan can discover a world endpoint before finding the opposite
	// endpoint. Do not leave that unlinked descriptor persisted.
	if (!result.ok)
		state.pruneExternalPorts();
	return result.ok && !result.reused;
}

function configureAdjacentDevices(anchor, kineticWorld) {
	let changed = false;
	for (const offset of NEIGHBOR_OFFSETS) {
		const neighbor = anchor.dimension.getBlock(offsetFluidLocation(anchor.location, offset));
		changed = configureDevice(neighbor, kineticWorld) || changed;
	}
	return changed;
}

function linksForDevice(block) {
	const kind = blockKind(block);
	if (!kind)
		return [];
	const id = fluidDeviceId(kind, block.dimension.id, block.location);
	return state.links().filter(link => link.id === id || link.members?.includes(id));
}

function removeDevice(block) {
	const links = linksForDevice(block);
	for (const link of links)
		state.removeLink(link.id);
	if (links.length > 0)
		state.pruneExternalPorts();
	return links.length > 0;
}

function interactWithTankBucket({ dimensionId, location, plan, player, slot }) {
	if (player.selectedSlotIndex !== slot)
		return { ok: false, reason: "held_slot_changed" };
	const dimension = world.getDimension(dimensionId);
	const block = dimension.getBlock(location);
	if (block?.typeId !== FLUID_TANK_BLOCK)
		return { ok: false, reason: "tank_removed" };
	const tankId = tankIdentifier(block);
	if (!state.hasTank(tankId))
		return { ok: false, reason: "tank_unavailable" };
	const inventory = player.getComponent("minecraft:inventory")?.container;
	if (!inventory)
		return { ok: false, reason: "inventory_unavailable" };
	return settleFluidBucketInteraction({
		extractFluid(options) {
			return state.extract(tankId, options);
		},
		getHeldItem() {
			const stack = inventory.getItem(slot);
			return stack && { amount: stack.amount, typeId: stack.typeId };
		},
		insertFluid(fluid) {
			return state.insert(tankId, fluid);
		},
		plan,
		setHeldItem(item) {
			inventory.setItem(slot, new ItemStack(item.typeId, item.amount));
		}
	});
}

function syncPumpStates(kineticWorld) {
	for (const pump of state.links().filter(link => link.kind === "pump")) {
		const pumpMember = pump.members?.find(member => member.startsWith("pump:"));
		const location = fluidDeviceLocation("pump", pumpMember ?? pump.id);
		if (!location)
			continue;
		try {
			const dimension = world.getDimension(location.dimensionId);
			const block = dimension.getBlock(location.location);
			if (block?.typeId === MECHANICAL_PUMP_BLOCK)
				state.setPumpRunning(pump.id, pumpRunning(block, kineticWorld) && !redstoneLockedPumpIds.has(pumpMember ?? pump.id));
		} catch (error) {
			console.warn(`[Create Bedrock] Could not synchronize pump ${pump.id}: ${error}`);
		}
	}
}

function steamDirection(block) {
	return FLUID_FACING_OFFSETS[block?.permutation?.getAllStates?.()["minecraft:facing_direction"]] ?? { x: 0, y: 1, z: 0 };
}

function findSteamEndpoint(block, direction, typeId) {
	const direct = block.dimension.getBlock(offsetFluidLocation(block.location, direction));
	if (direct?.typeId === typeId)
		return direct;
	for (const offset of NEIGHBOR_OFFSETS) {
		const candidate = block.dimension.getBlock(offsetFluidLocation(block.location, offset));
		if (candidate?.typeId === typeId)
			return candidate;
	}
	return undefined;
}

function adjacentPoweredShafts(block) {
	return NEIGHBOR_OFFSETS
		.map(offset => block.dimension.getBlock(offsetFluidLocation(block.location, offset)))
		.filter(candidate => candidate?.typeId === POWERED_SHAFT_BLOCK);
}

function syncSteamEngines(kineticWorld) {
	if (!kineticWorld || typeof kineticWorld.getNodesByType !== "function" || typeof kineticWorld.setExternalSource !== "function")
		return false;
	let changed = false;
	for (const node of kineticWorld.getNodesByType(STEAM_ENGINE_BLOCK)) {
		try {
			const dimension = world.getDimension(node.dimensionId);
			const engine = dimension.getBlock(node.location);
			if (engine?.typeId !== STEAM_ENGINE_BLOCK)
				continue;
			const direction = steamDirection(engine);
			const tank = findSteamEndpoint(engine, { x: -direction.x, y: -direction.y, z: -direction.z }, FLUID_TANK_BLOCK);
			const shaft = findSteamEndpoint(engine, direction, POWERED_SHAFT_BLOCK);
			for (const candidate of adjacentPoweredShafts(engine))
				if (candidate.location.x !== shaft?.location.x || candidate.location.y !== shaft?.location.y || candidate.location.z !== shaft?.location.z)
					changed = kineticWorld.setExternalSource(node.dimensionId, candidate.location, { capacity: 0, speed: 0 }) || changed;
			if (!shaft)
				continue;
			const inspection = tank && state.hasTank(tankIdentifier(tank)) ? state.inspectTank(tankIdentifier(tank)) : undefined;
			const output = steamEngineOutput(inspection?.contents);
			if (output.consume > 0 && tank)
				state.extract(tankIdentifier(tank), {
					maxAmount: output.consume,
					predicate: fluid => fluid.typeId === "minecraft:water"
				});
			changed = kineticWorld.setExternalSource(node.dimensionId, shaft.location, output) || changed;
		} catch (error) {
			console.warn(`[Create Bedrock] Could not synchronize steam engine at ${node.dimensionId}:${node.location.x}:${node.location.y}:${node.location.z}: ${error}`);
		}
	}
	return changed;
}

export function extractFluidTank(block, options) {
	return state.extract(tankIdentifier(block), options);
}

export function getFluidDiagnostics() {
	return { ...state.diagnostics(), redstoneLockedPumps: redstoneLockedPumpIds.size };
}

export function inspectFluidTank(block) {
	return state.inspectTank(tankIdentifier(block));
}

export function getFluidTankId(block) {
	return tankIdentifier(block);
}

export function insertFluidTank(block, fluid, options) {
	return state.insert(tankIdentifier(block), fluid, options);
}

export function setFluidPumpRedstonePowered(dimensionId, location, powered) {
	if (typeof dimensionId !== "string" || !location || typeof powered !== "boolean")
		throw new TypeError("Redstone pump updates require a dimension, location, and power state");
	const physicalId = fluidDeviceId("pump", dimensionId, location);
	if (powered)
		redstoneLockedPumpIds.add(physicalId);
	else
		redstoneLockedPumpIds.delete(physicalId);
	let changed = false;
	for (const pump of state.links().filter(link => link.kind === "pump" && (link.id === physicalId || link.members?.includes(physicalId)))) {
		const block = world.getDimension(dimensionId).getBlock(location);
		const kineticWorld = kineticWorldProvider?.();
		changed = state.setPumpRunning(pump.id, !powered && block?.typeId === MECHANICAL_PUMP_BLOCK && pumpRunning(block, kineticWorld)) || changed;
	}
	return changed;
}

export function registerFluids(getKineticWorld) {
	if (typeof getKineticWorld !== "function")
		throw new TypeError("Fluid runtime requires the kinetic-world provider");
	kineticWorldProvider = getKineticWorld;
	registerKernelTaskGroup(FLUID_TASK_GROUP, FLUID_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (event.block.typeId === FLUID_TANK_BLOCK) {
				state.createTank({ dimensionId: event.block.dimension.id, location: event.block.location });
				configureAdjacentDevices(event.block, getKineticWorld());
				return;
			}
			configureDevice(event.block, getKineticWorld());
			configureAdjacentDevices(event.block, getKineticWorld());
		} catch (error) {
			console.warn(`[Create Bedrock] Could not configure fluid block: ${error}`);
		}
	});

	world.beforeEvents.playerBreakBlock.subscribe(event => {
		try {
			if (event.block.typeId === FLUID_TANK_BLOCK && !state.canRemoveTank(tankIdentifier(event.block))) {
				event.cancel = true;
				event.player.sendMessage("Cannot remove a fluid tank while it stores fluid or has an active connection.");
				return;
			}
			if (linksForDevice(event.block).some(link => link.activeTransferId)) {
				event.cancel = true;
				event.player.sendMessage("Cannot remove a fluid device with an active transfer.");
			}
		} catch (error) {
			console.warn(`[Create Bedrock] Could not validate fluid block removal: ${error}`);
		}
	});

	world.beforeEvents.playerInteractWithBlock.subscribe(event => {
		if (!event.isFirstEvent || event.block.typeId !== FLUID_TANK_BLOCK)
			return;
		try {
			const tankId = tankIdentifier(event.block);
			if (!state.hasTank(tankId))
				return;
			const inspection = state.inspectTank(tankId);
			const plan = planFluidBucketInteraction({
				capacity: inspection.capacity,
				contents: inspection.contents,
				item: event.itemStack && { amount: event.itemStack.amount, typeId: event.itemStack.typeId }
			});
			if (!plan)
				return;
			const slot = event.player.selectedSlotIndex;
			event.cancel = true;
			const dimensionId = event.block.dimension.id;
			const location = { ...event.block.location };
			system.run(() => {
				try {
					const result = interactWithTankBucket({ dimensionId, location, plan, player: event.player, slot });
					if (!result.ok && result.reason === "rollback_failed")
						console.warn(`[Create Bedrock] Fluid bucket rollback failed at ${dimensionId}:${location.x}:${location.y}:${location.z}`);
				} catch (error) {
					console.warn(`[Create Bedrock] Fluid bucket interaction failed: ${error}`);
				}
			});
		} catch (error) {
			console.warn(`[Create Bedrock] Could not plan fluid bucket interaction: ${error}`);
		}
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			if (event.block.typeId === FLUID_TANK_BLOCK && state.hasTank(tankIdentifier(event.block)))
				state.removeTank(tankIdentifier(event.block));
			else {
				removeDevice(event.block);
				configureAdjacentDevices(event.block, getKineticWorld());
			}
		} catch (error) {
			console.warn(`[Create Bedrock] Fluid endpoint removal deferred: ${error}`);
		}
	});

	registerTickHandler(() => {
		const kineticWorld = getKineticWorld();
		syncPumpStates(kineticWorld);
		syncSteamEngines(kineticWorld);
		return state.tick();
	}, FLUID_TASK_GROUP);
	system.run(() => {
		try {
			const restored = state.restore();
			if (restored.tanks > 0 || restored.links > 0 || restored.transfers > 0 || restored.frozen)
				console.warn(`[Create Bedrock] Restored ${restored.tanks} fluid tanks, ${restored.links} links, and ${restored.transfers} fluid transfers${restored.frozen ? " (frozen)" : ""}`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore fluid state: ${error}`);
		}
	});
}
