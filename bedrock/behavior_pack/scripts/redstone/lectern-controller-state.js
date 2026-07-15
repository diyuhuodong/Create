import { LINKED_CONTROLLER_CHANNELS, normalizeLinkedControllerBindings } from "./linked-controller-bindings.js";
import { validateLinkedControllerItemState } from "./linked-controller-item-state.js";

export const LECTERN_CONTROLLER_STATE_SCHEMA = 1;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function normalizePlayerId(value) {
	if (value === undefined || value === null || value === "")
		return "";
	if (typeof value !== "string" || value.length > 128)
		throw new TypeError("Lectern Controller player identifiers must be short strings");
	return value;
}

function validateTick(value) {
	if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
		throw new RangeError("Lectern Controller session ticks must be non-negative safe integers");
	return value;
}

export function createLecternControllerState(patch = {}) {
	return validateLecternControllerState({
		activeUntilTick: 0,
		activeUserId: "",
		controller: null,
		schemaVersion: LECTERN_CONTROLLER_STATE_SCHEMA,
		...clone(patch)
	});
}

/** Missing data is the safe R0-to-R1 migration path for existing lecterns. */
export function normalizeLecternControllerState(value) {
	return value === undefined || value === null ? createLecternControllerState() : validateLecternControllerState(value);
}

export function validateLecternControllerState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Lectern Controller state must be an object");
	if (value.schemaVersion !== LECTERN_CONTROLLER_STATE_SCHEMA)
		throw new Error(`Lectern Controller state must use schema ${LECTERN_CONTROLLER_STATE_SCHEMA}`);
	const controller = value.controller === null ? null : validateLinkedControllerItemState(value.controller);
	normalizePlayerId(value.activeUserId);
	validateTick(value.activeUntilTick);
	if ((value.activeUserId === "") !== (value.activeUntilTick === 0))
		throw new Error("Lectern Controller sessions must have both a user and an expiry, or neither");
	return {
		activeUntilTick: value.activeUntilTick,
		activeUserId: value.activeUserId,
		controller,
		schemaVersion: LECTERN_CONTROLLER_STATE_SCHEMA
	};
}

export function installLecternController({ controller, state }) {
	const current = normalizeLecternControllerState(state);
	if (current.controller)
		return { changed: false, reason: "controller_already_installed", state: current };
	return {
		changed: true,
		state: { ...current, controller: validateLinkedControllerItemState(controller) }
	};
}

export function beginLecternControllerUse({ playerId, state, tick, timeoutTicks = 20 * 60 }) {
	const current = normalizeLecternControllerState(state);
	const user = normalizePlayerId(playerId);
	validateTick(tick);
	if (!current.controller)
		return { changed: false, reason: "no_controller", state: current };
	if (!Number.isInteger(timeoutTicks) || timeoutTicks < 1 || timeoutTicks > 20 * 60 * 10)
		throw new RangeError("Lectern Controller session timeouts must be practical positive tick counts");
	const occupied = current.activeUserId !== "" && current.activeUntilTick > tick && current.activeUserId !== user;
	if (occupied)
		return { changed: false, reason: "in_use", state: current };
	return {
		changed: current.activeUserId !== user || current.activeUntilTick !== tick + timeoutTicks,
		state: { ...current, activeUntilTick: tick + timeoutTicks, activeUserId: user }
	};
}

export function triggerLecternControllerChannel({ channel, playerId, state, tick }) {
	const current = normalizeLecternControllerState(state);
	const user = normalizePlayerId(playerId);
	validateTick(tick);
	if (!Number.isInteger(channel) || channel < 0 || channel >= LINKED_CONTROLLER_CHANNELS)
		throw new RangeError(`Lectern Controller channels must be from 0 through ${LINKED_CONTROLLER_CHANNELS - 1}`);
	if (!current.controller)
		return { changed: false, reason: "no_controller", state: current };
	if (current.activeUserId !== user || current.activeUntilTick <= tick)
		return { changed: false, reason: "not_active_user", state: current };
	return {
		changed: false,
		frequency: normalizeLinkedControllerBindings(current.controller.channels)[channel],
		state: current
	};
}

export function endLecternControllerUse({ playerId, state }) {
	const current = normalizeLecternControllerState(state);
	const user = normalizePlayerId(playerId);
	if (current.activeUserId !== user)
		return { changed: false, state: current };
	return {
		changed: true,
		state: { ...current, activeUntilTick: 0, activeUserId: "" }
	};
}

/** A form cannot survive a restart, so restored sessions must fail closed. */
export function clearLecternControllerSession(state) {
	const current = normalizeLecternControllerState(state);
	if (current.activeUserId === "")
		return current;
	return { ...current, activeUntilTick: 0, activeUserId: "" };
}
