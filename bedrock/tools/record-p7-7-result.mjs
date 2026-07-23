import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { deriveS315CompatibilityLedger, recordP77AcceptanceRun } from "./p7-7-acceptance-schema.mjs";
import { sha256File } from "./pack.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function writeJsonAtomically(file, value) {
	const temporary = `${file}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
	await rename(temporary, file);
}

function reportArgument(args) {
	const index = args.indexOf("--report");
	if (index === -1 || !args[index + 1])
		throw new Error("Usage: npm run acceptance:p7-7:record -- --report work/evidence/p7-7/<candidate>/<platform>/<run>/report.json");
	return args[index + 1];
}

async function verifyEvidence(run, repositoryRoot) {
	for (const evidence of run.evidence) {
		const file = resolve(repositoryRoot, evidence.path);
		if (!(await stat(file)).isFile())
			throw new Error(`P7.7 evidence is not a file: ${evidence.path}`);
		const digest = await sha256File(file);
		if (digest !== evidence.sha256)
			throw new Error(`P7.7 evidence digest changed: ${evidence.path}`);
	}
}

export async function recordP77Result({
	report,
	reportFile,
	bedrockRoot = defaultBedrockRoot,
	repositoryRoot = defaultRepositoryRoot
}) {
	const normalizedReportPath = relative(repositoryRoot, resolve(reportFile)).split(sep).join("/");
	if (report.reportPath !== normalizedReportPath)
		throw new Error(`P7.7 reportPath must match the supplied report file ${normalizedReportPath}`);
	const dataRoot = resolve(bedrockRoot, "data");
	const [candidate, catalog, ledger] = await Promise.all([
		json(resolve(dataRoot, "p7-7-candidate.json")),
		json(resolve(dataRoot, "p7-7-scenario-catalog.json")),
		json(resolve(dataRoot, "p7-7-acceptance.json"))
	]);
	await verifyEvidence(report, repositoryRoot);
	const nextLedger = recordP77AcceptanceRun(ledger, report, { candidate, catalog });
	const legacy = deriveS315CompatibilityLedger({ candidate, catalog, ledger: nextLedger });
	await Promise.all([
		writeJsonAtomically(resolve(dataRoot, "p7-7-acceptance.json"), nextLedger),
		writeJsonAtomically(resolve(dataRoot, "s3-15-platform-acceptance.json"), legacy)
	]);
	return { candidate, ledger: nextLedger };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const reportFile = resolve(defaultRepositoryRoot, reportArgument(process.argv.slice(2)));
	const report = await json(reportFile);
	const result = await recordP77Result({ report, reportFile });
	console.log(`Recorded P7.7 run ${report.runId} for ${result.candidate.candidateId}; outcome is ${result.ledger.outcome}.`);
}
