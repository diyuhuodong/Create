import { ItemStack, system, world } from "@minecraft/server";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	crafterWorkTicks,
	mechanicalCrafterPlane,
	matchMechanicalCraftingRecipe,
	MECHANICAL_CRAFTER_BLOCK
} from "./mechanical-crafter.js";

const MECHANICAL_CRAFTER_TASK_GROUP = "mechanicalCrafters";
const MECHANICAL_CRAFTER_TASK_BUDGET = 12;
const MAX_CRAFTER_GROUP = 25;
const records = new Map();
const activeCrafts = new Map();
let completedCrafts = 0;
let failedUpdates = 0;
let registered = false;

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function assertLocation(location) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError("Mechanical Crafter locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Mechanical Crafters require a dimension identifier");
	const normalized = assertLocation(location);
	return `mechanical-crafter:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	const location = record.location;
	return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

function normalizeSlot(slot) {
	if (slot === undefined)
		return undefined;
	if (typeof slot?.typeId !== "string" || !Number.isInteger(slot.count) || slot.count !== 1)
		throw new TypeError("Mechanical Crafter slots contain exactly one item");
	return { count: 1, typeId: slot.typeId };
}

function normalizeRecord(record) {
	if (record?.kind !== "crafter" || typeof record.dimensionId !== "string")
		throw new TypeError("Mechanical Crafter records require identity");
	const location = assertLocation(record.location);
	const id = recordId(record.dimensionId, location);
	if (record.id !== id || !["idle", "assembling"].includes(record.phase) || typeof record.powered !== "boolean")
		throw new TypeError("Mechanical Crafter record has invalid state");
	if (record.craftId !== undefined && (typeof record.craftId !== "string" || record.craftId.length === 0))
		throw new TypeError("Mechanical Crafter active craft identity is invalid");
	return {
		craftId: record.craftId,
		dimensionId: record.dimensionId,
		id,
		kind: "crafter",
		location,
		phase: record.phase,
		powered: record.powered,
		slot: normalizeSlot(record.slot)
	};
}

function normalizeCraft(record) {
	if (record?.kind !== "craft" || typeof record.dimensionId !== "string" || typeof record.id !== "string" || !Array.isArray(record.memberIds))
		throw new TypeError("Mechanical Crafter craft record requires identity and members");
	if (!Number.isInteger(record.remaining) || record.remaining < 0 || !record.output || typeof record.output.typeId !== "string" || !Number.isInteger(record.output.count) || record.output.count < 1)
		throw new TypeError("Mechanical Crafter craft record has invalid progress or output");
	const location = assertLocation(record.outputLocation);
	return {
		dimensionId: record.dimensionId,
		facing: record.facing,
		id: record.id,
		kind: "craft",
		memberIds: [...new Set(record.memberIds)].sort(),
		output: { count: record.output.count, typeId: record.output.typeId },
		outputLocation: location,
		remaining: record.remaining,
		recipeId: record.recipeId
	};
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:mechanical_crafter_state_v1",
	onError(error) { console.warn(`[Create Bedrock] Mechanical Crafter state error: ${error}`); },
	partitionFor(record) {
		if (record?.kind === "crafter")
			return partitionFor(record);
		if (record?.kind === "craft")
			return `craft:${record.dimensionId}:${record.id}`;
		throw new TypeError("Unknown Mechanical Crafter persistent record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [
		...[...records.values()].map(normalizeRecord),
		...[...activeCrafts.values()].map(normalizeCraft)
	].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function persist() {
	try { store.request(persistentRecords()); } catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Mechanical Crafter state: ${error}`);
	}
}

function resolveBlock(record) {
	try { return world.getDimension(record.dimensionId).getBlock(record.location); } catch { return undefined; }
}

function facingFor(record) {
	const facing = resolveBlock(record)?.permutation?.getAllStates?.()["minecraft:facing_direction"];
	return facing === undefined ? 1 : facing;
}

function normalForFacing(facing) {
	return ({
		0: { x: 0, y: -1, z: 0 }, 1: { x: 0, y: 1, z: 0 }, 2: { x: 0, y: 0, z: -1 },
		3: { x: 0, y: 0, z: 1 }, 4: { x: -1, y: 0, z: 0 }, 5: { x: 1, y: 0, z: 0 },
		down: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 1, z: 0 }, north: { x: 0, y: 0, z: -1 },
		south: { x: 0, y: 0, z: 1 }, west: { x: -1, y: 0, z: 0 }, east: { x: 1, y: 0, z: 0 }
	})[facing] ?? { x: 0, y: 1, z: 0 };
}

function locationValue(location, axis) { return location[axis]; }

function recordAt(dimensionId, location) { return records.get(recordId(dimensionId, location)); }

function groupFor(seed) {
	const facing = facingFor(seed);
	const [horizontalAxis, verticalAxis] = mechanicalCrafterPlane(facing);
	const offsets = [
		{ [horizontalAxis]: 1 }, { [horizontalAxis]: -1 },
		{ [verticalAxis]: 1 }, { [verticalAxis]: -1 }
	].map(partial => ({ x: partial.x ?? 0, y: partial.y ?? 0, z: partial.z ?? 0 }));
	const members = [];
	const pending = [seed];
	const visited = new Set([seed.id]);
	while (pending.length > 0) {
		const current = pending.shift();
		members.push(current);
		if (members.length > MAX_CRAFTER_GROUP)
			throw new RangeError(`Mechanical Crafter grids support at most ${MAX_CRAFTER_GROUP} crafters`);
		for (const offset of offsets) {
			const next = recordAt(current.dimensionId, {
				x: current.location.x + offset.x,
				y: current.location.y + offset.y,
				z: current.location.z + offset.z
			});
			if (!next || visited.has(next.id) || next.phase !== "idle" || facingFor(next) !== facing)
				continue;
			visited.add(next.id);
			pending.push(next);
		}
	}
	return { facing, members: members.sort((left, right) => left.id.localeCompare(right.id)), plane: [horizontalAxis, verticalAxis] };
}

function gridFor(group) {
	const [horizontalAxis, verticalAxis] = group.plane;
	const occupied = group.members.filter(member => member.slot);
	if (occupied.length === 0)
		return undefined;
	const horizontalValues = occupied.map(member => locationValue(member.location, horizontalAxis));
	const verticalValues = occupied.map(member => locationValue(member.location, verticalAxis));
	const minHorizontal = Math.min(...horizontalValues);
	const maxHorizontal = Math.max(...horizontalValues);
	const minVertical = Math.min(...verticalValues);
	const maxVertical = Math.max(...verticalValues);
	const byCoordinate = new Map(group.members.map(member => [
		`${locationValue(member.location, horizontalAxis)}:${locationValue(member.location, verticalAxis)}`,
		member
	]));
	const grid = [];
	for (let vertical = minVertical; vertical <= maxVertical; vertical++) {
		const row = [];
		for (let horizontal = minHorizontal; horizontal <= maxHorizontal; horizontal++)
			row.push(byCoordinate.get(`${horizontal}:${vertical}`)?.slot);
		grid.push(row);
	}
	return grid;
}

function speedFor(group, getKineticWorld) {
	return group.members.reduce((maximum, member) => Math.max(maximum, Math.abs(getKineticWorld().speedAt(member.dimensionId, member.location))), 0);
}

function outputLocation(member, facing) {
	const normal = normalForFacing(facing);
	return {
		x: member.location.x + .5 + normal.x * 1.1,
		y: member.location.y + .5 + normal.y * 1.1,
		z: member.location.z + .5 + normal.z * 1.1
	};
}

function outputIsAvailable(output) {
	try { return !!new ItemStack(output.typeId, output.count); } catch { return false; }
}

function startCraft(group, getKineticWorld) {
	const grid = gridFor(group);
	const match = grid && matchMechanicalCraftingRecipe(grid);
	if (!match || !outputIsAvailable(match.output))
		return false;
	const workTicks = crafterWorkTicks(speedFor(group, getKineticWorld));
	if (!workTicks)
		return false;
	const id = `craft:${group.members[0].id}`;
	if (activeCrafts.has(id))
		return false;
	for (const member of group.members) {
		member.craftId = id;
		member.phase = "assembling";
	}
	activeCrafts.set(id, {
		dimensionId: group.members[0].dimensionId,
		facing: group.facing,
		id,
		kind: "craft",
		memberIds: group.members.map(member => member.id),
		output: match.output,
		outputLocation: outputLocation(group.members[0], group.facing),
		remaining: workTicks,
		recipeId: match.id
	});
	persist();
	return true;
}

function completeCraft(craft) {
	const members = craft.memberIds.map(id => records.get(id));
	if (members.some(member => !member || member.craftId !== craft.id || member.phase !== "assembling")) {
		activeCrafts.delete(craft.id);
		failedUpdates++;
		persist();
		return false;
	}
	try {
		world.getDimension(craft.dimensionId).spawnItem(new ItemStack(craft.output.typeId, craft.output.count), craft.outputLocation);
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Mechanical Crafter output ${craft.recipeId} failed: ${error}`);
		return false;
	}
	for (const member of members) {
		member.craftId = undefined;
		member.phase = "idle";
		member.slot = undefined;
	}
	activeCrafts.delete(craft.id);
	completedCrafts++;
	persist();
	return true;
}

function tickCrafts() {
	for (const craft of activeCrafts.values()) {
		if (craft.remaining > 0) {
			craft.remaining--;
			continue;
		}
		completeCraft(craft);
	}
}

function isCreative(player) { return player?.getGameMode?.() === "creative"; }

function selectedSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0 || slot >= container.size)
		return undefined;
	return { container, item: container.getItem(slot), slot };
}

function insertFromPlayer(player, record, item) {
	if (record.phase !== "idle" || record.slot || !item?.typeId)
		return false;
	const holder = selectedSlot(player);
	if (!isCreative(player) && (!holder?.item || holder.item.typeId !== item.typeId || holder.item.amount < 1))
		return false;
	record.slot = { count: 1, typeId: item.typeId };
	if (!isCreative(player)) {
		if (holder.item.amount === 1)
			holder.container.setItem(holder.slot);
		else {
			const remainder = holder.item.clone();
			remainder.amount--;
			holder.container.setItem(holder.slot, remainder);
		}
	}
	persist();
	return true;
}

function extractToPlayer(player, record, block) {
	if (record.phase !== "idle" || !record.slot)
		return false;
	const holder = selectedSlot(player);
	let stack;
	try { stack = new ItemStack(record.slot.typeId, 1); } catch { return false; }
	if (holder && holder.item === undefined)
		holder.container.setItem(holder.slot, stack);
	else
		block.dimension.spawnItem(stack, { x: block.location.x + .5, y: block.location.y + .75, z: block.location.z + .5 });
	record.slot = undefined;
	persist();
	return true;
}

function createRecord(block) {
	if (block?.typeId !== MECHANICAL_CRAFTER_BLOCK)
		return undefined;
	const id = recordId(block.dimension.id, block.location);
	let record = records.get(id);
	if (!record) {
		record = { dimensionId: block.dimension.id, id, kind: "crafter", location: assertLocation(block.location), phase: "idle", powered: false, slot: undefined };
		records.set(id, record);
	}
	return record;
}

function ejectRecord(record) {
	if (!record.slot)
		return;
	try {
		const dimension = world.getDimension(record.dimensionId);
		dimension.spawnItem(new ItemStack(record.slot.typeId, 1), { x: record.location.x + .5, y: record.location.y + .5, z: record.location.z + .5 });
	} catch { failedUpdates++; }
}

function deleteRecord(block) {
	const id = recordId(block.dimension.id, block.location);
	const record = records.get(id);
	if (!record)
		return false;
	ejectRecord(record);
	if (record.craftId)
		activeCrafts.delete(record.craftId);
	records.delete(id);
	persist();
	return true;
}

export function captureMechanicalCrafterMovingData(dimensionId, location) {
	const record = records.get(recordId(dimensionId, location));
	return record && { phase: record.phase, powered: record.powered, slot: clone(record.slot) };
}

export function detachMechanicalCrafterMovingData(dimensionId, location) {
	const id = recordId(dimensionId, location);
	const state = captureMechanicalCrafterMovingData(dimensionId, location);
	if (state) {
		const craftId = records.get(id)?.craftId;
		if (craftId)
			activeCrafts.delete(craftId);
		records.delete(id);
		persist();
	}
	return state;
}

export function restoreMechanicalCrafterMovingData(dimensionId, location, state) {
	if (state === undefined)
		return false;
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore Mechanical Crafter state over ${id}`);
	const record = normalizeRecord({ ...state, dimensionId, id, kind: "crafter", location });
	records.set(id, record);
	persist();
	return true;
}

function tickRecords(getKineticWorld) {
	for (const record of [...records.values()].sort((left, right) => left.id.localeCompare(right.id))) {
		const block = resolveBlock(record);
		if (block?.typeId !== MECHANICAL_CRAFTER_BLOCK) {
			records.delete(record.id);
			continue;
		}
		const powered = (block.getRedstonePower?.() ?? 0) > 0;
		const rising = powered && !record.powered;
		if (record.powered !== powered) {
			record.powered = powered;
			persist();
		}
		if (rising && record.phase === "idle") {
			try { startCraft(groupFor(record), getKineticWorld); } catch (error) {
				failedUpdates++;
				console.warn(`[Create Bedrock] Mechanical Crafter group failed: ${error}`);
			}
		}
	}
	tickCrafts();
	store.tick();
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Mechanical Crafter shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind === "crafter") {
				const record = normalizeRecord(entry);
				records.set(record.id, record);
			} else if (entry?.kind === "craft") {
				const craft = normalizeCraft(entry);
				activeCrafts.set(craft.id, craft);
			}
		}
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Mechanical Crafter state: ${error}`);
	}
}

export function getMechanicalCrafterDiagnostics() {
	return { activeCrafts: activeCrafts.size, completedCrafts, failedUpdates, records: records.size, persistence: store.diagnostics() };
}

export function registerMechanicalCrafters(getKineticWorld) {
	if (registered)
		return false;
	registered = true;
	registerMovingBlockDataContributor(MECHANICAL_CRAFTER_BLOCK, "mechanical-crafter", {
		capture: captureMechanicalCrafterMovingData,
		detach: detachMechanicalCrafterMovingData,
		restore: restoreMechanicalCrafterMovingData,
		schemaVersion: 1,
		validate(state) {
			if (state === undefined)
				return;
			normalizeRecord({ ...state, dimensionId: "validate", id: "mechanical-crafter:validate:0:0:0", kind: "crafter", location: { x: 0, y: 0, z: 0 } });
		}
	});
	registerKernelTaskGroup(MECHANICAL_CRAFTER_TASK_GROUP, MECHANICAL_CRAFTER_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (createRecord(event.block))
			persist();
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (event.block.typeId === MECHANICAL_CRAFTER_BLOCK)
			deleteRecord(event.block);
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		const record = createRecord(event.block);
		if (!record)
			return;
		try {
			if (event.itemStack)
				insertFromPlayer(event.player, record, event.itemStack);
			else
				extractToPlayer(event.player, record, event.block);
		} catch (error) {
			failedUpdates++;
			event.player?.sendMessage?.(`Mechanical Crafter interaction failed: ${error}`);
		}
	});
	registerTickHandler(() => tickRecords(getKineticWorld), MECHANICAL_CRAFTER_TASK_GROUP);
	system.run(restore);
	return true;
}
