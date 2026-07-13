import { system, world } from "@minecraft/server";

import { collectConnectedBlocks } from "./assembly-collector.js";
import { BedrockContraptionWorldPort } from "./bedrock-world-port.js";
import { ContraptionController } from "./contraption-controller.js";
import { isMovableBlockType, MAX_CONTRAPTION_BLOCKS, STATELESS_MOVABLE_BLOCK_TYPES } from "./movable-blocks.js";
import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { deserializeVersionedState, serializeVersionedState } from "../kernel/versioned-state.js";
import { persistKineticWorld } from "../kinetics/kinetic-runtime.js";
import { registerStatelessMovingBlockDataAdapter } from "./moving-block-data.js";

const BEARING_BLOCK = "createbedrock:mechanical_bearing";
const CONTRAPTION_TASK_BUDGET = 4;
const PERSISTENCE_KEY = "createbedrock:contraptions_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const activeBearings = new Map();
const controllers = new Map();
let kineticWorld;
let ticksSincePersist = 0;
let rotationDirty = false;

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
	const records = [];
	for (const [bearingKey, active] of activeBearings) {
		records.push({
			bearingKey,
			bearingLocation: active.bearingLocation,
			dimensionId: active.dimensionId,
			id: active.id,
			origin: active.origin,
			rotation: active.rotation,
			snapshot: active.snapshot
		});
	}
	world.setDynamicProperty(PERSISTENCE_KEY, serializeVersionedState(PERSISTENCE_SCHEMA_VERSION, records));
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
				activeBearings.set(record.bearingKey, { ...record, rotation: record.rotation ?? 0 });
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
	const start = { x: block.location.x, y: block.location.y + 1, z: block.location.z };
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

function toggleBearing(block) {
	const bearingKey = keyFor(block.dimension.id, block.location);
	const active = activeBearings.get(bearingKey);
	const controller = controllerFor(block.dimension.id);
	if (active) {
		const quarterTurns = Math.round(active.rotation / 90);
		controller.setRotation(active.id, quarterTurns * 90);
		if (controller.disassemble(active.id, active.origin, quarterTurns)) {
			activeBearings.delete(bearingKey);
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
		origin,
		rotation: 0,
		snapshot: assembled.snapshot
	});
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
	rotationDirty = true;
}

export function registerContraptions(getKineticWorld) {
	kineticWorld = getKineticWorld();
	for (const typeId of STATELESS_MOVABLE_BLOCK_TYPES)
		registerStatelessMovingBlockDataAdapter(typeId);
	registerKernelTaskGroup("contraptions", CONTRAPTION_TASK_BUDGET);
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId !== BEARING_BLOCK)
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

		ticksSincePersist++;
		if (rotationDirty && ticksSincePersist >= 20) {
			ticksSincePersist = 0;
			rotationDirty = false;
			persist();
		}
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
		frozenReasons
	};
}
