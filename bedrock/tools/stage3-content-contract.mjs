import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_MODELS } from "./convert-java-models.mjs";
import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

// The Java source uses an OBJ model for this two-block machine.  Bedrock's
// current fixed-block implementation deliberately keeps a cube fallback until
// a verified OBJ/poly-mesh converter is available; it must never be mistaken
// for a Java-model-equivalent visual.
export const STATIC_VISUAL_EXCEPTIONS = new Map([
	["createbedrock:crushing_wheel", "Java source uses a NeoForge OBJ; fixed-block visual remains a documented cube fallback."]
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
	const matrix = await readJson(resolve(defaultBedrockRoot, "data", "migration-matrix.json"));
	validateMigrationMatrix(matrix);

	const blocksByIdentifier = new Map();
	for (const file of await jsonFiles(resolve(behaviorPackRoot, "blocks"))) {
		const definition = await readJson(file);
		const identifier = definition["minecraft:block"]?.description?.identifier;
		if (typeof identifier === "string")
			blocksByIdentifier.set(identifier, { definition, file });
	}

	const terrainAtlas = await readJson(resolve(resourcePackRoot, "textures", "terrain_texture.json"));
	const terrainTextures = terrainAtlas.texture_data ?? {};
	const languages = new Map(await Promise.all(["en_US", "zh_CN"].map(async locale => [
		locale,
		languageKeys(await readFile(resolve(resourcePackRoot, "texts", `${locale}.lang`), "utf8"))
	])));
	const convertedGeometry = new Set(JAVA_MODELS.map(entry => `geometry.createbedrock.${entry.name}`));
	const builtGeometry = built ? await geometryIdentifiers(resourcePackRoot) : undefined;
	const verified = matrix.entries.filter(entry => entry.phase === 3 && entry.status === "static_verified");
	const covered = new Set();
	const visualFallbacks = [];

	for (const entry of verified) {
		if (typeof entry.behaviorPath !== "string" || !await fileExists(resolve(bedrockRoot, entry.behaviorPath)))
			throw new Error(`Static migration entry ${entry.acceptanceId} is missing behaviorPath implementation.`);
		const block = blocksByIdentifier.get(entry.bedrockIdentifier);
		if (!block)
			throw new Error(`Static migration entry ${entry.acceptanceId} is missing ${entry.bedrockIdentifier} block definition.`);
		const description = block.definition["minecraft:block"].description;
		if (!description.menu_category?.category)
			throw new Error(`Static migration entry ${entry.acceptanceId} is missing a creative menu category.`);
		for (const locale of ["en_US", "zh_CN"]) {
			if (!languages.get(locale).has(`tile.${entry.bedrockIdentifier}.name`))
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
		if (geometries.has("minecraft:geometry.full_block")) {
			const reason = STATIC_VISUAL_EXCEPTIONS.get(entry.bedrockIdentifier);
			if (!reason)
				throw new Error(`Static migration entry ${entry.acceptanceId} uses an undocumented full-block visual fallback.`);
			visualFallbacks.push({ identifier: entry.bedrockIdentifier, reason });
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
				: sourceTexturePath(texturePath, repositoryRoot);
			if (!expectedFile || !await fileExists(expectedFile))
				throw new Error(`Static migration entry ${entry.acceptanceId} is missing staged texture for ${texture}.`);
		}
		covered.add(entry.bedrockIdentifier);
	}

	return {
		staticEntries: verified.length,
		staticBlocks: covered.size,
		visualFallbacks: [...new Map(visualFallbacks.map(entry => [entry.identifier, entry])).values()]
	};
}

export async function validateStage3SourceContentContract({ bedrockRoot = defaultBedrockRoot } = {}) {
	return assertStaticBlockContracts({ bedrockRoot, built: false });
}

export async function validateStage3BuiltContentContract({ buildRoot = resolve(defaultBedrockRoot, "build") } = {}) {
	return assertStaticBlockContracts({ bedrockRoot: buildRoot, built: true });
}
