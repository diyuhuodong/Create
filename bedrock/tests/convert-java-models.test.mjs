import assert from "node:assert/strict";
import test from "node:test";

import { addTankFillLevels, convertCrushingWheelObj, convertJavaModel } from "../tools/convert-java-models.mjs";

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

test("Crushing Wheel OBJ conversion emits standard cuboids instead of unsupported poly meshes", () => {
	const geometry = convertCrushingWheelObj({
		identifier: "geometry.createbedrock.crushing_wheel",
		source: "v 0 0 0\nv 1 0 0\nf 1 2 1\nusemtl crushing_wheel_plates\n"
	});
	const cubes = geometry["minecraft:geometry"][0].bones[0].cubes;
	assert.ok(cubes.length >= 10);
	assert.equal(JSON.stringify(geometry).includes("poly_mesh"), false);
	assert.equal(cubes.some(cube => cube.uv.north.material_instance === "crushing_wheel_insert"), true);
});

test("Fluid Tank fill variants retain source cubes and append a fluid material cube", () => {
	const base = convertJavaModel({
		identifier: "geometry.createbedrock.fluid_tank",
		model: {
			elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: "create:block/fluid_tank", uv: [0, 0, 16, 16] } } }]
		}
	});
	const variants = addTankFillLevels(base, "fluid_tank");
	assert.equal(variants.length, 4);
	const fourth = variants[3]["minecraft:geometry"][0];
	assert.equal(fourth.description.identifier, "geometry.createbedrock.fluid_tank_level_4");
	assert.equal(fourth.bones[0].cubes.at(-1).uv.up.material_instance, "fluid_fill");
});
