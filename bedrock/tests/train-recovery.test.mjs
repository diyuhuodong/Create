import assert from "node:assert/strict";
import test from "node:test";

import { applyTrainRecoveryPlan, planTrainRecovery } from "../behavior_pack/scripts/trains/train-recovery.js";

test("recovery planning freezes unsafe authority and repairs missing/orphan projections", () => {
	const plan = planTrainRecovery({
		authorityRecords: [
			{ id: "safe" },
			{ id: "stale", route: { graphRevision: 2 } },
			{ id: "unclaimed", route: { graphRevision: 3 } }
		],
		graphRevision: 3,
		occupancyByTrain: { stale: [{ edgeId: "a" }] },
		portalTransfers: [{ id: "portal:1", phase: "frozen", resumePhase: "authority_switched", trainId: "moving" }],
		projectionTrainIds: ["safe", "orphan", "stale", "unclaimed"]
	});
	assert.deepEqual(plan.actions, [
		{ reason: "graph_revision_changed", trainId: "stale", type: "freeze" },
		{ reason: "occupancy_missing", trainId: "unclaimed", type: "freeze" },
		{ trainId: "orphan", type: "remove_orphan_projection" },
		{ transferId: "portal:1", type: "retry_portal" }
	]);
});

test("recovery applies an ordered fault-injection plan through authority ports", () => {
	const events = [];
	const results = applyTrainRecoveryPlan({ actions: [
		{ reason: "occupancy_missing", trainId: "one", type: "freeze" },
		{ trainId: "two", type: "rebuild_projection" },
		{ trainId: "three", type: "remove_orphan_projection" },
		{ transferId: "portal:1", type: "retry_portal" }
	], schemaVersion: 1 }, {
		freeze: (id, reason) => events.push(`freeze:${id}:${reason}`),
		rebuildProjection: id => events.push(`rebuild:${id}`),
		removeOrphanProjection: id => events.push(`remove:${id}`),
		retryPortal: id => events.push(`retry:${id}`)
	});
	assert.equal(results.every(result => result.ok), true);
	assert.deepEqual(events, ["freeze:one:occupancy_missing", "rebuild:two", "remove:three", "retry:portal:1"]);
});
