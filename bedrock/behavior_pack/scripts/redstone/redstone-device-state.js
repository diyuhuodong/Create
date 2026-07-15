import { redstoneDeviceForId } from "./redstone-device-catalog.js";
import { normalizeRedstoneLinkFrequency } from "./redstone-link-network.js";

export const REDSTONE_DEVICE_STATE_SCHEMA = 1;
export const DEFAULT_PULSE_TICKS = 20;
export const MAX_CONFIGURED_TICKS = 20 * 60 * 60;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function clampPower(value) {
	if (!Number.isInteger(value) || value < 0 || value > 15)
		throw new RangeError("Redstone device power must be an integer from 0 through 15");
	return value;
}

function clampTicks(value) {
	if (!Number.isInteger(value) || value < 2 || value > MAX_CONFIGURED_TICKS)
		throw new RangeError(`Redstone device timing must be an integer from 2 through ${MAX_CONFIGURED_TICKS}`);
	return value;
}

function assertDevice(kind) {
	const device = redstoneDeviceForId(kind);
	if (!device)
		throw new Error(`Unknown redstone device kind ${kind}`);
	return device;
}

function outputFor(state) {
	return state.output ? 15 : 0;
}

function freshState(kind) {
	assertDevice(kind);
	const defaultTicks = kind === "pulse_timer" ? DEFAULT_PULSE_TICKS : 2;
	return {
		schemaVersion: REDSTONE_DEVICE_STATE_SCHEMA,
		kind,
		inputPower: 0,
		receivedPower: 0,
		lastInputPowered: false,
		output: false,
		pendingPulse: false,
		remainingTicks: 0,
		timerTicks: defaultTicks,
		targetSpeed: 16,
		elapsedTicks: 0,
		channel: 0,
		frequency: ["minecraft:air", "minecraft:air"],
		filterItem: "minecraft:air",
		requestAmount: 64,
		allowPartialRequests: false,
		lastRequestSucceeded: false,
		minimumStock: 1,
		requestNonce: 0,
		mode: "transmitter",
		observedInventory: "",
		displayValue: "0",
		active: false
	};
}

export function createRedstoneDeviceState(kind, patch = {}) {
	const state = { ...freshState(kind), ...clone(patch), kind };
	validateRedstoneDeviceState(state);
	return state;
}

export function validateRedstoneDeviceState(state) {
	if (!state || typeof state !== "object" || Array.isArray(state))
		throw new TypeError("Redstone device state must be an object");
	assertDevice(state.kind);
	if (state.schemaVersion !== REDSTONE_DEVICE_STATE_SCHEMA)
		throw new Error(`Redstone device ${state.kind} must use state schema ${REDSTONE_DEVICE_STATE_SCHEMA}`);
	clampPower(state.inputPower);
	clampPower(state.receivedPower);
	if (typeof state.lastInputPowered !== "boolean" || typeof state.output !== "boolean" || typeof state.pendingPulse !== "boolean" || typeof state.active !== "boolean")
		throw new TypeError(`Redstone device ${state.kind} boolean state is invalid`);
	if (!Number.isInteger(state.remainingTicks) || state.remainingTicks < 0 || state.remainingTicks > MAX_CONFIGURED_TICKS)
		throw new RangeError(`Redstone device ${state.kind} remaining ticks are invalid`);
	clampTicks(state.timerTicks);
	if (!Number.isInteger(state.targetSpeed) || state.targetSpeed < -256 || state.targetSpeed > 256)
		throw new RangeError(`Redstone device ${state.kind} target speed must be an integer from -256 through 256`);
	if (!Number.isInteger(state.elapsedTicks) || state.elapsedTicks < 0 || state.elapsedTicks > MAX_CONFIGURED_TICKS)
		throw new RangeError(`Redstone device ${state.kind} elapsed ticks are invalid`);
	if (!Number.isInteger(state.channel) || state.channel < 0 || state.channel > 15)
		throw new RangeError(`Redstone device ${state.kind} channel must be from 0 through 15`);
	normalizeRedstoneLinkFrequency(state.frequency);
	if (typeof state.filterItem !== "string" || state.filterItem.length === 0 || state.filterItem.length > 128)
		throw new TypeError(`Redstone device ${state.kind} filter item is invalid`);
	if (!Number.isInteger(state.requestAmount) || state.requestAmount < 1 || state.requestAmount > 64)
		throw new RangeError(`Redstone device ${state.kind} request amount must be from 1 through 64`);
	if (typeof state.allowPartialRequests !== "boolean" || typeof state.lastRequestSucceeded !== "boolean")
		throw new TypeError(`Redstone device ${state.kind} request flags are invalid`);
	if (!Number.isInteger(state.minimumStock) || state.minimumStock < 1 || state.minimumStock > 4096)
		throw new RangeError(`Redstone device ${state.kind} stock minimum must be from 1 through 4096`);
	if (!Number.isInteger(state.requestNonce) || state.requestNonce < 0 || state.requestNonce > Number.MAX_SAFE_INTEGER)
		throw new RangeError(`Redstone device ${state.kind} request nonce is invalid`);
	if (!['transmitter', 'receiver'].includes(state.mode))
		throw new Error(`Redstone device ${state.kind} mode is invalid`);
	if (typeof state.observedInventory !== "string" || typeof state.displayValue !== "string")
		throw new TypeError(`Redstone device ${state.kind} text state is invalid`);
	return clone(state);
}

function configured(state, action) {
	if (action.type !== "configure")
		return state;
	const next = { ...state };
	if (action.timerTicks !== undefined)
		next.timerTicks = clampTicks(action.timerTicks);
	if (action.targetSpeed !== undefined) {
		if (!Number.isInteger(action.targetSpeed) || action.targetSpeed < -256 || action.targetSpeed > 256)
			throw new RangeError("Rotation speed controller targets must be integers from -256 through 256");
		next.targetSpeed = action.targetSpeed;
	}
	if (action.channel !== undefined) {
		if (!Number.isInteger(action.channel) || action.channel < 0 || action.channel > 15)
			throw new RangeError("Redstone channels must be integers from 0 through 15");
		next.channel = action.channel;
	}
	if (action.frequency !== undefined)
		next.frequency = normalizeRedstoneLinkFrequency(action.frequency);
	if (action.filterItem !== undefined) {
		if (typeof action.filterItem !== "string" || action.filterItem.length === 0 || action.filterItem.length > 128)
			throw new TypeError("Redstone logistics filters must be non-empty item identifiers");
		next.filterItem = action.filterItem;
	}
	if (action.requestAmount !== undefined) {
		if (!Number.isInteger(action.requestAmount) || action.requestAmount < 1 || action.requestAmount > 64)
			throw new RangeError("Redstone requester amounts must be integers from 1 through 64");
		next.requestAmount = action.requestAmount;
	}
	if (action.minimumStock !== undefined) {
		if (!Number.isInteger(action.minimumStock) || action.minimumStock < 1 || action.minimumStock > 4096)
			throw new RangeError("Stock Link minimums must be integers from 1 through 4096");
		next.minimumStock = action.minimumStock;
	}
	if (action.allowPartialRequests !== undefined) {
		if (typeof action.allowPartialRequests !== "boolean")
			throw new TypeError("Redstone requester partial requests must be boolean");
		next.allowPartialRequests = action.allowPartialRequests;
	}
	if (action.mode !== undefined) {
		if (!['transmitter', 'receiver'].includes(action.mode))
			throw new Error("Redstone link mode must be transmitter or receiver");
		next.mode = action.mode;
	}
	return next;
}

function onInput(state, power) {
	const inputPower = clampPower(power);
	const powered = inputPower > 0;
	const rising = powered && !state.lastInputPowered;
	const next = { ...state, inputPower, lastInputPowered: powered };
	switch (next.kind) {
		case "powered_latch":
			next.output = powered;
			break;
		case "powered_toggle_latch":
			if (rising)
				next.output = !next.output;
			break;
		case "pulse_extender":
			if (rising) {
				next.output = true;
				next.remainingTicks = next.timerTicks;
			}
			break;
		case "pulse_repeater":
			if (rising) {
				next.output = false;
				next.remainingTicks = next.timerTicks;
				next.pendingPulse = true;
			}
			break;
		case "pulse_timer":
			if (powered) {
				next.output = false;
				next.elapsedTicks = 0;
			}
			break;
		case "redstone_link":
			if (next.mode === "transmitter")
				next.output = powered;
			break;
		case "redstone_requester":
			next.active = powered;
			next.output = false;
			break;
		case "rotation_speed_controller":
			next.active = powered;
			break;
		case "display_link":
		case "nixie_tube":
			next.displayValue = String(inputPower);
			break;
		default:
			break;
	}
	return next;
}

function onAction(state, action) {
	const next = configured(state, action);
	if (action.type === "configure")
		return next;
	switch (next.kind) {
		case "analog_lever": {
			if (action.type !== "adjust")
				return next;
			const delta = action.delta === -1 ? -1 : action.delta === 1 ? 1 : undefined;
			if (delta === undefined)
				throw new RangeError("Analog lever adjustments must be -1 or 1");
			next.output = false;
			next.inputPower = Math.max(0, Math.min(15, next.inputPower + delta));
			next.output = next.inputPower > 0;
			next.displayValue = String(next.inputPower);
			return next;
		}
		case "content_observer":
			if (action.type === "observe" && typeof action.inventory !== "string")
				throw new TypeError("Content observer inventory samples must be strings");
			if (action.type === "observe" && action.inventory !== next.observedInventory) {
				next.observedInventory = action.inventory;
				next.output = true;
				next.remainingTicks = 2;
			}
			return next;
		case "crushing_wheel_controller":
			if (action.type === "set_active") {
				next.active = action.active === true;
				next.output = next.active;
			}
			return next;
		case "lectern_controller":
			if (action.type === "trigger") {
				next.output = true;
				next.remainingTicks = 2;
			}
			return next;
		case "redstone_contact":
			if (action.type === "set_contact") {
				next.active = action.active === true;
				next.output = next.active;
			}
			return next;
		case "redstone_link":
			if (action.type === "receive" && next.mode === "receiver") {
				next.receivedPower = clampPower(action.power);
				next.output = next.receivedPower > 0;
			}
			return next;
		case "stock_link":
			if (action.type === "set_stock_available") {
				next.active = action.active === true;
				next.output = next.active;
			}
			return next;
		case "redstone_requester":
			if (action.type === "request_result") {
				if (!Number.isInteger(action.nonce) || action.nonce !== next.requestNonce + 1)
					throw new RangeError("Redstone requester results must advance the persistent request nonce once");
				next.requestNonce = action.nonce;
				next.lastRequestSucceeded = action.success === true;
				next.output = next.lastRequestSucceeded;
			}
			return next;
		default:
			return next;
	}
}

function onTick(state) {
	const next = { ...state };
	if (next.kind === "pulse_timer" && next.inputPower === 0) {
		next.elapsedTicks += 1;
		if (next.elapsedTicks >= next.timerTicks) {
			next.elapsedTicks = 0;
			next.output = true;
			// The remaining-tick countdown is consumed below in the same update.
			// Store two ticks so the output is visible for exactly one full tick.
			next.remainingTicks = 2;
		}
	}
	if (next.remainingTicks > 0) {
		next.remainingTicks -= 1;
		if (next.remainingTicks === 0) {
			if (next.kind === "pulse_repeater" && next.pendingPulse) {
				next.output = true;
				next.remainingTicks = 1;
				next.pendingPulse = false;
			} else
				next.output = false;
		}
	}
	return next;
}

/** Apply exactly one deterministic event to a device state. */
export function transitionRedstoneDevice(state, action) {
	const current = validateRedstoneDeviceState(state);
	if (!action || typeof action.type !== "string")
		throw new TypeError("Redstone device actions require a type");
	let next;
	if (action.type === "input")
		next = onInput(current, action.power);
	else if (action.type === "tick")
		next = onTick(current);
	else
		next = onAction(current, action);
	return validateRedstoneDeviceState(next);
}

export function nativeOutputPower(state) {
	const normalized = validateRedstoneDeviceState(state);
	if (normalized.kind === "analog_lever")
		return normalized.inputPower;
	if (normalized.kind === "redstone_link")
		return normalized.mode === "transmitter" ? normalized.inputPower : normalized.receivedPower;
	return outputFor(normalized);
}
