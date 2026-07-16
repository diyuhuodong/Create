export const STOCKPILE_SWITCH_BLOCK = "createbedrock:stockpile_switch";
export const STOCKPILE_SWITCH_SCHEMA = 1;
export const STOCKPILE_SWITCH_OUTPUT_DELAY_TICKS = 2;
export const STOCKPILE_SWITCH_SAMPLE_INTERVAL_TICKS = 10;

const MAX_STOCKPILE_AMOUNT = 2_147_483_647;
const ITEM_IDENTIFIER = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertAmount(name, value, { allowUnknown = false } = {}) {
	if (allowUnknown && value === -1)
		return value;
	if (!Number.isSafeInteger(value) || value < 0 || value > MAX_STOCKPILE_AMOUNT)
		throw new RangeError(`Stockpile Switch ${name} must be an integer from 0 through ${MAX_STOCKPILE_AMOUNT}`);
	return value;
}

function assertBoolean(name, value) {
	if (typeof value !== "boolean")
		throw new TypeError(`Stockpile Switch ${name} must be true or false`);
	return value;
}

export function normalizeStockpileFilter(value) {
	if (typeof value !== "string" || !ITEM_IDENTIFIER.test(value) || value.length > 128)
		throw new TypeError("Stockpile Switch filters must be namespaced Bedrock identifiers");
	return value;
}

function validateThresholds(offWhenBelow, onWhenAbove) {
	assertAmount("lower threshold", offWhenBelow);
	assertAmount("upper threshold", onWhenAbove);
	if (offWhenBelow > onWhenAbove)
		throw new RangeError("Stockpile Switch lower threshold cannot exceed its upper threshold");
}

function desiredOutput(state) {
	return state.inverted ? !state.thresholdState : state.thresholdState;
}

function queueOutput(state) {
	const output = desiredOutput(state);
	if (output === state.outputPowered)
		return { ...state, pendingOutputPowered: output, pendingOutputTicks: 0 };
	return {
		...state,
		pendingOutputPowered: output,
		pendingOutputTicks: STOCKPILE_SWITCH_OUTPUT_DELAY_TICKS
	};
}

export function createStockpileSwitchState(patch = {}) {
	return validateStockpileSwitchState({
		schemaVersion: STOCKPILE_SWITCH_SCHEMA,
		configurationRevision: 0,
		filterItem: "minecraft:air",
		inStacks: false,
		inverted: false,
		offWhenBelow: 64,
		onWhenAbove: 128,
		currentMinLevel: -1,
		currentLevel: -1,
		currentMaxLevel: -1,
		thresholdState: false,
		outputPowered: false,
		pendingOutputPowered: false,
		pendingOutputTicks: 0,
		...clone(patch)
	});
}

export function validateStockpileSwitchState(state) {
	if (!state || typeof state !== "object" || Array.isArray(state))
		throw new TypeError("Stockpile Switch state must be an object");
	if (state.schemaVersion !== STOCKPILE_SWITCH_SCHEMA)
		throw new Error(`Stockpile Switch state must use schema ${STOCKPILE_SWITCH_SCHEMA}`);
	if (!Number.isSafeInteger(state.configurationRevision) || state.configurationRevision < 0)
		throw new RangeError("Stockpile Switch configuration revisions must be non-negative safe integers");
	normalizeStockpileFilter(state.filterItem);
	assertBoolean("stack unit", state.inStacks);
	assertBoolean("inversion", state.inverted);
	validateThresholds(state.offWhenBelow, state.onWhenAbove);
	assertAmount("current minimum", state.currentMinLevel, { allowUnknown: true });
	assertAmount("current level", state.currentLevel, { allowUnknown: true });
	assertAmount("current maximum", state.currentMaxLevel, { allowUnknown: true });
	if ((state.currentMinLevel === -1 || state.currentLevel === -1 || state.currentMaxLevel === -1)
		&& !(state.currentMinLevel === -1 && state.currentLevel === -1 && state.currentMaxLevel === -1))
		throw new RangeError("Stockpile Switch unknown readings must use -1 for every level");
	if (state.currentLevel !== -1 && (state.currentMinLevel > state.currentLevel || state.currentLevel > state.currentMaxLevel))
		throw new RangeError("Stockpile Switch readings must be within the observed range");
	assertBoolean("threshold state", state.thresholdState);
	assertBoolean("output state", state.outputPowered);
	assertBoolean("pending output state", state.pendingOutputPowered);
	if (!Number.isInteger(state.pendingOutputTicks) || state.pendingOutputTicks < 0 || state.pendingOutputTicks > STOCKPILE_SWITCH_OUTPUT_DELAY_TICKS)
		throw new RangeError("Stockpile Switch pending output ticks are invalid");
	return clone(state);
}

export function stockpileDisplayLevel(state) {
	const normalized = validateStockpileSwitchState(state);
	if (normalized.currentLevel <= 0)
		return 0;
	if (normalized.currentMaxLevel === normalized.currentMinLevel)
		return 5;
	const normalizedLevel = (normalized.currentLevel - normalized.currentMinLevel)
		/ (normalized.currentMaxLevel - normalized.currentMinLevel);
	return Math.max(1, Math.min(5, Math.floor(1 + normalizedLevel * 4)));
}

export function stockpileFilterMatches(filterItem, typeId) {
	return filterItem === "minecraft:air" || filterItem === typeId;
}

/** Convert Script API inventory stacks into the same amount/range sample used by Java's item handler. */
export function measureStockpileInventory({ filterItem = "minecraft:air", slots, defaultCapacity = 64 } = {}) {
	normalizeStockpileFilter(filterItem);
	assertAmount("default item-slot capacity", defaultCapacity);
	if (!Array.isArray(slots))
		throw new TypeError("Stockpile Switch inventory readings require an array of slots");
	let current = 0;
	let maximum = 0;
	for (const stack of slots) {
		if (stack === undefined || stack === null) {
			maximum += defaultCapacity;
			continue;
		}
		const amount = assertAmount("item amount", stack.amount);
		const capacity = assertAmount("item-slot capacity", stack.maxAmount ?? defaultCapacity);
		if (amount > capacity)
			throw new RangeError("Stockpile Switch item amount cannot exceed its slot capacity");
		maximum += capacity;
		if (stockpileFilterMatches(filterItem, stack.typeId))
			current += amount;
	}
	return { current, kind: "item", maximum, minimum: 0 };
}

export function measureStockpileFluid({ capacity, contents, filterItem = "minecraft:air" } = {}) {
	normalizeStockpileFilter(filterItem);
	const maximum = assertAmount("fluid capacity", capacity);
	if (contents === undefined || contents === null)
		return { current: 0, kind: "fluid", maximum, minimum: 0 };
	const amount = assertAmount("fluid amount", contents.amount);
	if (amount > maximum)
		throw new RangeError("Stockpile Switch fluid amount cannot exceed its capacity");
	return {
		current: stockpileFilterMatches(filterItem, contents.typeId) ? amount : 0,
		kind: "fluid",
		maximum,
		minimum: 0
	};
}

export function unsupportedStockpileObservation() {
	return { kind: "unsupported", current: -1, maximum: -1, minimum: -1 };
}

export function observeStockpileSwitch(state, observation) {
	const current = validateStockpileSwitchState(state);
	if (!observation || typeof observation !== "object")
		throw new TypeError("Stockpile Switch observations must be objects");
	if (observation.kind === "unsupported") {
		return queueOutput({
			...current,
			currentMinLevel: -1,
			currentLevel: -1,
			currentMaxLevel: -1,
			thresholdState: false
		});
	}
	if (!["item", "fluid", "custom"].includes(observation.kind))
		throw new Error("Stockpile Switch observations must be item, fluid, custom, or unsupported");
	const minimum = assertAmount("observed minimum", observation.minimum);
	const maximum = assertAmount("observed maximum", observation.maximum);
	const level = assertAmount("observed level", observation.current);
	if (minimum > level || level > maximum)
		throw new RangeError("Stockpile Switch observed level must fit inside its range");
	let thresholdState = current.thresholdState;
	if (thresholdState && level <= current.offWhenBelow)
		thresholdState = false;
	else if (!thresholdState && level >= current.onWhenAbove)
		thresholdState = true;
	return queueOutput({
		...current,
		currentMinLevel: minimum,
		currentLevel: level,
		currentMaxLevel: maximum,
		thresholdState
	});
}

/** The Java block uses a scheduled two-tick block update before exposing its new redstone power. */
export function tickStockpileSwitch(state) {
	const current = validateStockpileSwitchState(state);
	if (current.pendingOutputTicks === 0)
		return current;
	const pendingOutputTicks = current.pendingOutputTicks - 1;
	return {
		...current,
		outputPowered: pendingOutputTicks === 0 ? current.pendingOutputPowered : current.outputPowered,
		pendingOutputTicks
	};
}

export function configureStockpileSwitch({ expectedRevision, patch, state }) {
	const current = validateStockpileSwitchState(state);
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
		throw new RangeError("Stockpile Switch edits require a non-negative expected revision");
	if (expectedRevision !== current.configurationRevision)
		return { changed: false, conflict: true, state: current };
	if (!patch || typeof patch !== "object" || Array.isArray(patch))
		throw new TypeError("Stockpile Switch edits require an object patch");
	const permitted = new Set(["filterItem", "inStacks", "inverted", "offWhenBelow", "onWhenAbove"]);
	for (const key of Object.keys(patch))
		if (!permitted.has(key))
			throw new Error(`Stockpile Switch does not support configuration field ${key}`);
	const next = {
		...current,
		...(patch.filterItem === undefined ? {} : { filterItem: normalizeStockpileFilter(patch.filterItem) }),
		...(patch.inStacks === undefined ? {} : { inStacks: assertBoolean("stack unit", patch.inStacks) }),
		...(patch.inverted === undefined ? {} : { inverted: assertBoolean("inversion", patch.inverted) }),
		...(patch.offWhenBelow === undefined ? {} : { offWhenBelow: assertAmount("lower threshold", patch.offWhenBelow) }),
		...(patch.onWhenAbove === undefined ? {} : { onWhenAbove: assertAmount("upper threshold", patch.onWhenAbove) })
	};
	validateThresholds(next.offWhenBelow, next.onWhenAbove);
	if (JSON.stringify(next) === JSON.stringify(current))
		return { changed: false, conflict: false, state: current };
	next.configurationRevision++;
	// Java applies a changed inversion immediately through setInverted().
	if (patch.inverted !== undefined) {
		next.outputPowered = desiredOutput(next);
		next.pendingOutputPowered = next.outputPowered;
		next.pendingOutputTicks = 0;
	}
	return { changed: true, conflict: false, state: validateStockpileSwitchState(next) };
}
