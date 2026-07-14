import { system, world } from "@minecraft/server";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { deserializeVersionedState, serializeVersionedState } from "../kernel/versioned-state.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { KineticWorld } from "./kinetic-world.js";

const kineticWorld = new KineticWorld();
const LEGACY_PERSISTENCE_KEY = "createbedrock:kinetic_world_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const BELT_CONNECTOR = "createbedrock:belt_connector";
const CLUTCH_BLOCK = "createbedrock:clutch";
const WATER_WHEEL_BLOCK = "createbedrock:water_wheel";
const WATER_WHEEL_CHECK_INTERVAL = 20;
const KINETIC_DIMENSION_TASK_BUDGET = 2;
const pendingBeltEndpoints = new Map();
let waterWheelTicks = 0;
let legacyStatePendingMigration = false;

function sectionKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

function kineticRecords() {
	const snapshot = kineticWorld.snapshot();
	return [
		...snapshot.nodes.map(node => ({ kind: "node", ...node })),
		...snapshot.beltLinks.map(link => ({ kind: "belt_link", ...link }))
	];
}

function restoreKineticRecords(records) {
	const nodes = [];
	const beltLinks = [];
	for (const record of records) {
		if (record?.kind === "node") {
			const { kind, ...node } = record;
			nodes.push(node);
		} else if (record?.kind === "belt_link") {
			const { kind, ...link } = record;
			beltLinks.push(link);
		}
	}
	kineticWorld.restore({ beltLinks, nodes, schemaVersion: 2 });
}

const shardedPersistence = new ShardedStateStore({
	keyPrefix: "createbedrock:kinetic_state_v2",
	onCommit() {
		if (!legacyStatePendingMigration)
			return;
		world.setDynamicProperty(LEGACY_PERSISTENCE_KEY, undefined);
		legacyStatePendingMigration = false;
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not write sharded kinetic state: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind === "node")
			return sectionKey(record.dimensionId, record.location);
		if (record?.kind === "belt_link")
			return sectionKey(record.left.dimensionId, record.left.location);
		throw new TypeError("Unknown kinetic persistent record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});

const persistence = new DeferredPersistence({
	name: "kinetics",
	write() {
		shardedPersistence.request(kineticRecords());
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist kinetic state: ${error}`);
	}
});

function persist() {
	persistence.request();
}

function setClutchEnabled(block, enabled) {
	if (block?.typeId !== CLUTCH_BLOCK || typeof enabled !== "boolean")
		return false;
	const current = block.permutation.getAllStates()["createbedrock:enabled"];
	const worldChanged = (current !== 0 && current !== false) !== enabled;
	if (worldChanged)
		block.setPermutation(block.permutation.withState("createbedrock:enabled", enabled ? 1 : 0));
	const networkChanged = kineticWorld.setClutchEnabled(block.dimension.id, block.location, enabled);
	if (worldChanged || networkChanged)
		persist();
	return worldChanged || networkChanged;
}

export function persistKineticWorld() {
	persist();
}

export function setKineticClutchRedstonePowered(dimensionId, location, powered) {
	if (typeof dimensionId !== "string" || !location || typeof powered !== "boolean")
		throw new TypeError("Redstone clutch updates require a dimension, location, and power state");
	const block = world.getDimension(dimensionId).getBlock(location);
	return setClutchEnabled(block, !powered);
}

function restore() {
	try {
		const restored = shardedPersistence.read();
		if (restored) {
			restoreKineticRecords(restored.records);
			for (const warning of restored.warnings)
				console.warn(`[Create Bedrock] Ignored invalid kinetic shard ${warning.partition}: ${warning.error}`);
			console.warn("[Create Bedrock] Restored sharded kinetic world state");
			return;
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore sharded kinetic state: ${error}`);
	}

	const value = world.getDynamicProperty(LEGACY_PERSISTENCE_KEY);
	if (typeof value !== "string")
		return;

	try {
		kineticWorld.restore(deserializeVersionedState(value, {
			schemaVersion: PERSISTENCE_SCHEMA_VERSION,
			upgrades: {
				0: legacy => legacy
			}
		}));
		legacyStatePendingMigration = true;
		persist();
		console.warn("[Create Bedrock] Restored kinetic world state");
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid kinetic world state: ${error}`);
	}
}

function refreshWaterWheel(wheel) {
	const dimension = world.getDimension(wheel.dimensionId);
	let hasWater = false;
	for (const offset of [
		{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
		{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
		{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
	]) {
		if ((wheel.axis === "x" && offset.x !== 0) || (wheel.axis === "y" && offset.y !== 0) || (wheel.axis === "z" && offset.z !== 0))
			continue;
		const neighbor = dimension.getBlock({
			x: wheel.location.x + offset.x,
			y: wheel.location.y + offset.y,
			z: wheel.location.z + offset.z
		});
		if (neighbor?.typeId === "minecraft:water") {
			hasWater = true;
			break;
		}
	}
	if (kineticWorld.setGeneratedSpeed(wheel.dimensionId, wheel.location, hasWater ? 8 : 0))
		persist();
}

export function registerKinetics() {
	registerKernelTaskGroup("kinetics", KINETIC_DIMENSION_TASK_BUDGET);
	system.run(restore);

	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (kineticWorld.trackPlacedBlock(event.block))
			persist();
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (kineticWorld.trackBrokenBlock(event.dimension.id, event.block.location))
			persist();
	});

	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId === CLUTCH_BLOCK) {
		event.player.sendMessage("This clutch is controlled by redstone power.");
			return;
		}

		if (event.itemStack?.typeId === BELT_CONNECTOR) {
			const playerId = event.player.id;
			const pending = pendingBeltEndpoints.get(playerId);
			if (!pending) {
				if (kineticWorld.isBeltPulley(event.block.dimension.id, event.block.location)) {
					pendingBeltEndpoints.set(playerId, {
						dimensionId: event.block.dimension.id,
						location: { ...event.block.location }
					});
					console.warn("[Create Bedrock] Belt connector selected its first shaft");
				}
				return;
			}

			pendingBeltEndpoints.delete(playerId);
			const result = pending.dimensionId === event.block.dimension.id
				? kineticWorld.connectBelt(pending.dimensionId, pending.location, event.block.location)
				: { ok: false, reason: "different_dimension" };
			if (result.ok) {
				persist();
				console.warn("[Create Bedrock] Belt link created");
			} else {
				console.warn(`[Create Bedrock] Belt link rejected: ${result.reason}`);
			}
			return;
		}

		if (kineticWorld.activateHandCrank(event.block)) {
			persist();
			console.warn(`[Create Bedrock] Hand crank activated at ${event.block.location.x}, ${event.block.location.y}, ${event.block.location.z}`);
		}
	});

	registerTickHandler(() => {
		waterWheelTicks++;
		if (waterWheelTicks >= WATER_WHEEL_CHECK_INTERVAL) {
			waterWheelTicks = 0;
			for (const wheel of kineticWorld.getGeneratedSourceNodes(WATER_WHEEL_BLOCK)) {
				const key = `water-wheel:${wheel.dimensionId}:${wheel.location.x}:${wheel.location.y}:${wheel.location.z}`;
				enqueueUniqueKernelTask(key, () => refreshWaterWheel(wheel), "kinetics");
			}
		}
		for (const dimensionId of kineticWorld.advanceTick())
			enqueueUniqueKernelTask(`kinetics:${dimensionId}`, () => kineticWorld.resolveDirtyDimension(dimensionId), "kinetics");
		if (kineticWorld.consumePersistenceDirty())
			persist();
		persistence.tick();
		shardedPersistence.tick();
	});
}

export function getKineticWorldForTesting() {
	return kineticWorld;
}

export function getKineticSpeedAt(dimensionId, location) {
	return kineticWorld.speedAt(dimensionId, location);
}

export function getKineticDiagnostics() {
	return {
		...kineticWorld.diagnostics(),
		persistence: {
			deferred: persistence.diagnostics(),
			sharded: shardedPersistence.diagnostics()
		}
	};
}
