export const MAX_SCHEDULE_DWELL_TICKS = 72_000;
export const MAX_SCHEDULE_STOPS = 16;
export const SCHEDULE_ITEM = "createbedrock:schedule";
export const SCHEDULE_ITEM_STATE_PROPERTY = "createbedrock:schedule_state";
export const SCHEDULE_ITEM_STATE_SCHEMA = 1;

function normalizeStopId(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 128)
		throw new TypeError("Schedule stops must be short non-empty track node ids");
	return value;
}

export function createScheduleItemState(patch = {}) {
	return validateScheduleItemState({ cyclic: true, dwellTicks: 20, revision: 0, schemaVersion: SCHEDULE_ITEM_STATE_SCHEMA, stopIds: [], ...patch });
}

export function validateScheduleItemState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== SCHEDULE_ITEM_STATE_SCHEMA)
		throw new TypeError(`Schedule item state must use schema ${SCHEDULE_ITEM_STATE_SCHEMA}`);
	if (!Number.isInteger(value.revision) || value.revision < 0 || !Number.isInteger(value.dwellTicks) || value.dwellTicks < 0 || value.dwellTicks > MAX_SCHEDULE_DWELL_TICKS)
		throw new TypeError("Schedule item state has invalid revision or dwell time");
	if (!Array.isArray(value.stopIds) || value.stopIds.length > MAX_SCHEDULE_STOPS)
		throw new RangeError(`Schedules may contain at most ${MAX_SCHEDULE_STOPS} stops`);
	const stopIds = value.stopIds.map(normalizeStopId);
	if (new Set(stopIds).size !== stopIds.length)
		throw new TypeError("Schedules may not contain duplicate stops");
	return { cyclic: !!value.cyclic, dwellTicks: value.dwellTicks, revision: value.revision, schemaVersion: SCHEDULE_ITEM_STATE_SCHEMA, stopIds };
}

export function readScheduleItemState(itemStack) {
	if (!itemStack || typeof itemStack.getDynamicProperty !== "function" || itemStack.typeId !== SCHEDULE_ITEM)
		throw new TypeError("Schedule state requires a Schedule ItemStack");
	const serialized = itemStack.getDynamicProperty(SCHEDULE_ITEM_STATE_PROPERTY);
	if (serialized === undefined || serialized === "")
		return createScheduleItemState();
	if (typeof serialized !== "string" || serialized.length > 4096)
		throw new TypeError("Schedule item state must be a short JSON string");
	return validateScheduleItemState(JSON.parse(serialized));
}

export function writeScheduleItemState(itemStack, state) {
	if (!itemStack || typeof itemStack.setDynamicProperty !== "function" || itemStack.typeId !== SCHEDULE_ITEM)
		throw new TypeError("Schedule state requires a Schedule ItemStack");
	itemStack.setDynamicProperty(SCHEDULE_ITEM_STATE_PROPERTY, JSON.stringify(validateScheduleItemState(state)));
	return itemStack;
}

export function appendScheduleStop(state, stopId) {
	const current = validateScheduleItemState(state);
	stopId = normalizeStopId(stopId);
	if (current.stopIds.includes(stopId))
		return { changed: false, state: current };
	return { changed: true, state: validateScheduleItemState({ ...current, revision: current.revision + 1, stopIds: [...current.stopIds, stopId] }) };
}

export function toggleScheduleCycle(state) {
	const current = validateScheduleItemState(state);
	return validateScheduleItemState({ ...current, cyclic: !current.cyclic, revision: current.revision + 1 });
}
