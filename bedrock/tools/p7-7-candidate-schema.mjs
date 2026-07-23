import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { hasCompatibilityEngineVersion, REDSTONE_COMPATIBILITY_TARGET } from "../behavior_pack/scripts/redstone/redstone-target.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function assertObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError(`P7.7 ${label} must be an object`);
}

function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function versionString(version) {
	if (!Array.isArray(version) || version.length !== 3 || !version.every(part => Number.isInteger(part) && part >= 0))
		throw new TypeError("P7.7 pack versions must contain three non-negative integers");
	return version.join(".");
}

function assertTarget(target) {
	assertObject(target, "candidate target");
	if (target.id !== REDSTONE_COMPATIBILITY_TARGET.id || !hasCompatibilityEngineVersion(target.minimumEngineVersion))
		throw new Error("P7.7 candidate must retain the Realm/console 1.26.0 target");
}

function assertPack(pack, label) {
	assertObject(pack, `${label} pack identity`);
	if (typeof pack.uuid !== "string" || pack.uuid.length === 0)
		throw new TypeError(`P7.7 ${label} pack requires a UUID`);
	versionString(pack.version);
	if (!hasCompatibilityEngineVersion(pack.minimumEngineVersion))
		throw new Error(`P7.7 ${label} pack must retain the 1.26.0 target`);
}

function assertManifestIdentity(candidate, behaviorManifest, resourceManifest) {
	if (!behaviorManifest || !resourceManifest)
		return;
	const behavior = candidate.packs.behavior;
	const resource = candidate.packs.resource;
	if (behavior.uuid !== behaviorManifest.header?.uuid
		|| !sameJson(behavior.version, behaviorManifest.header?.version)
		|| !sameJson(behavior.minimumEngineVersion, behaviorManifest.header?.min_engine_version))
		throw new Error("P7.7 candidate behavior-pack identity differs from manifest.json");
	if (resource.uuid !== resourceManifest.header?.uuid
		|| !sameJson(resource.version, resourceManifest.header?.version)
		|| !sameJson(resource.minimumEngineVersion, resourceManifest.header?.min_engine_version))
		throw new Error("P7.7 candidate resource-pack identity differs from manifest.json");
	const server = behaviorManifest.dependencies?.find(dependency => dependency.module_name === "@minecraft/server");
	const ui = behaviorManifest.dependencies?.find(dependency => dependency.module_name === "@minecraft/server-ui");
	if (candidate.packs.serverApiVersion !== server?.version || candidate.packs.uiApiVersion !== ui?.version)
		throw new Error("P7.7 candidate Script API versions differ from behavior manifest dependencies");
	if (!behaviorManifest.modules?.every(module => sameJson(module.version, behavior.version))
		|| !resourceManifest.modules?.every(module => sameJson(module.version, resource.version)))
		throw new Error("P7.7 candidate module versions must match their pack headers");
	const behaviorResourceDependency = behaviorManifest.dependencies?.find(dependency => dependency.uuid === resource.uuid);
	const resourceBehaviorDependency = resourceManifest.dependencies?.find(dependency => dependency.uuid === behavior.uuid);
	if (!behaviorResourceDependency || !resourceBehaviorDependency)
		throw new Error("P7.7 candidate manifests must retain mutual BP/RP dependencies");
	if (!sameJson(behaviorResourceDependency.version, resource.version)
		|| !sameJson(resourceBehaviorDependency.version, behavior.version))
		throw new Error("P7.7 candidate BP/RP dependency versions must match their target headers");
}

export function validateP77CandidateDocument(candidate, { behaviorManifest, resourceManifest } = {}) {
	assertObject(candidate, "candidate");
	if (candidate.schemaVersion !== 1)
		throw new Error("P7.7 candidate must use schema version 1");
	assertTarget(candidate.target);
	if (!["uncreated", "frozen"].includes(candidate.state))
		throw new Error("P7.7 candidate state must be uncreated or frozen");
	if (candidate.state === "uncreated") {
		for (const field of ["candidateId", "createdAt", "source", "packs", "artifact"])
			if (candidate[field] !== null)
				throw new Error(`P7.7 uncreated candidate must keep ${field} null`);
		return { state: candidate.state, candidateId: null, files: 0, bytes: 0 };
	}

	if (typeof candidate.createdAt !== "string" || Number.isNaN(Date.parse(candidate.createdAt)))
		throw new TypeError("P7.7 frozen candidate requires an ISO creation time");
	assertObject(candidate.source, "candidate source");
	if (!COMMIT_PATTERN.test(candidate.source.commit))
		throw new Error("P7.7 candidate source commit must be a full Git SHA");
	if (!SHA256_PATTERN.test(candidate.source.treeSha256))
		throw new Error("P7.7 candidate tree digest must be SHA-256");
	if (candidate.source.clean !== true)
		throw new Error("P7.7 formal candidates must originate from a clean tracked worktree");
	if (!Number.isInteger(candidate.source.files) || candidate.source.files <= 0
		|| !Number.isInteger(candidate.source.bytes) || candidate.source.bytes <= 0)
		throw new Error("P7.7 candidate source must record positive file and byte counts");

	assertObject(candidate.packs, "candidate packs");
	assertPack(candidate.packs.behavior, "behavior");
	assertPack(candidate.packs.resource, "resource");
	if (!sameJson(candidate.packs.behavior.version, candidate.packs.resource.version))
		throw new Error("P7.7 behavior and resource pack versions must match");
	if (typeof candidate.packs.serverApiVersion !== "string" || typeof candidate.packs.uiApiVersion !== "string")
		throw new Error("P7.7 candidate must record Script API versions");

	assertObject(candidate.artifact, "candidate artifact");
	if (!SHA256_PATTERN.test(candidate.artifact.sha256))
		throw new Error("P7.7 candidate archive digest must be SHA-256");
	if (!Number.isInteger(candidate.artifact.sizeBytes) || candidate.artifact.sizeBytes <= 0)
		throw new Error("P7.7 candidate archive must record a positive size");
	const packVersion = versionString(candidate.packs.behavior.version);
	const expectedId = `${packVersion}-${candidate.source.commit.slice(0, 9)}-${candidate.source.treeSha256.slice(0, 12)}`;
	if (candidate.candidateId !== expectedId)
		throw new Error(`P7.7 candidate ID must be ${expectedId}`);
	const expectedPath = `bedrock/dist/createbedrock-${packVersion}-${candidate.artifact.sha256.slice(0, 12)}.mcaddon`;
	if (candidate.artifact.path !== expectedPath)
		throw new Error(`P7.7 candidate archive path must be ${expectedPath}`);
	assertManifestIdentity(candidate, behaviorManifest, resourceManifest);
	return {
		state: candidate.state,
		candidateId: candidate.candidateId,
		files: candidate.source.files,
		bytes: candidate.source.bytes
	};
}

async function treeFiles(directory, root, prefix) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.name === ".DS_Store")
			continue;
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await treeFiles(file, root, prefix));
		else if (entry.isFile())
			files.push({
				absolute: file,
				path: `${prefix}/${relative(root, file).split(sep).join("/")}`
			});
		else
			throw new Error(`P7.7 candidate tree rejects non-file entry ${file}`);
	}
	return files;
}

export async function hashPackTree({ behaviorRoot, resourceRoot }) {
	const entries = [
		...await treeFiles(behaviorRoot, behaviorRoot, "behavior_pack"),
		...await treeFiles(resourceRoot, resourceRoot, "resource_pack")
	].sort((left, right) => left.path.localeCompare(right.path));
	const hash = createHash("sha256");
	let bytes = 0;
	for (const entry of entries) {
		const contents = await readFile(entry.absolute);
		hash.update(entry.path);
		hash.update("\0");
		hash.update(String(contents.length));
		hash.update("\0");
		hash.update(contents);
		hash.update("\0");
		bytes += contents.length;
	}
	return { sha256: hash.digest("hex"), files: entries.length, bytes };
}

export function buildP77CandidateDocument({
	commit,
	createdAt,
	tree,
	artifact,
	behaviorManifest,
	resourceManifest
}) {
	const server = behaviorManifest.dependencies?.find(dependency => dependency.module_name === "@minecraft/server");
	const ui = behaviorManifest.dependencies?.find(dependency => dependency.module_name === "@minecraft/server-ui");
	const version = versionString(behaviorManifest.header?.version);
	const candidate = {
		schemaVersion: 1,
		state: "frozen",
		target: {
			id: REDSTONE_COMPATIBILITY_TARGET.id,
			minimumEngineVersion: [...REDSTONE_COMPATIBILITY_TARGET.minimumEngineVersion]
		},
		candidateId: `${version}-${commit.slice(0, 9)}-${tree.sha256.slice(0, 12)}`,
		createdAt,
		source: {
			commit,
			treeSha256: tree.sha256,
			clean: true,
			files: tree.files,
			bytes: tree.bytes
		},
		packs: {
			behavior: {
				uuid: behaviorManifest.header.uuid,
				version: [...behaviorManifest.header.version],
				minimumEngineVersion: [...behaviorManifest.header.min_engine_version]
			},
			resource: {
				uuid: resourceManifest.header.uuid,
				version: [...resourceManifest.header.version],
				minimumEngineVersion: [...resourceManifest.header.min_engine_version]
			},
			serverApiVersion: server?.version ?? null,
			uiApiVersion: ui?.version ?? null
		},
		artifact: {
			path: artifact.path,
			sha256: artifact.sha256,
			sizeBytes: artifact.sizeBytes
		}
	};
	validateP77CandidateDocument(candidate, { behaviorManifest, resourceManifest });
	return candidate;
}
