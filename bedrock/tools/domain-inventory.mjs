import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const DOMAIN_INVENTORY_SCHEMA_VERSION = 2;

/** Stable key shared by generated inventory and the full migration ledger. */
export function domainSourceKey(domain, entry) {
	if (typeof domain !== "string" || domain.length === 0 || typeof entry?.source !== "string" || entry.source.length === 0)
		throw new TypeError("Domain inventory entries require a domain and source path");
	return `domain:${domain}:${entry.source}${entry.test ? `#${entry.test}` : ""}`;
}

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

function sourcePath(repositoryRoot, path) {
	return relative(repositoryRoot, path).replaceAll("\\", "/");
}

async function jsonDomain(repositoryRoot, name, directory) {
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
		const entry = { source: sourcePath(repositoryRoot, file), type, status: "specification_pending" };
		entries.push({ ...entry, sourceKey: domainSourceKey(name, entry) });
	}
	return { name, entries };
}

async function fileDomain(repositoryRoot, name, directory, filter = () => true) {
	const entries = (await filesUnder(directory))
		.filter(filter)
		.map(file => {
			const entry = { source: sourcePath(repositoryRoot, file), status: "specification_pending" };
			return { ...entry, sourceKey: domainSourceKey(name, entry) };
		});
	return { name, entries };
}

async function annotatedGameTests(repositoryRoot) {
	const directory = resolve(repositoryRoot, "src/main/java/com/simibubi/create/infrastructure/gametest/tests");
	const entries = [];
	for (const file of await filesUnder(directory)) {
		const content = await readFile(file, "utf8");
		for (const match of content.matchAll(/@(?:CreateTest|GameTest)[\s\S]{0,400}?\bvoid\s+([A-Za-z0-9_]+)/g)) {
			const entry = { source: sourcePath(repositoryRoot, file), test: match[1], status: "specification_pending" };
			entries.push({ ...entry, sourceKey: domainSourceKey("game_tests", entry) });
		}
	}
	return { name: "game_tests", entries };
}

export async function buildDomainInventory({ repositoryRoot }) {
	if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0)
		throw new TypeError("Domain inventory requires a repository root");
	const generatedData = resolve(repositoryRoot, "src/generated/resources/data/create");
	const domains = await Promise.all([
		jsonDomain(repositoryRoot, "recipes", resolve(generatedData, "recipe")),
		jsonDomain(repositoryRoot, "advancements", resolve(generatedData, "advancement")),
		jsonDomain(repositoryRoot, "loot_tables", resolve(generatedData, "loot_table")),
		jsonDomain(repositoryRoot, "tags", resolve(generatedData, "tags")),
		fileDomain(repositoryRoot, "gametest_structures", resolve(repositoryRoot, "src/main/resources/data/create/structure/gametest")),
		fileDomain(repositoryRoot, "source_assets", resolve(repositoryRoot, "src/main/resources/assets/create")),
		fileDomain(repositoryRoot, "generated_assets", resolve(repositoryRoot, "src/generated/resources/assets/create")),
		fileDomain(repositoryRoot, "ponder_scenes", resolve(repositoryRoot, "src/main/java/com/simibubi/create/infrastructure/ponder/scenes"), file => file.endsWith(".java")),
		fileDomain(repositoryRoot, "compatibility_classes", resolve(repositoryRoot, "src/main/java/com/simibubi/create/compat"), file => file.endsWith(".java")),
		annotatedGameTests(repositoryRoot)
	]);

	for (const domain of domains)
		domain.entries.sort((left, right) => (left.source + (left.test ?? "")).localeCompare(right.source + (right.test ?? "")));
	return {
		schemaVersion: DOMAIN_INVENTORY_SCHEMA_VERSION,
		generatedFrom: "Create 6.0.11 / Minecraft Java 1.21.1 source and generated resources",
		generatedAt: "deterministic",
		summary: Object.fromEntries(domains.map(domain => [domain.name, domain.entries.length])),
		domains
	};
}
