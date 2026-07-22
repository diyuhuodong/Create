import { redstoneDeviceForId } from "./redstone-device-catalog.js";
import { normalizeLogisticsAddress, normalizeLogisticsNetworkId } from "../logistics/logistics-address.js";
import { applyVersionedConfiguration, normalizeConfigurationEditorId } from "../kernel/configuration-protocol.js";
import { DISPLAY_SOURCE_KINDS } from "./display-source.js";
import { normalizeRedstoneLinkFrequency } from "./redstone-link-network.js";
import { transitionRedstoneDevice, validateRedstoneDeviceState } from "./redstone-device-state.js";

/**
 * Separates user-edited settings from simulation state. Create devices are
 * deliberately public: a second editor is allowed, but a stale form cannot
 * overwrite a configuration saved by somebody else in the meantime.
 */
export const REDSTONE_DEVICE_CONFIGURATION_SCHEMA = 1;

const FIELD_SETS = Object.freeze({
	content_observer: [{ key: "filterItem", label: "Observed item (minecraft:air for any)", type: "item" }],
	display_link: [
		{ defaultValue: "redstone_power", key: "sourceKind", label: "Source type", options: DISPLAY_SOURCE_KINDS, storage: "settings", type: "enum" },
		{ defaultValue: "create", key: "scoreboardObjective", label: "Scoreboard objective", maxLength: 64, storage: "settings", type: "text" },
		{ defaultValue: "", key: "computerText", label: "Computer text (use | for lines)", maxLength: 256, storage: "settings", type: "text" },
		{ defaultValue: 0, key: "sourceOffsetX", label: "Source offset X", max: 64, min: -64, storage: "settings", type: "integer" },
		{ defaultValue: 0, key: "sourceOffsetY", label: "Source offset Y", max: 64, min: -64, storage: "settings", type: "integer" },
		{ defaultValue: -1, key: "sourceOffsetZ", label: "Source offset Z", max: 64, min: -64, storage: "settings", type: "integer" },
		{ defaultValue: 0, key: "targetOffsetX", label: "Target offset X", max: 64, min: -64, storage: "settings", type: "integer" },
		{ defaultValue: 0, key: "targetOffsetY", label: "Target offset Y", max: 64, min: -64, storage: "settings", type: "integer" },
		{ defaultValue: 1, key: "targetOffsetZ", label: "Target offset Z", max: 64, min: -64, storage: "settings", type: "integer" },
		{ defaultValue: 0, key: "sourceLine", label: "Source line", max: 15, min: 0, storage: "settings", type: "integer" },
		{ defaultValue: 0, key: "targetLine", label: "Target line", max: 15, min: 0, storage: "settings", type: "integer" }
	],
	nixie_tube: [
		{ defaultValue: "", key: "customText", label: "Custom text", maxLength: 256, storage: "settings", type: "text" },
		{ defaultValue: "orange", key: "styleColor", label: "Text color", options: ["orange", "blue", "green", "red", "white", "yellow"], storage: "settings", type: "enum" },
		{ defaultValue: 15, key: "styleBrightness", label: "Brightness", max: 15, min: 0, storage: "settings", type: "integer" }
	],
	pulse_extender: [{ key: "timerTicks", label: "Pulse length (ticks)", max: 20 * 60 * 60, min: 2, type: "integer" }],
	pulse_repeater: [{ key: "timerTicks", label: "Delay (ticks)", max: 20 * 60 * 60, min: 2, type: "integer" }],
	pulse_timer: [{ key: "timerTicks", label: "Interval (ticks)", max: 20 * 60 * 60, min: 2, type: "integer" }],
	redstone_link: [
		{ key: "mode", label: "Mode", options: ["transmitter", "receiver"], type: "enum" },
		{ key: "frequencyLeft", label: "Frequency item 1", type: "item" },
		{ key: "frequencyRight", label: "Frequency item 2", type: "item" }
	],
	redstone_requester: [
		{ key: "filterItem", label: "Requested item", type: "item" },
		{ key: "requestAmount", label: "Request amount", max: 64, min: 1, type: "integer" },
		{ key: "allowPartialRequests", label: "Allow partial requests", type: "boolean" },
		{ defaultValue: "default", key: "networkId", label: "Logistics network", storage: "settings", type: "network" },
		{ defaultValue: "", key: "targetAddress", label: "Target address (blank for all)", storage: "settings", type: "address" }
	],
	rotation_speed_controller: [{ key: "targetSpeed", label: "Target speed", max: 256, min: -256, type: "integer" }],
	stock_link: [
		{ key: "filterItem", label: "Watched item", type: "item" },
		{ key: "minimumStock", label: "Minimum stock", max: 4096, min: 1, type: "integer" },
		{ defaultValue: "default", key: "networkId", label: "Logistics network", storage: "settings", type: "network" },
		{ defaultValue: "", key: "targetAddress", label: "Target address (blank for all)", storage: "settings", type: "address" }
	]
});

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertKnownDevice(kind) {
	if (!redstoneDeviceForId(kind))
		throw new Error(`Unknown redstone device kind ${kind}`);
}

function normalizeInteger(value, field) {
	if (!Number.isInteger(value) || value < field.min || value > field.max)
		throw new RangeError(`${field.label} must be an integer from ${field.min} through ${field.max}`);
	return value;
}

function normalizeItem(value, field) {
	if (typeof value !== "string" || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value) || value.length > 128)
		throw new TypeError(`${field.label} must be a namespaced Bedrock item identifier`);
	return value;
}

function normalizePatch(kind, patch) {
	if (!patch || typeof patch !== "object" || Array.isArray(patch))
		throw new TypeError("Redstone device configuration patches must be objects");
	const fields = deviceConfigurationFields(kind);
	const byKey = new Map(fields.map(field => [field.key, field]));
	const normalized = {};
	for (const [key, value] of Object.entries(patch)) {
		const field = byKey.get(key);
		if (!field)
			throw new Error(`${kind} does not support configuration field ${key}`);
		if (field.type === "integer")
			normalized[key] = normalizeInteger(value, field);
		else if (field.type === "item")
			normalized[key] = normalizeItem(value, field);
		else if (field.type === "boolean") {
			if (typeof value !== "boolean")
				throw new TypeError(`${field.label} must be true or false`);
			normalized[key] = value;
		} else if (field.type === "enum") {
			if (!field.options.includes(value))
				throw new RangeError(`${field.label} must be one of ${field.options.join(", ")}`);
			normalized[key] = value;
		} else if (field.type === "text") {
			if (typeof value !== "string" || value.length > field.maxLength)
				throw new TypeError(`${field.label} must be text up to ${field.maxLength} characters`);
			normalized[key] = value;
		} else if (field.type === "network")
			normalized[key] = normalizeLogisticsNetworkId(value);
		else if (field.type === "address")
			normalized[key] = normalizeLogisticsAddress(value);
	}
	return normalized;
}

function toDeviceAction(kind, patch, state) {
	const action = { type: "configure" };
	for (const [key, value] of Object.entries(patch)) {
		if (key === "frequencyLeft" || key === "frequencyRight" || deviceConfigurationFields(kind).find(field => field.key === key)?.storage === "settings")
			continue;
		action[key] = value;
	}
	if (kind === "redstone_link" && (patch.frequencyLeft !== undefined || patch.frequencyRight !== undefined)) {
		const frequency = [...state.frequency];
		if (patch.frequencyLeft !== undefined)
			frequency[0] = patch.frequencyLeft;
		if (patch.frequencyRight !== undefined)
			frequency[1] = patch.frequencyRight;
		action.frequency = normalizeRedstoneLinkFrequency(frequency);
	}
	return action;
}

export function deviceConfigurationFields(kind) {
	assertKnownDevice(kind);
	return (FIELD_SETS[kind] ?? []).map(field => ({ ...field, options: field.options ? [...field.options] : undefined }));
}

export function createRedstoneDeviceConfiguration(patch = {}) {
	const configuration = {
		schemaVersion: REDSTONE_DEVICE_CONFIGURATION_SCHEMA,
		revision: 0,
		lastEditorId: "",
		settings: {},
		...clone(patch)
	};
	return validateRedstoneDeviceConfiguration(configuration);
}

/** Accepts records written before R1, which had no configuration envelope. */
export function normalizeRedstoneDeviceConfiguration(value) {
	return value === undefined || value === null
		? createRedstoneDeviceConfiguration()
		: validateRedstoneDeviceConfiguration(value);
}

export function validateRedstoneDeviceConfiguration(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Redstone device configuration must be an object");
	if (value.schemaVersion !== REDSTONE_DEVICE_CONFIGURATION_SCHEMA)
		throw new Error(`Redstone device configuration must use schema ${REDSTONE_DEVICE_CONFIGURATION_SCHEMA}`);
	if (!Number.isInteger(value.revision) || value.revision < 0 || value.revision > Number.MAX_SAFE_INTEGER)
		throw new RangeError("Redstone device configuration revisions must be non-negative safe integers");
	normalizeConfigurationEditorId(value.lastEditorId);
	const settings = value.settings ?? {};
	if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.keys(settings).length > 32)
		throw new TypeError("Redstone device configuration settings must be a small object");
	for (const [key, setting] of Object.entries(settings)) {
		if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) || !["boolean", "number", "string"].includes(typeof setting))
			throw new TypeError("Redstone device configuration settings must use short primitive values");
	}
	return clone({ ...value, settings });
}

/**
 * Applies a single compare-and-swap configuration edit. A `conflict` result is
 * intentional and must be shown to the player instead of silently replaying a
 * stale form over newer settings.
 */
export function configureRedstoneDevice({ configuration, editorId, expectedRevision, patch, state }) {
	const currentConfiguration = normalizeRedstoneDeviceConfiguration(configuration);
	const currentState = validateRedstoneDeviceState(state);
	const normalizedPatch = normalizePatch(currentState.kind, patch);
	const nextState = transitionRedstoneDevice(currentState, toDeviceAction(currentState.kind, normalizedPatch, currentState));
	const nextSettings = { ...currentConfiguration.settings };
	for (const field of deviceConfigurationFields(currentState.kind)) {
		if (field.storage === "settings" && normalizedPatch[field.key] !== undefined)
			nextSettings[field.key] = normalizedPatch[field.key];
	}
	const applied = applyVersionedConfiguration({
		apply: current => ({ ...current, settings: nextSettings }),
		changed: JSON.stringify(nextState) !== JSON.stringify(currentState)
			|| JSON.stringify(nextSettings) !== JSON.stringify(currentConfiguration.settings),
		current: currentConfiguration,
		editorId,
		editorKey: "lastEditorId",
		expectedRevision,
		validate: normalizeRedstoneDeviceConfiguration
	});
	return {
		changed: applied.changed,
		configuration: applied.state,
		conflict: applied.conflict,
		state: applied.conflict ? currentState : nextState
	};
}
