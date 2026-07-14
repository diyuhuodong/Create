import { system, world } from "@minecraft/server";

import { collectConnectedBlocks } from "./assembly-collector.js";
import { BedrockContraptionWorldPort } from "./bedrock-world-port.js";
import { ContraptionController } from "./contraption-controller.js";
import { isMovableBlockType, MAX_CONTRAPTION_BLOCKS, STATELESS_MOVABLE_BLOCK_TYPES } from "./movable-blocks.js";
import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { deserializeVersionedState, serializeVersionedState } from "../kernel/versioned-state.js";
import { persistKineticWorld } from "../kinetics/kinetic-runtime.js";
import { registerStatelessMovingBlockDataAdapter } from "./moving-block-data.js";

const MECHANICAL_BEARING_BLOCK = "createbedrock:mechanical_bearing";
const WINDMILL_BEARING_BLOCK = "createbedrock:windmill_bearing";
const CONTRAPTION_TASK_BUDGET = 4;
const PERSISTENCE_KEY = "createbedrock:contraptions_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const activeBearings = new Map();
const controllers = new Map();
let kineticWorld;
const persistence = new DeferredPersistence({
	name: "contraptions",
	write() {
		const records = [];
		for (const [bearingKey, active] of activeBearings) {
			records.push({
				bearingKey,
				bearingLocation: active.bearingLocation,
				dimensionId: active.dimensionId,
				id: active.id,
				kind: active.kind,
				origin: active.origin,
				rotation: active.rotation,
				snapshot: active.snapshot
			});
		}
		world.setDynamicProperty(PERSISTENCE_KEY, serializeVersionedState(PERSISTENCE_SCHEMA_VERSION, records));
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist contraption state: ${error}`);
	}
});

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function controllerFor(dimensionId) {
	let controller = controllers.get(dimensionId);
	if (!controller) {
		controller = new ContraptionController(new BedrockContraptionWorldPort(dimensionId, {
			kineticWorld,
			onKineticMutation: persistKineticWorld
		}));
		controllers.set(dimensionId, controller);
	}
	return controller;
}

function persist() {
	persistence.request();
}

function restore() {
	const serialized = world.getDynamicProperty(PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;

	try {
		for (const record of deserializeVersionedState(serialized, {
			schemaVersion: PERSISTENCE_SCHEMA_VERSION,
			upgrades: {
				0: legacy => legacy
			}
		})) {
			try {
				if (!record?.bearingKey || !record?.dimensionId || !record?.id || !record?.origin || !record?.snapshot)
					throw new TypeError("missing required record fields");
				if (!record.bearingLocation)
					throw new TypeError("missing bearing location");
				controllerFor(record.dimensionId).restore([{
					id: record.id,
					origin: record.origin,
					rotation: record.rotation ?? 0,
					snapshot: record.snapshot
				}]);
				activeBearings.set(record.bearingKey, {
					...record,
					kind: record.kind === "windmill" ? "windmill" : "mechanical",
					rotation: record.rotation ?? 0
				});
			} catch (error) {
				console.warn(`[Create Bedrock] Ignored invalid contraption ${record?.id ?? "unknown"}: ${error}`);
			}
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid contraption state: ${error}`);
	}
}

function collectAboveBearing(block) {
	const dimension = block.dimension;
	const facing = block.permutation?.getAllStates?.()["minecraft:facing_direction"];
	const direction = ({
		0: { x: 0, y: -1, z: 0 },
		1: { x: 0, y: 1, z: 0 },
		2: { x: 0, y: 0, z: -1 },
		3: { x: 0, y: 0, z: 1 },
		4: { x: -1, y: 0, z: 0 },
		5: { x: 1, y: 0, z: 0 },
		down: { x: 0, y: -1, z: 0 },
		east: { x: 1, y: 0, z: 0 },
		north: { x: 0, y: 0, z: -1 },
		south: { x: 0, y: 0, z: 1 },
		up: { x: 0, y: 1, z: 0 },
		west: { x: -1, y: 0, z: 0 }
	})[facing] ?? { x: 0, y: 1, z: 0 };
	const start = {
		x: block.location.x + direction.x,
		y: block.location.y + direction.y,
		z: block.location.z + direction.z
	};
	return collectConnectedBlocks({
		start,
		maxBlocks: MAX_CONTRAPTION_BLOCKS,
		readBlock(location) {
			const source = dimension.getBlock(location);
			if (!source || source.typeId === "minecraft:air")
				return undefined;
			return { typeId: source.typeId, states: source.permutation.getAllStates() };
		},
		canCollect: blockData => isMovableBlockType(blockData.typeId)
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
		const quarterTurns = Math.round(active.rotation / 90);
		controller.setRotation(active.id, quarterTurns * 90);
		if (controller.disassemble(active.id, active.origin, quarterTurns)) {
			activeBearings.delete(bearingKey);
			if (active.kind === "windmill")
				kineticWorld.setGeneratedSpeed(active.dimensionId, active.bearingLocation, 0);
			persist();
		}
		return;
	}

	const blocks = collectAboveBearing(block);
	if (blocks.length === 0)
		return;
	const origin = blocks[0].location;
	const id = `bearing:${bearingKey}`;
	const assembled = controller.assemble({
		id,
		anchor: origin,
		locations: blocks.map(entry => entry.location),
		maxBlocks: MAX_CONTRAPTION_BLOCKS
	});
	activeBearings.set(bearingKey, {
		bearingKey,
		bearingLocation: { ...block.location },
		dimensionId: block.dimension.id,
		id,
		kind,
		origin,
		rotation: 0,
		snapshot: assembled.snapshot
	});
	if (kind === "windmill")
		kineticWorld.setGeneratedSpeed(block.dimension.id, block.location, windmillSpeed(blocks.length));
	persist();
}

function processBearing(bearingKey) {
	const active = activeBearings.get(bearingKey);
	if (!active)
		return;
	const controller = controllerFor(active.dimensionId);
	if (!controller.ensureEntity(active.id)) {
		const reason = controller.getActive(active.id).recoveryError ?? "entity_recovery_failed";
		if (active.frozenReason !== reason)
			console.warn(`[Create Bedrock] Contraption ${active.id} is frozen: ${reason}`);
		active.recoveryFailed = true;
		active.frozenReason = reason;
		return;
	}
	active.recoveryFailed = false;
	if (active.kind === "windmill") {
		const sails = active.snapshot.blocks?.length ?? 0;
		kineticWorld.setGeneratedSpeed(active.dimensionId, active.bearingLocation, windmillSpeed(sails));
	}
	const speed = kineticWorld.speedAt(active.dimensionId, active.bearingLocation);
	if (speed === 0)
		return;

	const rotation = (active.rotation + speed) % 360;
	if (!controller.setRotation(active.id, rotation)) {
		const reason = controller.getActive(active.id).blockedReason ?? "world_blocked";
		if (active.frozenReason !== reason)
			console.warn(`[Create Bedrock] Contraption ${active.id} is frozen: ${reason}`);
		active.frozenReason = reason;
		return;
	}
	active.frozenReason = undefined;
	active.rotation = rotation;
	persist();
}

export function registerContraptions(getKineticWorld) {
	kineticWorld = getKineticWorld();
	for (const typeId of STATELESS_MOVABLE_BLOCK_TYPES)
		registerStatelessMovingBlockDataAdapter(typeId);
	registerKernelTaskGroup("contraptions", CONTRAPTION_TASK_BUDGET);
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (!bearingKind(event.block))
			return;

		try {
			toggleBearing(event.block);
		} catch (error) {
			console.warn(`[Create Bedrock] Bearing interaction failed: ${error}`);
		}
	});

	registerTickHandler(() => {
		for (const bearingKey of activeBearings.keys())
			enqueueUniqueKernelTask(`contraption:${bearingKey}`, () => processBearing(bearingKey), "contraptions");

		persistence.tick();
	});

	system.run(restore);
}

export function getContraptionDiagnostics() {
	const frozenReasons = Object.fromEntries([...activeBearings.values()]
		.filter(active => active.frozenReason)
		.map(active => [active.id, active.frozenReason]));
	return {
		active: activeBearings.size,
		frozen: Object.keys(frozenReasons).length,
		frozenReasons,
		persistence: persistence.diagnostics()
	};
}
