import { ItemPort } from "../logistics/item-port.js";

import { SequencedAssemblyWorldAdapter } from "./sequenced-assembly-world-adapter.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertCarrierNetwork(network) {
	if (!network || typeof network.beltCarrier !== "function" || typeof network.updateBeltCarrier !== "function")
		throw new TypeError("Sequenced Belt carriers require a DepotNetwork carrier store");
	return network;
}

function assertTransportId(transportId) {
	if (typeof transportId !== "string" || transportId.length === 0)
		throw new TypeError("Sequenced Belt carrier operations require a transport id");
	return transportId;
}

function withStationGate(session, stationId) {
	if (stationId === undefined)
		return session;
	if (typeof stationId !== "string" || stationId.length === 0)
		throw new TypeError("Sequenced Belt carrier station identifiers must be non-empty strings");
	return { ...session, stationId };
}

/**
 * Stateless transaction bridge between a physical DepotNetwork Belt transport
 * and the pure sequenced-assembly controller. Each operation restores the
 * session from the Belt escrow record, then writes its next snapshot back to
 * that same record. It deliberately has no independent persistence store.
 */
export class SequencedAssemblyBeltCarrier {
	#matchesTag;
	#network;
	#recipes;

	constructor({ matchesTag = () => false, network, recipes }) {
		if (!Array.isArray(recipes) || recipes.length === 0)
			throw new TypeError("Sequenced Belt carriers require normalized recipes");
		if (typeof matchesTag !== "function")
			throw new TypeError("Sequenced Belt carriers require a tag matcher");
		this.#matchesTag = matchesTag;
		this.#network = assertCarrierNetwork(network);
		this.#recipes = clone(recipes);
	}

	begin({ recipeId, transportId }) {
		const carrier = this.#carrier(transportId);
		if (carrier.sequencedAssembly)
			return { accepted: false, reason: "carrier_busy" };
		const adapter = this.#adapter();
		const inputItem = { ...carrier.item, count: 1 };
		const input = new ItemPort({ id: `${carrier.carrierId}:input`, size: 1, slots: [inputItem] });
		const started = adapter.begin({ carrierId: carrier.carrierId, inputPort: input, recipeId });
		if (!started.accepted)
			return started;
		const recipe = this.#recipes.find(candidate => candidate.id === recipeId);
		const queuedItems = carrier.item.count > 1
			? [{ ...carrier.item, count: carrier.item.count - 1 }, ...carrier.queuedItems]
			: carrier.queuedItems;
		const updated = this.#write(carrier, {
			item: { count: 1, typeId: recipe.transitionalItem },
			queuedItems,
			sequencedAssembly: adapter.snapshot()[0]
		});
		return updated.ok ? { ...started, carrier: updated.carrier } : updated;
	}

	beginAtStation({ stationType, transportId }) {
		if (typeof stationType !== "string" || stationType.length === 0)
			throw new TypeError("Sequenced Belt starts require a station type");
		let lastFailure = { accepted: false, reason: "no_matching_recipe" };
		for (const recipe of this.#recipes) {
			if (recipe.steps[0]?.type !== stationType)
				continue;
			const started = this.begin({ recipeId: recipe.id, transportId });
			if (started.accepted || started.reason === "carrier_busy")
				return started;
			lastFailure = started;
		}
		return lastFailure;
	}

	apply({ fluidPort, itemPort, roll = 0, stationId, stationType, transportId }) {
		const carrier = this.#carrier(transportId);
		if (!carrier.sequencedAssembly)
			return { applied: false, reason: "unknown_carrier" };
		if (stationId !== undefined && carrier.sequencedAssembly.stationId === stationId)
			return { applied: false, reason: "station_already_applied" };
		const adapter = this.#adapter(carrier.sequencedAssembly);
		const applied = adapter.apply({ carrierId: carrier.carrierId, fluidPort, itemPort, roll, stationType });
		if (!applied.applied)
			return applied;
		const session = adapter.snapshot()[0];
		const visibleItem = session.controller.output.slots.find(Boolean) ?? carrier.item;
		const updated = this.#write(carrier, { item: visibleItem, queuedItems: carrier.queuedItems, sequencedAssembly: withStationGate(session, stationId) });
		return updated.ok ? { ...applied, carrier: updated.carrier } : updated;
	}

	/** Mark that a carrier has left its last station, allowing the next station action. */
	departStation({ transportId }) {
		const carrier = this.#carrier(transportId);
		if (!carrier.sequencedAssembly?.stationId)
			return { changed: false, carrier };
		const { stationId: ignored, ...sequencedAssembly } = carrier.sequencedAssembly;
		const updated = this.#write(carrier, { item: carrier.item, queuedItems: carrier.queuedItems, sequencedAssembly });
		return updated.ok ? { changed: true, carrier: updated.carrier } : updated;
	}

	release({ transportId }) {
		const carrier = this.#carrier(transportId);
		if (!carrier.sequencedAssembly)
			return { released: false, reason: "unknown_carrier" };
		const adapter = this.#adapter(carrier.sequencedAssembly);
		const output = new ItemPort({ id: `${carrier.carrierId}:release`, size: 1 });
		const collected = adapter.collect({ carrierId: carrier.carrierId, outputPort: output });
		if (!collected.collected)
			return { released: false, reason: collected.reason };
		const updated = this.#write(carrier, { item: collected.output, queuedItems: carrier.queuedItems, sequencedAssembly: undefined });
		return updated.ok ? { released: true, carrier: updated.carrier, output: collected.output } : updated;
	}

	#adapter(session) {
		const adapter = new SequencedAssemblyWorldAdapter(this.#recipes, { matchesTag: this.#matchesTag });
		if (session)
			adapter.restore([session]);
		return adapter;
	}

	#carrier(transportId) {
		const carrier = this.#network.beltCarrier(assertTransportId(transportId));
		if (!carrier)
			throw new Error(`Unknown Belt transport ${transportId}`);
		return carrier;
	}

	#write(carrier, { item, queuedItems, sequencedAssembly }) {
		return this.#network.updateBeltCarrier({
			carrierId: carrier.carrierId,
			item,
			queuedItems,
			sequencedAssembly,
			transportId: carrier.id
		});
	}
}
