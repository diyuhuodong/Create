import { cloneItemStack, itemStackFingerprint, ItemPort } from "../logistics/item-port.js";

export const TOOLBOX_COMPARTMENTS = 8;
export const TOOLBOX_SLOTS_PER_COMPARTMENT = 4;
export const TOOLBOX_SCHEMA_VERSION = 1;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function nonEmpty(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`${label} must be a non-empty string`);
	return value;
}

function integer(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
	if (!Number.isInteger(value) || value < minimum || value > maximum)
		throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
	return value;
}

function normalizedCompartment(value) {
	const slots = Array.isArray(value?.slots) ? value.slots.map(stack => stack ?? undefined) : [];
	if (slots.length > TOOLBOX_SLOTS_PER_COMPARTMENT)
		throw new RangeError("Toolbox compartments hold at most four stacks");
	const port = new ItemPort({ id: "toolbox:normalization", size: TOOLBOX_SLOTS_PER_COMPARTMENT, slots });
	const snapshot = port.snapshot();
	const occupied = snapshot.slots.filter(Boolean);
	const filter = value?.filter === undefined ? occupied[0] : cloneItemStack(value.filter);
	if (filter && occupied.some(stack => itemStackFingerprint(stack) !== itemStackFingerprint(filter)))
		throw new TypeError("Toolbox compartment stacks must match its filter");
	return { filter: filter && cloneItemStack(filter), slots: snapshot.slots.map(stack => stack && cloneItemStack(stack)) };
}

export function createToolboxState({ color, compartments, host, revision = 0, toolboxId } = {}) {
	const normalizedCompartments = compartments === undefined
		? Array.from({ length: TOOLBOX_COMPARTMENTS }, () => ({ filter: undefined, slots: [] }))
		: compartments.map(normalizedCompartment);
	if (normalizedCompartments.length !== TOOLBOX_COMPARTMENTS)
		throw new RangeError("Toolboxes require exactly eight compartments");
	if (!host || typeof host !== "object" || Array.isArray(host) || !["block", "item"].includes(host.kind))
		throw new TypeError("Toolbox hosts must be a block or carried item");
	return {
		color: nonEmpty(color, "Toolbox color"),
		compartments: normalizedCompartments,
		host: clone(host),
		revision: integer(revision, "Toolbox revision"),
		schemaVersion: TOOLBOX_SCHEMA_VERSION,
		toolboxId: nonEmpty(toolboxId, "Toolbox id")
	};
}

export function readToolboxState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== TOOLBOX_SCHEMA_VERSION)
		throw new TypeError("Unsupported Toolbox state");
	return createToolboxState(value);
}

export function insertToolboxStack(state, compartmentIndex, stack, receiptId) {
	const current = readToolboxState(state);
	integer(compartmentIndex, "Toolbox compartment", { maximum: TOOLBOX_COMPARTMENTS - 1 });
	const compartment = current.compartments[compartmentIndex];
	const requested = cloneItemStack(stack);
	if (compartment.filter && itemStackFingerprint(compartment.filter) !== itemStackFingerprint(requested))
		return { accepted: undefined, remainder: requested, state: current };
	const port = new ItemPort({ id: `${current.toolboxId}:${compartmentIndex}`, size: TOOLBOX_SLOTS_PER_COMPARTMENT, slots: compartment.slots });
	const result = port.insert(requested, { receiptId });
	if (!result.accepted)
		return { ...result, state: current };
	const next = clone(current);
	next.compartments[compartmentIndex] = { filter: compartment.filter ?? cloneItemStack(requested), slots: port.snapshot().slots };
	next.revision++;
	return { ...result, state: readToolboxState(next) };
}

export function extractToolboxStack(state, compartmentIndex, { maxCount, receiptId } = {}) {
	const current = readToolboxState(state);
	integer(compartmentIndex, "Toolbox compartment", { maximum: TOOLBOX_COMPARTMENTS - 1 });
	integer(maxCount, "Toolbox extraction count", { minimum: 1, maximum: 64 });
	const compartment = current.compartments[compartmentIndex];
	const port = new ItemPort({ id: `${current.toolboxId}:${compartmentIndex}`, size: TOOLBOX_SLOTS_PER_COMPARTMENT, slots: compartment.slots });
	const reservation = port.reserve({ maxCount, predicate: () => true });
	if (!reservation)
		return { extracted: undefined, state: current };
	const extracted = port.extract(reservation, { receiptId });
	const next = clone(current);
	const slots = port.snapshot().slots;
	next.compartments[compartmentIndex] = { filter: slots.some(Boolean) ? compartment.filter : undefined, slots };
	next.revision++;
	return { extracted, state: readToolboxState(next) };
}
