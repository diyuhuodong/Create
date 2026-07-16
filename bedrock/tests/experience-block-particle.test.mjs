import assert from "node:assert/strict";
import test from "node:test";

import { experienceBlockParticleLocation } from "../behavior_pack/scripts/materials/experience-block-particle.js";

test("experience block particles remain inside the Java-clamped emission cube", () => {
	const position = experienceBlockParticleLocation({ x: 10, y: 20, z: 30 }, () => 0);
	assert.deepEqual(position, { x: 9.95, y: 19.95, z: 29.95 });
	const high = experienceBlockParticleLocation({ x: 10, y: 20, z: 30 }, () => 1);
	assert.deepEqual(high, { x: 11.05, y: 21.05, z: 31.05 });
	assert.throws(() => experienceBlockParticleLocation({ x: 0, y: Number.NaN, z: 0 }), /finite/);
});
