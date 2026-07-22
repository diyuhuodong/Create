import assert from "node:assert/strict";
import test from "node:test";

import { createPackageEndpoint, packageEndpointAccepts, packageFilterMatches, routePackage } from "../behavior_pack/scripts/logistics/package-network-state.js";

test("package routes choose one deterministic addressed endpoint and filters retain address semantics", () => {
	const packageRecord = { address: "Brass", id: "package:1", owner: { id: "packager:z", kind: "port" } };
	assert.equal(routePackage({ endpoints: [{ address: "Brass", id: "postbox:b", kind: "postbox" }, { address: "Brass", id: "frogport:a", kind: "frogport" }], packageRecord }).id, "frogport:a");
	assert.equal(packageFilterMatches("Brass", packageRecord), true);
	assert.equal(packageFilterMatches("Andesite", packageRecord), false);
});

test("package endpoints combine address, content filter, connection, and capacity", () => {
	const endpoint = createPackageEndpoint({ address: "Brass", capacity: 1, filter: { typeIds: ["createbedrock:brass_sheet"] }, id: "postbox:a", kind: "postbox" });
	const packageRecord = { address: "Brass", contents: [{ count: 1, typeId: "createbedrock:brass_sheet" }], id: "package:1", owner: { id: "packager:z", kind: "port" } };
	assert.equal(packageEndpointAccepts(endpoint, packageRecord), true);
	assert.equal(packageEndpointAccepts(endpoint, packageRecord, { occupied: 1 }), false);
	assert.equal(packageEndpointAccepts({ ...endpoint, connected: false }, packageRecord), false);
});
