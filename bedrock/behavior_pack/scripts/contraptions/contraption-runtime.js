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
import { windmillSailCount, windmillSpeedForSailCount } from "./windmill-sails.js";
import { captureSuperGlueAssemblyAttachments, detachSuperGlueAssemblyAttachments, gluedLocationsForAssembly, restoreSuperGlueAssemblyAttachments } from "./super-glue-runtime.js";
import { linkedLocationsForAssembly } from "./assembly-attachments.js";
import { clockworkTargetAngle, CLOCKWORK_BEARING_BLOCK, nextClockworkAngle } from "./clockwork-bearing.js";

const MECHANICAL_BEARING_BLOCK = "createbedrock:mechanical_bearing";
const WINDMILL_BEARING_BLOCK = "createbedrock:windmill_bearing";
const CLOCKWORK_MODE_STATE = "createbedrock:clock_mode";
const CONTRAPTION_TASK_BUDGET = 4;
const LEGACY_PERSISTENCE_KEY = "createbedrock:contraptions_v1";
const BLOCKS_PER_SNAPSHOT_SHARD = 32;
const activeBearings = new Map();
// Bearings predate the Stage-4 dynamic-assembly root format.  Other moving
// machines register a small owner record here while sharing the same
// controller, snapshot shards, collision rules, and projection recovery.
const activeExternalAssemblies = new Map();
const assemblyOwnerRestorers = new Map();
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

function normalizeOwnerKind(value) {
	if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(value))
		throw new TypeError("Dynamic assembly owner kinds must be short identifiers");
	return value;
}

function normalizeExternalHost(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("External dynamic assemblies require an owner host record");
	const kind = normalizeOwnerKind(value.kind);
	if (typeof value.key !== "string" || value.key.length === 0 || value.key.length > 256)
		throw new TypeError("Dynamic assembly owner keys must be short non-empty strings");
	return { ...clone(value), kind, key: value.key };
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
		captureSuperGlueVolumes(locations, anchor) {
			return captureSuperGlueAssemblyAttachments(dimensionId, locations, anchor);
		},
		detachPhysicalBeltRuns(records) {
			return detachInternalPhysicalBeltRuns(records);
		},
		detachSuperGlueVolumes(attachments) {
			return detachSuperGlueAssemblyAttachments(attachments);
		},
			kineticWorld,
			onKineticMutation: persistKineticWorld,
		restorePhysicalBeltRuns(records, origin) {
			return restoreInternalPhysicalBeltRuns(dimensionId, origin, records);
		},
		restoreSuperGlueVolumes(attachments, origin, transform) {
			return restoreSuperGlueAssemblyAttachments(dimensionId, origin, attachments, transform);
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
	const activeAssemblies = [
		...activeBearings.values(),
		...activeExternalAssemblies.values()
	];
	for (const active of activeAssemblies) {
		let assembly;
		try {
			assembly = controllerFor(active.dimensionId).getActive(active.id);
		} catch {
			continue;
		}
		const { snapshot } = assembly;
		records.push({
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
			transform: clone(assembly.transform),
			...(active.bearingKey === undefined
				? { host: clone(active.host) }
				: {
					bearingKey: active.bearingKey,
					bearingKind: active.kind,
					bearingLocation: { ...active.bearingLocation }
				})
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
			if (root.host) {
				const host = normalizeExternalHost(root.host);
				const external = { dimensionId: root.dimensionId, host, id: root.id };
				activeExternalAssemblies.set(root.id, external);
				assemblyOwnerRestorers.get(host.kind)?.({
					assembly: controllerFor(root.dimensionId).getActive(root.id),
					dimensionId: root.dimensionId,
					host: clone(host),
					id: root.id
				});
			} else {
				if (!root.bearingKey || !root.bearingLocation)
					throw new TypeError("legacy bearing dynamic assembly root is incomplete");
				activeBearings.set(root.bearingKey, {
					bearingKey: root.bearingKey,
					bearingLocation: { ...root.bearingLocation },
					dimensionId: root.dimensionId,
					id: root.id,
					kind: ["windmill", "clockwork"].includes(root.bearingKind) ? root.bearingKind : "mechanical"
				});
			}
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
				owner: { bearingKey: record.bearingKey, kind: ["windmill", "clockwork"].includes(record.kind) ? record.kind : "mechanical" },
				phase: "active",
				snapshot,
				transform: createAssemblyTransform({ rotationMilliDegrees: Math.round((record.rotation ?? 0) * 1000) })
			}]);
			activeBearings.set(record.bearingKey, {
				bearingKey: record.bearingKey,
				bearingLocation: { ...record.bearingLocation },
				dimensionId: record.dimensionId,
				id: record.id,
				kind: ["windmill", "clockwork"].includes(record.kind) ? record.kind : "mechanical"
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
		linkedLocations(location) {
			return linkedLocationsForAssembly(block.dimension.id, location);
		},
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
	if (block?.typeId === CLOCKWORK_BEARING_BLOCK)
		return "clockwork";
	return undefined;
}

function clockMode(block) {
	const mode = block?.permutation?.getAllStates?.()[CLOCKWORK_MODE_STATE];
	return Number.isInteger(mode) && mode >= 0 && mode <= 2 ? mode : 0;
}

function clockFacingSign(block) {
	const facing = block?.permutation?.getAllStates?.()["minecraft:facing_direction"];
	return [0, 2, 4, "down", "north", "west"].includes(facing) ? -1 : 1;
}

function clockDayTime() {
	try {
		const dayTime = world.getTimeOfDay?.();
		if (Number.isFinite(dayTime))
			return dayTime;
	} catch {}
	return system.currentTick % 24000;
}

function cycleClockMode(block, player) {
	if (block?.typeId !== CLOCKWORK_BEARING_BLOCK || typeof block.setPermutation !== "function")
		return false;
	try {
		const mode = (clockMode(block) + 1) % 3;
		block.setPermutation(block.permutation.withState(CLOCKWORK_MODE_STATE, mode));
		player?.sendMessage?.(`Clockwork Bearing mode: ${["hour first", "minute first", "24-hour first"][mode]}.`);
		return true;
	} catch (error) {
		console.warn(`[Create Bedrock] Could not set Clockwork Bearing mode: ${error}`);
		return false;
	}
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
		kineticWorld.setGeneratedSpeed(block.dimension.id, block.location, windmillSpeedForSailCount(windmillSailCount(blocks)));
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
		kineticWorld.setGeneratedSpeed(active.dimensionId, active.bearingLocation, windmillSpeedForSailCount(windmillSailCount(state.snapshot.blocks)));
	const speed = kineticWorld.speedAt(active.dimensionId, active.bearingLocation);
	if (speed === 0)
		return;
	let next;
	if (active.kind === "clockwork") {
		let block;
		try { block = world.getDimension(active.dimensionId).getBlock(active.bearingLocation); } catch { return; }
		if (block?.typeId !== CLOCKWORK_BEARING_BLOCK)
			return;
		const target = clockworkTargetAngle(clockDayTime(), clockMode(block), clockFacingSign(block));
		const current = state.transform.rotationMilliDegrees / 1000;
		next = createAssemblyTransform({
			rotationMilliDegrees: Math.round(nextClockworkAngle(current, target, speed) * 1000),
			translation: state.transform.translation
		});
	} else
		next = withAssemblyTransformDelta(state.transform, { rotationMilliDegrees: Math.round(speed * 1000) });
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
			if (event.block.typeId === CLOCKWORK_BEARING_BLOCK && event.player?.isSneaking) {
				cycleClockMode(event.block, event.player);
				return;
			}
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
	for (const active of [...activeBearings.values(), ...activeExternalAssemblies.values()]) {
		try {
			const state = controllerFor(active.dimensionId).getActive(active.id);
			if (state.frozenReason)
				frozenReasons[active.id] = state.frozenReason;
		} catch {
			frozenReasons[active.id] = "authority_missing";
		}
	}
	return {
		active: activeBearings.size + activeExternalAssemblies.size,
		external: activeExternalAssemblies.size,
		motionContacts: Object.fromEntries([...motionContacts.entries()].map(([dimensionId, tracker]) => [dimensionId, tracker.diagnostics()])),
		frozen: Object.keys(frozenReasons).length,
		frozenReasons,
		persistence: {
			deferred: persistence.diagnostics(),
			sharded: stateStore.diagnostics()
		}
	};
}

/** Snapshot-only actor view. Callers must use the dedicated update helper for mutations. */
export function getActiveDynamicAssemblies(dimensionId) {
	if (dimensionId !== undefined && (typeof dimensionId !== "string" || dimensionId.length === 0))
		throw new TypeError("Dynamic assembly lookups require a dimension id when provided");
	const result = [];
	for (const active of [...activeBearings.values(), ...activeExternalAssemblies.values()]) {
		if (dimensionId !== undefined && active.dimensionId !== dimensionId)
			continue;
		try { result.push({ ...controllerFor(active.dimensionId).getActive(active.id), dimensionId: active.dimensionId }); } catch {}
	}
	return result.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Register a restore bridge before the dynamic-assembly store is read.  The
 * host remains metadata only: snapshots and transforms stay in the shared
 * controller so a moving machine cannot maintain a competing source of truth.
 */
export function registerDynamicAssemblyOwnerRestorer(kind, restorer) {
	kind = normalizeOwnerKind(kind);
	if (typeof restorer !== "function")
		throw new TypeError("Dynamic assembly owner restorers must be functions");
	if (assemblyOwnerRestorers.has(kind))
		throw new Error(`Dynamic assembly owner restorer already registered: ${kind}`);
	assemblyOwnerRestorers.set(kind, restorer);
}

export function assembleExternalDynamicAssembly({ anchor, dimensionId, host, id, locations, owner } = {}) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("External dynamic assemblies require a dimension id");
	if (activeExternalAssemblies.has(id))
		throw new Error(`External dynamic assembly ${id} already exists`);
	const normalizedHost = normalizeExternalHost(host);
	const assembly = controllerFor(dimensionId).assemble({ anchor, id, locations, owner });
	activeExternalAssemblies.set(id, { dimensionId, host: normalizedHost, id });
	requestPersist();
	return assembly;
}

export function getExternalDynamicAssembly(dimensionId, id) {
	const active = activeExternalAssemblies.get(id);
	if (!active || active.dimensionId !== dimensionId)
		return undefined;
	return {
		assembly: controllerFor(dimensionId).getActive(id),
		host: clone(active.host)
	};
}

export function setExternalDynamicAssemblyTransform(dimensionId, id, transform) {
	const active = activeExternalAssemblies.get(id);
	if (!active || active.dimensionId !== dimensionId)
		throw new Error(`Unknown external dynamic assembly ${id}`);
	const changed = controllerFor(dimensionId).setTransform(id, transform);
	requestPersist();
	return changed;
}

export function ensureExternalDynamicAssemblyProjection(dimensionId, id) {
	const active = activeExternalAssemblies.get(id);
	if (!active || active.dimensionId !== dimensionId)
		throw new Error(`Unknown external dynamic assembly ${id}`);
	const valid = controllerFor(dimensionId).ensureProjection(id);
	requestPersist();
	return valid;
}

/** Apply moving contact edges after a non-bearing assembly transform. */
export function sampleDynamicAssemblyMotionContacts(dimensionId) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Dynamic motion contact samples require a dimension id");
	sampleMotionContacts(dimensionId);
}

export function updateExternalDynamicAssemblyHost(dimensionId, id, updater) {
	const active = activeExternalAssemblies.get(id);
	if (!active || active.dimensionId !== dimensionId)
		throw new Error(`Unknown external dynamic assembly ${id}`);
	if (typeof updater !== "function")
		throw new TypeError("External dynamic assembly host updates require an updater");
	active.host = normalizeExternalHost(updater(clone(active.host)));
	requestPersist();
	return clone(active.host);
}

export function disassembleExternalDynamicAssembly(dimensionId, id) {
	const active = activeExternalAssemblies.get(id);
	if (!active || active.dimensionId !== dimensionId)
		return false;
	const controller = controllerFor(dimensionId);
	if (!controller.disassemble(id))
		return false;
	releaseMotionContacts(dimensionId, id);
	activeExternalAssemblies.delete(id);
	requestPersist();
	return true;
}

export function updateDynamicAssemblyBlockData(dimensionId, assemblyId, relative, updater) {
	if (typeof dimensionId !== "string" || typeof assemblyId !== "string")
		throw new TypeError("Dynamic assembly data updates require dimension and assembly identities");
	const result = controllerFor(dimensionId).updateBlockData(assemblyId, relative, updater);
	requestPersist();
	return result;
}
