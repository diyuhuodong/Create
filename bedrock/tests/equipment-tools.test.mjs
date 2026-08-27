import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { clearGogglesDiagnosticAdaptersForTesting, gogglesDiagnosticAdapterIds, queryGogglesDiagnostics, registerGogglesDiagnosticAdapter } from "../behavior_pack/scripts/equipment/goggles-diagnostics-registry.js";
import { bindToolboxSlot, createToolboxBindings, readToolboxBindings, reconcileToolboxBindings } from "../behavior_pack/scripts/equipment/toolbox-bindings.js";
import { clearWrenchHandlersForTesting, invokeWrenchHandler, registerWrenchHandler } from "../behavior_pack/scripts/equipment/wrench-handler-registry.js";

test("Goggles registry exposes seven read-only domain adapters", () => {
	clearGogglesDiagnosticAdaptersForTesting();
	for (const domain of ["kinetics", "processing", "fluids", "logistics", "redstone", "contraptions", "trains"])
		registerGogglesDiagnosticAdapter({ id: domain, supports: context => context.domain === domain, inspect: () => ({ title: domain, lines: ["ok"], revision: 1 }) });
	assert.equal(gogglesDiagnosticAdapterIds().length, 7);
	assert.equal(queryGogglesDiagnostics({ domain: "fluids" }).adapterId, "fluids");
	assert.equal(queryGogglesDiagnostics({ domain: "unknown" }), undefined);
});

test("Wrench registry fails closed and never falls through to generic deletion", () => {
	clearWrenchHandlersForTesting();
	registerWrenchHandler({ actions: ["rotate"], id: "safe", supports: context => context.typeId === "createbedrock:cogwheel", invoke: () => ({ handled: true }) });
	assert.equal(invokeWrenchHandler({ typeId: "minecraft:chest" }, "remove").reason, "unsupported");
	assert.equal(invokeWrenchHandler({ typeId: "createbedrock:cogwheel" }, "rotate").handled, true);
});

test("Wrench has a localized display name and uses a cancellable block-interaction route", async () => {
	const root = resolve(import.meta.dirname, "..");
	const [itemSource, equipmentSource, chineseLanguage] = await Promise.all([
		readFile(resolve(root, "behavior_pack/items/wrench.json"), "utf8"),
		readFile(resolve(root, "behavior_pack/scripts/equipment/equipment-runtime.js"), "utf8"),
		readFile(resolve(root, "resource_pack/texts/zh_CN.lang"), "utf8")
	]);
	assert.equal(JSON.parse(itemSource)["minecraft:item"].components["minecraft:display_name"].value, "item.createbedrock:wrench.name");
	assert.match(chineseLanguage, /^item\.createbedrock:wrench\.name=扳手$/m);
	assert.match(equipmentSource, /world\.beforeEvents\.playerInteractWithBlock\.subscribe/);
	assert.match(equipmentSource, /scheduleWrenchBlock\(event\.player/);
	assert.match(equipmentSource, /event\.isFirstEvent === false/);
	assert.match(equipmentSource, /Wrench interaction failed/);
	assert.match(equipmentSource, /player\.isSneaking \? "remove" : "rotate"/);
});

test("Wrench is a bound 3D attachable with a separately animated gear", async () => {
	const root = resolve(import.meta.dirname, "..");
	const [attachableSource, geometrySource, animationSource, itemAtlasSource] = await Promise.all([
		readFile(resolve(root, "resource_pack/attachables/wrench.attachable.json"), "utf8"),
		readFile(resolve(root, "resource_pack/models/entity/wrench.geo.json"), "utf8"),
		readFile(resolve(root, "resource_pack/animations/wrench.animation.json"), "utf8"),
		readFile(resolve(root, "resource_pack/textures/item_texture.json"), "utf8")
	]);
	const attachable = JSON.parse(attachableSource)["minecraft:attachable"].description;
	assert.equal(attachable.item["createbedrock:wrench"], "query.is_owner_identifier_any('minecraft:player')");
	assert.equal(attachable.geometry.default, "geometry.createbedrock.wrench");
	assert.equal(attachable.animations.gear_spin, "animation.createbedrock.wrench.gear_spin");
	const geometry = JSON.parse(geometrySource)["minecraft:geometry"][0];
	assert.equal(geometry.description.identifier, "geometry.createbedrock.wrench");
	assert.equal(geometry.bones.find(bone => bone.name === "wrench").binding, "q.item_slot_to_bone_name(context.item_slot)");
	assert.equal(geometry.bones.find(bone => bone.name === "gear").cubes.length, 4);
	assert.equal(JSON.parse(animationSource).animations["animation.createbedrock.wrench.gear_spin"].bones.gear.rotation[1], "query.life_time * 180.0");
	assert.equal(JSON.parse(itemAtlasSource).texture_data.createbedrock_wrench.textures, "textures/create_java/item/wrench");
});

test("Toolbox bindings migrate v1, cover nine hotbar slots, and reject stale CAS", () => {
	const migrated = readToolboxBindings({ compartment: 2, hotbarSlot: 1, revision: 3, schemaVersion: 1, toolboxId: "box:1" });
	assert.equal(migrated.schemaVersion, 2);
	let state = createToolboxBindings();
	for (let hotbarSlot = 0; hotbarSlot < 9; hotbarSlot++) {
		const result = bindToolboxSlot(state, { compartment: hotbarSlot % 8, hotbarSlot, revision: hotbarSlot, toolboxId: "box:1" }, state.revision);
		assert.equal(result.bound, true);
		state = result.state;
	}
	assert.equal(state.bindings.length, 9);
	assert.equal(bindToolboxSlot(state, { compartment: 0, hotbarSlot: 0, revision: 0, toolboxId: "box:2" }, 0).reason, "revision_conflict");
	assert.equal(reconcileToolboxBindings(state, binding => binding.hotbarSlot !== 4).bindings.length, 8);
});
