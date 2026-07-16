import assert from "node:assert/strict";
import test from "node:test";

import { createMinecartContraptionRecord, MinecartContraptionRegistry } from "../behavior_pack/scripts/trains/minecart-contraption-state.js";

function record({ assemblyId, cartId, routeKey }) {
	return createMinecartContraptionRecord({
		anchorLocation: { x: 0, y: 65, z: 0 },
		assemblerLocation: { x: 0, y: 64, z: 0 },
		assemblyId,
		cartId,
		cartKind: "minecart",
		dimensionId: "minecraft:overworld",
		route: { key: routeKey, location: { x: 1, y: 64, z: 0 } }
	});
}

test("minecart contraptions reserve their own route and retain symmetric coupling across restore", () => {
	const registry = new MinecartContraptionRegistry();
	registry.register(record({ assemblyId: "assembly:a", cartId: "cart:a", routeKey: "track:a" }));
	assert.throws(() => registry.register(record({ assemblyId: "assembly:duplicate", cartId: "cart:duplicate", routeKey: "track:a" })), /already reserved/);
	registry.register(record({ assemblyId: "assembly:b", cartId: "cart:b", routeKey: "track:b" }));
	const coupled = registry.couple("cart:a", "cart:b");
	assert.equal(coupled.couplingId, "coupling:cart:a|cart:b");

	const restored = new MinecartContraptionRegistry();
	restored.restore(registry.snapshot());
	assert.equal(restored.get("cart:a").coupling.counterpartId, "cart:b");
	assert.equal(restored.get("cart:b").coupling.counterpartId, "cart:a");
});

test("minecart passenger bindings are exclusive and disassembly releases the coupled endpoint", () => {
	const registry = new MinecartContraptionRegistry();
	registry.register(record({ assemblyId: "assembly:a", cartId: "cart:a", routeKey: "track:a" }));
	registry.register(record({ assemblyId: "assembly:b", cartId: "cart:b", routeKey: "track:b" }));
	registry.couple("cart:a", "cart:b");
	registry.seat("cart:a", { playerId: "player:one", seatId: "seat:cart:a:player:one" });
	assert.throws(() => registry.seat("cart:b", { playerId: "player:one", seatId: "seat:cart:b:player:one" }), /already assigned/);

	registry.beginDisassembly("cart:a");
	const completed = registry.completeDisassembly("cart:a");
	assert.equal(completed.record.passengers.length, 1);
	assert.equal(completed.counterpart.coupling, undefined);
	assert.equal(registry.get("cart:a"), undefined);
	assert.equal(registry.get("cart:b").coupling, undefined);
});
