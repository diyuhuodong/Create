import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("kinetic visual entity float properties use float ranges and defaults", async () => {
	const directory = resolve(root, "behavior_pack/entities");
	const files = (await readdir(directory)).filter(file => file.endsWith("_visual.json"));
	for (const file of files) {
		const source = await readFile(resolve(directory, file), "utf8");
		assert.match(source, /"createbedrock:rpm": \{ "type": "float", "range": \[-256\.0, 256\.0\], "default": 0\.0/);
	}
});

test("kinetic visual controllers resolve a distinct animation alias", async () => {
	for (const file of ["shaft_visual.entity.json", "cogwheel_visual.entity.json", "large_cogwheel_visual.entity.json", "crushing_wheel_visual.entity.json", "creative_motor_visual.entity.json"]) {
		const entity = JSON.parse(await readFile(resolve(root, "resource_pack/entity", file), "utf8"));
		const description = entity["minecraft:client_entity"].description;
		const controller = description.scripts.animate[0];
		assert.match(controller, /_controller$/);
		assert.match(description.animations[controller], /^controller\.animation\.createbedrock\./);
	}
});

test("creative motor visual renders only Java's rotating half shaft through one controller per shaft texture", async () => {
	const [entitySource, controllerSource, animationSource] = await Promise.all([
		readFile(resolve(root, "resource_pack/entity/creative_motor_visual.entity.json"), "utf8"),
		readFile(resolve(root, "resource_pack/render_controllers/createbedrock.render_controllers.json"), "utf8"),
		readFile(resolve(root, "resource_pack/animations/kinetic-visual.animation.json"), "utf8")
	]);
	const entity = JSON.parse(entitySource)["minecraft:client_entity"].description;
	assert.deepEqual(Object.keys(entity.textures), ["axis", "axis_top"]);
	assert.equal(entity.render_controllers.length, 2);
	assert.match(controllerSource, /controller\.render\.createbedrock\.creative_motor_axis_top/);
	assert.match(controllerSource, /Geometry\.axis_top_vertical/);
	assert.match(animationSource, /"motor_axis_shaft_orientation"/);
	assert.match(animationSource, /"motor_axis_top_shaft_orientation"/);
	assert.match(animationSource, /"variable\.axis_x"/);
	assert.match(animationSource, /"variable\.rotation_angle"/);
	assert.match(entitySource, /"pre_animation"/);
	assert.match(entitySource, /variable\.rotation_angle = variable\.rotation_angle \+ variable\.rpm \* 6 \* query\.delta_time/);
});

test("creative motor keeps its static block shell while its visual lookup shares the entity spawn position", async () => {
	const [blockSource, contractSource, runtimeSource] = await Promise.all([
		readFile(resolve(root, "behavior_pack/blocks/creative_motor.json"), "utf8"),
		readFile(resolve(root, "behavior_pack/scripts/kinetics/kinetic-visual-contract.js"), "utf8"),
		readFile(resolve(root, "behavior_pack/scripts/kinetics/kinetic-visual-runtime.js"), "utf8")
	]);
	const block = JSON.parse(blockSource)["minecraft:block"];
	assert.deepEqual(block.description.properties["createbedrock:kinetic_visual"], [0, 1]);
	assert.equal(block.permutations.some(permutation => permutation.condition === "query.block_state('createbedrock:kinetic_visual') == 1"), false);
	assert.match(contractSource, /creative_motor[^\n]+hidesBlock: false/);
	assert.match(runtimeSource, /setVisualBlockState\(block, Boolean\(visual\.hidesBlock\)\)/);
	assert.match(runtimeSource, /function visualLocation\(location\)/);
	assert.match(runtimeSource, /dimension\.spawnEntity\(visual\.entityType, visualLocation\(node\.location\)\)/);
});

test("creative motor opens its RPM editor only from the visible Java-style value box", async () => {
	const [runtimeSource, equipmentSource] = await Promise.all([
		readFile(resolve(root, "behavior_pack/scripts/kinetics/kinetic-runtime.js"), "utf8"),
		readFile(resolve(root, "behavior_pack/scripts/equipment/equipment-runtime.js"), "utf8")
	]);
	assert.match(runtimeSource, /new ModalFormData\(\)/);
	assert.match(runtimeSource, /world\.beforeEvents\.playerInteractWithBlock\.subscribe/);
	assert.match(runtimeSource, /isCreativeMotorValueBox/);
	assert.match(runtimeSource, /visible value box therefore opens an exact-RPM editor/);
	assert.match(runtimeSource, /showCreativeMotorConfiguration\(block, player\)/);
	assert.doesNotMatch(runtimeSource, /CREATIVE_MOTOR_CONFIGURATION_HOLD_TICKS/);
	assert.match(equipmentSource, /standard face-based rotation/);
});
