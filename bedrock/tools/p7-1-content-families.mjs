import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

import { convertJavaModel } from "./convert-java-models.mjs";

export const P7_1_CONTENT_SCHEMA_VERSION = 1;

const GENERATED_ROOT = "generated/p7_1";
const CONTENT_CATALOG_PATH = "data/p7-1-content-families.json";
const FALLBACK_BLOCK_TEXTURE = "andesite_casing";
const FALLBACK_ITEM_TEXTURE = "cardboard";
const FUNCTIONAL_FAMILIES = new Set(["nixie", "postbox", "sail", "table_cloth", "valve_handle", "vertical_gearbox"]);
const P8_1_FUNCTIONAL_COLOR_FAMILIES = new Set(["nixie", "postbox", "sail", "table_cloth", "valve_handle"]);
const DYE_COLOR_PREFIX = /^(black|blue|brown|cyan|gray|green|light_blue|light_gray|lime|magenta|orange|pink|purple|red|white|yellow)_/;

function identifierFromJava(javaIdentifier) {
	return javaIdentifier.replace(/^create:/, "createbedrock:");
}

function sourceKey(kind, javaIdentifier) {
	return `${kind}:${javaIdentifier}`;
}

function displayName(identifier) {
	return identifier.split("_").map(word => word.length === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

function familyFor(identifier) {
	if (identifier === "vertical_gearbox")
		return "vertical_gearbox";
	if (identifier.endsWith("_slab"))
		return "slab";
	if (identifier.endsWith("_stairs"))
		return "stairs";
	if (identifier.endsWith("_wall"))
		return "wall";
	if (identifier.endsWith("_pane") || identifier.endsWith("_bars"))
		return "pane";
	if (identifier.endsWith("_window"))
		return "window";
	if (identifier.endsWith("_seat"))
		return "seat";
	if (identifier.endsWith("_table_cloth"))
		return "table_cloth";
	if (identifier.endsWith("_nixie_tube"))
		return "nixie";
	if (identifier.endsWith("_postbox"))
		return "postbox";
	if (identifier.endsWith("_sail"))
		return "sail";
	if (identifier.endsWith("_valve_handle"))
		return "valve_handle";
	if (identifier.endsWith("_pillar") || identifier.includes("copper_shingles") || identifier.includes("copper_tiles"))
		return "column";
	return "full_cube";
}

function geometryFor(entry) {
	const family = entry.family;
	if (entry.geometry === "source")
		return `geometry.createbedrock.p7_1_${entry.identifier}`;
	if (family === "vertical_gearbox")
		return "geometry.createbedrock.gearbox";
	if (family === "slab")
		return "geometry.createbedrock.p7_1_slab_bottom";
	if (family === "stairs")
		return "geometry.createbedrock.p7_1_stairs_bottom";
	if (family === "pane")
		return "geometry.createbedrock.p7_1_pane";
	if (["seat", "table_cloth", "valve_handle"].includes(family))
		return "geometry.createbedrock.p7_1_low_profile";
	return "geometry.createbedrock.p7_1_full_cube";
}

function renderMethodFor(family) {
	return ["pane", "window"].includes(family) ? "alpha_test" : "opaque";
}

function collisionFor(family) {
	if (family === "pane")
		return { origin: [-1, 0, -8], size: [2, 16, 16] };
	if (["seat", "table_cloth", "valve_handle"].includes(family))
		return { origin: [-8, 0, -8], size: [16, 4, 16] };
	if (family === "slab")
		return { origin: [-8, 0, -8], size: [16, 8, 16] };
	return undefined;
}

function materialInstances(texture, renderMethod) {
	return {
		all: { texture, render_method: renderMethod },
		"*": { texture, render_method: renderMethod }
	};
}

function signalPermutations(property) {
	return Array.from({ length: 16 }, (_, signal) => ({
		condition: `query.block_state('${property}') == ${signal}`,
		components: { "minecraft:light_emission": signal }
	}));
}

function blockDefinition(entry) {
	const family = entry.family;
	const components = {
		"minecraft:destructible_by_explosion": { explosion_resistance: family === "pane" ? 1.5 : 6 },
		"minecraft:destructible_by_mining": { seconds_to_destroy: family === "pane" ? 0.3 : 1.5 },
		"minecraft:geometry": geometryFor(entry),
		"minecraft:item_visual": {
			geometry: { identifier: geometryFor(entry) },
			material_instances: materialInstances(entry.texture.key, renderMethodFor(family))
		},
		"minecraft:loot": `loot_tables/blocks/${GENERATED_ROOT}/${entry.identifier}.json`,
		"minecraft:material_instances": materialInstances(entry.texture.key, renderMethodFor(family))
	};
	const collision = collisionFor(family);
	if (collision) {
		components["minecraft:collision_box"] = collision;
		components["minecraft:selection_box"] = collision;
	}
	const description = {
		identifier: `createbedrock:${entry.identifier}`,
		menu_category: { category: "construction", group: "itemGroup.name.misc" }
	};
	const permutations = [];
	if (family === "nixie") {
		description.properties = { "createbedrock:display_signal": Array.from({ length: 16 }, (_, value) => value) };
		description.traits = { "minecraft:placement_direction": { enabled_states: ["minecraft:facing_direction"] } };
		components["minecraft:redstone_conductivity"] = { redstone_conductor: true };
		components["minecraft:redstone_consumer"] = { min_power: 0, propagates_power: false };
		components["createbedrock:redstone_input"] = {};
		permutations.push(...signalPermutations("createbedrock:display_signal"));
	}
	if (family === "table_cloth") {
		description.properties = {
			"createbedrock:display_count": [0, 1, 2, 3, 4],
			"createbedrock:shop": [0, 1]
		};
		description.traits = { "minecraft:placement_direction": { enabled_states: ["minecraft:facing_direction"] } };
		permutations.push({
			condition: "query.block_state('createbedrock:shop') == 1",
			components: { "minecraft:light_emission": 1 }
		});
	}
	if (["slab", "stairs"].includes(family)) {
		description.traits = { "minecraft:placement_position": { enabled_states: ["minecraft:vertical_half"] } };
		permutations.push({
			condition: "query.block_state('minecraft:vertical_half') == 'top'",
			components: {
				"minecraft:geometry": family === "slab" ? "geometry.createbedrock.p7_1_slab_top" : "geometry.createbedrock.p7_1_stairs_top",
				...(family === "slab" ? { "minecraft:collision_box": { origin: [-8, 8, -8], size: [16, 8, 16] }, "minecraft:selection_box": { origin: [-8, 8, -8], size: [16, 8, 16] } } : {})
			}
		});
	}
	if (["stairs", "seat", "window", "vertical_gearbox"].includes(family))
		description.traits = { ...(description.traits ?? {}), "minecraft:placement_direction": { enabled_states: ["minecraft:cardinal_direction"] } };
	return {
		format_version: "1.26.0",
		"minecraft:block": {
			description,
			components,
			...(permutations.length > 0 ? { permutations } : {})
		}
	};
}

function blockLoot(entry) {
	return { pools: [{ rolls: 1, entries: [{ type: "item", name: `createbedrock:${entry.identifier}` }] }] };
}

function itemDefinition(entry) {
	return {
		format_version: "1.26.0",
		"minecraft:item": {
			description: { identifier: `createbedrock:${entry.identifier}`, menu_category: { category: "items", group: "itemGroup.name.misc" } },
			components: { "minecraft:icon": entry.texture.key, "minecraft:max_stack_size": 64 }
		}
	};
}

async function exists(file) {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
	}
}

async function jsonFiles(directory) {
	const files = [];
	try {
		for (const child of await readdir(directory, { withFileTypes: true })) {
			const file = resolve(directory, child.name);
			if (child.isDirectory())
				files.push(...await jsonFiles(file));
			else if (child.name.endsWith(".json"))
				files.push(file);
		}
	} catch {
		// A content kind such as entities is optional for this generator.
	}
	return files;
}

async function definedIdentifiers(directory, rootKey, ignoredRoot) {
	const identifiers = new Set();
	for (const file of await jsonFiles(directory)) {
		if (ignoredRoot && file.startsWith(ignoredRoot))
			continue;
		const definition = JSON.parse(await readFile(file, "utf8"));
		const identifier = definition[rootKey]?.description?.identifier;
		if (typeof identifier === "string")
			identifiers.add(identifier);
	}
	return identifiers;
}

async function readLanguage(repositoryRoot, name) {
	return JSON.parse(await readFile(resolve(repositoryRoot, "src/main/resources/assets/create/lang", name), "utf8"));
}

async function modelTextureSource(repositoryRoot, identifier) {
	const roots = [
		resolve(repositoryRoot, "src/generated/resources/assets/create/models/block"),
		resolve(repositoryRoot, "src/main/resources/assets/create/models/block")
	];
	const modelFile = async name => {
		for (const root of roots) {
			const file = resolve(root, `${name}.json`);
			if (await exists(file))
				return file;
		}
		return undefined;
	};
	const load = async (name, seen = new Set()) => {
		if (seen.has(name))
			return {};
		seen.add(name);
		const file = await modelFile(name);
		if (!file)
			return {};
		const model = JSON.parse(await readFile(file, "utf8"));
		const parent = typeof model.parent === "string" && model.parent.startsWith("create:block/")
			? await load(model.parent.slice("create:block/".length), seen)
			: {};
		return { ...parent, ...model, textures: { ...(parent.textures ?? {}), ...(model.textures ?? {}) }, sourceModel: relative(repositoryRoot, file).replaceAll("\\", "/") };
	};
	const model = await load(identifier);
	const resolvedModel = Object.keys(model.textures ?? {}).length > 0 || model.sourceModel
		? model
		: identifier.endsWith("_postbox") ? await load(`${identifier}_closed`) : model;
	const textures = Object.values(resolvedModel.textures ?? {}).filter(value => typeof value === "string" && value.startsWith("create:block/"));
	const source = textures.find(value => !value.startsWith("#"));
	const sourcePath = source?.slice("create:block/".length);
	const textureFile = sourcePath && resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", `${sourcePath}.png`);
	if (sourcePath && await exists(textureFile))
		return { source: sourcePath, sourceModel: resolvedModel.sourceModel, verified: true };
	const familyTexture = await familyTextureSource(repositoryRoot, identifier);
	return { ...familyTexture, sourceModel: resolvedModel.sourceModel };
}

async function sourceModelGeometry(repositoryRoot, sourceModel) {
	if (!sourceModel)
		return false;
	const model = JSON.parse(await readFile(resolve(repositoryRoot, sourceModel), "utf8"));
	if (Array.isArray(model.elements) && model.elements.length > 0)
		return true;
	if (typeof model.parent !== "string" || !model.parent.startsWith("create:block/"))
		return false;
	const parent = model.parent.slice("create:block/".length);
	for (const root of ["src/generated/resources/assets/create/models/block", "src/main/resources/assets/create/models/block"]) {
		const candidate = resolve(repositoryRoot, root, `${parent}.json`);
		if (await exists(candidate) && await sourceModelGeometry(repositoryRoot, relative(repositoryRoot, candidate)))
			return true;
	}
	return false;
}

function wallTextureSource(identifier) {
	const type = identifier.replace(/_wall$/, "");
	const palette = name => `palettes/stone_types/${name}`;
	if (type.startsWith("polished_cut_"))
		return palette(`polished/${type.slice("polished_cut_".length)}_cut_polished`);
	if (type.startsWith("small_") && type.endsWith("_brick"))
		return palette(`small_brick/${type.slice("small_".length, -"_brick".length)}_cut_small_brick`);
	if (type.startsWith("cut_") && type.endsWith("_brick"))
		return palette(`brick/${type.slice("cut_".length, -"_brick".length)}_cut_brick`);
	if (type.startsWith("cut_"))
		return palette(`cut/${type.slice("cut_".length)}_cut`);
	return undefined;
}

function familyTextureCandidates(identifier) {
	const family = familyFor(identifier);
	if (family === "pane") {
		if (identifier.endsWith("_bars"))
			return [`bars/${identifier}`];
		return [`palettes/${identifier.replace(/_pane$/, "")}`];
	}
	if (family === "wall") {
		const texture = wallTextureSource(identifier);
		return texture ? [texture] : [];
	}
	if (["asurine", "crimsite", "ochrum", "veridium"].includes(identifier))
		return [`palettes/stone_types/natural/${identifier}_0`];
	if (["scorchia", "scoria", "limestone"].includes(identifier))
		return [`palettes/stone_types/${identifier}`];
	if (identifier === "vertical_gearbox")
		return ["gearbox"];
	if (identifier === "weathered_iron_window")
		return ["palettes/weathered_iron_window"];
	return [];
}

async function familyTextureSource(repositoryRoot, identifier) {
	for (const candidate of familyTextureCandidates(identifier)) {
		const file = resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", `${candidate}.png`);
		if (await exists(file))
			return { source: candidate, verified: true };
	}
	return { source: FALLBACK_BLOCK_TEXTURE, verified: false };
}

async function itemTextureSource(repositoryRoot, identifier) {
	const candidates = [
		identifier,
		...(identifier.startsWith("cardboard_package_") ? ["package/cardboard"] : []),
		...(identifier.startsWith("rare_") && identifier.endsWith("_package") ? [`package/${identifier.slice(0, -"_package".length)}`] : [])
	];
	for (const candidate of candidates) {
		const source = resolve(repositoryRoot, "src/main/resources/assets/create/textures/item", `${candidate}.png`);
		if (await exists(source))
			return { source: candidate, verified: true };
	}
	return { source: FALLBACK_ITEM_TEXTURE, verified: false };
}

async function initialCatalog({ bedrockRoot, repositoryRoot }) {
	const catalog = JSON.parse(await readFile(resolve(bedrockRoot, "data/java-registration-catalog.json"), "utf8"));
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const [blocks, items, english, chinese] = await Promise.all([
		definedIdentifiers(resolve(behaviorRoot, "blocks"), "minecraft:block", resolve(behaviorRoot, "blocks", GENERATED_ROOT)),
		definedIdentifiers(resolve(behaviorRoot, "items"), "minecraft:item", resolve(behaviorRoot, "items", GENERATED_ROOT)),
		readLanguage(repositoryRoot, "en_gb.json"),
		readLanguage(repositoryRoot, "zh_cn.json")
	]);
	const entries = [];
	for (const registration of catalog.entries) {
		if (!new Set(["block", "item"]).has(registration.kind))
			continue;
		const identifier = registration.javaIdentifier.slice("create:".length);
		const target = `createbedrock:${identifier}`;
		if (registration.kind === "block" && blocks.has(target))
			continue;
		if (registration.kind === "item" && (items.has(target) || identifier === "vertical_gearbox"))
			continue;
		const texture = registration.kind === "block"
			? await modelTextureSource(repositoryRoot, identifier)
			: await itemTextureSource(repositoryRoot, identifier);
		const langKey = `${registration.kind}.create.${identifier}`;
		entries.push({
			english: english[langKey] ?? displayName(identifier),
			family: registration.kind === "block" ? familyFor(identifier) : "item",
			identifier,
			kind: registration.kind,
			sourceKey: registration.sourceKey,
			texture: {
				key: `createbedrock_p7_1_${identifier}`,
				source: texture.source,
				...(texture.sourceModel ? { sourceModel: texture.sourceModel } : {}),
				verified: texture.verified
			},
			chinese: chinese[langKey] ?? english[langKey] ?? displayName(identifier)
		});
	}
	const verticalGearbox = catalog.entries.find(entry => entry.sourceKey === sourceKey("item", "create:vertical_gearbox"));
	if (verticalGearbox) {
		const texture = await modelTextureSource(repositoryRoot, "vertical_gearbox");
		entries.push({
			english: english["block.create.vertical_gearbox"] ?? "Vertical Gearbox",
			family: "vertical_gearbox",
			identifier: "vertical_gearbox",
			kind: "block",
			sourceKey: verticalGearbox.sourceKey,
			texture: { key: "createbedrock_p7_1_vertical_gearbox", source: texture.source, ...(texture.sourceModel ? { sourceModel: texture.sourceModel } : {}), verified: texture.verified },
			chinese: chinese["block.create.vertical_gearbox"] ?? "Vertical Gearbox"
		});
	}
	entries.sort((left, right) => left.identifier.localeCompare(right.identifier));
	return {
		entries,
		generatedAt: "deterministic",
		generatedFrom: "bedrock/data/java-registration-catalog.json and Java language/model/texture assets",
		schemaVersion: P7_1_CONTENT_SCHEMA_VERSION
	};
}

export function validateP71ContentCatalog(document) {
	if (!document || document.schemaVersion !== P7_1_CONTENT_SCHEMA_VERSION || document.generatedAt !== "deterministic" || !Array.isArray(document.entries))
		throw new TypeError("P7.1 content-family catalog has an invalid header");
	const identifiers = new Set();
	for (const entry of document.entries) {
		if (!["block", "item"].includes(entry?.kind) || typeof entry.identifier !== "string" || identifiers.has(entry.identifier)
			|| typeof entry.family !== "string" || typeof entry.sourceKey !== "string" || typeof entry.english !== "string" || typeof entry.chinese !== "string"
			|| typeof entry.texture?.key !== "string" || typeof entry.texture?.source !== "string" || typeof entry.texture?.verified !== "boolean")
			throw new Error("P7.1 content-family catalog contains an invalid entry");
		identifiers.add(entry.identifier);
	}
	return { blocks: document.entries.filter(entry => entry.kind === "block").length, entries: document.entries.length, items: document.entries.filter(entry => entry.kind === "item").length };
}

async function writeJson(file, value) {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function updateLanguage(file, entries) {
	const replacements = new Map(entries);
	const lines = (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean)
		.filter(line => !replacements.has(line.slice(0, line.indexOf("="))));
	for (const [key, value] of [...replacements].sort(([left], [right]) => left.localeCompare(right)))
		lines.push(`${key}=${value}`);
	await writeFile(file, `${lines.join("\n")}\n`);
}

function ledgerOverride(entry) {
	const functional = FUNCTIONAL_FAMILIES.has(entry.family);
	const p81FunctionalColor = P8_1_FUNCTIONAL_COLOR_FAMILIES.has(entry.family) && DYE_COLOR_PREFIX.test(entry.identifier);
	return {
		acquisition: p81FunctionalColor ? "verified" : "partial",
		behavior: p81FunctionalColor ? "verified" : functional ? "partial" : "not_required",
		family: `p7_1/${entry.family}`,
		mapping: { relation: "one_to_one", targets: [`createbedrock:${entry.identifier}`] },
		resources: entry.texture.verified ? "verified" : "partial",
		sourceKey: entry.sourceKey,
		status: p81FunctionalColor || (!functional && entry.texture.verified) ? "implemented" : "partial"
	};
}

async function updateMigrationOverrides(bedrockRoot, entries) {
	const file = resolve(bedrockRoot, "data/migration-overrides.json");
	const existing = JSON.parse(await readFile(file, "utf8"));
	const generatedKeys = new Set(entries.map(entry => entry.sourceKey));
	existing.entries = [...existing.entries.filter(entry => !generatedKeys.has(entry.sourceKey)), ...entries.map(ledgerOverride)]
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
	await writeJson(file, existing);
}

function textureAtlasEntry(entry) {
	const root = entry.kind === "item" ? "item" : "block";
	return [entry.texture.key, { textures: `textures/create_java/${root}/${entry.texture.source}` }];
}

async function updateTextureAtlas(file, entries) {
	const document = JSON.parse(await readFile(file, "utf8"));
	for (const [key, value] of entries.map(textureAtlasEntry))
		document.texture_data[key] = value;
	await writeJson(file, document);
}

export async function generateP71ContentFamilies({ bedrockRoot, repositoryRoot }) {
	if (!bedrockRoot || !repositoryRoot)
		throw new TypeError("P7.1 content generation requires Bedrock and repository roots");
	const catalogFile = resolve(bedrockRoot, CONTENT_CATALOG_PATH);
	const document = await exists(catalogFile)
		? JSON.parse(await readFile(catalogFile, "utf8"))
		: await initialCatalog({ bedrockRoot, repositoryRoot });
	for (const entry of document.entries) {
		if (!entry.texture.verified) {
			const texture = entry.kind === "block"
				? await modelTextureSource(repositoryRoot, entry.identifier)
				: await itemTextureSource(repositoryRoot, entry.identifier);
			entry.texture = {
				key: entry.texture.key,
				source: texture.source,
				...(texture.sourceModel ? { sourceModel: texture.sourceModel } : {}),
				verified: texture.verified
			};
		}
		if (entry.kind === "block")
			entry.geometry = await sourceModelGeometry(repositoryRoot, entry.texture.sourceModel) ? "source" : "family";
	}
	const coverage = validateP71ContentCatalog(document);
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	await Promise.all([
		rm(resolve(behaviorRoot, "blocks", GENERATED_ROOT), { force: true, recursive: true }),
		rm(resolve(behaviorRoot, "items", GENERATED_ROOT), { force: true, recursive: true }),
		rm(resolve(behaviorRoot, "loot_tables/blocks", GENERATED_ROOT), { force: true, recursive: true })
	]);
	for (const entry of document.entries) {
		if (entry.kind === "block") {
			await writeJson(resolve(behaviorRoot, "blocks", GENERATED_ROOT, `${entry.identifier}.json`), blockDefinition(entry));
			await writeJson(resolve(behaviorRoot, "loot_tables/blocks", GENERATED_ROOT, `${entry.identifier}.json`), blockLoot(entry));
		} else
			await writeJson(resolve(behaviorRoot, "items", GENERATED_ROOT, `${entry.identifier}.json`), itemDefinition(entry));
	}
	await writeJson(catalogFile, document);
	await Promise.all([
		updateTextureAtlas(resolve(bedrockRoot, "resource_pack/textures/terrain_texture.json"), document.entries.filter(entry => entry.kind === "block")),
		updateTextureAtlas(resolve(bedrockRoot, "resource_pack/textures/item_texture.json"), document.entries.filter(entry => entry.kind === "item")),
		updateLanguage(resolve(bedrockRoot, "resource_pack/texts/en_US.lang"), document.entries.map(entry => [`${entry.kind === "block" ? "tile" : "item"}.createbedrock:${entry.identifier}.name`, entry.english])),
		updateLanguage(resolve(bedrockRoot, "resource_pack/texts/zh_CN.lang"), document.entries.map(entry => [`${entry.kind === "block" ? "tile" : "item"}.createbedrock:${entry.identifier}.name`, entry.chinese])),
		updateMigrationOverrides(bedrockRoot, document.entries)
	]);
	return { ...coverage, resourceFallbacks: document.entries.filter(entry => !entry.texture.verified).length };
}

export async function importP71Textures({ resourcePackRoot, repositoryRoot, document }) {
	validateP71ContentCatalog(document);
	let imported = 0;
	for (const entry of document.entries) {
		if (!entry.texture.verified)
			continue;
		const root = entry.kind === "item" ? "item" : "block";
		const source = resolve(repositoryRoot, "src/main/resources/assets/create/textures", root, `${entry.texture.source}.png`);
		const destination = resolve(resourcePackRoot, "textures/create_java", root, `${entry.texture.source}.png`);
		await mkdir(dirname(destination), { recursive: true });
		await cp(source, destination);
		imported++;
	}
	return imported;
}

async function resolvedP71Model(repositoryRoot, sourceModel, seen = new Set()) {
	if (!sourceModel || seen.has(sourceModel))
		return {};
	seen.add(sourceModel);
	const model = JSON.parse(await readFile(resolve(repositoryRoot, sourceModel), "utf8"));
	let parent = {};
	if (typeof model.parent === "string" && model.parent.startsWith("create:block/")) {
		const name = model.parent.slice("create:block/".length);
		for (const root of ["src/generated/resources/assets/create/models/block", "src/main/resources/assets/create/models/block"]) {
			const candidate = resolve(repositoryRoot, root, `${name}.json`);
			if (await exists(candidate)) {
				parent = await resolvedP71Model(repositoryRoot, relative(repositoryRoot, candidate), seen);
				break;
			}
		}
	}
	return {
		...parent,
		...model,
		elements: model.elements ?? parent.elements,
		textures: { ...(parent.textures ?? {}), ...(model.textures ?? {}) }
	};
}

export async function convertP71Models({ resourcePackRoot, repositoryRoot, document }) {
	validateP71ContentCatalog(document);
	const outputRoot = resolve(resourcePackRoot, "models/blocks");
	await mkdir(outputRoot, { recursive: true });
	let converted = 0;
	for (const entry of document.entries.filter(candidate => candidate.kind === "block" && candidate.geometry === "source")) {
		const model = await resolvedP71Model(repositoryRoot, entry.texture.sourceModel);
		if (!Array.isArray(model.elements) || model.elements.length === 0)
			throw new Error(`P7.1 source geometry ${entry.identifier} has no resolved Java elements`);
		const geometry = convertJavaModel({
			identifier: `geometry.createbedrock.p7_1_${entry.identifier}`,
			materialName: "all",
			model
		});
		await writeJson(resolve(outputRoot, `p7_1_${entry.identifier}.geo.json`), geometry);
		converted++;
	}
	return converted;
}
