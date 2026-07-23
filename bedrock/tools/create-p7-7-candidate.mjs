import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { appendP77Campaign, deriveS315CompatibilityLedger, validateP77AcceptanceDocument, validateP77ScenarioCatalog } from "./p7-7-acceptance-schema.mjs";
import { buildP77CandidateDocument, hashPackTree, validateP77CandidateDocument } from "./p7-7-candidate-schema.mjs";
import { createPackArchive } from "./pack.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

function git(repositoryRoot, args) {
	const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`Git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
	return result.stdout.trim();
}

function assertCleanWorktree(repositoryRoot) {
	const dirty = git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"])
		.split(/\r?\n/)
		.filter(Boolean)
		.filter(line => {
			const path = line.slice(3);
			return path !== ".codegraph/" && !path.startsWith(".codegraph/");
		});
	if (dirty.length > 0)
		throw new Error(`P7.7 formal candidates require a clean worktree; commit or remove: ${dirty.join(", ")}`);
}

function runBuild(bedrockRoot) {
	const result = spawnSync(process.execPath, [resolve(toolDirectory, "build.mjs")], {
		cwd: bedrockRoot,
		stdio: "inherit"
	});
	if (result.status !== 0)
		throw new Error("P7.7 candidate build failed");
}

async function writeJsonAtomically(file, value) {
	const temporary = `${file}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
	await rename(temporary, file);
}

function sameVersion(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

export async function createP77Candidate({
	bedrockRoot = defaultBedrockRoot,
	repositoryRoot = defaultRepositoryRoot,
	createdAt = new Date().toISOString(),
	build = true
} = {}) {
	assertCleanWorktree(repositoryRoot);
	const dataRoot = resolve(bedrockRoot, "data");
	const [previousCandidate, catalog, ledger] = await Promise.all([
		json(resolve(dataRoot, "p7-7-candidate.json")),
		json(resolve(dataRoot, "p7-7-scenario-catalog.json")),
		json(resolve(dataRoot, "p7-7-acceptance.json"))
	]);
	validateP77CandidateDocument(previousCandidate);
	validateP77ScenarioCatalog(catalog);
	validateP77AcceptanceDocument(ledger, { candidate: previousCandidate, catalog });
	if (build)
		runBuild(bedrockRoot);
	const [behaviorManifest, resourceManifest, tree] = await Promise.all([
		json(resolve(bedrockRoot, "build", "behavior_pack", "manifest.json")),
		json(resolve(bedrockRoot, "build", "resource_pack", "manifest.json")),
		hashPackTree({
			behaviorRoot: resolve(bedrockRoot, "build", "behavior_pack"),
			resourceRoot: resolve(bedrockRoot, "build", "resource_pack")
		})
	]);
	const artifact = await createPackArchive({ bedrockRoot });
	const commit = git(repositoryRoot, ["rev-parse", "HEAD"]);
	const candidate = buildP77CandidateDocument({
		commit,
		createdAt,
		tree,
		artifact,
		behaviorManifest,
		resourceManifest
	});
	if (previousCandidate.state === "frozen" && previousCandidate.candidateId === candidate.candidateId)
		throw new Error(`P7.7 candidate ${candidate.candidateId} is already frozen; do not overwrite its evidence campaign`);
	if (previousCandidate.state === "frozen"
		&& previousCandidate.candidateId !== candidate.candidateId
		&& sameVersion(previousCandidate.packs.behavior.version, candidate.packs.behavior.version))
		throw new Error("P7.7 requires incrementing both pack versions before freezing a changed candidate");
	const nextLedger = appendP77Campaign(ledger, candidate, catalog, {
		previousCandidate
	});
	const legacy = deriveS315CompatibilityLedger({ candidate, catalog, ledger: nextLedger });
	await Promise.all([
		writeJsonAtomically(resolve(dataRoot, "p7-7-candidate.json"), candidate),
		writeJsonAtomically(resolve(dataRoot, "p7-7-acceptance.json"), nextLedger),
		writeJsonAtomically(resolve(dataRoot, "s3-15-platform-acceptance.json"), legacy)
	]);
	return { candidate, ledger: nextLedger, artifact };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const result = await createP77Candidate();
	console.log(`Frozen P7.7 candidate ${result.candidate.candidateId} at ${result.artifact.path} (${result.artifact.sha256}).`);
}
