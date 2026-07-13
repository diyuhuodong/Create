import { cloneItemStack } from "./item-port.js";

function normalizedIdentifiers(identifiers, field) {
	if (!Array.isArray(identifiers) || identifiers.some(identifier => typeof identifier !== "string" || identifier.length === 0))
		throw new TypeError(`Item filters require ${field} to be an array of identifiers`);
	return [...new Set(identifiers)].sort();
}

function normalizedMode(mode) {
	if (mode !== "allow" && mode !== "deny")
		throw new TypeError("Item filters require an allow or deny mode");
	return mode;
}

export class ItemFilter {
	#mode;
	#priority;
	#tags;
	#typeIds;

	constructor({ mode = "allow", priority = 0, tags = [], typeIds = [] } = {}, { resolveTag = () => [] } = {}) {
		if (!Number.isInteger(priority))
			throw new TypeError("Item filter priorities must be integers");
		if (typeof resolveTag !== "function")
			throw new TypeError("Item filters require a tag resolver");
		this.#mode = normalizedMode(mode);
		this.#priority = priority;
		this.#tags = normalizedIdentifiers(tags, "tags");
		this.#typeIds = new Set(normalizedIdentifiers(typeIds, "typeIds"));
		for (const tag of this.#tags) {
			const resolved = normalizedIdentifiers(resolveTag(tag), `items for tag ${tag}`);
			for (const typeId of resolved)
				this.#typeIds.add(typeId);
		}
	}

	get priority() {
		return this.#priority;
	}

	accepts(stack) {
		const matches = this.#typeIds.has(cloneItemStack(stack).typeId);
		return this.#mode === "allow" ? matches : !matches;
	}

	snapshot() {
		return {
			mode: this.#mode,
			priority: this.#priority,
			tags: [...this.#tags],
			typeIds: [...this.#typeIds]
		};
	}
}

export function selectItemFilter(filters, stack, { locked = false } = {}) {
	if (!Array.isArray(filters) || filters.some(filter => !(filter instanceof ItemFilter)))
		throw new TypeError("Item filter selection requires ItemFilter entries");
	if (typeof locked !== "boolean")
		throw new TypeError("Item filter locks must be boolean");
	if (locked)
		return undefined;

	const accepted = filters
		.filter(filter => filter.accepts(stack))
		.sort((left, right) => right.priority - left.priority);
	return accepted[0];
}
