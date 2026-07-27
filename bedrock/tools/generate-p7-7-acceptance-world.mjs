import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP77AcceptanceWorldLayout, renderP77AcceptanceWorldLayout } from "./p7-7-acceptance-world.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = resolve(bedrockRoot, "data");
const catalog = JSON.parse(await readFile(resolve(dataRoot, "p7-7-scenario-catalog.json"), "utf8"));
const layout = buildP77AcceptanceWorldLayout(catalog);

await mkdir(resolve(bedrockRoot, "behavior_pack", "scripts", "acceptance", "generated"), { recursive: true });
await writeFile(resolve(dataRoot, "p7-7-acceptance-world.json"), `${JSON.stringify(layout, null, "\t")}\n`);
await writeFile(resolve(bedrockRoot, "behavior_pack", "scripts", "acceptance", "generated", "acceptance-world-layout.js"), renderP77AcceptanceWorldLayout(layout));
console.log(`P7.7 acceptance world: ${layout.summary.zones} zones, ${layout.summary.scenarios} scenarios, ${layout.summary.checkpoints} checkpoints.`);
