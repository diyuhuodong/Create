import assert from "node:assert/strict";
import test from "node:test";

import { convertJavaModel } from "../tools/convert-java-models.mjs";

test("convertJavaModel preserves Java cube bounds, rotations, UVs, and materials", () => {
	const geometry = convertJavaModel({
		identifier: "geometry.createbedrock.fixture",
		model: {
			texture_size: [32, 16],
			textures: { side: "create:block/axis" },
			elements: [{
				from: [6, 2, 4],
				to: [10, 6, 12],
				rotation: { axis: "y", angle: 45, origin: [8, 4, 8] },
				faces: {
					north: { texture: "#side", uv: [2, 3, 6, 7], rotation: 90 }
				}
			}]
		}
	});

	const cube = geometry["minecraft:geometry"][0].bones[0].cubes[0];
	assert.deepEqual(cube.origin, [-2, 2, -4]);
	assert.deepEqual(cube.size, [4, 4, 8]);
	assert.deepEqual(cube.pivot, [0, 4, 0]);
	assert.deepEqual(cube.rotation, [0, 45, 0]);
	assert.deepEqual(cube.uv.north, {
		material_instance: "axis",
		uv: [2, 3],
		uv_size: [4, 4],
		uv_rotation: 90
	});
});

test("convertJavaModel uses configured values for unresolved parent texture variables", () => {
	const geometry = convertJavaModel({
		identifier: "geometry.createbedrock.fixture",
		textureOverrides: { side: "create:block/mechanical_bearing_side" },
		model: {
			elements: [{
				from: [0, 0, 0],
				to: [1, 1, 1],
				faces: { north: { texture: "#side", uv: [0, 0, 1, 1] } }
			}]
		}
	});

	assert.equal(geometry["minecraft:geometry"][0].bones[0].cubes[0].uv.north.material_instance, "mechanical_bearing_side");
});
