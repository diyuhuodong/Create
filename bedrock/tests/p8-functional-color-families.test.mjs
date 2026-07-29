import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
	COLORED_NIXIE_TUBE_BLOCKS,
	COLORED_POSTBOX_BLOCKS,
	COLORED_SAIL_BLOCKS,
	COLORED_TABLE_CLOTH_BLOCKS,
	COLORED_VALVE_HANDLE_BLOCKS,
	TABLE_CLOTH_BLOCKS,
	VALVE_HANDLE_BLOCKS,
	WINDMILL_SAIL_BLOCKS
} from "../behavior_pack/scripts/kernel/functional-color-families.js";
import { isMovableBlockType } from "../behavior_pack/scripts/contraptions/movable-blocks.js";
import { collectNixieTubeGroup, composeNixieTubeDisplay } from "../behavior_pack/scripts/redstone/nixie-display.js";
import { createDisplayTargetState, writeDisplayTargetLine } from "../behavior_pack/scripts/redstone/display-target.js";
import { redstoneDeviceForBlock } from "../behavior_pack/scripts/redstone/redstone-device-catalog.js";
import { windmillSailCount } from "../behavior_pack/scripts/contraptions/windmill-sails.js";
import { TABLE_CLOTH_BLOCKS as RUNTIME_TABLE_CLOTH_BLOCKS } from "../behavior_pack/scripts/materials/table-cloth.js";

async function recipeFiles(root) {
	const entries = await readdir(root, { withFileTypes: true });
	return (await Promise.all(entries.map(async entry => {
		const path = resolve(root, entry.name);
		return entry.isDirectory() ? recipeFiles(path) : [path];
	}))).flat();
}

test("P8.1 exposes all 78 functional color variants through one authoritative family catalog", async () => {
	assert.equal(COLORED_NIXIE_TUBE_BLOCKS.length, 15);
	assert.equal(COLORED_POSTBOX_BLOCKS.length, 16);
	assert.equal(COLORED_SAIL_BLOCKS.length, 15);
	assert.equal(COLORED_TABLE_CLOTH_BLOCKS.length, 16);
	assert.equal(COLORED_VALVE_HANDLE_BLOCKS.length, 16);
	assert.equal(new Set([
		...COLORED_NIXIE_TUBE_BLOCKS, ...COLORED_POSTBOX_BLOCKS, ...COLORED_SAIL_BLOCKS,
		...COLORED_TABLE_CLOTH_BLOCKS, ...COLORED_VALVE_HANDLE_BLOCKS
	]).size, 78);
	for (const typeId of [
		...COLORED_NIXIE_TUBE_BLOCKS, ...COLORED_POSTBOX_BLOCKS, ...COLORED_SAIL_BLOCKS,
		...COLORED_TABLE_CLOTH_BLOCKS, ...COLORED_VALVE_HANDLE_BLOCKS
	])
		await access(resolve("behavior_pack", "blocks", "generated", "p7_1", `${typeId.split(":")[1]}.json`));
	assert.equal(TABLE_CLOTH_BLOCKS.length, 19);
	assert.deepEqual([...RUNTIME_TABLE_CLOTH_BLOCKS].sort(), [...TABLE_CLOTH_BLOCKS].sort());
	assert.equal(VALVE_HANDLE_BLOCKS.length, 17);
	const recipeSources = await Promise.all((await recipeFiles(resolve("behavior_pack", "recipes"))).map(file => readFile(file, "utf8")));
	for (const typeId of [
		...COLORED_NIXIE_TUBE_BLOCKS, ...COLORED_POSTBOX_BLOCKS, ...COLORED_SAIL_BLOCKS,
		...COLORED_TABLE_CLOTH_BLOCKS, ...COLORED_VALVE_HANDLE_BLOCKS
	])
		assert.ok(recipeSources.some(source => source.includes(`\"item\": \"${typeId}\"`)), `${typeId} needs a survival recipe`);
	const redNixie = JSON.parse(await readFile(resolve("behavior_pack", "blocks", "generated", "p7_1", "red_nixie_tube.json"), "utf8"))["minecraft:block"];
	const redTableCloth = JSON.parse(await readFile(resolve("behavior_pack", "blocks", "generated", "p7_1", "red_table_cloth.json"), "utf8"))["minecraft:block"];
	assert.deepEqual(redNixie.description.properties["createbedrock:display_signal"], Array.from({ length: 16 }, (_, value) => value));
	assert.equal(redNixie.components["minecraft:redstone_consumer"].propagates_power, false);
	assert.deepEqual(redTableCloth.description.properties["createbedrock:display_count"], [0, 1, 2, 3, 4]);
	assert.deepEqual(redTableCloth.description.properties["createbedrock:shop"], [0, 1]);
	const migrationLedger = JSON.parse(await readFile(resolve("data", "migration-ledger.json"), "utf8"));
	const statuses = new Map(migrationLedger.registrationEntries.map(entry => [entry.sourceKey, entry]));
	for (const typeId of [
		...COLORED_NIXIE_TUBE_BLOCKS, ...COLORED_POSTBOX_BLOCKS, ...COLORED_SAIL_BLOCKS,
		...COLORED_TABLE_CLOTH_BLOCKS, ...COLORED_VALVE_HANDLE_BLOCKS
	]) {
		const entry = statuses.get(`block:create:${typeId.slice("createbedrock:".length)}`);
		assert.deepEqual({ acquisition: entry?.acquisition, behavior: entry?.behavior, resources: entry?.resources, status: entry?.status }, {
			acquisition: "verified", behavior: "verified", resources: "verified", status: "implemented"
		});
	}
});

test("P8.1 color variants retain Nixie, windmill, redstone, and moving-assembly semantics", async () => {
	const redNixie = "createbedrock:red_nixie_tube";
	const display = text => writeDisplayTargetLine(createDisplayTargetState({ color: "blue", brightness: 5 }), { text }).state;
	const tubes = new Map([
		["0:0:0", { typeId: redNixie, facing: "north", display: display("A") }],
		["1:0:0", { typeId: redNixie, facing: "north", display: display("B") }],
		["2:0:0", { typeId: "createbedrock:blue_nixie_tube", facing: "north", display: display("C") }]
	]);
	const group = collectNixieTubeGroup({
		anchor: { x: 0, y: 0, z: 0 },
		readTube: location => tubes.get(`${location.x}:${location.y}:${location.z}`)
	});
	assert.equal(group.tubes.length, 2);
	assert.deepEqual(composeNixieTubeDisplay(group), { style: { color: "red", brightness: 5 }, text: "AB" });
	assert.equal(redstoneDeviceForBlock(redNixie)?.id, "nixie_tube");
	assert.equal(isMovableBlockType(redNixie), true);
	assert.equal(isMovableBlockType("createbedrock:red_sail"), true);
	assert.equal(windmillSailCount([{ typeId: "createbedrock:red_sail" }, { typeId: "createbedrock:blue_sail" }]), 2);
	assert.ok(WINDMILL_SAIL_BLOCKS.includes("createbedrock:red_sail"));
	const packageRuntime = await readFile(resolve("behavior_pack", "scripts", "logistics", "package-runtime.js"), "utf8");
	const fluidRuntime = await readFile(resolve("behavior_pack", "scripts", "fluids", "fluid-runtime.js"), "utf8");
	assert.match(packageRuntime, /isPostboxBlock\(typeId\)/);
	assert.match(fluidRuntime, /isValveHandleBlock\(event\.block\.typeId\)/);
});
