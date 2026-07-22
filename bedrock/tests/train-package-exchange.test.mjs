import assert from "node:assert/strict";
import test from "node:test";

import { PackageLedger } from "../behavior_pack/scripts/logistics/package-ledger.js";
import { createPackageEndpoint } from "../behavior_pack/scripts/logistics/package-network-state.js";
import { beginTrainPackageDelivery, beginTrainPackageRetrieval, settleTrainPackageTransfer, trainPackageCargo, trainPackageOwner } from "../behavior_pack/scripts/trains/train-package-exchange.js";

function endpoint(capacity = 1) {
	return createPackageEndpoint({ address: "Factory", capacity, connected: true, dimensionId: "overworld", enabled: true, id: "postbox:factory", kind: "postbox", location: { x: 0, y: 64, z: 0 } });
}

test("train package delivery waits on a full endpoint and commits through escrow exactly once", () => {
	const ledger = new PackageLedger();
	const trainPackage = ledger.create({ address: "Factory", contents: [{ count: 1, typeId: "minecraft:iron_ingot" }], owner: trainPackageOwner("one") });
	ledger.create({ address: "Factory", contents: [{ count: 1, typeId: "minecraft:copper_ingot" }], owner: { id: endpoint().id, kind: "port" } });
	assert.equal(beginTrainPackageDelivery({ address: "Factory", endpoints: [endpoint()], ledger, trainId: "one" }).reason, "destination_full_or_unavailable");
	const larger = endpoint(2);
	const begun = beginTrainPackageDelivery({ address: "Factory", endpoints: [larger], ledger, trainId: "one" });
	assert.equal(begun.changed, true);
	assert.equal(beginTrainPackageDelivery({ address: "Factory", endpoints: [larger], ledger, trainId: "one" }).reason, "commit_pending");
	assert.equal(settleTrainPackageTransfer(ledger, ledger.get(trainPackage.id), [larger]).complete, true);
	assert.equal(trainPackageCargo(ledger, "one").length, 0);
});

test("train package retrieval moves endpoint cargo into authoritative train ownership", () => {
	const ledger = new PackageLedger();
	const record = ledger.create({ address: "Factory", contents: [{ count: 2, typeId: "minecraft:brass_ingot" }], owner: { id: endpoint().id, kind: "port" } });
	assert.equal(beginTrainPackageRetrieval({ address: "Factory", endpoints: [endpoint()], ledger, trainId: "one" }).changed, true);
	assert.equal(settleTrainPackageTransfer(ledger, ledger.get(record.id), [endpoint()]).complete, true);
	assert.equal(trainPackageCargo(ledger, "one")[0].owner.id, "train:one");
});
