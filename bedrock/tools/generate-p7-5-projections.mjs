import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MOVABLE_BLOCK_TYPES } from "../behavior_pack/scripts/contraptions/movable-blocks.js";
import { defaultProjectionEntityType } from "../behavior_pack/scripts/contraptions/projection-registry.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const behaviorEntities = resolve(root, "behavior_pack", "entities");
const resourceEntities = resolve(root, "resource_pack", "entity");
const atlas = JSON.parse(await readFile(resolve(root, "resource_pack", "textures", "terrain_texture.json"), "utf8")).texture_data ?? {};

function firstTexture(components) {
	const materialInstances = components?.["minecraft:item_visual"]?.material_instances ?? components?.["minecraft:material_instances"];
	for (const material of Object.values(materialInstances ?? {}))
		if (typeof material?.texture === "string")
			return material.texture;
}

function texturePath(alias) {
	const value = atlas[alias]?.textures;
	if (typeof value === "string")
		return value;
	if (Array.isArray(value)) {
		const first = value.find(entry => typeof entry === "string" || typeof entry?.path === "string");
		return typeof first === "string" ? first : first?.path;
	}
}

function geometryFor(components) {
	const value = components?.["minecraft:item_visual"]?.geometry?.identifier ?? components?.["minecraft:geometry"];
	const identifier = typeof value === "string" ? value : value?.identifier;
	return !identifier || identifier === "minecraft:geometry.full_block" ? "geometry.createbedrock.contraption_marker" : identifier;
}

await mkdir(behaviorEntities, { recursive: true });
await mkdir(resourceEntities, { recursive: true });
const catalog = [];
for (const blockTypeId of [...MOVABLE_BLOCK_TYPES].sort()) {
	const path = blockTypeId.split(":")[1];
	const entityTypeId = defaultProjectionEntityType(blockTypeId);
	const block = JSON.parse(await readFile(resolve(root, "behavior_pack", "blocks", `${path}.json`), "utf8"));
	const components = block?.["minecraft:block"]?.components ?? {};
	const textureAlias = firstTexture(components);
	const texture = texturePath(textureAlias) ?? "textures/create_java/block/andesite_casing";
	const geometry = geometryFor(components);
	const behavior = {
		format_version: "1.26.0",
		"minecraft:entity": {
			description: { identifier: entityTypeId, is_experimental: false, is_spawnable: false, is_summonable: false },
			components: {
				"minecraft:collision_box": { height: .01, width: .01 },
				"minecraft:health": { max: 1, value: 1 },
				"minecraft:physics": { has_collision: false, has_gravity: false },
				"minecraft:pushable": { is_pushable: false, is_pushable_by_piston: false },
				"minecraft:type_family": { family: ["createbedrock_contraption_part"] }
			}
		}
	};
	const resource = {
		format_version: "1.10.0",
		"minecraft:client_entity": {
			description: {
				geometry: { default: geometry },
				identifier: entityTypeId,
				materials: { default: "entity_alphatest" },
				render_controllers: ["controller.render.createbedrock.contraption"],
				textures: { default: texture }
			}
		}
	};
	const file = `contraption_part_${path}.json`;
	await writeFile(resolve(behaviorEntities, file), `${JSON.stringify(behavior, null, 2)}\n`);
	await writeFile(resolve(resourceEntities, file.replace(".json", ".entity.json")), `${JSON.stringify(resource, null, 2)}\n`);
	catalog.push({ blockTypeId, entityTypeId, geometry, texture, textureAlias: textureAlias ?? null });
}
await writeFile(resolve(root, "p7-5-projection-catalog.json"), `${JSON.stringify({ entries: catalog, schemaVersion: 1 }, null, 2)}\n`);
console.log(`Generated ${catalog.length} dedicated dynamic-assembly projection families.`);
