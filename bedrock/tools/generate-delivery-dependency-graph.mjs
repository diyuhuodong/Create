import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDeliveryDependencyGraph, validateDeliveryDependencyGraph } from "./delivery-dependency-graph.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const graph = buildDeliveryDependencyGraph();
const coverage = validateDeliveryDependencyGraph(graph);

await writeFile(resolve(bedrockRoot, "data", "delivery-dependency-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Wrote ${coverage.packages} delivery packages and ${coverage.edges} forward dependency edges.`);
