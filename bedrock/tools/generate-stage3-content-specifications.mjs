import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { STAGE3_CONTENT_SPECIFICATION_SCHEMA_VERSION, validateStage3ContentSpecifications } from "./stage3-content-specification-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const generatedRoot = resolve(repositoryRoot, "src/generated/resources");
const sourceAssetRoot = resolve(repositoryRoot, "src/main/resources/assets/create");

const CONTRAPTION_IDENTIFIERS = new Set([
    "chassis",
    "clockwork_bearing",
    "controls",
    "linear_chassis",
    "mechanical_plough",
    "mechanical_roller",
    "piston_extension_pole",
    "portable_storage_interface",
    "radial_chassis",
    "secondary_linear_chassis",
    "sail_frame",
    "white_sail"
]);

const PROCESSING_IDENTIFIERS = new Set([
    "blaze_burner",
    "blaze_heater",
    "empty_blaze_burner",
    "lit_blaze_burner",
    "mechanical_crafter",
    "nozzle"
]);

const KINETIC_IDENTIFIERS = new Set([
    "metal_bracket",
    "metal_girder",
    "turntable",
    "wooden_bracket"
]);

const LOGISTICS_IDENTIFIERS = new Set([
    "copycat",
    "copycat_bars",
    "copycat_base",
    "copycat_panel",
    "copycat_step"
]);

const DISPLAY_IDENTIFIERS = new Set([
    "cuckoo_clock",
    "cursed_bell",
    "desk_bell",
    "display_board",
    "flap_display",
    "haunted_bell",
    "mysterious_cuckoo_clock",
    "peculiar_bell",
    "placard",
    "sliding_door",
    "speedometer",
    "steam_whistle",
    "steam_whistle_extension",
    "stock_ticker",
    "stockpile_switch",
    "stressometer",
    "table_cloth"
]);

const EQUIPMENT_IDENTIFIERS = new Set([
    "cardboard_boots",
    "cardboard_chestplate",
    "cardboard_helmet",
    "cardboard_leggings",
    "cardboard_sword",
    "handheld_worldshaper",
    "potato_projectile",
    "red_sand_paper",
    "sand_paper",
    "shopping_list",
    "super_glue"
]);

// These registrations are not plain full cubes. They can be built with native
// Bedrock state components, but their placement, support, and interaction
// rules must be specified before a definition is emitted.
const BLOCK_STATE_IDENTIFIERS = new Set([
    "andesite_ladder",
    "andesite_scaffolding",
    "bound_cardboard_block",
    "brass_ladder",
    "brass_scaffolding",
    "cardboard_block",
    "copper_ladder",
    "copper_scaffolding",
    "experience_block",
    "framed_glass_trapdoor"
]);

const SLIDING_DOOR_IDENTIFIERS = new Set([
    "andesite_door",
    "brass_door",
    "copper_door",
    "framed_glass_door"
]);

const TABLE_CLOTH_IDENTIFIERS = new Set([
    "andesite_table_cloth",
    "brass_table_cloth",
    "copper_table_cloth",
    "table_cloth"
]);

const SIMPLE_FOOD_IDENTIFIERS = new Set([
    "bar_of_chocolate",
    "builders_tea",
    "chocolate_glazed_berries",
    "honeyed_apple",
    "sweet_roll"
]);

const BLAZE_FUEL_IDENTIFIERS = new Set([
    "blaze_cake",
    "blaze_cake_base",
    "creative_blaze_cake"
]);

const LEGACY_ITEM_IDENTIFIERS = new Set([
    "chromatic_compound",
    "refined_radiance",
    "shadow_steel",
    "tree_fertilizer"
]);

async function files(directory) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = resolve(directory, entry.name);
        if (entry.isDirectory())
            result.push(...await files(file));
        else
            result.push(file);
    }
    return result;
}

async function fileExists(file) {
    try {
        return (await stat(file)).isFile();
    } catch {
        return false;
    }
}

function toRepositoryPath(file) {
    return relative(repositoryRoot, file).replaceAll("\\", "/");
}

function recipeResultIdentifier(recipe) {
    const result = recipe?.result;
    if (typeof result === "string")
        return result;
    if (typeof result?.id === "string")
        return result.id;
    return undefined;
}

function implementationFor(identifier, kind) {
	if (identifier === "crushed_raw_") {
		return {
			behaviorRequirement: "registration_template",
			implementationPackage: "S3-11",
			implementationReason: "This Java helper is a dynamic registration template, not a concrete item identifier; expand it into concrete crushed-material items before emitting Bedrock content."
		};
	}
    if (CONTRAPTION_IDENTIFIERS.has(identifier)) {
        return {
            behaviorRequirement: "contraption_actor",
            implementationPackage: "S4",
            implementationReason: "The Java registration participates in movable contraptions or their attachments."
        };
    }
    if (PROCESSING_IDENTIFIERS.has(identifier)) {
        return {
            behaviorRequirement: "machine_runtime",
            implementationPackage: "S3-11",
            implementationReason: "The Java registration needs fixed processing-machine state or a processing dependency."
        };
    }
    if (KINETIC_IDENTIFIERS.has(identifier)) {
        return {
            behaviorRequirement: "persistent_block_runtime",
            implementationPackage: "S3-9",
            implementationReason: "The Java registration is a kinetic structural component and must join the expanded kinetic graph."
        };
    }
    if (LOGISTICS_IDENTIFIERS.has(identifier)) {
        return {
            behaviorRequirement: "persistent_block_runtime",
            implementationPackage: "S3-10",
            implementationReason: "The Java registration needs logistics or copycat-state behavior beyond a static block definition."
        };
    }
	if (SLIDING_DOOR_IDENTIFIERS.has(identifier)) {
		return {
			behaviorRequirement: "persistent_block_runtime",
			implementationPackage: "S3-14",
			implementationReason: "The Java sliding door synchronizes two block halves, redstone state, double-door state, and animation visibility through a block entity."
		};
	}
	if (TABLE_CLOTH_IDENTIFIERS.has(identifier)) {
		return {
			behaviorRequirement: "persistent_block_runtime",
			implementationPackage: "S3-10",
			implementationReason: "The Java table cloth persists optional shop/request data and participates in logistics interaction, so it belongs with the logistics runtime."
		};
	}
	if (DISPLAY_IDENTIFIERS.has(identifier)) {
		return {
			behaviorRequirement: "persistent_block_runtime",
			implementationPackage: "S3-14",
			implementationReason: "The Java registration exposes persistent display, timing, or redstone-facing state."
		};
	}
	if (identifier === "rose_quartz_lamp") {
		return {
			behaviorRequirement: "persistent_block_runtime",
			implementationPackage: "S3-14",
			implementationReason: "The Java lamp propagates delayed redstone activation across a bounded cluster and exposes comparator output."
		};
	}
	if (BLOCK_STATE_IDENTIFIERS.has(identifier)) {
		return {
			behaviorRequirement: "block_state_runtime",
			implementationPackage: "S3-13",
			implementationReason: "The Java block has placement, support, orientation, collision, or destruction rules beyond a stateless full-cube definition."
		};
	}
	if (SIMPLE_FOOD_IDENTIFIERS.has(identifier) || identifier === "experience_nugget") {
		return {
			behaviorRequirement: "special_item_component",
			implementationPackage: "S3-13",
			implementationReason: "The Java item has consumption, return-container, effect, or experience semantics that must be represented by Bedrock item components and runtime hooks."
		};
	}
	if (BLAZE_FUEL_IDENTIFIERS.has(identifier)) {
		return {
			behaviorRequirement: "machine_runtime",
			implementationPackage: "S3-11",
			implementationReason: "The Java item is Blaze Burner fuel or a processing intermediate and must be delivered with the processing-machine fuel contract."
		};
	}
	if (LEGACY_ITEM_IDENTIFIERS.has(identifier)) {
		return {
			behaviorRequirement: "special_item_component",
			implementationPackage: "S6",
			implementationReason: "The Java item has world-interaction, movement, or transformation semantics that require the Stage-6 item component runtime."
		};
	}
    if (EQUIPMENT_IDENTIFIERS.has(identifier)) {
        return {
            behaviorRequirement: kind === "entity" ? "entity_runtime" : "special_item_component",
            implementationPackage: "S6",
            implementationReason: "The Java registration requires equipment, projectile, or special item interaction semantics."
        };
    }
    if (kind === "block_entity") {
        return {
            behaviorRequirement: "persistent_block_runtime",
            implementationPackage: "S3-13",
            implementationReason: "The Java block entity requires a defined persistent state and rendered-state contract before implementation."
        };
    }
    if (kind === "entity") {
        return {
            behaviorRequirement: "entity_runtime",
            implementationPackage: "S6",
            implementationReason: "The Java entity requires a behavior-pack actor and client entity rendering contract."
        };
    }
    return {
        behaviorRequirement: "stateless_content",
        implementationPackage: "S3-13",
        implementationReason: "The Java registration is static content, but its model and complete acquisition path require resource-equivalence work."
    };
}

function testPlanFor(behaviorRequirement) {
	if (behaviorRequirement === "stateless_content")
		return "Source and built resource/recipe contract before platform visual verification.";
	if (behaviorRequirement === "block_state_runtime")
		return "Focused placement, support, neighbor-state, loot, and reload tests before platform visual verification.";
	if (behaviorRequirement === "special_item_component")
		return "Focused item-use, inventory, effect, and acquisition tests in the owning content package.";
	if (behaviorRequirement === "registration_template")
		return "Source-registration audit must expand this template into concrete identifiers; no Bedrock definition may use the template identifier.";
	return "Focused positive, failure, restart, and concurrency tests in the owning implementation package.";
}

function acquisitionFor(recipeSources, lootPath) {
    if (recipeSources.length > 0) {
        const types = recipeSources.map(entry => entry.type);
        const vanillaTypes = new Set(["minecraft:crafting_shaped", "minecraft:crafting_shapeless", "minecraft:stonecutting", "minecraft:smelting", "minecraft:blasting"]);
        return {
            acquisitionConclusion: types.every(type => vanillaTypes.has(type))
                ? "vanilla_recipe_candidate"
                : "machine_or_custom_recipe_dependency",
            sourceRecipeTypes: [...new Set(types)].sort(),
            sourceRecipePaths: recipeSources.map(entry => entry.path)
        };
    }
    return {
        acquisitionConclusion: lootPath ? "world_or_loot_acquisition" : "no_static_acquisition_recipe",
        sourceRecipeTypes: [],
        sourceRecipePaths: []
    };
}

function assetFor(entry, modelPaths, texturePaths) {
    if (entry.kind === "entity")
        return "entity_visual_and_actor_required";
    if (entry.kind === "block_entity")
        return "persistent_block_visual_required";
    if (entry.kind === "item")
        return texturePaths.length > 0 ? "source_item_texture_available" : "source_model_not_found";
    return modelPaths.length > 0 ? "java_model_analysis_required" : "source_model_not_found";
}

const [workQueue, recipeFiles, generatedModelFiles, sourceTextureFiles] = await Promise.all([
    readFile(resolve(bedrockRoot, "data", "stage3-work-queue.json"), "utf8").then(JSON.parse),
    files(resolve(generatedRoot, "data", "create", "recipe")),
    files(resolve(generatedRoot, "assets", "create", "models")),
    files(resolve(sourceAssetRoot, "textures"))
]);

const recipes = await Promise.all(recipeFiles
    .filter(file => extname(file) === ".json")
    .map(async file => ({
        document: JSON.parse(await readFile(file, "utf8")),
        path: toRepositoryPath(file)
    })));

const entries = [];
for (const queued of workQueue.entries.filter(entry => ["S3-8B", "completed:S3-8B"].includes(entry.deliveryPackage))) {
    const identifier = queued.javaIdentifier.slice("create:".length);
    const recipeSources = recipes
        .filter(recipe => recipeResultIdentifier(recipe.document) === queued.javaIdentifier)
        .map(recipe => ({ path: recipe.path, type: recipe.document.type ?? "unknown" }))
        .sort((left, right) => left.path.localeCompare(right.path));
    const modelDirectory = queued.kind === "item" ? "item" : "block";
    const textureDirectory = queued.kind === "item" ? "item" : "block";
    const sourceLoot = queued.kind === "block"
        ? resolve(generatedRoot, "data", "create", "loot_table", "blocks", `${identifier}.json`)
        : undefined;
    const sourceLootPath = sourceLoot && await fileExists(sourceLoot) ? toRepositoryPath(sourceLoot) : null;
    const sourceModelPaths = generatedModelFiles
        .filter(file => file.includes(`/models/${modelDirectory}/`) && file.endsWith(`/${identifier}.json`))
        .map(toRepositoryPath)
        .sort();
    const sourceTexturePaths = sourceTextureFiles
        .filter(file => file.includes(`/textures/${textureDirectory}/`) && file.endsWith(`/${identifier}.png`))
        .map(toRepositoryPath)
        .sort();
    const implementation = implementationFor(identifier, queued.kind);
    const acquisition = acquisitionFor(recipeSources, sourceLootPath);

    entries.push({
        acceptanceId: queued.acceptanceId,
        assetConclusion: assetFor(queued, sourceModelPaths, sourceTexturePaths),
        bedrockIdentifier: queued.bedrockIdentifier,
        behaviorRequirement: implementation.behaviorRequirement,
        implementationPackage: implementation.implementationPackage,
        implementationReason: implementation.implementationReason,
        javaIdentifier: queued.javaIdentifier,
        kind: queued.kind,
        sourceLootPath,
        sourceModelPaths,
        sourceRecipePaths: acquisition.sourceRecipePaths,
        sourceRecipeTypes: acquisition.sourceRecipeTypes,
        sourceTexturePaths,
        acquisitionConclusion: acquisition.acquisitionConclusion,
        testPlan: testPlanFor(implementation.behaviorRequirement)
    });
}
entries.sort((left, right) => left.acceptanceId.localeCompare(right.acceptanceId));

const specifications = {
    schemaVersion: STAGE3_CONTENT_SPECIFICATION_SCHEMA_VERSION,
    generatedAt: "deterministic",
    generatedFrom: "bedrock/data/stage3-work-queue.json and committed Java generated resources",
    entries
};

const coverage = validateStage3ContentSpecifications(specifications, workQueue);
await writeFile(resolve(bedrockRoot, "data", "stage3-content-specifications.json"), `${JSON.stringify(specifications, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} S3-8B content specifications.`);
