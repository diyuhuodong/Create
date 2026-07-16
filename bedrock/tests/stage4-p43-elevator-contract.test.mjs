import assert from "node:assert/strict";
import test from "node:test";

import { validateStage4P43Elevators } from "../tools/stage4-p43-elevator-contract.mjs";

test("P4.3 elevators persist column requests and route active pulley motion through contact edges", async () => {
	assert.deepEqual(await validateStage4P43Elevators(), {
		blocks: 2,
		entries: 4,
		movingContactOutput: "native_edge",
		persistentDomains: 2
	});
});
