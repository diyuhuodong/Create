import assert from "node:assert/strict";
import test from "node:test";

import { fluidFromVanillaSource, VANILLA_SOURCE_FLUID_AMOUNT, VanillaWorldFluidPort, vanillaSourceForFluid } from "../behavior_pack/scripts/fluids/world-fluid-port.js";

function clone(value) {
	return value && JSON.parse(JSON.stringify(value));
}

class FakeWorldCell {
	#block;
	#write;

	constructor(block, write) {
		this.#block = clone(block);
		this.#write = write;
	}

	get block() {
		return clone(this.#block);
	}

	read() {
		return clone(this.#block);
	}

	write(block) {
		if (this.#write)
			return this.#write(block, next => {
				this.#block = clone(next);
			});
		this.#block = clone(block);
	}
}

function portFor(cell) {
	return new VanillaWorldFluidPort({
		id: "world:overworld:0:64:0",
		readBlock() {
			return cell.read();
		},
		writeBlock(block) {
			return cell.write(block);
		}
	});
}

test("world fluid source conversion accepts only still, non-waterlogged water and lava", () => {
	assert.equal(VANILLA_SOURCE_FLUID_AMOUNT, 1_000);
	assert.deepEqual(fluidFromVanillaSource({ states: { liquid_depth: 0 }, typeId: "minecraft:water" }), { amount: 1_000, typeId: "minecraft:water" });
	assert.deepEqual(fluidFromVanillaSource({ states: { liquid_depth: 0 }, typeId: "minecraft:lava" }), { amount: 1_000, typeId: "minecraft:lava" });
	assert.equal(fluidFromVanillaSource({ states: { liquid_depth: 1 }, typeId: "minecraft:water" }), undefined);
	assert.equal(fluidFromVanillaSource({ states: { liquid_depth: 0 }, typeId: "minecraft:flowing_water" }), undefined);
	assert.equal(fluidFromVanillaSource({ isWaterlogged: true, states: { liquid_depth: 0 }, typeId: "minecraft:water" }), undefined);
});

test("world fluid source conversion refuses virtual metadata that vanilla blocks cannot preserve", () => {
	assert.deepEqual(vanillaSourceForFluid({ amount: 1_000, typeId: "minecraft:water" }), {
		states: { liquid_depth: 0 },
		typeId: "minecraft:water"
	});
	assert.equal(vanillaSourceForFluid({ amount: 999, typeId: "minecraft:water" }), undefined);
	assert.equal(vanillaSourceForFluid({ amount: 1_000, tags: ["heated"], typeId: "minecraft:water" }), undefined);
	assert.equal(vanillaSourceForFluid({ amount: 1_000, temperature: 20, typeId: "minecraft:lava" }), undefined);
});

test("VanillaWorldFluidPort extracts one source block exactly once per receipt", () => {
	const cell = new FakeWorldCell({ states: { liquid_depth: 0 }, typeId: "minecraft:water" });
	const port = portFor(cell);
	const reservation = port.reserve();
	assert.deepEqual(port.extract(reservation, { receiptId: "source:extract" }), { amount: 1_000, typeId: "minecraft:water" });
	assert.deepEqual(cell.block, { states: {}, typeId: "minecraft:air" });
	assert.deepEqual(port.extract(reservation, { receiptId: "source:extract" }), { amount: 1_000, typeId: "minecraft:water" });
	assert.equal(port.reserve(), undefined);
});

test("VanillaWorldFluidPort places only a complete compatible source into dry air", () => {
	const cell = new FakeWorldCell({ states: {}, typeId: "minecraft:air" });
	const port = portFor(cell);
	assert.deepEqual(port.insert({ amount: 1_000, typeId: "minecraft:lava" }, { receiptId: "target:insert" }), {
		accepted: { amount: 1_000, typeId: "minecraft:lava" },
		remainder: undefined
	});
	assert.deepEqual(cell.block, { states: { liquid_depth: 0 }, typeId: "minecraft:lava" });
	assert.deepEqual(port.insert({ amount: 1_000, typeId: "minecraft:lava" }, { receiptId: "target:insert" }).accepted, { amount: 1_000, typeId: "minecraft:lava" });

	const wet = portFor(new FakeWorldCell({ isWaterlogged: true, states: {}, typeId: "minecraft:air" }));
	assert.deepEqual(wet.insert({ amount: 1_000, typeId: "minecraft:water" }), {
		accepted: undefined,
		remainder: { amount: 1_000, typeId: "minecraft:water" }
	});
});

test("VanillaWorldFluidPort reports an uncertain mutation instead of guessing after a conflicting write", () => {
	const cell = new FakeWorldCell({ states: { liquid_depth: 0 }, typeId: "minecraft:water" }, (_block, set) => {
		set({ states: {}, typeId: "minecraft:stone" });
		throw new Error("simulated chunk race");
	});
	const port = portFor(cell);
	const reservation = port.reserve();
	assert.throws(() => port.extract(reservation), error => error.transactionState === "uncertain");
	assert.deepEqual(cell.block, { states: {}, typeId: "minecraft:stone" });
});
