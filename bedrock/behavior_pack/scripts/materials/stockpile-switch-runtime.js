import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { inspectFluidTank } from "../fluids/fluid-runtime.js";
import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	STOCKPILE_SWITCH_BLOCK,
	STOCKPILE_SWITCH_SAMPLE_INTERVAL_TICKS,
	configureStockpileSwitch,
	createStockpileSwitchState,
	measureStockpileFluid,
	measureStockpileInventory,
	normalizeStockpileFilter,
	observeStockpileSwitch,
	stockpileDisplayLevel,
	tickStockpileSwitch,
	unsupportedStockpileObservation,
	validateStockpileSwitchState
} from "./stockpile-switch.js";

const STOCKPILE_SWITCH_TASK_BUDGET = 8;
const STOCKPILE_SWITCH_TASK_GROUP = "stockpile_switch";
const TARGET_DIRECTION_STATE = "createbedrock:target_direction";
const DISPLAY_LEVEL_STATE = "createbedrock:display_level";
const POWERED_STATE = "createbedrock:powered";
const DEFAULT_TARGET_DIRECTION = 2;
const DIRECTIONS = Object.freeze([
	{ face: "down", id: 0, vector: { x: 0, y: -1, z: 0 } },
	{ face: "up", id: 1, vector: { x: 0, y: 1, z: 0 } },
	{ face: "north", id: 2, vector: { x: 0, y: 0, z: -1 } },
	{ face: "south", id: 3, vector: { x: 0, y: 0, z: 1 } },
	{ face: "west", id: 4, vector: { x: -1, y: 0, z: 0 } },
	{ face: "east", id: 5, vector: { x: 1, y: 0, z: 0 } }
]);
const DIRECTION_BY_ID = new Map(DIRECTIONS.map(direction => [direction.id, direction]));
const records = new Map();
let failedUpdates = 0;
let roundRobinAfter;
let runtimeTick = 0;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Stockpile Switch locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Stockpile Switches require a dimension identifier");
	const normalized = assertLocation(location);
	return `stockpile-switch:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	const location = record.location;
	return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:stockpile_switch_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Stockpile Switch state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind !== "stockpile_switch")
			throw new TypeError("Unknown Stockpile Switch persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [...records.values()].map(record => ({
		kind: "stockpile_switch",
		id: record.id,
		dimensionId: record.dimensionId,
		location: clone(record.location),
		state: clone(record.state)
	})).sort((left, right) => left.id.localeCompare(right.id));
}

function persist() {
	try {
		store.request(persistentRecords());
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Stockpile Switches: ${error}`);
	}
}

function isStockpileSwitch(block) {
	return block?.typeId === STOCKPILE_SWITCH_BLOCK;
}

function resolveBlock(record) {
	try {
		return world.getDimension(record.dimensionId).getBlock(record.location);
	} catch {
		return undefined;
	}
}

function targetDirection(block) {
	const candidate = block?.permutation?.getAllStates?.()[TARGET_DIRECTION_STATE];
	return DIRECTION_BY_ID.has(candidate) ? candidate : DEFAULT_TARGET_DIRECTION;
}

function targetBlock(block, directionId = targetDirection(block)) {
	const direction = DIRECTION_BY_ID.get(directionId);
	if (!direction || !block?.dimension)
		return undefined;
	return block.dimension.getBlock({
		x: block.location.x + direction.vector.x,
		y: block.location.y + direction.vector.y,
		z: block.location.z + direction.vector.z
	});
}

function applyStateToBlock(record, block = resolveBlock(record)) {
	if (!isStockpileSwitch(block) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	const desired = {
		[DISPLAY_LEVEL_STATE]: stockpileDisplayLevel(record.state),
		[POWERED_STATE]: record.state.outputPowered ? 1 : 0
	};
	for (const [state, value] of Object.entries(desired)) {
		if (permutation.getAllStates?.()[state] === value)
			continue;
		permutation = permutation.withState(state, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function observationForInventory(block, filterItem) {
	try {
		const container = block?.getComponent?.("minecraft:inventory")?.container;
		if (!container || !Number.isInteger(container.size))
			return undefined;
		const slots = [];
		for (let slot = 0; slot < container.size; slot++) {
			const item = container.getItem(slot);
			slots.push(item && { amount: item.amount, maxAmount: item.maxAmount, typeId: item.typeId });
		}
		return measureStockpileInventory({ filterItem, slots });
	} catch {
		return undefined;
	}
}

function observationForFluid(block, filterItem) {
	try {
		const inspection = inspectFluidTank(block);
		return measureStockpileFluid({ capacity: inspection.capacity, contents: inspection.contents, filterItem });
	} catch {
		return undefined;
	}
}

function observationForTarget(block, filterItem) {
	const inventory = observationForInventory(block, filterItem);
	if (inventory)
		return inventory;
	const fluid = observationForFluid(block, filterItem);
	return fluid ?? unsupportedStockpileObservation();
}

function viewScore(player, direction) {
	try {
		const view = player?.getViewDirection?.();
		if (!view)
			return 0;
		return view.x * direction.vector.x + view.y * direction.vector.y + view.z * direction.vector.z;
	} catch {
		return 0;
	}
}

/** Java chooses an adjacent compatible capability in the player's nearest-look order on placement. */
function selectPlacementTarget(block, player, filterItem) {
	const candidates = DIRECTIONS.map(direction => ({
		direction,
		observation: observationForTarget(targetBlock(block, direction.id), filterItem)
	})).filter(candidate => candidate.observation.kind !== "unsupported");
	if (candidates.length === 0)
		return DEFAULT_TARGET_DIRECTION;
	candidates.sort((left, right) => viewScore(player, right.direction) - viewScore(player, left.direction)
		|| left.direction.id - right.direction.id);
	return candidates[0].direction.id;
}

function setTargetDirection(block, directionId) {
	if (!isStockpileSwitch(block) || !DIRECTION_BY_ID.has(directionId) || typeof block.setPermutation !== "function")
		return false;
	const current = block.permutation.getAllStates?.()[TARGET_DIRECTION_STATE];
	if (current === directionId)
		return false;
	block.setPermutation(block.permutation.withState(TARGET_DIRECTION_STATE, directionId));
	return true;
}

function createRecord(block, player) {
	if (!isStockpileSwitch(block))
		return undefined;
	const location = assertLocation(block.location);
	const id = recordId(block.dimension.id, location);
	const existing = records.get(id);
	if (existing)
		return existing;
	const state = createStockpileSwitchState();
	setTargetDirection(block, selectPlacementTarget(block, player, state.filterItem));
	const record = { dimensionId: block.dimension.id, id, location, state };
	records.set(id, record);
	applyStateToBlock(record, block);
	return record;
}

function refreshRecord(record) {
	const block = resolveBlock(record);
	if (!isStockpileSwitch(block))
		return false;
	const next = observeStockpileSwitch(record.state, observationForTarget(targetBlock(block), record.state.filterItem));
	if (JSON.stringify(next) === JSON.stringify(record.state))
		return false;
	record.state = next;
	applyStateToBlock(record, block);
	return true;
}

function tickRecord(record) {
	let changed = false;
	const ticked = tickStockpileSwitch(record.state);
	if (JSON.stringify(ticked) !== JSON.stringify(record.state)) {
		record.state = ticked;
		changed = true;
	}
	if (runtimeTick % STOCKPILE_SWITCH_SAMPLE_INTERVAL_TICKS === 0)
		changed = refreshRecord(record) || changed;
	if (changed)
		applyStateToBlock(record);
	return changed;
}

function parseAmount(value, label) {
	if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value.trim()))
		throw new TypeError(`${label} must be a whole number`);
	const amount = Number(value.trim());
	if (!Number.isSafeInteger(amount) || amount > 2_147_483_647)
		throw new RangeError(`${label} is outside the supported range`);
	return amount;
}

function sampleSummary(state) {
	if (state.currentLevel === -1)
		return "No compatible item inventory or Create fluid tank is attached.";
	const unit = state.inStacks ? "items (thresholds are shown in stacks)" : "items or mB";
	return `Current: ${state.currentLevel}/${state.currentMaxLevel} ${unit}.`;
}

function configureRecord(record, player, expectedRevision, patch) {
	const result = configureStockpileSwitch({ expectedRevision, patch, state: record.state });
	if (result.conflict) {
		player?.sendMessage?.("These Stockpile Switch settings changed while the form was open. Reopen it and try again.");
		return false;
	}
	if (!result.changed)
		return false;
	record.state = result.state;
	refreshRecord(record);
	applyStateToBlock(record);
	persist();
	return true;
}

function showConfiguration(record, player) {
	const state = record.state;
	const form = new ModalFormData()
		.title("Stockpile Switch Settings")
		.label(`${sampleSummary(state)}\nPublic settings • revision ${state.configurationRevision}`)
		.textField("Filter item (minecraft:air for any)", "minecraft:air", { defaultValue: state.filterItem })
		.textField("Power on at or above", "0..2147483647", { defaultValue: String(state.onWhenAbove) })
		.textField("Power off at or below", "0..2147483647", { defaultValue: String(state.offWhenBelow) })
		.toggle("Measure item thresholds in stacks", { defaultValue: state.inStacks })
		.toggle("Invert redstone output", { defaultValue: state.inverted })
		.submitButton("Save");
	form.show(player).then(response => {
		if (response.canceled)
			return false;
		const values = response.formValues ?? [];
		return configureRecord(record, player, state.configurationRevision, {
			filterItem: normalizeStockpileFilter(String(values[0] ?? "").trim()),
			onWhenAbove: parseAmount(values[1], "Power-on threshold"),
			offWhenBelow: parseAmount(values[2], "Power-off threshold"),
			inStacks: values[3] === true,
			inverted: values[4] === true
		});
	}).then(changed => {
		if (changed)
			player.sendMessage?.("Stockpile Switch settings saved.");
	}).catch(error => {
		player.sendMessage?.(`Could not save Stockpile Switch settings: ${error}`);
	});
}

export function captureStockpileSwitchMovingData(dimensionId, location) {
	const record = records.get(recordId(dimensionId, location));
	return record && { state: clone(record.state) };
}

export function detachStockpileSwitchMovingData(dimensionId, location) {
	if (!records.delete(recordId(dimensionId, location)))
		return false;
	persist();
	return true;
}

export function restoreStockpileSwitchMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore Stockpile Switch state over an existing record: ${id}`);
	const record = { dimensionId, id, location: assertLocation(location), state: validateStockpileSwitchState(data.state) };
	records.set(id, record);
	applyStateToBlock(record);
	persist();
	return true;
}

export function getStockpileSwitchDiagnostics() {
	return {
		active: records.size,
		failedUpdates,
		roundRobinAfter,
		persistence: store.diagnostics()
	};
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Stockpile Switch state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "stockpile_switch" || typeof entry.dimensionId !== "string")
				throw new Error("Stockpile Switch state contains an unknown record");
			const location = assertLocation(entry.location);
			const id = recordId(entry.dimensionId, location);
			if (entry.id !== id)
				throw new Error("Stockpile Switch state has an invalid identity");
			records.set(id, { dimensionId: entry.dimensionId, id, location, state: validateStockpileSwitchState(entry.state) });
		}
		for (const record of records.values())
			applyStateToBlock(record);
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Stockpile Switch state: ${error}`);
	}
}

export function registerStockpileSwitch() {
	registerMovingBlockDataContributor(STOCKPILE_SWITCH_BLOCK, "stockpile_switch", {
		capture: captureStockpileSwitchMovingData,
		detach: detachStockpileSwitchMovingData,
		restore: restoreStockpileSwitchMovingData,
		schemaVersion: 1,
		validate(data) {
			if (!data || typeof data !== "object")
				throw new TypeError("Moving Stockpile Switch data must contain its persistent state");
			validateStockpileSwitchState(data.state);
		}
	});
	registerKernelTaskGroup(STOCKPILE_SWITCH_TASK_GROUP, STOCKPILE_SWITCH_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			const record = createRecord(event.block, event.player);
			if (!record)
				return;
			refreshRecord(record);
			persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not place Stockpile Switch: ${error}`);
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			if (records.delete(recordId(event.dimension.id, event.block.location)))
				persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not remove Stockpile Switch: ${error}`);
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		try {
			const record = createRecord(event.block, event.player);
			if (!record)
				return;
			if (event.itemStack?.typeId) {
				configureRecord(record, event.player, record.state.configurationRevision, { filterItem: event.itemStack.typeId });
				event.player.sendMessage?.(`Stockpile Switch filter set to ${event.itemStack.typeId}.`);
				return;
			}
			showConfiguration(record, event.player);
		} catch (error) {
			failedUpdates++;
			event.player.sendMessage?.(`Could not configure Stockpile Switch: ${error}`);
		}
	});
	registerTickHandler(() => {
		runtimeTick++;
		const ordered = [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
		if (ordered.length === 0)
			return store.tick();
		const start = roundRobinAfter ? Math.max(0, ordered.findIndex(record => record.id > roundRobinAfter)) : 0;
		const selected = [...ordered.slice(start), ...ordered.slice(0, start)].slice(0, STOCKPILE_SWITCH_TASK_BUDGET);
		let changed = false;
		for (const record of selected) {
			roundRobinAfter = record.id;
			changed = tickRecord(record) || changed;
		}
		if (changed)
			persist();
		return store.tick() || changed;
	}, STOCKPILE_SWITCH_TASK_GROUP);
	system.run(restore);
}
