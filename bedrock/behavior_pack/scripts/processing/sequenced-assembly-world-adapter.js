import { ItemPort } from "../logistics/item-port.js";

import { SequencedAssemblyController } from "./sequenced-assembly-controller.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function nonEmptyString(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`${label} must be a non-empty string`);
	return value;
}

function assertPort(port, label) {
	if (!port || typeof port.reserve !== "function" || typeof port.extract !== "function" || typeof port.insert !== "function")
		throw new TypeError(`Sequenced-assembly ${label} must be an item port`);
	return port;
}

/**
 * Authoritative carrier registry for sequenced assembly. The carrier ID is
 * independent of a particular machine, so a Deployer, Spout, or Press world
 * adapter can continue the same sequence after the intermediate moves between
 * stations. World adapters remain responsible for deriving stable carrier IDs
 * from their belt/entity transport records and for calling persist().
 */
export class SequencedAssemblyWorldAdapter {
	#matchesTag;
	#recipes;
	#sessions = new Map();

	constructor(recipes, { matchesTag = () => false } = {}) {
		if (!Array.isArray(recipes) || recipes.length === 0)
			throw new TypeError("Sequenced-assembly world adapters require normalized recipes");
		if (typeof matchesTag !== "function")
			throw new TypeError("Sequenced-assembly world adapters require a tag matcher");
		this.#recipes = clone(recipes);
		this.#matchesTag = matchesTag;
	}

	begin({ carrierId, inputPort, recipeId }) {
		nonEmptyString(carrierId, "Sequenced-assembly carrier id");
		nonEmptyString(recipeId, "Sequenced-assembly recipe id");
		if (this.#sessions.has(carrierId))
			return { accepted: false, reason: "carrier_busy" };
		const controller = new SequencedAssemblyController(this.#recipes, { id: `sequenced-carrier:${carrierId}` });
		const started = controller.start(recipeId, assertPort(inputPort, "input"), { matchesTag: this.#matchesTag });
		if (!started.accepted)
			return started;
		this.#sessions.set(carrierId, controller);
		return { ...started, carrierId };
	}

	apply({ carrierId, fluidPort, itemPort, roll = 0, stationType }) {
		nonEmptyString(carrierId, "Sequenced-assembly carrier id");
		nonEmptyString(stationType, "Sequenced-assembly station type");
		const controller = this.#sessions.get(carrierId);
		if (!controller)
			return { applied: false, reason: "unknown_carrier" };
		return controller.apply(stationType, { fluidPort, itemPort, matchesTag: this.#matchesTag, roll });
	}

	collect({ carrierId, outputPort }) {
		nonEmptyString(carrierId, "Sequenced-assembly carrier id");
		const controller = this.#sessions.get(carrierId);
		if (!controller)
			return { collected: false, reason: "unknown_carrier" };
		const destination = assertPort(outputPort, "output");
		const reservation = controller.outputPort.reserve();
		if (!reservation)
			return { collected: false, reason: "not_complete" };
		const preview = destination.previewInsert?.(reservation.item);
		if (preview?.remainder)
			return { collected: false, reason: "output_full" };
		const extracted = controller.outputPort.extract(reservation, { receiptId: `sequenced-carrier:${carrierId}:collect` });
		const inserted = destination.insert(extracted, { receiptId: `sequenced-carrier:${carrierId}:deliver` });
		if (inserted.remainder)
			throw new Error("Sequenced-assembly output changed after capacity preview");
		this.#sessions.delete(carrierId);
		return { collected: true, output: extracted };
	}

	inspect(carrierId) {
		nonEmptyString(carrierId, "Sequenced-assembly carrier id");
		const controller = this.#sessions.get(carrierId);
		return controller ? { carrierId, ...controller.inspect() } : undefined;
	}

	snapshot() {
		return [...this.#sessions.entries()].map(([carrierId, controller]) => ({
			carrierId,
			controller: controller.snapshot()
		})).sort((left, right) => left.carrierId.localeCompare(right.carrierId));
	}

	restore(snapshot) {
		if (!Array.isArray(snapshot))
			throw new TypeError("Sequenced-assembly world-adapter snapshots require an array");
		const restored = new Map();
		for (const entry of snapshot) {
			const carrierId = nonEmptyString(entry?.carrierId, "Sequenced-assembly snapshot carrier id");
			if (restored.has(carrierId))
				throw new Error(`Sequenced-assembly snapshot duplicates carrier ${carrierId}`);
			const controller = new SequencedAssemblyController(this.#recipes, { id: `sequenced-carrier:${carrierId}` });
			controller.restore(entry?.controller);
			restored.set(carrierId, controller);
		}
		this.#sessions = restored;
		return this.snapshot();
	}
}
