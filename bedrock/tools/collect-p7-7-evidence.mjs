import { resolve } from "node:path";

import { collectP77Evidence } from "./p7-7-evidence-lifecycle.mjs";

const root = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(root, "..");
const index = process.argv.indexOf("--report");
if (index === -1 || !process.argv[index + 1])
	throw new Error("Usage: npm run acceptance:p7-7:evidence -- --report work/evidence/p7-7/<candidate>/<platform>/<run>/report.json");
const result = await collectP77Evidence({ reportFile: resolve(repositoryRoot, process.argv[index + 1]), repositoryRoot });
console.log(`Indexed ${result.files} P7.7 evidence files in files.sha256.`);
