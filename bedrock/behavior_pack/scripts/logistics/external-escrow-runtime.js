import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { createBedrockContainerEscrowEndpoint, decodeBedrockContainerStack } from "./bedrock-container-item-port.js";
import { BedrockEscrowRegistry } from "./bedrock-escrow-registry.js";
import { ExternalEscrowTransferRuntime } from "./external-escrow-transfer.js";

const EXTERNAL_ESCROW_TASK_BUDGET = 4;
const EXTERNAL_ESCROW_TASK_GROUP = "external-escrow-logistics";
const EXTERNAL_ESCROW_SWEEP_INTERVAL = 200;
const endpoints = new Map();
const escrows = new BedrockEscrowRegistry();
const escrowProtectionProviders = new Set();
let restored = false;
let sweepTicks = 0;
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
	return { endpoints: endpoints.size, protectionProviders: escrowProtectionProviders.size, transfers: transfers.diagnostics() };
}

export function registerEscrowProtection(provider) {
	if (typeof provider !== "function")
		throw new TypeError("Escrow protection providers must be functions");
	escrowProtectionProviders.add(provider);
	return () => escrowProtectionProviders.delete(provider);
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
	registerTickHandler(() => {
		const transferred = transfers.tick();
		if (!restored || ++sweepTicks < EXTERNAL_ESCROW_SWEEP_INTERVAL)
			return transferred;
		sweepTicks = 0;
		try {
			const activeEscrowIds = transfers.activeEscrowIds();
			for (const provider of escrowProtectionProviders) {
				try {
					const ids = provider();
					if (!(ids instanceof Set))
						throw new TypeError("provider did not return a set of escrow identifiers");
					for (const id of ids)
						activeEscrowIds.add(id);
				} catch (error) {
					console.warn(`[Create Bedrock] Could not read an escrow protection provider: ${error}`);
				}
			}
			const sweep = escrows.sweepEmptyOrphans(activeEscrowIds);
			if (sweep.retained.length > 0)
				console.warn(`[Create Bedrock] Retained ${sweep.retained.length} non-empty or invalid orphan escrow entities for recovery`);
			return transferred || sweep.removed > 0;
		} catch (error) {
			console.warn(`[Create Bedrock] Could not sweep orphan escrow entities: ${error}`);
			return transferred;
		}
	}, EXTERNAL_ESCROW_TASK_GROUP);
	system.run(() => {
		try {
			const recovery = transfers.restore();
			if (recovery.records > 0)
				console.warn(`[Create Bedrock] Restored ${recovery.records} external escrow transfers`);
			// Do not sweep before the journal has been read: an entity whose root
			// record is still loading must not be mistaken for an orphan.
			restored = true;
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore external escrow transfers: ${error}`);
		}
	});
}
