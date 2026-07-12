import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe/milling");
const outputRoot = resolve(bedrockRoot, "behavior_pack/scripts/processing/generated");

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

const recipes = [];
const skipped = [];
for (const file of await findJsonFiles(sourceRoot)) {
	const source = JSON.parse(await readFile(file, "utf8"));
	const input = source.ingredients?.length === 1 ? source.ingredients[0] : undefined;
	const output = source.results?.every(result => typeof result.id === "string");
	if (source.type !== "create:milling" || typeof input?.item !== "string" || !output) {
		skipped.push(relative(sourceRoot, file));
		continue;
	}

	const sourcePath = relative(sourceRoot, file).replace(/\\/g, "/").replace(/\.json$/, "");
	recipes.push({
		id: `create:milling/${sourcePath}`,
		input: { typeId: mapIdentifier(input.item), count: input.count ?? 1 },
		processingTicks: source.processing_time ?? 100,
		outputs: source.results.map(result => ({
			typeId: mapIdentifier(result.id),
			count: result.count ?? 1,
			chance: result.chance ?? 1
		}))
	});
}

recipes.sort((left, right) => left.id.localeCompare(right.id));
await mkdir(outputRoot, { recursive: true });
await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await writeFile(resolve(outputRoot, "milling-recipes.js"), `// Generated from src/generated/resources/data/create/recipe/milling.\nexport const MILLING_RECIPES = ${JSON.stringify(recipes, null, "\t")};\n`);
await writeFile(resolve(bedrockRoot, "data", "recipes", "milling.json"), `${JSON.stringify(recipes, null, "\t")}\n`);
await writeFile(resolve(bedrockRoot, "data", "recipes", "milling-import-report.json"), `${JSON.stringify({ imported: recipes.length, skipped }, null, "\t")}\n`);
console.log(`Imported ${recipes.length} simple milling recipes; ${skipped.length} require manual conversion.`);
