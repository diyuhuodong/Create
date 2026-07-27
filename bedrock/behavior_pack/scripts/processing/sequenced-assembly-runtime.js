import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { getDepotNetwork } from "../logistics/depot-runtime.js";

import { SequencedAssemblyBeltCarrier } from "./sequenced-assembly-belt-carrier.js";
import { SEQUENCED_ASSEMBLY_RECIPES } from "./generated/sequenced-assembly-recipes.js";
import { SequencedAssemblyWorldAdapter } from "./sequenced-assembly-world-adapter.js";
import { matchesSequencedAssemblyTag } from "./sequenced-assembly-tags.js";

const SEQUENCED_ASSEMBLY_TASK_GROUP = "sequenced_assembly";
const SEQUENCED_ASSEMBLY_TASK_BUDGET = 2;
const adapter = new SequencedAssemblyWorldAdapter(SEQUENCED_ASSEMBLY_RECIPES, { matchesTag: matchesSequencedAssemblyTag });
const beltCarrier = new SequencedAssemblyBeltCarrier({
	matchesTag: matchesSequencedAssemblyTag,
	network: getDepotNetwork(),
	recipes: SEQUENCED_ASSEMBLY_RECIPES
});
let registered = false;
let restoreWarnings = 0;

function partitionForCarrier(carrierId) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < carrierId.length; index++) {
		hash ^= carrierId.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `carrier-${(hash >>> 0) % 32}`;
}

const state = new ShardedStateStore({
	keyPrefix: "createbedrock:sequenced_assembly_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Sequenced-assembly state error: ${error}`);
	},
	partitionFor(record) {
		if (typeof record?.carrierId !== "string" || record.carrierId.length === 0)
			throw new TypeError("Sequenced-assembly persistent records require carrier identity");
		return partitionForCarrier(record.carrierId);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persist() {
	state.request(adapter.snapshot());
}

function restore() {
	try {
		const restored = state.read();
		if (!restored)
			return;
		adapter.restore(restored.records);
		restoreWarnings += restored.warnings.length;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored invalid sequenced-assembly shard ${warning.partition}: ${warning.error}`);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore sequenced-assembly carriers: ${error}`);
	}
}

export function beginSequencedCarrier(options) {
	const result = adapter.begin(options);
	if (result.accepted)
		persist();
	return result;
}

export function applySequencedCarrier(options) {
	const result = adapter.apply(options);
	if (result.applied)
		persist();
	return result;
}

export function collectSequencedCarrier(options) {
	const result = adapter.collect(options);
	if (result.collected)
		persist();
	return result;
}

/** Begin a sequence from the durable physical Belt escrow record. */
export function beginSequencedBeltCarrier(options) {
	return beltCarrier.begin(options);
}

/** Apply one station action to a Belt-bound sequence. */
export function applySequencedBeltCarrier(options) {
	return beltCarrier.apply(options);
}

/** Release a completed Belt-bound sequence for normal Belt delivery. */
export function releaseSequencedBeltCarrier(options) {
	return beltCarrier.release(options);
}

export function getSequencedAssemblyDiagnostics() {
	return {
		activeCarriers: adapter.snapshot().length,
		activeBeltCarriers: getDepotNetwork().beltTransports()
			.filter(transport => transport.sequencedAssembly)
			.length,
		restoreWarnings,
		state: state.diagnostics()
	};
}

export function registerSequencedAssembly() {
	if (registered)
		return false;
	registered = true;
	registerKernelTaskGroup(SEQUENCED_ASSEMBLY_TASK_GROUP, SEQUENCED_ASSEMBLY_TASK_BUDGET);
	registerTickHandler(() => state.tick(), SEQUENCED_ASSEMBLY_TASK_GROUP);
	system.run(restore);
	return true;
}
