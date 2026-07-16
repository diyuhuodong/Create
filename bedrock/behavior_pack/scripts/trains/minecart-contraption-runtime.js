import { ItemStack, world } from "@minecraft/server";

import { collectConnectedBlocks } from "../contraptions/assembly-collector.js";
import { linkedLocationsForAssembly } from "../contraptions/assembly-attachments.js";
import { assemblyTransformToRuntime } from "../contraptions/assembly-transform.js";
import {
	assembleExternalDynamicAssembly,
	disassembleExternalDynamicAssembly,
	getExternalDynamicAssembly,
	registerDynamicAssemblyOwnerRestorer,
	updateExternalDynamicAssemblyHost
} from "../contraptions/contraption-runtime.js";
import { MAX_DYNAMIC_ASSEMBLY_BLOCKS } from "../contraptions/dynamic-assembly-snapshot.js";
import { isMovableBlockType } from "../contraptions/movable-blocks.js";
import { createMinecartContraptionRecord, MinecartContraptionRegistry, normalizeMinecartContraptionRecord } from "./minecart-contraption-state.js";

export const MINECART_CONTRAPTION_OWNER_KIND = "minecart_contraption";
export const CART_ASSEMBLER_BLOCK = "createbedrock:cart_assembler";
export const MINECART_ANCHOR_BLOCK = "createbedrock:minecart_anchor";
export const CARRIAGE_CONTRAPTION_ENTITY = "createbedrock:carriage_contraption";
export const SEAT_ENTITY = "createbedrock:seat";
export const MINECART_COUPLING_ITEM = "createbedrock:minecart_coupling";

const TRACK_BLOCK = "createbedrock:track";
const MINECART_CART_ITEMS = new Map([
	["minecraft:minecart", "minecart"],
	["createbedrock:minecart_contraption", "minecart"],
	["minecraft:chest_minecart", "chest_minecart"],
	["createbedrock:chest_minecart_contraption", "chest_minecart"],
	["minecraft:furnace_minecart", "furnace_minecart"],
	["createbedrock:furnace_minecart_contraption", "furnace_minecart"]
]);
const RETURNED_CART_ITEMS = new Map([
	["minecart", "createbedrock:minecart_contraption"],
	["chest_minecart", "createbedrock:chest_minecart_contraption"],
	["furnace_minecart", "createbedrock:furnace_minecart_contraption"]
]);
const NEIGHBOR_OFFSETS = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];

const registry = new MinecartContraptionRegistry();
const pendingCouplings = new Map();
let nextCartId = 1;
let registered = false;

function locationKey(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function allocateCartId() {
	while (registry.get(`cart:${nextCartId}`))
		nextCartId++;
	return `cart:${nextCartId++}`;
}

function hostFor(record) {
	return {
		kind: MINECART_CONTRAPTION_OWNER_KIND,
		key: record.cartId,
		record: normalizeMinecartContraptionRecord(record)
	};
}

function syncRecord(record) {
	return updateExternalDynamicAssemblyHost(record.dimensionId, record.assemblyId, () => hostFor(record));
}

function recordWithDimension(record, dimensionId) {
	return { ...record, dimensionId };
}

function restoreOwner({ dimensionId, host, id }) {
	const record = normalizeMinecartContraptionRecord(host?.record);
	if (host?.key !== record.cartId || record.assemblyId !== id)
		throw new TypeError("Restored minecart contraption host does not match its dynamic assembly");
	registry.upsertRestored(record.dimensionId === dimensionId ? record : recordWithDimension(record, dimensionId));
}

function findRecordForAssembler(dimensionId, location) {
	const key = locationKey(dimensionId, location);
	return registry.snapshot().find(record => record.dimensionId === dimensionId && locationKey(dimensionId, record.assemblerLocation) === key);
}

function findTrackRoute(block) {
	for (const [x, y, z] of NEIGHBOR_OFFSETS) {
		const location = { x: block.location.x + x, y: block.location.y + y, z: block.location.z + z };
		try {
			if (block.dimension.getBlock(location)?.typeId === TRACK_BLOCK)
				return { key: `track:${block.dimension.id}:${location.x}:${location.y}:${location.z}`, location };
		} catch {}
	}
	return undefined;
}

function findMinecartAnchor(block) {
	for (const [x, y, z] of NEIGHBOR_OFFSETS) {
		const location = { x: block.location.x + x, y: block.location.y + y, z: block.location.z + z };
		try {
			if (block.dimension.getBlock(location)?.typeId === MINECART_ANCHOR_BLOCK)
				return location;
		} catch {}
	}
	return undefined;
}

function collectPayload(block) {
	return collectConnectedBlocks({
		canCollect: data => isMovableBlockType(data.typeId),
		linkedLocations: location => linkedLocationsForAssembly(block.dimension.id, location),
		maxBlocks: MAX_DYNAMIC_ASSEMBLY_BLOCKS,
		readBlock(location) {
			const source = block.dimension.getBlock(location);
			return !source || source.typeId === "minecraft:air"
				? undefined
				: { states: source.permutation.getAllStates(), typeId: source.typeId };
		},
		start: { x: block.location.x, y: block.location.y + 1, z: block.location.z }
	});
}

function consumeHeldItem(player, itemTypeId) {
	const inventory = player.getComponent?.("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot))
		return false;
	const held = inventory.getItem(slot);
	if (!held || held.typeId !== itemTypeId || held.amount < 1)
		return false;
	if (held.amount === 1)
		inventory.setItem(slot);
	else {
		held.amount--;
		inventory.setItem(slot, held);
	}
	return true;
}

function returnCartItem(record) {
	const itemTypeId = RETURNED_CART_ITEMS.get(record.cartKind);
	if (!itemTypeId)
		return;
	try {
		world.getDimension(record.dimensionId).spawnItem(new ItemStack(itemTypeId, 1), {
			x: record.assemblerLocation.x + 0.5,
			y: record.assemblerLocation.y + 1,
			z: record.assemblerLocation.z + 0.5
		});
	} catch (error) {
		console.warn(`[Create Bedrock] Could not return minecart contraption item: ${error}`);
	}
}

function removeSeats(record) {
	try {
		for (const seat of world.getDimension(record.dimensionId).getEntities({ type: SEAT_ENTITY }))
			if (seat.getDynamicProperty("createbedrock:minecart_cart_id") === record.cartId)
				seat.remove();
	} catch {}
}

function seatLocation(record) {
	const external = getExternalDynamicAssembly(record.dimensionId, record.assemblyId);
	if (!external)
		throw new Error("Minecart contraption assembly is unavailable");
	const runtime = assemblyTransformToRuntime(external.assembly.transform);
	return {
		x: external.assembly.snapshot.anchor.x + runtime.translation.x + 0.5,
		y: external.assembly.snapshot.anchor.y + runtime.translation.y + 0.5,
		z: external.assembly.snapshot.anchor.z + runtime.translation.z + 0.5
	};
}

function spawnSeat(record, player, seatId) {
	const dimension = world.getDimension(record.dimensionId);
	for (const seat of dimension.getEntities({ type: SEAT_ENTITY }))
		if (seat.getDynamicProperty("createbedrock:minecart_cart_id") === record.cartId
			&& seat.getDynamicProperty("createbedrock:minecart_player_id") === player.id)
			seat.remove();
	const seat = dimension.spawnEntity(SEAT_ENTITY, seatLocation(record));
	seat.setDynamicProperty("createbedrock:minecart_cart_id", record.cartId);
	seat.setDynamicProperty("createbedrock:minecart_seat_id", seatId);
	seat.setDynamicProperty("createbedrock:minecart_player_id", player.id);
	if (typeof seat.addRider === "function")
		seat.addRider(player);
	return seat;
}

function assembleCart(block, player, itemTypeId) {
	const cartKind = MINECART_CART_ITEMS.get(itemTypeId);
	if (!cartKind)
		return false;
	const route = findTrackRoute(block);
	if (!route) {
		player.sendMessage?.("Cart Assembler requires an adjacent Create track.");
		return false;
	}
	const blocks = collectPayload(block);
	if (blocks.length === 0) {
		player.sendMessage?.("Cart Assembler needs a movable structure directly above it.");
		return false;
	}
	const cartId = allocateCartId();
	const record = createMinecartContraptionRecord({
		anchorLocation: blocks[0].location,
		assemblerLocation: block.location,
		assemblyId: `minecart:${locationKey(block.dimension.id, block.location)}:${cartId}`,
		cartId,
		cartKind,
		dimensionId: block.dimension.id,
		minecartAnchorLocation: findMinecartAnchor(block),
		route
	});
	registry.assertCanRegister(record);
	assembleExternalDynamicAssembly({
		anchor: record.anchorLocation,
		dimensionId: record.dimensionId,
		host: hostFor(record),
		id: record.assemblyId,
		locations: blocks.map(entry => entry.location),
		owner: { kind: MINECART_CONTRAPTION_OWNER_KIND, cartId: record.cartId }
	});
	try {
		if (!consumeHeldItem(player, itemTypeId))
			throw new Error("The minecart item was no longer available to consume");
		registry.register(record);
		player.sendMessage?.("Minecart contraption assembled and route-reserved.");
		return true;
	} catch (error) {
		disassembleExternalDynamicAssembly(record.dimensionId, record.assemblyId);
		throw error;
	}
}

function disassembleCart(record, player) {
	let disassembling = registry.beginDisassembly(record.cartId);
	syncRecord(disassembling);
	removeSeats(disassembling);
	if (!disassembleExternalDynamicAssembly(disassembling.dimensionId, disassembling.assemblyId)) {
		disassembling = registry.reopen(disassembling.cartId);
		syncRecord(disassembling);
		player.sendMessage?.("Minecart contraption cannot disassemble into an occupied destination.");
		return false;
	}
	const completed = registry.completeDisassembly(disassembling.cartId);
	if (completed.counterpart)
		syncRecord(completed.counterpart);
	returnCartItem(completed.record);
	player.sendMessage?.("Minecart contraption disassembled safely.");
	return true;
}

function seatPlayer(record, player) {
	const seatId = `seat:${record.cartId}:${player.id}`;
	const seated = registry.seat(record.cartId, { playerId: player.id, seatId });
	try {
		spawnSeat(seated, player, seatId);
		syncRecord(seated);
		player.sendMessage?.("Seated in minecart contraption.");
		return true;
	} catch (error) {
		const restored = registry.unseat(record.cartId, player.id);
		syncRecord(restored);
		throw error;
	}
}

function coupleAtAssembler(record, player, itemTypeId) {
	const pending = pendingCouplings.get(player.id);
	if (!pending) {
		pendingCouplings.set(player.id, record.cartId);
		player.sendMessage?.("Select a second minecart contraption to couple.");
		return true;
	}
	pendingCouplings.delete(player.id);
	let result;
	try {
		result = registry.couple(pending, record.cartId);
		syncRecord(result.left);
		syncRecord(result.right);
		if (!consumeHeldItem(player, itemTypeId))
			throw new Error("The minecart coupling item was no longer available to consume");
		player.sendMessage?.("Minecart contraptions coupled.");
		return true;
	} catch (error) {
		if (result) {
			try {
				const rollback = registry.uncouple(result.left.cartId);
				syncRecord(rollback.record);
				if (rollback.counterpart)
					syncRecord(rollback.counterpart);
			} catch (rollbackError) {
				console.warn(`[Create Bedrock] Minecart coupling rollback failed: ${rollbackError}`);
			}
		}
		player.sendMessage?.(`Minecart coupling failed: ${error}`);
		return false;
	}
}

function interactCartAssembler(event) {
	const record = findRecordForAssembler(event.block.dimension.id, event.block.location);
	if (record) {
		if (event.itemStack?.typeId === MINECART_COUPLING_ITEM)
			return coupleAtAssembler(record, event.player, event.itemStack.typeId);
		if (event.player.isSneaking)
			return disassembleCart(record, event.player);
		if (!event.itemStack)
			return seatPlayer(record, event.player);
		event.player.sendMessage?.("This Cart Assembler already owns an active minecart contraption.");
		return false;
	}
	if (!event.itemStack || !MINECART_CART_ITEMS.has(event.itemStack.typeId)) {
		event.player.sendMessage?.("Hold a minecart contraption item to assemble the structure above.");
		return false;
	}
	return assembleCart(event.block, event.player, event.itemStack.typeId);
}

function anchorInUse(dimensionId, location) {
	return registry.snapshot().some(record => record.dimensionId === dimensionId
		&& record.minecartAnchorLocation
		&& locationKey(dimensionId, record.minecartAnchorLocation) === locationKey(dimensionId, location));
}

export function getMinecartContraptionDiagnostics() {
	const records = registry.snapshot();
	return {
		active: records.filter(record => record.phase === "active").length,
		coupled: records.filter(record => record.coupling).length / 2,
		passengers: records.reduce((total, record) => total + record.passengers.length, 0),
		pendingCouplings: pendingCouplings.size,
		routeReservations: records.filter(record => record.route).length
	};
}

export function registerMinecartContraptions() {
	if (registered)
		return false;
	registered = true;
	registerDynamicAssemblyOwnerRestorer(MINECART_CONTRAPTION_OWNER_KIND, restoreOwner);
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block?.typeId !== CART_ASSEMBLER_BLOCK)
			return;
		try {
			interactCartAssembler(event);
		} catch (error) {
			event.player.sendMessage?.(`Cart Assembler failed: ${error}`);
			console.warn(`[Create Bedrock] Cart Assembler interaction failed: ${error}`);
		}
	});
	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (event.block?.typeId === CART_ASSEMBLER_BLOCK && findRecordForAssembler(event.block.dimension.id, event.block.location)) {
			event.cancel = true;
			event.player.sendMessage?.("Disassemble the minecart contraption before removing its Cart Assembler.");
		}
		if (event.block?.typeId === MINECART_ANCHOR_BLOCK && anchorInUse(event.block.dimension.id, event.block.location)) {
			event.cancel = true;
			event.player.sendMessage?.("This Minecart Anchor is reserved by an active minecart contraption.");
		}
	});
	return true;
}
