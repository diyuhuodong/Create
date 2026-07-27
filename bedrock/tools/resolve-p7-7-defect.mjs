import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { deriveS315CompatibilityLedger, resolveP77Defect } from "./p7-7-acceptance-schema.mjs";

const root = resolve(import.meta.dirname, "..");

function argument(name) {
	const index = process.argv.indexOf(name);
	if (index === -1 || !process.argv[index + 1])
		throw new Error("Usage: npm run acceptance:p7-7:defect -- --id <id> --state closed|accepted --resolution <text> --candidate <candidate-id>");
	return process.argv[index + 1];
}

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function writeJsonAtomically(file, value) {
	const temporary = `${file}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
	await rename(temporary, file);
}

const dataRoot = resolve(root, "data");
const [candidate, catalog, ledger] = await Promise.all([
	json(resolve(dataRoot, "p7-7-candidate.json")),
	json(resolve(dataRoot, "p7-7-scenario-catalog.json")),
	json(resolve(dataRoot, "p7-7-acceptance.json"))
]);
const next = resolveP77Defect(ledger, {
	defectId: argument("--id"),
	state: argument("--state"),
	resolution: argument("--resolution"),
	resolutionCandidateId: argument("--candidate"),
	closedAt: new Date().toISOString()
}, { candidate, catalog });
const legacy = deriveS315CompatibilityLedger({ candidate, catalog, ledger: next });
await Promise.all([
	writeJsonAtomically(resolve(dataRoot, "p7-7-acceptance.json"), next),
	writeJsonAtomically(resolve(dataRoot, "s3-15-platform-acceptance.json"), legacy)
]);
console.log(`Resolved P7.7 defect ${process.argv[process.argv.indexOf("--id") + 1]} as ${process.argv[process.argv.indexOf("--state") + 1]}.`);
