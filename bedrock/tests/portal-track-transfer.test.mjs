import assert from "node:assert/strict";
import test from "node:test";

import { PortalTrackTransferAuthority } from "../behavior_pack/scripts/trains/portal-track-transfer.js";

function endpoint(dimensionId, nodeId) { return { dimensionId, location: { x: 0, y: 64, z: 0 }, nodeId }; }

test("Portal Track transfers switch authority before rebuilding and releasing the entrance", () => {
	const events = [];
	const transfers = new PortalTrackTransferAuthority({
		rebuildProjection() { events.push("projection"); return true; },
		releaseEntrance() { events.push("release"); return true; },
		reserveDestination() { events.push("reserve"); return true; },
		switchAuthority() { events.push("switch"); return true; }
	});
	assert.equal(transfers.begin({ destination: endpoint("minecraft:nether", "b"), id: "portal:1", payload: { packages: [] }, source: endpoint("minecraft:overworld", "a"), trainId: "train:1" }).ok, true);
	assert.equal(transfers.advance("portal:1").complete, false);
	assert.equal(transfers.advance("portal:1").complete, false);
	assert.equal(transfers.advance("portal:1").complete, true);
	assert.deepEqual(events, ["reserve", "switch", "projection", "release"]);
	assert.deepEqual(transfers.snapshot(), []);
});

test("Portal Track transfer failures freeze one recoverable authority record", () => {
	let projectionAvailable = false;
	const transfers = new PortalTrackTransferAuthority({ rebuildProjection() { return projectionAvailable; }, releaseEntrance() { return true; }, reserveDestination() { return true; }, switchAuthority() { return true; } });
	transfers.begin({ destination: endpoint("minecraft:nether", "b"), id: "portal:2", source: endpoint("minecraft:overworld", "a"), trainId: "train:2" });
	transfers.advance("portal:2");
	assert.equal(transfers.advance("portal:2").record.phase, "frozen");
	assert.equal(transfers.snapshot().length, 1);
	projectionAvailable = true;
	assert.equal(transfers.retry("portal:2").ok, true);
	assert.equal(transfers.advance("portal:2").record.phase, "projection_built");
	assert.equal(transfers.advance("portal:2").complete, true);
});
