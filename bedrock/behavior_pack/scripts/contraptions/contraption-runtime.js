import { system, world } from "@minecraft/server";

import { collectConnectedBlocks } from "./assembly-collector.js";
import { BedrockContraptionWorldPort } from "./bedrock-world-port.js";
import { ContraptionController } from "./contraption-controller.js";
import { isMovableBlockType } from "./movable-blocks.js";
import { registerTickHandler } from "../kernel/index.js";
import { persistKineticWorld } from "../kinetics/kinetic-runtime.js";

const BEARING_BLOCK = "createbedrock:mechanical_bearing";
const PERSISTENCE_KEY = "createbedrock:contraptions_v1";
const MAX_PROTOTYPE_BLOCKS = 64;
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
	world.setDynamicProperty(PERSISTENCE_KEY, JSON.stringify(records));
}

function restore() {
	const serialized = world.getDynamicProperty(PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;

	try {
		for (const record of JSON.parse(serialized)) {
			if (!record?.bearingKey || !record?.dimensionId || !record?.id || !record?.origin || !record?.snapshot)
				continue;
			if (!record.bearingLocation)
				continue;
			controllerFor(record.dimensionId).restore([{
				id: record.id,
				origin: record.origin,
				rotation: record.rotation ?? 0,
				snapshot: record.snapshot
			}]);
			activeBearings.set(record.bearingKey, { ...record, rotation: record.rotation ?? 0 });
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
		maxBlocks: MAX_PROTOTYPE_BLOCKS,
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
		maxBlocks: MAX_PROTOTYPE_BLOCKS
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

export function registerContraptions(getKineticWorld) {
	kineticWorld = getKineticWorld();
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
		for (const active of activeBearings.values()) {
			const speed = getKineticWorld().speedAt(active.dimensionId, active.bearingLocation);
			if (speed === 0)
				continue;

			active.rotation = (active.rotation + speed) % 360;
			controllerFor(active.dimensionId).setRotation(active.id, active.rotation);
			rotationDirty = true;
		}

		ticksSincePersist++;
		if (rotationDirty && ticksSincePersist >= 20) {
			ticksSincePersist = 0;
			rotationDirty = false;
			persist();
		}
	});

	system.run(restore);
}
