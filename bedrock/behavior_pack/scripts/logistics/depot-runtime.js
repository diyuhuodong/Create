import { ItemStack, system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { getKineticSpeedAt, getKineticWorldForTesting } from "../kinetics/kinetic-runtime.js";
import { decodeBedrockContainerStack } from "./bedrock-container-item-port.js";
import { BedrockEscrowRegistry } from "./bedrock-escrow-registry.js";
import { depotId, DepotNetwork } from "./depot-network.js";
import { registerEscrowProtection } from "./external-escrow-runtime.js";

const DEPOT_BLOCK = "createbedrock:depot";
const CHUTE_BLOCK = "createbedrock:chute";
const CHAIN_CONVEYOR_BLOCK = "createbedrock:chain_conveyor";
const BELT_CONNECTOR = "createbedrock:belt_connector";
const MAX_DEPOT_BELT_LENGTH = 20;
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
const KINETIC_NEIGHBOR_OFFSETS = [
	{ x: 1, y: 0, z: 0 },
	{ x: -1, y: 0, z: 0 },
	{ x: 0, y: 1, z: 0 },
	{ x: 0, y: -1, z: 0 },
	{ x: 0, y: 0, z: 1 },
	{ x: 0, y: 0, z: -1 }
];
const network = new DepotNetwork({
	onError(error) {
		console.warn(`[Create Bedrock] Depot logistics error: ${error}`);
	},
	storage: createWorldDynamicPropertyStorage(world)
});
const escrows = new BedrockEscrowRegistry();
const pendingDepotBeltEndpoints = new Map();
const chainConveyorLocations = new Map();
let nextPlayerTransaction = 0;
let chainConveyorRescanTicks = 0;

registerEscrowProtection(() => network.activeEscrowIds());

function identifierFor(block) {
	return depotId(block.dimension.id, block.location);
}

function deviceId(kind, block) {
	return `${kind}:${block.dimension.id}:${block.location.x}:${block.location.y}:${block.location.z}`;
}

function depotBeltId(left, right) {
	return `depot-belt:${[identifierFor(left), identifierFor(right)].sort().join("|")}`;
}

function depotBeltPath(left, right) {
	if (left.dimension.id !== right.dimension.id || left.location.y !== right.location.y)
		return undefined;
	const dx = right.location.x - left.location.x;
	const dz = right.location.z - left.location.z;
	if ((dx === 0 && dz === 0) || (dx !== 0 && dz !== 0))
		return undefined;
	const length = Math.abs(dx) + Math.abs(dz);
	return length <= MAX_DEPOT_BELT_LENGTH ? length : undefined;
}

function kineticSpeedForDepot(dimensionId, location) {
	let selected = 0;
	for (const offset of KINETIC_NEIGHBOR_OFFSETS) {
		const speed = getKineticSpeedAt(dimensionId, offsetLocation(location, offset));
		if (Math.abs(speed) > Math.abs(selected))
			selected = speed;
	}
	return selected;
}

function refreshDepotBeltSpeeds() {
	let changed = false;
	for (const belt of network.worldBelts()) {
		const conveyor = chainConveyorLocations.get(belt.id);
		const speed = conveyor
			? getKineticSpeedAt(conveyor.dimensionId, conveyor.location)
			: kineticSpeedForDepot(belt.source.dimensionId, belt.source.location);
		if (network.setBeltSpeed(belt.id, speed))
			changed = true;
	}
	return changed;
}

function chainConveyorId(block) {
	return `chain-conveyor:${block.dimension.id}:${block.location.x}:${block.location.y}:${block.location.z}`;
}

function chainDirection(block) {
	const facing = block.permutation.getAllStates()["minecraft:facing_direction"];
	const direction = FACING_OFFSETS[facing];
	return direction?.y === 0 ? direction : { x: 1, y: 0, z: 0 };
}

function configureChainConveyor(block) {
	if (block?.typeId !== CHAIN_CONVEYOR_BLOCK)
		return false;
	const direction = chainDirection(block);
	const source = depotAt(block.dimension, offsetLocation(block.location, { x: -direction.x, y: 0, z: -direction.z }));
	const destination = depotAt(block.dimension, offsetLocation(block.location, direction));
	if (!source || !destination)
		return false;
	const id = chainConveyorId(block);
	chainConveyorLocations.set(id, { dimensionId: block.dimension.id, location: { ...block.location } });
	if (network.hasBelt(id))
		return false;
	network.createBelt({
		destinationId: identifierFor(destination),
		id,
		length: 2,
		sourceId: identifierFor(source),
		speed: getKineticSpeedAt(block.dimension.id, block.location)
	});
	return true;
}

function rescanChainConveyors() {
	let changed = false;
	for (const node of getKineticWorldForTesting().getNodesByType(CHAIN_CONVEYOR_BLOCK)) {
		try {
			const block = world.getDimension(node.dimensionId).getBlock(node.location);
			changed = configureChainConveyor(block) || changed;
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore chain conveyor: ${error}`);
		}
	}
	return changed;
}

function toggleDepotBelt(player, first, second) {
	const length = depotBeltPath(first, second);
	if (!length) {
		player.sendMessage(`Depot belts must be horizontal, straight, and no longer than ${MAX_DEPOT_BELT_LENGTH} blocks.`);
		return false;
	}
	const id = depotBeltId(first, second);
	try {
		if (network.hasBelt(id)) {
			network.removeBelt(id);
			player.sendMessage("Depot belt removed.");
			return true;
		}
		network.createBelt({
			destinationId: identifierFor(second),
			id,
			length,
			sourceId: identifierFor(first),
			speed: kineticSpeedForDepot(first.dimension.id, first.location)
		});
		player.sendMessage("Depot belt created. Power the source depot from an adjacent shaft.");
		return true;
	} catch (error) {
		player.sendMessage(`Depot belt could not be changed: ${error}`);
		return false;
	}
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
		if (block?.typeId === CHAIN_CONVEYOR_BLOCK)
			configureChainConveyor(block);
	}
}

function playerTransactionId(kind, block, player) {
	nextPlayerTransaction++;
	return `depot-${kind}:${block.dimension.id}:${block.location.x}:${block.location.y}:${block.location.z}:${player.id}:${world.getAbsoluteTime()}:${nextPlayerTransaction}`;
}

function resolvePlayerInventorySlot(endpoint) {
	const player = world.getAllPlayers().find(candidate => candidate.id === endpoint.id || candidate.name === endpoint.name);
	const container = player?.getComponent("minecraft:inventory")?.container;
	if (!container || endpoint.slot >= container.size)
		return undefined;
	return { container, slot: endpoint.slot };
}

function beginPlayerDeposit(player, block) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size)
		return false;
	const physical = inventory.getItem(slot);
	if (!physical)
		return false;
	let item;
	try {
		item = decodeBedrockContainerStack(physical);
	} catch (error) {
		player.sendMessage(`This item cannot be stored in a depot yet: ${error}`);
		return false;
	}
	const destinationId = identifierFor(block);
	const id = playerTransactionId("deposit", block, player);
	let escrow;
	try {
		escrow = escrows.create({ id, source: { dimension: block.dimension, location: block.location } });
		const result = network.beginExternalDeposit({
			depotId: destinationId,
			escrowId: escrow.id,
			id,
			item,
			source: { id: player.id, name: player.name, slot }
		});
		if (!result.ok) {
			escrows.destroy(escrow.id);
			if (result.reason === "destination_full")
				player.sendMessage("The depot cannot accept this full stack.");
			return false;
		}
		return true;
	} catch (error) {
		try {
			if (escrow)
				escrows.destroy(escrow.id);
		} catch {
			// Empty escrow entities are safe for the shared orphan sweeper to remove.
		}
		console.warn(`[Create Bedrock] Could not begin depot deposit: ${error}`);
		return false;
	}
}

function beginPlayerWithdrawal(player, block) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size || inventory.getItem(slot) !== undefined)
		return false;
	const sourceId = identifierFor(block);
	const candidate = network.previewExtraction(sourceId);
	if (!candidate) {
		player.sendMessage("The depot is empty or is finishing another transfer.");
		return false;
	}
	if (candidate.metadata !== undefined) {
		player.sendMessage("This depot item has data that cannot be recreated in a player inventory yet.");
		return false;
	}
	let maxCount;
	try {
		const prototype = new ItemStack(candidate.typeId, 1);
		if (!prototype.isStackable || !Number.isInteger(prototype.maxAmount) || prototype.maxAmount < 1)
			throw new Error("item has no valid Bedrock stack limit");
		maxCount = Math.min(candidate.count, prototype.maxAmount);
	} catch (error) {
		player.sendMessage(`This depot item cannot be recreated in a player inventory yet: ${error}`);
		return false;
	}
	const id = playerTransactionId("withdraw", block, player);
	let escrow;
	try {
		escrow = escrows.create({ id, source: { dimension: block.dimension, location: block.location } });
		const result = network.beginExternalWithdrawal({
			depotId: sourceId,
			escrowId: escrow.id,
			id,
			maxCount,
			target: { id: player.id, name: player.name, slot }
		});
		if (!result.ok) {
			escrows.destroy(escrow.id);
			if (result.reason === "depot_busy")
				player.sendMessage("The depot is finishing another transfer.");
			return false;
		}
		return true;
	} catch (error) {
		try {
			if (escrow)
				escrows.destroy(escrow.id);
		} catch {
			// Empty escrow entities are safe for the shared orphan sweeper to remove.
		}
		console.warn(`[Create Bedrock] Could not begin depot withdrawal: ${error}`);
		return false;
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

export function setDepotFunnelRedstonePowered(dimensionId, location, powered) {
	if (typeof dimensionId !== "string" || !location || typeof powered !== "boolean")
		throw new TypeError("Redstone funnel updates require a dimension, location, and power state");
	const id = `funnel:${dimensionId}:${location.x}:${location.y}:${location.z}`;
	try {
		return network.setFunnelLocked(id, powered);
	} catch (error) {
		if (String(error).includes("Unknown funnel"))
			return false;
		throw error;
	}
}

export function getDepotFunnelRedstoneControls() {
	return network.snapshot()
		.filter(record => record.kind === "funnel")
		.map(record => {
			const parts = record.id.slice("funnel:".length).split(":");
			if (parts.length < 4)
				return undefined;
			const coordinates = parts.slice(-3).map(Number);
			const dimensionId = parts.slice(0, -3).join(":");
			if (!dimensionId || coordinates.some(value => !Number.isInteger(value)))
				return undefined;
			return { dimensionId, location: { x: coordinates[0], y: coordinates[1], z: coordinates[2] } };
		})
		.filter(Boolean);
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
		if (event.block.typeId === CHAIN_CONVEYOR_BLOCK)
			configureChainConveyor(event.block);
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
		if (event.block.typeId === CHAIN_CONVEYOR_BLOCK && !network.canRemoveBelt(chainConveyorId(event.block))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a chain conveyor with an active transport.");
		}
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			network.removeDepot(depotId(event.dimension.id, event.block.location));
			network.removeFunnel(`funnel:${event.dimension.id}:${event.block.location.x}:${event.block.location.y}:${event.block.location.z}`);
			network.removeChute(`chute:${event.dimension.id}:${event.block.location.x}:${event.block.location.y}:${event.block.location.z}`);
			const chainId = `chain-conveyor:${event.dimension.id}:${event.block.location.x}:${event.block.location.y}:${event.block.location.z}`;
			chainConveyorLocations.delete(chainId);
			if (network.hasBelt(chainId))
				network.removeBelt(chainId);
		} catch (error) {
			console.warn(`[Create Bedrock] Logistics endpoint removal deferred: ${error}`);
		}
	});

	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId !== DEPOT_BLOCK)
			return;
		if (event.itemStack?.typeId === BELT_CONNECTOR) {
			const playerId = event.player.id;
			const pending = pendingDepotBeltEndpoints.get(playerId);
			if (!pending) {
				pendingDepotBeltEndpoints.set(playerId, {
					dimensionId: event.block.dimension.id,
					location: { ...event.block.location }
				});
				event.player.sendMessage("Depot belt source selected. Select a second depot.");
				return;
			}
			pendingDepotBeltEndpoints.delete(playerId);
			if (pending.dimensionId !== event.block.dimension.id) {
				event.player.sendMessage("Depot belts cannot cross dimensions.");
				return;
			}
			const first = world.getDimension(pending.dimensionId).getBlock(pending.location);
			if (first?.typeId !== DEPOT_BLOCK) {
				event.player.sendMessage("The selected depot no longer exists.");
				return;
			}
			toggleDepotBelt(event.player, first, event.block);
			return;
		}
		const player = event.player;
		const dimensionId = event.block.dimension.id;
		const location = { ...event.block.location };
		system.run(() => {
			const block = world.getDimension(dimensionId).getBlock(location);
			if (block?.typeId !== DEPOT_BLOCK)
				return;
			const inventory = player.getComponent("minecraft:inventory")?.container;
			const slot = player.selectedSlotIndex;
			if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size)
				return;
			if (inventory.getItem(slot) === undefined)
				beginPlayerWithdrawal(player, block);
			else
				beginPlayerDeposit(player, block);
		});
	});

	registerTickHandler(() => {
		chainConveyorRescanTicks++;
		const rescanned = chainConveyorRescanTicks >= 20 && (chainConveyorRescanTicks = 0, rescanChainConveyors());
		return rescanned || refreshDepotBeltSpeeds() || network.tick() || network.tickExternalDeposits({
		decodeStack: decodeBedrockContainerStack,
		resolveEscrow(record) {
			return escrows.resolve(record.escrowId, record.id);
		},
		resolveSource: resolvePlayerInventorySlot
	}) || network.tickExternalWithdrawals({
		createStack(item) {
			return new ItemStack(item.typeId, item.count);
		},
		decodeStack: decodeBedrockContainerStack,
		resolveEscrow(record) {
			return escrows.resolve(record.escrowId, record.id);
		},
		resolveTarget: resolvePlayerInventorySlot
	});
	}, DEPOT_TASK_GROUP);
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
