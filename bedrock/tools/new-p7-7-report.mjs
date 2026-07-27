import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildP77ReportTemplate } from "./p7-7-evidence-lifecycle.mjs";

const root = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(root, "..");

function argument(name) {
	const index = process.argv.indexOf(name);
	if (index === -1 || !process.argv[index + 1])
		throw new Error(`Usage: npm run acceptance:p7-7:new-report -- --platform <id> --scenario <id> --run <id>`);
	return process.argv[index + 1];
}

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

const [candidate, catalog] = await Promise.all([
	json(resolve(root, "data", "p7-7-candidate.json")),
	json(resolve(root, "data", "p7-7-scenario-catalog.json"))
]);
const report = buildP77ReportTemplate({
	candidate,
	catalog,
	platformId: argument("--platform"),
	scenarioId: argument("--scenario"),
	runId: argument("--run")
});
const file = resolve(repositoryRoot, report.reportPath);
try {
	await stat(file);
	throw new Error(`P7.7 report already exists: ${report.reportPath}`);
} catch (error) {
	if (error?.code !== "ENOENT")
		throw error;
}
await mkdir(dirname(file), { recursive: true });
await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Created P7.7 report template ${report.reportPath}. Fill platform observations, then run evidence and record commands.`);
