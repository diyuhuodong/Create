import assert from "node:assert/strict";
import test from "node:test";

import { deserializeVersionedState, serializeVersionedState } from "../behavior_pack/scripts/kernel/versioned-state.js";

test("versioned state serializes and restores the current schema", () => {
	const serialized = serializeVersionedState(2, { nodes: ["shaft"] });
	assert.deepEqual(deserializeVersionedState(serialized, { schemaVersion: 2 }), { nodes: ["shaft"] });
});

test("versioned state upgrades legacy and intermediate payloads exactly once per version", () => {
	assert.deepEqual(deserializeVersionedState(JSON.stringify(["legacy"]), {
		schemaVersion: 2,
		upgrades: {
			0: legacy => ({ values: legacy }),
			1: payload => ({ ...payload, migrated: true })
		}
	}), { migrated: true, values: ["legacy"] });

	assert.deepEqual(deserializeVersionedState(JSON.stringify({ payload: { values: [] }, schemaVersion: 1 }), {
		schemaVersion: 2,
		upgrades: { 1: payload => ({ ...payload, migrated: true }) }
	}), { migrated: true, values: [] });
});

test("versioned state rejects unsupported future schemas and missing migrations", () => {
	assert.throws(() => deserializeVersionedState(JSON.stringify({ payload: {}, schemaVersion: 3 }), { schemaVersion: 2 }), RangeError);
	assert.throws(() => deserializeVersionedState(JSON.stringify({ payload: {}, schemaVersion: 1 }), { schemaVersion: 2 }), /Missing persistent state upgrade/);
});
