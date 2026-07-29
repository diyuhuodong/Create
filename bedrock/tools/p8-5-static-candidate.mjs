import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPackArchive } from "./pack.mjs";

export const P8_5_STATIC_CANDIDATE_SCHEMA_VERSION = 1;
const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

function version(manifest) {
	const value = manifest.header?.version;
	if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isInteger)) throw new Error("P8.5 requires a three-part pack version");
	return value.join(".");
}

export function buildP85StaticCandidate({ artifact, behaviorManifest, resourceManifest, migrationLedger, p84 }) {
	const registrations = migrationLedger.registrationEntries;
	if (registrations.some(entry => ["partial", "missing"].includes(entry.status))) throw new Error("P8.5 cannot freeze a candidate with partial or missing registrations");
	const p84Coverage = p84.entries.length;
	if (p84Coverage !== migrationLedger.domainEntries.length || p84.entries.some(entry => entry.status === "partial" || entry.status === "missing")) throw new Error("P8.5 requires complete P8.4 domain conclusions");
	const behaviorVersion = version(behaviorManifest);
	if (behaviorVersion !== version(resourceManifest)) throw new Error("P8.5 requires matching behavior and resource pack versions");
	const candidateId = `${behaviorVersion}-${artifact.sha256.slice(0, 12)}`;
	return {
		artifact: { path: artifact.path, sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
		candidateId,
		packs: { behaviorVersion, resourceVersion: version(resourceManifest) },
		platformReadiness: "pending_p8_6",
		schemaVersion: P8_5_STATIC_CANDIDATE_SCHEMA_VERSION,
		staticEvidence: { domainConclusions: p84Coverage, registrations: registrations.length, registrationStatuses: Object.fromEntries([...new Set(registrations.map(entry => entry.status))].sort().map(status => [status, registrations.filter(entry => entry.status === status).length])) },
		staticState: "static_verified"
	};
}

function run(bedrockRoot, file) {
	const result = spawnSync(process.execPath, [resolve(toolDirectory, file)], { cwd: bedrockRoot, stdio: "inherit" });
	if (result.status !== 0) throw new Error(`P8.5 prerequisite failed: ${file}`);
}

export async function createP85StaticCandidate({ bedrockRoot = defaultBedrockRoot, verify = true } = {}) {
	if (verify) { run(bedrockRoot, "run-tests.mjs"); run(bedrockRoot, "validate-packs.mjs"); run(bedrockRoot, "build.mjs"); }
	const data = name => readFile(resolve(bedrockRoot, "data", name), "utf8").then(JSON.parse);
	const [behaviorManifest, resourceManifest, migrationLedger, p84] = await Promise.all([
		readFile(resolve(bedrockRoot, "build", "behavior_pack", "manifest.json"), "utf8").then(JSON.parse), readFile(resolve(bedrockRoot, "build", "resource_pack", "manifest.json"), "utf8").then(JSON.parse), data("migration-ledger.json"), data("p8-4-domain-convergence.json")
	]);
	const artifact = await createPackArchive({ bedrockRoot });
	const candidate = buildP85StaticCandidate({ artifact, behaviorManifest, resourceManifest, migrationLedger, p84 });
	const report = resolve(bedrockRoot, "dist", `p8-5-${candidate.candidateId}.json`);
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify(candidate, null, 2)}\n`);
	return { candidate, report };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const { candidate, report } = await createP85StaticCandidate();
	console.log(`P8.5 static candidate ${candidate.candidateId}: ${candidate.artifact.path}; report ${report}`);
}
