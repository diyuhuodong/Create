import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

import { catalogSummary, JAVA_REGISTRATION_CATALOG_SCHEMA_VERSION, validateJavaRegistrationCatalog } from "./java-registration-catalog-schema.mjs";

const BLOCK_INFO_DIRECTORY = "src/generated/resources/data/create/.wiki/block_info";
const ALL_BLOCKS = "src/main/java/com/simibubi/create/AllBlocks.java";
const ALL_BLOCK_ENTITIES = "src/main/java/com/simibubi/create/AllBlockEntityTypes.java";
const ALL_ENTITIES = "src/main/java/com/simibubi/create/AllEntityTypes.java";
const ALL_FLUIDS = "src/main/java/com/simibubi/create/AllFluids.java";
const ALL_ITEMS = "src/main/java/com/simibubi/create/AllItems.java";
const PACKAGE_STYLES = "src/main/java/com/simibubi/create/content/logistics/box/PackageStyles.java";

const KIND_SORT_ORDER = new Map([
	["block", 0],
	["item", 1],
	["fluid", 2],
	["block_entity", 3],
	["entity", 4]
]);

async function filesUnder(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesUnder(file));
		else
			files.push(file);
	}
	return files;
}

function capture(content, pattern) {
	const values = [];
	for (const match of content.matchAll(pattern))
		values.push(match[1]);
	return values;
}

function normalizeSource(repositoryRoot, source) {
	return relative(repositoryRoot, source).replaceAll("\\", "/");
}

function catalogEntry(map, { identifier, kind, registrationKind, source }) {
	const sourceKey = `${kind}:create:${identifier}`;
	let entry = map.get(sourceKey);
	if (!entry) {
		entry = {
			javaIdentifier: `create:${identifier}`,
			kind,
			registrationKinds: [],
			sourceKey,
			sources: []
		};
		map.set(sourceKey, entry);
	}
	if (!entry.sources.includes(source))
		entry.sources.push(source);
	if (!entry.registrationKinds.includes(registrationKind))
		entry.registrationKinds.push(registrationKind);
}

function addLiteralRegistrations(map, content, { kind, pattern, source }) {
	for (const identifier of capture(content, pattern))
		catalogEntry(map, { identifier, kind, registrationKind: "literal_registration", source });
}

function addStandaloneItems(map, itemsSource, packageStylesSource) {
	addLiteralRegistrations(map, itemsSource, {
		kind: "item",
		pattern: /\.item\(\s*"([a-z0-9_]+)"\s*,/g,
		source: ALL_ITEMS
	});
	addLiteralRegistrations(map, itemsSource, {
		kind: "item",
		pattern: /(?:ingredient|sequencedIngredient|taggedIngredient)\(\s*"([a-z0-9_]+)"/g,
		source: ALL_ITEMS
	});
	for (const metal of capture(itemsSource, /compatCrushedOre\(([A-Z_]+)\)/g)) {
		catalogEntry(map, {
			identifier: `crushed_raw_${metal.toLowerCase()}`,
			kind: "item",
			registrationKind: "compatibility_generated",
			source: ALL_ITEMS
		});
	}
	for (const match of packageStylesSource.matchAll(/new PackageStyle\("([a-z_]+)",\s*(\d+),\s*(\d+),[^,]+,\s*(true|false)\)/g)) {
		const [, type, width, height, rare] = match;
		catalogEntry(map, {
			identifier: `${type}_package${rare === "true" ? "" : `_${width}x${height}`}`,
			kind: "item",
			registrationKind: "package_style_generated",
			source: PACKAGE_STYLES
		});
	}
	for (const name of capture(packageStylesSource, /rare\("([a-z0-9_]+)"\)/g)) {
		catalogEntry(map, {
			identifier: `rare_${name}_package`,
			kind: "item",
			registrationKind: "package_style_generated",
			source: PACKAGE_STYLES
		});
	}
}

function addFluids(map, fluidsSource) {
	const virtualFluids = capture(fluidsSource, /\.virtualFluid\(\s*"([a-z0-9_]+)"/g);
	const placeableFluids = capture(fluidsSource, /\.standardFluid\(\s*"([a-z0-9_]+)"/g);
	for (const identifier of [...virtualFluids, ...placeableFluids]) {
		catalogEntry(map, {
			identifier,
			kind: "fluid",
			registrationKind: virtualFluids.includes(identifier) ? "virtual_fluid" : "placeable_fluid",
			source: ALL_FLUIDS
		});
	}
	for (const identifier of placeableFluids) {
		catalogEntry(map, {
			identifier,
			kind: "block",
			registrationKind: "fluid_generated_block",
			source: ALL_FLUIDS
		});
		catalogEntry(map, {
			identifier: `${identifier}_bucket`,
			kind: "item",
			registrationKind: "fluid_generated_bucket",
			source: ALL_FLUIDS
		});
	}
}

export async function buildJavaRegistrationCatalog({ repositoryRoot }) {
	if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0)
		throw new TypeError("Java registration catalog requires a repository root");

	const [allBlocks, allBlockEntities, allEntities, allFluids, allItems, packageStyles, blockInfoFiles] = await Promise.all([
		readFile(resolve(repositoryRoot, ALL_BLOCKS), "utf8"),
		readFile(resolve(repositoryRoot, ALL_BLOCK_ENTITIES), "utf8"),
		readFile(resolve(repositoryRoot, ALL_ENTITIES), "utf8"),
		readFile(resolve(repositoryRoot, ALL_FLUIDS), "utf8"),
		readFile(resolve(repositoryRoot, ALL_ITEMS), "utf8"),
		readFile(resolve(repositoryRoot, PACKAGE_STYLES), "utf8"),
		filesUnder(resolve(repositoryRoot, BLOCK_INFO_DIRECTORY))
	]);

	const entries = new Map();
	for (const file of blockInfoFiles.filter(file => file.endsWith(".json"))) {
		catalogEntry(entries, {
			identifier: basename(file, ".json"),
			kind: "block",
			registrationKind: "generated_block_info",
			source: normalizeSource(repositoryRoot, file)
		});
	}
	addLiteralRegistrations(entries, allBlocks, {
		kind: "block",
		pattern: /\.block\(\s*"([a-z0-9_]+)"/g,
		source: ALL_BLOCKS
	});
	addLiteralRegistrations(entries, allBlockEntities, {
		kind: "block_entity",
		pattern: /\.blockEntity\(\s*"([a-z0-9_]+)"/g,
		source: ALL_BLOCK_ENTITIES
	});
	addLiteralRegistrations(entries, allEntities, {
		kind: "entity",
		pattern: /\b(?:contraption|register)\(\s*"([a-z0-9_]+)"/g,
		source: ALL_ENTITIES
	});
	addStandaloneItems(entries, allItems, packageStyles);
	addFluids(entries, allFluids);

	const catalogEntries = [...entries.values()]
		.map(entry => ({
			...entry,
			registrationKinds: [...entry.registrationKinds].sort(),
			sources: [...entry.sources].sort()
		}))
		.sort((left, right) => KIND_SORT_ORDER.get(left.kind) - KIND_SORT_ORDER.get(right.kind)
			|| left.javaIdentifier.localeCompare(right.javaIdentifier));
	const catalog = {
		entries: catalogEntries,
		generatedAt: "deterministic",
		generatedFrom: "Create 6.0.11 / Minecraft Java 1.21.1 source registrations and generated block-info",
		schemaVersion: JAVA_REGISTRATION_CATALOG_SCHEMA_VERSION,
		summary: catalogSummary(catalogEntries)
	};
	validateJavaRegistrationCatalog(catalog);
	return catalog;
}
