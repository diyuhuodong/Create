import { LINKED_CONTROLLER_CHANNELS, normalizeLinkedControllerBindings, setLinkedControllerChannel } from "./linked-controller-bindings.js";
import { normalizeRedstoneLinkFrequency } from "./redstone-link-network.js";

export const LINKED_CONTROLLER_ITEM_STATE_SCHEMA = 1;
export const LINKED_CONTROLLER_ITEM_STATE_PROPERTY = "createbedrock:linked_controller_state";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function emptyChannels() {
	return normalizeLinkedControllerBindings();
}

function assertRevision(value) {
	if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
		throw new RangeError("Linked Controller revisions must be non-negative safe integers");
	return value;
}

function parseSerializedState(value) {
	if (value === undefined || value === null || value === "")
		return createLinkedControllerItemState();
	if (typeof value !== "string" || value.length > 4096)
		throw new TypeError("Linked Controller item state must be a short JSON string");
	try {
		return validateLinkedControllerItemState(JSON.parse(value));
	} catch (error) {
		throw new Error(`Linked Controller item state is invalid: ${error}`);
	}
}

export function createLinkedControllerItemState(patch = {}) {
	return validateLinkedControllerItemState({
		schemaVersion: LINKED_CONTROLLER_ITEM_STATE_SCHEMA,
		revision: 0,
		channels: emptyChannels(),
		...clone(patch)
	});
}

export function validateLinkedControllerItemState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Linked Controller item state must be an object");
	if (value.schemaVersion !== LINKED_CONTROLLER_ITEM_STATE_SCHEMA)
		throw new Error(`Linked Controller item state must use schema ${LINKED_CONTROLLER_ITEM_STATE_SCHEMA}`);
	assertRevision(value.revision);
	const channels = normalizeLinkedControllerBindings(value.channels);
	return { channels, revision: value.revision, schemaVersion: LINKED_CONTROLLER_ITEM_STATE_SCHEMA };
}

export function serializeLinkedControllerItemState(state) {
	return JSON.stringify(validateLinkedControllerItemState(state));
}

/** Reads a one-item stack. Absence means a freshly crafted pre-R1 controller. */
export function readLinkedControllerItemState(itemStack) {
	if (!itemStack || typeof itemStack.getDynamicProperty !== "function")
		throw new TypeError("Linked Controller item state requires an ItemStack dynamic-property reader");
	return parseSerializedState(itemStack.getDynamicProperty(LINKED_CONTROLLER_ITEM_STATE_PROPERTY));
}

/**
 * Writes state to the ItemStack itself. The linked controller's BP definition
 * enforces max_stack_size=1 because Bedrock only permits item dynamic
 * properties on non-stackable items.
 */
export function writeLinkedControllerItemState(itemStack, state) {
	if (!itemStack || typeof itemStack.setDynamicProperty !== "function")
		throw new TypeError("Linked Controller item state requires an ItemStack dynamic-property writer");
	if (itemStack.typeId !== "createbedrock:linked_controller")
		throw new Error("Only Linked Controller ItemStacks can carry controller state");
	itemStack.setDynamicProperty(LINKED_CONTROLLER_ITEM_STATE_PROPERTY, serializeLinkedControllerItemState(state));
	return itemStack;
}

export function configureLinkedControllerChannel({ channel, expectedRevision, frequency, state }) {
	const current = validateLinkedControllerItemState(state);
	if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
		throw new RangeError("Linked Controller edits require a non-negative expected revision");
	if (expectedRevision !== current.revision)
		return { changed: false, conflict: true, state: current };
	const channels = setLinkedControllerChannel(current.channels, channel, normalizeRedstoneLinkFrequency(frequency));
	if (JSON.stringify(channels) === JSON.stringify(current.channels))
		return { changed: false, conflict: false, state: current };
	return {
		changed: true,
		conflict: false,
		state: { ...current, channels, revision: current.revision + 1 }
	};
}

export function configureLinkedControllerChannels({ expectedRevision, frequencies, state }) {
	const current = validateLinkedControllerItemState(state);
	if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
		throw new RangeError("Linked Controller edits require a non-negative expected revision");
	if (expectedRevision !== current.revision)
		return { changed: false, conflict: true, state: current };
	if (!Array.isArray(frequencies) || frequencies.length !== LINKED_CONTROLLER_CHANNELS)
		throw new RangeError(`Linked Controller requires ${LINKED_CONTROLLER_CHANNELS} frequency pairs`);
	const channels = frequencies.map(normalizeRedstoneLinkFrequency);
	if (JSON.stringify(channels) === JSON.stringify(current.channels))
		return { changed: false, conflict: false, state: current };
	return {
		changed: true,
		conflict: false,
		state: { ...current, channels, revision: current.revision + 1 }
	};
}
