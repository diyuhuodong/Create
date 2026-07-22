import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CREATE_GUIDANCE_TUTORIALS } from "../behavior_pack/scripts/guidance/guidance-catalog.js";
import { renderP76GuidanceLanguage } from "../tools/p7-6-guidance.mjs";

test("all Ponder families and storyboards have generated guide pages", async () => {
	const ledger = JSON.parse(await readFile(new URL("../data/p7-6-guidance-ledger.json", import.meta.url), "utf8"));
	assert.equal(ledger.entries.length, 52);
	assert.equal(CREATE_GUIDANCE_TUTORIALS.length, 52);
	const expectedPages = ledger.entries.reduce((total, entry) => total + Math.max(1, entry.storyboards.length), 0);
	assert.equal(CREATE_GUIDANCE_TUTORIALS.reduce((total, tutorial) => total + tutorial.pages.length, 0), expectedPages);
	assert.equal(CREATE_GUIDANCE_TUTORIALS.some(tutorial => !tutorial.pages.length), false);
	for (const locale of ["en_US", "zh_CN"])
		assert.equal(renderP76GuidanceLanguage(CREATE_GUIDANCE_TUTORIALS, locale).split(".title=").length - 1, expectedPages);
});

test("all Java advancements are classified as acquisition or guide semantics", async () => {
	const ledger = JSON.parse(await readFile(new URL("../data/p7-6-guidance-ledger.json", import.meta.url), "utf8"));
	assert.equal(ledger.advancements.length, 1150);
	assert.equal(ledger.advancements.some(entry => !entry.reason || entry.status !== "static_verified"), false);
});
