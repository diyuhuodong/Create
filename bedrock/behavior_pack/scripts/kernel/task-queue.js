export class TaskQueue {
	#tasks = [];

	enqueue(task) {
		if (typeof task !== "function")
			throw new TypeError("Kernel tasks must be functions");

		this.#tasks.push(task);
	}

	drain(budget) {
		let completed = 0;

		while (completed < budget && this.#tasks.length > 0) {
			const task = this.#tasks.shift();
			task();
			completed++;
		}

		return completed;
	}

	get size() {
		return this.#tasks.length;
	}
}
