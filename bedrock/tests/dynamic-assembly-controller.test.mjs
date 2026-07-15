import assert from "node:assert/strict";
import test from "node:test";

import { ASSEMBLY_SUBBLOCK_UNITS, createAssemblyTransform } from "../behavior_pack/scripts/contraptions/assembly-transform.js";
import { DynamicAssemblyController } from "../behavior_pack/scripts/contraptions/dynamic-assembly-controller.js";

function keyFor(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function createWorld({ collision, failSpawn = false } = {}) {
	const blocks = new Map([["0:64:0", { typeId: "createbedrock:andesite_casing" }], ["1:64:0", { typeId: "createbedrock:andesite_casing" }]]);
	const projections = new Map();
	let nextProjection = 0;
	return {
		blocks,
		captureAssemblyData() { return { marker: "captured" }; },
		canPlace(location) { return !blocks.has(keyFor(location)); },
		findTransformCollision(snapshot, from, to) { return collision?.(snapshot, from, to); },
		isAssemblyProjectionValid(id) { return projections.has(id); },
		placeBlock(block) { blocks.set(keyFor(block.location), { typeId: block.typeId }); },
		readBlock(location) {
			const block = blocks.get(keyFor(location));
			return block && { ...block, states: {} };
		},
		removeAssemblyProjection(id) { projections.delete(id); },
		removeBlock(location) { blocks.delete(keyFor(location)); },
		restoreAssemblyData() {},
		setAssemblyProjectionTransform(id, transform) {
			const projection = projections.get(id);
			if (!projection)
				throw new Error("projection is missing");
			projection.transform = transform;
		},
		spawnAssemblyProjection({ id, snapshot, transform }) {
			if (failSpawn)
				throw new Error("spawn rejected");
			const projectionId = `${id}:${++nextProjection}`;
			projections.set(projectionId, { id, snapshot, transform });
			return projectionId;
		}
	};
}

test("DynamicAssemblyController owns source blocks, freezes collisions, recovers projections, and restores exactly once", () => {
	const world = createWorld({
		collision(snapshot, from, to) {
			return to.translation.x === ASSEMBLY_SUBBLOCK_UNITS ? { location: { x: 4, y: 64, z: 0 }, reason: "world_blocked" } : undefined;
		}
	});
	const controller = new DynamicAssemblyController(world);
	const active = controller.assemble({
		anchor: { x: 0, y: 64, z: 0 },
		id: "bearing:a",
		locations: [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }],
		owner: { kind: "bearing" }
	});
	assert.equal(active.phase, "active");
	assert.equal(world.blocks.size, 0);
	assert.throws(() => controller.assemble({
		anchor: { x: 0, y: 64, z: 0 }, id: "bearing:b", locations: [{ x: 0, y: 64, z: 0 }]
	}), /already owned/);
	assert.equal(controller.setTransform("bearing:a", createAssemblyTransform({ translation: { x: ASSEMBLY_SUBBLOCK_UNITS, y: 0, z: 0 } })), false);
	assert.match(controller.getActive("bearing:a").frozenReason, /world_blocked:4:64:0/);
	assert.equal(controller.setTransform("bearing:a", createAssemblyTransform()), true);
	const projection = controller.getActive("bearing:a").projectionId;
	world.removeAssemblyProjection(projection);
	assert.equal(controller.ensureProjection("bearing:a"), true);
	assert.equal(controller.disassemble("bearing:a"), true);
	assert.equal(world.blocks.size, 2);
	assert.equal(controller.snapshot().length, 0);
});

test("DynamicAssemblyController restores a validated authority record and refuses mid-block disassembly", () => {
	const source = new DynamicAssemblyController(createWorld());
	source.assemble({
		anchor: { x: 0, y: 64, z: 0 }, id: "bearing:restore", locations: [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }]
	});
	source.setTransform("bearing:restore", createAssemblyTransform({ translation: { x: ASSEMBLY_SUBBLOCK_UNITS / 2, y: 0, z: 0 } }));
	const restoredWorld = createWorld();
	restoredWorld.blocks.clear();
	const restored = new DynamicAssemblyController(restoredWorld);
	restored.restore(source.snapshot());
	assert.equal(restored.disassemble("bearing:restore"), false);
	assert.equal(restored.setTransform("bearing:restore", createAssemblyTransform()), true);
	assert.equal(restored.disassemble("bearing:restore"), true);
});

test("DynamicAssemblyController detaches shared assembly attachments before endpoint blocks", () => {
	const world = createWorld();
	const events = [];
	const removeBlock = world.removeBlock;
	world.captureAssemblyData = () => ({ physicalBeltRuns: [{ name: "line" }] });
	world.detachAssemblyData = attachments => {
		assert.deepEqual(attachments, { physicalBeltRuns: [{ name: "line" }] });
		events.push("detach");
	};
	world.removeBlock = location => {
		assert.deepEqual(events, ["detach"]);
		removeBlock(location);
	};
	const controller = new DynamicAssemblyController(world);
	controller.assemble({
		anchor: { x: 0, y: 64, z: 0 }, id: "bearing:attachment-order", locations: [{ x: 0, y: 64, z: 0 }]
	});
	assert.deepEqual(events, ["detach"]);
});
