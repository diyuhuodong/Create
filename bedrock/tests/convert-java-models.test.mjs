import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { addTankFillLevels, convertBlazeBurnerObj, convertCreativeMotorShaftProxy, convertCreativeMotorValueBoard, convertCreativeMotorVisual, creativeMotorValueBoardAnimation, convertCrushingWheelControllerProxy, convertCrushingWheelObj, convertCrushingWheelVisual, convertCubeColumnParent, convertFullCubeParent, convertJavaModel } from "../tools/convert-java-models.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
	assert.equal(cubes.length, 29);
	assert.equal(JSON.stringify(geometry).includes("poly_mesh"), false);
	assert.equal(cubes.some(cube => cube.uv.north.material_instance === "crushing_wheel_insert"), true);
	assert.equal(cubes.filter(cube => cube.rotation?.[1] !== undefined).length, 16);
	assert.equal(cubes.filter(cube => cube.rotation?.[1] === 0).length, 1);
	assert.equal(cubes.some(cube => cube.origin[1] === 1.904 && cube.size[1] === 12.192), true);
	assert.equal(cubes.some(cube => cube.size[0] === 8 * 30 / 34.250432 && cube.size[1] === 14), true);
});

test("Crushing Wheel Controller retains Java's invisible internal render contract", () => {
	const geometry = convertCrushingWheelControllerProxy("geometry.createbedrock.crushing_wheel_controller");
	const definition = geometry["minecraft:geometry"][0];
	assert.equal(definition.description.identifier, "geometry.createbedrock.crushing_wheel_controller");
	assert.equal(definition.bones[0].cubes, undefined);
});

test("Crushing Wheel visual uses a Creative-Motor-style root with a solid disc and rim-only teeth", () => {
	const geometry = convertCrushingWheelVisual({
		identifier: "geometry.createbedrock.crushing_wheel_visual",
		source: "v 0 0 0\nv 1 0 0\nf 1 2 1\nusemtl plates\n"
	});
	const definition = geometry["minecraft:geometry"][0];
	const cubes = definition.bones.flatMap(bone => bone.cubes ?? []);
	assert.equal(definition.description.texture_width, 160);
	assert.equal(definition.bones[0].name, "crushing_wheel_orientation");
	assert.equal(definition.bones[1].name, "crushing_wheel");
	assert.equal(definition.bones[1].parent, "crushing_wheel_orientation");
	assert.equal(definition.bones.filter(bone => bone.parent === "crushing_wheel").length, 4);
	assert.equal(cubes.length, 29);
	assert(cubes.some(cube => cube.origin[2] === -17.125216), "dynamic wheel must retain Java's 2.140625-block footprint");
	assert.equal(cubes.filter(cube => cube.rotation?.[1] !== undefined).length, 16);
	assert.equal(cubes.filter(cube => cube.uv.north.uv[0] === 0).length, 16);
	assert.equal(cubes.filter(cube => cube.uv.north.uv[0] === 32).length, 11);
	assert.deepEqual(Object.values(cubes[0].uv)[0].material_instance, "default");
	assert(cubes.some(cube => Object.values(cube.uv)[0].uv[0] === 32), "insert faces must use the atlas second tile");
	assert(cubes.some(cube => Object.values(cube.uv)[0].uv[0] === 64), "axis faces must use the atlas third tile");
	assert(cubes.some(cube => Object.values(cube.uv).some(face => face.uv[0] === 96)), "axle caps must use the axis end-grain tile");
	assert(cubes.some(cube => Object.values(cube.uv)[0].uv[0] === 128), "wood core must use Java's spruce-log end-grain tile");
});

test("Crushing Wheel production visual keeps a symmetric tooth skeleton and maps the insert texture once", async () => {
	const source = await readFile(resolve(projectRoot, "src/main/resources/assets/create/models/block/crushing_wheel/crushing_wheel.obj"), "utf8");
	const geometry = convertCrushingWheelVisual({
		identifier: "geometry.createbedrock.crushing_wheel_visual",
		source
	});
	const bones = geometry["minecraft:geometry"][0].bones;
	const cubes = bones.flatMap(bone => bone.cubes ?? []);
	const materialOffset = cube => Object.values(cube.uv)[0].uv[0];
	const toothBones = bones.filter(bone => /^crushing_wheel_tooth_\d+$/.test(bone.name));
	const teeth = toothBones.flatMap(bone => bone.cubes ?? []);
	const insert = cubes.filter(cube => materialOffset(cube) === 32);
	assert.equal(cubes.length, 29);
	assert.equal(teeth.length, 16);
	assert.equal(new Set(teeth.map(cube => cube.size.join(":"))).size, 1, "every tooth must retain the same dimensions");
	assert.equal(new Set(toothBones.map(bone => bone.rotation[1])).size, 16, "teeth must be evenly distributed around the wheel");
	assert.equal(new Set(teeth.map(cube => cube.rotation[1])).size, 1, "every tooth must use the same diagonal sweep");
	assert.equal(insert.length, 11);
	assert(new Set(insert.map(cube => cube.uv.up.uv.join(":"))).size > 1, "insert bands must share one texture space instead of repeating the wooden centre");
	assert(insert.some(cube => cube.uv.up.uv_size[0] < 32 || cube.uv.up.uv_size[1] < 32), "insert edges must receive texture slices rather than repeat the full tile");
	assert.equal(cubes.filter(cube => materialOffset(cube) === 128).length, 1, "wood texture belongs only to the central hub cube");
	assert(cubes.some(cube => cube.origin[2] === -17.125216), "dynamic wheel must retain Java's 2.140625-block footprint");
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

test("Creative Motor visual is one complete machine skeleton with a static casing and rotating shaft", () => {
	const geometry = convertCreativeMotorVisual({
		identifier: "geometry.createbedrock.creative_motor_visual_horizontal",
		orientation: "horizontal",
		casingModel: {
			textures: { casing: "create:block/creative_casing", panel: "create:block/flap_display_front" },
			elements: [{
				from: [0, 0, 0], to: [16, 16, 16],
				faces: { north: { texture: "#casing", uv: [0, 0, 16, 16] }, south: { texture: "#panel", uv: [0, 0, 16, 16] } }
			}]
		},
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
	assert.equal(geometry["minecraft:geometry"][0].description.texture_width, 80);
	assert.deepEqual(bones.map(bone => bone.name), ["motor_root", "motor_casing", "motor_shaft_horizontal"]);
	assert.equal(bones[1].parent, "motor_root");
	assert.equal(bones[2].parent, "motor_root");
	assert.deepEqual(bones[1].cubes[0].uv.north, { material_instance: "default", uv: [32, 0], uv_size: [16, 16] });
	assert.deepEqual(bones[1].cubes[0].uv.south, { material_instance: "default", uv: [64, 0], uv_size: [16, 16] });
	assert.deepEqual(bones[2].cubes[0].origin, [-2, 6, 0]);
	assert.deepEqual(bones[2].cubes[0].size, [4, 4, 8]);
	assert.equal(bones[2].cubes[0].uv.south.material_instance, "default");
	assert.throws(() => convertCreativeMotorVisual({ identifier: "invalid", casingModel: {}, orientation: "diagonal", shaftModel: {} }));
});

test("Creative Motor value board is a compact face-attached 3D number", () => {
	const geometry = convertCreativeMotorValueBoard("geometry.createbedrock.creative_motor_value_board");
	const bones = geometry["minecraft:geometry"][0].bones;
	assert.equal(geometry["minecraft:geometry"][0].description.texture_width, 2);
	assert.equal(bones[0].name, "board_root");
	assert.equal(bones.some(bone => bone.name === "board_outline"), true);
	assert.equal(bones.find(bone => bone.name === "board_outline").cubes.length, 4);
	assert.equal(bones.some(bone => bone.name === "board_backplate"), false);
	assert.equal(bones.some(bone => bone.name === "board_hundreds_2"), true);
	assert.equal(bones.some(bone => bone.name === "board_tens_5"), true);
	assert.equal(bones.some(bone => bone.name === "board_ones_6"), true);
	assert.equal(bones.some(bone => bone.name === "board_forward"), false);
	assert.equal(bones.some(bone => bone.name === "board_reverse"), false);
	const animation = creativeMotorValueBoardAnimation().animations["animation.createbedrock.creative_motor_value_board"];
	assert.match(animation.bones.board_root.rotation[0], /createbedrock:face/);
	assert.deepEqual(animation.bones.board_root.scale, [0.45, 0.45, 0.45]);
	assert.match(animation.bones.board_ones_6.scale[0], /digit_ones/);
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
