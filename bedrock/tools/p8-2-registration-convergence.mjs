import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const P8_2_REGISTRATION_CONVERGENCE_SCHEMA_VERSION = 1;

async function jsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await jsonFiles(path));
		else if (entry.name.endsWith(".json"))
			files.push(path);
	}
	return files;
}

async function definitions(root, kind) {
	const directory = resolve(root, "behavior_pack", kind === "entity" ? "entities" : kind === "item" ? "items" : "blocks");
	const key = kind === "entity" ? "minecraft:entity" : kind === "item" ? "minecraft:item" : "minecraft:block";
	const records = new Map();
	for (const file of await jsonFiles(directory)) {
		const identifier = JSON.parse(await readFile(file, "utf8"))[key]?.description?.identifier;
		if (typeof identifier === "string")
			records.set(identifier, relative(root, file));
	}
	return records;
}

function artifactKinds(kind) {
	return kind === "block_entity" ? ["block"] : kind === "item" ? ["item", "block"] : [kind];
}

function matrixBySource(matrix) {
	return new Map(matrix.entries.map(entry => [`${entry.kind}:${entry.javaIdentifier}`, entry]));
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function provisionalOverride(catalogEntry, matrixEntry) {
	return {
		acquisition: "partial",
		behavior: "partial",
		family: `P8.2/${matrixEntry?.domain ?? "unclassified"}`,
		mapping: { relation: "one_to_one", targets: [matrixEntry?.bedrockIdentifier ?? catalogEntry.javaIdentifier.replace(/^create:/, "createbedrock:")] },
		resources: "partial",
		sourceKey: catalogEntry.sourceKey,
		status: "partial"
	};
}

function assertP82Convergence(document) {
	if (document?.schemaVersion !== P8_2_REGISTRATION_CONVERGENCE_SCHEMA_VERSION || document.generatedAt !== "deterministic"
		|| !Array.isArray(document.resolved) || !Array.isArray(document.deferred))
		throw new Error("P8.2 registration convergence has an invalid header");
	const ids = new Set();
	for (const entry of document.resolved) {
		if (typeof entry.sourceKey !== "string" || ids.has(entry.sourceKey) || typeof entry.acceptanceId !== "string"
			|| typeof entry.target !== "string" || typeof entry.artifactPath !== "string"
			|| !["verified", "not_required"].includes(entry.behavior))
			throw new Error(`P8.2 has an invalid resolved registration ${entry.sourceKey ?? "unknown"}`);
		ids.add(entry.sourceKey);
	}
	for (const entry of document.deferred) {
		if (typeof entry.sourceKey !== "string" || ids.has(entry.sourceKey) || entry.owner !== "P8.3"
			|| typeof entry.reason !== "string")
			throw new Error(`P8.2 has an invalid deferred registration ${entry.sourceKey ?? "unknown"}`);
		ids.add(entry.sourceKey);
	}
	if (JSON.stringify(document.resolved.map(entry => entry.sourceKey)) !== JSON.stringify([...document.resolved.map(entry => entry.sourceKey)].sort((left, right) => left.localeCompare(right)))
		|| JSON.stringify(document.deferred.map(entry => entry.sourceKey)) !== JSON.stringify([...document.deferred.map(entry => entry.sourceKey)].sort((left, right) => left.localeCompare(right))))
		throw new Error("P8.2 registration convergence entries must be sorted");
	const expected = { deferred: document.deferred.length, resolved: document.resolved.length, total: ids.size };
	if (JSON.stringify(document.summary) !== JSON.stringify(expected))
		throw new Error("P8.2 registration convergence summary is stale");
	return expected;
}

export async function buildP82RegistrationConvergence({ bedrockRoot, catalog, matrix, overrides }) {
	const [blocks, entities, items] = await Promise.all([
		definitions(bedrockRoot, "block"), definitions(bedrockRoot, "entity"), definitions(bedrockRoot, "item")
	]);
	const definitionSets = { block: blocks, entity: entities, item: items };
	const matrixEntries = matrixBySource(matrix);
	const resolved = [];
	const deferred = [];
	const existing = new Map(overrides.entries.map(entry => [entry.sourceKey, clone(entry)]));
	for (const catalogEntry of catalog.entries) {
		const matrixEntry = matrixEntries.get(catalogEntry.sourceKey);
		let override = existing.get(catalogEntry.sourceKey);
		const previouslyConverged = override?.p8Convergence?.package === "P8.2";
		const convergedByP83 = override?.p8Semantic?.package === "P8.3";
		if (convergedByP83) {
			deferred.push({
				reason: matrixEntry?.status === "static_verified"
					? "The legacy static-verification record has no concrete mapped Bedrock target artifact; P8.3 supplies the explicit virtualized or composite mapping."
					: matrixEntry ? `Matrix status is ${matrixEntry.status}; P8.3 supplies the dedicated semantic implementation.` : "No legacy static-verification record exists; P8.3 supplies the dedicated semantic implementation.",
				sourceKey: catalogEntry.sourceKey,
				owner: "P8.3"
			});
			continue;
		}
		const eligible = override?.status === "partial" || previouslyConverged || override === undefined;
		if (!eligible)
			continue;
		if (matrixEntry?.status !== "static_verified") {
			deferred.push({
				reason: matrixEntry ? `Matrix status is ${matrixEntry.status}; P8.3 requires a dedicated semantic implementation.` : "No legacy static-verification record exists; P8.3 requires a dedicated semantic implementation.",
				sourceKey: catalogEntry.sourceKey,
				owner: "P8.3"
			});
			continue;
		}
		override ??= provisionalOverride(catalogEntry, matrixEntry);
		const targets = override.mapping.targets;
		const artifact = artifactKinds(matrixEntry.kind)
			.map(kind => targets.map(target => [kind, definitionSets[kind].get(target)]).find(([, path]) => path))
			.find(Boolean);
		if (!artifact) {
			deferred.push({
				reason: "The legacy static-verification record has no concrete mapped Bedrock target artifact; P8.3 must supply an explicit virtualized or composite mapping.",
				sourceKey: override.sourceKey,
				owner: "P8.3"
			});
			continue;
		}
		if (matrixEntry.behaviorPath !== null) {
			if (typeof matrixEntry.behaviorPath !== "string")
				throw new Error(`P8.2 ${override.sourceKey} has an invalid runtime path`);
			await stat(resolve(bedrockRoot, matrixEntry.behaviorPath));
		}
		override.behavior = matrixEntry.behaviorPath === null ? "not_required" : "verified";
		override.p8Convergence = { package: "P8.2", source: "migration-matrix static_verified plus target artifact and runtime-path verification" };
		override.resources = "verified";
		override.status = "implemented";
		existing.set(override.sourceKey, override);
		resolved.push({
			acceptanceId: matrixEntry.acceptanceId,
			artifactKind: artifact[0],
			artifactPath: artifact[1],
			behavior: override.behavior,
			behaviorPath: matrixEntry.behaviorPath,
			sourceKey: override.sourceKey,
			target: targets[0]
		});
	}
	const updated = { ...clone(overrides), entries: [...existing.values()] };
	updated.entries.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
	resolved.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
	deferred.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
	const document = {
		deferred,
		generatedAt: "deterministic",
		generatedFrom: ["data/migration-matrix.json", "data/migration-overrides.json", "behavior_pack definitions"],
		resolved,
		schemaVersion: P8_2_REGISTRATION_CONVERGENCE_SCHEMA_VERSION,
		summary: { deferred: deferred.length, resolved: resolved.length, total: resolved.length + deferred.length }
	};
	assertP82Convergence(document);
	return { document, overrides: updated };
}

export { assertP82Convergence };
