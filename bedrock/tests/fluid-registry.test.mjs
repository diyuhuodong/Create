import assert from "node:assert/strict";
import test from "node:test";

import { FLUID_BOTTLE_AMOUNT, FLUID_BUCKET_AMOUNT, containerForFluid, fluidFromContainer, fluidFromWorldBlock, fluidMatchesRequirement, worldBlockForFluid } from "../behavior_pack/scripts/fluids/fluid-registry.js";
import { cloneFluidStack, fluidStackFingerprint } from "../behavior_pack/scripts/fluids/fluid-stack.js";

test("fluid registry preserves Create fluid identities across buckets, bottles and source blocks", () => {
	assert.equal(FLUID_BUCKET_AMOUNT, 1_000);
	assert.equal(FLUID_BOTTLE_AMOUNT, 250);
	assert.deepEqual(fluidFromContainer({ typeId: "createbedrock:honey_bucket" }), { amount: 1_000, typeId: "createbedrock:honey" });
	assert.deepEqual(fluidFromContainer({ typeId: "createbedrock:builders_tea" }), { amount: 250, typeId: "createbedrock:tea" });
	assert.deepEqual(fluidFromContainer({ typeId: "minecraft:milk_bucket" }), { amount: 1_000, typeId: "createbedrock:milk" });
	assert.deepEqual(containerForFluid({ amount: 1_000, typeId: "createbedrock:chocolate" }), {
		emptyContainer: "minecraft:bucket",
		item: { amount: 1, typeId: "createbedrock:chocolate_bucket" }
	});
	assert.deepEqual(containerForFluid({ amount: 250, typeId: "createbedrock:tea" }), {
		emptyContainer: "minecraft:glass_bottle",
		item: { amount: 1, typeId: "createbedrock:builders_tea" }
	});
	assert.deepEqual(fluidFromWorldBlock({ states: {}, typeId: "createbedrock:honey" }), { amount: 1_000, typeId: "createbedrock:honey" });
	assert.deepEqual(worldBlockForFluid({ amount: 1_000, typeId: "createbedrock:chocolate" }), { states: {}, typeId: "createbedrock:chocolate" });
	assert.equal(worldBlockForFluid({ amount: 250, typeId: "createbedrock:tea" }), undefined);
});

test("fluid registry honors fluid tags and fingerprints identity-bearing potion components", () => {
	assert.equal(fluidMatchesRequirement({ amount: 250, typeId: "createbedrock:honey" }, "c:honey"), true);
	assert.equal(fluidMatchesRequirement({ amount: 250, typeId: "minecraft:water" }, "c:honey"), false);
	const potion = cloneFluidStack({
		amount: 250,
		components: { customEffects: [{ amplifier: 1, id: "minecraft:swiftness" }], potion: "minecraft:strong_swiftness" },
		typeId: "createbedrock:potion"
	});
	assert.deepEqual(potion.components, { customEffects: [{ amplifier: 1, id: "minecraft:swiftness" }], potion: "minecraft:strong_swiftness" });
	assert.notEqual(fluidStackFingerprint(potion), fluidStackFingerprint({ amount: 250, components: { potion: "minecraft:water" }, typeId: "createbedrock:potion" }));
});
