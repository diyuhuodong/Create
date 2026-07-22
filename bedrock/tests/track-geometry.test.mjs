import assert from "node:assert/strict";
import test from "node:test";

import { createBezierTrackGeometry, createPortalTrackGeometry, normalizeTrackGeometry, persistedTrackGeometry, sampleTrackGeometry } from "../behavior_pack/scripts/trains/track-geometry.js";

function close(actual, expected, epsilon = 1e-3) { assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should be close to ${expected}`); }

test("Bezier tracks use an arc-length lookup in both directions", () => {
	const geometry = createBezierTrackGeometry({
		control1: { x: 3, y: 0, z: 0 },
		control2: { x: 3, y: 2, z: 3 },
		end: { x: 0, y: 2, z: 3 },
		start: { x: 0, y: 0, z: 0 }
	});
	const halfway = sampleTrackGeometry(geometry, geometry.length / 2);
	close(halfway.location.x, 2.25, .03);
	close(halfway.location.y, 1, .03);
	close(halfway.location.z, 1.5, .03);
	close(Math.hypot(halfway.tangent.x, halfway.tangent.y, halfway.tangent.z), 1);
	assert.equal(persistedTrackGeometry(geometry).lut, undefined);
	assert.equal(normalizeTrackGeometry(persistedTrackGeometry(geometry)).kind, "cubic_bezier");
});

test("Portal geometry persists its cross-dimension destination", () => {
	const portal = createPortalTrackGeometry({ destinationDimensionId: "minecraft:nether", destinationNodeId: "exit", end: { x: 2, y: 64, z: 2 }, portalId: "portal:a", start: { x: 0, y: 64, z: 0 } });
	assert.equal(portal.length, 1);
	assert.equal(sampleTrackGeometry(portal, 1).location.x, 2);
});
