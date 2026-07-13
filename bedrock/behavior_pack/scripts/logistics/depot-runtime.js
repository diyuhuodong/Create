import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { depotId, DepotNetwork } from "./depot-network.js";

const DEPOT_BLOCK = "createbedrock:depot";
const CHUTE_BLOCK = "createbedrock:chute";
const FUNNEL_BLOCK = "createbedrock:andesite_funnel";
const DEPOT_TASK_BUDGET = 8;
const DEPOT_TASK_GROUP = "depot-logistics";
const NEIGHBOR_OFFSETS = [
	{ x: 1, y: 0, z: 0 },
	{ x: -1, y: 0, z: 0 },
	{ x: 0, y: 1, z: 0 },
	{ x: 0, y: -1, z: 0 },
	{ x: 0, y: 0, z: 1 },
	{ x: 0, y: 0, z: -1 }
];
const FACING_OFFSETS = {
	0: { x: 0, y: -1, z: 0 },
	1: { x: 0, y: 1, z: 0 },
	2: { x: 0, y: 0, z: -1 },
	3: { x: 0, y: 0, z: 1 },
	4: { x: -1, y: 0, z: 0 },
	5: { x: 1, y: 0, z: 0 },
	down: { x: 0, y: -1, z: 0 },
	east: { x: 1, y: 0, z: 0 },
	north: { x: 0, y: 0, z: -1 },
	south: { x: 0, y: 0, z: 1 },
	up: { x: 0, y: 1, z: 0 },
	west: { x: -1, y: 0, z: 0 }
};
const network = new DepotNetwork({
	onError(error) {
		console.warn(`[Create Bedrock] Depot logistics error: ${error}`);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function identifierFor(block) {
	return depotId(block.dimension.id, block.location);
}

function deviceId(kind, block) {
	return `${kind}:${block.dimension.id}:${block.location.x}:${block.location.y}:${block.location.z}`;
}

function offsetLocation(location, offset) {
	return {
		x: location.x + offset.x,
		y: location.y + offset.y,
		z: location.z + offset.z
	};
}

function opposite(offset) {
	return { x: -offset.x, y: -offset.y, z: -offset.z };
}

function depotAt(dimension, location) {
	const block = dimension.getBlock(location);
	return block?.typeId === DEPOT_BLOCK ? block : undefined;
}

function configureChute(block) {
	const source = depotAt(block.dimension, offsetLocation(block.location, { x: 0, y: 1, z: 0 }));
	const destination = depotAt(block.dimension, offsetLocation(block.location, { x: 0, y: -1, z: 0 }));
	if (!source || !destination)
		return false;
	network.createChute({
		destinationId: identifierFor(destination),
		id: deviceId("chute", block),
		sourceId: identifierFor(source)
	});
	return true;
}

function configureFunnel(block) {
	const facing = block.permutation.getAllStates()["minecraft:facing_direction"];
	const direction = FACING_OFFSETS[facing];
	if (!direction)
		return false;
	const source = depotAt(block.dimension, offsetLocation(block.location, opposite(direction)));
	const destination = depotAt(block.dimension, offsetLocation(block.location, direction));
	if (!source || !destination)
		return false;
	network.createFunnel({
		destinationId: identifierFor(destination),
		id: deviceId("funnel", block),
		sourceId: identifierFor(source)
	});
	return true;
}

function configureAdjacentDevices(depot) {
	for (const offset of NEIGHBOR_OFFSETS) {
		const block = depot.dimension.getBlock(offsetLocation(depot.location, offset));
		if (block?.typeId === FUNNEL_BLOCK)
			configureFunnel(block);
		if (block?.typeId === CHUTE_BLOCK)
			configureChute(block);
	}
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

export function createDepotChute(options) {
	return network.createChute(options);
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
		if (event.block.typeId === DEPOT_BLOCK) {
			network.createDepot({
				dimensionId: event.block.dimension.id,
				location: event.block.location
			});
			configureAdjacentDevices(event.block);
		}
		if (event.block.typeId === FUNNEL_BLOCK)
			configureFunnel(event.block);
		if (event.block.typeId === CHUTE_BLOCK)
			configureChute(event.block);
	});

	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (event.block.typeId === DEPOT_BLOCK && !network.canRemoveDepot(identifierFor(event.block))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a depot while it stores items or has an active transfer.");
		}
		if (event.block.typeId === FUNNEL_BLOCK && !network.canRemoveFunnel(deviceId("funnel", event.block))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a funnel with an active transfer.");
		}
		if (event.block.typeId === CHUTE_BLOCK && !network.canRemoveChute(deviceId("chute", event.block))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a chute with an active transfer.");
		}
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			network.removeDepot(depotId(event.dimension.id, event.block.location));
			network.removeFunnel(`funnel:${event.dimension.id}:${event.block.location.x}:${event.block.location.y}:${event.block.location.z}`);
			network.removeChute(`chute:${event.dimension.id}:${event.block.location.x}:${event.block.location.y}:${event.block.location.z}`);
		} catch (error) {
			console.warn(`[Create Bedrock] Logistics endpoint removal deferred: ${error}`);
		}
	});

	registerTickHandler(() => network.tick(), DEPOT_TASK_GROUP);
	system.run(() => {
		try {
			const restored = network.restore();
			if (restored.depots > 0 || restored.transfers > 0 || restored.funnels > 0 || restored.chutes > 0)
				console.warn(`[Create Bedrock] Restored ${restored.depots} depots, ${restored.funnels} funnels, ${restored.chutes} chutes, and ${restored.transfers} item transfers`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore depot state: ${error}`);
		}
	});
}
