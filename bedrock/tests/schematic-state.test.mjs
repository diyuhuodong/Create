import assert from "node:assert/strict";
import test from "node:test";

import {
	captureSchematicSelection,
	createSchematicSnapshot,
	parseSchematicSnapshot,
	SchematicPlacementController,
	serializeSchematicSnapshot
} from "../behavior_pack/scripts/schematics/schematic-state.js";

function key(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createWorld({ failAt } = {}) {
	const blocks = new Map();
	let writes = 0;
	return {
		blocks,
		canPlace(_dimensionId, _location, before) { return before === undefined || before.typeId === "minecraft:air"; },
		placeBlock(_dimensionId, location, block) {
			writes++;
			if (writes === failAt)
				throw new Error("simulated write failure");
			blocks.set(key(location), { states: clone(block.states), typeId: block.typeId });
		},
		readBlock(_dimensionId, location) { return clone(blocks.get(key(location))); },
		restoreBlock(_dimensionId, location, block) {
			if (block === undefined)
				blocks.delete(key(location));
			else
				blocks.set(key(location), clone(block));
		}
	};
}

const snapshot = createSchematicSnapshot({
	blocks: [
		{ offset: { x: 0, y: 0, z: 0 }, states: { "createbedrock:axis": "x" }, typeId: "createbedrock:shaft" },
		{ offset: { x: 1, y: 0, z: 0 }, states: {}, typeId: "createbedrock:cogwheel" }
	],
	name: "Test rig"
});

test("schematic snapshots are restricted, deterministic, and bounded item data", () => {
	const encoded = serializeSchematicSnapshot(snapshot);
	assert.deepEqual(parseSchematicSnapshot(encoded), snapshot);
	assert.throws(() => createSchematicSnapshot({
		blocks: [{ offset: { x: 0, y: 0, z: 0 }, typeId: "minecraft:chest" }]
	}), /only Create Bedrock blocks/);
	assert.throws(() => createSchematicSnapshot({
		blocks: [
			{ offset: { x: 0, y: 0, z: 0 }, typeId: "createbedrock:shaft" },
			{ offset: { x: 0, y: 0, z: 0 }, typeId: "createbedrock:cogwheel" }
		]
	}), /duplicate offset/);
});

test("schematic palette encoding keeps a full 512-block single-material capture portable", () => {
	const full = createSchematicSnapshot({
		blocks: Array.from({ length: 512 }, (_, x) => ({
			offset: { x, y: 0, z: 0 }, states: {}, typeId: "createbedrock:andesite_casing"
		})),
		name: "Full carriage"
	});
	const encoded = serializeSchematicSnapshot(full);
	assert.ok(encoded.length < 28_672);
	assert.equal(parseSchematicSnapshot(encoded).blocks.length, 512);
});

test("schematic capture refuses a partial foreign-block selection", () => {
	const blocks = new Map([
		["0:0:0", { typeId: "createbedrock:shaft", states: {} }],
		["1:0:0", { typeId: "minecraft:chest", states: {} }]
	]);
	assert.throws(() => captureSchematicSelection({
		first: { x: 0, y: 0, z: 0 },
		readBlock(location) { return blocks.get(key(location)); },
		second: { x: 1, y: 0, z: 0 }
	}), /foreign block/);
});

test("schematic placement preflights, batches, locks, and completes atomically", () => {
	const world = createWorld();
	const controller = new SchematicPlacementController(world);
	controller.begin({ anchor: { x: 10, y: 64, z: 10 }, dimensionId: "minecraft:overworld", id: "placement:one", ownerId: "player", snapshot });
	assert.throws(() => controller.begin({ anchor: { x: 10, y: 64, z: 10 }, dimensionId: "minecraft:overworld", id: "placement:two", snapshot }), /already reserved/);
	assert.deepEqual(controller.advance("placement:one", 1), { completed: false, id: "placement:one", processed: 1, rolledBack: false });
	assert.equal(world.blocks.get("10:64:10").typeId, "createbedrock:shaft");
	assert.deepEqual(controller.advance("placement:one", 1), { completed: true, id: "placement:one", processed: 1, rolledBack: false });
	assert.equal(world.blocks.get("11:64:10").typeId, "createbedrock:cogwheel");
	assert.deepEqual(controller.diagnostics(), { active: 0, completed: 1, reservations: 0, rolledBack: 0 });
});

test("schematic placement reverses every prior write when a later write fails", () => {
	const world = createWorld({ failAt: 2 });
	const controller = new SchematicPlacementController(world);
	controller.begin({ anchor: { x: 0, y: 0, z: 0 }, dimensionId: "minecraft:overworld", id: "placement:rollback", snapshot });
	assert.deepEqual(controller.advance("placement:rollback", 4), { completed: true, id: "placement:rollback", processed: 1, rolledBack: true });
	assert.equal(world.blocks.size, 0);
	assert.deepEqual(controller.diagnostics(), { active: 0, completed: 0, reservations: 0, rolledBack: 1 });
});

test("restored placement retains reservations and detects post-restart interference", () => {
	const world = createWorld();
	const first = new SchematicPlacementController(world);
	first.begin({ anchor: { x: 0, y: 0, z: 0 }, dimensionId: "minecraft:overworld", id: "placement:restart", snapshot });
	const records = first.activeRecords();
	const restored = new SchematicPlacementController(world);
	restored.restore(records);
	world.blocks.set("0:0:0", { states: {}, typeId: "minecraft:stone" });
	assert.deepEqual(restored.advance("placement:restart", 8), { completed: true, id: "placement:restart", processed: 0, rolledBack: true });
	assert.equal(world.blocks.get("0:0:0").typeId, "minecraft:stone");
});

test("a persisted write intent resumes idempotently after a restart between write and cursor commit", () => {
	const world = createWorld();
	const first = new SchematicPlacementController(world);
	first.begin({ anchor: { x: 0, y: 0, z: 0 }, dimensionId: "minecraft:overworld", id: "placement:intent", snapshot: createSchematicSnapshot({
		blocks: [{ offset: { x: 0, y: 0, z: 0 }, states: {}, typeId: "createbedrock:shaft" }]
	}) });
	assert.equal(first.prepare("placement:intent").phase, "write_intent");
	const records = first.activeRecords();
	world.placeBlock("minecraft:overworld", { x: 0, y: 0, z: 0 }, { states: {}, typeId: "createbedrock:shaft" });
	const restored = new SchematicPlacementController(world);
	restored.restore(records);
	assert.deepEqual(restored.commitPrepared("placement:intent"), { completed: true, id: "placement:intent", processed: 1, rolledBack: false });
	assert.equal(world.blocks.get("0:0:0").typeId, "createbedrock:shaft");
});
