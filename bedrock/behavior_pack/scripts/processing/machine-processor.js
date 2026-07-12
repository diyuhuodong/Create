function cloneOutputs(outputs) {
	return outputs.map(output => ({ ...output }));
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

	start(input) {
		if (this.#active)
			return false;

		const recipe = [...this.#recipes.values()].find(candidate =>
			candidate.input.typeId === input?.typeId && candidate.input.count <= (input.count ?? 0));
		if (!recipe)
			return false;

		this.#active = { progress: 0, recipeId: recipe.id };
		return { consumed: { ...recipe.input }, recipeId: recipe.id };
	}

	tick({ powered, workUnits = 1, random = Math.random } = {}) {
		if (!this.#active || !powered)
			return undefined;
		if (!Number.isFinite(workUnits) || workUnits <= 0)
			throw new RangeError("Machine work units must be positive");

		const recipe = this.#recipes.get(this.#active.recipeId);
		this.#active.progress += workUnits;
		if (this.#active.progress < recipe.processingTicks)
			return { completed: false, progress: this.#active.progress, recipeId: recipe.id };

		this.#active = undefined;
		return {
			completed: true,
			outputs: cloneOutputs(recipe.outputs.filter(output => random() <= output.chance)),
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

		this.#active = { progress: active.progress, recipeId: active.recipeId };
	}
}
