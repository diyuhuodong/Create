import assert from "node:assert/strict";
import test from "node:test";

import { ContraptionController } from "../behavior_pack/scripts/contraptions/contraption-controller.js";

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function createWorld({ assemblyAttachments, failPlaceAt, failSpawn = false, failSpawnAt, rotationCollision } = {}) {
	const blocks = new Map([
		["0:64:0", { typeId: "createbedrock:shaft", states: { axis: "x" } }],
		["1:64:0", { typeId: "createbedrock:millstone", data: { progress: 7 } }]
	]);
	const entities = new Set();
	const rotations = new Map();
	const restoredAttachments = [];
	let placements = 0;
	let spawnAttempts = 0;
	let shouldFailSpawn = failSpawn;
	let nextRotationCollision = rotationCollision;
	return {
		blocks,
		entities,
		rotations,
		restoredAttachments,
		failNextSpawn() {
			shouldFailSpawn = true;
		},
		setRotationCollision(collision) {
			nextRotationCollision = collision;
		},
		canPlace(location) {
			return !blocks.has(locationKey(location));
		},
		findRotationCollision() {
			return nextRotationCollision;
		},
		captureAssemblyData() {
			return assemblyAttachments;
		},
		restoreAssemblyData(attachments, origin) {
			restoredAttachments.push({ attachments, origin: { ...origin } });
		},
		placeBlock(block) {
			placements++;
			if (placements === failPlaceAt)
				throw new Error("place failed");
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
		isContraptionValid(entityId) {
			return entities.has(entityId);
		},
		setContraptionRotation(entityId, rotation) {
			rotations.set(entityId, rotation);
		},
		spawnContraption() {
			spawnAttempts++;
			if (shouldFailSpawn || spawnAttempts === failSpawnAt) {
				shouldFailSpawn = false;
				throw new Error("spawn failed");
			}
			const entityId = `entity-${spawnAttempts}`;
			entities.add(entityId);
			return entityId;
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

test("ContraptionController rolls back partially written blocks when disassembly fails", () => {
	const world = createWorld({ failPlaceAt: 2 });
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	controller.assemble({ id: "bearing-1", anchor: locations[0], locations });

	assert.throws(() => controller.disassemble("bearing-1", { x: 4, y: 70, z: 4 }), /place failed/);
	assert.equal(world.blocks.size, 0);
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

test("ContraptionController validates a restore batch before spawning any entities", () => {
	const sourceWorld = createWorld();
	const source = new ContraptionController(sourceWorld);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	source.assemble({ id: "bearing-1", anchor: locations[0], locations });
	const [valid] = source.snapshot();
	const invalid = { ...valid, id: "bearing-2", rotation: Number.NaN };
	const restoredWorld = createWorld();
	const restored = new ContraptionController(restoredWorld);

	assert.throws(() => restored.restore([valid, invalid]), /Invalid contraption rotation/);
	assert.equal(restoredWorld.entities.size, 0);
	assert.equal(restored.getActive("bearing-1"), undefined);
});

test("ContraptionController rolls back earlier entities when a restore spawn fails", () => {
	const sourceWorld = createWorld();
	const source = new ContraptionController(sourceWorld);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	source.assemble({ id: "bearing-1", anchor: locations[0], locations });
	const [first] = source.snapshot();
	const second = { ...first, id: "bearing-2" };
	const restoredWorld = createWorld({ failSpawnAt: 2 });
	const restored = new ContraptionController(restoredWorld);

	assert.throws(() => restored.restore([first, second]), /spawn failed/);
	assert.equal(restoredWorld.entities.size, 0);
	assert.equal(restored.getActive("bearing-1"), undefined);
});

test("ContraptionController persists and restores its rotation state", () => {
	const sourceWorld = createWorld();
	const source = new ContraptionController(sourceWorld);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	source.assemble({ id: "bearing-1", anchor: locations[0], locations });
	source.setRotation("bearing-1", 120);
	assert.equal(sourceWorld.rotations.get("entity-1"), 120);

	const restoredWorld = createWorld();
	const restored = new ContraptionController(restoredWorld);
	restored.restore(source.snapshot());
	assert.equal(restored.getActive("bearing-1").rotation, 120);
	assert.equal(restoredWorld.rotations.get("entity-1"), 120);
});

test("ContraptionController restores block positions at the selected quarter turn", () => {
	const world = createWorld();
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	controller.assemble({ id: "bearing-1", anchor: locations[0], locations });

	assert.equal(controller.disassemble("bearing-1", { x: 4, y: 70, z: 4 }, 1), true);
	assert.ok(world.blocks.has("4:70:4"));
	assert.ok(world.blocks.has("4:70:5"));
});

test("ContraptionController refuses a corrupted persisted snapshot", () => {
	const sourceWorld = createWorld();
	const source = new ContraptionController(sourceWorld);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	source.assemble({ id: "bearing-1", anchor: locations[0], locations });
	const [record] = source.snapshot();
	record.snapshot.blocks[0].typeId = "createbedrock:cogwheel";

	const restored = new ContraptionController(createWorld());
	assert.throws(() => restored.restore([record]), /checksum mismatch/);
});

test("ContraptionController refuses a non-finite persisted rotation", () => {
	const sourceWorld = createWorld();
	const source = new ContraptionController(sourceWorld);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	source.assemble({ id: "bearing-1", anchor: locations[0], locations });
	const [record] = source.snapshot();
	record.rotation = Number.NaN;

	const restoredWorld = createWorld();
	const restored = new ContraptionController(restoredWorld);
	assert.throws(() => restored.restore([record]), /Invalid contraption rotation/);
	assert.equal(restoredWorld.entities.size, 0);
});

test("ContraptionController rebuilds a missing entity from its authoritative snapshot", () => {
	const world = createWorld();
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	controller.assemble({ id: "bearing-1", anchor: locations[0], locations });
	controller.setRotation("bearing-1", 45);
	world.entities.clear();

	assert.equal(controller.ensureEntity("bearing-1"), true);
	const active = controller.getActive("bearing-1");
	assert.deepEqual([...world.entities], [active.entityId]);
	assert.equal(world.rotations.get(active.entityId), 45);
	assert.equal(active.snapshot.schemaVersion, 2);
});

test("ContraptionController records an entity recovery failure reason", () => {
	const world = createWorld();
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	controller.assemble({ id: "bearing-1", anchor: locations[0], locations });
	world.entities.clear();
	world.failNextSpawn();

	assert.equal(controller.ensureEntity("bearing-1"), false);
	assert.match(controller.getActive("bearing-1").recoveryError, /spawn failed/);
	assert.equal(controller.ensureEntity("bearing-1"), true);
	assert.equal(controller.getActive("bearing-1").recoveryError, undefined);
});

test("ContraptionController freezes a rotation that would hit the world", () => {
	const world = createWorld({
		rotationCollision: { location: { x: 0, y: 64, z: 1 }, reason: "world_blocked" }
	});
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	controller.assemble({ id: "bearing-1", anchor: locations[0], locations });

	assert.equal(controller.setRotation("bearing-1", 45), false);
	assert.equal(controller.getActive("bearing-1").rotation, 0);
	assert.equal(controller.getActive("bearing-1").blockedReason, "world_blocked:0:64:1");
	world.setRotationCollision(undefined);
	assert.equal(controller.setRotation("bearing-1", 45), true);
	assert.equal(controller.getActive("bearing-1").blockedReason, undefined);
});

test("ContraptionController rotates and restores assembly attachments on disassembly", () => {
	const world = createWorld({
		assemblyAttachments: {
			kineticBeltLinks: [{ left: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 } }]
		}
	});
	const controller = new ContraptionController(world);
	const locations = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }];
	controller.assemble({ id: "bearing-1", anchor: locations[0], locations });
	assert.equal(controller.disassemble("bearing-1", { x: 10, y: 70, z: 10 }, 1), true);

	assert.deepEqual(world.restoredAttachments, [{
		attachments: {
			kineticBeltLinks: [{ left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 1 } }]
		},
		origin: { x: 10, y: 70, z: 10 }
	}]);
});
