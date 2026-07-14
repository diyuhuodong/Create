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

const S3_9_GENERATED_STRUCTURE_BLOCKS = ["water_wheel_structure"];

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

export async function validateStage3KineticSourceContract({ bedrockRoot = defaultBedrockRoot } = {}) {
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

    return { blocks: S3_9_DELIVERED_KINETIC_BLOCKS.length, generatedStructures: S3_9_GENERATED_STRUCTURE_BLOCKS.length, redstoneControlledBlocks: 3 };
}
