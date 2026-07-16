import { normalizeLogisticsAddress, normalizeLogisticsNetworkId } from "../logistics/logistics-address.js";

export const STOCK_TICKER_BLOCK = "createbedrock:stock_ticker";
export const STOCK_TICKER_SCHEMA = 1;
export const STOCK_TICKER_MAX_CATEGORIES = 9;

const ITEM_IDENTIFIER = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const REQUEST_STATUSES = new Set(["idle", "pending", "fulfilled", "partial", "failed"]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

export function normalizeStockTickerItem(value) {
	if (typeof value !== "string" || !ITEM_IDENTIFIER.test(value) || value.length > 128)
		throw new TypeError("Stock Ticker items must be namespaced Bedrock identifiers");
	return value;
}

function normalizeCategories(categories) {
	if (!Array.isArray(categories) || categories.length > STOCK_TICKER_MAX_CATEGORIES)
		throw new RangeError(`Stock Ticker categories must contain at most ${STOCK_TICKER_MAX_CATEGORIES} filters`);
	const normalized = categories.map(normalizeStockTickerItem).filter(item => item !== "minecraft:air");
	if (new Set(normalized).size !== normalized.length)
		throw new RangeError("Stock Ticker categories cannot contain duplicate filters");
	return normalized;
}

export function createStockTickerState(patch = {}) {
	return validateStockTickerState({
		schemaVersion: STOCK_TICKER_SCHEMA,
		configurationRevision: 0,
		networkId: "default",
		targetAddress: "",
		categories: [],
		requestedItem: "minecraft:air",
		requestAmount: 64,
		allowPartial: false,
		requestNonce: 0,
		requestStatus: "idle",
		lastAvailable: 0,
		...clone(patch)
	});
}

export function validateStockTickerState(state) {
	if (!state || typeof state !== "object" || Array.isArray(state))
		throw new TypeError("Stock Ticker state must be an object");
	if (state.schemaVersion !== STOCK_TICKER_SCHEMA)
		throw new Error(`Stock Ticker state must use schema ${STOCK_TICKER_SCHEMA}`);
	if (!Number.isSafeInteger(state.configurationRevision) || state.configurationRevision < 0
		|| !Number.isSafeInteger(state.requestNonce) || state.requestNonce < 0)
		throw new RangeError("Stock Ticker revisions and request nonces must be non-negative safe integers");
	normalizeLogisticsNetworkId(state.networkId);
	normalizeLogisticsAddress(state.targetAddress);
	normalizeCategories(state.categories);
	normalizeStockTickerItem(state.requestedItem);
	if (!Number.isInteger(state.requestAmount) || state.requestAmount < 1 || state.requestAmount > 4_096)
		throw new RangeError("Stock Ticker request amounts must be from 1 through 4096");
	if (typeof state.allowPartial !== "boolean" || !REQUEST_STATUSES.has(state.requestStatus))
		throw new TypeError("Stock Ticker request settings are invalid");
	if (!Number.isSafeInteger(state.lastAvailable) || state.lastAvailable < 0)
		throw new RangeError("Stock Ticker available stock must be a non-negative safe integer");
	return clone({
		...state,
		networkId: normalizeLogisticsNetworkId(state.networkId),
		targetAddress: normalizeLogisticsAddress(state.targetAddress),
		categories: normalizeCategories(state.categories)
	});
}

export function configureStockTicker({ expectedRevision, patch, state }) {
	const current = validateStockTickerState(state);
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
		throw new RangeError("Stock Ticker edits require a non-negative expected revision");
	if (expectedRevision !== current.configurationRevision)
		return { changed: false, conflict: true, state: current };
	if (!patch || typeof patch !== "object" || Array.isArray(patch))
		throw new TypeError("Stock Ticker edits require an object patch");
	const permitted = new Set(["allowPartial", "categories", "networkId", "requestedItem", "requestAmount", "targetAddress"]);
	for (const key of Object.keys(patch))
		if (!permitted.has(key))
			throw new Error(`Stock Ticker does not support configuration field ${key}`);
	const next = validateStockTickerState({ ...current, ...patch });
	if (JSON.stringify(next) === JSON.stringify(current))
		return { changed: false, conflict: false, state: current };
	return { changed: true, conflict: false, state: { ...next, configurationRevision: current.configurationRevision + 1 } };
}

/** Start a durable DepotNetwork request without treating its queued stock as already delivered. */
export function beginStockTickerRequest(state, { available = 0 } = {}) {
	const current = validateStockTickerState(state);
	if (current.requestedItem === "minecraft:air")
		return { changed: false, state: current };
	if (!Number.isSafeInteger(available) || available < 0)
		throw new RangeError("Stock Ticker availability must be a non-negative safe integer");
	return {
		changed: true,
		nonce: current.requestNonce + 1,
		state: validateStockTickerState({
			...current,
			lastAvailable: available,
			requestNonce: current.requestNonce + 1,
			requestStatus: "pending"
		})
	};
}

export function updateStockTickerRequest(state, { available, nonce, status } = {}) {
	const current = validateStockTickerState(state);
	if (!Number.isSafeInteger(nonce) || nonce !== current.requestNonce)
		throw new RangeError("Stock Ticker request updates must match the active nonce");
	if (!REQUEST_STATUSES.has(status) || status === "idle")
		throw new RangeError("Stock Ticker request updates must use a concrete request status");
	if (!Number.isSafeInteger(available) || available < 0)
		throw new RangeError("Stock Ticker availability must be a non-negative safe integer");
	return validateStockTickerState({ ...current, lastAvailable: available, requestStatus: status });
}

export function stockTickerStatusLevel(status) {
	if (status === "pending")
		return 1;
	if (status === "fulfilled")
		return 2;
	if (status === "partial")
		return 3;
	if (status === "failed")
		return 4;
	return 0;
}
