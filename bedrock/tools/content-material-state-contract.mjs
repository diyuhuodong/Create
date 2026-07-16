import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { plannedGeometryIdentifiers } from "./convert-java-models.mjs";
import { JAVA_BLOCK_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");

const STATE_BLOCKS = [
	{
		identifier: "createbedrock:cardboard_block",
		geometry: "geometry.createbedrock.cardboard_block",
		textures: [
			["cardboard_block_front", "createbedrock_cardboard_block_front", "cardboard_block_front.png"],
			["cardboard_block_side", "createbedrock_cardboard_block_side", "cardboard_block_side.png"],
			["cardboard_block_top", "createbedrock_cardboard_block_top", "cardboard_block_top.png"]
		]
	},
	{
		identifier: "createbedrock:bound_cardboard_block",
		geometry: "geometry.createbedrock.bound_cardboard_block",
		loot: "scripted",
		textures: [
			["bound_cardboard_block_front", "createbedrock_bound_cardboard_block_front", "bound_cardboard_block_front.png"],
			["bound_cardboard_block_side", "createbedrock_bound_cardboard_block_side", "bound_cardboard_block_side.png"],
			["bound_cardboard_block_top", "createbedrock_bound_cardboard_block_top", "bound_cardboard_block_top.png"]
		]
	},
	{
		identifier: "createbedrock:experience_block",
		geometry: "geometry.createbedrock.experience_block",
		textures: [["experience_block", "createbedrock_experience_block", "experience_block.png"]]
	},
	{
		identifier: "createbedrock:andesite_ladder",
		geometry: "geometry.createbedrock.andesite_ladder",
		textures: [
			["ladder_andesite", "createbedrock_ladder_andesite", "ladder_andesite.png"],
			["ladder_andesite_hoop", "createbedrock_ladder_andesite_hoop", "ladder_andesite_hoop.png"]
		]
	},
	{
		identifier: "createbedrock:brass_ladder",
		geometry: "geometry.createbedrock.brass_ladder",
		textures: [
			["ladder_brass", "createbedrock_ladder_brass", "ladder_brass.png"],
			["ladder_brass_hoop", "createbedrock_ladder_brass_hoop", "ladder_brass_hoop.png"]
		]
	},
	{
		identifier: "createbedrock:copper_ladder",
		geometry: "geometry.createbedrock.copper_ladder",
		textures: [
			["ladder_copper", "createbedrock_ladder_copper", "ladder_copper.png"],
			["ladder_copper_hoop", "createbedrock_ladder_copper_hoop", "ladder_copper_hoop.png"]
		]
	},
	{
		identifier: "createbedrock:andesite_scaffolding",
		geometry: "geometry.createbedrock.andesite_scaffolding",
		textures: [
			["andesite_funnel_frame", "createbedrock_andesite_funnel_frame", "funnel/andesite_funnel_frame.png"],
			["andesite_scaffold", "createbedrock_andesite_scaffold", "scaffold/andesite_scaffold.png"],
			["andesite_scaffold_inside", "createbedrock_andesite_scaffold_inside", "scaffold/andesite_scaffold_inside.png"]
		]
	},
	{
		identifier: "createbedrock:brass_scaffolding",
		geometry: "geometry.createbedrock.brass_scaffolding",
		textures: [
			["brass_funnel_frame", "createbedrock_brass_funnel_frame", "funnel/brass_funnel_frame.png"],
			["brass_scaffold", "createbedrock_brass_scaffold", "scaffold/brass_scaffold.png"],
			["brass_scaffold_inside", "createbedrock_brass_scaffold_inside", "scaffold/brass_scaffold_inside.png"]
		]
	},
	{
		identifier: "createbedrock:copper_scaffolding",
		geometry: "geometry.createbedrock.copper_scaffolding",
		textures: [
			["copper_funnel_frame", "createbedrock_copper_funnel_frame", "funnel/copper_funnel_frame.png"],
			["copper_scaffold", "createbedrock_copper_scaffold", "scaffold/copper_scaffold.png"],
			["copper_scaffold_inside", "createbedrock_copper_scaffold_inside", "scaffold/copper_scaffold_inside.png"]
		]
	},
	{
		identifier: "createbedrock:framed_glass_trapdoor",
		geometry: "geometry.createbedrock.framed_glass_trapdoor_bottom",
		additionalGeometries: [
			"geometry.createbedrock.framed_glass_trapdoor_top",
			"geometry.createbedrock.framed_glass_trapdoor_open"
		],
		geometryFiles: [
			"framed_glass_trapdoor_bottom",
			"framed_glass_trapdoor_top",
			"framed_glass_trapdoor_open"
		],
		textures: [
			["glass_door_side", "createbedrock_glass_door_side", "glass_door_side.png"],
			["framed_glass", "createbedrock_framed_glass", "palettes/framed_glass.png"]
		]
	}
];

const LADDER_BLOCKS = new Set([
	"createbedrock:andesite_ladder",
	"createbedrock:brass_ladder",
	"createbedrock:copper_ladder"
]);

const SCAFFOLD_BLOCKS = new Set([
	"createbedrock:andesite_scaffolding",
	"createbedrock:brass_scaffolding",
	"createbedrock:copper_scaffolding"
]);

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function fileExists(file) {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
	}
}

function languageKeys(contents) {
	return new Set(contents.split(/\r?\n/)
		.map(line => line.indexOf("=") === -1 ? "" : line.slice(0, line.indexOf("=")))
		.filter(Boolean));
}

function nameFor(identifier) {
	return identifier.slice("createbedrock:".length);
}

function assertMaterialInstances(instances, entry) {
	for (const [material, texture] of entry.textures) {
		if (instances?.[material]?.texture !== texture)
			throw new Error(`C1 state block ${entry.identifier} is missing material ${material}`);
	}
}

export async function validateContentMaterialStates({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const terrainAtlas = await readJson(resolve(resourceRoot, "textures", "terrain_texture.json"));
	const languageSets = new Map(await Promise.all(["en_US", "zh_CN"].map(async locale => [
		locale,
		languageKeys(await readFile(resolve(resourceRoot, "texts", `${locale}.lang`), "utf8"))
	])));
	const plannedGeometries = plannedGeometryIdentifiers();

	for (const entry of STATE_BLOCKS) {
		const name = nameFor(entry.identifier);
		const [definition, loot] = await Promise.all([
			readJson(resolve(behaviorRoot, "blocks", `${name}.json`)),
			readJson(resolve(behaviorRoot, "loot_tables", "blocks", `${name}.json`))
		]);
		const block = definition["minecraft:block"];
		const components = block?.components ?? {};
		if (block?.description?.identifier !== entry.identifier || !block.description.menu_category?.category
			|| components["minecraft:geometry"] !== entry.geometry
			|| components["minecraft:item_visual"]?.geometry?.identifier !== entry.geometry)
			throw new Error(`C1 state block ${entry.identifier} must retain its Java-derived geometry and creative entry`);
		for (const geometry of [entry.geometry, ...(entry.additionalGeometries ?? [])]) {
			if (!plannedGeometries.has(geometry))
				throw new Error(`C1 state block ${entry.identifier} references an unplanned Java geometry`);
		}
		assertMaterialInstances(components["minecraft:material_instances"], entry);
		assertMaterialInstances(components["minecraft:item_visual"]?.material_instances, entry);
		if (components["minecraft:loot"] !== `loot_tables/blocks/${name}.json`)
			throw new Error(`C1 state block ${entry.identifier} must retain its declared loot table`);
		if (entry.loot === "scripted") {
			if (loot.pools?.[0]?.entries?.[0]?.type !== "empty")
				throw new Error(`C1 state block ${entry.identifier} must suppress default drops before its scripted loot decision`);
		} else if (loot.pools?.[0]?.entries?.[0]?.name !== entry.identifier)
			throw new Error(`C1 state block ${entry.identifier} must retain an explicit self-drop while its acquisition path is pending`);
		for (const [material, texture, sourceTexture] of entry.textures) {
			if (terrainAtlas.texture_data?.[texture]?.textures !== `textures/create_java/block/${sourceTexture.slice(0, -4)}`)
				throw new Error(`C1 state block ${entry.identifier} is missing terrain-atlas texture ${texture}`);
			if (!JAVA_BLOCK_TEXTURES.includes(sourceTexture))
				throw new Error(`C1 state block ${entry.identifier} is not staged by import-java-assets.mjs`);
			const textureFile = built
				? resolve(resourceRoot, "textures", "create_java", "block", sourceTexture)
				: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", sourceTexture);
			if (!await fileExists(textureFile))
				throw new Error(`C1 state block ${entry.identifier} is missing Java-derived texture ${textureFile}`);
		}
		for (const locale of ["en_US", "zh_CN"]) {
			if (!languageSets.get(locale).has(`tile.${entry.identifier}.name`))
				throw new Error(`C1 state block ${entry.identifier} is missing ${locale} localization`);
		}
	}

	const cardboard = await readJson(resolve(behaviorRoot, "blocks", "cardboard_block.json"));
	const cardboardBlock = cardboard["minecraft:block"];
	const flammable = cardboardBlock?.components?.["minecraft:flammable"];
	if (!cardboardBlock?.description?.traits?.["minecraft:placement_direction"]?.enabled_states?.includes("minecraft:cardinal_direction")
		|| flammable?.catch_chance_modifier !== 20
		|| flammable?.destroy_chance_modifier !== 100
		|| flammable?.lava_flammable !== true
		|| !cardboardBlock.permutations?.some(entry => entry.condition?.includes("minecraft:cardinal_direction") && entry.components?.["minecraft:transformation"]?.rotation?.[1] === 90))
		throw new Error("C1 cardboard block must preserve horizontal-axis placement and Java-equivalent high flammability");

	const boundCardboard = await readJson(resolve(behaviorRoot, "blocks", "bound_cardboard_block.json"));
	const boundCardboardBlock = boundCardboard["minecraft:block"];
	const boundFlammable = boundCardboardBlock?.components?.["minecraft:flammable"];
	if (!boundCardboardBlock?.description?.traits?.["minecraft:placement_direction"]?.enabled_states?.includes("minecraft:cardinal_direction")
		|| boundFlammable?.catch_chance_modifier !== 20
		|| boundFlammable?.destroy_chance_modifier !== 100
		|| boundFlammable?.lava_flammable !== true
		|| !boundCardboardBlock.permutations?.some(entry => entry.condition?.includes("minecraft:cardinal_direction") && entry.components?.["minecraft:transformation"]?.rotation?.[1] === 90))
		throw new Error("C1 bound cardboard must preserve horizontal-axis placement and Java-equivalent high flammability");

	const experience = await readJson(resolve(behaviorRoot, "blocks", "experience_block.json"));
	const experienceComponents = experience["minecraft:block"]?.components;
	if (experienceComponents?.["minecraft:light_emission"] !== 15
		|| JSON.stringify(experienceComponents?.["minecraft:tick"]?.interval_range) !== JSON.stringify([3, 7])
		|| experienceComponents?.["minecraft:tick"]?.looping !== true
		|| !Object.hasOwn(experienceComponents ?? {}, "createbedrock:experience_block_particle"))
		throw new Error("C1 experience block must preserve Java light level 15 and end-rod particle cadence");

	const framedTrapdoor = await readJson(resolve(behaviorRoot, "blocks", "framed_glass_trapdoor.json"));
	const framedTrapdoorBlock = framedTrapdoor["minecraft:block"];
	const trapdoorProperties = framedTrapdoorBlock?.description?.properties;
	const trapdoorDirection = framedTrapdoorBlock?.description?.traits?.["minecraft:placement_direction"];
	const trapdoorPosition = framedTrapdoorBlock?.description?.traits?.["minecraft:placement_position"];
	const trapdoorPermutations = framedTrapdoorBlock?.permutations ?? [];
	const trapdoorWaterRule = framedTrapdoorBlock?.components?.["minecraft:liquid_detection"]?.detection_rules?.[0];
	const requiredClosedTrapdoorStates = ["bottom", "top"].flatMap(half => ["north", "east", "south", "west"].map(direction =>
		`query.block_state('createbedrock:open') == 0 && query.block_state('minecraft:vertical_half') == '${half}' && query.block_state('minecraft:cardinal_direction') == '${direction}'`));
	const requiredOpenTrapdoorStates = ["north", "east", "south", "west"].map(direction =>
		`query.block_state('createbedrock:open') == 1 && query.block_state('minecraft:cardinal_direction') == '${direction}'`);
	const closedTrapdoorPermutations = trapdoorPermutations.filter(entry => entry.condition?.includes("createbedrock:open') == 0"));
	const openTrapdoorPermutations = trapdoorPermutations.filter(entry => entry.condition?.includes("createbedrock:open') == 1"));
	const openTrapdoorRotations = new Map(openTrapdoorPermutations.map(entry => [
		["north", "east", "south", "west"].find(direction => entry.condition.includes(`'${direction}'`)),
		entry.components?.["minecraft:transformation"]?.rotation?.[1]
	]));
	if (JSON.stringify(trapdoorProperties?.["createbedrock:open"]) !== JSON.stringify([0, 1])
		|| JSON.stringify(trapdoorProperties?.["createbedrock:powered"]) !== JSON.stringify([0, 1])
		|| !trapdoorDirection?.enabled_states?.includes("minecraft:cardinal_direction")
		|| !trapdoorPosition?.enabled_states?.includes("minecraft:vertical_half")
		|| trapdoorWaterRule?.liquid_type !== "water"
		|| trapdoorWaterRule?.can_contain_liquid !== true
		|| trapdoorWaterRule?.on_liquid_touches !== "blocking"
		|| trapdoorWaterRule?.use_liquid_clipping !== true
		|| framedTrapdoorBlock?.components?.["minecraft:redstone_consumer"]?.propagates_power !== false
		|| !Object.hasOwn(framedTrapdoorBlock?.components ?? {}, "createbedrock:redstone_input")
		|| trapdoorPermutations.length !== 12
		|| !requiredClosedTrapdoorStates.every(condition => trapdoorPermutations.some(entry => entry.condition === condition))
		|| !requiredOpenTrapdoorStates.every(condition => trapdoorPermutations.some(entry => entry.condition === condition))
		|| !closedTrapdoorPermutations.every(entry => entry.components?.["minecraft:transformation"] === undefined
			&& entry.components?.["minecraft:geometry"] === (entry.condition.includes("vertical_half') == 'top'")
				? "geometry.createbedrock.framed_glass_trapdoor_top"
				: "geometry.createbedrock.framed_glass_trapdoor_bottom"))
		|| !openTrapdoorPermutations.every(entry => entry.components?.["minecraft:geometry"] === "geometry.createbedrock.framed_glass_trapdoor_open")
		|| openTrapdoorRotations.get("north") !== 0
		|| openTrapdoorRotations.get("east") !== 90
		|| openTrapdoorRotations.get("south") !== 180
		|| openTrapdoorRotations.get("west") !== 270)
		throw new Error("C1 framed glass trapdoor must preserve its horizontal/top-bottom/open states and native redstone input");

	for (const identifier of LADDER_BLOCKS) {
		const name = nameFor(identifier);
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${name}.json`));
		const block = definition["minecraft:block"];
		const direction = block?.description?.traits?.["minecraft:placement_direction"];
		const rotations = new Map((block?.permutations ?? []).map(entry => [entry.condition, entry.components?.["minecraft:transformation"]?.rotation?.[1]]));
		if (!direction?.enabled_states?.includes("minecraft:cardinal_direction")
			|| direction.y_rotation_offset !== 180
			|| block?.components?.["minecraft:collision_box"] !== false
			|| block?.components?.["minecraft:selection_box"] !== true
			|| rotations.get("query.block_state('minecraft:cardinal_direction') == 'east'") !== 90
			|| rotations.get("query.block_state('minecraft:cardinal_direction') == 'south'") !== 180
			|| rotations.get("query.block_state('minecraft:cardinal_direction') == 'west'") !== 270)
			throw new Error(`C1 metal ladder ${identifier} must preserve non-colliding horizontal placement and Java model rotations`);
	}

	for (const identifier of SCAFFOLD_BLOCKS) {
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${nameFor(identifier)}.json`));
		const components = definition["minecraft:block"]?.components;
		if (components?.["minecraft:collision_box"] !== false || components?.["minecraft:selection_box"] !== true)
			throw new Error(`C1 metal scaffold ${identifier} must retain its pass-through scaffold volume`);
	}

	for (const script of [
		"bound-cardboard.js", "bound-cardboard-runtime.js", "framed-glass-trapdoor.js", "framed-glass-trapdoor-runtime.js",
		"experience-block-particle.js", "experience-block-particle-runtime.js",
		"vertical-mobility.js", "vertical-mobility-runtime.js"
	]) {
		if (!await fileExists(resolve(behaviorRoot, "scripts", "materials", script)))
			throw new Error(`C1 vertical-mobility runtime is missing ${script}`);
	}
	const mainScript = await readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8");
	if (!mainScript.includes("registerBoundCardboard();") || !mainScript.includes("registerExperienceBlockParticles();")
		|| !mainScript.includes("registerFramedGlassTrapdoor();") || !mainScript.includes("registerVerticalMobility();"))
		throw new Error("C1 state runtime must register bound-cardboard drops, experience particles, trapdoor controls, and vertical mobility from scripts/main.js");

	if (built) {
		for (const entry of STATE_BLOCKS) {
			for (const geometryFile of entry.geometryFiles ?? [nameFor(entry.identifier)]) {
				if (!await fileExists(resolve(resourceRoot, "models", "blocks", `${geometryFile}.geo.json`)))
					throw new Error(`Built pack is missing converted geometry for C1 state block ${entry.identifier}`);
			}
		}
	}

	return {
		contentBlocks: STATE_BLOCKS.length,
		verticalMobilityBlocks: LADDER_BLOCKS.size + SCAFFOLD_BLOCKS.size
	};
}
