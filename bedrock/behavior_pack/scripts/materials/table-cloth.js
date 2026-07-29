import { normalizeLogisticsAddress, normalizeLogisticsNetworkId } from "../logistics/logistics-address.js";
import { TABLE_CLOTH_BLOCKS as FUNCTIONAL_TABLE_CLOTH_BLOCKS } from "../kernel/functional-color-families.js";

export const TABLE_CLOTH_SCHEMA = 1;
export const SHOPPING_LIST_SCHEMA = 1;
export const SHOPPING_LIST_ITEM = "createbedrock:shopping_list";
export const TABLE_CLOTH_BLOCKS = new Set(FUNCTIONAL_TABLE_CLOTH_BLOCKS);
export const TABLE_CLOTH_MAX_MANUAL_ITEMS = 4;
export const TABLE_CLOTH_MAX_WARES = 9;
export const SHOPPING_LIST_MAX_PURCHASES = 64;

const ITEM_IDENTIFIER = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function itemIdentifier(value, label = "item") {
	if (typeof value !== "string" || !ITEM_IDENTIFIER.test(value) || value === "minecraft:air" || value.length > 128)
		throw new TypeError(`Table Cloth ${label} must be a non-air namespaced Bedrock identifier`);
	return value;
}

function positiveAmount(value, label, maximum = 4_096) {
	if (!Number.isInteger(value) || value < 1 || value > maximum)
		throw new RangeError(`Table Cloth ${label} must be an integer from 1 through ${maximum}`);
	return value;
}

function normalizedWares(value) {
	if (!Array.isArray(value) || value.length < 1 || value.length > TABLE_CLOTH_MAX_WARES)
		throw new RangeError(`Table Cloth shops must sell from 1 through ${TABLE_CLOTH_MAX_WARES} ware types`);
	const wares = value.map((ware, index) => {
		if (!ware || typeof ware !== "object" || Array.isArray(ware))
			throw new TypeError(`Table Cloth ware ${index + 1} must be an object`);
		return { count: positiveAmount(ware.count, `ware ${index + 1} count`, 256), itemType: itemIdentifier(ware.itemType, `ware ${index + 1}`) };
	});
	if (new Set(wares.map(ware => ware.itemType)).size !== wares.length)
		throw new RangeError("Table Cloth shops cannot sell the same ware twice");
	return wares;
}

export function createTableClothState(patch = {}) {
	return validateTableClothState({
		displayItems: [],
		facing: 2,
		owner: "",
		revision: 0,
		schemaVersion: TABLE_CLOTH_SCHEMA,
		shop: undefined,
		...clone(patch)
	});
}

export function validateTableClothState(state) {
	if (!state || typeof state !== "object" || Array.isArray(state))
		throw new TypeError("Table Cloth state must be an object");
	if (state.schemaVersion !== TABLE_CLOTH_SCHEMA)
		throw new Error(`Table Cloth state must use schema ${TABLE_CLOTH_SCHEMA}`);
	if (!Number.isSafeInteger(state.revision) || state.revision < 0)
		throw new RangeError("Table Cloth revisions must be non-negative safe integers");
	if (!Number.isInteger(state.facing) || ![2, 3, 4, 5].includes(state.facing))
		throw new RangeError("Table Cloth facing must be horizontal");
	if (typeof state.owner !== "string" || state.owner.length > 128)
		throw new TypeError("Table Cloth owner must be a short string");
	if (!Array.isArray(state.displayItems) || state.displayItems.length > TABLE_CLOTH_MAX_MANUAL_ITEMS)
		throw new RangeError(`Table Cloths can display at most ${TABLE_CLOTH_MAX_MANUAL_ITEMS} items`);
	const displayItems = state.displayItems.map((item, index) => itemIdentifier(item, `display item ${index + 1}`));
	if (state.shop === undefined || state.shop === null)
		return clone({ ...state, displayItems, shop: undefined });
	if (!state.shop || typeof state.shop !== "object" || Array.isArray(state.shop))
		throw new TypeError("Table Cloth shop settings must be an object");
	const shop = state.shop;
	const payment = shop.payment;
	if (!payment || typeof payment !== "object" || Array.isArray(payment))
		throw new TypeError("Table Cloth shops require one price-tag item");
	return clone({
		...state,
		displayItems,
		shop: {
			networkId: normalizeLogisticsNetworkId(shop.networkId),
			payment: { count: positiveAmount(payment.count, "price-tag count", 100), itemType: itemIdentifier(payment.itemType, "price-tag item") },
			targetAddress: normalizeLogisticsAddress(shop.targetAddress),
			wares: normalizedWares(shop.wares)
		}
	});
}

export function configureTableCloth({ expectedRevision, patch, state }) {
	const current = validateTableClothState(state);
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
		throw new RangeError("Table Cloth edits require a non-negative expected revision");
	if (expectedRevision !== current.revision)
		return { changed: false, conflict: true, state: current };
	if (!patch || typeof patch !== "object" || Array.isArray(patch))
		throw new TypeError("Table Cloth edits require an object patch");
	for (const key of Object.keys(patch))
		if (!new Set(["facing", "owner", "shop"]).has(key))
			throw new Error(`Table Cloth does not support configuration field ${key}`);
	const next = validateTableClothState({ ...current, ...patch });
	if (JSON.stringify(next) === JSON.stringify(current))
		return { changed: false, conflict: false, state: current };
	return { changed: true, conflict: false, state: { ...next, revision: current.revision + 1 } };
}

export function addTableClothDisplayItem(state, itemType) {
	const current = validateTableClothState(state);
	if (current.shop || current.displayItems.length >= TABLE_CLOTH_MAX_MANUAL_ITEMS)
		return { changed: false, state: current };
	return { changed: true, state: validateTableClothState({ ...current, displayItems: [...current.displayItems, itemIdentifier(itemType)] }) };
}

export function removeTableClothDisplayItem(state) {
	const current = validateTableClothState(state);
	if (current.shop || current.displayItems.length === 0)
		return { changed: false, state: current };
	const itemType = current.displayItems.at(-1);
	return { changed: true, itemType, state: validateTableClothState({ ...current, displayItems: current.displayItems.slice(0, -1) }) };
}

export function tableClothShopKey(owner, shop) {
	if (typeof owner !== "string" || owner.length === 0)
		throw new TypeError("Table Cloth shopping lists require an owned shop");
	const valid = validateTableClothState(createTableClothState({ owner, shop })).shop;
	return `${owner}\u0000${valid.networkId}\u0000${valid.targetAddress}`;
}

export function createShoppingList({ owner, shop }) {
	return validateShoppingList({ purchases: [], schemaVersion: SHOPPING_LIST_SCHEMA, shopKey: tableClothShopKey(owner, shop) });
}

export function validateShoppingList(list) {
	if (!list || typeof list !== "object" || Array.isArray(list))
		throw new TypeError("Shopping List data must be an object");
	if (list.schemaVersion !== SHOPPING_LIST_SCHEMA || typeof list.shopKey !== "string" || list.shopKey.length < 3 || list.shopKey.length > 384)
		throw new TypeError("Shopping List data has an invalid schema or shop key");
	if (!Array.isArray(list.purchases) || list.purchases.length > SHOPPING_LIST_MAX_PURCHASES)
		throw new RangeError(`Shopping Lists can contain at most ${SHOPPING_LIST_MAX_PURCHASES} shops`);
	const purchases = list.purchases.map((purchase, index) => {
		if (!purchase || typeof purchase !== "object" || Array.isArray(purchase) || typeof purchase.clothId !== "string" || purchase.clothId.length < 1 || purchase.clothId.length > 256)
			throw new TypeError(`Shopping List purchase ${index + 1} has an invalid shop identity`);
		return { clothId: purchase.clothId, count: positiveAmount(purchase.count, `purchase ${index + 1}`, 4_096) };
	});
	if (new Set(purchases.map(purchase => purchase.clothId)).size !== purchases.length)
		throw new RangeError("Shopping Lists cannot contain duplicate shop locations");
	return clone({ ...list, purchases });
}

export function addShoppingListPurchase(list, { clothId, owner, shop, stockLevel }) {
	const current = list ? validateShoppingList(list) : createShoppingList({ owner, shop });
	const shopKey = tableClothShopKey(owner, shop);
	if (current.shopKey !== shopKey)
		return { changed: false, reason: "different_shop_network", state: current };
	if (typeof clothId !== "string" || clothId.length < 1 || clothId.length > 256)
		throw new TypeError("Shopping List purchases require a shop location identity");
	if (!Number.isInteger(stockLevel) || stockLevel < 0)
		throw new RangeError("Shopping List stock levels must be non-negative integers");
	const currentCount = current.purchases.find(purchase => purchase.clothId === clothId)?.count ?? 0;
	if (currentCount >= stockLevel)
		return { changed: false, reason: "out_of_stock", state: current };
	const purchases = current.purchases.map(purchase => purchase.clothId === clothId ? { ...purchase, count: purchase.count + 1 } : purchase);
	if (currentCount === 0)
		purchases.push({ clothId, count: 1 });
	return { changed: true, reason: "added", state: validateShoppingList({ ...current, purchases }) };
}

export function tableClothStockLevel(state, { availableByItem = {}, alreadyPurchased = 0 } = {}) {
	const current = validateTableClothState(state);
	if (!current.shop)
		return 0;
	if (!Number.isInteger(alreadyPurchased) || alreadyPurchased < 0)
		throw new RangeError("Shopping List purchase quantities must be non-negative integers");
	let lowest = Number.MAX_SAFE_INTEGER;
	for (const ware of current.shop.wares) {
		const available = availableByItem[ware.itemType] ?? 0;
		if (!Number.isSafeInteger(available) || available < 0)
			throw new RangeError(`Table Cloth availability for ${ware.itemType} must be a non-negative safe integer`);
		lowest = Math.min(lowest, Math.floor((available - alreadyPurchased * ware.count) / ware.count));
	}
	return Math.max(0, lowest);
}

export function shoppingListTotals(list, resolveShop) {
	const current = validateShoppingList(list);
	if (typeof resolveShop !== "function")
		throw new TypeError("Shopping List checkout requires a shop resolver");
	const payments = new Map();
	const wares = new Map();
	for (const purchase of current.purchases) {
		const resolved = resolveShop(purchase.clothId);
		if (!resolved)
			return { ok: false, reason: "missing_shop" };
		const state = validateTableClothState(resolved);
		if (!state.shop || tableClothShopKey(state.owner, state.shop) !== current.shopKey)
			return { ok: false, reason: "shop_changed" };
		payments.set(state.shop.payment.itemType, (payments.get(state.shop.payment.itemType) ?? 0) + state.shop.payment.count * purchase.count);
		for (const ware of state.shop.wares)
			wares.set(ware.itemType, (wares.get(ware.itemType) ?? 0) + ware.count * purchase.count);
	}
	return {
		ok: current.purchases.length > 0,
		payments: [...payments].map(([itemType, count]) => ({ itemType, count })).sort((left, right) => left.itemType.localeCompare(right.itemType)),
		wares: [...wares].map(([itemType, count]) => ({ itemType, count })).sort((left, right) => left.itemType.localeCompare(right.itemType))
	};
}
