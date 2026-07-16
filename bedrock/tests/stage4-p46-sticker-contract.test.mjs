import assert from "node:assert/strict";
import test from "node:test";

import { validateStage4P46Stickers } from "../tools/stage4-p46-sticker-contract.mjs";

test("P4.6 Sticker uses a durable unified attachment graph with explicit resource coverage", async () => {
	assert.deepEqual(await validateStage4P46Stickers(), {
		attachmentProviders: 3,
		blocks: 1,
		entries: 2,
		persistenceSchema: 2
	});
});
