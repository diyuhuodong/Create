export const TOOLBOX_BINDINGS_SCHEMA_VERSION = 2;
export const TOOLBOX_HOTBAR_SLOTS = 9;

function integer(value, label, maximum) {
	if (!Number.isInteger(value) || value < 0 || value > maximum)
		throw new RangeError(`${label} must be between 0 and ${maximum}`);
	return value;
}

function normalizeBinding(value) {
	if (typeof value?.toolboxId !== "string" || value.toolboxId.length === 0)
		throw new TypeError("Toolbox binding requires a toolbox id");
	return {
		compartment: integer(value.compartment, "Toolbox compartment", 7),
		hotbarSlot: integer(value.hotbarSlot, "Toolbox hotbar slot", TOOLBOX_HOTBAR_SLOTS - 1),
		revision: integer(value.revision ?? 0, "Toolbox binding revision", Number.MAX_SAFE_INTEGER),
		toolboxId: value.toolboxId
	};
}

export function createToolboxBindings({ bindings = [], revision = 0 } = {}) {
	const normalized = bindings.map(normalizeBinding);
	if (normalized.length > TOOLBOX_HOTBAR_SLOTS || new Set(normalized.map(binding => binding.hotbarSlot)).size !== normalized.length)
		throw new RangeError("Toolbox bindings require at most one binding per hotbar slot");
	return { bindings: normalized, revision: integer(revision, "Toolbox bindings revision", Number.MAX_SAFE_INTEGER), schemaVersion: TOOLBOX_BINDINGS_SCHEMA_VERSION };
}

export function readToolboxBindings(value) {
	if (!value)
		return createToolboxBindings();
	if (value.schemaVersion === 1 && value.toolboxId)
		return createToolboxBindings({ bindings: [{ compartment: value.compartment ?? 0, hotbarSlot: value.hotbarSlot ?? 0, revision: value.revision ?? 0, toolboxId: value.toolboxId }], revision: value.revision ?? 0 });
	if (value.schemaVersion !== TOOLBOX_BINDINGS_SCHEMA_VERSION)
		throw new TypeError("Unsupported Toolbox bindings state");
	return createToolboxBindings(value);
}

export function bindToolboxSlot(state, binding, expectedRevision) {
	const current = readToolboxBindings(state);
	if (current.revision !== expectedRevision)
		return { bound: false, reason: "revision_conflict", state: current };
	const nextBinding = normalizeBinding(binding);
	const bindings = current.bindings.filter(candidate => candidate.hotbarSlot !== nextBinding.hotbarSlot);
	bindings.push(nextBinding);
	return { bound: true, state: createToolboxBindings({ bindings, revision: current.revision + 1 }) };
}

export function unbindToolboxSlot(state, hotbarSlot, expectedRevision) {
	const current = readToolboxBindings(state);
	integer(hotbarSlot, "Toolbox hotbar slot", TOOLBOX_HOTBAR_SLOTS - 1);
	if (current.revision !== expectedRevision)
		return { removed: false, reason: "revision_conflict", state: current };
	const bindings = current.bindings.filter(binding => binding.hotbarSlot !== hotbarSlot);
	return { removed: bindings.length !== current.bindings.length, state: createToolboxBindings({ bindings, revision: current.revision + 1 }) };
}

export function reconcileToolboxBindings(state, isValid) {
	const current = readToolboxBindings(state);
	if (typeof isValid !== "function")
		throw new TypeError("Toolbox binding reconciliation requires a predicate");
	const bindings = current.bindings.filter(isValid);
	return bindings.length === current.bindings.length ? current : createToolboxBindings({ bindings, revision: current.revision + 1 });
}
