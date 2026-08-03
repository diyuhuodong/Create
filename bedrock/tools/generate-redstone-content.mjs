import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REDSTONE_BLOCK_DEVICES } from "../behavior_pack/scripts/redstone/redstone-device-catalog.js";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
const resourceRoot = resolve(bedrockRoot, "resource_pack");

const CONTENT = {
	analog_lever: { english: "Analog Lever", chinese: "模拟拉杆", geometry: "geometry.createbedrock.redstone_analog_lever", texture: "createbedrock_redstone_analog_lever" },
	content_observer: { english: "Content Observer", chinese: "内容观察器", geometry: "geometry.createbedrock.redstone_content_observer", texture: "createbedrock_redstone_content_observer" },
	crushing_wheel_controller: { english: "Crushing Wheel Controller", chinese: "粉碎轮控制器", geometry: "geometry.createbedrock.crushing_wheel_controller", internal: true },
	display_link: { english: "Display Link", chinese: "显示链接器", geometry: "geometry.createbedrock.redstone_display_link", texture: "createbedrock_redstone_display_link" },
	lectern_controller: { english: "Lectern Controller", chinese: "讲台控制器", geometry: "geometry.createbedrock.redstone_lectern_controller", texture: "createbedrock_brass_casing" },
	nixie_tube: { english: "Nixie Tube", chinese: "数码管", geometry: "geometry.createbedrock.redstone_nixie_tube", texture: "createbedrock_redstone_nixie_tube" },
	powered_latch: { english: "Powered Latch", chinese: "通电锁存器", geometry: "geometry.createbedrock.redstone_powered_latch", texture: "createbedrock_redstone_diode" },
	powered_toggle_latch: { english: "Powered Toggle Latch", chinese: "通电切换锁存器", geometry: "geometry.createbedrock.redstone_powered_latch", texture: "createbedrock_redstone_diode" },
	pulse_extender: { english: "Pulse Extender", chinese: "脉冲延长器", geometry: "geometry.createbedrock.redstone_pulse_extender", texture: "createbedrock_redstone_pulse_extender" },
	pulse_repeater: { english: "Pulse Repeater", chinese: "脉冲中继器", geometry: "geometry.createbedrock.redstone_pulse_repeater", texture: "createbedrock_redstone_pulse_repeater" },
	pulse_timer: { english: "Pulse Timer", chinese: "脉冲计时器", geometry: "geometry.createbedrock.redstone_pulse_timer", texture: "createbedrock_redstone_pulse_timer" },
	redstone_contact: { english: "Redstone Contact", chinese: "红石触点", geometry: "geometry.createbedrock.redstone_contact", texture: "createbedrock_redstone_contact", count: 2 },
	redstone_link: { english: "Redstone Link", chinese: "红石链接器", geometry: "geometry.createbedrock.redstone_link", texture: "createbedrock_redstone_link", count: 2 },
	redstone_requester: { english: "Redstone Requester", chinese: "红石请求器", geometry: "geometry.createbedrock.redstone_requester", texture: "createbedrock_redstone_requester" },
	rotation_speed_controller: { english: "Rotation Speed Controller", chinese: "转速控制器", geometry: "geometry.createbedrock.redstone_rotation_speed_controller", texture: "createbedrock_redstone_rotation_speed_controller" },
	stock_link: { english: "Stock Link", chinese: "库存链接器", geometry: "geometry.createbedrock.redstone_stock_link", texture: "createbedrock_redstone_stock_link" }
};

function blockIdentifier(device) {
	return device.blockId.slice("createbedrock:".length);
}

function signalProperty(device) {
	if (device.id === "analog_lever" || device.id === "redstone_link")
		return { "createbedrock:signal": Array.from({ length: 16 }, (_, value) => value) };
	if (device.output)
		return { "createbedrock:powered": [0, 1] };
	if (device.id === "display_link" || device.id === "nixie_tube")
		return { "createbedrock:display_signal": Array.from({ length: 16 }, (_, value) => value) };
	return {};
}

function outputPermutations(device) {
	if (!device.output)
		return [];
	if (device.id === "analog_lever" || device.id === "redstone_link") {
		return Array.from({ length: 16 }, (_, power) => ({
			condition: `query.block_state('createbedrock:signal') == ${power}`,
			components: { "minecraft:redstone_producer": { power } }
		}));
	}
	return [0, 1].map(powered => ({
		condition: `query.block_state('createbedrock:powered') == ${powered}`,
		components: { "minecraft:redstone_producer": { power: powered ? 15 : 0 } }
	}));
}

function displayPermutations(device) {
	if (device.id !== "display_link" && device.id !== "nixie_tube")
		return [];
	return Array.from({ length: 16 }, (_, signal) => ({
		condition: `query.block_state('createbedrock:display_signal') == ${signal}`,
		components: { "minecraft:light_emission": signal }
	}));
}

function blockDefinition(device) {
	const content = CONTENT[device.id];
	if (!content)
		throw new Error(`Missing generated content description for ${device.id}`);
	const identifier = blockIdentifier(device);
	const components = {
		"minecraft:destructible_by_explosion": { explosion_resistance: 6 },
		"minecraft:destructible_by_mining": { seconds_to_destroy: 1 },
		"minecraft:redstone_conductivity": { redstone_conductor: true },
		"minecraft:geometry": content.geometry,
		...(content.internal ? {
			// Bedrock requires a material instance for every geometry declaration. The
			// internal Crushing Wheel Controller has no cubes, so this remains invisible.
			"minecraft:material_instances": {
				"*": { texture: content.texture ?? "createbedrock_brass_casing", render_method: "opaque" }
			},
			"minecraft:selection_box": false
		} : {
			"minecraft:item_visual": {
				geometry: { identifier: content.geometry },
				material_instances: {
					redstone_surface: { texture: content.texture, render_method: "opaque" },
					"*": { texture: content.texture, render_method: "opaque" }
				}
			},
			"minecraft:loot": `loot_tables/blocks/${identifier}.json`,
			"minecraft:material_instances": {
				redstone_surface: { texture: content.texture, render_method: "opaque" },
				"*": { texture: content.texture, render_method: "opaque" }
			}
		})
	};
	if (device.input) {
		components["minecraft:redstone_consumer"] = { min_power: 0, propagates_power: false };
		components["createbedrock:redstone_input"] = {};
	}
	return {
		format_version: "1.26.0",
		"minecraft:block": {
			description: {
				identifier: device.blockId,
				...(content.internal ? {} : { menu_category: { category: "items", group: "itemGroup.name.misc" } }),
				properties: signalProperty(device),
				traits: { "minecraft:placement_direction": { enabled_states: ["minecraft:facing_direction"] } }
			},
			components,
			...((device.output || device.id === "display_link" || device.id === "nixie_tube")
				? { permutations: [...outputPermutations(device), ...displayPermutations(device)] }
				: {})
		}
	};
}

function lootDefinition(device) {
	return {
		pools: [{ rolls: 1, entries: [{ type: "item", name: device.blockId }] }]
	};
}

function recipeDefinition(device) {
	const identifier = blockIdentifier(device);
	const content = CONTENT[device.id];
	return {
		format_version: "1.26.0",
		"minecraft:recipe_shapeless": {
			description: { identifier: `createbedrock:${identifier}` },
			tags: ["crafting_table"],
			ingredients: [
				{ item: "minecraft:redstone" },
				{ item: device.id.includes("pulse") ? "minecraft:redstone_torch" : "createbedrock:andesite_alloy" }
			],
			result: { item: device.blockId, ...(content.count ? { count: content.count } : {}) }
		}
	};
}

async function writeJson(file, value) {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function appendTranslation(file, entries) {
	const source = await readFile(file, "utf8");
	const lines = source.split("\n").filter(Boolean);
	const keys = new Set(lines.map(line => line.slice(0, line.indexOf("="))));
	for (const [key, value] of entries) {
		if (!keys.has(key))
			lines.push(`${key}=${value}`);
	}
	await writeFile(file, `${lines.join("\n")}\n`);
}

for (const device of REDSTONE_BLOCK_DEVICES) {
	const identifier = blockIdentifier(device);
	await writeJson(resolve(behaviorRoot, "blocks", `${identifier}.json`), blockDefinition(device));
	if (CONTENT[device.id].internal) {
		await Promise.all([
			rm(resolve(behaviorRoot, "loot_tables", "blocks", `${identifier}.json`), { force: true }),
			rm(resolve(behaviorRoot, "recipes", `${identifier}.json`), { force: true })
		]);
	} else {
		await writeJson(resolve(behaviorRoot, "loot_tables", "blocks", `${identifier}.json`), lootDefinition(device));
		await writeJson(resolve(behaviorRoot, "recipes", `${identifier}.json`), recipeDefinition(device));
	}
}

await writeJson(resolve(behaviorRoot, "items", "linked_controller.json"), {
	format_version: "1.26.0",
	"minecraft:item": {
		description: { identifier: "createbedrock:linked_controller", menu_category: { category: "items", group: "itemGroup.name.misc" } },
		components: { "minecraft:icon": "createbedrock_linked_controller", "minecraft:max_stack_size": 1 }
	}
});
await writeJson(resolve(behaviorRoot, "recipes", "linked_controller.json"), {
	format_version: "1.26.0",
	"minecraft:recipe_shapeless": {
		description: { identifier: "createbedrock:linked_controller" },
		tags: ["crafting_table"],
		ingredients: [{ item: "createbedrock:redstone_link" }, { item: "minecraft:stone_button" }],
		result: { item: "createbedrock:linked_controller" }
	}
});

await appendTranslation(resolve(resourceRoot, "texts", "en_US.lang"), [
	...REDSTONE_BLOCK_DEVICES.map(device => [`tile.${device.blockId}.name`, CONTENT[device.id].english]),
	["item.createbedrock:linked_controller.name", "Linked Controller"]
]);
await appendTranslation(resolve(resourceRoot, "texts", "zh_CN.lang"), [
	...REDSTONE_BLOCK_DEVICES.map(device => [`tile.${device.blockId}.name`, CONTENT[device.id].chinese]),
	["item.createbedrock:linked_controller.name", "链接控制器"]
]);

console.log(`Generated ${REDSTONE_BLOCK_DEVICES.length} native-redstone blocks, loot tables, recipes, and translations.`);
