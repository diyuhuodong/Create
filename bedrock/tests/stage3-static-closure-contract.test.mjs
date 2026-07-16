import assert from "node:assert/strict";
import test from "node:test";

import { validateStage3StaticClosure } from "../tools/stage3-static-closure-contract.mjs";

test("Stage-3 static closure assigns every tracked registration to a completed verified package", async () => {
	assert.deepEqual(await validateStage3StaticClosure(), {
		domains: {
			content: 116,
			fluids: 24,
			kinetics: 35,
			logistics: 27,
			processing: 14,
			redstone: 29
		},
		entries: 245
	});
});
