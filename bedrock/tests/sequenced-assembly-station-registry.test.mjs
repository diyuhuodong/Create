import assert from "node:assert/strict";
import test from "node:test";

import { registerSequencedAssemblyStationResolver, sequencedAssemblyStationResolverIds, stationForSequencedBeltCarrier } from "../behavior_pack/scripts/processing/sequenced-assembly-station-registry.js";

test("sequenced Belt station registry selects registered world stations deterministically", () => {
	assert.equal(registerSequencedAssemblyStationResolver("zeta", carrier => carrier.id === "transport:0" && ({ id: "zeta:station", stationType: "create:pressing" })), true);
	assert.equal(registerSequencedAssemblyStationResolver("alpha", carrier => carrier.id === "transport:0" && ({ id: "alpha:station", stationType: "create:filling" })), true);
	assert.deepEqual(sequencedAssemblyStationResolverIds(), ["alpha", "zeta"]);
	assert.deepEqual(stationForSequencedBeltCarrier({ id: "transport:0" }), { id: "alpha:station", stationType: "create:filling" });
	assert.equal(registerSequencedAssemblyStationResolver("alpha", () => undefined), false);
});

test("sequenced Belt station registry rejects malformed resolver outputs", () => {
	registerSequencedAssemblyStationResolver("invalid", () => ({ id: "", stationType: "create:pressing" }));
	assert.throws(() => stationForSequencedBeltCarrier({ id: "transport:1" }), /invalid station/);
});
