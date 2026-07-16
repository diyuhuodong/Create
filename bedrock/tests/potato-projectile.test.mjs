import assert from "node:assert/strict";
import test from "node:test";

import { launchVelocity, nextProjectileMotion, potatoProjectileHitPlan, potatoProjectileProfile } from "../behavior_pack/scripts/materials/potato-projectile.js";

test("Potato projectile profiles preserve Java's material-specific damage and effects", () => {
	assert.deepEqual(potatoProjectileHitPlan("minecraft:potato"), { damage: 5, knockback: 1.5 });
	assert.equal(potatoProjectileProfile("minecraft:golden_carrot").damage, 12);
	assert.equal(potatoProjectileProfile("createbedrock:blaze_cake").fireSeconds, 12);
	assert.equal(potatoProjectileProfile("minecraft:sweet_berries").split, 3);
});

test("Potato projectiles normalize launch direction and apply gravity and drag deterministically", () => {
	assert.deepEqual(launchVelocity("minecraft:potato", { x: 0, y: 0, z: 2 }), { x: 0, y: 0, z: 1.25 });
	assert.deepEqual(nextProjectileMotion({ x: 1, y: 1, z: 0 }, potatoProjectileProfile("minecraft:potato")), { x: .95, y: .9025, z: 0 });
});
