import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { MOVABLE_BLOCK_TYPES } from "../behavior_pack/scripts/contraptions/movable-blocks.js";
import { assertReleaseProjectionCoverage, defaultProjectionEntityType, ProjectionRegistry } from "../behavior_pack/scripts/contraptions/projection-registry.js";

test("every movable block has a dedicated release projection identifier", () => {
	assert.equal(assertReleaseProjectionCoverage(MOVABLE_BLOCK_TYPES).ok, true);
	assert.equal(defaultProjectionEntityType("createbedrock:mechanical_drill"), "createbedrock:contraption_part_mechanical_drill");
});

test("release audits reject missing and explicitly invisible projections", () => {
	const registry = new ProjectionRegistry();
	registry.register("createbedrock:visible");
	registry.register("createbedrock:hidden", { mode: "authority_only", reason: "Bedrock API limitation" });
	assert.deepEqual(registry.audit(new Set(["createbedrock:visible", "createbedrock:missing"]), { release: true }).missing, ["createbedrock:missing"]);
	assert.equal(registry.audit(new Set(["createbedrock:hidden"]), { release: true }).ok, false);
});

test("generated projection families have behavior and resource entity definitions", async () => {
	const catalog = JSON.parse(await readFile(resolve("p7-5-projection-catalog.json"), "utf8"));
	assert.equal(catalog.entries.length, MOVABLE_BLOCK_TYPES.size);
	for (const entry of catalog.entries) {
		const path = entry.blockTypeId.split(":")[1];
		await access(resolve("behavior_pack", "entities", `contraption_part_${path}.json`));
		await access(resolve("resource_pack", "entity", `contraption_part_${path}.entity.json`));
		assert.notEqual(entry.entityTypeId, "createbedrock:contraption_part");
	}
});
