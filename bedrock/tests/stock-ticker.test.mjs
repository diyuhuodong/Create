import assert from "node:assert/strict";
import test from "node:test";

import {
	beginStockTickerRequest,
	configureStockTicker,
	createStockTickerState,
	stockTickerStatusLevel,
	updateStockTickerRequest
} from "../behavior_pack/scripts/materials/stock-ticker.js";

test("Stock Ticker persists addressed request settings and tracks one durable Depot request nonce", () => {
	const initial = createStockTickerState();
	const configured = configureStockTicker({
		expectedRevision: 0,
		patch: {
			allowPartial: true,
			categories: ["minecraft:iron_ingot", "minecraft:gold_ingot"],
			networkId: "factory",
			requestedItem: "minecraft:iron_ingot",
			requestAmount: 256,
			targetAddress: "Assembly Line"
		},
		state: initial
	});
	assert.equal(configured.changed, true);
	const started = beginStockTickerRequest(configured.state, { available: 384 });
	assert.equal(started.changed, true);
	assert.equal(started.nonce, 1);
	assert.equal(started.state.requestStatus, "pending");
	const fulfilled = updateStockTickerRequest(started.state, { available: 128, nonce: 1, status: "fulfilled" });
	assert.equal(fulfilled.requestStatus, "fulfilled");
	assert.equal(stockTickerStatusLevel(fulfilled.requestStatus), 2);
});

test("Stock Ticker rejects stale configuration and mismatched durable request updates", () => {
	const state = createStockTickerState({ requestedItem: "minecraft:iron_ingot" });
	assert.equal(configureStockTicker({ expectedRevision: 1, patch: { requestAmount: 1 }, state }).conflict, true);
	const started = beginStockTickerRequest(state, { available: 1 });
	assert.throws(() => updateStockTickerRequest(started.state, { available: 0, nonce: 2, status: "failed" }), /active nonce/);
});
