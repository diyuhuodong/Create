import assert from "node:assert/strict";
import test from "node:test";

import { validateStage4P45MinecartContraptions } from "../tools/stage4-p45-minecart-contraption-contract.mjs";

test("P4.5 minecart contraptions retain transaction, route, seat, coupling, and resource boundaries", async () => {
	assert.deepEqual(await validateStage4P45MinecartContraptions(), {
		blocks: 2,
		entries: 9,
		entities: 2,
		items: 4,
		recipes: 2
	});
});
