import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { P76_PARTICLE_IDS } from "../tools/p7-6-catalogs.mjs";
import { P76_ANIMATION_IDS, buildP76SoundCatalog, renderP76AnimationControllers, renderP76Animations, renderP76Particle, renderP76RuntimeSoundCatalog, renderP76SoundDefinitions } from "../tools/p7-6-resources.mjs";

test("all 79 Java sound events have a loadable Bedrock mapping", async () => {
	const javaSounds = JSON.parse(await readFile(new URL("../../src/generated/resources/assets/create/sounds.json", import.meta.url), "utf8"));
	const catalog = buildP76SoundCatalog(javaSounds);
	assert.equal(catalog.entries.length, 79);
	assert.equal(Object.keys(renderP76SoundDefinitions(catalog).sound_definitions).length, 79);
	assert.match(renderP76RuntimeSoundCatalog(catalog), /entity\.item_frame\.break/);
	assert.equal(catalog.entries.some(entry => !entry.relation || entry.status !== "static_verified"), false);
});

test("all 13 Java particle families render deterministic Bedrock documents", () => {
	assert.equal(P76_PARTICLE_IDS.length, 13);
	for (const id of P76_PARTICLE_IDS)
		assert.equal(renderP76Particle(id).particle_effect.description.identifier, `createbedrock:${id}`);
});

test("six core visual families have animations and controllers", () => {
	const animations = renderP76Animations().animations;
	const controllers = renderP76AnimationControllers().animation_controllers;
	assert.equal(Object.keys(animations).length, P76_ANIMATION_IDS.length);
	assert.equal(Object.keys(controllers).length, P76_ANIMATION_IDS.length);
});
