import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

async function filesUnder(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesUnder(path));
		else
			files.push(path);
	}
	return files;
}

function sourcePath(path) {
	return relative(repositoryRoot, path).replaceAll("\\", "/");
}

async function jsonDomain(name, directory) {
	const entries = [];
	for (const file of await filesUnder(directory)) {
		if (!file.endsWith(".json"))
			continue;

		let type = undefined;
		try {
			type = JSON.parse(await readFile(file, "utf8")).type;
		} catch {
			type = "invalid_json";
		}
		entries.push({ source: sourcePath(file), type, status: "specification_pending" });
	}
	return { name, entries };
}

async function fileDomain(name, directory, filter = () => true) {
	const entries = (await filesUnder(directory))
		.filter(filter)
		.map(file => ({ source: sourcePath(file), status: "specification_pending" }));
	return { name, entries };
}

async function annotatedGameTests() {
	const directory = resolve(repositoryRoot, "src/main/java/com/simibubi/create/infrastructure/gametest/tests");
	const entries = [];
	for (const file of await filesUnder(directory)) {
		const content = await readFile(file, "utf8");
		for (const match of content.matchAll(/@(?:CreateTest|GameTest)[\s\S]{0,400}?\b(?:void|static)\s+([A-Za-z0-9_]+)/g)) {
			entries.push({ source: sourcePath(file), test: match[1], status: "specification_pending" });
		}
	}
	return { name: "game_tests", entries };
}

const generatedData = resolve(repositoryRoot, "src/generated/resources/data/create");
const domains = await Promise.all([
	jsonDomain("recipes", resolve(generatedData, "recipe")),
	jsonDomain("advancements", resolve(generatedData, "advancement")),
	jsonDomain("loot_tables", resolve(generatedData, "loot_table")),
	jsonDomain("tags", resolve(generatedData, "tags")),
	fileDomain("gametest_structures", resolve(repositoryRoot, "src/main/resources/data/create/structure/gametest")),
	fileDomain("source_assets", resolve(repositoryRoot, "src/main/resources/assets/create")),
	fileDomain("generated_assets", resolve(repositoryRoot, "src/generated/resources/assets/create")),
	fileDomain("ponder_scenes", resolve(repositoryRoot, "src/main/java/com/simibubi/create/infrastructure/ponder/scenes"), file => file.endsWith(".java")),
	fileDomain("compatibility_classes", resolve(repositoryRoot, "src/main/java/com/simibubi/create/compat"), file => file.endsWith(".java")),
	annotatedGameTests()
]);

for (const domain of domains)
	domain.entries.sort((left, right) => (left.source + (left.test ?? "")).localeCompare(right.source + (right.test ?? "")));

const inventory = {
	schemaVersion: 1,
	generatedFrom: "Create 6.0.11 / Minecraft Java 1.21.1 source and generated resources",
	generatedAt: "deterministic",
	summary: Object.fromEntries(domains.map(domain => [domain.name, domain.entries.length])),
	domains
};

await mkdir(resolve(bedrockRoot, "data"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "domain-inventory.json"), `${JSON.stringify(inventory, null, "\t")}\n`);
console.log(`Wrote domain inventory for ${domains.reduce((total, domain) => total + domain.entries.length, 0)} source artifacts.`);
