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

test("creative motor visual renders the complete Java machine through one controller and one texture atlas", async () => {
	const [entitySource, controllerSource, animationSource] = await Promise.all([
		readFile(resolve(root, "resource_pack/entity/creative_motor_visual.entity.json"), "utf8"),
		readFile(resolve(root, "resource_pack/render_controllers/createbedrock.render_controllers.json"), "utf8"),
		readFile(resolve(root, "resource_pack/animations/kinetic-visual.animation.json"), "utf8")
	]);
	const entity = JSON.parse(entitySource)["minecraft:client_entity"].description;
	assert.deepEqual(Object.keys(entity.textures), ["motor"]);
	assert.equal(entity.render_controllers.length, 1);
	assert.match(controllerSource, /controller\.render\.createbedrock\.creative_motor/);
	assert.match(controllerSource, /Geometry\.vertical/);
	assert.match(animationSource, /"motor_root"/);
	assert.match(animationSource, /"motor_shaft_horizontal"/);
	assert.match(animationSource, /"motor_shaft_vertical"/);
	assert.match(entitySource, /creative_motor_atlas/);
	assert.match(entitySource, /createbedrock:phase/);
	assert.match(entitySource, /variable\.root_x/);
	assert.match(animationSource, /"variable\.rotation_angle"/);
	assert.match(entitySource, /"pre_animation"/);
	assert.match(entitySource, /variable\.server_phase/);
});

test("crushing wheel uses the motor-style server phase and a separate orientation bone", async () => {
	const [behaviorSource, entitySource, animationSource] = await Promise.all([
		readFile(resolve(root, "behavior_pack/entities/crushing_wheel_visual.json"), "utf8"),
		readFile(resolve(root, "resource_pack/entity/crushing_wheel_visual.entity.json"), "utf8"),
		readFile(resolve(root, "resource_pack/animations/kinetic-visual.animation.json"), "utf8")
	]);
	assert.match(behaviorSource, /"createbedrock:phase"/);
	assert.match(entitySource, /variable\.server_phase/);
	assert.match(entitySource, /variable\.rotation_angle/);
	assert.match(entitySource, /crushing_wheel_visual_controller/);
	assert.match(animationSource, /"crushing_wheel_orientation"/);
	assert.match(animationSource, /"crushing_wheel"/);
});

test("creative motor hides its static block only after a whole-machine visual is spawned at the shared location", async () => {
	const [blockSource, contractSource, runtimeSource] = await Promise.all([
		readFile(resolve(root, "behavior_pack/blocks/creative_motor.json"), "utf8"),
		readFile(resolve(root, "behavior_pack/scripts/kinetics/kinetic-visual-contract.js"), "utf8"),
		readFile(resolve(root, "behavior_pack/scripts/kinetics/kinetic-visual-runtime.js"), "utf8")
	]);
	const block = JSON.parse(blockSource)["minecraft:block"];
	assert.deepEqual(block.description.properties["createbedrock:kinetic_visual"], [0, 1]);
	assert.equal(block.permutations.some(permutation => permutation.condition === "query.block_state('createbedrock:kinetic_visual') == 1"), true);
	assert.match(contractSource, /creative_motor[^\n]+hidesBlock: true/);
	assert.match(contractSource, /creative_motor[^\n]+usesPhase: true/);
	assert.match(runtimeSource, /setVisualBlockState\(block, Boolean\(visual\.hidesBlock\)\)/);
	assert.match(runtimeSource, /function advanceVisualPhase/);
	assert.match(runtimeSource, /createbedrock:phase/);
	assert.match(runtimeSource, /function visualLocation\(location\)/);
	assert.match(runtimeSource, /dimension\.spawnEntity\(visual\.entityType, visualLocation\(node\.location\)\)/);
	assert.match(runtimeSource, /const \[visual, \.\.\.duplicates\] = matches/);
	assert.match(runtimeSource, /duplicate\.remove\(\)/);
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
	assert.match(runtimeSource, /parseCreativeMotorSpeed/);
	assert.match(runtimeSource, /设为反转/);
	assert.doesNotMatch(runtimeSource, /CREATIVE_MOTOR_CONFIGURATION_HOLD_TICKS/);
	assert.match(equipmentSource, /standard face-based rotation/);
});

test("creative motor projects Java-style RPM and direction onto the focused wrench value board", async () => {
	const [boardEntitySource, clientEntitySource, runtimeSource, converterSource] = await Promise.all([
		readFile(resolve(root, "behavior_pack/entities/creative_motor_value_board.json"), "utf8"),
		readFile(resolve(root, "resource_pack/entity/creative_motor_value_board.entity.json"), "utf8"),
		readFile(resolve(root, "behavior_pack/scripts/kinetics/creative-motor-value-board.js"), "utf8"),
		readFile(resolve(root, "tools/convert-java-models.mjs"), "utf8")
	]);
	assert.match(boardEntitySource, /"createbedrock:digit_hundreds"/);
	assert.match(boardEntitySource, /"createbedrock:reverse"/);
	assert.match(boardEntitySource, /"is_summonable": true/);
	assert.match(clientEntitySource, /creative_motor_value_board/);
	assert.match(runtimeSource, /getBlockFromViewDirection/);
	assert.match(runtimeSource, /isCreativeMotorValueBox/);
	assert.match(runtimeSource, /faceLocation: hit\.faceLocation/);
	assert.match(runtimeSource, /valueBoxCoordinate\(faceLocation\?\.x\)/);
	assert.match(runtimeSource, /kineticWorld\.generatedSpeedAt/);
	assert.match(converterSource, /function creativeMotorValueBoardAnimation/);
	assert.match(converterSource, /digit_\$\{place\}/);
});
