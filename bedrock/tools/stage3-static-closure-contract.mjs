import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { validateStage3WorkQueue } from "./stage3-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const EXPECTED_PHASE_THREE_ENTRIES = 245;

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

export async function validateStage3StaticClosure({ bedrockRoot = defaultBedrockRoot } = {}) {
	const [matrix, workQueue] = await Promise.all([
		readJson(resolve(bedrockRoot, "data", "migration-matrix.json")),
		readJson(resolve(bedrockRoot, "data", "stage3-work-queue.json"))
	]);
	validateMigrationMatrix(matrix);
	validateStage3WorkQueue(workQueue, matrix);
	const entries = matrix.entries.filter(entry => entry.phase === 3);
	if (entries.length !== EXPECTED_PHASE_THREE_ENTRIES)
		throw new Error(`Stage-3 static closure requires ${EXPECTED_PHASE_THREE_ENTRIES} entries, found ${entries.length}`);
	const pending = entries.filter(entry => entry.status !== "static_verified");
	if (pending.length > 0)
		throw new Error(`Stage-3 static closure has ${pending.length} non-static entries: ${pending.map(entry => entry.acceptanceId).join(", ")}`);
	const queued = new Map(workQueue.entries.map(entry => [entry.acceptanceId, entry]));
	for (const entry of entries) {
		const queuedEntry = queued.get(entry.acceptanceId);
		if (!queuedEntry || queuedEntry.matrixStatus !== "static_verified" || !queuedEntry.deliveryPackage.startsWith("completed:S3-"))
			throw new Error(`Stage-3 static closure entry ${entry.acceptanceId} lacks completed queue ownership`);
	}
	const domains = Object.fromEntries([...entries.reduce((counts, entry) => {
		counts.set(entry.domain, (counts.get(entry.domain) ?? 0) + 1);
		return counts;
	}, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
	return { domains, entries: entries.length };
}
