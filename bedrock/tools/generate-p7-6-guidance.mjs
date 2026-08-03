import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP76GuidanceTutorials, renderP76GuidanceCatalog, renderP76GuidanceLanguage } from "./p7-6-guidance.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(await readFile(resolve(bedrockRoot, "data/p7-6-guidance-ledger.json"), "utf8"));
const tutorials = buildP76GuidanceTutorials(ledger);
const source = renderP76GuidanceCatalog(tutorials);
const output = resolve(bedrockRoot, "behavior_pack/scripts/guidance/guidance-catalog.js");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, source);
for (const locale of ["en_US", "zh_CN"]) {
	const languagePath = resolve(bedrockRoot, `resource_pack/texts/${locale}.lang`);
	const existing = await readFile(languagePath, "utf8");
	const withoutGenerated = existing.replace(/\n?#{1,2} P7\.6_GENERATED_GUIDANCE_START[\s\S]*?#{1,2} P7\.6_GENERATED_GUIDANCE_END\n?/g, "\n").trimEnd();
	await writeFile(languagePath, `${withoutGenerated}\n${renderP76GuidanceLanguage(tutorials, locale)}`);
}
console.log(`Generated ${tutorials.length} guide families with ${tutorials.reduce((total, tutorial) => total + tutorial.pages.length, 0)} pages.`);
