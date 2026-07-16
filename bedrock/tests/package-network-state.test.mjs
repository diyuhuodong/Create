import assert from "node:assert/strict";
import test from "node:test";

import { packageFilterMatches, routePackage } from "../behavior_pack/scripts/logistics/package-network-state.js";

test("package routes choose one deterministic addressed endpoint and filters retain address semantics", () => {
	const packageRecord = { address: "Brass", id: "package:1", owner: { id: "packager:z", kind: "port" } };
	assert.equal(routePackage({ endpoints: [{ address: "Brass", id: "postbox:b", kind: "postbox" }, { address: "Brass", id: "frogport:a", kind: "frogport" }], packageRecord }).id, "frogport:a");
	assert.equal(packageFilterMatches("Brass", packageRecord), true);
	assert.equal(packageFilterMatches("Andesite", packageRecord), false);
});
