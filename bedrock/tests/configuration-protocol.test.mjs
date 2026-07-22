import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	applyVersionedConfiguration,
	openConfigurationFormSession,
	submitVersionedConfigurationForm
} from "../behavior_pack/scripts/kernel/configuration-protocol.js";

function validateRecord(value) {
	if (!value || typeof value !== "object" || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.value !== "string")
		throw new TypeError("invalid test record");
	return { ...value };
}

test("shared configuration protocol increments only accepted domain-validated compare-and-swap edits", () => {
	const initial = { lastEditorId: "", revision: 4, value: "before" };
	const changed = applyVersionedConfiguration({
		apply: current => ({ ...current, value: "after" }),
		current: initial,
		editorId: "player-a",
		editorKey: "lastEditorId",
		expectedRevision: 4,
		validate: validateRecord
	});
	assert.deepEqual(changed, {
		changed: true,
		conflict: false,
		state: { lastEditorId: "player-a", revision: 5, value: "after" }
	});
	assert.deepEqual(applyVersionedConfiguration({
		apply: current => ({ ...current, value: "ignored" }),
		current: changed.state,
		expectedRevision: 4,
		validate: validateRecord
	}), { changed: false, conflict: true, state: changed.state });
});

test("shared form sessions reject stale asynchronous responses before a domain callback runs", () => {
	const session = openConfigurationFormSession({ revision: 2, subjectId: "device:minecraft:overworld:1:2:3" });
	let commits = 0;
	assert.deepEqual(submitVersionedConfigurationForm({
		actualRevision: () => 3,
		session,
		submit() { commits++; return true; }
	}), { changed: false, conflict: true });
	assert.equal(commits, 0);
	assert.deepEqual(submitVersionedConfigurationForm({
		actualRevision: 2,
		session,
		submit(expectedRevision) { commits++; return { changed: expectedRevision === 2, conflict: false }; }
	}), { changed: true, conflict: false });
	assert.equal(commits, 1);
});

test("redstone, Stock Ticker, and package endpoints route editable state through the shared protocol", async () => {
	const read = path => readFile(fileURLToPath(new URL(path, import.meta.url)), "utf8");
	const [redstoneConfiguration, redstoneUi, stockTicker, stockTickerRuntime, packageRuntime] = await Promise.all([
		read("../behavior_pack/scripts/redstone/redstone-device-configuration.js"),
		read("../behavior_pack/scripts/redstone/redstone-device-ui.js"),
		read("../behavior_pack/scripts/materials/stock-ticker.js"),
		read("../behavior_pack/scripts/materials/stock-ticker-runtime.js"),
		read("../behavior_pack/scripts/logistics/package-runtime.js")
	]);
	for (const source of [redstoneConfiguration, stockTicker])
		assert.match(source, /applyVersionedConfiguration/);
	for (const source of [redstoneUi, stockTickerRuntime, packageRuntime]) {
		assert.match(source, /openConfigurationFormSession/);
		assert.match(source, /submitVersionedConfigurationForm/);
	}
});
