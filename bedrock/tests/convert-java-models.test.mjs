import assert from "node:assert/strict";
import test from "node:test";

import { addTankFillLevels, convertBlazeBurnerObj, convertCreativeMotorShaftProxy, convertCreativeMotorVisual, convertCrushingWheelControllerProxy, convertCrushingWheelObj, convertCubeColumnParent, convertFullCubeParent, convertJavaModel } from "../tools/convert-java-models.mjs";

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

test("cube_all parent conversion emits a named Java-equivalent cube", () => {
	const geometry = convertFullCubeParent({
		identifier: "geometry.createbedrock.rose_quartz_lamp",
		model: {
			parent: "minecraft:block/cube_all",
			textures: { all: "create:block/rose_quartz_lamp" }
		}
	});
	const cube = geometry["minecraft:geometry"][0].bones[0].cubes[0];
	assert.deepEqual(cube.origin, [-8, 0, -8]);
	assert.deepEqual(cube.size, [16, 16, 16]);
	assert.equal(cube.uv.north.material_instance, "all");
	assert.throws(() => convertFullCubeParent({
		identifier: "geometry.createbedrock.invalid",
		model: { parent: "minecraft:block/cube_all", textures: {} }
	}));
});

test("cube_column parent conversion preserves its end and side materials", () => {
	const geometry = convertCubeColumnParent({
		identifier: "geometry.createbedrock.railway_casing",
		model: {
			parent: "minecraft:block/cube_column",
			textures: {
				end: "create:block/railway_casing",
				side: "create:block/railway_casing_side"
			}
		}
	});
	const cube = geometry["minecraft:geometry"][0].bones[0].cubes[0];
	assert.equal(cube.uv.up.material_instance, "end");
	assert.equal(cube.uv.down.material_instance, "end");
	assert.equal(cube.uv.north.material_instance, "side");
});

test("Crushing Wheel OBJ conversion emits standard cuboids instead of unsupported poly meshes", () => {
	const geometry = convertCrushingWheelObj({
		identifier: "geometry.createbedrock.crushing_wheel",
		source: "v 0 0 0\nv 1 0 0\nf 1 2 1\nusemtl crushing_wheel_plates\n"
	});
	const cubes = geometry["minecraft:geometry"][0].bones[0].cubes;
	assert.ok(cubes.length >= 30);
	assert.equal(JSON.stringify(geometry).includes("poly_mesh"), false);
	assert.equal(cubes.some(cube => cube.uv.north.material_instance === "crushing_wheel_insert"), true);
	assert.equal(cubes.filter(cube => cube.rotation?.[1] !== undefined).length, 28);
	for (const axis of [0, 2]) {
		const minimum = Math.min(...cubes.map(cube => cube.origin[axis]));
		const maximum = Math.max(...cubes.map(cube => cube.origin[axis] + cube.size[axis]));
		assert.ok(maximum - minimum <= 30);
	}
});

test("Crushing Wheel Controller retains Java's invisible internal render contract", () => {
	const geometry = convertCrushingWheelControllerProxy("geometry.createbedrock.crushing_wheel_controller");
	const definition = geometry["minecraft:geometry"][0];
	assert.equal(definition.description.identifier, "geometry.createbedrock.crushing_wheel_controller");
	assert.equal(definition.bones[0].cubes, undefined);
});

test("Creative Motor keeps its casing static and converts Java's protruding front shaft exactly", () => {
	const geometry = convertCreativeMotorShaftProxy({
		identifier: "geometry.createbedrock.creative_motor_shaft",
		model: {
			textures: { "0": "create:block/axis", "1": "create:block/axis_top" },
			elements: [{
				name: "Axis",
				from: [6, 6, 8],
				to: [10, 10, 16],
				faces: {
					north: { texture: "#1", uv: [6, 6, 10, 10], rotation: 180 },
					south: { texture: "#1", uv: [6, 6, 10, 10] },
					east: { texture: "#0", uv: [6, 0, 10, 8], rotation: 270 },
					west: { texture: "#0", uv: [6, 0, 10, 8], rotation: 90 },
					up: { texture: "#0", uv: [6, 0, 10, 8], rotation: 180 },
					down: { texture: "#0", uv: [6, 0, 10, 8] }
				}
			}]
		}
	});
	const bones = geometry["minecraft:geometry"][0].bones;
	assert.equal(bones[0].name, "motor_orientation");
	assert.equal(bones[1].name, "motor_shaft");
	assert.equal(bones[1].parent, "motor_orientation");
	assert.deepEqual(bones[1].cubes[0].origin, [-2, 6, 0]);
	assert.deepEqual(bones[1].cubes[0].size, [4, 4, 8]);
	assert.equal(bones[1].cubes[0].uv.south.material_instance, "axis_top");
	assert.equal(bones[1].cubes[0].rotation, undefined);
});

test("Creative Motor visual contains only independently renderable rotating shaft bones", () => {
	const geometry = convertCreativeMotorVisual({
		identifier: "geometry.createbedrock.creative_motor_visual_axis",
		material: "axis",
		shaftModel: {
			textures: { side: "create:block/axis", cap: "create:block/axis_top" },
			elements: [{
				name: "Axis", from: [6, 6, 8], to: [10, 10, 16],
				faces: {
					east: { texture: "#side", uv: [6, 0, 10, 8] },
					south: { texture: "#cap", uv: [6, 6, 10, 10] }
				}
			}]
		}
	});
	const bones = geometry["minecraft:geometry"][0].bones;
	assert.deepEqual(bones.map(bone => bone.name), ["motor_axis_shaft_orientation", "motor_axis_shaft"]);
	assert.deepEqual(Object.keys(bones[1].cubes[0].uv), ["east"]);
	assert.deepEqual(bones[1].cubes[0].origin, [-2, 8, -2]);
	assert.deepEqual(bones[1].cubes[0].size, [4, 8, 4]);
	assert.equal(bones[1].parent, "motor_axis_shaft_orientation");
	assert.throws(() => convertCreativeMotorVisual({ identifier: "invalid", shaftModel: {}, material: "not_a_java_texture" }));
});

test("Blaze Burner OBJ conversion retains a state-swappable brazier, blaze, and flame silhouette", () => {
	const geometry = convertBlazeBurnerObj({
		identifier: "geometry.createbedrock.blaze_burner",
		source: "v 0 0 0\nv 1 0 0\nf 1 2 1\nusemtl m_1\n"
	});
	const cubes = geometry["minecraft:geometry"][0].bones[0].cubes;
	assert.equal(cubes.some(cube => cube.uv.north.material_instance === "blaze_heater_brazier"), true);
	assert.equal(cubes.some(cube => cube.uv.north.material_instance === "blaze_face"), true);
	assert.equal(cubes.some(cube => cube.uv.north.material_instance === "blaze_flame"), true);
	assert.equal(JSON.stringify(geometry).includes("poly_mesh"), false);
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
