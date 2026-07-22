export const TRAIN_OCCUPANCY_SCHEMA_VERSION = 1;

function normalizeClaim(value) {
	if (!value || typeof value.edgeId !== "string" || value.edgeId.length === 0 || !Number.isFinite(value.start) || !Number.isFinite(value.end) || value.start < 0 || value.end <= value.start)
		throw new TypeError("Train occupancy claims require an edge and ordered positive interval");
	return { edgeId: value.edgeId, end: value.end, start: value.start };
}

function overlaps(left, right, clearance) {
	return left.start < right.end + clearance && right.start < left.end + clearance;
}

export class TrainOccupancyAuthority {
	#claims = new Map();
	#graphRevision;
	#tokens = new Map();

	constructor({ graphRevision = 0 } = {}) {
		if (!Number.isInteger(graphRevision) || graphRevision < 0)
			throw new TypeError("Train occupancy graph revisions must be non-negative integers");
		this.#graphRevision = graphRevision;
	}

	replace(trainId, claims, { clearance = .25, graphRevision = this.#graphRevision, tokenId = `${trainId}:${graphRevision}` } = {}) {
		if (typeof trainId !== "string" || trainId.length === 0 || !Array.isArray(claims) || !Number.isFinite(clearance) || clearance < 0)
			throw new TypeError("Train occupancy replacement requires train id, claims, and non-negative clearance");
		if (graphRevision !== this.#graphRevision)
			return { ok: false, reason: "graph_revision_changed" };
		const normalized = claims.map(normalizeClaim);
		for (const [owner, existing] of this.#claims) {
			if (owner === trainId)
				continue;
			if (normalized.some(candidate => existing.some(claim => claim.edgeId === candidate.edgeId && overlaps(claim, candidate, clearance))))
				return { ok: false, reason: "occupied" };
		}
		this.#claims.set(trainId, normalized);
		this.#tokens.set(trainId, { graphRevision, tokenId });
		return { ok: true, token: { graphRevision, tokenId } };
	}

	release(trainId) {
		this.#tokens.delete(trainId);
		return this.#claims.delete(trainId);
	}

	claimsFor(trainId) {
		return (this.#claims.get(trainId) ?? []).map(claim => ({ ...claim }));
	}

	claimsOnEdge(edgeId) {
		return [...this.#claims.entries()].flatMap(([trainId, claims]) => claims.filter(claim => claim.edgeId === edgeId).map(claim => ({ ...claim, trainId })));
	}

	setGraphRevision(revision) {
		if (!Number.isInteger(revision) || revision < 0)
			throw new TypeError("Train occupancy graph revisions must be non-negative integers");
		if (revision === this.#graphRevision)
			return false;
		this.#graphRevision = revision;
		this.#claims.clear();
		this.#tokens.clear();
		return true;
	}

	snapshot() {
		return {
			claims: [...this.#claims.entries()].map(([trainId, claims]) => ({ claims: claims.map(claim => ({ ...claim })), token: { ...this.#tokens.get(trainId) }, trainId })).sort((left, right) => left.trainId.localeCompare(right.trainId)),
			graphRevision: this.#graphRevision,
			schemaVersion: TRAIN_OCCUPANCY_SCHEMA_VERSION
		};
	}

	restore(value) {
		if (value?.schemaVersion !== TRAIN_OCCUPANCY_SCHEMA_VERSION || !Number.isInteger(value.graphRevision) || !Array.isArray(value.claims))
			throw new TypeError("Invalid train occupancy snapshot");
		const restored = new TrainOccupancyAuthority({ graphRevision: value.graphRevision });
		for (const record of value.claims) {
			const result = restored.replace(record.trainId, record.claims, { graphRevision: record.token?.graphRevision, tokenId: record.token?.tokenId });
			if (!result.ok)
				throw new Error(`Conflicting restored train occupancy for ${record.trainId}`);
		}
		this.#claims = restored.#claims;
		this.#graphRevision = restored.#graphRevision;
		this.#tokens = restored.#tokens;
	}
}
