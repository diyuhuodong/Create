import assert from "node:assert/strict";
import test from "node:test";

import { buildP77StaticCloseout, inspectP77StaticCloseout } from "../tools/p7-7-static-closeout.mjs";

function staticReport({ candidateSourceCommit = "a".repeat(40), pending = 52 } = {}) {
	return {
		candidateId: "0.1.0-fixture",
		candidateSourceCommit,
		candidateState: "frozen",
		staticClosure: { ready: true, platformChecksPending: pending }
	};
}

test("P7.7 static closeout distinguishes static completion from a stale candidate", () => {
	const closeout = buildP77StaticCloseout({
		staticReport: staticReport(),
		headCommit: "b".repeat(40),
		dirtyPaths: [],
		candidateArtifactValid: true
	});
	assert.equal(closeout.staticState, "static_verified");
	assert.equal(closeout.candidateReadiness, "candidate_refreeze_required");
	assert.equal(closeout.platformReadiness, "platform_validation_pending");
	assert.equal(closeout.requiredActions.length, 2);
});

test("P7.7 static closeout refuses a dirty source and treats only CodeGraph as excluded", () => {
	const closeout = buildP77StaticCloseout({
		staticReport: staticReport({ candidateSourceCommit: "a".repeat(40), pending: 0 }),
		headCommit: "a".repeat(40),
		dirtyPaths: ["bedrock/tools/change.mjs"],
		candidateArtifactValid: true
	});
	assert.equal(closeout.candidateReadiness, "source_dirty");
	assert.equal(closeout.platformReadiness, "platform_verified");
	assert.match(closeout.requiredActions[0], /Commit or remove/);
});

test("P7.7 current repository closeout reports static closure without fabricating platform evidence", async () => {
	const closeout = await inspectP77StaticCloseout();
	assert.equal(closeout.staticState, "static_verified");
	assert.equal(closeout.platformReadiness, "platform_validation_pending");
	assert.ok(["source_dirty", "candidate_refreeze_required", "candidate_current"].includes(closeout.candidateReadiness));
});
