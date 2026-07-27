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
		if (carrier.item.count !== 1)
			return { accepted: false, reason: "stacked_carrier" };
		const adapter = this.#adapter();
		const input = new ItemPort({ id: `${carrier.carrierId}:input`, size: 1, slots: [carrier.item] });
		const started = adapter.begin({ carrierId: carrier.carrierId, inputPort: input, recipeId });
		if (!started.accepted)
			return started;
		const recipe = this.#recipes.find(candidate => candidate.id === recipeId);
		const updated = this.#write(carrier, {
			item: { count: 1, typeId: recipe.transitionalItem },
			sequencedAssembly: adapter.snapshot()[0]
		});
		return updated.ok ? { ...started, carrier: updated.carrier } : updated;
	}

	apply({ fluidPort, itemPort, roll = 0, stationType, transportId }) {
		const carrier = this.#carrier(transportId);
		if (!carrier.sequencedAssembly)
			return { applied: false, reason: "unknown_carrier" };
		const adapter = this.#adapter(carrier.sequencedAssembly);
		const applied = adapter.apply({ carrierId: carrier.carrierId, fluidPort, itemPort, roll, stationType });
		if (!applied.applied)
			return applied;
		const session = adapter.snapshot()[0];
		const visibleItem = session.controller.output.slots.find(Boolean) ?? carrier.item;
		const updated = this.#write(carrier, { item: visibleItem, sequencedAssembly: session });
		return updated.ok ? { ...applied, carrier: updated.carrier } : updated;
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
		const updated = this.#write(carrier, { item: collected.output, sequencedAssembly: undefined });
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

	#write(carrier, { item, sequencedAssembly }) {
		return this.#network.updateBeltCarrier({
			carrierId: carrier.carrierId,
			item,
			sequencedAssembly,
			transportId: carrier.id
		});
	}
}
