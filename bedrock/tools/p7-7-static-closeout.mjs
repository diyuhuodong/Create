import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateP77StaticContract } from "./p7-7-static-contract.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");

function git(repositoryRoot, args) {
	const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`Git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
	return result.stdout.trim();
}

function trackedDirtyPaths(status) {
	return status.split(/\r?\n/)
		.filter(Boolean)
		.map(line => line.slice(3))
		.filter(path => path !== ".codegraph/" && !path.startsWith(".codegraph/"));
}

/** Build a truthful offline closeout report without freezing or altering a candidate. */
export function buildP77StaticCloseout({ staticReport, headCommit, dirtyPaths = [], candidateArtifactValid = false }) {
	if (staticReport?.staticClosure?.ready !== true)
		throw new Error("P7.7 static closeout requires a passed static closure contract");
	const candidate = staticReport.candidateId;
	const clean = dirtyPaths.length === 0;
	const candidateState = staticReport.candidateState;
	const candidateFresh = candidateState === "frozen" && staticReport.candidateSourceCommit === headCommit && candidateArtifactValid;
	return {
		schemaVersion: 1,
		staticState: "static_verified",
		candidateState,
		candidateId: candidate,
		sourceHead: headCommit,
		dirtyPaths: [...dirtyPaths].sort(),
		candidateFresh,
		candidateReadiness: candidateState !== "frozen"
			? "candidate_uncreated"
			: !clean ? "source_dirty"
				: candidateFresh ? "candidate_current"
					: "candidate_refreeze_required",
		platformReadiness: staticReport.staticClosure.platformChecksPending === 0
			? "platform_verified"
			: "platform_validation_pending",
		requiredActions: [
			...(clean ? [] : ["Commit or remove non-CodeGraph source changes before freezing a candidate." ]),
			...(candidateFresh ? [] : ["Increment both Bedrock pack versions and freeze a new immutable candidate."]),
			...(staticReport.staticClosure.platformChecksPending === 0 ? [] : ["Execute the Windows, Realm, and PlayStation evidence campaigns against the frozen candidate."])
		]
	};
}

export async function inspectP77StaticCloseout({
	bedrockRoot = defaultBedrockRoot,
	repositoryRoot = defaultRepositoryRoot
} = {}) {
	const staticReport = await validateP77StaticContract({ root: bedrockRoot, trackingRoot: bedrockRoot });
	const headCommit = git(repositoryRoot, ["rev-parse", "HEAD"]);
	const dirtyPaths = trackedDirtyPaths(git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]));
	let candidateArtifactValid = false;
	if (staticReport.candidateArtifact) {
		try {
			const file = resolve(repositoryRoot, staticReport.candidateArtifact.path);
			if ((await stat(file)).isFile())
				candidateArtifactValid = createHash("sha256").update(await readFile(file)).digest("hex") === staticReport.candidateArtifact.sha256;
		} catch {
			candidateArtifactValid = false;
		}
	}
	return buildP77StaticCloseout({ staticReport, headCommit, dirtyPaths, candidateArtifactValid });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const report = await inspectP77StaticCloseout();
	console.log(JSON.stringify(report, null, 2));
}
