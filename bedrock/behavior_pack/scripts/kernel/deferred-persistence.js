export class DeferredPersistence {
	#dirty = false;
	#failures = 0;
	#intervalTicks;
	#lastError;
	#name;
	#onError;
	#ticksSinceWrite = 0;
	#write;
	#writes = 0;

	constructor({ intervalTicks = 20, name, onError, write }) {
		if (!Number.isInteger(intervalTicks) || intervalTicks < 1)
			throw new RangeError("Persistence intervals must be positive integers");
		if (typeof name !== "string" || name.length === 0)
			throw new TypeError("Persistent state requires a diagnostic name");
		if (typeof write !== "function")
			throw new TypeError("Persistent state requires a write function");
		if (onError !== undefined && typeof onError !== "function")
			throw new TypeError("Persistent state error handlers must be functions");

		this.#intervalTicks = intervalTicks;
		this.#name = name;
		this.#onError = onError ?? (() => {});
		this.#write = write;
	}

	request() {
		this.#dirty = true;
	}

	tick() {
		if (!this.#dirty)
			return false;

		this.#ticksSinceWrite++;
		if (this.#ticksSinceWrite < this.#intervalTicks)
			return false;

		return this.flush();
	}

	flush() {
		if (!this.#dirty)
			return false;

		this.#ticksSinceWrite = 0;
		try {
			this.#write();
			this.#dirty = false;
			this.#lastError = undefined;
			this.#writes++;
			return true;
		} catch (error) {
			this.#failures++;
			this.#lastError = String(error);
			this.#onError(error, this.#name);
			return false;
		}
	}

	diagnostics() {
		return {
			dirty: this.#dirty,
			failures: this.#failures,
			lastError: this.#lastError,
			name: this.#name,
			ticksUntilWrite: this.#dirty ? Math.max(0, this.#intervalTicks - this.#ticksSinceWrite) : undefined,
			writes: this.#writes
		};
	}
}
