import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { openConfigurationFormSession, submitVersionedConfigurationForm } from "../kernel/configuration-protocol.js";
import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { countDepotNetworkItem, depotRequestStatus, hasDepotAt, requestDepotItem } from "../logistics/depot-runtime.js";
import {
	STOCK_TICKER_BLOCK,
	STOCK_TICKER_MAX_CATEGORIES,
	beginStockTickerRequest,
	configureStockTicker,
	createStockTickerState,
	stockTickerStatusLevel,
	updateStockTickerRequest,
	validateStockTickerState
} from "./stock-ticker.js";

const REQUEST_STATUS_STATE = "createbedrock:request_status";
const NEIGHBOR_OFFSETS = [
	{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
	{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 },
	{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }
];
const records = new Map();
let failedUpdates = 0;
let registered = false;
let runtimeTicks = 0;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Stock Ticker locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Stock Tickers require a dimension identifier");
	const normalized = assertLocation(location);
	return `stock-ticker:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	const location = record.location;
	return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:stock_ticker_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Stock Ticker state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind !== "stock_ticker")
			throw new TypeError("Unknown Stock Ticker persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [...records.values()].map(record => ({
		kind: "stock_ticker",
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
		console.warn(`[Create Bedrock] Could not persist Stock Tickers: ${error}`);
	}
}

function isStockTicker(block) {
	return block?.typeId === STOCK_TICKER_BLOCK;
}

function resolveBlock(record) {
	try {
		return world.getDimension(record.dimensionId).getBlock(record.location);
	} catch {
		return undefined;
	}
}

function applyStateToBlock(record, block = resolveBlock(record)) {
	if (!isStockTicker(block) || typeof block.setPermutation !== "function")
		return false;
	const value = stockTickerStatusLevel(record.state.requestStatus);
	if (block.permutation.getAllStates?.()[REQUEST_STATUS_STATE] === value)
		return false;
	block.setPermutation(block.permutation.withState(REQUEST_STATUS_STATE, value));
	return true;
}

function createRecord(block) {
	if (!isStockTicker(block))
		return undefined;
	const location = assertLocation(block.location);
	const id = recordId(block.dimension.id, location);
	const existing = records.get(id);
	if (existing)
		return existing;
	const record = { dimensionId: block.dimension.id, id, location, state: createStockTickerState() };
	records.set(id, record);
	applyStateToBlock(record, block);
	return record;
}

function adjacentDepotLocations(record) {
	return NEIGHBOR_OFFSETS.map(offset => ({
		x: record.location.x + offset.x,
		y: record.location.y + offset.y,
		z: record.location.z + offset.z
	})).filter(location => hasDepotAt(record.dimensionId, location));
}

function networkSummary(record) {
	if (record.state.requestedItem === "minecraft:air")
		return { available: 0, endpointCount: 0 };
	return countDepotNetworkItem({
		dimensionId: record.dimensionId,
		itemType: record.state.requestedItem,
		networkId: record.state.networkId,
		targetAddress: record.state.targetAddress
	});
}

function requestId(record) {
	return `${record.id}:request:${record.state.requestNonce}`;
}

function beginRequest(record) {
	const summary = networkSummary(record);
	const started = beginStockTickerRequest(record.state, { available: summary.available });
	if (!started.changed)
		return { changed: false, reason: "missing_item" };
	record.state = started.state;
	let result = { ok: false, reason: "no_adjacent_depot" };
	for (const destinationLocation of adjacentDepotLocations(record)) {
		try {
			result = requestDepotItem({
				allowPartial: record.state.allowPartial,
				destinationLocation,
				dimensionId: record.dimensionId,
				id: requestId(record),
				itemType: record.state.requestedItem,
				maxCount: record.state.requestAmount,
				networkId: record.state.networkId,
				targetAddress: record.state.targetAddress
			});
			if (result.ok)
				break;
		} catch (error) {
			console.warn(`[Create Bedrock] Stock Ticker ${record.id} could not start a Depot request: ${error}`);
		}
	}
	const status = result.order?.state ?? (result.ok ? "pending" : "failed");
	record.state = updateStockTickerRequest(record.state, { available: summary.available, nonce: started.nonce, status });
	applyStateToBlock(record);
	persist();
	return { changed: true, reason: result.reason, status };
}

function refreshRecord(record) {
	let summary;
	try {
		summary = networkSummary(record);
	} catch {
		return false;
	}
	let next = record.state;
	if (next.requestStatus === "pending") {
		const order = depotRequestStatus(requestId(record));
		if (order && order.state !== "pending")
			next = updateStockTickerRequest(next, { available: summary.available, nonce: next.requestNonce, status: order.state });
		else if (next.lastAvailable !== summary.available)
			next = updateStockTickerRequest(next, { available: summary.available, nonce: next.requestNonce, status: "pending" });
	} else if (next.lastAvailable !== summary.available)
		next = { ...next, lastAvailable: summary.available };
	if (JSON.stringify(next) === JSON.stringify(record.state))
		return false;
	record.state = validateStockTickerState(next);
	applyStateToBlock(record);
	return true;
}

function parseRequestAmount(value) {
	if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value.trim()))
		throw new TypeError("Request amount must be a whole number");
	return Number(value.trim());
}

function showConfiguration(record, player) {
	const state = record.state;
	const session = openConfigurationFormSession({ revision: state.configurationRevision, subjectId: record.id });
	const form = new ModalFormData()
		.title("Stock Ticker")
		.label(`Available: ${state.lastAvailable} • last request: ${state.requestStatus} • revision ${state.configurationRevision}`)
		.textField("Logistics network", "default", { defaultValue: state.networkId })
		.textField("Destination address (blank for all)", "Optional endpoint address", { defaultValue: state.targetAddress })
		.textField("Request item", "minecraft:iron_ingot", { defaultValue: state.requestedItem })
		.textField("Request amount", "1..4096", { defaultValue: String(state.requestAmount) })
		.toggle("Allow partial delivery", { defaultValue: state.allowPartial });
	for (let index = 0; index < STOCK_TICKER_MAX_CATEGORIES; index++)
		form.textField(`Category filter ${index + 1}`, "minecraft:air to clear", { defaultValue: state.categories[index] ?? "minecraft:air" });
	form.submitButton("Request from network");
	form.show(player).then(response => {
		if (response.canceled)
			return false;
		const values = response.formValues ?? [];
		const categories = Array.from({ length: STOCK_TICKER_MAX_CATEGORIES }, (_, index) => String(values[index + 5] ?? "minecraft:air").trim());
		const configured = submitVersionedConfigurationForm({
			actualRevision: () => record.state.configurationRevision,
			session,
			submit: expectedRevision => configureStockTicker({
				expectedRevision,
				patch: {
					allowPartial: values[4] === true,
					categories,
					networkId: String(values[0] ?? "").trim(),
					requestedItem: String(values[2] ?? "").trim(),
					requestAmount: parseRequestAmount(values[3]),
					targetAddress: String(values[1] ?? "").trim()
				},
				state: record.state
			})
		});
		if (configured.conflict) {
			player.sendMessage?.("Stock Ticker settings changed while the form was open. Reopen it and try again.");
			return false;
		}
		if (configured.changed)
			record.state = configured.state;
		if (configured.changed)
			persist();
		return beginRequest(record).changed || configured.changed;
	}).then(changed => {
		if (changed)
			player.sendMessage?.("Stock Ticker request submitted. Items will route to an adjacent Depot.");
	}).catch(error => {
		player.sendMessage?.(`Could not submit Stock Ticker request: ${error}`);
	});
}

export function captureStockTickerMovingData(dimensionId, location) {
	const record = records.get(recordId(dimensionId, location));
	return record && { state: clone(record.state) };
}

export function detachStockTickerMovingData(dimensionId, location) {
	if (!records.delete(recordId(dimensionId, location)))
		return false;
	persist();
	return true;
}

export function restoreStockTickerMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore Stock Ticker state over an existing record: ${id}`);
	const record = { dimensionId, id, location: assertLocation(location), state: validateStockTickerState(data.state) };
	records.set(id, record);
	applyStateToBlock(record);
	persist();
	return true;
}

export function getStockTickerDiagnostics() {
	return { active: records.size, failedUpdates, persistence: store.diagnostics() };
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Stock Ticker state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "stock_ticker" || typeof entry.dimensionId !== "string")
				throw new Error("Stock Ticker state contains an unknown record");
			const location = assertLocation(entry.location);
			const id = recordId(entry.dimensionId, location);
			if (entry.id !== id)
				throw new Error("Stock Ticker state has an invalid identity");
			records.set(id, { dimensionId: entry.dimensionId, id, location, state: validateStockTickerState(entry.state) });
		}
		for (const record of records.values())
			applyStateToBlock(record);
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Stock Ticker state: ${error}`);
	}
}

export function registerStockTickers() {
	if (registered)
		return false;
	registered = true;
	registerMovingBlockDataContributor(STOCK_TICKER_BLOCK, "stock_ticker", {
		capture: captureStockTickerMovingData,
		detach: detachStockTickerMovingData,
		restore: restoreStockTickerMovingData,
		schemaVersion: 1,
		validate(data) {
			if (!data || typeof data !== "object")
				throw new TypeError("Moving Stock Ticker data must contain its persistent state");
			validateStockTickerState(data.state);
		}
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (createRecord(event.block))
				persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not place Stock Ticker: ${error}`);
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (event.block?.typeId !== STOCK_TICKER_BLOCK)
			return;
		try {
			if (records.delete(recordId(event.dimension.id, event.block.location)))
				persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not remove Stock Ticker: ${error}`);
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (!isStockTicker(event.block) || event.itemStack?.typeId)
			return;
		try {
			const record = createRecord(event.block);
			if (record)
				showConfiguration(record, event.player);
		} catch (error) {
			failedUpdates++;
			event.player?.sendMessage?.(`Could not configure Stock Ticker: ${error}`);
		}
	});
	registerTickHandler(() => {
		runtimeTicks++;
		if (runtimeTicks % 10 !== 0)
			return store.tick();
		let changed = false;
		for (const record of records.values())
			changed = refreshRecord(record) || changed;
		if (changed)
			persist();
		return store.tick() || changed;
	});
	system.run(restore);
	return true;
}
