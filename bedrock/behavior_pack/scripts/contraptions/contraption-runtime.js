import { system, world } from "@minecraft/server";

import { collectConnectedBlocks } from "./assembly-collector.js";
import { ASSEMBLY_QUARTER_TURN, createAssemblyTransform, withAssemblyTransformDelta } from "./assembly-transform.js";
import { DynamicAssemblyController } from "./dynamic-assembly-controller.js";
import { createDynamicAssemblySnapshot, MAX_DYNAMIC_ASSEMBLY_BLOCKS } from "./dynamic-assembly-snapshot.js";
import { DynamicAssemblyWorldPort } from "./dynamic-assembly-world-port.js";
import { captureElevatorContactMovingData, detachElevatorContactMovingData, notifyElevatorContactReached, restoreElevatorContactMovingData } from "./elevator-contact-runtime.js";
import { normalizeContraptionSnapshot } from "./contraption-snapshot.js";
import { registerKineticMovingDataAdapters } from "./kinetic-moving-data-adapter.js";
import { MotionContactTracker, MOVING_CONTACT_BLOCK_TYPES } from "./motion-contact.js";
import { isMovableBlockType, STATELESS_MOVABLE_BLOCK_TYPES } from "./movable-blocks.js";
import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { deserializeVersionedState } from "../kernel/versioned-state.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { persistKineticWorld } from "../kinetics/kinetic-runtime.js";
import { registerMovingBlockDataContributor, registerStatelessMovingBlockDataAdapter } from "./moving-block-data.js";
import { REDSTONE_BLOCK_DEVICES } from "../redstone/redstone-device-catalog.js";
import { captureRedstoneDeviceMovingData, detachRedstoneDeviceMovingData, restoreRedstoneDeviceMovingData, setRedstoneContactFromAssembly } from "../redstone/redstone-device-runtime.js";
import { captureDepotMovingData, captureInternalPhysicalBeltRuns, capturePhysicalBeltMovingData, DEPOT_PORT_MOVEMENT_DEFINITIONS, detachDepotMovingData, detachInternalPhysicalBeltRuns, detachPhysicalBeltMovingData, PHYSICAL_BELT_BLOCK, restoreDepotMovingData, restoreInternalPhysicalBeltRuns, restorePhysicalBeltMovingData } from "../logistics/depot-runtime.js";

const MECHANICAL_BEARING_BLOCK = "createbedrock:mechanical_bearing";
const WINDMILL_BEARING_BLOCK = "createbedrock:windmill_bearing";
const CONTRAPTION_TASK_BUDGET = 4;
const LEGACY_PERSISTENCE_KEY = "createbedrock:contraptions_v1";
const BLOCKS_PER_SNAPSHOT_SHARD = 32;
const activeBearings = new Map();
const controllers = new Map();
const motionContacts = new Map();
let kineticWorld;
let legacyStatePendingMigration = false;

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function sectionKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

function hash(value) {
	let output = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		output ^= value.charCodeAt(index);
		output = Math.imul(output, 0x01000193);
	}
	return (output >>> 0).toString(16);
}

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const stateStore = new ShardedStateStore({
	keyPrefix: "createbedrock:dynamic_assemblies_v2",
	onCommit() {
		if (!legacyStatePendingMigration)
			return;
		world.setDynamicProperty(LEGACY_PERSISTENCE_KEY, undefined);
		legacyStatePendingMigration = false;
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist dynamic assembly state: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind === "assembly_root")
			return `assembly-root:${record.dimensionId}:${hash(record.id)}`;
		if (record?.kind === "assembly_block_shard")
			return `${record.section}:assembly:${hash(record.id)}:${record.shardIndex}`;
		throw new TypeError("Unknown dynamic assembly persistent record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});

const persistence = new DeferredPersistence({
	name: "dynamic assemblies",
	onError(error) {
		console.warn(`[Create Bedrock] Could not schedule dynamic assembly persistence: ${error}`);
	},
	write() {
		stateStore.request(persistentRecords());
	}
});

function controllerFor(dimensionId) {
	let controller = controllers.get(dimensionId);
	if (!controller) {
		controller = new DynamicAssemblyController(new DynamicAssemblyWorldPort(dimensionId, {
			capturePhysicalBeltRuns(locations, anchor) {
				return captureInternalPhysicalBeltRuns(dimensionId, locations, anchor);
			},
			detachPhysicalBeltRuns(records) {
				return detachInternalPhysicalBeltRuns(records);
			},
			kineticWorld,
			onKineticMutation: persistKineticWorld,
			restorePhysicalBeltRuns(records, origin) {
				return restoreInternalPhysicalBeltRuns(dimensionId, origin, records);
			}
		}));
		controllers.set(dimensionId, controller);
	}
	return controller;
}

function motionContactsFor(dimensionId) {
	let tracker = motionContacts.get(dimensionId);
	if (!tracker) {
		tracker = new MotionContactTracker();
		motionContacts.set(dimensionId, tracker);
	}
	return tracker;
}

function readWorldContact(dimensionId, location) {
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		if (!MOVING_CONTACT_BLOCK_TYPES.has(block?.typeId))
			return undefined;
		return { states: block.permutation.getAllStates(), typeId: block.typeId };
	} catch {
		return undefined;
	}
}

function applyMotionContactChanges(changes) {
	for (const change of changes) {
		const endpoint = change.endpoint;
		if (change.active && endpoint.kind === "world" && endpoint.typeId === "createbedrock:elevator_contact") {
			try {
				notifyElevatorContactReached(endpoint.dimensionId, endpoint.location);
			} catch (error) {
				console.warn(`[Create Bedrock] Could not report moving elevator contact: ${error}`);
			}
			continue;
		}
		if (endpoint.kind !== "world" || endpoint.typeId !== "createbedrock:redstone_contact")
			continue;
		try {
			setRedstoneContactFromAssembly(endpoint.dimensionId, endpoint.location, change.active);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not update moving Redstone Contact: ${error}`);
		}
	}
}

function sampleMotionContacts(dimensionId) {
	const assemblies = controllerFor(dimensionId).snapshot().map(record => ({ ...record, dimensionId }));
	applyMotionContactChanges(motionContactsFor(dimensionId).sample({ assemblies, readWorldContact }));
}

function releaseMotionContacts(dimensionId, id) {
	const tracker = motionContacts.get(dimensionId);
	if (tracker)
		applyMotionContactChanges(tracker.releaseAssembly(id));
}

function persistentRecords() {
	const records = [];
	for (const active of activeBearings.values()) {
		let assembly;
		try {
			assembly = controllerFor(active.dimensionId).getActive(active.id);
		} catch {
			continue;
		}
		const { snapshot } = assembly;
		records.push({
			bearingKey: active.bearingKey,
			bearingKind: active.kind,
			bearingLocation: { ...active.bearingLocation },
			blockCount: snapshot.blocks.length,
			dimensionId: active.dimensionId,
			epoch: assembly.epoch,
			...(assembly.frozenReason ? { frozenReason: assembly.frozenReason } : {}),
			id: active.id,
			kind: "assembly_root",
			...(assembly.owner === undefined ? {} : { owner: clone(assembly.owner) }),
			phase: assembly.phase,
			snapshot: {
				anchor: { ...snapshot.anchor },
				...(snapshot.attachments === undefined ? {} : { attachments: clone(snapshot.attachments) }),
				checksum: snapshot.checksum,
				schemaVersion: snapshot.schemaVersion
			},
			transform: clone(assembly.transform)
		});
		const bySection = new Map();
		for (const block of snapshot.blocks) {
			const location = {
				x: snapshot.anchor.x + block.relative.x,
				y: snapshot.anchor.y + block.relative.y,
				z: snapshot.anchor.z + block.relative.z
			};
			const section = sectionKey(active.dimensionId, location);
			const entries = bySection.get(section) ?? [];
			entries.push(clone(block));
			bySection.set(section, entries);
		}
		for (const [section, blocks] of [...bySection.entries()].sort(([left], [right]) => left.localeCompare(right)))
			for (let offset = 0, shardIndex = 0; offset < blocks.length; offset += BLOCKS_PER_SNAPSHOT_SHARD, shardIndex++)
				records.push({
					blocks: blocks.slice(offset, offset + BLOCKS_PER_SNAPSHOT_SHARD),
					dimensionId: active.dimensionId,
					id: active.id,
					kind: "assembly_block_shard",
					section,
					shardIndex
				});
	}
	return records;
}

function requestPersist() {
	persistence.request();
}

function restoreShardedState() {
	const restored = stateStore.read();
	if (!restored)
		return false;
	const roots = restored.records.filter(record => record?.kind === "assembly_root");
	const blocksByAssembly = new Map();
	for (const record of restored.records.filter(record => record?.kind === "assembly_block_shard")) {
		const blocks = blocksByAssembly.get(record.id) ?? [];
		blocks.push(...record.blocks);
		blocksByAssembly.set(record.id, blocks);
	}
	for (const root of roots) {
		try {
			const blocks = blocksByAssembly.get(root.id) ?? [];
			if (blocks.length !== root.blockCount)
				throw new Error(`expected ${root.blockCount} snapshot blocks, found ${blocks.length}`);
			const snapshot = { ...root.snapshot, blocks };
			controllerFor(root.dimensionId).restore([{
				epoch: root.epoch,
				frozenReason: root.frozenReason,
				id: root.id,
				owner: root.owner,
				phase: root.phase,
				snapshot,
				transform: root.transform
			}]);
			activeBearings.set(root.bearingKey, {
				bearingKey: root.bearingKey,
				bearingLocation: { ...root.bearingLocation },
				dimensionId: root.dimensionId,
				id: root.id,
				kind: root.bearingKind === "windmill" ? "windmill" : "mechanical"
			});
		} catch (error) {
			console.warn(`[Create Bedrock] Ignored invalid dynamic assembly ${root?.id ?? "unknown"}: ${error}`);
		}
	}
	for (const warning of restored.warnings)
		console.warn(`[Create Bedrock] Ignored corrupt dynamic assembly shard ${warning.partition}: ${warning.error}`);
	return true;
}

function upgradeLegacySnapshot(snapshot) {
	const normalized = normalizeContraptionSnapshot(snapshot);
	return createDynamicAssemblySnapshot({
		anchor: normalized.anchor,
		attachments: normalized.attachments,
		blocks: normalized.blocks.map(block => ({
			data: block.data,
			location: {
				x: normalized.anchor.x + block.relative.x,
				y: normalized.anchor.y + block.relative.y,
				z: normalized.anchor.z + block.relative.z
			},
			states: block.states,
			typeId: block.typeId
		}))
	});
}

function restoreLegacyState() {
	const serialized = world.getDynamicProperty(LEGACY_PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;
	try {
		for (const record of deserializeVersionedState(serialized, {
			schemaVersion: 1,
			upgrades: { 0: legacy => legacy }
		})) {
			if (!record?.bearingKey || !record.dimensionId || !record.id || !record.snapshot || !record.bearingLocation)
				throw new TypeError("legacy contraption record is incomplete");
			const snapshot = upgradeLegacySnapshot(record.snapshot);
			controllerFor(record.dimensionId).restore([{
				epoch: 1,
				id: record.id,
				owner: { bearingKey: record.bearingKey, kind: record.kind === "windmill" ? "windmill" : "mechanical" },
				phase: "active",
				snapshot,
				transform: createAssemblyTransform({ rotationMilliDegrees: Math.round((record.rotation ?? 0) * 1000) })
			}]);
			activeBearings.set(record.bearingKey, {
				bearingKey: record.bearingKey,
				bearingLocation: { ...record.bearingLocation },
				dimensionId: record.dimensionId,
				id: record.id,
				kind: record.kind === "windmill" ? "windmill" : "mechanical"
			});
		}
		legacyStatePendingMigration = true;
		requestPersist();
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored legacy contraption state: ${error}`);
	}
}

function restore() {
	try {
		if (restoreShardedState())
			return;
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore dynamic assembly state: ${error}`);
	}
	restoreLegacyState();
}

function collectAboveBearing(block) {
	const dimension = block.dimension;
	const facing = block.permutation?.getAllStates?.()["minecraft:facing_direction"];
	const direction = ({
		0: { x: 0, y: -1, z: 0 }, 1: { x: 0, y: 1, z: 0 }, 2: { x: 0, y: 0, z: -1 },
		3: { x: 0, y: 0, z: 1 }, 4: { x: -1, y: 0, z: 0 }, 5: { x: 1, y: 0, z: 0 },
		down: { x: 0, y: -1, z: 0 }, east: { x: 1, y: 0, z: 0 }, north: { x: 0, y: 0, z: -1 },
		south: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, west: { x: -1, y: 0, z: 0 }
	})[facing] ?? { x: 0, y: 1, z: 0 };
	return collectConnectedBlocks({
		canCollect: blockData => isMovableBlockType(blockData.typeId),
		maxBlocks: MAX_DYNAMIC_ASSEMBLY_BLOCKS,
		readBlock(location) {
			const source = dimension.getBlock(location);
			return !source || source.typeId === "minecraft:air"
				? undefined
				: { states: source.permutation.getAllStates(), typeId: source.typeId };
		},
		start: {
			x: block.location.x + direction.x,
			y: block.location.y + direction.y,
			z: block.location.z + direction.z
		}
	});
}

function bearingKind(block) {
	if (block?.typeId === MECHANICAL_BEARING_BLOCK)
		return "mechanical";
	if (block?.typeId === WINDMILL_BEARING_BLOCK)
		return "windmill";
	return undefined;
}

function windmillSpeed(sailCount) {
	return Math.min(16, Math.max(1, Math.ceil(sailCount / 8)));
}

function toggleBearing(block) {
	const kind = bearingKind(block);
	if (!kind)
		return;
	const bearingKey = keyFor(block.dimension.id, block.location);
	const active = activeBearings.get(bearingKey);
	const controller = controllerFor(block.dimension.id);
	if (active) {
		const state = controller.getActive(active.id);
		const snappedTransform = createAssemblyTransform({
			rotationMilliDegrees: Math.round(state.transform.rotationMilliDegrees / ASSEMBLY_QUARTER_TURN) * ASSEMBLY_QUARTER_TURN,
			translation: state.transform.translation
		});
		if (!controller.setTransform(active.id, snappedTransform))
			return;
		releaseMotionContacts(active.dimensionId, active.id);
		if (!controller.disassemble(active.id)) {
			sampleMotionContacts(active.dimensionId);
			return;
		}
		activeBearings.delete(bearingKey);
		if (active.kind === "windmill")
			kineticWorld.setGeneratedSpeed(active.dimensionId, active.bearingLocation, 0);
		requestPersist();
		return;
	}

	const blocks = collectAboveBearing(block);
	if (blocks.length === 0)
		return;
	const origin = blocks[0].location;
	const id = `bearing:${bearingKey}`;
	controller.assemble({
		anchor: origin,
		id,
		locations: blocks.map(entry => entry.location),
		owner: { bearingKey, kind }
	});
	activeBearings.set(bearingKey, {
		bearingKey,
		bearingLocation: { ...block.location },
		dimensionId: block.dimension.id,
		id,
		kind
	});
	if (kind === "windmill")
		kineticWorld.setGeneratedSpeed(block.dimension.id, block.location, windmillSpeed(blocks.length));
	requestPersist();
}

function processBearing(bearingKey) {
	const active = activeBearings.get(bearingKey);
	if (!active)
		return;
	const controller = controllerFor(active.dimensionId);
	if (!controller.ensureProjection(active.id)) {
		requestPersist();
		return;
	}
	const state = controller.getActive(active.id);
	if (active.kind === "windmill")
		kineticWorld.setGeneratedSpeed(active.dimensionId, active.bearingLocation, windmillSpeed(state.snapshot.blocks.length));
	const speed = kineticWorld.speedAt(active.dimensionId, active.bearingLocation);
	if (speed === 0)
		return;
	const next = withAssemblyTransformDelta(state.transform, { rotationMilliDegrees: Math.round(speed * 1000) });
	if (controller.setTransform(active.id, next))
		sampleMotionContacts(active.dimensionId);
	requestPersist();
}

function registerRedstoneMovingDataAdapters() {
	for (const device of REDSTONE_BLOCK_DEVICES) {
		registerMovingBlockDataContributor(device.blockId, "redstone", {
			capture: captureRedstoneDeviceMovingData,
			detach: detachRedstoneDeviceMovingData,
			restore: restoreRedstoneDeviceMovingData,
			schemaVersion: 1,
			validate(state) {
				if (!state || typeof state !== "object" || !state.state)
					throw new TypeError("Redstone moving data must contain durable device state");
			}
		});
	}
}

function registerDepotMovingDataAdapters() {
	for (const definition of DEPOT_PORT_MOVEMENT_DEFINITIONS) {
		registerMovingBlockDataContributor(definition.typeId, "logistics", {
			capture(dimensionId, location) {
				return captureDepotMovingData(dimensionId, location, definition);
			},
			detach: detachDepotMovingData,
			restore: restoreDepotMovingData,
			schemaVersion: 1,
			validate(state) {
				if (!state || state.schemaVersion !== 1 || !state.port)
					throw new TypeError("Moving logistics data must contain a versioned depot snapshot");
			}
		});
	}
}

function registerElevatorMovingDataAdapter() {
	registerMovingBlockDataContributor("createbedrock:elevator_contact", "elevator", {
		capture: captureElevatorContactMovingData,
		detach: detachElevatorContactMovingData,
		restore: restoreElevatorContactMovingData,
		schemaVersion: 1,
		validate(state) {
			if (!state || state.schemaVersion !== 1 || typeof state.floorId !== "string" || typeof state.floorName !== "string")
				throw new TypeError("Moving elevator contacts require floor identity and display state");
		}
	});
}

function registerPhysicalBeltMovingDataAdapter() {
	registerMovingBlockDataContributor(PHYSICAL_BELT_BLOCK, "logistics", {
		capture: capturePhysicalBeltMovingData,
		detach: detachPhysicalBeltMovingData,
		restore: restorePhysicalBeltMovingData,
		schemaVersion: 1,
		validate(state) {
			if (!state || state.schemaVersion !== 1)
				throw new TypeError("Moving physical belts require schema version 1");
		}
	});
}

export function registerContraptions(getKineticWorld) {
	kineticWorld = getKineticWorld();
	for (const typeId of STATELESS_MOVABLE_BLOCK_TYPES)
		registerStatelessMovingBlockDataAdapter(typeId);
	registerKineticMovingDataAdapters(kineticWorld);
	registerRedstoneMovingDataAdapters();
	registerDepotMovingDataAdapters();
	registerElevatorMovingDataAdapter();
	registerPhysicalBeltMovingDataAdapter();
	registerKernelTaskGroup("contraptions", CONTRAPTION_TASK_BUDGET);
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (!bearingKind(event.block))
			return;
		try {
			toggleBearing(event.block);
		} catch (error) {
			console.warn(`[Create Bedrock] Dynamic bearing interaction failed: ${error}`);
		}
	});
	registerTickHandler(() => {
		for (const bearingKey of activeBearings.keys())
			enqueueUniqueKernelTask(`contraption:${bearingKey}`, () => processBearing(bearingKey), "contraptions");
		persistence.tick();
		stateStore.tick();
	});
	system.run(restore);
}

export function getContraptionDiagnostics() {
	const frozenReasons = {};
	for (const active of activeBearings.values()) {
		try {
			const state = controllerFor(active.dimensionId).getActive(active.id);
			if (state.frozenReason)
				frozenReasons[active.id] = state.frozenReason;
		} catch {
			frozenReasons[active.id] = "authority_missing";
		}
	}
	return {
		active: activeBearings.size,
		motionContacts: Object.fromEntries([...motionContacts.entries()].map(([dimensionId, tracker]) => [dimensionId, tracker.diagnostics()])),
		frozen: Object.keys(frozenReasons).length,
		frozenReasons,
		persistence: {
			deferred: persistence.diagnostics(),
			sharded: stateStore.diagnostics()
		}
	};
}
