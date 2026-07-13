function cloneOutputs(outputs) {
	return outputs.map(output => ({ ...output }));
}

function cloneStack(stack) {
	if (!stack || typeof stack.typeId !== "string" || stack.typeId.length === 0 || !Number.isInteger(stack.count) || stack.count < 1)
		throw new TypeError("Machine inputs require a type identifier and positive count");
	return { typeId: stack.typeId, count: stack.count };
}

export class MachineProcessor {
	#recipes;
	#active;

	constructor(recipes) {
		if (!Array.isArray(recipes))
			throw new TypeError("Machine recipes must be an array");

		this.#recipes = new Map(recipes.map(recipe => [recipe.id, recipe]));
		this.#active = undefined;
	}

	acceptsInput(input) {
		return [...this.#recipes.values()].some(candidate => candidate.input.typeId === input?.typeId);
	}

	start(input, { random = Math.random } = {}) {
		if (this.#active)
			return false;
		if (typeof random !== "function")
			throw new TypeError("Machine recipe random sources must be functions");

		const recipe = [...this.#recipes.values()].find(candidate =>
			candidate.input.typeId === input?.typeId && candidate.input.count <= (input.count ?? 0));
		if (!recipe)
			return false;

		this.#active = {
			input: cloneStack(recipe.input),
			outputs: cloneOutputs(recipe.outputs.filter(output => random() <= output.chance)),
			progress: 0,
			recipeId: recipe.id
		};
		return { consumed: { ...recipe.input }, recipeId: recipe.id };
	}

	tick({ powered, workUnits = 1 } = {}) {
		if (!this.#active || !powered)
			return undefined;
		if (!Number.isFinite(workUnits) || workUnits <= 0)
			throw new RangeError("Machine work units must be positive");

		const recipe = this.#recipes.get(this.#active.recipeId);
		this.#active.progress += workUnits;
		if (this.#active.progress < recipe.processingTicks)
			return { completed: false, progress: this.#active.progress, recipeId: recipe.id };

		const completed = this.#active;
		this.#active = undefined;
		return {
			completed: true,
			outputs: cloneOutputs(completed.outputs),
			recipeId: recipe.id
		};
	}

	snapshot() {
		return this.#active ? { ...this.#active } : undefined;
	}

	restore(active) {
		if (active === undefined) {
			this.#active = undefined;
			return;
		}
		if (!this.#recipes.has(active?.recipeId) || !Number.isFinite(active.progress) || active.progress < 0)
			throw new TypeError("Invalid machine processor snapshot");
		const recipe = this.#recipes.get(active.recipeId);
		this.#active = {
			// Version-1 machine snapshots did not persist in-process items or
			// chance decisions. The recipe input was already removed from the
			// player in that version, so retain it as the recovered escrow and only
			// preserve guaranteed outputs rather than rolling a fresh random result.
			input: active.input === undefined ? cloneStack(recipe.input) : cloneStack(active.input),
			outputs: active.outputs === undefined
				? cloneOutputs(recipe.outputs.filter(output => output.chance >= 1))
				: cloneOutputs(active.outputs),
			progress: active.progress,
			recipeId: active.recipeId
		};
	}
}
