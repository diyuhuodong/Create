import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP8C4SemanticDifferenceLedger } from "./p8-c4-semantic-differences.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = resolve(bedrockRoot, "data");
const json = name => readFile(resolve(dataRoot, name), "utf8").then(JSON.parse);
const document = buildP8C4SemanticDifferenceLedger({
	cookingParity: await json("p7-7-cooking-parity.json"),
	gapLedger: await json("p7-7-gap-ledger.json"),
	guidanceLedger: await json("p7-6-guidance-ledger.json")
});
await writeFile(resolve(dataRoot, "p8-c4-semantic-differences.json"), `${JSON.stringify(document, null, "\t")}\n`);
console.log(`P8 C4 semantic differences: ${document.summary.records} decisions, ${document.summary.platformCapabilityBlocked} native cooking capability blocks, and ${document.summary.externalCompatibilityEntries} external compatibility entries.`);
