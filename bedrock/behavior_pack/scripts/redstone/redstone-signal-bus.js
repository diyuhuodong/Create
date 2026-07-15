function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Redstone signal locations require integer x, y, and z coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function assertPower(power) {
	if (!Number.isInteger(power) || power < 0 || power > 15)
		throw new RangeError("Redstone signal power must be an integer from 0 through 15");
	return power;
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

/**
 * Stable identity for a fixed redstone-controlled device. The controller type
 * is deliberately not part of the ID, so replacing a block at one position
 * cannot leave an old subscription controlling the new block.
 */
export function redstoneControlId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Redstone controls require a dimension identifier");
	const normalized = assertLocation(location);
	return `redstone-control:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function normalizeDevice(device) {
	if (!device || typeof device.type !== "string" || device.type.length === 0)
		throw new TypeError("Redstone controls require a stable type");
	if (typeof device.dimensionId !== "string" || device.dimensionId.length === 0)
		throw new TypeError("Redstone controls require a dimension identifier");
	const location = assertLocation(device.location);
	const id = device.id ?? redstoneControlId(device.dimensionId, location);
	if (id !== redstoneControlId(device.dimensionId, location))
		throw new Error("Redstone control identifiers must match their fixed location");
	return { dimensionId: device.dimensionId, id, location, type: device.type };
}

function normalizeSample(sample) {
	if (sample === undefined || sample === null || sample.available === false)
		return { available: false };
	if (typeof sample === "number")
		return { available: true, power: assertPower(sample) };
	if (sample.available !== true)
		throw new TypeError("Redstone readers must return a power or an availability record");
	return { available: true, power: assertPower(sample.power) };
}

/**
 * Bounded, deterministic input poller for fixed devices. It never scans the
 * world: callers explicitly register a persisted device on placement, then
 * provide a reader that can report one current signal sample per device.
 */
export class RedstoneSignalBus {
	#devices = new Map();
	#lastState = new Map();
	#onSignal;
	#roundRobinAfter;
	#readsPerTick;

	constructor({ onSignal = () => {}, readsPerTick = 16 } = {}) {
		if (typeof onSignal !== "function")
			throw new TypeError("Redstone signal handlers must be functions");
		if (!Number.isInteger(readsPerTick) || readsPerTick < 1)
			throw new RangeError("Redstone signal read budgets must be positive integers");
		this.#onSignal = onSignal;
		this.#readsPerTick = readsPerTick;
	}

	diagnostics() {
		return {
			controls: this.#devices.size,
			knownSignals: this.#lastState.size,
			readsPerTick: this.#readsPerTick
		};
	}

	devices() {
		return [...this.#devices.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id));
	}

	has(id) {
		return this.#devices.has(id);
	}

	register(device) {
		const normalized = normalizeDevice(device);
		const previous = this.#devices.get(normalized.id);
		if (previous && JSON.stringify(previous) === JSON.stringify(normalized))
			return false;
		this.#devices.set(normalized.id, normalized);
		this.#lastState.delete(normalized.id);
		return true;
	}

	/**
	 * Publish an event-driven sample for a registered control. Native consumer
	 * callbacks use this path; the bounded poller remains a compatibility
	 * fallback when the event has not reached a restored or unloaded device.
	 */
	publish(id, sample) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Redstone control identifiers must be non-empty strings");
		const device = this.#devices.get(id);
		if (!device)
			return false;
		return this.#publish(device, normalizeSample(sample));
	}

	restore(snapshot) {
		if (!snapshot || !Array.isArray(snapshot.devices) || (snapshot.roundRobinAfter !== undefined && typeof snapshot.roundRobinAfter !== "string"))
			throw new TypeError("Redstone signal snapshots require device records");
		const devices = new Map();
		for (const device of snapshot.devices) {
			const normalized = normalizeDevice(device);
			if (devices.has(normalized.id))
				throw new Error(`Redstone signal snapshot contains duplicate control ${normalized.id}`);
			devices.set(normalized.id, normalized);
		}
		this.#devices = devices;
		this.#lastState.clear();
		this.#roundRobinAfter = snapshot.roundRobinAfter;
	}

	snapshot() {
		return { devices: this.devices(), roundRobinAfter: this.#roundRobinAfter };
	}

	tick(readPower, { budget = this.#readsPerTick } = {}) {
		if (typeof readPower !== "function")
			throw new TypeError("Redstone signal buses require a power reader");
		if (!Number.isInteger(budget) || budget < 1)
			throw new RangeError("Redstone signal read budgets must be positive integers");
		const outcomes = [];
		for (const id of this.#orderedIds().slice(0, budget)) {
			this.#roundRobinAfter = id;
			const device = this.#devices.get(id);
			let sample;
			try {
				sample = normalizeSample(readPower(clone(device)));
			} catch (error) {
				outcomes.push({ device: clone(device), error: String(error), id, ok: false, reason: "read_failed" });
				this.#publish(device, { available: false });
				continue;
			}
			const changed = this.#publish(device, sample);
			outcomes.push({ available: sample.available, changed, id, ok: true, ...(sample.available ? { power: sample.power } : {}) });
		}
		return { outcomes, processed: outcomes.length };
	}

	unregister(id) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Redstone control identifiers must be non-empty strings");
		const removed = this.#devices.delete(id);
		this.#lastState.delete(id);
		return removed;
	}

	#orderedIds() {
		const ids = [...this.#devices.keys()].sort();
		if (!this.#roundRobinAfter || ids.length < 2)
			return ids;
		const firstAfter = ids.findIndex(id => id > this.#roundRobinAfter);
		return firstAfter === -1 ? ids : [...ids.slice(firstAfter), ...ids.slice(0, firstAfter)];
	}

	#publish(device, sample) {
		const previous = this.#lastState.get(device.id);
		const state = sample.available ? `ready:${sample.power}` : "unavailable";
		if (previous === state)
			return false;
		this.#lastState.set(device.id, state);
		this.#onSignal({ device: clone(device), ...sample });
		return true;
	}
}
