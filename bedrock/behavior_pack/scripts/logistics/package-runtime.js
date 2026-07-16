import { ItemStack, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { PackageLedger } from "./package-ledger.js";
import { routePackage } from "./package-network-state.js";

export const FACTORY_GAUGE_BLOCK = "createbedrock:factory_gauge";
export const PACKAGE_ENTITY = "createbedrock:package";
export const PACKAGE_FROGPORT_BLOCK = "createbedrock:package_frogport";
export const PACKAGE_ITEM = "createbedrock:package";
export const PACKAGER_BLOCK = "createbedrock:packager";
export const PACKAGER_LINK_BLOCK = "createbedrock:packager_link";
export const POSTBOX_BLOCK = "createbedrock:package_postbox";
export const REPACKAGER_BLOCK = "createbedrock:repackager";

const PACKAGE_ID_PROPERTY = "createbedrock:package_id";
const PACKAGE_ITEM_PROPERTY = "createbedrock:package_id";
const endpoints = new Map();
const ledger = new PackageLedger();
let commitReady = false;
let registered = false;

function location(value) { if (![value?.x, value?.y, value?.z].every(Number.isInteger)) throw new TypeError("Package endpoint locations must be integers"); return { x: value.x, y: value.y, z: value.z }; }
function endpointId(kind, dimensionId, at) { return `${kind}:${dimensionId}:${at.x}:${at.y}:${at.z}`; }
function endpointKind(typeId) {
	return new Map([[PACKAGER_BLOCK, "packager"], [REPACKAGER_BLOCK, "repackager"], [PACKAGE_FROGPORT_BLOCK, "frogport"], [POSTBOX_BLOCK, "postbox"], [PACKAGER_LINK_BLOCK, "packager_link"], [FACTORY_GAUGE_BLOCK, "factory_gauge"]]).get(typeId);
}
function records() {
	const snapshot = ledger.snapshot();
	return [
		{ kind: "package_meta", nextId: snapshot.nextId },
		...snapshot.records.map(record => ({ kind: "package", record })),
		...[...endpoints.values()].map(record => ({ kind: "endpoint", ...record }))
	];
}
const store = new ShardedStateStore({
	keyPrefix: "createbedrock:package_ledger_v1",
	onCommit() { commitReady = true; },
	onError(error) { console.warn(`[Create Bedrock] Package ledger error: ${error}`); },
	partitionFor(record) {
		if (record?.kind === "package_meta") return "meta";
		if (record?.kind === "package") return `package:${record.record.id}`;
		if (record?.kind === "endpoint") return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.z / 16)}`;
		throw new TypeError("Unknown package ledger record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});
function persist() { try { store.request(records()); } catch (error) { console.warn(`[Create Bedrock] Could not persist packages: ${error}`); } }
function spawnProjection(packageRecord, endpoint) {
	try {
		const entity = world.getDimension(endpoint.dimensionId).spawnEntity(PACKAGE_ENTITY, { x: endpoint.location.x + .5, y: endpoint.location.y + 1, z: endpoint.location.z + .5 });
		entity.setDynamicProperty(PACKAGE_ID_PROPERTY, packageRecord.id);
	} catch {}
}
function addEndpoint(block) {
	const kind = endpointKind(block.typeId); if (!kind) return false;
	const at = location(block.location); const id = endpointId(kind, block.dimension.id, at);
	endpoints.set(id, { address: "", dimensionId: block.dimension.id, enabled: true, id, kind, location: at });
	persist(); return true;
}
function consumeSelectedStack(player) {
	const container = player.getComponent("minecraft:inventory")?.container; const slot = player.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0) return undefined;
	const stack = container.getItem(slot); if (!stack || stack.typeId === PACKAGE_ITEM) return undefined;
	container.setItem(slot, undefined); return stack;
}
function pack(player, endpoint) {
	const stack = consumeSelectedStack(player); if (!stack) return false;
	const packageRecord = ledger.create({ address: endpoint.address, contents: [{ count: stack.amount, typeId: stack.typeId }], owner: { id: endpoint.id, kind: "port" } });
	spawnProjection(packageRecord, endpoint); persist(); player.sendMessage?.(`Packed ${stack.amount} ${stack.typeId}.`); return true;
}
function givePackageItem(player, packageRecord) {
	const container = player.getComponent("minecraft:inventory")?.container; const slot = player.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || container.getItem(slot)) return false;
	const item = new ItemStack(PACKAGE_ITEM, 1); item.setDynamicProperty(PACKAGE_ITEM_PROPERTY, packageRecord.id); container.setItem(slot, item); return true;
}
function unpack(player, endpoint) {
	const packageRecord = ledger.snapshot().records.find(record => record.owner.kind === "port" && record.owner.id === endpoint.id && !record.transfer);
	if (!packageRecord || !givePackageItem(player, packageRecord)) return false;
	player.sendMessage?.(`Retrieved package ${packageRecord.id}.`); return true;
}
function configureEndpoint(endpoint, player) {
	new ModalFormData().title(endpoint.kind).textField("Package address", "Brass", { defaultValue: endpoint.address }).toggle("Endpoint enabled", { defaultValue: endpoint.enabled }).submitButton("Save").show(player).then(response => {
		if (response.canceled) return;
		const address = String(response.formValues?.[0] ?? "").trim(); if (address.length > 64) throw new RangeError("Package addresses must be at most 64 characters");
		endpoint.address = address; endpoint.enabled = response.formValues?.[1] === true; persist();
	}).catch(error => player.sendMessage?.(`Could not configure endpoint: ${error}`));
}
function routePackages() {
	let changed = false;
	for (const packageRecord of ledger.snapshot().records) {
		if (packageRecord.transfer || packageRecord.owner.kind !== "port") continue;
		const endpoint = routePackage({ endpoints: [...endpoints.values()], packageRecord });
		if (!endpoint) continue;
		const result = ledger.beginTransfer(packageRecord.id, { expectedRevision: packageRecord.revision, receiptId: `route:${packageRecord.id}:${packageRecord.revision}`, to: { id: endpoint.id, kind: "port" } });
		changed = result.ok || changed;
	}
	if (changed) persist();
}
function completeCommittedTransfers() {
	if (!commitReady) return;
	commitReady = false; let changed = false;
	for (const record of ledger.snapshot().records) {
		if (!record.transfer) continue;
		const result = ledger.completeTransfer(record.id, { receiptId: record.transfer.receiptId });
		if (result.ok && !result.replay) { const target = endpoints.get(result.record.owner.id); if (target) spawnProjection(result.record, target); changed = true; }
	}
	if (changed) persist();
}
function updateFactoryGauges() {
	for (const endpoint of endpoints.values()) {
		if (endpoint.kind !== "factory_gauge") continue;
		const count = ledger.snapshot().records.filter(record => record.address === endpoint.address && record.owner.kind === "port").length;
		try { const block = world.getDimension(endpoint.dimensionId).getBlock(endpoint.location); if (block?.permutation?.getAllStates?.()["createbedrock:signal"] !== undefined) block.setPermutation(block.permutation.withState("createbedrock:signal", Math.min(15, count))); } catch {}
	}
}
function tick() { completeCommittedTransfers(); routePackages(); updateFactoryGauges(); store.tick(); }
function restore() {
	try {
		const restored = store.read(); if (!restored) return;
		const meta = restored.records.find(record => record.kind === "package_meta"); const packageRecords = restored.records.filter(record => record.kind === "package").map(record => record.record);
		ledger.restore({ nextId: meta?.nextId ?? 1, records: packageRecords });
		for (const record of restored.records.filter(record => record.kind === "endpoint")) endpoints.set(record.id, { ...record, location: location(record.location) });
	} catch (error) { console.warn(`[Create Bedrock] Could not restore packages: ${error}`); }
}
export function registerPackages() {
	if (registered) return false; registered = true;
	world.afterEvents.playerPlaceBlock.subscribe(event => { try { addEndpoint(event.block); } catch {} });
	world.afterEvents.playerBreakBlock.subscribe(event => { for (const [id, endpoint] of endpoints) if (endpoint.dimensionId === event.dimension.id && endpoint.location.x === event.block.location.x && endpoint.location.y === event.block.location.y && endpoint.location.z === event.block.location.z) { endpoints.delete(id); persist(); } });
	world.afterEvents.playerInteractWithBlock.subscribe(event => { const endpoint = endpoints.get(endpointId(endpointKind(event.block?.typeId), event.block?.dimension?.id, event.block?.location ?? {})); if (!endpoint) return; if (event.player.isSneaking) { configureEndpoint(endpoint, event.player); return; } if (endpoint.kind === "packager" || endpoint.kind === "repackager") { if (!pack(event.player, endpoint)) unpack(event.player, endpoint); } });
	registerTickHandler(tick); system.run(restore); return true;
}
export function getPackageDiagnostics() { return { endpoints: endpoints.size, packages: ledger.snapshot().records.length, storage: store.diagnostics() }; }
