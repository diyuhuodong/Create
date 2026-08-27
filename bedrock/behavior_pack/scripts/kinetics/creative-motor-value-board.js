import { world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { creativeMotorFaceIndex, isCreativeMotorValueBox } from "./creative-motor-configuration.js";

const CREATIVE_MOTOR_BLOCK = "createbedrock:creative_motor";
const VALUE_BOARD_ENTITY = "createbedrock:creative_motor_value_board";
const WRENCH = "createbedrock:wrench";
const VALUE_BOARD_ID = "createbedrock:creative_motor_value_board_id";

const valueBoards = new Map();

function boardId(block) {
	const { x, y, z } = block.location;
	return `${block.dimension.id}:${x}:${y}:${z}`;
}

function valueBoxCoordinate(value) {
	// Keep the graphic inside Java's 8x8-pixel value-box footprint while using
	// the current ray hit as its anchor. That makes the compact in-world board
	// sit under the Bedrock crosshair instead of being fixed at the block centre.
	return Number.isFinite(value) ? Math.max(0.25, Math.min(0.75, value)) : 0.5;
}

function boardLocation(block, face, faceLocation) {
	const { x, y, z } = block.location;
	const hit = {
		x: valueBoxCoordinate(faceLocation?.x),
		y: valueBoxCoordinate(faceLocation?.y),
		z: valueBoxCoordinate(faceLocation?.z)
	};
	if (face === 0) return { x: x + hit.x, y: y - 0.02, z: z + hit.z };
	if (face === 1) return { x: x + hit.x, y: y + 1.02, z: z + hit.z };
	if (face === 2) return { x: x + hit.x, y: y + hit.y, z: z - 0.02 };
	if (face === 3) return { x: x + hit.x, y: y + hit.y, z: z + 1.02 };
	if (face === 4) return { x: x - 0.02, y: y + hit.y, z: z + hit.z };
	return { x: x + 1.02, y: y + hit.y, z: z + hit.z };
}

function selectedItemTypeId(player) {
	try {
		const inventory = player.getComponent("minecraft:inventory")?.container;
		return inventory?.getItem(player.selectedSlotIndex)?.typeId;
	} catch {
		return undefined;
	}
}

function targetForPlayer(player) {
	if (player.isSneaking || selectedItemTypeId(player) !== WRENCH)
		return undefined;
	try {
		const hit = player.getBlockFromViewDirection({ maxDistance: 8 });
		const block = hit?.block;
		const face = creativeMotorFaceIndex(hit?.face);
		if (block?.typeId !== CREATIVE_MOTOR_BLOCK || !Number.isInteger(face))
			return undefined;
		if (!isCreativeMotorValueBox({
			blockFace: face,
			faceLocation: hit.faceLocation,
			facingDirection: block.permutation?.getState?.("minecraft:facing_direction")
		}))
			return undefined;
		return { block, face, faceLocation: hit.faceLocation, id: boardId(block) };
	} catch {
		return undefined;
	}
}

function digitsForSpeed(speed) {
	const magnitude = Math.max(0, Math.min(256, Math.round(Math.abs(Number(speed) || 0))));
	return {
		hundreds: magnitude >= 100 ? Math.floor(magnitude / 100) : -1,
		tens: magnitude >= 10 ? Math.floor(magnitude / 10) % 10 : -1,
		ones: magnitude % 10,
		reverse: speed < 0
	};
}

function isUsable(entity) {
	try {
		return entity?.isValid?.() ?? Boolean(entity);
	} catch {
		return false;
	}
}

function findBoard(target) {
	const known = valueBoards.get(target.id);
	if (isUsable(known))
		return known;
	try {
		const entity = target.block.dimension.getEntities({
			type: VALUE_BOARD_ENTITY,
			location: boardLocation(target.block, target.face, target.faceLocation),
			maxDistance: 0.2
		}).find(candidate => candidate.getDynamicProperty(VALUE_BOARD_ID) === target.id);
		if (entity)
			valueBoards.set(target.id, entity);
		return entity;
	} catch {
		return undefined;
	}
}

function updateBoard(target, kineticWorld) {
	let entity = findBoard(target);
	if (!entity) {
		try {
			entity = target.block.dimension.spawnEntity(VALUE_BOARD_ENTITY, boardLocation(target.block, target.face, target.faceLocation));
			entity.setDynamicProperty(VALUE_BOARD_ID, target.id);
			valueBoards.set(target.id, entity);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not create Creative Motor value board: ${error}`);
			return;
		}
	}
	const digits = digitsForSpeed(kineticWorld.generatedSpeedAt(target.block.dimension.id, target.block.location));
	try {
		entity.teleport(boardLocation(target.block, target.face, target.faceLocation));
		entity.setProperty("createbedrock:face", target.face);
		entity.setProperty("createbedrock:digit_hundreds", digits.hundreds);
		entity.setProperty("createbedrock:digit_tens", digits.tens);
		entity.setProperty("createbedrock:digit_ones", digits.ones);
		entity.setProperty("createbedrock:reverse", digits.reverse);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not update Creative Motor value board: ${error}`);
	}
}

function removeBoard(id) {
	const entity = valueBoards.get(id);
	valueBoards.delete(id);
	try {
		entity?.remove();
	} catch {
		// The board can already be gone after a chunk unload or pack reload.
	}
}

/**
 * Bedrock has no Java-equivalent per-player world-space overlay. This keeps a
 * tiny non-colliding value board on precisely the same wrench-targeted face as
 * Java's ValueSettingsBoard; it is therefore intentionally visible to nearby
 * players while the board is focused.
 */
export function registerCreativeMotorValueBoards(kineticWorld) {
	if (!kineticWorld || typeof kineticWorld.generatedSpeedAt !== "function")
		throw new TypeError("Creative Motor value boards require a KineticWorld");
	registerTickHandler(() => {
		const targets = new Map();
		for (const player of world.getAllPlayers()) {
			const target = targetForPlayer(player);
			if (target)
				targets.set(target.id, target);
		}
		for (const [id, target] of targets)
			updateBoard(target, kineticWorld);
		for (const id of valueBoards.keys())
			if (!targets.has(id)) removeBoard(id);
	});
}
