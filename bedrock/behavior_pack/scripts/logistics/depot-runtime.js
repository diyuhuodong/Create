import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { depotId, DepotNetwork } from "./depot-network.js";

const DEPOT_BLOCK = "createbedrock:depot";
const DEPOT_TASK_BUDGET = 8;
const DEPOT_TASK_GROUP = "depot-logistics";
const network = new DepotNetwork({
	onError(error) {
		console.warn(`[Create Bedrock] Depot logistics error: ${error}`);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function identifierFor(block) {
	return depotId(block.dimension.id, block.location);
}

export function beginDepotTransfer(options) {
	return network.beginTransfer(options);
}

export function createDepotBelt(options) {
	return network.createBelt(options);
}

export function createDepotFunnel(options) {
	return network.createFunnel(options);
}

export function getDepotDiagnostics() {
	return network.diagnostics();
}

export function getDepotId(block) {
	return identifierFor(block);
}

export function setDepotBeltSpeed(id, speed) {
	return network.setBeltSpeed(id, speed);
}

export function setDepotFunnelLocked(id, locked) {
	return network.setFunnelLocked(id, locked);
}

export function registerDepots() {
	registerKernelTaskGroup(DEPOT_TASK_GROUP, DEPOT_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block.typeId !== DEPOT_BLOCK)
			return;
		network.createDepot({
			dimensionId: event.block.dimension.id,
			location: event.block.location
		});
	});

	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (event.block.typeId !== DEPOT_BLOCK)
			return;
		if (network.canRemoveDepot(identifierFor(event.block)))
			return;
		event.cancel = true;
		event.player.sendMessage("Cannot remove a depot while it stores items or has an active transfer.");
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			network.removeDepot(depotId(event.dimension.id, event.block.location));
		} catch (error) {
			console.warn(`[Create Bedrock] Depot removal deferred: ${error}`);
		}
	});

	registerTickHandler(() => network.tick(), DEPOT_TASK_GROUP);
	system.run(() => {
		try {
			const restored = network.restore();
			if (restored.depots > 0 || restored.transfers > 0)
				console.warn(`[Create Bedrock] Restored ${restored.depots} depots and ${restored.transfers} item transfers`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore depot state: ${error}`);
		}
	});
}
