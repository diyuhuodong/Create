export const SCHEDULE_AST_SCHEMA_VERSION = 2;
export const MAX_SCHEDULE_ENTRIES = 64;
export const MAX_SCHEDULE_BRANCHES = 8;
export const MAX_SCHEDULE_CONDITIONS_PER_BRANCH = 8;

export const SCHEDULE_INSTRUCTION_TYPES = Object.freeze(["destination", "package_delivery", "package_retrieval", "rename", "throttle"]);
export const SCHEDULE_CONDITION_TYPES = Object.freeze(["delay", "time_of_day", "fluid_threshold", "item_threshold", "redstone_link", "player_count", "idle", "unloaded", "powered"]);

function boundedString(value, label, maximum = 128, { empty = false } = {}) {
	if (typeof value !== "string" || !empty && value.length === 0 || value.length > maximum)
		throw new TypeError(`${label} must be ${empty ? "a" : "a non-empty"} string of at most ${maximum} characters`);
	return value;
}

function nonNegativeInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isInteger(value) || value < 0 || value > maximum)
		throw new RangeError(`${label} must be an integer between zero and ${maximum}`);
	return value;
}

function operator(value) {
	if (!["gte", "lte"].includes(value))
		throw new RangeError("Schedule threshold operators must be gte or lte");
	return value;
}

function boolean(value, label, fallback) {
	value ??= fallback;
	if (typeof value !== "boolean")
		throw new TypeError(`${label} must be a boolean`);
	return value;
}

export function normalizeScheduleInstruction(value) {
	if (!value || !SCHEDULE_INSTRUCTION_TYPES.includes(value.type))
		throw new TypeError("Unknown Schedule instruction");
	switch (value.type) {
		case "destination": return { exact: !!value.exact, filter: boundedString(value.filter, "Schedule destination filter", 128), type: value.type };
		case "package_delivery":
		case "package_retrieval": return { address: boundedString(value.address ?? "", "Schedule package address", 64, { empty: true }), type: value.type };
		case "rename": return { title: boundedString(value.title ?? "", "Schedule title", 64, { empty: true }), type: value.type };
		case "throttle": {
			if (!Number.isInteger(value.percent) || value.percent < 5 || value.percent > 100)
				throw new RangeError("Schedule throttle must be between 5 and 100 percent");
			return { percent: value.percent, type: value.type };
		}
	}
}

export function normalizeScheduleCondition(value) {
	if (!value || !SCHEDULE_CONDITION_TYPES.includes(value.type))
		throw new TypeError("Unknown Schedule wait condition");
	switch (value.type) {
		case "delay": return { ticks: nonNegativeInteger(value.ticks, "Schedule delay", 72_000), type: value.type };
		case "time_of_day": return { hour: nonNegativeInteger(value.hour, "Schedule hour", 23), minute: nonNegativeInteger(value.minute ?? 0, "Schedule minute", 59), rotation: nonNegativeInteger(value.rotation ?? 0, "Schedule day rotation", 7), type: value.type };
		case "fluid_threshold": return { amount: nonNegativeInteger(value.amount, "Schedule fluid amount", 1_000_000), fluidId: boundedString(value.fluidId, "Schedule fluid id"), operator: operator(value.operator ?? "gte"), type: value.type };
		case "item_threshold": return { count: nonNegativeInteger(value.count, "Schedule item count", 1_000_000), filter: boundedString(value.filter, "Schedule item filter"), operator: operator(value.operator ?? "gte"), type: value.type };
		case "redstone_link": return { frequencyA: boundedString(value.frequencyA, "Schedule first Redstone Link frequency", 128), frequencyB: boundedString(value.frequencyB, "Schedule second Redstone Link frequency", 128), powered: boolean(value.powered, "Schedule Redstone Link power state", true), type: value.type };
		case "player_count": return { count: nonNegativeInteger(value.count, "Schedule player count", 128), operator: operator(value.operator ?? "gte"), type: value.type };
		case "idle": return { ticks: nonNegativeInteger(value.ticks ?? 100, "Schedule idle time", 72_000), type: value.type };
		case "unloaded": return { type: value.type };
		case "powered": return { powered: boolean(value.powered, "Schedule station power state", true), type: value.type };
	}
}

export function normalizeScheduleEntry(value) {
	if (!value || !Array.isArray(value.conditionBranches))
		throw new TypeError("Schedule entries require condition branches");
	if (value.conditionBranches.length > MAX_SCHEDULE_BRANCHES)
		throw new RangeError(`Schedule entries support at most ${MAX_SCHEDULE_BRANCHES} condition branches`);
	const conditionBranches = value.conditionBranches.map(branch => {
		if (!Array.isArray(branch) || branch.length > MAX_SCHEDULE_CONDITIONS_PER_BRANCH)
			throw new RangeError(`Schedule branches support at most ${MAX_SCHEDULE_CONDITIONS_PER_BRANCH} conditions`);
		return branch.map(normalizeScheduleCondition);
	});
	return { conditionBranches, instruction: normalizeScheduleInstruction(value.instruction) };
}

export function createScheduleAst({ cyclic = true, entries = [], revision = 0, savedProgress = 0 } = {}) {
	if (typeof cyclic !== "boolean" || !Array.isArray(entries) || entries.length > MAX_SCHEDULE_ENTRIES)
		throw new TypeError(`Schedules require a cyclic flag and at most ${MAX_SCHEDULE_ENTRIES} entries`);
	if (!Number.isInteger(revision) || revision < 0 || !Number.isInteger(savedProgress) || savedProgress < 0 || savedProgress > entries.length)
		throw new RangeError("Schedule revisions and saved progress must be bounded non-negative integers");
	return { cyclic, entries: entries.map(normalizeScheduleEntry), revision, savedProgress, schemaVersion: SCHEDULE_AST_SCHEMA_VERSION };
}

export function normalizeScheduleAst(value) {
	if (value?.schemaVersion !== SCHEDULE_AST_SCHEMA_VERSION)
		throw new TypeError(`Schedule AST must use schema ${SCHEDULE_AST_SCHEMA_VERSION}`);
	return createScheduleAst(value);
}

export function migrateLegacySchedule({ cyclic = true, dwellTicks = 20, revision = 0, stopIds = [] } = {}) {
	if (!Array.isArray(stopIds) || stopIds.some(stopId => typeof stopId !== "string" || stopId.length === 0))
		throw new TypeError("Legacy Schedule stops must be non-empty ids");
	return createScheduleAst({
		cyclic,
		entries: stopIds.map(stopId => ({
			conditionBranches: [[{ ticks: nonNegativeInteger(dwellTicks, "Legacy Schedule dwell", 72_000), type: "delay" }]],
			instruction: { exact: true, filter: stopId, type: "destination" }
		})),
		revision
	});
}

export function legacyScheduleView(value) {
	const schedule = normalizeScheduleAst(value);
	const destinations = schedule.entries.filter(entry => entry.instruction.type === "destination");
	return {
		cyclic: schedule.cyclic,
		dwellTicks: destinations[0]?.conditionBranches?.[0]?.[0]?.type === "delay" ? destinations[0].conditionBranches[0][0].ticks : 0,
		revision: schedule.revision,
		stopIds: destinations.filter(entry => entry.instruction.exact).map(entry => entry.instruction.filter)
	};
}

export function updateScheduleAst(value, expectedRevision, updater) {
	const schedule = normalizeScheduleAst(value);
	if (!Number.isInteger(expectedRevision) || expectedRevision !== schedule.revision)
		return { current: schedule, ok: false, reason: "revision_conflict" };
	if (typeof updater !== "function")
		throw new TypeError("Schedule AST updates require an updater");
	const copy = typeof structuredClone === "function" ? structuredClone(schedule) : JSON.parse(JSON.stringify(schedule));
	const next = normalizeScheduleAst(updater(copy));
	return { ok: true, schedule: createScheduleAst({ ...next, revision: schedule.revision + 1 }) };
}
