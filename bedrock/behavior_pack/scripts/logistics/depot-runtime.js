import { ItemStack, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { getKineticSpeedAt, getKineticWorldForTesting } from "../kinetics/kinetic-runtime.js";
import { decodeBedrockContainerStack } from "./bedrock-container-item-port.js";
import { BedrockEscrowRegistry } from "./bedrock-escrow-registry.js";
import { depotId, DepotNetwork } from "./depot-network.js";
import { registerEscrowProtection } from "./external-escrow-runtime.js";
import { beltSegmentForNeighbors } from "./belt-visuals.js";
import { capturePhysicalBeltAssemblyAttachments } from "../contraptions/physical-belt-assembly.js";

const DEPOT_BLOCK = "createbedrock:depot";
const CHUTE_BLOCK = "createbedrock:chute";
const CHAIN_CONVEYOR_BLOCK = "createbedrock:chain_conveyor";
export const PHYSICAL_BELT_BLOCK = "createbedrock:belt";
const BELT_BLOCK = PHYSICAL_BELT_BLOCK;
const BELT_CONNECTOR = "createbedrock:belt_connector";
const MAX_DEPOT_BELT_LENGTH = 20;
const FUNNEL_BLOCK = "createbedrock:andesite_funnel";
const SMART_CHUTE_BLOCK = "createbedrock:smart_chute";
const FILTER_ITEM = "createbedrock:filter";
const ATTRIBUTE_FILTER_ITEM = "createbedrock:attribute_filter";
const PORT_BLOCKS = new Map([
	[DEPOT_BLOCK, { size: 1 }],
	["createbedrock:item_hatch", { size: 9 }],
	["createbedrock:item_vault", { size: 27 }],
	["createbedrock:creative_crate", { kind: "creative", size: 1 }]
]);
export const DEPOT_PORT_MOVEMENT_DEFINITIONS = Object.freeze([...PORT_BLOCKS.entries()].map(([typeId, settings]) => Object.freeze({
	kind: settings.kind ?? "depot",
	size: settings.size,
	typeId
})));
const FUNNEL_BLOCKS = new Set([
	FUNNEL_BLOCK,
	"createbedrock:brass_funnel",
	"createbedrock:andesite_belt_funnel",
	"createbedrock:brass_belt_funnel",
	"createbedrock:andesite_tunnel",
	"createbedrock:brass_tunnel",
	"createbedrock:weighted_ejector"
]);
const CHUTE_BLOCKS = new Set([CHUTE_BLOCK, SMART_CHUTE_BLOCK]);
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
const physicalBeltLocations = new Map();
// Non-depot machines own their own ItemPort snapshots. This index only maps a
// world-facing endpoint to the durable DepotNetwork identity that physical
// belts use while the owner is loaded.
const managedLogisticsPorts = new Map();
let nextPlayerTransaction = 0;
let chainConveyorRescanTicks = 0;
let physicalBeltRescanTicks = 0;

registerEscrowProtection(() => network.activeEscrowIds());

function identifierFor(block) {
	return depotId(block.dimension.id, block.location);
}

function showDepotLogisticsConfiguration(player, block) {
	const id = identifierFor(block);
	let endpoint;
	try {
		endpoint = network.logisticsEndpoint(id);
	} catch (error) {
		player.sendMessage?.(`Could not read this logistics endpoint: ${error}`);
		return false;
	}
	const form = new ModalFormData()
		.title("Depot Logistics Settings")
		.label(`Public endpoint settings • revision ${endpoint.revision}`)
		.textField("Logistics network", "default", { defaultValue: endpoint.networkId })
		.textField("Address (blank for all)", "Optional endpoint address", { defaultValue: endpoint.address })
		.toggle("Accept Redstone Requests", { defaultValue: endpoint.acceptsRequests })
		.submitButton("Save endpoint");
	form.show(player).then(response => {
		if (response.canceled)
			return false;
		const [networkId, address, acceptsRequests] = response.formValues ?? [];
		const result = network.configureLogisticsEndpoint(id, {
			expectedRevision: endpoint.revision,
			patch: { acceptsRequests, address, networkId }
		});
		if (result.conflict) {
			player.sendMessage?.("This endpoint changed while the form was open. Reopen it and try again.");
			return false;
		}
		if (result.changed)
			player.sendMessage?.(`Depot endpoint saved: ${result.endpoint.networkId} / ${result.endpoint.address || "all"}.`);
		return result.changed;
	}).catch(error => player.sendMessage?.(`Could not save this logistics endpoint: ${error}`));
	return true;
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

function kineticSpeedForLocations(dimensionId, locations) {
	let selected = 0;
	for (const location of locations) {
		const direct = getKineticSpeedAt(dimensionId, location);
		if (Math.abs(direct) > Math.abs(selected))
			selected = direct;
		for (const offset of KINETIC_NEIGHBOR_OFFSETS) {
			const nearby = getKineticSpeedAt(dimensionId, offsetLocation(location, offset));
			if (Math.abs(nearby) > Math.abs(selected))
				selected = nearby;
		}
	}
	return selected;
}

function refreshDepotBeltSpeeds() {
	let changed = false;
	for (const belt of network.worldBelts()) {
		const conveyor = chainConveyorLocations.get(belt.id);
		const physicalBelt = physicalBeltLocations.get(belt.id);
		const speed = conveyor
			? getKineticSpeedAt(conveyor.dimensionId, conveyor.location)
			: physicalBelt
				? kineticSpeedForLocations(physicalBelt.dimensionId, physicalBelt.locations)
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

function portAt(dimension, location) {
	const block = dimension.getBlock(location);
	return PORT_BLOCKS.has(block?.typeId) ? block : undefined;
}

function managedPortLocationKey(dimensionId, location, role) {
	if (typeof dimensionId !== "string" || !location || !["input", "output"].includes(role))
		throw new TypeError("Managed logistics port keys require a dimension, location, and input/output role");
	return `${dimensionId}:${location.x}:${location.y}:${location.z}:${role}`;
}

function managedPortIdAt(dimensionId, location, role) {
	return managedLogisticsPorts.get(managedPortLocationKey(dimensionId, location, role));
}

function beltEndpointAt(dimension, location, role) {
	const depot = portAt(dimension, location);
	if (depot)
		return { id: identifierFor(depot), location: { ...depot.location } };
	const id = managedPortIdAt(dimension.id, location, role);
	return id ? { id, location: { ...location } } : undefined;
}

function depotAt(dimension, location) {
	return portAt(dimension, location);
}

function createPort(block) {
	const settings = PORT_BLOCKS.get(block?.typeId);
	if (!settings)
		return false;
	network.createDepot({
		dimensionId: block.dimension.id,
		kind: settings.kind,
		location: block.location,
		size: settings.size
	});
	return true;
}

function configureChute(block) {
	if (!CHUTE_BLOCKS.has(block?.typeId))
		return false;
	const source = depotAt(block.dimension, offsetLocation(block.location, { x: 0, y: 1, z: 0 }));
	const destination = depotAt(block.dimension, offsetLocation(block.location, { x: 0, y: -1, z: 0 }));
	if (!source || !destination)
		return false;
	network.createChute({
		destinationId: identifierFor(destination),
		filter: undefined,
		id: deviceId("chute", block),
		sourceId: identifierFor(source)
	});
	return true;
}

function configureFunnel(block) {
	if (!FUNNEL_BLOCKS.has(block?.typeId))
		return false;
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

function physicalBeltId(dimensionId, first, last) {
	return `physical-belt:${dimensionId}:${first.x}:${first.y}:${first.z}:${last.x}:${last.y}:${last.z}`;
}

function sameLocation(left, right) {
	return left.x === right.x && left.y === right.y && left.z === right.z;
}

function setBlockState(block, property, value) {
	const states = block?.permutation?.getAllStates?.();
	if (!states || states[property] === undefined || states[property] === value)
		return false;
	block.setPermutation(block.permutation.withState(property, value));
	return true;
}

function beltSegment(block) {
	if (block?.typeId !== BELT_BLOCK)
		return "single";
	const direction = chainDirection(block);
	if (direction.y !== 0)
		return "single";
	const previous = block.dimension.getBlock(offsetLocation(block.location, opposite(direction)));
	const next = block.dimension.getBlock(offsetLocation(block.location, direction));
	return beltSegmentForNeighbors({
		hasNext: next?.typeId === BELT_BLOCK && sameLocation(chainDirection(next), direction),
		hasPrevious: previous?.typeId === BELT_BLOCK && sameLocation(chainDirection(previous), direction)
	});
}

function syncBeltSegment(block) {
	return block?.typeId === BELT_BLOCK && setBlockState(block, "createbedrock:belt_segment", beltSegment(block));
}

function syncBeltSegmentsAround(dimension, location) {
	let changed = false;
	for (const offset of NEIGHBOR_OFFSETS)
		changed = syncBeltSegment(dimension.getBlock(offsetLocation(location, offset))) || changed;
	return syncBeltSegment(dimension.getBlock(location)) || changed;
}

function beltRunFor(block) {
	if (block?.typeId !== BELT_BLOCK)
		return undefined;
	const direction = chainDirection(block);
	if (direction.y !== 0)
		return undefined;
	let first = { ...block.location };
	let previous = block.dimension.getBlock(offsetLocation(first, opposite(direction)));
	while (previous?.typeId === BELT_BLOCK && sameLocation(chainDirection(previous), direction)) {
		first = { ...previous.location };
		previous = block.dimension.getBlock(offsetLocation(first, opposite(direction)));
	}
	const locations = [{ ...first }];
	let last = first;
	let next = block.dimension.getBlock(offsetLocation(last, direction));
	while (next?.typeId === BELT_BLOCK && sameLocation(chainDirection(next), direction)) {
		last = { ...next.location };
		locations.push(last);
		next = block.dimension.getBlock(offsetLocation(last, direction));
	}
	const source = beltEndpointAt(block.dimension, offsetLocation(first, opposite(direction)), "output");
	const destination = beltEndpointAt(block.dimension, offsetLocation(last, direction), "input");
	if (!source || !destination)
		return undefined;
	return {
		destination,
		id: physicalBeltId(block.dimension.id, first, last),
		locations,
		source
	};
}

function configurePhysicalBelt(block) {
	syncBeltSegment(block);
	const run = beltRunFor(block);
	if (!run)
		return false;
	physicalBeltLocations.set(run.id, {
		dimensionId: block.dimension.id,
		locations: run.locations.map(location => ({ ...location }))
	});
	if (network.hasBelt(run.id))
		return false;
	network.createBelt({
		destinationId: run.destination.id,
		id: run.id,
		length: run.locations.length,
		sourceId: run.source.id,
		speed: kineticSpeedForLocations(block.dimension.id, run.locations)
	});
	return true;
}

function physicalBeltIdsAt(dimensionId, location) {
	return [...physicalBeltLocations.entries()]
		.filter(([, belt]) => belt.dimensionId === dimensionId && belt.locations.some(candidate => sameLocation(candidate, location)))
		.map(([id]) => id);
}

function rescanPhysicalBelts() {
	const discovered = new Set();
	let changed = false;
	for (const node of getKineticWorldForTesting().getNodesByType(BELT_BLOCK)) {
		try {
			const block = world.getDimension(node.dimensionId).getBlock(node.location);
			syncBeltSegment(block);
			const run = beltRunFor(block);
			if (!run)
				continue;
			discovered.add(run.id);
			changed = configurePhysicalBelt(block) || changed;
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore belt: ${error}`);
		}
	}
	for (const id of [...physicalBeltLocations.keys()]) {
		if (discovered.has(id) || !network.canRemoveBelt(id))
			continue;
		physicalBeltLocations.delete(id);
		if (network.hasBelt(id)) {
			network.removeBelt(id);
			changed = true;
		}
	}
	return changed;
}

function configureAdjacentDevices(depot) {
	for (const offset of NEIGHBOR_OFFSETS) {
		const block = depot.dimension.getBlock(offsetLocation(depot.location, offset));
		configureFunnel(block);
		configureChute(block);
		configureChainConveyor(block);
		configurePhysicalBelt(block);
	}
}

function configureLogisticsDevice(block) {
	return configureFunnel(block)
		|| configureChute(block)
		|| configureChainConveyor(block)
		|| configurePhysicalBelt(block);
}

function configureFilter(block, item) {
	if (!item || (!FUNNEL_BLOCKS.has(block.typeId) && !CHUTE_BLOCKS.has(block.typeId)))
		return false;
	const filter = item.typeId === FILTER_ITEM || item.typeId === ATTRIBUTE_FILTER_ITEM
		? { mode: "allow", typeIds: [] }
		: { mode: "allow", typeIds: [item.typeId] };
	try {
		if (FUNNEL_BLOCKS.has(block.typeId))
			network.setFunnelFilter(deviceId("funnel", block), filter);
		else
			network.setChuteFilter(deviceId("chute", block), filter);
		return true;
	} catch (error) {
		console.warn(`[Create Bedrock] Could not configure logistics filter: ${error}`);
		return false;
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

export function setDepotChuteFilter(id, filter) {
	return network.setChuteFilter(id, filter);
}

export function getDepotDiagnostics() {
	return network.diagnostics();
}

/** Shared physical Belt escrow domain for processing adapters. */
export function getDepotNetwork() {
	return network;
}

export function getDepotId(block) {
	return identifierFor(block);
}

export function hasDepotAt(dimensionId, location) {
	if (typeof dimensionId !== "string" || !location)
		throw new TypeError("Depot lookups require a dimension and location");
	const id = depotId(dimensionId, location);
	return network.hasDepot(id);
}

/**
 * Attach a machine-owned, managed ItemPort to the world logistics graph. The
 * caller keeps the port inventory in its own snapshot; DepotNetwork persists
 * only this identity and pauses adjacent routes while it is not attached.
 */
export function registerManagedLogisticsPort({ dimensionId, id, location, logistics, onPortMutation, port, role }) {
	if (typeof dimensionId !== "string" || typeof id !== "string" || id.length === 0 || !location || !["input", "output"].includes(role))
		throw new TypeError("Managed logistics ports require a stable identity, location, and role");
	const key = managedPortLocationKey(dimensionId, location, role);
	const existing = managedLogisticsPorts.get(key);
	if (existing && existing !== id)
		throw new Error(`Managed logistics location ${key} is already owned by ${existing}`);
	const registered = network.registerExternalManagedDepot({ dimensionId, id, location, logistics, onPortMutation, port, role });
	managedLogisticsPorts.set(key, registered);
	// A controller can be placed after its belts. Recheck the four horizontal
	// neighbors now instead of waiting for the periodic global rescan.
	const dimension = world.getDimension(dimensionId);
	for (const offset of [FACING_OFFSETS.east, FACING_OFFSETS.west, FACING_OFFSETS.north, FACING_OFFSETS.south])
		configurePhysicalBelt(dimension.getBlock(offsetLocation(location, offset)));
	return registered;
}

export function releaseManagedLogisticsPort({ dimensionId, id, location, role }) {
	if (typeof dimensionId !== "string" || typeof id !== "string" || !location || !["input", "output"].includes(role))
		throw new TypeError("Managed logistics port release requires an identity, location, and role");
	const released = network.releaseExternalManagedDepot(id);
	if (released && managedLogisticsPorts.get(managedPortLocationKey(dimensionId, location, role)) === id)
		managedLogisticsPorts.delete(managedPortLocationKey(dimensionId, location, role));
	return released;
}

export function canRemoveManagedLogisticsPort(id) {
	if (typeof id !== "string" || id.length === 0)
		throw new TypeError("Managed logistics port removal requires an identifier");
	return network.canRemoveDepot(id);
}

export function removeManagedLogisticsPort({ dimensionId, id, location, role }) {
	if (typeof dimensionId !== "string" || typeof id !== "string" || !location || !["input", "output"].includes(role))
		throw new TypeError("Managed logistics port removal requires an identity, location, and role");
	const removed = network.removeExternalManagedDepot(id);
	if (removed && managedLogisticsPorts.get(managedPortLocationKey(dimensionId, location, role)) === id)
		managedLogisticsPorts.delete(managedPortLocationKey(dimensionId, location, role));
	return removed;
}

/**
 * Moving assemblies need a location-independent payload.  Ensure a just
 * placed port is represented before capturing it, then let DepotNetwork
 * validate that no fixed logistics connection would be left behind.
 */
export function captureDepotMovingData(dimensionId, location, { kind = "depot", size = 1 } = {}) {
	if (typeof dimensionId !== "string" || !location || !Number.isInteger(size) || size < 1)
		throw new TypeError("Moving depot capture requires a dimension, location, and positive port size");
	const id = network.createDepot({ dimensionId, kind, location, size });
	return network.snapshotDepotForAssembly(id);
}

export function detachDepotMovingData(dimensionId, location) {
	if (typeof dimensionId !== "string" || !location)
		throw new TypeError("Moving depot detach requires a dimension and location");
	const id = depotId(dimensionId, location);
	return network.hasDepot(id) ? network.takeDepotForAssembly(id) : undefined;
}

export function restoreDepotMovingData(dimensionId, location, record) {
	if (record === undefined)
		return undefined;
	return network.restoreDepotFromAssembly({ dimensionId, location, record });
}

function physicalBeltRunsForAssembly(dimensionId, locations) {
	const dimension = world.getDimension(dimensionId);
	const runs = new Map();
	for (const location of locations) {
		const run = beltRunFor(dimension.getBlock(location));
		if (!run || runs.has(run.id))
			continue;
		runs.set(run.id, {
			destinationLocation: { ...run.destination.location },
			id: run.id,
			locations: run.locations.map(candidate => ({ ...candidate })),
			movable: !network.hasBelt(run.id) || network.canRemoveBelt(run.id),
			sourceLocation: { ...run.source.location }
		});
	}
	return [...runs.values()];
}

/** Validate and retain only complete, idle physical belt runs for one assembly. */
export function captureInternalPhysicalBeltRuns(dimensionId, locations, anchor) {
	if (typeof dimensionId !== "string")
		throw new TypeError("Physical belt assembly capture requires a dimension");
	return capturePhysicalBeltAssemblyAttachments({
		anchor,
		locations,
		runs: physicalBeltRunsForAssembly(dimensionId, locations)
	});
}

/** Recreate belt routes after every moved port and segment has materialized. */
export function restoreInternalPhysicalBeltRuns(dimensionId, origin, records) {
	if (!Array.isArray(records))
		return 0;
	const dimension = world.getDimension(dimensionId);
	let restored = 0;
	for (const record of records) {
		const first = record?.locations?.[0];
		if (!first || ![first.x, first.y, first.z].every(Number.isInteger))
			continue;
		const block = dimension.getBlock({ x: origin.x + first.x, y: origin.y + first.y, z: origin.z + first.z });
		if (configurePhysicalBelt(block))
			restored++;
	}
	return restored;
}

/** Remove durable route records before their endpoint depots are detached. */
export function detachInternalPhysicalBeltRuns(records) {
	if (!Array.isArray(records))
		return 0;
	let detached = 0;
	for (const record of records) {
		if (typeof record?.name !== "string" || !network.hasBelt(record.name))
			continue;
		if (!network.canRemoveBelt(record.name))
			throw new Error(`Physical belt ${record.name} has an active item transport`);
		physicalBeltLocations.delete(record.name);
		network.removeBelt(record.name);
		detached++;
	}
	return detached;
}

export function capturePhysicalBeltMovingData(dimensionId, location) {
	if (typeof dimensionId !== "string" || !location)
		throw new TypeError("Moving physical belt capture requires a dimension and location");
	return { schemaVersion: 1 };
}

export function detachPhysicalBeltMovingData(dimensionId, location) {
	if (typeof dimensionId !== "string" || !location)
		throw new TypeError("Moving physical belt detach requires a dimension and location");
	const run = beltRunFor(world.getDimension(dimensionId).getBlock(location));
	if (!run || !network.hasBelt(run.id))
		return false;
	if (!network.canRemoveBelt(run.id))
		throw new Error(`Physical belt ${run.id} has an active item transport`);
	physicalBeltLocations.delete(run.id);
	return network.removeBelt(run.id);
}

// Full routes are recreated as one attachment after all blocks and ports are
// restored; restoring an individual segment would race the port re-key step.
export function restorePhysicalBeltMovingData() {}

/** Count one item across the durable, dimension-local depot network. */
export function countDepotItem({ dimensionId, itemType, location }) {
	if (typeof dimensionId !== "string" || typeof itemType !== "string" || !location)
		throw new TypeError("Depot stock queries require a dimension, item identifier, and location");
	const id = depotId(dimensionId, location);
	return network.hasDepot(id) ? network.stockCount(id, itemType) : 0;
}

/** Query the addressed, dimension-local Depot network used by Requesters and Stock Links. */
export function countDepotNetworkItem({ dimensionId, itemType, networkId = "default", targetAddress = "" }) {
	if (typeof dimensionId !== "string" || typeof itemType !== "string")
		throw new TypeError("Network stock queries require a dimension and item identifier");
	return network.networkStockSummary({ dimensionId, itemType, networkId, targetAddress });
}

export function depotLogisticsEndpoint({ dimensionId, location }) {
	if (typeof dimensionId !== "string" || !location)
		throw new TypeError("Logistics endpoint queries require a dimension and location");
	return network.logisticsEndpoint(depotId(dimensionId, location));
}

export function configureDepotLogisticsEndpoint({ dimensionId, expectedRevision, location, patch }) {
	if (typeof dimensionId !== "string" || !location)
		throw new TypeError("Logistics endpoint updates require a dimension and location");
	return network.configureLogisticsEndpoint(depotId(dimensionId, location), { expectedRevision, patch });
}

/**
 * Start one journaled redstone request. The caller supplies a persistent ID;
 * DepotNetwork owns reservation, persistence-before-extraction, and recovery.
 */
export function requestDepotItem({ allowPartial = false, destinationLocation, dimensionId, id, itemType, maxCount, networkId = "default", targetAddress = "" }) {
	if (typeof dimensionId !== "string" || !destinationLocation || typeof id !== "string" || id.length === 0
		|| typeof itemType !== "string" || !Number.isInteger(maxCount) || maxCount < 1)
		throw new TypeError("Redstone depot requests require a valid destination, item, amount, and persistent ID");
	const destinationId = depotId(dimensionId, destinationLocation);
	return network.requestItem({ allowPartial, destinationId, id, itemType, maxCount, networkId, targetAddress });
}

export function depotRequestStatus(id) {
	return network.requestStatus(id);
}

export function setDepotBeltSpeed(id, speed) {
	return network.setBeltSpeed(id, speed);
}

export function setDepotFunnelLocked(id, locked) {
	return network.setFunnelLocked(id, locked);
}

export function setDepotFunnelFilter(id, filter) {
	return network.setFunnelFilter(id, filter);
}

export function setDepotCreativeTemplate(id, template) {
	return network.setCreativeTemplate(id, template);
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
		if (createPort(event.block))
			configureAdjacentDevices(event.block);
		configureLogisticsDevice(event.block);
		if (event.block.typeId === BELT_BLOCK)
			syncBeltSegmentsAround(event.block.dimension, event.block.location);
	});

	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (PORT_BLOCKS.has(event.block.typeId) && !network.canRemoveDepot(identifierFor(event.block))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a logistics port while it stores items or has an active transfer.");
		}
		if (FUNNEL_BLOCKS.has(event.block.typeId) && !network.canRemoveFunnel(deviceId("funnel", event.block))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a funnel with an active transfer.");
		}
		if (CHUTE_BLOCKS.has(event.block.typeId) && !network.canRemoveChute(deviceId("chute", event.block))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a chute with an active transfer.");
		}
		if (event.block.typeId === CHAIN_CONVEYOR_BLOCK && !network.canRemoveBelt(chainConveyorId(event.block))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a chain conveyor with an active transport.");
		}
		if (event.block.typeId === BELT_BLOCK && physicalBeltIdsAt(event.block.dimension.id, event.block.location).some(id => !network.canRemoveBelt(id))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a belt with an active transport.");
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
			for (const id of physicalBeltIdsAt(event.dimension.id, event.block.location)) {
				physicalBeltLocations.delete(id);
				if (network.hasBelt(id))
					network.removeBelt(id);
			}
			syncBeltSegmentsAround(event.dimension, event.block.location);
		} catch (error) {
			console.warn(`[Create Bedrock] Logistics endpoint removal deferred: ${error}`);
		}
	});

	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (PORT_BLOCKS.has(event.block.typeId) && event.itemStack?.typeId === BELT_CONNECTOR) {
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
			if (!PORT_BLOCKS.has(first?.typeId)) {
				event.player.sendMessage("The selected logistics port no longer exists.");
				return;
			}
			toggleDepotBelt(event.player, first, event.block);
			return;
		}
		if (configureFilter(event.block, event.itemStack)) {
			event.player.sendMessage(event.itemStack.typeId === FILTER_ITEM || event.itemStack.typeId === ATTRIBUTE_FILTER_ITEM
				? "Logistics filter cleared. Use an item on the device to allow only that item."
				: `Logistics filter set to ${event.itemStack.typeId}.`);
			return;
		}
		if (!PORT_BLOCKS.has(event.block.typeId))
			return;
		const player = event.player;
		if (!event.itemStack && player.isSneaking) {
			showDepotLogisticsConfiguration(player, event.block);
			return;
		}
		const dimensionId = event.block.dimension.id;
		const location = { ...event.block.location };
		system.run(() => {
			const block = world.getDimension(dimensionId).getBlock(location);
			if (!PORT_BLOCKS.has(block?.typeId))
				return;
			const inventory = player.getComponent("minecraft:inventory")?.container;
			const slot = player.selectedSlotIndex;
			if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size)
				return;
			const item = inventory.getItem(slot);
			if (block.typeId === "createbedrock:creative_crate" && item !== undefined) {
				try {
					network.setCreativeTemplate(identifierFor(block), decodeBedrockContainerStack(item));
					player.sendMessage(`Creative crate template set to ${item.typeId}.`);
				} catch (error) {
					player.sendMessage(`Creative crate template could not be set: ${error}`);
				}
			} else if (item === undefined)
				beginPlayerWithdrawal(player, block);
			else
				beginPlayerDeposit(player, block);
		});
	});

	registerTickHandler(() => {
		chainConveyorRescanTicks++;
		const rescanned = chainConveyorRescanTicks >= 20 && (chainConveyorRescanTicks = 0, rescanChainConveyors());
		physicalBeltRescanTicks++;
		const physicalRescanned = physicalBeltRescanTicks >= 20 && (physicalBeltRescanTicks = 0, rescanPhysicalBelts());
		return rescanned || physicalRescanned || refreshDepotBeltSpeeds() || network.tick() || network.tickExternalDeposits({
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
