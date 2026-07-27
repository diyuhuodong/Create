import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

const PROCESSORS = new Map([
	["create:compacting", { artifact: "data/recipes/basin.json", catalog: "BASIN_RECIPES", runtime: "behavior_pack/scripts/processing/stage3-processing-runtime.js", runtimeRegistration: "registerStage3Processing" }],
	["create:crushing", { artifact: "data/recipes/crushing.json", catalog: "CRUSHING_RECIPES", runtime: "behavior_pack/scripts/processing/crushing-wheel-runtime.js", runtimeRegistration: "registerCrushingWheels" }],
	["create:cutting", { artifact: "data/recipes/cutting.json", catalog: "CUTTING_RECIPES", runtime: "behavior_pack/scripts/processing/stage3-processing-runtime.js", runtimeRegistration: "registerStage3Processing" }],
	["create:haunting", { artifact: "data/recipes/fan.json", catalog: "FAN_RECIPES", runtime: "behavior_pack/scripts/processing/stage3-processing-runtime.js", runtimeRegistration: "registerStage3Processing" }],
	["create:mechanical_crafting", { artifact: "data/recipes/mechanical-crafting.json", catalog: "MECHANICAL_CRAFTING_RECIPES", catalogRuntime: "behavior_pack/scripts/processing/mechanical-crafter.js", runtime: "behavior_pack/scripts/processing/mechanical-crafter-runtime.js", runtimeRegistration: "registerMechanicalCrafters" }],
	["create:milling", { artifact: "data/recipes/milling.json", catalog: "MILLING_RECIPES", runtime: "behavior_pack/scripts/processing/millstone-runtime.js", runtimeRegistration: "registerMillstones" }],
	["create:mixing", { artifact: "data/recipes/basin.json", catalog: "BASIN_RECIPES", runtime: "behavior_pack/scripts/processing/stage3-processing-runtime.js", runtimeRegistration: "registerStage3Processing" }],
	["create:pressing", { artifact: "data/recipes/pressing.json", catalog: "PRESSING_RECIPES", runtime: "behavior_pack/scripts/processing/mechanical-press-runtime.js", runtimeRegistration: "registerMechanicalPresses" }],
	["create:splashing", { artifact: "data/recipes/fan.json", catalog: "FAN_RECIPES", runtime: "behavior_pack/scripts/processing/stage3-processing-runtime.js", runtimeRegistration: "registerStage3Processing" }]
]);

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function jsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await jsonFiles(file));
		else if (entry.name.endsWith(".json"))
			files.push(file);
	}
	return files;
}

function identifiersFromDefinition(definition) {
	const identifiers = [];
	for (const key of ["minecraft:block", "minecraft:item"])
		if (typeof definition[key]?.description?.identifier === "string")
			identifiers.push(definition[key].description.identifier);
	return identifiers;
}

function collectTypeIds(value, output = new Set()) {
	if (Array.isArray(value)) {
		for (const entry of value)
			collectTypeIds(entry, output);
		return output;
	}
	if (!value || typeof value !== "object")
		return output;
	for (const [key, entry] of Object.entries(value)) {
		if (key === "typeId" && typeof entry === "string")
			output.add(entry);
		else
			collectTypeIds(entry, output);
	}
	return output;
}

function recipeReferences(recipe) {
	const items = new Set();
	const fluids = new Set();
	for (const field of ["input", "ingredients", "outputs", "output"])
		collectTypeIds(recipe[field], items);
	for (const field of ["fluidIngredients", "fluidOutputs"])
		collectTypeIds(recipe[field], fluids);
	return { fluids, items };
}

function recipeRecords(document) {
	return Array.isArray(document) ? document : document.recipes;
}

function findConvertedRecord(document, convertedId) {
	const recipe = recipeRecords(document).find(record => record.id === convertedId);
	if (!recipe)
		throw new Error(`P7.3 converted recipe ${convertedId} is not in its generated artifact`);
	return recipe;
}

export async function validateP73ProcessingExecutionContract({ bedrockRoot = defaultBedrockRoot } = {}) {
	const [ledger, main, itemFiles, blockFiles, fluidRegistry] = await Promise.all([
		json(resolve(bedrockRoot, "data/p7-3-recipe-execution-ledger.json")),
		readFile(resolve(bedrockRoot, "behavior_pack/scripts/main.js"), "utf8"),
		jsonFiles(resolve(bedrockRoot, "behavior_pack/items")),
		jsonFiles(resolve(bedrockRoot, "behavior_pack/blocks")),
		import(pathToFileURL(resolve(bedrockRoot, "behavior_pack/scripts/fluids/fluid-registry.js")).href)
	]);
	const declared = new Set();
	for (const file of [...itemFiles, ...blockFiles])
		for (const identifier of identifiersFromDefinition(await json(file)))
			declared.add(identifier);
	const artifactDocuments = new Map();
	const runtimeSources = new Map();
	let referencedCreateItems = 0;
	let referencedFluidTypes = 0;
	const machineEntries = ledger.entries.filter(entry => entry.execution === "runtime_machine");
	for (const entry of machineEntries) {
		const processor = PROCESSORS.get(entry.processor);
		if (!processor)
			throw new Error(`P7.3 processing recipe ${entry.sourceId} has no processor contract`);
		if (JSON.stringify(entry.evidence) !== JSON.stringify([processor.artifact, processor.runtime]))
			throw new Error(`P7.3 processing recipe ${entry.sourceId} has stale execution evidence`);
		if (!main.includes(processor.runtimeRegistration))
			throw new Error(`P7.3 ${entry.processor} runtime is not registered by main.js`);
		if (!artifactDocuments.has(processor.artifact))
			artifactDocuments.set(processor.artifact, await json(resolve(bedrockRoot, processor.artifact)));
		if (!runtimeSources.has(processor.runtime))
			runtimeSources.set(processor.runtime, await readFile(resolve(bedrockRoot, processor.runtime), "utf8"));
		const runtime = runtimeSources.get(processor.runtime);
		const catalogRuntime = processor.catalogRuntime ?? processor.runtime;
		if (catalogRuntime !== processor.runtime && !runtime.includes(`./${catalogRuntime.slice(catalogRuntime.lastIndexOf("/") + 1)}`))
			throw new Error(`P7.3 ${entry.processor} runtime does not load its catalog module`);
		if (!runtimeSources.has(catalogRuntime))
			runtimeSources.set(catalogRuntime, await readFile(resolve(bedrockRoot, catalogRuntime), "utf8"));
		if (!runtimeSources.get(catalogRuntime).includes(processor.catalog))
			throw new Error(`P7.3 ${entry.processor} catalog module does not load ${processor.catalog}`);
		const references = recipeReferences(findConvertedRecord(artifactDocuments.get(processor.artifact), entry.convertedId));
		for (const typeId of references.items) {
			if (!typeId.startsWith("createbedrock:"))
				continue;
			referencedCreateItems++;
			if (!declared.has(typeId))
				throw new Error(`P7.3 ${entry.sourceId} references undeclared Bedrock processing content ${typeId}`);
		}
		for (const typeId of references.fluids) {
			referencedFluidTypes++;
			if (!fluidRegistry.fluidProfile(typeId))
				throw new Error(`P7.3 ${entry.sourceId} references an unregistered processing fluid ${typeId}`);
		}
	}
	const pendingSequenced = ledger.entries.filter(entry => entry.execution === "runtime_adapter_pending");
	const sequencedRuntime = await readFile(resolve(bedrockRoot, "behavior_pack/scripts/processing/sequenced-assembly-runtime.js"), "utf8");
	if (pendingSequenced.length !== 3 || pendingSequenced.some(entry => entry.missingRuntime !== "world_station_binding"
		|| JSON.stringify(entry.evidence) !== JSON.stringify(["data/recipes/sequenced-assembly.json", "behavior_pack/scripts/processing/sequenced-assembly-runtime.js"])))
		throw new Error("P7.3 sequenced-assembly runtime ledger entries are stale");
	for (const marker of ["SEQUENCED_ASSEMBLY_RECIPES", "SequencedAssemblyWorldAdapter", "registerSequencedAssembly"])
		if (!sequencedRuntime.includes(marker) || !main.includes("registerSequencedAssembly"))
			throw new Error("P7.3 sequenced-assembly runtime is not registered with its carrier adapter");
	return { machineRecipes: machineEntries.length, processorKinds: PROCESSORS.size, referencedCreateItems, referencedFluidTypes };
}
