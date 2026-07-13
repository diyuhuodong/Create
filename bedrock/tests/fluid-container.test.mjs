import assert from "node:assert/strict";
import test from "node:test";

import { FLUID_BUCKET_AMOUNT, planFluidBucketInteraction, settleFluidBucketInteraction } from "../behavior_pack/scripts/fluids/fluid-container.js";
import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";

function fixture({ capacity = 2_000, contents, heldItem, failOnSet = false } = {}) {
	const tank = new FluidTank({ capacity, contents, id: "tank:bucket" });
	let held = heldItem && { ...heldItem };
	return {
		get held() {
			return held && { ...held };
		},
		plan() {
			const inspection = tank.inspect();
			return planFluidBucketInteraction({ capacity: inspection.capacity, contents: inspection.contents, item: held });
		},
		settle(plan) {
			return settleFluidBucketInteraction({
				extractFluid(options) {
					const reservation = tank.reserve(options);
					return reservation && tank.extract(reservation);
				},
				getHeldItem() {
					return held;
				},
				insertFluid(fluid) {
					return tank.insert(fluid);
				},
				plan,
				setHeldItem(item) {
					if (failOnSet)
						throw new Error("simulated inventory failure");
					held = { ...item };
				}
			});
		},
		tank
	};
}

test("bucket interaction fills a vanilla water bucket without changing total fluid", () => {
	const interaction = fixture({
		contents: { amount: 1_500, typeId: "minecraft:water" },
		heldItem: { amount: 1, typeId: "minecraft:bucket" }
	});
	assert.equal(FLUID_BUCKET_AMOUNT, 1_000);
	assert.deepEqual(interaction.settle(interaction.plan()), {
		fluid: { amount: 1_000, typeId: "minecraft:water" },
		ok: true
	});
	assert.deepEqual(interaction.held, { amount: 1, typeId: "minecraft:water_bucket" });
	assert.deepEqual(interaction.tank.inspect().contents, { amount: 500, typeId: "minecraft:water" });
});

test("bucket interaction drains water and lava only when the tank can accept a full bucket", () => {
	const water = fixture({ heldItem: { amount: 1, typeId: "minecraft:water_bucket" } });
	assert.equal(water.settle(water.plan()).ok, true);
	assert.deepEqual(water.held, { amount: 1, typeId: "minecraft:bucket" });
	assert.deepEqual(water.tank.inspect().contents, { amount: 1_000, typeId: "minecraft:water" });

	const lava = fixture({ capacity: 1_500, contents: { amount: 600, typeId: "minecraft:lava" }, heldItem: { amount: 1, typeId: "minecraft:lava_bucket" } });
	assert.equal(lava.plan(), undefined);
	assert.deepEqual(lava.held, { amount: 1, typeId: "minecraft:lava_bucket" });
	assert.deepEqual(lava.tank.inspect().contents, { amount: 600, typeId: "minecraft:lava" });
});

test("bucket interaction rejects stale inventory and unsupported virtual-fluid metadata", () => {
	const stale = fixture({ contents: { amount: 1_000, typeId: "minecraft:water" }, heldItem: { amount: 1, typeId: "minecraft:bucket" } });
	const plan = stale.plan();
	const original = stale.settle;
	assert.ok(plan);
	assert.equal(planFluidBucketInteraction({
		capacity: 2_000,
		contents: { amount: 1_000, tags: ["heated"], typeId: "minecraft:water" },
		item: { amount: 1, typeId: "minecraft:bucket" }
	}), undefined);
	assert.equal(original.call(stale, { ...plan, expectedItem: { amount: 1, typeId: "minecraft:stick" } }).reason, "held_item_changed");
	assert.deepEqual(stale.tank.inspect().contents, { amount: 1_000, typeId: "minecraft:water" });
});

test("bucket interaction compensates partial tank changes that occur after planning", () => {
	const fill = fixture({
		contents: { amount: 1_000, typeId: "minecraft:water" },
		heldItem: { amount: 1, typeId: "minecraft:bucket" }
	});
	const fillPlan = fill.plan();
	fill.tank.extract(fill.tank.reserve({ maxAmount: 500 }));
	assert.equal(fill.settle(fillPlan).reason, "tank_changed_rolled_back");
	assert.deepEqual(fill.tank.inspect().contents, { amount: 500, typeId: "minecraft:water" });
	assert.deepEqual(fill.held, { amount: 1, typeId: "minecraft:bucket" });

	const drain = fixture({ heldItem: { amount: 1, typeId: "minecraft:water_bucket" } });
	const drainPlan = drain.plan();
	drain.tank.insert({ amount: 1_500, typeId: "minecraft:water" });
	assert.equal(drain.settle(drainPlan).reason, "tank_changed_rolled_back");
	assert.deepEqual(drain.tank.inspect().contents, { amount: 1_500, typeId: "minecraft:water" });
	assert.deepEqual(drain.held, { amount: 1, typeId: "minecraft:water_bucket" });
});

test("bucket interaction compensates tank mutation when the inventory write fails", () => {
	const fill = fixture({
		contents: { amount: 1_000, typeId: "minecraft:water" },
		failOnSet: true,
		heldItem: { amount: 1, typeId: "minecraft:bucket" }
	});
	assert.equal(fill.settle(fill.plan()).reason, "inventory_error_rolled_back");
	assert.deepEqual(fill.tank.inspect().contents, { amount: 1_000, typeId: "minecraft:water" });

	const drain = fixture({ failOnSet: true, heldItem: { amount: 1, typeId: "minecraft:lava_bucket" } });
	assert.equal(drain.settle(drain.plan()).reason, "inventory_error_rolled_back");
	assert.equal(drain.tank.inspect().contents, undefined);
});
