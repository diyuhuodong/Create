import assert from "node:assert/strict";
import test from "node:test";

import { validateStage4P44Actors } from "../tools/stage4-p44-actor-contract.mjs";

test("P4.4 actors retain authoritative moving data, resources, and explicit acquisition boundaries", async () => {
	assert.deepEqual(await validateStage4P44Actors(), {
		blocks: 4,
		deferredRecipes: 2,
		entries: 8,
		internalBlockEntities: 2
	});
});
