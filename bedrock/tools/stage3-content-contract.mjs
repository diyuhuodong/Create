import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { plannedGeometryIdentifiers } from "./convert-java-models.mjs";
import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

const FOUNDATION_CONTENT_ACCEPTANCE_IDS = new Set([
	"CONTENT-ANDESITE-ALLOY-BLOCK-BLOCK",
	"CONTENT-DEEPSLATE-ZINC-ORE-BLOCK",
	"CONTENT-RAW-ZINC-BLOCK-BLOCK",
	"CONTENT-ROSE-QUARTZ-BLOCK-BLOCK",
	"CONTENT-WEATHERED-IRON-BLOCK-BLOCK",
	"CONTENT-ZINC-ORE-BLOCK"
]);

// These Java registrations are block-entity aliases whose Bedrock behavior is
// intentionally hosted by the listed shared placeable resource.
const CONTENT_IMPLEMENTATION_IDENTIFIERS = new Map([
	["CONTENT-BLAZE-HEATER-BLOCK_ENTITY", "createbedrock:blaze_burner"],
	["CONTENT-CHASSIS-BLOCK_ENTITY", "createbedrock:linear_chassis"],
	["CONTENT-COPYCAT-BLOCK_ENTITY", "createbedrock:copycat_panel"],
	["CONTENT-CRUSHED-RAW--ITEM", "createbedrock:crushed_raw_zinc"],
	["CONTENT-CURSED-BELL-BLOCK_ENTITY", "createbedrock:haunted_bell"],
	["CONTENT-FLAP-DISPLAY-BLOCK_ENTITY", "createbedrock:display_board"],
	["CONTENT-SLIDING-DOOR-BLOCK_ENTITY", "createbedrock:train_door"],
	["CONTENT-TABLE-CLOTH-BLOCK_ENTITY", "createbedrock:andesite_table_cloth"]
]);

export const STATIC_VISUAL_EXCEPTIONS = new Map([
	["createbedrock:linear_chassis", "Java chassis geometry is a cube; Bedrock retains its side texture while sticky-face overlays require a later render-controller upgrade."],
	["createbedrock:secondary_linear_chassis", "Java chassis geometry is a cube; Bedrock retains its side texture while sticky-face overlays require a later render-controller upgrade."],
	["createbedrock:radial_chassis", "Java chassis geometry is a cube; Bedrock retains its side texture while sticky-face overlays require a later render-controller upgrade."]
]);

async function fileExists(file) {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
	}
}

async function jsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await jsonFiles(file));
		else if (extname(entry.name) === ".json")
			files.push(file);
	}
	return files;
}

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

function collectBlockGeometries(value, geometries = new Set()) {
	if (!value || typeof value !== "object")
		return geometries;
	for (const [key, child] of Object.entries(value)) {
		if (key === "minecraft:geometry" && typeof child === "string")
			geometries.add(child);
		if (key === "geometry" && typeof child?.identifier === "string")
			geometries.add(child.identifier);
		collectBlockGeometries(child, geometries);
	}
	return geometries;
}

function collectBlockTextures(value, textures = new Set()) {
	if (!value || typeof value !== "object")
		return textures;
	for (const [key, child] of Object.entries(value)) {
		if (key === "minecraft:material_instances" && child && typeof child === "object") {
			for (const material of Object.values(child)) {
				if (typeof material?.texture === "string")
					textures.add(material.texture);
			}
		}
		collectBlockTextures(child, textures);
	}
	return textures;
}

function languageKeys(content) {
	const keys = new Set();
	for (const line of content.split(/\r?\n/)) {
		const separator = line.indexOf("=");
		if (separator > 0 && !line.trimStart().startsWith("##"))
			keys.add(line.slice(0, separator).trim());
	}
	return keys;
}

function sourceTexturePath(texturePath, repositoryRoot) {
	const blockPrefix = "textures/create_java/block/";
	const itemPrefix = "textures/create_java/item/";
	if (texturePath.startsWith(blockPrefix))
		return resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", `${texturePath.slice(blockPrefix.length)}.png`);
	if (texturePath.startsWith(itemPrefix))
		return resolve(repositoryRoot, "src/main/resources/assets/create/textures/item", `${texturePath.slice(itemPrefix.length)}.png`);
	return undefined;
}

function generatedTextureSource(texturePath, bedrockRoot) {
	return texturePath.startsWith("textures/createbedrock/generated/")
		? resolve(bedrockRoot, "tools", "generate-stage3-visual-textures.mjs")
		: undefined;
}

async function geometryIdentifiers(resourcePackRoot) {
	const identifiers = new Set();
	const directory = resolve(resourcePackRoot, "models", "blocks");
	let files;
	try {
		files = await jsonFiles(directory);
	} catch (error) {
		if (error?.code === "ENOENT")
			return identifiers;
		throw error;
	}
	if (files.length === 0)
		return identifiers;
	for (const file of files) {
		const geometry = await readJson(file);
		for (const entry of geometry["minecraft:geometry"] ?? []) {
			if (typeof entry?.description?.identifier === "string")
				identifiers.add(entry.description.identifier);
		}
	}
	return identifiers;
}

async function assertStaticBlockContracts({ bedrockRoot, built }) {
	const repositoryRoot = resolve(bedrockRoot, "..");
	const behaviorPackRoot = resolve(bedrockRoot, "behavior_pack");
	const resourcePackRoot = resolve(bedrockRoot, "resource_pack");
	const [matrix, contentSpecifications] = await Promise.all([
		readJson(resolve(defaultBedrockRoot, "data", "migration-matrix.json")),
		readJson(resolve(defaultBedrockRoot, "data", "stage3-content-specifications.json"))
	]);
	validateMigrationMatrix(matrix);
	const specifiedContent = new Set(contentSpecifications.entries?.map(entry => entry.acceptanceId));

	const blocksByIdentifier = new Map();
	for (const file of await jsonFiles(resolve(behaviorPackRoot, "blocks"))) {
		const definition = await readJson(file);
		const identifier = definition["minecraft:block"]?.description?.identifier;
		if (typeof identifier === "string")
			blocksByIdentifier.set(identifier, { definition, file });
	}

	const terrainAtlas = await readJson(resolve(resourcePackRoot, "textures", "terrain_texture.json"));
	const terrainTextures = terrainAtlas.texture_data ?? {};
	const itemAtlas = await readJson(resolve(resourcePackRoot, "textures", "item_texture.json"));
	const itemTextures = itemAtlas.texture_data ?? {};
	const languages = new Map(await Promise.all(["en_US", "zh_CN"].map(async locale => [
		locale,
		languageKeys(await readFile(resolve(resourcePackRoot, "texts", `${locale}.lang`), "utf8"))
	])));
	const convertedGeometry = plannedGeometryIdentifiers();
	const builtGeometry = built ? await geometryIdentifiers(resourcePackRoot) : undefined;
	const staticEntries = matrix.entries.filter(entry => entry.phase === 3
		&& entry.domain === "content"
		&& entry.status === "static_verified");
	const foundationEntries = matrix.entries.filter(entry => entry.phase === 3
		&& entry.domain === "content"
		&& entry.status === "implementation_in_progress");
	const deliverableEntries = [...staticEntries, ...foundationEntries];
	const coveredStatic = new Set();
	const coveredFoundation = new Set();
	const coveredStaticEntities = new Set();
	const coveredStaticItems = new Set();
	const visualFallbacks = [];

	for (const entry of deliverableEntries) {
		const isStatic = entry.status === "static_verified";
		if (isStatic && !FOUNDATION_CONTENT_ACCEPTANCE_IDS.has(entry.acceptanceId) && !specifiedContent.has(entry.acceptanceId))
			throw new Error(`Static content entry ${entry.acceptanceId} has no implementation specification ownership.`);
		if (isStatic && entry.behaviorPath !== null && !await fileExists(resolve(bedrockRoot, entry.behaviorPath)))
			throw new Error(`Static migration entry ${entry.acceptanceId} references a missing behaviorPath implementation.`);
		const implementationIdentifier = CONTENT_IMPLEMENTATION_IDENTIFIERS.get(entry.acceptanceId) ?? entry.bedrockIdentifier;
		if (entry.kind === "item") {
			if (!isStatic)
				throw new Error(`Foundation content entry ${entry.acceptanceId} cannot be an item without a static definition.`);
			const itemName = implementationIdentifier.slice(implementationIdentifier.indexOf(":") + 1);
			const item = await readJson(resolve(behaviorPackRoot, "items", `${itemName}.json`));
			const definition = item["minecraft:item"];
			const icon = definition?.components?.["minecraft:icon"];
			if (definition?.description?.identifier !== implementationIdentifier || !definition.description.menu_category?.category
				|| typeof icon !== "string")
				throw new Error(`Static item ${entry.acceptanceId} is missing an identifier, creative category, or icon.`);
			for (const locale of ["en_US", "zh_CN"]) {
				if (!languages.get(locale).has(`item.${implementationIdentifier}.name`))
					throw new Error(`Static item ${entry.acceptanceId} is missing ${locale} translation.`);
			}
			const texturePath = itemTextures[icon]?.textures;
			if (typeof texturePath !== "string")
				throw new Error(`Static item ${entry.acceptanceId} is missing icon ${icon} in item_texture.json.`);
			const expectedFile = built
				? resolve(resourcePackRoot, `${texturePath}.png`)
				: sourceTexturePath(texturePath, repositoryRoot) ?? generatedTextureSource(texturePath, bedrockRoot);
			if (!expectedFile || !await fileExists(expectedFile))
				throw new Error(`Static item ${entry.acceptanceId} is missing staged icon ${icon}.`);
			coveredStaticItems.add(implementationIdentifier);
			continue;
		}
		if (entry.kind === "entity") {
			if (!isStatic)
				throw new Error(`Foundation content entry ${entry.acceptanceId} cannot be an entity without a static actor definition.`);
			const entityName = implementationIdentifier.slice(implementationIdentifier.indexOf(":") + 1);
			const [actor, client] = await Promise.all([
				readJson(resolve(behaviorPackRoot, "entities", `${entityName}.json`)),
				readJson(resolve(resourcePackRoot, "entity", `${entityName}.entity.json`))
			]);
			if (actor["minecraft:entity"]?.description?.identifier !== implementationIdentifier
				|| client["minecraft:client_entity"]?.description?.identifier !== implementationIdentifier)
				throw new Error(`Static entity ${entry.acceptanceId} is missing matching behavior and client definitions.`);
			for (const locale of ["en_US", "zh_CN"]) {
				if (!languages.get(locale).has(`entity.${implementationIdentifier}.name`))
					throw new Error(`Static entity ${entry.acceptanceId} is missing ${locale} translation.`);
			}
			coveredStaticEntities.add(implementationIdentifier);
			continue;
		}
		if (entry.kind !== "block" && entry.kind !== "block_entity")
			throw new Error(`Stage-3 content contract does not yet support static ${entry.kind} entry ${entry.acceptanceId}.`);
		const block = blocksByIdentifier.get(implementationIdentifier);
		if (!block)
			throw new Error(`Static migration entry ${entry.acceptanceId} is missing ${implementationIdentifier} block definition.`);
		const description = block.definition["minecraft:block"].description;
		if (!description.menu_category?.category)
			throw new Error(`Static migration entry ${entry.acceptanceId} is missing a creative menu category.`);
		for (const locale of ["en_US", "zh_CN"]) {
				if (!languages.get(locale).has(`tile.${implementationIdentifier}.name`))
				throw new Error(`Static migration entry ${entry.acceptanceId} is missing ${locale} translation.`);
		}
		const geometries = collectBlockGeometries(block.definition["minecraft:block"]);
		if (geometries.size === 0)
			throw new Error(`Static migration entry ${entry.acceptanceId} has no block or item geometry.`);
		for (const geometry of geometries) {
			if (!geometry.startsWith("geometry.createbedrock."))
				continue;
			if (!convertedGeometry.has(geometry))
				throw new Error(`Static migration entry ${entry.acceptanceId} references unplanned geometry ${geometry}.`);
			if (built && !builtGeometry.has(geometry))
				throw new Error(`Built resource pack is missing generated geometry ${geometry}.`);
		}
		if (isStatic && geometries.has("minecraft:geometry.full_block")) {
			const reason = STATIC_VISUAL_EXCEPTIONS.get(implementationIdentifier);
			if (!reason)
				throw new Error(`Static migration entry ${entry.acceptanceId} uses an undocumented full-block visual fallback.`);
				visualFallbacks.push({ identifier: implementationIdentifier, reason });
		}
		for (const texture of collectBlockTextures(block.definition["minecraft:block"])) {
			if (!texture.startsWith("createbedrock_"))
				continue;
			const atlasEntry = terrainTextures[texture];
			const texturePath = atlasEntry?.textures;
			if (typeof texturePath !== "string")
				throw new Error(`Static migration entry ${entry.acceptanceId} is missing texture ${texture} in terrain_texture.json.`);
			const expectedFile = built
				? resolve(resourcePackRoot, `${texturePath}.png`)
				: sourceTexturePath(texturePath, repositoryRoot) ?? generatedTextureSource(texturePath, bedrockRoot);
			if (!expectedFile || !await fileExists(expectedFile))
				throw new Error(`Static migration entry ${entry.acceptanceId} is missing staged texture for ${texture}.`);
		}
		const lootPath = block.definition["minecraft:block"].components?.["minecraft:loot"];
		if (typeof lootPath !== "string" || !await fileExists(resolve(behaviorPackRoot, lootPath)))
			throw new Error(`Content entry ${entry.acceptanceId} is missing an explicit loot table.`);
		if (!isStatic) {
			coveredFoundation.add(implementationIdentifier);
		} else {
			coveredStatic.add(implementationIdentifier);
		}
	}

	return {
		contentEntries: deliverableEntries.length,
		contentBlocks: new Set([...coveredStatic, ...coveredFoundation]).size,
		contentItems: coveredStaticItems.size,
		foundationEntries: foundationEntries.length,
		foundationBlocks: coveredFoundation.size,
		staticEntries: staticEntries.length,
		staticBlocks: coveredStatic.size,
		staticEntities: coveredStaticEntities.size,
		staticItems: coveredStaticItems.size,
		visualFallbacks: [...new Map(visualFallbacks.map(entry => [entry.identifier, entry])).values()]
	};
}

export async function validateStage3SourceContentContract({ bedrockRoot = defaultBedrockRoot } = {}) {
	return assertStaticBlockContracts({ bedrockRoot, built: false });
}

export async function validateStage3BuiltContentContract({ buildRoot = resolve(defaultBedrockRoot, "build") } = {}) {
	return assertStaticBlockContracts({ bedrockRoot: buildRoot, built: true });
}
