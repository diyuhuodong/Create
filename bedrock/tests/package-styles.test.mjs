import assert from "node:assert/strict";
import test from "node:test";

import {
	PACKAGE_RARE_CHANCE,
	RARE_PACKAGE_ITEMS,
	STANDARD_PACKAGE_ITEMS,
	packageItemForId
} from "../behavior_pack/scripts/logistics/package-styles.js";

test("package styles expose every Java standard and rare package through durable ids", () => {
	assert.equal(STANDARD_PACKAGE_ITEMS.length, 4);
	assert.equal(RARE_PACKAGE_ITEMS.length, 10);
	assert.equal(packageItemForId("package:1"), STANDARD_PACKAGE_ITEMS[0]);
	assert.equal(packageItemForId("package:2"), STANDARD_PACKAGE_ITEMS[1]);
	assert.ok(RARE_PACKAGE_ITEMS.includes(packageItemForId(`package:${PACKAGE_RARE_CHANCE}`)));
	assert.equal(packageItemForId(`package:${PACKAGE_RARE_CHANCE + 1}`), STANDARD_PACKAGE_ITEMS[PACKAGE_RARE_CHANCE % STANDARD_PACKAGE_ITEMS.length]);
});

test("package style selection rejects unstable package identities", () => {
	for (const id of [undefined, "", "package:0", "package:-1", "box:1"])
		assert.throws(() => packageItemForId(id));
});
