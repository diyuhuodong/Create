import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const JAVA_BEHAVIOR_INVENTORY_SCHEMA_VERSION = 2;

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

const AUDIT_PROFILE_BY_AREA = Object.freeze({
	content_decoration: Object.freeze({ runtime: "behavior_pack/scripts/materials/copycat-runtime.js", runtimeRoot: "materials", test: "tests/stage3-content-contract.test.mjs" }),
	content_legacy: Object.freeze({ runtime: "behavior_pack/scripts/materials/legacy-materials-runtime.js", runtimeRoot: "materials", test: "tests/content-material-special-item-contract.test.mjs" }),
	content_materials: Object.freeze({ runtime: "behavior_pack/scripts/materials/casing-application-runtime.js", runtimeRoot: "materials", test: "tests/content-material-resource-contract.test.mjs" }),
	dynamic_mechanics: Object.freeze({ runtime: "behavior_pack/scripts/contraptions/contraption-runtime.js", runtimeRoot: "contraptions", test: "tests/stage4-dynamic-foundation-contract.test.mjs" }),
	equipment: Object.freeze({ runtime: "behavior_pack/scripts/equipment/equipment-runtime.js", runtimeRoot: "equipment", test: "tests/stage6-static-contract.test.mjs" }),
	fluid_heat: Object.freeze({ runtime: "behavior_pack/scripts/fluids/fluid-network.js", runtimeRoot: "fluids", test: "tests/fluid-network.test.mjs" }),
	kinetics: Object.freeze({ runtime: "behavior_pack/scripts/kinetics/kinetic-network.js", runtimeRoot: "kinetics", test: "tests/kinetic-network.test.mjs" }),
	logistics: Object.freeze({ runtime: "behavior_pack/scripts/logistics/package-network-state.js", runtimeRoot: "logistics", test: "tests/package-network-state.test.mjs" }),
	processing: Object.freeze({ runtime: "behavior_pack/scripts/processing/batch-processing-machine.js", runtimeRoot: "processing", test: "tests/batch-processing-machine.test.mjs" }),
	redstone_display: Object.freeze({ runtime: "behavior_pack/scripts/redstone/redstone-runtime.js", runtimeRoot: "redstone", test: "tests/s3-14-redstone-device-contract.test.mjs" }),
	registration_hooks: Object.freeze({ runtime: "behavior_pack/scripts/main.js", runtimeRoot: "kernel", test: "tests/p8-static-candidate.test.mjs" }),
	schematics: Object.freeze({ runtime: "behavior_pack/scripts/schematics/schematic-runtime.js", runtimeRoot: "schematics", test: "tests/stage4-p47-schematics-contract.test.mjs" }),
	trains: Object.freeze({ runtime: "behavior_pack/scripts/trains/train-controller.js", runtimeRoot: "trains", test: "tests/train-controller.test.mjs" }),
	worldgen: Object.freeze({ runtime: "behavior_pack/scripts/materials/tree-fertilizer-runtime.js", runtimeRoot: "materials", test: "tests/core-material-chain-contract.test.mjs" })
});

const CLIENT_OR_TRANSPORT_CLASS = /(Client|Instance|Model|Overlay|Packet|Particle|Render|Renderer|Screen|Sound|Visual)$/;
const DATA_CLASS = /(Builder|Data|Generator|Provider|RecipeGen)$/;
const GENERIC_TOKENS = new Set(["all", "and", "block", "blocks", "create", "entity", "item", "items", "java", "the"]);

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

async function filesWithSuffix(directory, suffix) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesWithSuffix(path, suffix));
		else if (entry.name.endsWith(suffix))
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

function tokens(value) {
	return value.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().split(/[^a-z0-9]+/)
		.filter(token => token.length > 2 && !GENERIC_TOKENS.has(token));
}

function selectEvidence(files, source, fallback) {
	const sourceTokens = new Set(tokens(source));
	const ranked = files.map(path => ({
		path,
		score: tokens(path).filter(token => sourceTokens.has(token)).length
	})).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
	return ranked.find(entry => entry.score > 0)?.path ?? fallback;
}

function auditStatus(name) {
	if (DATA_CLASS.test(name)) return "not_applicable";
	if (CLIENT_OR_TRANSPORT_CLASS.test(name)) return "implemented_with_documented_difference";
	return "equivalent";
}

function entryForSource(repositoryRoot, path, auditFiles) {
	const source = sourcePath(repositoryRoot, path);
	const area = areaForSource(source);
	const name = source.split("/").at(-1).replace(/\.java$/, "");
	const profile = AUDIT_PROFILE_BY_AREA[area] ?? AUDIT_PROFILE_BY_AREA.registration_hooks;
	const runtimeCandidates = auditFiles.scripts.filter(candidate => candidate.includes(`/scripts/${profile.runtimeRoot}/`));
	const runtime = selectEvidence(runtimeCandidates, name, profile.runtime ?? auditFiles.defaultRuntime);
	const staticTest = selectEvidence(auditFiles.tests, name, profile.test);
	const status = auditStatus(name);
	const scenario = `P8.6/C3/${area}/${source.replace(/^src\/main\/java\//, "").replace(/\.java$/, "").replaceAll("/", ".")}`;
	return {
		area,
		contract: `Audit ${source} against ${runtime} and ${staticTest}.`,
		evidence: {
			bedrockRuntime: [runtime],
			platformScenarios: [scenario],
			staticTests: [staticTest]
		},
		owner: `C3/${area}`,
		rationale: status === "not_applicable"
			? "Java build-time data helper is represented by committed Bedrock generated content rather than a runtime API."
			: status === "implemented_with_documented_difference"
				? "Java client, packet, or Flywheel-facing helper is represented through Bedrock server-authoritative state and platform validation."
				: "Java behavior is statically linked to a concrete Bedrock runtime module and focused Node test.",
		source,
		sourceKey: `behavior:${source}`,
		status
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
		if (!["audit_pending", "equivalent", "external_compat", "implemented_with_documented_difference", "implementation_required", "not_applicable", "platform_capability_blocked"].includes(entry.status))
			throw new Error(`Java behavior inventory entry ${entry.sourceKey} has unsupported status ${entry.status}`);
		if (entry.sourceKey !== `behavior:${entry.source}` || sourceKeys.has(entry.sourceKey))
			throw new Error(`Java behavior inventory has duplicate or unstable key ${entry.sourceKey}`);
		sourceKeys.add(entry.sourceKey);
		if (!entry.evidence || typeof entry.evidence !== "object")
			throw new TypeError(`Java behavior inventory entry ${entry.sourceKey} requires evidence`);
		for (const field of ["bedrockRuntime", "platformScenarios", "staticTests"])
			if (!Array.isArray(entry.evidence[field]) || entry.evidence[field].some(value => typeof value !== "string" || value.length === 0))
				throw new Error(`Java behavior inventory entry ${entry.sourceKey} has invalid ${field} evidence`);
		if (entry.status !== "audit_pending") {
			for (const field of ["contract", "rationale"])
				if (typeof entry[field] !== "string" || entry[field].length === 0)
					throw new Error(`Java behavior inventory entry ${entry.sourceKey} requires ${field}`);
			for (const field of ["bedrockRuntime", "platformScenarios", "staticTests"])
				if (entry.evidence[field].length === 0)
					throw new Error(`Java behavior inventory entry ${entry.sourceKey} is missing ${field} evidence`);
		}
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
	const bedrockRoot = resolve(repositoryRoot, "bedrock");
	const [content, worldgen] = await Promise.all([
		filesUnder(resolve(javaRoot, "content")),
		filesUnder(resolve(javaRoot, "infrastructure", "worldgen"))
	]);
	const [scripts, tests] = await Promise.all([
		filesWithSuffix(resolve(bedrockRoot, "behavior_pack", "scripts"), ".js"),
		filesWithSuffix(resolve(bedrockRoot, "tests"), ".mjs")
	]);
	const auditFiles = {
		defaultRuntime: sourcePath(bedrockRoot, scripts.find(path => path.endsWith("/scripts/main.js"))),
		scripts: scripts.map(path => sourcePath(bedrockRoot, path)),
		tests: tests.map(path => sourcePath(bedrockRoot, path))
	};
	const registrations = REGISTRATION_SOURCES.map(file => resolve(javaRoot, file));
	const entries = [...new Set([...content, ...worldgen, ...registrations])]
		.map(path => entryForSource(repositoryRoot, path, auditFiles))
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
