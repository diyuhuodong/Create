import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const ITEM_TAG_PROJECTION_SCHEMA_VERSION = 1;

const DYE_COLORS = ["black", "blue", "brown", "cyan", "gray", "green", "light_blue", "light_gray", "lime", "magenta", "orange", "pink", "purple", "red", "white", "yellow"];
const WOOD_TYPES = ["acacia", "bamboo", "birch", "cherry", "crimson", "dark_oak", "jungle", "mangrove", "oak", "pale_oak", "spruce", "warped"];
const OVERWORLD_WOOD_TYPES = ["acacia", "birch", "cherry", "dark_oak", "jungle", "mangrove", "oak", "pale_oak", "spruce"];
const OVERWORLD_LOGS = OVERWORLD_WOOD_TYPES.flatMap(type => [`minecraft:${type}_log`, `minecraft:${type}_wood`, `minecraft:stripped_${type}_log`, `minecraft:stripped_${type}_wood`]);
const NETHER_LOGS = ["minecraft:crimson_stem", "minecraft:crimson_hyphae", "minecraft:stripped_crimson_stem", "minecraft:stripped_crimson_hyphae", "minecraft:warped_stem", "minecraft:warped_hyphae", "minecraft:stripped_warped_stem", "minecraft:stripped_warped_hyphae"];
const SYNTHETIC_VANILLA_TAG_MEMBERS = new Map([
	["minecraft:axes", ["minecraft:diamond_axe", "minecraft:golden_axe", "minecraft:iron_axe", "minecraft:netherite_axe", "minecraft:stone_axe", "minecraft:wooden_axe"]],
	["minecraft:buttons", ["minecraft:polished_blackstone_button", "minecraft:stone_button", ...OVERWORLD_WOOD_TYPES.map(type => `minecraft:${type}_button`)]],
	["minecraft:convertable_to_mud", ["minecraft:coarse_dirt", "minecraft:dirt", "minecraft:rooted_dirt"]],
	["minecraft:dirt", ["minecraft:coarse_dirt", "minecraft:dirt", "minecraft:grass_block", "minecraft:mycelium", "minecraft:podzol", "minecraft:rooted_dirt"]],
	["minecraft:leaves", ["minecraft:acacia_leaves", "minecraft:azalea_leaves", "minecraft:birch_leaves", "minecraft:cherry_leaves", "minecraft:dark_oak_leaves", "minecraft:flowering_azalea_leaves", "minecraft:jungle_leaves", "minecraft:mangrove_leaves", "minecraft:oak_leaves", "minecraft:pale_oak_leaves", "minecraft:spruce_leaves"]],
	["minecraft:logs", [...OVERWORLD_LOGS, ...NETHER_LOGS]],
	["minecraft:planks", WOOD_TYPES.map(type => `minecraft:${type}_planks`)],
	["minecraft:sand", ["minecraft:red_sand", "minecraft:sand"]],
	["minecraft:saplings", ["minecraft:acacia_sapling", "minecraft:birch_sapling", "minecraft:cherry_sapling", "minecraft:dark_oak_sapling", "minecraft:jungle_sapling", "minecraft:mangrove_propagule", "minecraft:oak_sapling", "minecraft:pale_oak_sapling", "minecraft:spruce_sapling"]],
	["minecraft:small_flowers", ["minecraft:allium", "minecraft:azure_bluet", "minecraft:blue_orchid", "minecraft:closed_eyeblossom", "minecraft:cornflower", "minecraft:dandelion", "minecraft:lily_of_the_valley", "minecraft:open_eyeblossom", "minecraft:orange_tulip", "minecraft:oxeye_daisy", "minecraft:pink_tulip", "minecraft:poppy", "minecraft:red_tulip", "minecraft:white_tulip", "minecraft:wither_rose"]],
	["minecraft:wooden_buttons", OVERWORLD_WOOD_TYPES.map(type => `minecraft:${type}_button`)],
	["minecraft:wooden_doors", OVERWORLD_WOOD_TYPES.map(type => `minecraft:${type}_door`)],
	["minecraft:wooden_pressure_plates", OVERWORLD_WOOD_TYPES.map(type => `minecraft:${type}_pressure_plate`)],
	["minecraft:wooden_slabs", WOOD_TYPES.map(type => `minecraft:${type}_slab`)],
	["minecraft:wooden_trapdoors", OVERWORLD_WOOD_TYPES.map(type => `minecraft:${type}_trapdoor`)],
	["minecraft:wool", DYE_COLORS.map(color => `minecraft:${color}_wool`)],
	["c:barrels/wooden", ["minecraft:barrel"]],
	["c:chests/wooden", ["minecraft:chest"]],
	["c:chests/wooden/trapped", ["minecraft:trapped_chest"]],
	["c:cobblestones", ["minecraft:cobblestone", "minecraft:mossy_cobblestone"]],
	["c:dusts/redstone", ["minecraft:redstone"]],
	["c:dusts/obsidian", ["createbedrock:powdered_obsidian"]],
	["c:ender_pearls", ["minecraft:ender_pearl"]],
	["c:eggs", ["minecraft:egg"]],
	["c:feathers", ["minecraft:feather"]],
	["c:flours/wheat", ["createbedrock:wheat_flour"]],
	["c:gems/lapis", ["minecraft:lapis_lazuli"]],
	["c:gems/quartz", ["minecraft:quartz"]],
	["c:glass_blocks", ["minecraft:glass"]],
	["c:glass_blocks/colorless", ["minecraft:glass"]],
	["c:glass_panes", ["minecraft:glass_pane"]],
	["c:glass_panes/colorless", ["minecraft:glass_pane"]],
	["c:gunpowders", ["minecraft:gunpowder"]],
	["c:ingots/copper", ["minecraft:copper_ingot"]],
	["c:ingots/gold", ["minecraft:gold_ingot"]],
	["c:ingots/iron", ["minecraft:iron_ingot"]],
	["c:ingots/brass", ["createbedrock:brass_ingot"]],
	["c:ingots/zinc", ["createbedrock:zinc_ingot"]],
	["c:ingots/netherite", ["minecraft:netherite_ingot"]],
	["c:leathers", ["minecraft:leather"]],
	["c:netherracks", ["minecraft:netherrack"]],
	["c:nuggets/copper", ["minecraft:copper_nugget"]],
	["c:nuggets/iron", ["minecraft:iron_nugget"]],
	["c:nuggets/zinc", ["createbedrock:zinc_nugget"]],
	["c:raw_materials/copper", ["minecraft:raw_copper"]],
	["c:raw_materials/gold", ["minecraft:raw_gold"]],
	["c:raw_materials/iron", ["minecraft:raw_iron"]],
	["c:raw_materials/zinc", ["createbedrock:raw_zinc"]],
	["c:rods/wooden", ["minecraft:stick"]],
	["c:sands/colorless", ["minecraft:sand"]],
	["c:sands/red", ["minecraft:red_sand"]],
	["c:slimeballs", ["minecraft:slime_ball"]],
	["c:stones", ["minecraft:andesite", "minecraft:calcite", "minecraft:deepslate", "minecraft:diorite", "minecraft:dripstone_block", "minecraft:granite", "minecraft:stone", "minecraft:tuff"]],
	["c:storage_blocks/copper", ["minecraft:copper_block"]],
	["c:storage_blocks/iron", ["minecraft:iron_block"]],
	["c:storage_blocks/raw_copper", ["minecraft:raw_copper_block"]],
	["c:storage_blocks/raw_gold", ["minecraft:raw_gold_block"]],
	["c:storage_blocks/raw_iron", ["minecraft:raw_iron_block"]],
	["c:storage_blocks/raw_zinc", ["createbedrock:raw_zinc_block"]],
	["c:storage_blocks/zinc", ["createbedrock:zinc_block"]],
	["c:stripped_logs", [...OVERWORLD_WOOD_TYPES.map(type => `minecraft:stripped_${type}_log`), "minecraft:stripped_crimson_stem", "minecraft:stripped_warped_stem"]],
	["c:stripped_woods", [...OVERWORLD_WOOD_TYPES.map(type => `minecraft:stripped_${type}_wood`), "minecraft:stripped_crimson_hyphae", "minecraft:stripped_warped_hyphae"]],
	["c:plates/brass", ["createbedrock:brass_sheet"]],
	["c:plates/copper", ["createbedrock:copper_sheet"]],
	["c:plates/gold", ["createbedrock:golden_sheet"]],
	["c:plates/iron", ["createbedrock:iron_sheet"]],
	["c:obsidians", ["minecraft:crying_obsidian", "minecraft:obsidian"]],
	["c:strings", ["minecraft:string"]],
	...DYE_COLORS.map(color => [`c:dyes/${color}`, [`minecraft:${color}_dye`]])
]);

function mapIdentifier(identifier) {
	return identifier.startsWith("create:")
		? `createbedrock:${identifier.slice("create:".length)}`
		: identifier;
}

function namespaceOf(identifier) {
	return typeof identifier === "string" && identifier.includes(":") ? identifier.slice(0, identifier.indexOf(":")) : undefined;
}

async function jsonFiles(directory) {
	const files = [];
	try {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const file = resolve(directory, entry.name);
			if (entry.isDirectory())
				files.push(...await jsonFiles(file));
			else if (entry.name.endsWith(".json"))
				files.push(file);
		}
	} catch {
		// A namespace may not contribute item tags in a source tree.
	}
	return files;
}

async function sourceTagDocuments(repositoryRoot) {
	const roots = ["src/main/resources/data", "src/generated/resources/data"];
	const tags = new Map();
	for (const root of roots) {
		const dataRoot = resolve(repositoryRoot, root);
		for (const file of await jsonFiles(dataRoot)) {
			const normalized = relative(dataRoot, file).replaceAll("\\", "/");
			const match = normalized.match(/^([^/]+)\/tags\/item\/(.+)\.json$/);
			if (!match)
				continue;
			const [, namespace, path] = match;
			tags.set(`${namespace}:${path}`, JSON.parse(await readFile(file, "utf8")));
		}
	}
	return tags;
}

function tagValue(value) {
	if (typeof value === "string")
		return value;
	if (value && typeof value === "object" && typeof value.id === "string")
		return value.id;
	return undefined;
}

export async function buildItemTagProjections({ repositoryRoot, tags: requestedTags }) {
	if (!repositoryRoot || !requestedTags)
		throw new TypeError("Item-tag projection requires a repository root and requested tags");
	const source = await sourceTagDocuments(repositoryRoot);
	const resolved = new Map();
	const resolveTag = (tag, stack = []) => {
		if (resolved.has(tag))
			return resolved.get(tag);
		if (stack.includes(tag))
			return { items: [], issues: [{ kind: "cyclic_tag", value: [...stack, tag].join(" -> ") }] };
		const synthetic = SYNTHETIC_VANILLA_TAG_MEMBERS.get(tag);
		if (synthetic)
			return { items: synthetic, issues: [] };
		const document = source.get(tag);
		if (!document || !Array.isArray(document.values))
			return { items: [], issues: [{ kind: "missing_tag_source", value: tag }] };
		const items = new Set();
		const issues = [];
		for (const rawValue of document.values) {
			const value = tagValue(rawValue);
			if (!value) {
				issues.push({ kind: "unsupported_tag_value", value: rawValue });
				continue;
			}
			if (value.startsWith("#")) {
				const nested = resolveTag(value.slice(1), [...stack, tag]);
				nested.items.forEach(item => items.add(item));
				issues.push(...nested.issues);
				continue;
			}
			const namespace = namespaceOf(value);
			if (!["create", "minecraft"].includes(namespace)) {
				issues.push({ kind: "external_tag_member", value });
				continue;
			}
			items.add(mapIdentifier(value));
		}
		const result = { items: [...items].sort((left, right) => left.localeCompare(right)), issues };
		resolved.set(tag, result);
		return result;
	};
	const records = [...requestedTags].sort((left, right) => left.localeCompare(right)).map(tag => {
		const result = resolveTag(tag);
		return {
			...result,
			status: result.issues.length > 0 ? "blocked" : result.items.length === 0 ? "empty" : "emittable",
			tag
		};
	});
	return {
		generatedAt: "deterministic",
		generatedFrom: "src/main/resources/data and src/generated/resources/data item tags",
		records,
		schemaVersion: ITEM_TAG_PROJECTION_SCHEMA_VERSION,
		summary: {
			records: records.length,
			status: Object.fromEntries(["blocked", "emittable", "empty", "native"].map(status => [status, records.filter(record => record.status === status).length]))
		}
	};
}

export function validateItemTagProjections(document) {
	if (!document || document.schemaVersion !== ITEM_TAG_PROJECTION_SCHEMA_VERSION || document.generatedAt !== "deterministic" || !Array.isArray(document.records))
		throw new TypeError("Item-tag projection has an invalid header");
	const tags = new Set();
	for (const record of document.records) {
		if (typeof record?.tag !== "string" || tags.has(record.tag) || !Array.isArray(record.items) || !Array.isArray(record.issues)
			|| !["blocked", "emittable", "empty", "native"].includes(record.status))
			throw new Error("Item-tag projection contains an invalid record");
		if (record.status === "emittable" && (record.items.length === 0 || record.issues.length !== 0))
			throw new Error(`Item-tag projection ${record.tag} has an invalid emittable state`);
		tags.add(record.tag);
	}
	if (document.summary?.records !== document.records.length)
		throw new Error("Item-tag projection summary is stale");
	for (const status of ["blocked", "emittable", "empty", "native"])
		if (document.summary.status?.[status] !== document.records.filter(record => record.status === status).length)
			throw new Error(`Item-tag projection ${status} summary is stale`);
	return { records: document.records.length, status: { ...document.summary.status } };
}

export function projectionMap(document) {
	validateItemTagProjections(document);
	return new Map(document.records.map(record => [record.tag, record]));
}

export function renderItemTagProjectionRuntime(document) {
	validateItemTagProjections(document);
	const entries = document.records
		.filter(record => record.status === "emittable")
		.map(record => [record.tag, record.items]);
	return `// Generated from Java item-tag projections.\nexport const PROJECTED_ITEM_TAGS = new Map(${JSON.stringify(entries, null, "\t")}.map(([tag, items]) => [tag, new Set(items)]));\n`;
}
