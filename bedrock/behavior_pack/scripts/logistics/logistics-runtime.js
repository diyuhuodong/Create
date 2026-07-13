import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { DurableItemTransferRuntime } from "./durable-item-transfer-runtime.js";

const LOGISTICS_TASK_BUDGET = 8;
const LOGISTICS_TASK_GROUP = "logistics";
const ports = new Map();
const transfers = new DurableItemTransferRuntime({
	keyPrefix: "createbedrock:item_transfer_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Item-transfer persistence error: ${error}`);
	},
	resolvePort(id) {
		return ports.get(id);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function validatePort(port) {
	if (!port || typeof port.id !== "string" || typeof port.reserve !== "function" || typeof port.extract !== "function" || typeof port.insert !== "function")
		throw new TypeError("Logistics ports require id, reserve, extract, and insert operations");
}

export function beginItemTransfer(options) {
	return transfers.begin(options);
}

export function getLogisticsDiagnostics() {
	return {
		ports: ports.size,
		transfers: transfers.diagnostics()
	};
}

export function registerItemPort(port) {
	validatePort(port);
	if (ports.has(port.id))
		throw new Error(`Item port ${port.id} is already registered`);
	ports.set(port.id, port);
	return () => ports.delete(port.id);
}

export function registerLogistics() {
	registerKernelTaskGroup(LOGISTICS_TASK_GROUP, LOGISTICS_TASK_BUDGET);
	registerTickHandler(() => transfers.tick(), LOGISTICS_TASK_GROUP);
	system.run(() => {
		try {
			const restored = transfers.restore();
			if (restored.records > 0)
				console.warn(`[Create Bedrock] Restored ${restored.records} item-transfer records`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore item-transfer state: ${error}`);
		}
	});
}
