import { system, world } from "@minecraft/server";

import { collectConnectedBlocks } from "./assembly-collector.js";
import { BedrockContraptionWorldPort } from "./bedrock-world-port.js";
import { ContraptionController } from "./contraption-controller.js";

const BEARING_BLOCK = "createbedrock:mechanical_bearing";
const PERSISTENCE_KEY = "createbedrock:contraptions_v1";
const MAX_PROTOTYPE_BLOCKS = 16;
const activeBearings = new Map();
const controllers = new Map();

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function controllerFor(dimensionId) {
	let controller = controllers.get(dimensionId);
	if (!controller) {
		controller = new ContraptionController(new BedrockContraptionWorldPort(dimensionId));
		controllers.set(dimensionId, controller);
	}
	return controller;
}

function persist() {
	const records = [];
	for (const [bearingKey, active] of activeBearings) {
		records.push({ bearingKey, dimensionId: active.dimensionId, id: active.id, origin: active.origin, snapshot: active.snapshot });
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
			controllerFor(record.dimensionId).restore([{ id: record.id, origin: record.origin, snapshot: record.snapshot }]);
			activeBearings.set(record.bearingKey, record);
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
		canCollect(blockData) {
			return blockData.typeId !== BEARING_BLOCK;
		}
	});
}

function toggleBearing(block) {
	const bearingKey = keyFor(block.dimension.id, block.location);
	const active = activeBearings.get(bearingKey);
	const controller = controllerFor(block.dimension.id);
	if (active) {
		if (controller.disassemble(active.id, active.origin)) {
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
		dimensionId: block.dimension.id,
		id,
		origin,
		snapshot: assembled.snapshot
	});
	persist();
}

export function registerContraptions() {
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId !== BEARING_BLOCK)
			return;

		try {
			toggleBearing(event.block);
		} catch (error) {
			console.warn(`[Create Bedrock] Bearing interaction failed: ${error}`);
		}
	});

	system.run(restore);
}
