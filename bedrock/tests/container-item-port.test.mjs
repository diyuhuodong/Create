import assert from "node:assert/strict";
import test from "node:test";

import { ContainerItemPort } from "../behavior_pack/scripts/logistics/container-item-port.js";

function clone(value) {
	return value && JSON.parse(JSON.stringify(value));
}

class FakeContainer {
	#failOnSet;
	#sets = 0;
	#slots;

	constructor({ failOnSet, size, slots = [] }) {
		this.#failOnSet = failOnSet;
		this.#slots = Array.from({ length: size }, (_, slot) => clone(slots[slot]));
	}

	get size() {
		return this.#slots.length;
	}

	getItem(slot) {
		return clone(this.#slots[slot]);
	}

	setItem(slot, item) {
		this.#sets++;
		if (this.#sets === this.#failOnSet)
			throw new Error("simulated container failure");
		this.#slots[slot] = clone(item);
	}
}

const codec = {
	create(stack) {
		return { amount: stack.count, metadata: clone(stack.metadata), typeId: stack.typeId };
	},
	decode(stack) {
		return { count: stack.amount, ...(stack.metadata === undefined ? {} : { metadata: clone(stack.metadata) }), typeId: stack.typeId };
	},
	maxAmount() {
		return 2;
	},
	withCount(stack, count) {
		return { ...clone(stack), amount: count };
	}
};

test("ContainerItemPort reserves one exact slot and makes extraction retries idempotent", () => {
	const container = new FakeContainer({ size: 2, slots: [{ amount: 2, metadata: { named: true }, typeId: "minecraft:iron_ingot" }] });
	const port = new ContainerItemPort({ codec, container, id: "container:source" });
	const reservation = port.reserve();
	assert.deepEqual(port.extract(reservation, { receiptId: "extract:1" }), { count: 2, metadata: { named: true }, typeId: "minecraft:iron_ingot" });
	assert.deepEqual(port.extract(reservation, { receiptId: "extract:1" }), { count: 2, metadata: { named: true }, typeId: "minecraft:iron_ingot" });
	assert.deepEqual(port.inspect().slots, [undefined, undefined]);
});

test("ContainerItemPort records verified partial insertion instead of retrying accepted items", () => {
	const container = new FakeContainer({ failOnSet: 2, size: 2 });
	const port = new ContainerItemPort({ codec, container, id: "container:destination" });
	const requested = { count: 3, typeId: "minecraft:copper_ingot" };
	assert.deepEqual(port.insert(requested, { receiptId: "deliver:1" }), {
		accepted: { count: 2, typeId: "minecraft:copper_ingot" },
		remainder: { count: 1, typeId: "minecraft:copper_ingot" }
	});
	assert.deepEqual(port.insert(requested, { receiptId: "deliver:1" }), {
		accepted: { count: 2, typeId: "minecraft:copper_ingot" },
		remainder: { count: 1, typeId: "minecraft:copper_ingot" }
	});
	assert.deepEqual(port.inspect().slots, [{ count: 2, typeId: "minecraft:copper_ingot" }, undefined]);
});

test("ContainerItemPort persists only receipt and revision metadata, not the external inventory", () => {
	const source = new ContainerItemPort({ codec, container: new FakeContainer({ size: 1, slots: [{ amount: 1, typeId: "minecraft:gold_ingot" }] }), id: "container:state" });
	const reservation = source.reserve();
	source.extract(reservation, { receiptId: "extract:state" });
	const restored = new ContainerItemPort({ codec, container: new FakeContainer({ size: 1 }), id: "container:state" });
	restored.restore(source.snapshot());
	assert.deepEqual(restored.extract(reservation, { receiptId: "extract:state" }), { count: 1, typeId: "minecraft:gold_ingot" });
});
