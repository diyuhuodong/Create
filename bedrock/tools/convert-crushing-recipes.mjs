import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe/crushing");
const outputRoot = resolve(bedrockRoot, "behavior_pack/scripts/processing/generated");

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

const recipes = [];
const skipped = [];
for (const file of await findJsonFiles(sourceRoot)) {
	const source = JSON.parse(await readFile(file, "utf8"));
	const sourcePath = relative(sourceRoot, file).replace(/\\/g, "/").replace(/\.json$/, "");
	const input = source.ingredients?.length === 1 ? source.ingredients[0] : undefined;
	const outputs = source.results?.every(result => typeof result.id === "string" && result.id.startsWith("minecraft:"));
	if (source.type !== "create:crushing" || sourcePath.startsWith("compat/") || typeof input?.item !== "string" || !outputs) {
		skipped.push(sourcePath);
		continue;
	}

	recipes.push({
		id: `create:crushing/${sourcePath}`,
		input: { typeId: input.item, count: input.count ?? 1 },
		processingTicks: source.processing_time ?? 100,
		outputs: source.results.map(result => ({
			typeId: result.id,
			count: result.count ?? 1,
			chance: result.chance ?? 1
		}))
	});
}

recipes.sort((left, right) => left.id.localeCompare(right.id));
await mkdir(outputRoot, { recursive: true });
await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await writeFile(resolve(outputRoot, "crushing-recipes.js"), `// Generated from src/generated/resources/data/create/recipe/crushing.\nexport const CRUSHING_RECIPES = ${JSON.stringify(recipes, null, "\t")};\n`);
await writeFile(resolve(bedrockRoot, "data", "recipes", "crushing.json"), `${JSON.stringify(recipes, null, "\t")}\n`);
await writeFile(resolve(bedrockRoot, "data", "recipes", "crushing-import-report.json"), `${JSON.stringify({ imported: recipes.length, skipped }, null, "\t")}\n`);
console.log(`Imported ${recipes.length} Bedrock-native crushing recipes; ${skipped.length} require item or compatibility migration.`);
