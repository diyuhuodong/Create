import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe/pressing");
const outputRoot = resolve(bedrockRoot, "behavior_pack/scripts/processing/generated");
const TAG_ITEMS = {
	"c:ingots/copper": ["minecraft:copper_ingot"],
	"c:ingots/gold": ["minecraft:gold_ingot"],
	"c:ingots/iron": ["minecraft:iron_ingot"]
};

function mapIdentifier(identifier) {
	return identifier.startsWith("create:")
		? `createbedrock:${identifier.slice("create:".length)}`
		: identifier;
}

async function findJsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await findJsonFiles(path));
		else if (entry.name.endsWith(".json"))
			files.push(path);
	}
	return files;
}

function expandIngredient(ingredient) {
	if (Array.isArray(ingredient))
		return ingredient.flatMap(expandIngredient);
	if (typeof ingredient?.item === "string")
		return [mapIdentifier(ingredient.item)];
	if (typeof ingredient?.tag === "string")
		return TAG_ITEMS[ingredient.tag] ?? [];
	return [];
}

const recipes = [];
const skipped = [];
for (const file of await findJsonFiles(sourceRoot)) {
	const source = JSON.parse(await readFile(file, "utf8"));
	const sourcePath = relative(sourceRoot, file).replace(/\\/g, "/").replace(/\.json$/, "");
	const inputs = source.ingredients?.length === 1 ? expandIngredient(source.ingredients[0]) : [];
	const outputs = source.results?.every(result => typeof result.id === "string")
		? source.results.map(result => ({ typeId: mapIdentifier(result.id), count: result.count ?? 1, chance: result.chance ?? 1 }))
		: undefined;
	if (source.type !== "create:pressing" || sourcePath.startsWith("compat/") || inputs.length === 0 || !outputs) {
		skipped.push(sourcePath);
		continue;
	}

	for (const input of inputs) {
		recipes.push({
			id: `create:pressing/${sourcePath}:${input}`,
			input: { typeId: input, count: 1 },
			processingTicks: source.processing_time ?? 100,
			outputs
		});
	}
}

recipes.sort((left, right) => left.id.localeCompare(right.id));
await mkdir(outputRoot, { recursive: true });
await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await writeFile(resolve(outputRoot, "pressing-recipes.js"), `// Generated from src/generated/resources/data/create/recipe/pressing.\nexport const PRESSING_RECIPES = ${JSON.stringify(recipes, null, "\t")};\n`);
await writeFile(resolve(bedrockRoot, "data", "recipes", "pressing.json"), `${JSON.stringify(recipes, null, "\t")}\n`);
await writeFile(resolve(bedrockRoot, "data", "recipes", "pressing-import-report.json"), `${JSON.stringify({ imported: recipes.length, skipped }, null, "\t")}\n`);
console.log(`Imported ${recipes.length} Bedrock-compatible pressing recipes; ${skipped.length} require manual conversion.`);
