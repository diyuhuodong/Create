export const ACCEPTANCE_WORLD_STATE_SCHEMA = 1;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLayout(layout) {
	if (!layout || !Array.isArray(layout.checkpoints) || !Array.isArray(layout.zones) || !Array.isArray(layout.scenarios))
		throw new TypeError("Acceptance world state requires a generated layout");
	return layout;
}

function normalizeSnapshot(value, providerId) {
	if (value === undefined)
		return { providerId, state: "missing" };
	return { providerId, state: "captured", value: clone(value) };
}

/** A fail-closed W0→W3 checkpoint state machine independent of Script API. */
export class AcceptanceWorldState {
	#layout;
	#state;

	constructor(layout) {
		this.#layout = assertLayout(layout);
		this.reset();
	}

	checkpoint(id, snapshots = {}) {
		const checkpoint = this.#layout.checkpoints.find(entry => entry.id === id);
		if (!checkpoint)
			throw new Error(`Unknown acceptance checkpoint ${id}`);
		if (this.#state.activeCheckpoint !== checkpoint.previous)
			return { ok: false, reason: "invalid_transition", state: this.status() };
		const records = checkpoint.requiredSnapshotProviders.map(providerId => normalizeSnapshot(snapshots[providerId], providerId));
		const complete = records.every(record => record.state === "captured");
		this.#state.activeCheckpoint = id;
		this.#state.checkpoints[id] = { complete, snapshots: records };
		return { complete, ok: true, state: this.status() };
	}

	restore(snapshot) {
		if (!snapshot || snapshot.schemaVersion !== ACCEPTANCE_WORLD_STATE_SCHEMA || typeof snapshot.activeCheckpoint !== "string" || !snapshot.checkpoints || typeof snapshot.checkpoints !== "object")
			throw new TypeError("Acceptance world snapshots require schema, active checkpoint, and checkpoint records");
		if (!this.#layout.checkpoints.some(checkpoint => checkpoint.id === snapshot.activeCheckpoint))
			throw new Error("Acceptance world snapshot has an unknown active checkpoint");
		this.#state = clone(snapshot);
	}

	reset() {
		this.#state = {
			activeCheckpoint: null,
			checkpoints: {},
			schemaVersion: ACCEPTANCE_WORLD_STATE_SCHEMA
		};
		return this.status();
	}

	setup(snapshots = {}) {
		if (this.#state.activeCheckpoint !== null)
			return { ok: false, reason: "already_initialized", state: this.status() };
		return this.checkpoint("W0", snapshots);
	}

	snapshot() {
		return clone(this.#state);
	}

	status() {
		return {
			activeCheckpoint: this.#state.activeCheckpoint,
			checkpoints: clone(this.#state.checkpoints),
			scenarioCount: this.#layout.scenarios.length,
			zoneCount: this.#layout.zones.length
		};
	}
}
