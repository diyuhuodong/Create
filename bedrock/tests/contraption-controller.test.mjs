import assert from "node:assert/strict";
import test from "node:test";

import { ContraptionController } from "../behavior_pack/scripts/contraptions/contraption-controller.js";

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function createWorld({ failSpawn = false } = {}) {
	const blocks = new Map([
		["0:64:0", { typeId: "createbedrock:shaft", states: { axis: "x" } }],
		["1:64:0", { typeId: "createbedrock:millstone", data: { progress: 7 } }]
	]);
	const entities = new Set();
	return {
		blocks,
		entities,
		canPlace(location) {
			return !blocks.has(locationKey(location));
		},
		placeBlock(block) {
			blocks.set(locationKey(block.location), { ...block });
		},
		readBlock(location) {
			return blocks.get(locationKey(location));
		},
		removeBlock(location) {
			blocks.delete(locationKey(location));
		},
		removeContraption(entityId) {
			entities.delete(entityId);
		},
		spawnContraption() {
			if (failSpawn)
				throw new Error("spawn failed");
			entities.add("entity-1");
			return "entity-1";
		}
	};
}

test("ContraptionController assembles and disassembles atomically", () => {
	const world = createWorld();
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];

	controller.assemble({ id: "bearing-1", anchor: locations[0], locations });
	assert.equal(world.blocks.size, 0);
	assert.deepEqual([...world.entities], ["entity-1"]);
	assert.equal(controller.disassemble("bearing-1", { x: 4, y: 70, z: 4 }), true);
	assert.equal(world.blocks.size, 2);
	assert.equal(world.entities.size, 0);
	assert.equal(world.blocks.get("5:70:4").data.progress, 7);
});

test("ContraptionController restores removed blocks when entity creation fails", () => {
	const world = createWorld({ failSpawn: true });
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];

	assert.throws(() => controller.assemble({ id: "bearing-1", anchor: locations[0], locations }), /spawn failed/);
	assert.equal(world.blocks.size, 2);
	assert.equal(world.blocks.get("1:64:0").data.progress, 7);
});

test("ContraptionController leaves a contraption assembled when its destination is blocked", () => {
	const world = createWorld();
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	controller.assemble({ id: "bearing-1", anchor: locations[0], locations });
	world.blocks.set("4:70:4", { typeId: "minecraft:stone" });

	assert.equal(controller.disassemble("bearing-1", { x: 4, y: 70, z: 4 }), false);
	assert.ok(controller.getActive("bearing-1"));
	assert.deepEqual([...world.entities], ["entity-1"]);
});

test("ContraptionController restores assembled contraptions after a restart", () => {
	const sourceWorld = createWorld();
	const source = new ContraptionController(sourceWorld);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	source.assemble({ id: "bearing-1", anchor: locations[0], locations });

	const restoredWorld = createWorld();
	const restored = new ContraptionController(restoredWorld);
	restored.restore(source.snapshot());
	assert.ok(restored.getActive("bearing-1"));
	assert.deepEqual([...restoredWorld.entities], ["entity-1"]);
});
