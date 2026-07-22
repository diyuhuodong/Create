import { packageEndpointAccepts } from "../logistics/package-network-state.js";

export const MAX_TRAIN_PACKAGES = 9;

export function trainPackageOwner(trainId) {
	if (typeof trainId !== "string" || trainId.length === 0)
		throw new TypeError("Train package ownership requires a train id");
	return { id: `train:${trainId}`, kind: "projection" };
}

function matchesAddress(record, address) {
	return address === "" || record.address === address;
}

function records(ledger) {
	if (typeof ledger?.snapshot !== "function")
		throw new TypeError("Train package exchange requires a PackageLedger");
	return ledger.snapshot().records;
}

export function trainPackageCargo(ledger, trainId) {
	const owner = trainPackageOwner(trainId);
	return records(ledger).filter(record => record.owner.kind === owner.kind && record.owner.id === owner.id
		|| record.transfer?.from.kind === owner.kind && record.transfer.from.id === owner.id);
}

export function beginTrainPackageDelivery({ address = "", endpoints, ledger, trainId }) {
	const owner = trainPackageOwner(trainId);
	const snapshot = records(ledger);
	if (snapshot.some(record => record.transfer?.from.id === owner.id))
		return { changed: false, complete: false, reason: "commit_pending" };
	const cargo = snapshot.filter(record => record.owner.id === owner.id && matchesAddress(record, address));
	if (cargo.length === 0)
		return { changed: false, complete: true };
	const occupied = new Map();
	for (const record of snapshot) {
		const endpointId = record.transfer?.to.kind === "port" ? record.transfer.to.id : record.owner.kind === "port" ? record.owner.id : undefined;
		if (endpointId)
			occupied.set(endpointId, (occupied.get(endpointId) ?? 0) + 1);
	}
	const candidates = [...endpoints].filter(endpoint => matchesAddress(cargo[0], endpoint.address)
		&& packageEndpointAccepts(endpoint, cargo[0], { occupied: occupied.get(endpoint.id) ?? 0 }))
		.sort((left, right) => left.id.localeCompare(right.id));
	if (candidates.length === 0)
		return { changed: false, complete: false, reason: "destination_full_or_unavailable" };
	const record = cargo[0];
	const target = candidates[0];
	const receiptId = `train-deliver:${record.id}:${record.revision}:${target.id}`;
	const result = ledger.beginTransfer(record.id, { expectedRevision: record.revision, receiptId, to: { id: target.id, kind: "port" } });
	return result.ok ? { changed: !result.replay, complete: false, record: result.record } : { changed: false, complete: false, reason: result.reason };
}

export function beginTrainPackageRetrieval({ address = "", endpoints, ledger, trainId }) {
	const owner = trainPackageOwner(trainId);
	const snapshot = records(ledger);
	if (snapshot.some(record => record.transfer?.to.id === owner.id))
		return { changed: false, complete: false, reason: "commit_pending" };
	const cargo = trainPackageCargo(ledger, trainId);
	if (cargo.length >= MAX_TRAIN_PACKAGES)
		return { changed: false, complete: false, reason: "train_full" };
	const endpointIds = new Set([...endpoints].map(endpoint => endpoint.id));
	const record = snapshot.filter(candidate => candidate.owner.kind === "port" && endpointIds.has(candidate.owner.id) && matchesAddress(candidate, address) && !candidate.transfer)
		.sort((left, right) => left.id.localeCompare(right.id))[0];
	if (!record)
		return { changed: false, complete: true };
	const receiptId = `train-retrieve:${record.id}:${record.revision}:${owner.id}`;
	const result = ledger.beginTransfer(record.id, { expectedRevision: record.revision, receiptId, to: owner });
	return result.ok ? { changed: !result.replay, complete: false, record: result.record } : { changed: false, complete: false, reason: result.reason };
}

export function settleTrainPackageTransfer(ledger, record, endpoints) {
	if (!record?.transfer)
		return { changed: false, complete: true };
	if (record.transfer.to.kind === "projection") {
		const result = ledger.completeTransfer(record.id, { receiptId: record.transfer.receiptId });
		return { changed: result.ok && !result.replay, complete: result.ok, record: result.record };
	}
	const target = [...endpoints].find(endpoint => endpoint.id === record.transfer.to.id);
	const occupied = records(ledger).filter(candidate => candidate.owner.kind === "port" && candidate.owner.id === target?.id).length;
	if (!target || !packageEndpointAccepts(target, record, { occupied })) {
		const result = ledger.abortTransfer(record.id, { receiptId: record.transfer.receiptId });
		return { changed: result.ok && !result.replay, complete: false, reason: "destination_full_or_unavailable", record: result.record };
	}
	const result = ledger.completeTransfer(record.id, { receiptId: record.transfer.receiptId });
	return { changed: result.ok && !result.replay, complete: result.ok, record: result.record, target };
}
