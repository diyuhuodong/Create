import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function item(name) {
	return JSON.parse(await readFile(new URL(`../behavior_pack/items/${name}.json`, import.meta.url), "utf8"));
}

test("blaze cake materials retain their Java fuel tiers", async () => {
	const [base, cake, creative] = await Promise.all([
		item("blaze_cake_base"), item("blaze_cake"), item("creative_blaze_cake")
	]);
	assert.equal(base["minecraft:item"].components["minecraft:icon"], "createbedrock_blaze_cake_base");
	assert.equal(cake["minecraft:item"].components["minecraft:fuel"].duration, 6400);
	assert.equal(creative["minecraft:item"].components["minecraft:fuel"].duration, 2147483647);
	assert.equal(creative["minecraft:item"].components["minecraft:rarity"], "epic");
});
