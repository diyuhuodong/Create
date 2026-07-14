import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

export const S3_11_PROCESSING_BLOCKS = ["basin", "encased_fan", "mechanical_mixer", "mechanical_saw"];
const KINETIC_PROCESSORS = new Set(["encased_fan", "mechanical_mixer", "mechanical_saw"]);
const REPORTS = ["basin", "cutting", "fan"];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function languageKeys(file) {
	return new Set((await readFile(file, "utf8")).split(/\r?\n/).map(line => line.split("=", 1)[0]));
}

export async function validateStage3ProcessingSourceContract({ bedrockRoot = defaultBedrockRoot, dataRoot = defaultBedrockRoot } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [english, chinese, runtime, kinetics] = await Promise.all([
		languageKeys(resolve(resourceRoot, "texts", "en_US.lang")),
		languageKeys(resolve(resourceRoot, "texts", "zh_CN.lang")),
		readFile(resolve(behaviorRoot, "scripts", "processing", "stage3-processing-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "kinetics", "kinetic-world.js"), "utf8")
	]);
	for (const identifier of S3_11_PROCESSING_BLOCKS) {
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${identifier}.json`));
		const block = definition["minecraft:block"];
		const fullIdentifier = `createbedrock:${identifier}`;
		if (block?.description?.identifier !== fullIdentifier)
			throw new Error(`S3-11 processing block ${identifier} has an incorrect identifier`);
		if (!block.description.menu_category?.category)
			throw new Error(`S3-11 processing block ${identifier} is missing creative access`);
		if (typeof block.components?.["minecraft:geometry"] !== "string"
			|| typeof block.components?.["minecraft:item_visual"]?.geometry?.identifier !== "string")
			throw new Error(`S3-11 processing block ${identifier} is missing a block or item geometry`);
		if (typeof block.components?.["minecraft:loot"] !== "string")
			throw new Error(`S3-11 processing block ${identifier} is missing explicit loot`);
		await stat(resolve(behaviorRoot, block.components["minecraft:loot"]));
		if (!english.has(`tile.${fullIdentifier}.name`) || !chinese.has(`tile.${fullIdentifier}.name`))
			throw new Error(`S3-11 processing block ${identifier} is missing EN/ZH translations`);
		if (!runtime.includes(fullIdentifier))
			throw new Error(`S3-11 processing block ${identifier} is not registered by the processing runtime`);
		if (KINETIC_PROCESSORS.has(identifier) && !kinetics.includes(fullIdentifier))
			throw new Error(`S3-11 processing block ${identifier} is missing KineticWorld registration`);
	}
	for (const token of ["BatchProcessingMachine", "basinController", "fanMode", "createShardedMachineState"]) {
		if (!runtime.includes(token))
			throw new Error(`S3-11 processing runtime is missing ${token}`);
	}
	for (const processor of REPORTS) {
		const report = await readJson(resolve(dataRoot, "data", "recipes", `${processor}-import-report.json`));
		if (report.processor !== processor || !Array.isArray(report.records) || report.records.length === 0)
			throw new Error(`S3-11 ${processor} recipe report is incomplete`);
		if (report.records.some(record => !["manual_specification", "migrated", "unsupported_dependency"].includes(record.status)))
			throw new Error(`S3-11 ${processor} recipe report has an unknown classification`);
	}
	const basinRecipes = await readJson(resolve(dataRoot, "data", "recipes", "basin.json"));
	if (basinRecipes.some(recipe => recipe.outputs.some(output => output.typeId === "minecraft:lava")))
		throw new Error("S3-11 basin recipes must not encode fluid results as item stacks");
	return { blocks: S3_11_PROCESSING_BLOCKS.length, reports: REPORTS.length };
}
