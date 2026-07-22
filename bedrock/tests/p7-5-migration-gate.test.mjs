import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeDynamicAssemblySnapshot } from "../behavior_pack/scripts/contraptions/dynamic-assembly-snapshot.js";
import { PortalTrackTransferAuthority } from "../behavior_pack/scripts/trains/portal-track-transfer.js";
import { readScheduleItemState, SCHEDULE_ITEM, SCHEDULE_ITEM_STATE_PROPERTY } from "../behavior_pack/scripts/trains/schedule-item-state.js";
import { TrackGraph } from "../behavior_pack/scripts/trains/track-graph.js";
import { readTrainAuthorityRecords } from "../behavior_pack/scripts/trains/train-authority-state.js";

async function fixture(name) {
	return JSON.parse(await readFile(new URL(`fixtures/p7-5/${name}`, import.meta.url), "utf8"));
}

test("P7.5 migration gate reads every supported predecessor and single-writes current schemas", async () => {
	assert.equal(normalizeDynamicAssemblySnapshot(await fixture("dynamic-assembly-v1.json")).schemaVersion, 2);
	const graph = new TrackGraph();
	graph.restore(await fixture("track-graph-v1.json"));
	assert.equal(graph.snapshot().schemaVersion, 2);
	const legacyItem = await fixture("schedule-item-v1.json");
	const schedule = readScheduleItemState({ getDynamicProperty: key => key === SCHEDULE_ITEM_STATE_PROPERTY ? JSON.stringify(legacyItem) : undefined, typeId: SCHEDULE_ITEM });
	assert.equal(schedule.schemaVersion, 2);
	assert.equal(schedule.schedule.revision, 7);
	const authority = readTrainAuthorityRecords(await fixture("train-authority-v2.json"));
	assert.deepEqual(authority.portalTransfers, []);
	assert.deepEqual(authority.dimensions[0].stations, []);
	const portals = new PortalTrackTransferAuthority({ rebuildProjection() { return true; }, releaseEntrance() { return true; }, reserveDestination() { return true; }, switchAuthority() { return true; } });
	portals.restore(await fixture("portal-transfer-v1.json"));
	assert.equal(portals.snapshot()[0].schemaVersion, 2);
	assert.equal(portals.retry("portal:legacy").reason, "manual_recovery_required");
});

test("P7.5 migration gate rejects unknown future schemas", () => {
	assert.throws(() => normalizeDynamicAssemblySnapshot({ schemaVersion: 99 }), /Unsupported/);
	assert.throws(() => new TrackGraph().restore({ chunks: [], schemaVersion: 99 }), /Unsupported/);
	assert.throws(() => readTrainAuthorityRecords([{ kind: "train_authority_meta", nextTrainId: 1, schemaVersion: 99 }]), /Unsupported/);
});
