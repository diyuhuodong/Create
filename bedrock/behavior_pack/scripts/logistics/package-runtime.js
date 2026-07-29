import { ItemStack, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { applyVersionedConfiguration, openConfigurationFormSession, submitVersionedConfigurationForm } from "../kernel/configuration-protocol.js";
import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { PackageLedger } from "./package-ledger.js";
import { createPackageEndpoint, routePackage } from "./package-network-state.js";
import { packageItemForId } from "./package-styles.js";
import { beginTrainPackageDelivery, beginTrainPackageRetrieval, settleTrainPackageTransfer, trainPackageCargo } from "../trains/train-package-exchange.js";
import { isPostboxBlock } from "../kernel/functional-color-families.js";

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
const trainPackageMutationTicks = new Map();
let commitReady = false;
let registered = false;

function location(value) { if (![value?.x, value?.y, value?.z].every(Number.isInteger)) throw new TypeError("Package endpoint locations must be integers"); return { x: value.x, y: value.y, z: value.z }; }
function endpointId(kind, dimensionId, at) { return `${kind}:${dimensionId}:${at.x}:${at.y}:${at.z}`; }
export function packageEndpointKindForBlock(typeId) {
	if (isPostboxBlock(typeId))
		return "postbox";
	return new Map([[PACKAGER_BLOCK, "packager"], [REPACKAGER_BLOCK, "repackager"], [PACKAGE_FROGPORT_BLOCK, "frogport"], [PACKAGER_LINK_BLOCK, "packager_link"], [FACTORY_GAUGE_BLOCK, "factory_gauge"]]).get(typeId);
}
function records() {
	const snapshot = ledger.snapshot();
	return [
		{ nextId: snapshot.nextId, storageKind: "package_meta" },
		...snapshot.records.map(record => ({ record, storageKind: "package" })),
		...[...endpoints.values()].map(record => ({ ...record, storageKind: "endpoint" }))
	];
}
const store = new ShardedStateStore({
	keyPrefix: "createbedrock:package_ledger_v1",
	onCommit() { commitReady = true; },
	onError(error) { console.warn(`[Create Bedrock] Package ledger error: ${error}`); },
	partitionFor(record) {
		if (record?.storageKind === "package_meta") return "meta";
		if (record?.storageKind === "package") return `package:${record.record.id}`;
		if (record?.storageKind === "endpoint") return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.z / 16)}`;
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
	const kind = packageEndpointKindForBlock(block.typeId); if (!kind) return false;
	const at = location(block.location); const id = endpointId(kind, block.dimension.id, at);
	endpoints.set(id, createPackageEndpoint({ address: "", connected: true, dimensionId: block.dimension.id, enabled: true, id, kind, location: at }));
	persist(); return true;
}
function consumeSelectedStack(player) {
	const container = player.getComponent("minecraft:inventory")?.container; const slot = player.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0) return undefined;
	const stack = container.getItem(slot); if (!stack || stack.typeId === PACKAGE_ITEM || stack.hasTag?.("createbedrock:package")) return undefined;
	container.setItem(slot, undefined); return stack;
}
function pack(player, endpoint) {
	const stack = consumeSelectedStack(player); if (!stack) return false;
	const packageRecord = ledger.create({ address: endpoint.address, contents: [{ count: stack.amount, tags: stack.getTags?.() ?? [], typeId: stack.typeId }], owner: { id: endpoint.id, kind: "port" } });
	spawnProjection(packageRecord, endpoint); persist(); player.sendMessage?.(`Packed ${stack.amount} ${stack.typeId}.`); return true;
}
function givePackageItem(player, packageRecord) {
	const container = player.getComponent("minecraft:inventory")?.container; const slot = player.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || container.getItem(slot)) return false;
	const item = new ItemStack(packageItemForId(packageRecord.id), 1); item.setDynamicProperty(PACKAGE_ITEM_PROPERTY, packageRecord.id); container.setItem(slot, item); return true;
}
function unpack(player, endpoint) {
	const packageRecord = ledger.snapshot().records.find(record => record.owner.kind === "port" && record.owner.id === endpoint.id && !record.transfer);
	if (!packageRecord || !givePackageItem(player, packageRecord)) return false;
	player.sendMessage?.(`Retrieved package ${packageRecord.id}.`); return true;
}
function configureEndpoint(endpoint, player) {
	const session = openConfigurationFormSession({ revision: endpoint.revision, subjectId: endpoint.id });
	new ModalFormData()
		.title(endpoint.kind)
		.textField("Package address", "Brass", { defaultValue: endpoint.address })
		.textField("Allowed item ids (comma separated)", "minecraft:iron_ingot", { defaultValue: endpoint.filter.typeIds.join(",") })
		.textField("Allowed item tags (comma separated)", "create:plates", { defaultValue: endpoint.filter.tags.join(",") })
		.toggle("Deny matching contents", { defaultValue: endpoint.filter.mode === "deny" })
		.toggle("Endpoint enabled", { defaultValue: endpoint.enabled })
		.textField("Package capacity (1-64)", "8", { defaultValue: String(endpoint.capacity) })
		.submitButton("Save").show(player).then(response => {
		if (response.canceled) return;
		const values = response.formValues ?? [];
		const address = String(values[0] ?? "").trim();
		const commaList = value => [...new Set(String(value ?? "").split(",").map(entry => entry.trim()).filter(Boolean))];
		const result = submitVersionedConfigurationForm({
			actualRevision: () => endpoints.get(endpoint.id)?.revision ?? endpoint.revision,
			session,
			submit(expectedRevision) {
				const current = endpoints.get(endpoint.id);
				if (!current)
					return { changed: false, conflict: true };
				const update = applyVersionedConfiguration({
					apply: record => ({
						...record,
						address,
						capacity: Number(values[5]),
						enabled: values[4] === true,
						filter: {
							mode: values[3] === true ? "deny" : "allow",
							packages: address ? [address] : [],
							tags: commaList(values[2]),
							typeIds: commaList(values[1])
						}
					}),
					current,
					expectedRevision,
					validate: createPackageEndpoint
				});
				if (update.changed) {
					endpoints.set(endpoint.id, update.state);
					persist();
				}
				return update;
			}
		});
		if (result.conflict)
			player.sendMessage?.("Package endpoint changed while the form was open; reopen it and try again.");
	}).catch(error => player.sendMessage?.(`Could not configure endpoint: ${error}`));
}

function endpointOccupancy({ includeTransfers = true } = {}) {
	const counts = new Map();
	for (const record of ledger.snapshot().records) {
		const id = record.transfer && includeTransfers ? record.transfer.to.id : record.owner.kind === "port" ? record.owner.id : undefined;
		if (id)
			counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return counts;
}

function routePackages() {
	let changed = false;
	const occupied = endpointOccupancy();
	for (const packageRecord of ledger.snapshot().records) {
		if (packageRecord.transfer || packageRecord.owner.kind !== "port") continue;
		const endpoint = routePackage({ endpoints: [...endpoints.values()].map(candidate => ({ ...candidate, occupied: occupied.get(candidate.id) ?? 0 })), packageRecord });
		if (!endpoint) continue;
		const result = ledger.beginTransfer(packageRecord.id, { expectedRevision: packageRecord.revision, receiptId: `route:${packageRecord.id}:${packageRecord.revision}`, to: { id: endpoint.id, kind: "port" } });
		if (result.ok && !result.replay)
			occupied.set(endpoint.id, (occupied.get(endpoint.id) ?? 0) + 1);
		changed = result.ok || changed;
	}
	if (changed) persist();
}
function completeCommittedTransfers() {
	if (!commitReady) return;
	commitReady = false; let changed = false;
	const occupied = endpointOccupancy({ includeTransfers: false });
	for (const record of ledger.snapshot().records) {
		if (!record.transfer) continue;
		const result = settleTrainPackageTransfer(ledger, record, endpoints.values());
		if (result.changed) {
			if (result.target) {
				occupied.set(result.target.id, (occupied.get(result.target.id) ?? 0) + 1);
				spawnProjection(result.record, result.target);
			}
			for (const owner of [record.transfer.from, record.transfer.to])
				if (owner.kind === "projection" && owner.id.startsWith("train:"))
					trainPackageMutationTicks.set(owner.id.slice("train:".length), system.currentTick);
			changed = true;
		}
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
		const meta = restored.records.find(record => record.storageKind === "package_meta" || record.kind === "package_meta");
		const packageRecords = restored.records.filter(record => record.storageKind === "package" || record.kind === "package").map(record => record.record);
		ledger.restore({ nextId: meta?.nextId ?? 1, records: packageRecords });
		for (const record of restored.records.filter(record => record.storageKind === "endpoint" || record.kind === "endpoint"))
			endpoints.set(record.id, createPackageEndpoint({ ...record, location: location(record.location) }));
		commitReady = packageRecords.some(record => record.transfer);
	} catch (error) { console.warn(`[Create Bedrock] Could not restore packages: ${error}`); }
}
export function registerPackages() {
	if (registered) return false; registered = true;
	world.afterEvents.playerPlaceBlock.subscribe(event => { try { addEndpoint(event.block); } catch {} });
	world.afterEvents.playerBreakBlock.subscribe(event => { for (const [id, endpoint] of endpoints) if (endpoint.dimensionId === event.dimension.id && endpoint.location.x === event.block.location.x && endpoint.location.y === event.block.location.y && endpoint.location.z === event.block.location.z) { endpoints.delete(id); persist(); } });
	world.afterEvents.playerInteractWithBlock.subscribe(event => { const endpoint = endpoints.get(endpointId(packageEndpointKindForBlock(event.block?.typeId), event.block?.dimension?.id, event.block?.location ?? {})); if (!endpoint) return; if (event.player.isSneaking) { configureEndpoint(endpoint, event.player); return; } if (endpoint.kind === "packager" || endpoint.kind === "repackager") { if (!pack(event.player, endpoint)) unpack(event.player, endpoint); } });
	registerTickHandler(tick); system.run(restore); return true;
}
export function getPackageDiagnostics() { return { endpoints: endpoints.size, packages: ledger.snapshot().records.length, storage: store.diagnostics() }; }

function scheduleEndpoints(dimensionId) {
	return [...endpoints.values()].filter(endpoint => endpoint.dimensionId === dimensionId && endpoint.enabled && endpoint.connected);
}

export function deliverTrainPackages(trainId, dimensionId, address = "") {
	const result = beginTrainPackageDelivery({ address, endpoints: scheduleEndpoints(dimensionId), ledger, trainId });
	if (result.changed) {
		trainPackageMutationTicks.set(trainId, system.currentTick);
		persist();
	}
	return result.complete;
}

export function retrieveTrainPackages(trainId, dimensionId, address = "") {
	const result = beginTrainPackageRetrieval({ address, endpoints: scheduleEndpoints(dimensionId), ledger, trainId });
	if (result.changed) {
		trainPackageMutationTicks.set(trainId, system.currentTick);
		persist();
	}
	return result.complete;
}

export function getTrainPackageCargoState(trainId) {
	const packages = trainPackageCargo(ledger, trainId);
	const itemCounts = {};
	for (const record of packages)
		for (const stack of record.contents)
			itemCounts[stack.typeId] = (itemCounts[stack.typeId] ?? 0) + stack.count;
	return {
		empty: packages.length === 0,
		idleTicks: Math.max(0, system.currentTick - (trainPackageMutationTicks.get(trainId) ?? system.currentTick)),
		itemCounts,
		packages: packages.length
	};
}

export function getPackageDisplayState(dimensionId, location) {
	const endpoint = [...endpoints.values()].find(candidate => candidate.dimensionId === dimensionId
		&& candidate.location.x === location.x && candidate.location.y === location.y && candidate.location.z === location.z);
	if (!endpoint)
		return undefined;
	const packages = ledger.snapshot().records.filter(record => record.owner.kind === "port" && record.owner.id === endpoint.id);
	return { address: endpoint.address, capacity: endpoint.capacity, count: packages.length, enabled: endpoint.enabled };
}
