export const TRAIN_RECOVERY_SCHEMA_VERSION = 1;

function sortedUnique(values, label) {
	if (!Array.isArray(values) || values.some(value => typeof value !== "string" || value.length === 0))
		throw new TypeError(`${label} must contain stable ids`);
	return [...new Set(values)].sort();
}

export function planTrainRecovery({ authorityRecords, graphRevision, occupancyByTrain = {}, portalTransfers = [], projectionTrainIds = [] }) {
	if (!Array.isArray(authorityRecords) || !Number.isInteger(graphRevision) || graphRevision < 0 || !Array.isArray(portalTransfers))
		throw new TypeError("Train recovery requires authority, graph, and Portal snapshots");
	const authorityIds = sortedUnique(authorityRecords.map(record => record?.id), "Train authority ids");
	if (authorityIds.length !== authorityRecords.length)
		throw new TypeError("Train recovery refuses duplicate authority records");
	const projectionIds = sortedUnique(projectionTrainIds, "Train projection ids");
	const activeTransfers = new Set(portalTransfers.map(record => record.trainId));
	const actions = [];
	for (const record of authorityRecords) {
		if (record.route && record.route.graphRevision !== graphRevision)
			actions.push({ reason: "graph_revision_changed", trainId: record.id, type: "freeze" });
		else if (record.route && (occupancyByTrain[record.id]?.length ?? 0) === 0)
			actions.push({ reason: "occupancy_missing", trainId: record.id, type: "freeze" });
		if (!projectionIds.includes(record.id) && !activeTransfers.has(record.id))
			actions.push({ trainId: record.id, type: "rebuild_projection" });
	}
	for (const trainId of projectionIds)
		if (!authorityIds.includes(trainId) && !activeTransfers.has(trainId))
			actions.push({ trainId, type: "remove_orphan_projection" });
	for (const transfer of portalTransfers)
		if (transfer.phase === "frozen" && transfer.resumePhase)
			actions.push({ transferId: transfer.id, type: "retry_portal" });
	return { actions, schemaVersion: TRAIN_RECOVERY_SCHEMA_VERSION };
}

export function applyTrainRecoveryPlan(plan, port) {
	if (plan?.schemaVersion !== TRAIN_RECOVERY_SCHEMA_VERSION || !Array.isArray(plan.actions))
		throw new TypeError("Invalid train recovery plan");
	for (const method of ["freeze", "rebuildProjection", "removeOrphanProjection", "retryPortal"])
		if (typeof port?.[method] !== "function")
			throw new TypeError(`Train recovery ports require ${method}()`);
	const results = [];
	for (const action of plan.actions) {
		let ok;
		if (action.type === "freeze") ok = port.freeze(action.trainId, action.reason);
		if (action.type === "rebuild_projection") ok = port.rebuildProjection(action.trainId);
		if (action.type === "remove_orphan_projection") ok = port.removeOrphanProjection(action.trainId);
		if (action.type === "retry_portal") ok = port.retryPortal(action.transferId);
		results.push({ ...action, ok: ok !== false });
	}
	return results;
}
