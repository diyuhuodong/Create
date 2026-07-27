import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { applyP77ContentLog } from "./p7-7-evidence-lifecycle.mjs";

const root = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(root, "..");

function argument(name) {
	const index = process.argv.indexOf(name);
	if (index === -1 || !process.argv[index + 1])
		throw new Error("Usage: npm run acceptance:p7-7:content-log -- --report <report.json> --log <copied-content-log.txt> [--allowlist <json-file>]");
	return process.argv[index + 1];
}

const allowlistIndex = process.argv.indexOf("--allowlist");
const warningAllowlist = allowlistIndex === -1
	? []
	: JSON.parse(await readFile(resolve(repositoryRoot, process.argv[allowlistIndex + 1]), "utf8"));
const result = await applyP77ContentLog({
	reportFile: resolve(repositoryRoot, argument("--report")),
	logFile: resolve(repositoryRoot, argument("--log")),
	repositoryRoot,
	warningAllowlist
});
console.log(`Parsed Content Log: ${result.contentLogErrorCount} errors, ${result.contentLogWarningCount} warnings, ${result.scriptBootMarkerCount} boot markers.`);
