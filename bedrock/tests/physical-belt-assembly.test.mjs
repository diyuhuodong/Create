import assert from "node:assert/strict";
import test from "node:test";

import { capturePhysicalBeltAssemblyAttachments } from "../behavior_pack/scripts/contraptions/physical-belt-assembly.js";

const source = { x: 0, y: 64, z: 0 };
const belt = [{ x: 1, y: 64, z: 0 }, { x: 2, y: 64, z: 0 }];
const destination = { x: 3, y: 64, z: 0 };

function run(overrides = {}) {
	return {
		destinationLocation: destination,
		id: "physical-belt:line",
		locations: belt,
		movable: true,
		sourceLocation: source,
		...overrides
	};
}

test("physical belt assembly attachments preserve only complete idle routes with their ports", () => {
	assert.deepEqual(capturePhysicalBeltAssemblyAttachments({
		anchor: source,
		locations: [source, ...belt, destination],
		runs: [run()]
	}), [{
		locations: [{ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
		name: "physical-belt:line"
	}]);
});

test("physical belt assembly attachments reject active, partial, and endpoint-detached routes", () => {
	assert.throws(() => capturePhysicalBeltAssemblyAttachments({
		anchor: source, locations: [source, ...belt, destination], runs: [run({ movable: false })]
	}), /active item transport/);
	assert.throws(() => capturePhysicalBeltAssemblyAttachments({
		anchor: source, locations: [source, belt[0], destination], runs: [run()]
	}), /complete run/);
	assert.throws(() => capturePhysicalBeltAssemblyAttachments({
		anchor: source, locations: [...belt], runs: [run()]
	}), /endpoint ports/);
});
