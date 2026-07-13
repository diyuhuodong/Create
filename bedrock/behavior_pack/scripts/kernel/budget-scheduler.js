export class BudgetScheduler {
	#groups = new Map();
	#onError;

	constructor({ onError } = {}) {
		if (onError !== undefined && typeof onError !== "function")
			throw new TypeError("Budget scheduler error handlers must be functions");
		this.#onError = onError;
	}

	registerGroup(name, budget) {
		if (typeof name !== "string" || name.length === 0)
			throw new TypeError("Budget scheduler groups require a name");
		if (!Number.isInteger(budget) || budget < 1)
			throw new RangeError("Budget scheduler groups require a positive integer budget");
		if (this.#groups.has(name))
			throw new Error(`Budget scheduler group ${name} already exists`);
		this.#groups.set(name, { budget, completed: 0, failed: 0, tasks: [] });
	}

	enqueue(name, task) {
		const group = this.#groups.get(name);
		if (!group)
			throw new Error(`Unknown budget scheduler group ${name}`);
		if (typeof task !== "function")
			throw new TypeError("Budget scheduler tasks must be functions");
		group.tasks.push(task);
	}

	tick() {
		const groups = {};
		for (const [name, group] of this.#groups) {
			let completed = 0;
			let failed = 0;
			for (let used = 0; used < group.budget && group.tasks.length > 0; used++) {
				const task = group.tasks.shift();
				try {
					task();
					completed++;
					group.completed++;
				} catch (error) {
					failed++;
					group.failed++;
					this.#onError?.(name, error);
				}
			}
			groups[name] = { completed, failed, pending: group.tasks.length };
		}
		return groups;
	}

	diagnostics() {
		return Object.fromEntries([...this.#groups].map(([name, group]) => [name, {
			budget: group.budget,
			completed: group.completed,
			failed: group.failed,
			pending: group.tasks.length
		}]));
	}
}
