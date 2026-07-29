import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const JAVA_BEHAVIOR_INVENTORY_SCHEMA_VERSION = 1;

const REGISTRATION_SOURCES = Object.freeze([
	"AllBlockSpoutingBehaviours.java",
	"AllContraptionMovementSettings.java",
	"AllDisplaySources.java",
	"AllDisplayTargets.java",
	"AllInteractionBehaviours.java",
	"AllMovementBehaviours.java"
]);

const AREA_BY_CONTENT_DIRECTORY = Object.freeze({
	contraptions: "dynamic_mechanics",
	equipment: "equipment",
	fluids: "fluid_heat",
	kinetics: "kinetics",
	logistics: "logistics",
	processing: "processing",
	redstone: "redstone_display",
	schematics: "schematics",
	trains: "trains"
});

async function filesUnder(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesUnder(path));
		else if (entry.name.endsWith(".java"))
			files.push(path);
	}
	return files;
}

function sourcePath(repositoryRoot, path) {
	return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function areaForSource(source) {
	const contentMatch = source.match(/^src\/main\/java\/com\/simibubi\/create\/content\/([^/]+)/);
	if (contentMatch)
		return AREA_BY_CONTENT_DIRECTORY[contentMatch[1]] ?? `content_${contentMatch[1]}`;
	if (source.includes("/infrastructure/worldgen/"))
		return "worldgen";
	return "registration_hooks";
}

function entryForSource(repositoryRoot, path) {
	const source = sourcePath(repositoryRoot, path);
	const area = areaForSource(source);
	return {
		area,
		evidence: {
			bedrockRuntime: [],
			platformScenarios: [],
			staticTests: []
		},
		owner: `P8.3/${area}`,
		source,
		sourceKey: `behavior:${source}`,
		status: "audit_pending"
	};
}

function countBy(entries, key) {
	return Object.fromEntries([...new Set(entries.map(entry => String(entry[key])))].sort().map(value => [
		value,
		entries.filter(entry => String(entry[key]) === value).length
	]));
}

export function validateJavaBehaviorInventory(document) {
	if (!document || typeof document !== "object" || Array.isArray(document))
		throw new TypeError("Java behavior inventory must be an object");
	if (document.schemaVersion !== JAVA_BEHAVIOR_INVENTORY_SCHEMA_VERSION)
		throw new Error(`Java behavior inventory must use schema version ${JAVA_BEHAVIOR_INVENTORY_SCHEMA_VERSION}`);
	if (document.generatedAt !== "deterministic" || typeof document.generatedFrom !== "string")
		throw new Error("Java behavior inventory requires deterministic provenance");
	if (!Array.isArray(document.entries) || !document.summary || typeof document.summary !== "object")
		throw new TypeError("Java behavior inventory requires entries and a summary");
	const sourceKeys = new Set();
	for (const entry of document.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new TypeError("Java behavior inventory entry must be an object");
		for (const field of ["area", "owner", "source", "sourceKey", "status"])
			if (typeof entry[field] !== "string" || entry[field].length === 0)
				throw new TypeError(`Java behavior inventory entry requires ${field}`);
		if (!["audit_pending", "equivalent", "platform_blocked", "verified"].includes(entry.status))
			throw new Error(`Java behavior inventory entry ${entry.sourceKey} has unsupported status ${entry.status}`);
		if (entry.sourceKey !== `behavior:${entry.source}` || sourceKeys.has(entry.sourceKey))
			throw new Error(`Java behavior inventory has duplicate or unstable key ${entry.sourceKey}`);
		sourceKeys.add(entry.sourceKey);
		if (!entry.evidence || typeof entry.evidence !== "object")
			throw new TypeError(`Java behavior inventory entry ${entry.sourceKey} requires evidence`);
		for (const field of ["bedrockRuntime", "platformScenarios", "staticTests"])
			if (!Array.isArray(entry.evidence[field]) || entry.evidence[field].some(value => typeof value !== "string" || value.length === 0))
				throw new Error(`Java behavior inventory entry ${entry.sourceKey} has invalid ${field} evidence`);
	}
	if (JSON.stringify(document.entries.map(entry => entry.sourceKey)) !== JSON.stringify([...sourceKeys].sort((left, right) => left.localeCompare(right))))
		throw new Error("Java behavior inventory entries must be sorted by source key");
	const expectedSummary = {
		areas: countBy(document.entries, "area"),
		status: countBy(document.entries, "status"),
		total: document.entries.length
	};
	if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary))
		throw new Error("Java behavior inventory summary is stale");
	return { entries: document.entries.length, ...document.summary };
}

export async function buildJavaBehaviorInventory({ repositoryRoot }) {
	if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0)
		throw new TypeError("Java behavior inventory requires a repository root");
	const javaRoot = resolve(repositoryRoot, "src", "main", "java", "com", "simibubi", "create");
	const [content, worldgen] = await Promise.all([
		filesUnder(resolve(javaRoot, "content")),
		filesUnder(resolve(javaRoot, "infrastructure", "worldgen"))
	]);
	const registrations = REGISTRATION_SOURCES.map(file => resolve(javaRoot, file));
	const entries = [...new Set([...content, ...worldgen, ...registrations])]
		.map(path => entryForSource(repositoryRoot, path))
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
	const document = {
		schemaVersion: JAVA_BEHAVIOR_INVENTORY_SCHEMA_VERSION,
		generatedAt: "deterministic",
		generatedFrom: "Create 6.0.11 / Minecraft Java 1.21.1 behavior source",
		entries,
		summary: {
			areas: countBy(entries, "area"),
			status: countBy(entries, "status"),
			total: entries.length
		}
	};
	validateJavaBehaviorInventory(document);
	return document;
}
