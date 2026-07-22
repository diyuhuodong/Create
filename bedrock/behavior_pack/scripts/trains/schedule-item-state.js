import {
	createScheduleAst,
	legacyScheduleView,
	migrateLegacySchedule,
	normalizeScheduleAst,
	updateScheduleAst
} from "./schedule-ast.js";

export const MAX_SCHEDULE_DWELL_TICKS = 72_000;
export const MAX_SCHEDULE_STOPS = 16;
export const SCHEDULE_ITEM = "createbedrock:schedule";
export const SCHEDULE_ITEM_STATE_PROPERTY = "createbedrock:schedule_state";
export const SCHEDULE_ITEM_STATE_SCHEMA = 2;

function normalizeStopId(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 128)
		throw new TypeError("Schedule stops must be short non-empty track node ids");
	return value;
}

function normalizeLegacyInput(value = {}) {
	const cyclic = value.cyclic ?? true;
	const stopValues = value.stopIds ?? [];
	if (!Number.isInteger(value.revision ?? 0) || value.revision < 0 || !Number.isInteger(value.dwellTicks ?? 20)
		|| value.dwellTicks < 0 || value.dwellTicks > MAX_SCHEDULE_DWELL_TICKS)
		throw new TypeError("Schedule item state has invalid revision or dwell time");
	if (typeof cyclic !== "boolean")
		throw new TypeError("Schedule item cycle flag must be a boolean");
	if (!Array.isArray(stopValues) || stopValues.length > MAX_SCHEDULE_STOPS)
		throw new RangeError(`Schedules may contain at most ${MAX_SCHEDULE_STOPS} stops`);
	const stopIds = stopValues.map(normalizeStopId);
	if (new Set(stopIds).size !== stopIds.length)
		throw new TypeError("Schedules may not contain duplicate stops");
	return { cyclic, dwellTicks: value.dwellTicks ?? 20, revision: value.revision ?? 0, stopIds };
}

function materializeItemState(schedule) {
	schedule = normalizeScheduleAst(schedule);
	const legacy = legacyScheduleView(schedule);
	if (legacy.stopIds.length > MAX_SCHEDULE_STOPS)
		throw new RangeError(`Schedules may contain at most ${MAX_SCHEDULE_STOPS} exact station stops`);
	return {
		...legacy,
		schedule,
		schemaVersion: SCHEDULE_ITEM_STATE_SCHEMA
	};
}

export function createScheduleItemState(patch = {}) {
	if (patch?.schedule)
		return materializeItemState(patch.schedule);
	const legacy = normalizeLegacyInput(patch);
	return materializeItemState(migrateLegacySchedule(legacy));
}

export function validateScheduleItemState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Schedule item state must be an object");
	if (value.schemaVersion === 1)
		return createScheduleItemState(normalizeLegacyInput(value));
	if (value.schemaVersion !== SCHEDULE_ITEM_STATE_SCHEMA)
		throw new TypeError(`Schedule item state must use schema ${SCHEDULE_ITEM_STATE_SCHEMA}`);
	return materializeItemState(value.schedule);
}

export function readScheduleItemState(itemStack) {
	if (!itemStack || typeof itemStack.getDynamicProperty !== "function" || itemStack.typeId !== SCHEDULE_ITEM)
		throw new TypeError("Schedule state requires a Schedule ItemStack");
	const serialized = itemStack.getDynamicProperty(SCHEDULE_ITEM_STATE_PROPERTY);
	if (serialized === undefined || serialized === "")
		return createScheduleItemState();
	if (typeof serialized !== "string" || serialized.length > 32_768)
		throw new TypeError("Schedule item state must be a bounded JSON string");
	return validateScheduleItemState(JSON.parse(serialized));
}

export function writeScheduleItemState(itemStack, state) {
	if (!itemStack || typeof itemStack.setDynamicProperty !== "function" || itemStack.typeId !== SCHEDULE_ITEM)
		throw new TypeError("Schedule state requires a Schedule ItemStack");
	itemStack.setDynamicProperty(SCHEDULE_ITEM_STATE_PROPERTY, JSON.stringify(validateScheduleItemState(state)));
	return itemStack;
}

export function replaceScheduleItemAst(state, schedule, expectedRevision = validateScheduleItemState(state).revision) {
	const current = validateScheduleItemState(state);
	if (current.revision !== expectedRevision)
		return { changed: false, reason: "revision_conflict", state: current };
	schedule = normalizeScheduleAst(schedule);
	return { changed: true, state: materializeItemState(createScheduleAst({ ...schedule, revision: current.revision + 1 })) };
}

export function updateScheduleItemState(state, expectedRevision, updater) {
	const current = validateScheduleItemState(state);
	const result = updateScheduleAst(current.schedule, expectedRevision, updater);
	return result.ok
		? { changed: true, state: materializeItemState(result.schedule) }
		: { changed: false, reason: result.reason, state: current };
}

export function appendScheduleStop(state, stopId) {
	const current = validateScheduleItemState(state);
	stopId = normalizeStopId(stopId);
	if (current.stopIds.includes(stopId))
		return { changed: false, state: current };
	if (current.stopIds.length >= MAX_SCHEDULE_STOPS)
		throw new RangeError(`Schedules may contain at most ${MAX_SCHEDULE_STOPS} stops`);
	return updateScheduleItemState(current, current.revision, schedule => createScheduleAst({
		...schedule,
		entries: [...schedule.entries, {
			conditionBranches: [[{ ticks: current.dwellTicks, type: "delay" }]],
			instruction: { exact: true, filter: stopId, type: "destination" }
		}]
	}));
}

export function toggleScheduleCycle(state) {
	const current = validateScheduleItemState(state);
	return updateScheduleItemState(current, current.revision, schedule => createScheduleAst({ ...schedule, cyclic: !schedule.cyclic })).state;
}
