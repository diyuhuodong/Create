import assert from "node:assert/strict";
import test from "node:test";

import { dispatchNativeRedstoneUpdate, nativeRedstoneEventHandlerCountForTesting, registerNativeRedstoneEventHandler } from "../behavior_pack/scripts/redstone/redstone-native-events.js";

function block(typeId = "createbedrock:clutch") {
	return {
		dimension: { id: "minecraft:overworld" },
		location: { x: 1, y: 64, z: 2 },
		typeId
	};
}

test("native redstone dispatch validates the stable 0..15 power contract and reports handled events", () => {
	const before = nativeRedstoneEventHandlerCountForTesting();
	const received = [];
	const unregister = registerNativeRedstoneEventHandler(event => {
		received.push({ powerLevel: event.powerLevel, typeId: event.block.typeId });
		return true;
	});
	assert.equal(dispatchNativeRedstoneUpdate({ block: block(), powerLevel: 9 }), true);
	assert.deepEqual(received, [{ powerLevel: 9, typeId: "createbedrock:clutch" }]);
	assert.throws(() => dispatchNativeRedstoneUpdate({ block: block(), powerLevel: 16 }), /0 through 15/);
	assert.throws(() => dispatchNativeRedstoneUpdate({ block: { typeId: "createbedrock:clutch" }, powerLevel: 0 }), /dimension and location/);
	unregister();
	assert.equal(nativeRedstoneEventHandlerCountForTesting(), before);
});
