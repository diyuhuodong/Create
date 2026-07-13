import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { createBedrockContainerEscrowEndpoint, decodeBedrockContainerStack } from "./bedrock-container-item-port.js";
import { BedrockEscrowRegistry } from "./bedrock-escrow-registry.js";
import { ExternalEscrowTransferRuntime } from "./external-escrow-transfer.js";

const EXTERNAL_ESCROW_TASK_BUDGET = 4;
const EXTERNAL_ESCROW_TASK_GROUP = "external-escrow-logistics";
const endpoints = new Map();
const escrows = new BedrockEscrowRegistry();
const transfers = new ExternalEscrowTransferRuntime({
	createEscrow(options) {
		return escrows.create(options);
	},
	decodeStack: decodeBedrockContainerStack,
	destroyEscrow(id) {
		escrows.destroy(id);
	},
	keyPrefix: "createbedrock:external_escrow_transfer_v1",
	onError(error) {
		console.warn(`[Create Bedrock] External escrow error: ${error}`);
	},
	resolveEscrow(id, transactionId) {
		return escrows.resolve(id, transactionId);
	},
	resolvePort(id) {
		return endpoints.get(id);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function validateEndpoint(endpoint) {
	const normalized = createBedrockContainerEscrowEndpoint(endpoint);
	if (typeof normalized.id !== "string" || normalized.id.length === 0)
		throw new TypeError("External escrow endpoints require identifiers");
	if (!Number.isInteger(normalized.container?.size) || normalized.slot >= normalized.container.size || typeof normalized.container.getItem !== "function" || typeof normalized.container.moveItem !== "function")
		throw new TypeError("External escrow endpoints require movable Bedrock containers");
	return normalized;
}

export function beginExternalEscrowTransfer(options) {
	return transfers.begin(options);
}

export function getExternalEscrowDiagnostics() {
	return { endpoints: endpoints.size, transfers: transfers.diagnostics() };
}

export function registerExternalContainerEndpoint(endpoint) {
	const normalized = validateEndpoint(endpoint);
	if (endpoints.has(normalized.id))
		throw new Error(`External escrow endpoint ${normalized.id} is already registered`);
	endpoints.set(normalized.id, normalized);
	return () => endpoints.delete(normalized.id);
}

export function registerExternalEscrowTransfers() {
	registerKernelTaskGroup(EXTERNAL_ESCROW_TASK_GROUP, EXTERNAL_ESCROW_TASK_BUDGET);
	registerTickHandler(() => transfers.tick(), EXTERNAL_ESCROW_TASK_GROUP);
	system.run(() => {
		try {
			const restored = transfers.restore();
			if (restored.records > 0)
				console.warn(`[Create Bedrock] Restored ${restored.records} external escrow transfers`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore external escrow transfers: ${error}`);
		}
	});
}
