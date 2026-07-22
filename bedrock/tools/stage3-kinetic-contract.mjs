import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { KINETIC_BLOCKS } from "../behavior_pack/scripts/kinetics/kinetic-world.js";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

export const S3_9_DELIVERED_KINETIC_BLOCKS = [
    "adjustable_chain_gearshift",
    "andesite_encased_cogwheel",
    "andesite_encased_large_cogwheel",
    "andesite_encased_shaft",
    "brass_encased_cogwheel",
    "brass_encased_large_cogwheel",
    "brass_encased_shaft",
    "creative_motor",
    "chain_conveyor",
    "flywheel",
    "gearshift",
    "large_water_wheel",
    "metal_girder_encased_shaft",
    "powered_shaft",
    "sequenced_gearshift",
    "steam_engine",
    "windmill_bearing"
];

export const S3_9_DIRECT_RECIPE_BLOCKS = [
    "adjustable_chain_gearshift",
    "andesite_encased_cogwheel",
    "andesite_encased_large_cogwheel",
    "andesite_encased_shaft",
    "brass_encased_cogwheel",
    "brass_encased_large_cogwheel",
    "brass_encased_shaft",
    "chain_conveyor",
    "flywheel",
    "gearshift",
    "large_water_wheel",
    "metal_girder_encased_shaft",
    "sequenced_gearshift",
    "steam_engine",
    "windmill_bearing"
];

const S3_9_CREATIVE_ONLY_BLOCKS = new Set([
    "creative_motor",
    "powered_shaft"
]);

const S3_9_GENERATED_STRUCTURE_BLOCKS = ["water_wheel_structure"];

const RUNTIME_ABSORBED_ACCEPTANCE_IDS = Object.freeze([
    "KINETICS-ENCASED-COGWHEEL-BLOCK_ENTITY",
    "KINETICS-ENCASED-LARGE-COGWHEEL-BLOCK_ENTITY",
    "KINETICS-ENCASED-SHAFT-BLOCK_ENTITY",
    "KINETICS-MOTOR-BLOCK_ENTITY",
    "KINETICS-SIMPLE-KINETIC-BLOCK_ENTITY",
    "KINETICS-VERTICAL-GEARBOX-ITEM"
]);

const S3_9_RUNTIME_PATHS = new Map([
    ["KINETICS-CHAIN-CONVEYOR-BLOCK", "behavior_pack/scripts/logistics/depot-runtime.js"],
    ["KINETICS-CHAIN-CONVEYOR-BLOCK_ENTITY", "behavior_pack/scripts/logistics/depot-runtime.js"],
    ["KINETICS-POWERED-SHAFT-BLOCK", "behavior_pack/scripts/fluids/fluid-runtime.js"],
    ["KINETICS-POWERED-SHAFT-BLOCK_ENTITY", "behavior_pack/scripts/fluids/fluid-runtime.js"],
    ["KINETICS-STEAM-ENGINE-BLOCK", "behavior_pack/scripts/fluids/fluid-runtime.js"],
    ["KINETICS-STEAM-ENGINE-BLOCK_ENTITY", "behavior_pack/scripts/fluids/fluid-runtime.js"],
    ["KINETICS-WINDMILL-BEARING-BLOCK", "behavior_pack/scripts/contraptions/contraption-runtime.js"],
    ["KINETICS-WINDMILL-BEARING-BLOCK_ENTITY", "behavior_pack/scripts/contraptions/contraption-runtime.js"]
]);

const S3_9_RUNTIME_BOUNDARIES = [
    {
        path: "behavior_pack/scripts/kinetics/kinetic-runtime.js",
        markers: ["registerKinetics", "restoreKineticRecords", "placeLargeWaterWheelStructure", "cycleSequencedGearshiftProgram"]
    },
    {
        path: "behavior_pack/scripts/kinetics/kinetic-world.js",
        markers: ["snapshot()", "restore(snapshot)", "setExternalSource", "resolveDirtyDimension"]
    },
    {
        path: "behavior_pack/scripts/logistics/depot-runtime.js",
        markers: ["configureChainConveyor", "rescanChainConveyors", "refreshDepotBeltSpeeds"]
    },
    {
        path: "behavior_pack/scripts/fluids/fluid-runtime.js",
        markers: ["syncSteamEngines", "boilerSteamEngineOutput", "collectBoilerMembers", "setExternalSource"]
    },
    {
        path: "behavior_pack/scripts/contraptions/contraption-runtime.js",
        markers: ["windmillSailCount", "windmillSpeedForSailCount", "activeBearings"]
    }
];

async function readJson(file) {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
        throw new Error(`Invalid JSON in ${file}: ${error.message}`);
    }
}

async function languageKeys(file) {
    const text = await readFile(file, "utf8");
    return new Set(text.split(/\r?\n/).map(line => line.split("=", 1)[0]));
}

async function recipeIngredientsAreDeclared(recipe, bedrockRoot) {
    const definition = recipe["minecraft:recipe_shaped"] ?? recipe["minecraft:recipe_shapeless"];
    const ingredients = definition?.ingredients ?? Object.values(definition?.key ?? {});
    if (!Array.isArray(ingredients) || ingredients.length === 0)
        return false;
    for (const ingredient of ingredients) {
        const item = ingredient?.item;
        if (typeof item !== "string" || !item.startsWith("createbedrock:"))
            continue;
        const name = item.slice("createbedrock:".length);
        const candidates = [
            resolve(bedrockRoot, "behavior_pack", "blocks", `${name}.json`),
            resolve(bedrockRoot, "behavior_pack", "items", `${name}.json`)
        ];
        let declared = false;
        for (const candidate of candidates) {
            try {
                declared = (await stat(candidate)).isFile();
            } catch {
                // Try the other Bedrock content type before failing the recipe.
            }
            if (declared)
                break;
        }
        if (!declared)
            throw new Error(`S3-9 recipe references an undeclared custom ingredient ${item}`);
    }
    return true;
}

function runtimePathFor(entry) {
    return S3_9_RUNTIME_PATHS.get(entry.acceptanceId) ?? "behavior_pack/scripts/kinetics/kinetic-runtime.js";
}

export async function validateStage3KineticSourceContract({
    bedrockRoot = defaultBedrockRoot,
    trackingRoot = defaultBedrockRoot
} = {}) {
    const [english, chinese] = await Promise.all([
        languageKeys(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang")),
        languageKeys(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"))
    ]);

    for (const identifier of S3_9_DELIVERED_KINETIC_BLOCKS) {
        const file = resolve(bedrockRoot, "behavior_pack", "blocks", `${identifier}.json`);
        const definition = await readJson(file);
        const block = definition["minecraft:block"];
        const fullIdentifier = `createbedrock:${identifier}`;
        if (block?.description?.identifier !== fullIdentifier)
            throw new Error(`S3-9 kinetic block ${identifier} has an incorrect identifier`);
        if (!block.description.menu_category?.category)
            throw new Error(`S3-9 kinetic block ${identifier} is missing creative access`);
        if (typeof block.components?.["minecraft:geometry"] !== "string"
            || typeof block.components?.["minecraft:item_visual"]?.geometry?.identifier !== "string")
            throw new Error(`S3-9 kinetic block ${identifier} is missing a block or item geometry`);
        if (!KINETIC_BLOCKS[fullIdentifier])
            throw new Error(`S3-9 kinetic block ${identifier} is missing its KineticWorld registration`);
        if (!english.has(`tile.${fullIdentifier}.name`) || !chinese.has(`tile.${fullIdentifier}.name`))
            throw new Error(`S3-9 kinetic block ${identifier} is missing a translation`);
        const loot = block.components?.["minecraft:loot"];
        if (typeof loot !== "string")
            throw new Error(`S3-9 kinetic block ${identifier} is missing explicit loot`);
        await stat(resolve(bedrockRoot, "behavior_pack", loot));
    }

    for (const identifier of S3_9_DIRECT_RECIPE_BLOCKS) {
        const recipe = await readJson(resolve(bedrockRoot, "behavior_pack", "recipes", `${identifier}.json`));
        const definition = recipe["minecraft:recipe_shaped"] ?? recipe["minecraft:recipe_shapeless"];
        if (definition?.result?.item !== `createbedrock:${identifier}`)
            throw new Error(`S3-9 kinetic block ${identifier} is missing a direct crafting result`);
        if (!await recipeIngredientsAreDeclared(recipe, bedrockRoot))
            throw new Error(`S3-9 kinetic block ${identifier} is missing recipe ingredients`);
    }
    for (const identifier of S3_9_CREATIVE_ONLY_BLOCKS) {
        if (!S3_9_DELIVERED_KINETIC_BLOCKS.includes(identifier))
            throw new Error(`S3-9 creative-only block ${identifier} is not a delivered kinetic block`);
    }

    const gearshift = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", "gearshift.json"));
    const chainGearshift = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", "adjustable_chain_gearshift.json"));
    const sequencedGearshift = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", "sequenced_gearshift.json"));
    const gearshiftBlock = gearshift["minecraft:block"];
    const chainGearshiftBlock = chainGearshift["minecraft:block"];
    const sequencedGearshiftBlock = sequencedGearshift["minecraft:block"];
    if (JSON.stringify(gearshiftBlock.description.properties?.["createbedrock:powered"]) !== JSON.stringify([0, 1]))
        throw new Error("S3-9 gearshift is missing its durable powered state");
    if (JSON.stringify(chainGearshiftBlock.description.properties?.["createbedrock:signal"]) !== JSON.stringify(Array.from({ length: 16 }, (_, value) => value)))
        throw new Error("S3-9 chain gearshift is missing its durable analog signal state");
    if (JSON.stringify(sequencedGearshiftBlock.description.properties?.["createbedrock:powered"]) !== JSON.stringify([0, 1]))
        throw new Error("S3-9 sequenced gearshift is missing its durable powered state");
    if (!gearshiftBlock.components?.["minecraft:redstone_conductivity"]?.redstone_conductor
        || !chainGearshiftBlock.components?.["minecraft:redstone_conductivity"]?.redstone_conductor
        || !sequencedGearshiftBlock.components?.["minecraft:redstone_conductivity"]?.redstone_conductor)
        throw new Error("S3-9 gearshifts must participate in redstone sampling");

    for (const identifier of S3_9_GENERATED_STRUCTURE_BLOCKS) {
        const definition = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", `${identifier}.json`));
        if (definition["minecraft:block"]?.description?.identifier !== `createbedrock:${identifier}`)
            throw new Error(`S3-9 generated structure ${identifier} has an incorrect identifier`);
        if (!english.has(`tile.createbedrock:${identifier}.name`) || !chinese.has(`tile.createbedrock:${identifier}.name`))
            throw new Error(`S3-9 generated structure ${identifier} is missing a translation`);
    }

    const specifications = await readJson(resolve(trackingRoot, "data", "stage3-kinetic-specifications.json"));
    const [matrix, workQueue] = await Promise.all([
        readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
        readJson(resolve(trackingRoot, "data", "stage3-work-queue.json"))
    ]);
    const matrixEntries = new Map(matrix.entries.map(entry => [entry.acceptanceId, entry]));
    const queued = workQueue.entries.filter(entry => entry.deliveryPackage === "completed:S3-9");
    if (queued.length !== 33)
        throw new Error(`S3-9 must statically close 33 records, found ${queued.length}`);
    for (const entry of queued) {
        const matrixEntry = matrixEntries.get(entry.acceptanceId);
        if (!matrixEntry || matrixEntry.status !== "static_verified" || entry.matrixStatus !== "static_verified")
            throw new Error(`S3-9 record ${entry.acceptanceId} is not statically verified in both tracking records`);
        if (matrixEntry.persistenceSchema !== 2 || matrixEntry.behaviorPath !== runtimePathFor(entry))
            throw new Error(`S3-9 record ${entry.acceptanceId} has an incomplete runtime boundary`);
    }
    const absorbed = new Map(specifications.entries
        .filter(entry => RUNTIME_ABSORBED_ACCEPTANCE_IDS.includes(entry.acceptanceId))
        .map(entry => [entry.acceptanceId, entry]));
    if (absorbed.size !== RUNTIME_ABSORBED_ACCEPTANCE_IDS.length)
        throw new Error("S3-9 is missing one or more runtime-absorbed kinetic specifications");
    for (const acceptanceId of RUNTIME_ABSORBED_ACCEPTANCE_IDS) {
        const entry = absorbed.get(acceptanceId);
        if (entry.deliveryState !== "runtime_absorbed" || entry.implementationPackage !== "S3-9")
            throw new Error(`S3-9 absorbed kinetic record ${acceptanceId} has an invalid delivery boundary`);
    }
    for (const identifier of ["createbedrock:encased_cogwheel", "createbedrock:encased_large_cogwheel"])
        if (!KINETIC_BLOCKS[identifier])
            throw new Error(`S3-9 absorbed kinetic alias ${identifier} is missing its KineticWorld node`);
    for (const identifier of ["createbedrock:andesite_encased_shaft", "createbedrock:brass_encased_shaft", "createbedrock:metal_girder_encased_shaft", "createbedrock:creative_motor"])
        if (!KINETIC_BLOCKS[identifier])
            throw new Error(`S3-9 absorbed kinetic implementation ${identifier} is missing its KineticWorld node`);
    const gearbox = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", "gearbox.json"));
    if (gearbox["minecraft:block"]?.description?.identifier !== "createbedrock:gearbox"
        || !gearbox["minecraft:block"]?.description?.traits?.["minecraft:placement_direction"])
        throw new Error("S3-9 vertical gearbox must resolve to the orientable Gearbox block item");

    for (const boundary of S3_9_RUNTIME_BOUNDARIES) {
        const source = await readFile(resolve(bedrockRoot, boundary.path), "utf8");
        for (const marker of boundary.markers)
            if (!source.includes(marker))
                throw new Error(`S3-9 runtime boundary ${boundary.path} is missing ${marker}`);
    }

    return {
        blocks: S3_9_DELIVERED_KINETIC_BLOCKS.length,
        directRecipes: S3_9_DIRECT_RECIPE_BLOCKS.length,
        generatedStructures: S3_9_GENERATED_STRUCTURE_BLOCKS.length,
        redstoneControlledBlocks: 3,
        runtimeAbsorbed: absorbed.size,
        runtimeBoundaries: S3_9_RUNTIME_BOUNDARIES.length,
        staticRecords: queued.length
    };
}
