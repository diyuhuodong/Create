import { transformAssemblyPoint } from "./assembly-transform.js";

export const CONTRAPTION_CONTROLS_BLOCK = "createbedrock:controls";
export const MECHANICAL_PLOUGH_BLOCK = "createbedrock:mechanical_plough";
export const MECHANICAL_ROLLER_BLOCK = "createbedrock:mechanical_roller";
export const MECHANICAL_DRILL_BLOCK = "createbedrock:mechanical_drill";
export const PISTON_EXTENSION_POLE_BLOCK = "createbedrock:piston_extension_pole";
export const PORTABLE_STORAGE_INTERFACE_BLOCK = "createbedrock:portable_storage_interface";

export const ROLLER_MODES = Object.freeze(["tunnel_pave", "straight_fill", "wide_fill"]);

const FACING_VECTORS = Object.freeze({
	0: { x: 0, y: -1, z: 0 }, 1: { x: 0, y: 1, z: 0 }, 2: { x: 0, y: 0, z: -1 },
	3: { x: 0, y: 0, z: 1 }, 4: { x: -1, y: 0, z: 0 }, 5: { x: 1, y: 0, z: 0 },
	down: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 1, z: 0 }, north: { x: 0, y: 0, z: -1 },
	south: { x: 0, y: 0, z: 1 }, west: { x: -1, y: 0, z: 0 }, east: { x: 1, y: 0, z: 0 }
});

function normalizedVector(vector) {
	if (![vector?.x, vector?.y, vector?.z].every(Number.isFinite))
		throw new TypeError("Contraption actor vectors require finite coordinates");
	return { x: vector.x, y: vector.y, z: vector.z };
}

export function actorFacing(states) {
	const facing = states?.["minecraft:facing_direction"] ?? states?.facing_direction ?? states?.facing;
	return { ...(FACING_VECTORS[facing] ?? FACING_VECTORS[3]) };
}

export function rotateActorVector(transform, vector) {
	const origin = transformAssemblyPoint(transform, { x: 0, y: 0, z: 0 });
	const point = transformAssemblyPoint(transform, normalizedVector(vector));
	return {
		x: point.x - origin.x,
		y: point.y - origin.y,
		z: point.z - origin.z
	};
}

export function actorWorldCenter(assembly, block) {
	if (!assembly?.snapshot?.anchor || !assembly?.transform || !block?.relative)
		throw new TypeError("Contraption actor positions require an assembly snapshot block");
	const offset = transformAssemblyPoint(assembly.transform, {
		x: block.relative.x + .5,
		y: block.relative.y + .5,
		z: block.relative.z + .5
	});
	return {
		x: assembly.snapshot.anchor.x + offset.x,
		y: assembly.snapshot.anchor.y + offset.y,
		z: assembly.snapshot.anchor.z + offset.z
	};
}

export function actorBlockCell(center) {
	normalizedVector(center);
	return { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) };
}

export function actorTraversal(previous, current) {
	const start = actorBlockCell(previous);
	const end = actorBlockCell(current);
	const distance = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y), Math.abs(end.z - start.z));
	return Array.from({ length: distance + 1 }, (_, index) => ({
		x: Math.floor(start.x + (end.x - start.x) * index / Math.max(1, distance)),
		y: Math.floor(start.y + (end.y - start.y) * index / Math.max(1, distance)),
		z: Math.floor(start.z + (end.z - start.z) * index / Math.max(1, distance))
	})).filter((location, index, locations) => index === 0 || `${location.x}:${location.y}:${location.z}` !== `${locations[index - 1].x}:${locations[index - 1].y}:${locations[index - 1].z}`);
}

export function normalizeControlsState(state = {}) {
	if (state.disabled !== undefined && typeof state.disabled !== "boolean")
		throw new TypeError("Contraption control disabled state must be boolean");
	if (state.filter !== undefined && (typeof state.filter !== "string" || state.filter.length > 128))
		throw new TypeError("Contraption control filters must be short item identifiers");
	return { disabled: state.disabled ?? false, filter: state.filter ?? "" };
}

export function controlsDisableActor(controls, actorTypeId) {
	if (typeof actorTypeId !== "string")
		throw new TypeError("Contraption controls need an actor type id");
	return controls.some(control => {
		const state = normalizeControlsState(control);
		return state.disabled && (state.filter === "" || state.filter === actorTypeId);
	});
}

export function normalizeRollerState(state = {}) {
	if (state.material !== undefined && (typeof state.material !== "string" || state.material.length > 128))
		throw new TypeError("Roller material filters must be short block identifiers");
	if (!Number.isInteger(state.mode ?? 0) || state.mode < 0 || state.mode >= ROLLER_MODES.length)
		throw new RangeError("Roller modes must reference a supported mode");
	return { material: state.material ?? "", mode: state.mode ?? 0 };
}

export function rollerWorkCells(center, facing, mode) {
	const origin = actorBlockCell(center);
	const normal = normalizedVector(facing);
	const perpendicular = Math.abs(normal.x) > 0 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
	const width = mode === 2 ? [-1, 0, 1] : [0];
	const height = mode === 0 ? [0, 1, 2] : [0];
	return width.flatMap(side => height.map(vertical => ({
		x: origin.x + normal.x + perpendicular.x * side,
		y: origin.y - 1 + vertical,
		z: origin.z + normal.z + perpendicular.z * side
	})));
}

export function ploughMutationFor(typeId) {
	if (["minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt", "minecraft:rooted_dirt"].includes(typeId))
		return { typeId: "minecraft:farmland" };
	if (["minecraft:snow", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:deadbush"].includes(typeId))
		return { typeId: "minecraft:air" };
	return undefined;
}

const DRILL_PROTECTED_BLOCKS = new Set([
	"minecraft:air",
	"minecraft:bedrock",
	"minecraft:barrier",
	"minecraft:cave_air",
	"minecraft:end_portal",
	"minecraft:end_portal_frame",
	"minecraft:flowing_lava",
	"minecraft:flowing_water",
	"minecraft:lava",
	"minecraft:void_air",
	"minecraft:water"
]);

/** The drill is deliberately conservative: a missing block item stack means no safe server-side drop. */
export function canDrillBlock(typeId) {
	return typeof typeId === "string" && !DRILL_PROTECTED_BLOCKS.has(typeId);
}

export function drillTargetCell(center, facing) {
	const origin = actorBlockCell(center);
	const normal = normalizedVector(facing);
	return { x: origin.x + normal.x, y: origin.y + normal.y, z: origin.z + normal.z };
}

export function normalizePortableInterfaceState(state = {}) {
	if (!Array.isArray(state.slots) || state.slots.length !== 9)
		return { slots: Array.from({ length: 9 }) };
	return {
		slots: state.slots.map(slot => {
			if (slot === undefined || slot === null)
				return undefined;
			if (typeof slot.typeId !== "string" || !Number.isInteger(slot.count) || slot.count < 1 || slot.count > 64)
				throw new TypeError("Portable Storage Interface slots require bounded item stacks");
			return { count: slot.count, typeId: slot.typeId };
		})
	};
}

function insertOne(slots, item) {
	const target = slots.find(slot => slot?.typeId === item.typeId && slot.count < 64);
	if (target) {
		target.count++;
		return true;
	}
	const index = slots.findIndex(slot => !slot);
	if (index < 0)
		return false;
	slots[index] = { count: 1, typeId: item.typeId };
	return true;
}

function extractOne(slots) {
	const index = slots.findIndex(Boolean);
	if (index < 0)
		return undefined;
	const item = { count: 1, typeId: slots[index].typeId };
	if (slots[index].count === 1)
		slots[index] = undefined;
	else
		slots[index].count--;
	return item;
}

/** Transfer one stack unit in either direction without duplicating a failed insert. */
export function transferPortableInterfaceItem(sourceState, destinationState) {
	const source = normalizePortableInterfaceState(sourceState);
	const destination = normalizePortableInterfaceState(destinationState);
	const item = extractOne(source.slots);
	if (!item)
		return { changed: false, destination, source };
	if (!insertOne(destination.slots, item)) {
		insertOne(source.slots, item);
		return { changed: false, destination, source };
	}
	return { changed: true, destination, source };
}
