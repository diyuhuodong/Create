import { BlockPermutation, BlockTypes, ItemStack, system, world } from "@minecraft/server";

import { getActiveDynamicAssemblies, updateDynamicAssemblyBlockData } from "./contraption-runtime.js";
import { registerMovingBlockDataContributor, registerStatelessMovingBlockDataAdapter } from "./moving-block-data.js";
import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	actorBlockCell,
	actorFacing,
	actorTraversal,
	actorWorldCenter,
	canHarvestBlock,
	canDrillBlock,
	CONTRAPTION_CONTROLS_BLOCK,
	controlsDisableActor,
	MECHANICAL_PLOUGH_BLOCK,
	MECHANICAL_DRILL_BLOCK,
	DEPLOYER_BLOCK,
	MECHANICAL_ARM_BLOCK,
	MECHANICAL_HARVESTER_BLOCK,
	MECHANICAL_ROLLER_BLOCK,
	normalizeControlsState,
	normalizeActorItemState,
	normalizePortableInterfaceState,
	normalizeRollerState,
	PISTON_EXTENSION_POLE_BLOCK,
	ploughMutationFor,
	drillTargetCell,
	PORTABLE_STORAGE_INTERFACE_BLOCK,
	rollerWorkCells,
	rotateActorVector,
	transferPortableInterfaceItem
} from "./contraption-actors.js";

const ACTOR_TASK_GROUP = "contraptionActors";
const ACTOR_TASK_BUDGET = 24;
const CONTROLS_DISABLED_STATE = "createbedrock:disabled";
const PSI_CONNECTED_STATE = "createbedrock:connected";
const ROLLER_MODE_STATE = "createbedrock:mode";
const PERSISTENT_ACTOR_TYPES = new Set([
	CONTRAPTION_CONTROLS_BLOCK,
	DEPLOYER_BLOCK,
	MECHANICAL_ARM_BLOCK,
	MECHANICAL_DRILL_BLOCK,
	MECHANICAL_HARVESTER_BLOCK,
	MECHANICAL_ROLLER_BLOCK,
	PORTABLE_STORAGE_INTERFACE_BLOCK
]);
const records = new Map();
const lastActorCells = new Map();
let failedUpdates = 0;
let drillBreaks = 0;
let deployments = 0;
let harvests = 0;
let ploughMutations = 0;
let registered = false;
let rollerPlacements = 0;
let transfers = 0;

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function assertLocation(location) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError("Contraption actor records require integer block coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Contraption actor records require a dimension identifier");
	const normalized = assertLocation(location);
	return `actor:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.y / 16)}:${Math.floor(record.location.z / 16)}`;
}

function normalizeRecord(record) {
	if (record?.kind !== "actor" || !PERSISTENT_ACTOR_TYPES.has(record.typeId))
		throw new TypeError("Unknown contraption actor record type");
	const location = assertLocation(record.location);
	const id = recordId(record.dimensionId, location);
	if (record.id !== id)
		throw new TypeError("Contraption actor record has an invalid identity");
	const state = normalizeStateFor(record.typeId, record.state);
	return { dimensionId: record.dimensionId, id, kind: "actor", location, state, typeId: record.typeId };
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:contraption_actor_state_v1",
	onError(error) { console.warn(`[Create Bedrock] Contraption actor state error: ${error}`); },
	partitionFor(record) {
		if (record?.kind !== "actor")
			throw new TypeError("Unknown contraption actor persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persist() {
	try { store.request([...records.values()].map(normalizeRecord).sort((left, right) => left.id.localeCompare(right.id))); } catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist contraption actor state: ${error}`);
	}
}

function recordAt(dimensionId, location) {
	return records.get(recordId(dimensionId, location));
}

function resolveBlock(record) {
	try { return world.getDimension(record.dimensionId).getBlock(record.location); } catch { return undefined; }
}

function setRuntimeState(block, property, value) {
	if (!block?.permutation?.getAllStates || typeof block.setPermutation !== "function")
		return false;
	try {
		if (block.permutation.getAllStates()[property] === value)
			return false;
		block.setPermutation(block.permutation.withState(property, value));
		return true;
	} catch {
		return false;
	}
}

function syncRecordVisual(record) {
	const block = resolveBlock(record);
	if (!block || block.typeId !== record.typeId)
		return false;
	if (record.typeId === CONTRAPTION_CONTROLS_BLOCK)
		return setRuntimeState(block, CONTROLS_DISABLED_STATE, record.state.disabled ? 1 : 0);
	if (record.typeId === MECHANICAL_ROLLER_BLOCK)
		return setRuntimeState(block, ROLLER_MODE_STATE, record.state.mode);
	if (record.typeId === PORTABLE_STORAGE_INTERFACE_BLOCK)
		return setRuntimeState(block, PSI_CONNECTED_STATE, record.state.connected ? 1 : 0);
	return false;
}

function defaultState(typeId) {
	if (typeId === CONTRAPTION_CONTROLS_BLOCK)
		return normalizeControlsState();
	if (typeId === MECHANICAL_ROLLER_BLOCK)
		return normalizeRollerState();
	if (typeId === PORTABLE_STORAGE_INTERFACE_BLOCK)
		return { ...normalizePortableInterfaceState(), connected: false };
	if ([DEPLOYER_BLOCK, MECHANICAL_ARM_BLOCK, MECHANICAL_DRILL_BLOCK, MECHANICAL_HARVESTER_BLOCK].includes(typeId))
		return normalizeActorItemState();
	throw new TypeError(`Unsupported contraption actor ${typeId}`);
}

function normalizeStateFor(typeId, state) {
	if (typeId === CONTRAPTION_CONTROLS_BLOCK)
		return normalizeControlsState(state);
	if (typeId === MECHANICAL_ROLLER_BLOCK)
		return normalizeRollerState(state);
	if (typeId === PORTABLE_STORAGE_INTERFACE_BLOCK)
		return { ...normalizePortableInterfaceState(state), connected: Boolean(state?.connected) };
	if ([DEPLOYER_BLOCK, MECHANICAL_ARM_BLOCK, MECHANICAL_DRILL_BLOCK, MECHANICAL_HARVESTER_BLOCK].includes(typeId))
		return normalizeActorItemState(state);
	throw new TypeError(`Unsupported contraption actor ${typeId}`);
}

function ensureRecord(block) {
	if (!PERSISTENT_ACTOR_TYPES.has(block?.typeId))
		return undefined;
	const id = recordId(block.dimension.id, block.location);
	let record = records.get(id);
	if (!record) {
		record = { dimensionId: block.dimension.id, id, kind: "actor", location: assertLocation(block.location), state: defaultState(block.typeId), typeId: block.typeId };
		records.set(id, record);
		syncRecordVisual(record);
	}
	return record;
}

function actorDataState(typeId, data) {
	let payload = data;
	if (data?.assemblyDataSchema === 1)
		payload = data.contributors?.[actorContributorName(typeId)];
	if (payload?.adapterSchemaVersion !== undefined)
		payload = payload.payload;
	return normalizeStateFor(typeId, payload);
}

function actorContributorName(typeId) {
	return typeId === CONTRAPTION_CONTROLS_BLOCK ? "controls"
		: typeId === MECHANICAL_ROLLER_BLOCK ? "roller"
		: typeId === PORTABLE_STORAGE_INTERFACE_BLOCK ? "portable-storage-interface"
			: typeId === DEPLOYER_BLOCK ? "deployer"
				: typeId === MECHANICAL_ARM_BLOCK ? "mechanical-arm"
					: typeId === MECHANICAL_DRILL_BLOCK ? "drill"
						: typeId === MECHANICAL_HARVESTER_BLOCK ? "harvester"
				: undefined;
}

function replaceActorDataState(typeId, data, state) {
	const normalized = normalizeStateFor(typeId, state);
	if (data?.assemblyDataSchema === 1) {
		const name = actorContributorName(typeId);
		const contributors = { ...data.contributors };
		const current = contributors[name];
		contributors[name] = current?.adapterSchemaVersion !== undefined
			? { ...current, payload: normalized }
			: normalized;
		return { ...data, contributors };
	}
	if (data?.adapterSchemaVersion !== undefined)
		return { ...data, payload: normalized };
	return normalized;
}

function captureActorState(typeId, dimensionId, location) {
	const record = recordAt(dimensionId, location);
	return record?.typeId === typeId ? clone(record.state) : undefined;
}

function detachActorState(typeId, dimensionId, location) {
	const id = recordId(dimensionId, location);
	const state = captureActorState(typeId, dimensionId, location);
	if (state !== undefined) {
		records.delete(id);
		persist();
	}
	return state;
}

function restoreActorState(typeId, dimensionId, location, state) {
	if (state === undefined)
		return false;
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore contraption actor state over ${id}`);
	const record = normalizeRecord({ dimensionId, id, kind: "actor", location, state, typeId });
	records.set(id, record);
	syncRecordVisual(record);
	persist();
	return true;
}

function isCreative(player) { return player?.getGameMode?.() === "creative"; }

function selectedHolder(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0 || slot >= container.size)
		return undefined;
	return { container, item: container.getItem(slot), slot };
}

function consumeOne(player, typeId) {
	if (isCreative(player))
		return true;
	const holder = selectedHolder(player);
	if (!holder?.item || holder.item.typeId !== typeId || holder.item.amount < 1)
		return false;
	if (holder.item.amount === 1)
		holder.container.setItem(holder.slot);
	else {
		const remainder = holder.item.clone();
		remainder.amount--;
		holder.container.setItem(holder.slot, remainder);
	}
	return true;
}

function giveItem(player, block, item) {
	const holder = selectedHolder(player);
	try {
		const stack = new ItemStack(item.typeId, item.count);
		if (holder && holder.item === undefined)
			holder.container.setItem(holder.slot, stack);
		else
			block.dimension.spawnItem(stack, { x: block.location.x + .5, y: block.location.y + .75, z: block.location.z + .5 });
		return true;
	} catch {
		return false;
	}
}

function insertIntoInterface(state, item) {
	const interfaceState = normalizePortableInterfaceState(state);
	let remaining = item.count;
	for (const slot of interfaceState.slots) {
		if (slot?.typeId !== item.typeId || slot.count >= 64)
			continue;
		const accepted = Math.min(64 - slot.count, remaining);
		slot.count += accepted;
		remaining -= accepted;
		if (remaining === 0)
			return { accepted: item.count, state: interfaceState };
	}
	for (let index = 0; index < interfaceState.slots.length && remaining > 0; index++) {
		if (interfaceState.slots[index])
			continue;
		const accepted = Math.min(64, remaining);
		interfaceState.slots[index] = { count: accepted, typeId: item.typeId };
		remaining -= accepted;
	}
	return { accepted: item.count - remaining, state: interfaceState };
}

function extractFromInterface(state) {
	const interfaceState = normalizePortableInterfaceState(state);
	const index = interfaceState.slots.findIndex(Boolean);
	if (index < 0)
		return undefined;
	const item = { ...interfaceState.slots[index] };
	interfaceState.slots[index] = undefined;
	return { item, state: interfaceState };
}

function interactControls(record, event) {
	if (event.itemStack && !event.source?.isSneaking) {
		if (![MECHANICAL_PLOUGH_BLOCK, MECHANICAL_ROLLER_BLOCK, MECHANICAL_DRILL_BLOCK].includes(event.itemStack.typeId))
			return false;
		record.state = { ...record.state, filter: event.itemStack.typeId };
	} else if (event.source?.isSneaking) {
		record.state = { ...record.state, filter: "" };
	} else {
		record.state = { ...record.state, disabled: !record.state.disabled };
	}
	syncRecordVisual(record);
	persist();
	return true;
}

function interactRoller(record, event) {
	if (event.source?.isSneaking && event.itemStack?.typeId) {
		try {
			if (!BlockTypes.get(event.itemStack.typeId))
				return false;
		} catch { return false; }
		record.state = { ...record.state, material: event.itemStack.typeId };
	} else if (event.source?.isSneaking) {
		record.state = { ...record.state, mode: (record.state.mode + 1) % 3 };
	} else {
		return false;
	}
	syncRecordVisual(record);
	persist();
	return true;
}

function interactInterface(record, event) {
	if (event.itemStack) {
		const result = insertIntoInterface(record.state, { count: 1, typeId: event.itemStack.typeId });
		if (result.accepted === 0 || !consumeOne(event.source, event.itemStack.typeId))
			return false;
		record.state = { ...result.state, connected: record.state.connected };
		persist();
		return true;
	}
	const extracted = extractFromInterface(record.state);
	if (!extracted || !giveItem(event.source, event.block, extracted.item))
		return false;
	record.state = extracted.state;
	persist();
	return true;
}

function interactSingleSlotActor(record, event) {
	const state = normalizeActorItemState(record.state);
	if (event.itemStack) {
		if (state.heldItem || !consumeOne(event.source, event.itemStack.typeId))
			return false;
		record.state = { ...state, heldItem: { count: 1, typeId: event.itemStack.typeId } };
		persist();
		return true;
	}
	if (!state.heldItem || !giveItem(event.source, event.block, state.heldItem))
		return false;
	record.state = { ...state, heldItem: undefined };
	persist();
	return true;
}

function facingCardinal(transform, states) {
	const vector = rotateActorVector(transform, actorFacing(states));
	const axis = ["x", "y", "z"].reduce((best, candidate) => Math.abs(vector[candidate]) > Math.abs(vector[best]) ? candidate : best, "x");
	return { x: axis === "x" ? Math.sign(vector.x) || 1 : 0, y: axis === "y" ? Math.sign(vector.y) || 1 : 0, z: axis === "z" ? Math.sign(vector.z) || 1 : 0 };
}

function controlsForAssembly(assembly) {
	return assembly.snapshot.blocks
		.filter(block => block.typeId === CONTRAPTION_CONTROLS_BLOCK)
		.map(block => actorDataState(CONTRAPTION_CONTROLS_BLOCK, block.data));
}

function applyPloughAt(dimension, location) {
	const target = dimension.getBlock({ x: location.x, y: location.y - 1, z: location.z });
	const mutation = ploughMutationFor(target?.typeId);
	if (!mutation)
		return false;
	try {
		target.setPermutation(BlockPermutation.resolve(mutation.typeId));
		ploughMutations++;
		return true;
	} catch {
		failedUpdates++;
		return false;
	}
}

function applyDrillAt(dimension, center, facing) {
	const location = drillTargetCell(center, facing);
	const target = dimension.getBlock(location);
	if (!canDrillBlock(target?.typeId))
		return false;
	try {
		const drop = target.getItemStack?.(1, true);
		if (!drop)
			return false;
		target.setPermutation(BlockPermutation.resolve("minecraft:air"));
		dimension.spawnItem(drop, { x: location.x + .5, y: location.y + .5, z: location.z + .5 });
		drillBreaks++;
		return true;
	} catch {
		failedUpdates++;
		return false;
	}
}

function applyHarvesterAt(dimension, center, facing) {
	const location = drillTargetCell(center, facing);
	const target = dimension.getBlock(location);
	if (!canHarvestBlock(target))
		return false;
	try {
		const drop = target.getItemStack?.(1, true);
		if (!drop)
			return false;
		target.setPermutation(BlockPermutation.resolve("minecraft:air"));
		dimension.spawnItem(drop, { x: location.x + .5, y: location.y + .5, z: location.z + .5 });
		harvests++;
		return true;
	} catch {
		failedUpdates++;
		return false;
	}
}

function deployAt(dimension, center, facing, state) {
	const actor = normalizeActorItemState(state);
	if (!actor.heldItem)
		return { changed: false, state: actor };
	const location = drillTargetCell(center, facing);
	try {
		const target = dimension.getBlock(location);
		if (!target || !["minecraft:air", "minecraft:cave_air"].includes(target.typeId) || !BlockTypes.get(actor.heldItem.typeId))
			return { changed: false, state: actor };
		target.setPermutation(BlockPermutation.resolve(actor.heldItem.typeId));
		deployments++;
		return { changed: true, state: { cooldown: 0 } };
	} catch {
		failedUpdates++;
		return { changed: false, state: actor };
	}
}

function applyRollerAt(dimension, center, facing, state) {
	if (!state.material)
		return 0;
	let placed = 0;
	for (const location of rollerWorkCells(center, facing, state.mode)) {
		try {
			const target = dimension.getBlock(location);
			const below = dimension.getBlock({ x: location.x, y: location.y - 1, z: location.z });
			if (!target || !below || !["minecraft:air", "minecraft:cave_air"].includes(target.typeId) || ["minecraft:air", "minecraft:cave_air"].includes(below.typeId))
				continue;
			target.setPermutation(BlockPermutation.resolve(state.material));
			placed++;
		} catch { failedUpdates++; }
	}
	rollerPlacements += placed;
	return placed;
}

function processMovingActors() {
	const activeKeys = new Set();
	const connectedInterfaces = new Set();
	for (const assembly of getActiveDynamicAssemblies()) {
		const controls = controlsForAssembly(assembly);
		let dimension;
		try { dimension = world.getDimension(assembly.dimensionId); } catch { continue; }
		for (const block of assembly.snapshot.blocks) {
			if (![MECHANICAL_PLOUGH_BLOCK, MECHANICAL_ROLLER_BLOCK, MECHANICAL_DRILL_BLOCK, MECHANICAL_HARVESTER_BLOCK, DEPLOYER_BLOCK, MECHANICAL_ARM_BLOCK, PORTABLE_STORAGE_INTERFACE_BLOCK].includes(block.typeId))
				continue;
			if (controlsDisableActor(controls, block.typeId))
				continue;
			const key = `${assembly.id}:${block.relative.x}:${block.relative.y}:${block.relative.z}`;
			activeKeys.add(key);
			const center = actorWorldCenter(assembly, block);
			const previous = lastActorCells.get(key);
			lastActorCells.set(key, center);
			if (block.typeId === MECHANICAL_PLOUGH_BLOCK) {
				for (const location of previous ? actorTraversal(previous, center) : [actorBlockCell(center)])
					applyPloughAt(dimension, location);
				continue;
			}
			if (block.typeId === MECHANICAL_ROLLER_BLOCK) {
				const state = actorDataState(MECHANICAL_ROLLER_BLOCK, block.data);
				const facing = facingCardinal(assembly.transform, block.states);
				for (const location of previous ? actorTraversal(previous, center) : [actorBlockCell(center)])
					applyRollerAt(dimension, { x: location.x + .5, y: location.y + .5, z: location.z + .5 }, facing, state);
				continue;
			}
			if (block.typeId === MECHANICAL_DRILL_BLOCK) {
				const facing = facingCardinal(assembly.transform, block.states);
				for (const location of previous ? actorTraversal(previous, center) : [actorBlockCell(center)])
					applyDrillAt(dimension, { x: location.x + .5, y: location.y + .5, z: location.z + .5 }, facing);
				continue;
			}
			if (block.typeId === MECHANICAL_HARVESTER_BLOCK) {
				const facing = facingCardinal(assembly.transform, block.states);
				for (const location of previous ? actorTraversal(previous, center) : [actorBlockCell(center)])
					applyHarvesterAt(dimension, { x: location.x + .5, y: location.y + .5, z: location.z + .5 }, facing);
				continue;
			}
			if (block.typeId === DEPLOYER_BLOCK) {
				const facing = facingCardinal(assembly.transform, block.states);
				const result = deployAt(dimension, center, facing, actorDataState(DEPLOYER_BLOCK, block.data));
				if (!result.changed)
					continue;
				try {
					updateDynamicAssemblyBlockData(assembly.dimensionId, assembly.id, block.relative, data => replaceActorDataState(DEPLOYER_BLOCK, data, result.state));
					persist();
				} catch (error) {
					failedUpdates++;
					console.warn(`[Create Bedrock] Deployer state update failed: ${error}`);
				}
				continue;
			}
			if (block.typeId === MECHANICAL_ARM_BLOCK) {
				const armState = actorDataState(MECHANICAL_ARM_BLOCK, block.data);
				if (!armState.heldItem)
					continue;
				const facing = facingCardinal(assembly.transform, block.states);
				const cell = actorBlockCell(center);
				const target = dimension.getBlock({ x: cell.x + facing.x, y: cell.y + facing.y, z: cell.z + facing.z });
				if (target?.typeId !== PORTABLE_STORAGE_INTERFACE_BLOCK)
					continue;
				const targetRecord = ensureRecord(target);
				if (!targetRecord)
					continue;
				const inserted = insertIntoInterface(targetRecord.state, armState.heldItem);
				if (inserted.accepted === 0)
					continue;
				const remaining = armState.heldItem.count - inserted.accepted;
				targetRecord.state = { ...inserted.state, connected: true };
				connectedInterfaces.add(targetRecord.id);
				syncRecordVisual(targetRecord);
				try {
					updateDynamicAssemblyBlockData(assembly.dimensionId, assembly.id, block.relative, data => replaceActorDataState(MECHANICAL_ARM_BLOCK, data, {
						cooldown: 0,
						...(remaining > 0 ? { heldItem: { count: remaining, typeId: armState.heldItem.typeId } } : {})
					}));
					transfers++;
					persist();
				} catch (error) {
					failedUpdates++;
					console.warn(`[Create Bedrock] Mechanical Arm state update failed: ${error}`);
				}
				continue;
			}
			const facing = facingCardinal(assembly.transform, block.states);
			const cell = actorBlockCell(center);
			const target = dimension.getBlock({ x: cell.x + facing.x, y: cell.y + facing.y, z: cell.z + facing.z });
			if (target?.typeId !== PORTABLE_STORAGE_INTERFACE_BLOCK)
				continue;
			const targetRecord = ensureRecord(target);
			if (!targetRecord)
				continue;
			const dynamicState = actorDataState(PORTABLE_STORAGE_INTERFACE_BLOCK, block.data);
		let dynamicToStatic = true;
		let result = transferPortableInterfaceItem(dynamicState, targetRecord.state);
		if (!result.changed) {
			dynamicToStatic = false;
			result = transferPortableInterfaceItem(targetRecord.state, dynamicState);
		}
		if (!result.changed)
			continue;
		const nextDynamicState = dynamicToStatic ? result.source : result.destination;
		const nextStaticState = dynamicToStatic ? result.destination : result.source;
			targetRecord.state = { ...nextStaticState, connected: true };
			connectedInterfaces.add(targetRecord.id);
			syncRecordVisual(targetRecord);
			try {
				updateDynamicAssemblyBlockData(assembly.dimensionId, assembly.id, block.relative, data => replaceActorDataState(PORTABLE_STORAGE_INTERFACE_BLOCK, data, nextDynamicState));
				transfers++;
				persist();
			} catch (error) {
				failedUpdates++;
				console.warn(`[Create Bedrock] Portable Storage Interface transfer failed: ${error}`);
			}
		}
	}
	for (const record of records.values()) {
		if (record.typeId !== PORTABLE_STORAGE_INTERFACE_BLOCK || !record.state.connected || connectedInterfaces.has(record.id))
			continue;
		record.state = { ...record.state, connected: false };
		syncRecordVisual(record);
	}
	for (const key of lastActorCells.keys())
		if (!activeKeys.has(key))
			lastActorCells.delete(key);
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored contraption actor shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			const record = normalizeRecord(entry);
			records.set(record.id, record);
			syncRecordVisual(record);
		}
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore contraption actor state: ${error}`);
	}
}

export function getContraptionActorDiagnostics() {
	return { deployments, drillBreaks, failedUpdates, harvests, ploughMutations, records: records.size, rollerPlacements, transfers, persistence: store.diagnostics() };
}

export function registerContraptionActors() {
	if (registered)
		return false;
	registered = true;
	for (const [typeId, name] of [
		[CONTRAPTION_CONTROLS_BLOCK, "controls"],
		[DEPLOYER_BLOCK, "deployer"],
		[MECHANICAL_ARM_BLOCK, "mechanical-arm"],
		[MECHANICAL_DRILL_BLOCK, "drill"],
		[MECHANICAL_HARVESTER_BLOCK, "harvester"],
		[MECHANICAL_ROLLER_BLOCK, "roller"],
		[PORTABLE_STORAGE_INTERFACE_BLOCK, "portable-storage-interface"]
	]) {
		registerMovingBlockDataContributor(typeId, name, {
			capture(dimensionId, location) { return captureActorState(typeId, dimensionId, location); },
			detach(dimensionId, location) { return detachActorState(typeId, dimensionId, location); },
			restore(dimensionId, location, state) { return restoreActorState(typeId, dimensionId, location, state); },
			schemaVersion: 1,
			validate(state) { if (state !== undefined) normalizeStateFor(typeId, state); }
		});
	}
	for (const typeId of [MECHANICAL_PLOUGH_BLOCK, PISTON_EXTENSION_POLE_BLOCK])
		registerStatelessMovingBlockDataAdapter(typeId);
	registerKernelTaskGroup(ACTOR_TASK_GROUP, ACTOR_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (ensureRecord(event.block))
			persist();
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			const id = recordId(event.dimension.id, event.block.location);
			if (records.delete(id))
				persist();
		} catch { failedUpdates++; }
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		const record = ensureRecord(event.block);
		if (!record)
			return;
		try {
			if (record.typeId === CONTRAPTION_CONTROLS_BLOCK)
				interactControls(record, event);
			else if (record.typeId === MECHANICAL_ROLLER_BLOCK)
				interactRoller(record, event);
			else if (record.typeId === PORTABLE_STORAGE_INTERFACE_BLOCK)
				interactInterface(record, event);
			else
				interactSingleSlotActor(record, event);
		} catch (error) {
			failedUpdates++;
			event.source?.sendMessage?.(`Contraption actor interaction failed: ${error}`);
		}
	});
	registerTickHandler(() => {
		try { processMovingActors(); } catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Contraption actor tick failed: ${error}`);
		}
		store.tick();
	}, ACTOR_TASK_GROUP);
	system.run(restore);
	return true;
}
