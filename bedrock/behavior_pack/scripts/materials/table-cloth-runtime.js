import { ItemStack, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { countDepotNetworkItem, hasDepotAt, requestDepotItem } from "../logistics/depot-runtime.js";
import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	addShoppingListPurchase,
	addTableClothDisplayItem,
	configureTableCloth,
	createTableClothState,
	removeTableClothDisplayItem,
	SHOPPING_LIST_ITEM,
	shoppingListTotals,
	TABLE_CLOTH_BLOCKS,
	tableClothStockLevel,
	validateShoppingList,
	validateTableClothState
} from "./table-cloth.js";

const SHOP_STATE = "createbedrock:shop";
const DISPLAY_COUNT_STATE = "createbedrock:display_count";
const SHOPPING_LIST_PROPERTY = "createbedrock:shopping_list_v1";
const NEIGHBOR_OFFSETS = [
	{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
	{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 },
	{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }
];
const records = new Map();
let failedUpdates = 0;
let nextCheckoutNonce = 0;
let registered = false;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Table Cloth locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Table Cloths require a dimension identifier");
	const normalized = assertLocation(location);
	return `table-cloth:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	const location = record.location;
	return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:table_cloth_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Table Cloth state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind !== "table_cloth")
			throw new TypeError("Unknown Table Cloth persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [...records.values()].map(record => ({
		kind: "table_cloth",
		id: record.id,
		dimensionId: record.dimensionId,
		location: clone(record.location),
		state: clone(record.state)
	})).sort((left, right) => left.id.localeCompare(right.id));
}

function persist() {
	try {
		store.request(persistentRecords());
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Table Cloth state: ${error}`);
	}
}

function isTableCloth(block) {
	return TABLE_CLOTH_BLOCKS.has(block?.typeId);
}

function resolveBlock(record) {
	try {
		return world.getDimension(record.dimensionId).getBlock(record.location);
	} catch {
		return undefined;
	}
}

function applyStateToBlock(record, block = resolveBlock(record)) {
	if (!isTableCloth(block) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [name, value] of Object.entries({
		[DISPLAY_COUNT_STATE]: record.state.shop ? Math.min(4, record.state.shop.wares.length) : record.state.displayItems.length,
		[SHOP_STATE]: record.state.shop ? 1 : 0
	})) {
		if (permutation.getAllStates?.()[name] === value)
			continue;
		permutation = permutation.withState(name, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function createRecord(block, player) {
	if (!isTableCloth(block))
		return undefined;
	const location = assertLocation(block.location);
	const id = recordId(block.dimension.id, location);
	const existing = records.get(id);
	if (existing)
		return existing;
	const facing = block.permutation?.getAllStates?.()["minecraft:facing_direction"];
	const record = { dimensionId: block.dimension.id, id, location, state: createTableClothState({ facing: [2, 3, 4, 5].includes(facing) ? facing : 2, owner: player?.name ?? "" }) };
	records.set(id, record);
	applyStateToBlock(record, block);
	return record;
}

function selectedSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const index = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(index) || index < 0 || index >= container.size)
		return undefined;
	return { container, index, itemStack: container.getItem(index) };
}

function replaceSelectedSlot(player, itemStack) {
	const slot = selectedSlot(player);
	if (!slot)
		return false;
	slot.container.setItem(slot.index, itemStack);
	return true;
}

function consumeSelectedOne(player, typeId) {
	const slot = selectedSlot(player);
	if (!slot?.itemStack || slot.itemStack.typeId !== typeId || slot.itemStack.amount < 1)
		return false;
	if (slot.itemStack.amount === 1)
		slot.container.setItem(slot.index, undefined);
	else {
		const remaining = slot.itemStack.clone();
		remaining.amount--;
		slot.container.setItem(slot.index, remaining);
	}
	return true;
}

function playerOwner(player) {
	const owner = player?.name;
	if (typeof owner !== "string" || owner.length === 0)
		throw new Error("The player has no stable name for this Table Cloth shop");
	return owner;
}

function parseAmount(value, label, maximum) {
	if (typeof value !== "string" || !/^[1-9]\d*$/.test(value.trim()))
		throw new TypeError(`${label} must be a whole number`);
	const amount = Number(value.trim());
	if (!Number.isSafeInteger(amount) || amount > maximum)
		throw new RangeError(`${label} must be from 1 through ${maximum}`);
	return amount;
}

function listFromItem(itemStack) {
	if (itemStack?.typeId !== SHOPPING_LIST_ITEM)
		return undefined;
	const encoded = itemStack.getDynamicProperty?.(SHOPPING_LIST_PROPERTY);
	if (typeof encoded !== "string" || encoded.length === 0)
		return undefined;
	return validateShoppingList(JSON.parse(encoded));
}

function listItem(list) {
	const item = new ItemStack(SHOPPING_LIST_ITEM, 1);
	item.setDynamicProperty(SHOPPING_LIST_PROPERTY, JSON.stringify(validateShoppingList(list)));
	return item;
}

function purchaseCount(list, clothId) {
	return list?.purchases?.find(purchase => purchase.clothId === clothId)?.count ?? 0;
}

function availabilityFor(record) {
	const availableByItem = {};
	for (const ware of record.state.shop?.wares ?? [])
		availableByItem[ware.itemType] = countDepotNetworkItem({
			dimensionId: record.dimensionId,
			itemType: ware.itemType,
			networkId: record.state.shop.networkId,
			targetAddress: record.state.shop.targetAddress
		}).available;
	return availableByItem;
}

function addShopPurchase(record, block, player) {
	const slot = selectedSlot(player);
	if (slot?.itemStack && slot.itemStack.typeId !== SHOPPING_LIST_ITEM) {
		player.sendMessage?.("Hold an empty hand or a Shopping List to add an order.");
		return false;
	}
	const existing = listFromItem(slot?.itemStack);
	const stockLevel = tableClothStockLevel(record.state, {
		alreadyPurchased: purchaseCount(existing, record.id),
		availableByItem: availabilityFor(record)
	});
	const result = addShoppingListPurchase(existing, { clothId: record.id, owner: record.state.owner, shop: record.state.shop, stockLevel });
	if (!result.changed) {
		player.sendMessage?.(result.reason === "different_shop_network"
			? "This list belongs to another shop network. Use a separate Shopping List."
			: "This shop is out of stock for that purchase.");
		return false;
	}
	if (!replaceSelectedSlot(player, listItem(result.state)))
		throw new Error("Player inventory is unavailable for the Shopping List");
	block.dimension.playSound?.("item.book.page_turn", block.location, { pitch: 1.25, volume: 0.7 });
	player.sendMessage?.(`Added purchase ${purchaseCount(result.state, record.id)}/${stockLevel} to the Shopping List.`);
	return true;
}

function useDisplay(record, block, player) {
	const held = selectedSlot(player)?.itemStack;
	if (!held) {
		const result = removeTableClothDisplayItem(record.state);
		if (!result.changed)
			return false;
		record.state = result.state;
		block.dimension.spawnItem(new ItemStack(result.itemType, 1), block.location);
		applyStateToBlock(record, block);
		persist();
		return true;
	}
	const result = addTableClothDisplayItem(record.state, held.typeId);
	if (!result.changed)
		return false;
	if (!consumeSelectedOne(player, held.typeId))
		throw new Error("Could not remove the displayed item from player inventory");
	record.state = result.state;
	applyStateToBlock(record, block);
	persist();
	return true;
}

function showConfiguration(record, block, player) {
	const state = record.state;
	const shop = state.shop;
	const form = new ModalFormData()
		.title("Table Cloth Shop")
		.label(shop ? "Configure the shop's price tag and logistics network." : "Enable a shop to publish wares to a Shopping List.")
		.toggle("Enable shop", { defaultValue: Boolean(shop) })
		.textField("Logistics network", "default", { defaultValue: shop?.networkId ?? "default" })
		.textField("Target address (blank for all)", "Optional Depot address", { defaultValue: shop?.targetAddress ?? "" })
		.textField("Price-tag item", "minecraft:emerald", { defaultValue: shop?.payment.itemType ?? "minecraft:emerald" })
		.textField("Price-tag amount", "1..100", { defaultValue: String(shop?.payment.count ?? 1) });
	for (let index = 0; index < 4; index++) {
		const ware = shop?.wares[index];
		form.textField(`Ware ${index + 1}`, "minecraft:iron_ingot (blank to omit)", { defaultValue: ware?.itemType ?? "" });
		form.textField(`Ware ${index + 1} amount`, "1..256", { defaultValue: ware ? String(ware.count) : "1" });
	}
	form.submitButton("Save shop");
	form.show(player).then(response => {
		if (response.canceled)
			return false;
		const values = response.formValues ?? [];
		const enabled = values[0] === true;
		const wares = [];
		for (let index = 0; index < 4; index++) {
			const itemType = String(values[5 + index * 2] ?? "").trim();
			if (itemType.length === 0)
				continue;
			wares.push({ count: parseAmount(String(values[6 + index * 2] ?? ""), `Ware ${index + 1} amount`, 256), itemType });
		}
		const result = configureTableCloth({
			expectedRevision: state.revision,
			patch: {
				owner: playerOwner(player),
				shop: enabled ? {
					networkId: String(values[1] ?? "").trim(),
					payment: { count: parseAmount(String(values[4] ?? ""), "Price-tag amount", 100), itemType: String(values[3] ?? "").trim() },
					targetAddress: String(values[2] ?? "").trim(),
					wares
				} : undefined
			},
			state: record.state
		});
		if (result.conflict) {
			player.sendMessage?.("This Table Cloth changed while its menu was open. Reopen it and try again.");
			return false;
		}
		if (!result.changed)
			return false;
		record.state = result.state;
		applyStateToBlock(record, block);
		persist();
		player.sendMessage?.(result.state.shop ? "Table Cloth shop saved." : "Table Cloth shop disabled.");
		return true;
	}).catch(error => player.sendMessage?.(`Could not save the Table Cloth shop: ${error}`));
}

function paymentAvailability(player, payments) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	if (!container)
		return false;
	return payments.every(payment => {
		let total = 0;
		for (let slot = 0; slot < container.size; slot++) {
			const stack = container.getItem(slot);
			if (stack?.typeId === payment.itemType)
				total += stack.amount;
		}
		return total >= payment.count;
	});
}

function takePayments(player, payments) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	if (!container || !paymentAvailability(player, payments))
		return false;
	for (const payment of payments) {
		let remaining = payment.count;
		for (let slot = 0; slot < container.size && remaining > 0; slot++) {
			const stack = container.getItem(slot);
			if (stack?.typeId !== payment.itemType)
				continue;
			const take = Math.min(remaining, stack.amount);
			remaining -= take;
			if (take === stack.amount)
				container.setItem(slot, undefined);
			else {
				const replacement = stack.clone();
				replacement.amount -= take;
				container.setItem(slot, replacement);
			}
		}
	}
	return true;
}

function returnPayments(player, payments) {
	const inventory = player?.getComponent?.("minecraft:inventory")?.container;
	for (const payment of payments) {
		let remaining = payment.count;
		while (remaining > 0) {
			const stack = new ItemStack(payment.itemType, Math.min(remaining, 64));
			const overflow = inventory?.addItem?.(stack);
			if (overflow)
				player.dimension.spawnItem(overflow, player.location);
			remaining -= stack.amount;
		}
	}
}

function nearbyDepotLocations(block) {
	return NEIGHBOR_OFFSETS.map(offset => ({ x: block.location.x + offset.x, y: block.location.y + offset.y, z: block.location.z + offset.z }))
		.filter(location => hasDepotAt(block.dimension.id, location));
}

function checkoutShoppingList(player, tickerBlock) {
	const slot = selectedSlot(player);
	const list = listFromItem(slot?.itemStack);
	if (!list)
		return false;
	const totals = shoppingListTotals(list, clothId => records.get(clothId)?.state);
	if (!totals.ok) {
		player.sendMessage?.(totals.reason === "missing_shop" ? "A shop on this Shopping List no longer exists." : "The Shopping List is empty or its shop settings changed.");
		return false;
	}
	const [owner, networkId, targetAddress] = list.shopKey.split("\u0000");
	if (!owner || !networkId || targetAddress === undefined || nearbyDepotLocations(tickerBlock).length === 0) {
		player.sendMessage?.("Checkout needs a Stock Ticker with an adjacent Depot.");
		return false;
	}
	for (const ware of totals.wares) {
		const available = countDepotNetworkItem({ dimensionId: tickerBlock.dimension.id, itemType: ware.itemType, networkId, targetAddress }).available;
		if (available < ware.count) {
			player.sendMessage?.(`Checkout failed: ${ware.itemType} no longer has enough stock.`);
			return false;
		}
	}
	if (!takePayments(player, totals.payments)) {
		player.sendMessage?.("Checkout failed: your inventory does not contain the listed payment.");
		return false;
	}
	const destinationLocation = nearbyDepotLocations(tickerBlock)[0];
	const checkoutId = `shopping-list:${tickerBlock.dimension.id}:${tickerBlock.location.x}:${tickerBlock.location.y}:${tickerBlock.location.z}:${world.getAbsoluteTime()}:${++nextCheckoutNonce}`;
	try {
		for (const ware of totals.wares) {
			let remaining = ware.count;
			let part = 0;
			while (remaining > 0) {
				const maxCount = Math.min(4_096, remaining);
				const request = requestDepotItem({
					allowPartial: false,
					destinationLocation,
					dimensionId: tickerBlock.dimension.id,
					id: `${checkoutId}:${part++}`,
					itemType: ware.itemType,
					maxCount,
					networkId,
					targetAddress
				});
				if (!request.ok)
					throw new Error(request.reason ?? `could not request ${ware.itemType}`);
				remaining -= maxCount;
			}
		}
		replaceSelectedSlot(player, undefined);
		player.sendMessage?.("Checkout submitted. Collect the delivered order from the Depot beside this Stock Ticker.");
		return true;
	} catch (error) {
		returnPayments(player, totals.payments);
		player.sendMessage?.(`Checkout could not submit its complete Depot order; payment was returned. ${error}`);
		return false;
	}
}

export function captureTableClothMovingData(dimensionId, location) {
	const record = records.get(recordId(dimensionId, location));
	return record && { state: clone(record.state) };
}

export function detachTableClothMovingData(dimensionId, location) {
	if (!records.delete(recordId(dimensionId, location)))
		return false;
	persist();
	return true;
}

export function restoreTableClothMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore Table Cloth state over an existing record: ${id}`);
	const record = { dimensionId, id, location: assertLocation(location), state: validateTableClothState(data.state) };
	records.set(id, record);
	applyStateToBlock(record);
	persist();
	return true;
}

export function getTableClothDiagnostics() {
	return { active: records.size, failedUpdates, persistence: store.diagnostics() };
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Table Cloth state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "table_cloth" || typeof entry.dimensionId !== "string")
				throw new Error("Table Cloth state contains an unknown record");
			const location = assertLocation(entry.location);
			const id = recordId(entry.dimensionId, location);
			if (entry.id !== id)
				throw new Error("Table Cloth state has an invalid identity");
			records.set(id, { dimensionId: entry.dimensionId, id, location, state: validateTableClothState(entry.state) });
		}
		for (const record of records.values())
			applyStateToBlock(record);
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Table Cloth state: ${error}`);
	}
}

export function registerTableCloths() {
	if (registered)
		return false;
	registered = true;
	for (const typeId of TABLE_CLOTH_BLOCKS) {
		registerMovingBlockDataContributor(typeId, "table_cloth", {
			capture: captureTableClothMovingData,
			detach: detachTableClothMovingData,
			restore: restoreTableClothMovingData,
			schemaVersion: 1,
			validate(data) {
				if (!data || typeof data !== "object")
					throw new TypeError("Moving Table Cloth data must contain its persistent state");
				validateTableClothState(data.state);
			}
		});
	}
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (createRecord(event.block, event.player))
				persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not place Table Cloth: ${error}`);
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (!isTableCloth(event.block))
			return;
		try {
			const record = records.get(recordId(event.dimension.id, event.block.location));
			if (!record)
				return;
			records.delete(record.id);
			for (const itemType of record.state.displayItems)
				event.dimension.spawnItem(new ItemStack(itemType, 1), event.block.location);
			persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not remove Table Cloth: ${error}`);
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (!isTableCloth(event.block))
			return;
		try {
			const record = createRecord(event.block, event.player);
			if (!record)
				return;
			if (event.player.isSneaking) {
				showConfiguration(record, event.block, event.player);
				return;
			}
			if (record.state.shop)
				addShopPurchase(record, event.block, event.player);
			else
				useDisplay(record, event.block, event.player);
		} catch (error) {
			failedUpdates++;
			event.player?.sendMessage?.(`Could not use Table Cloth: ${error}`);
		}
	});
	world.afterEvents.itemUse.subscribe(event => {
		if (event.itemStack?.typeId !== SHOPPING_LIST_ITEM || !event.source?.isSneaking)
			return;
		try {
			if (listFromItem(selectedSlot(event.source)?.itemStack)) {
				replaceSelectedSlot(event.source, undefined);
				event.source.sendMessage?.("Shopping List discarded.");
			}
		} catch (error) {
			failedUpdates++;
			event.source?.sendMessage?.(`Could not discard Shopping List: ${error}`);
		}
	});
	world.afterEvents.itemStartUseOn.subscribe(event => {
		if (event.itemStack?.typeId !== SHOPPING_LIST_ITEM || event.block?.typeId !== "createbedrock:stock_ticker")
			return;
		try {
			checkoutShoppingList(event.source, event.block);
		} catch (error) {
			failedUpdates++;
			event.source?.sendMessage?.(`Could not check out Shopping List: ${error}`);
		}
	});
	registerTickHandler(() => store.tick());
	system.run(restore);
	return true;
}
