import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const bedrockRoot = resolve(import.meta.dirname, "..");

async function text(path) {
	return readFile(resolve(bedrockRoot, path), "utf8");
}

test("R1 declares stable server-ui and wires all configuration entry points through versioned forms", async () => {
	const manifest = JSON.parse(await text("behavior_pack/manifest.json"));
	assert.deepEqual(manifest.dependencies.find(dependency => dependency.module_name === "@minecraft/server-ui"), {
		module_name: "@minecraft/server-ui",
		version: "2.1.0"
	});
	const ui = await text("behavior_pack/scripts/redstone/redstone-device-ui.js");
	assert.match(ui, /ActionFormData, ModalFormData/);
	assert.match(ui, /showRedstoneDeviceConfigurationForm/);
	assert.match(ui, /showLinkedControllerConfigurationForm/);
	assert.match(ui, /showLecternControllerUseForm/);
	const runtime = await text("behavior_pack/scripts/redstone/redstone-device-runtime.js");
	assert.match(runtime, /configureRedstoneDevice/);
	assert.match(runtime, /showRedstoneDeviceConfigurationForm/);
	assert.match(runtime, /showLinkedControllerConfigurationForm/);
	assert.match(runtime, /openLecternController/);
	assert.match(runtime, /linked-controller-item-state/);
});

test("R1 keeps Controller state on an explicitly non-stackable ItemStack", async () => {
	const item = JSON.parse(await text("behavior_pack/items/linked_controller.json"));
	assert.equal(item["minecraft:item"].components["minecraft:max_stack_size"], 1);
});
