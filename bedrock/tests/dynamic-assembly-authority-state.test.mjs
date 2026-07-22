import assert from "node:assert/strict";
import test from "node:test";

import { createAssemblyTransform } from "../behavior_pack/scripts/contraptions/assembly-transform.js";
import { advanceAssemblyJournal, createAssemblyJournal, normalizeDynamicAssemblyAuthorityRecord, recoveryDisposition } from "../behavior_pack/scripts/contraptions/dynamic-assembly-authority-state.js";
import { createDynamicAssemblySnapshot } from "../behavior_pack/scripts/contraptions/dynamic-assembly-snapshot.js";

function snapshot() {
	return createDynamicAssemblySnapshot({ anchor: { x: 0, y: 64, z: 0 }, blocks: [{ location: { x: 0, y: 64, z: 0 }, typeId: "createbedrock:andesite_casing" }] });
}

test("dynamic assembly journals only advance in their durable transaction order", () => {
	let journal = createAssemblyJournal("assemble", "assembly:a:1");
	journal = advanceAssemblyJournal(journal, "collected");
	assert.throws(() => advanceAssemblyJournal(journal, "sources_claimed"), /expected snapshot_written/);
	journal = advanceAssemblyJournal(journal, "snapshot_written");
	assert.deepEqual(journal.completedSteps, ["collected", "snapshot_written"]);
});

test("authority restore freezes interrupted transactions but rebuilds active projections", () => {
	const base = { epoch: 1, id: "assembly:a", phase: "capturing", snapshot: snapshot(), transform: createAssemblyTransform() };
	const interrupted = normalizeDynamicAssemblyAuthorityRecord({ ...base, journal: createAssemblyJournal("assemble", "assembly:a:1") });
	assert.equal(recoveryDisposition(interrupted).action, "freeze");
	assert.deepEqual(recoveryDisposition({ ...base, phase: "active" }).action, "restore_projection");
});
