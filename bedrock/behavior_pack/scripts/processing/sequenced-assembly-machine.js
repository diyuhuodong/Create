function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertStack(stack, name) {
	if (typeof stack?.typeId !== "string" || !Number.isInteger(stack.count) || stack.count < 1)
		throw new TypeError(`${name} must be a positive item stack`);
	return { count: stack.count, typeId: stack.typeId };
}

function assertFluid(fluid, name) {
	if (typeof fluid?.typeId !== "string" || !Number.isInteger(fluid.amount) || fluid.amount < 1)
		throw new TypeError(`${name} must be a positive fluid stack`);
	return { amount: fluid.amount, typeId: fluid.typeId };
}

function isIngredient(value) {
	if (Array.isArray(value))
		return value.length > 0 && value.every(isIngredient);
	if (!value || typeof value !== "object")
		return false;
	if (value.kind === "item")
		return typeof value.typeId === "string" && Number.isInteger(value.count) && value.count > 0;
	if (value.kind === "tag")
		return typeof value.tag === "string" && Number.isInteger(value.count) && value.count > 0;
	return value.kind === "fluid" && typeof value.typeId === "string" && Number.isInteger(value.amount) && value.amount > 0;
}

function isOutput(value) {
	return typeof value?.typeId === "string" && Number.isInteger(value.count) && value.count > 0
		&& Number.isFinite(value.chance) && value.chance > 0;
}

function validateRecipe(recipe) {
	if (typeof recipe?.id !== "string" || !isIngredient(recipe.input) || !Number.isInteger(recipe.loops) || recipe.loops < 1
		|| typeof recipe.transitionalItem !== "string" || !Array.isArray(recipe.outputs) || recipe.outputs.length === 0
		|| !recipe.outputs.every(isOutput) || !Array.isArray(recipe.steps) || recipe.steps.length === 0)
		throw new TypeError("Sequenced-assembly recipes require a complete normalized IR record");
	for (const [index, step] of recipe.steps.entries()) {
		if (typeof step?.type !== "string" || !Array.isArray(step.ingredients) || step.ingredients.length === 0
			|| !step.ingredients.every(isIngredient) || !Array.isArray(step.outputs) || !step.outputs.every(isOutput))
			throw new TypeError(`Sequenced-assembly recipe ${recipe.id} has an invalid step ${index}`);
		const transit = step.ingredients[0];
		if (Array.isArray(transit) || transit.kind !== "item" || transit.typeId !== recipe.transitionalItem || transit.count !== 1)
			throw new Error(`Sequenced-assembly recipe ${recipe.id} step ${index} must retain its transitional item`);
	}
	return recipe;
}

function stackMatches(ingredient, stack, matchesTag) {
	if (Array.isArray(ingredient))
		return ingredient.some(alternative => stackMatches(alternative, stack, matchesTag));
	if (ingredient.kind === "item")
		return stack.typeId === ingredient.typeId && stack.count >= ingredient.count;
	if (ingredient.kind === "tag")
		return stack.count >= ingredient.count && matchesTag(ingredient.tag, stack.typeId);
	return false;
}

function fluidMatches(ingredient, fluid) {
	return ingredient.kind === "fluid" && fluid?.typeId === ingredient.typeId && fluid.amount >= ingredient.amount;
}

function chooseWeightedOutput(outputs, roll) {
	if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
		throw new RangeError("Sequenced-assembly output rolls must be in [0, 1)");
	const total = outputs.reduce((sum, output) => sum + output.chance, 0);
	let cursor = roll * total;
	for (const output of outputs) {
		cursor -= output.chance;
		if (cursor < 0)
			return { count: output.count, typeId: output.typeId };
	}
	return { count: outputs.at(-1).count, typeId: outputs.at(-1).typeId };
}

function normalizeState(state, recipes) {
	if (!state || typeof state !== "object" || !["idle", "processing", "complete"].includes(state.phase))
		throw new TypeError("Sequenced-assembly state has an invalid phase");
	if (state.phase === "idle")
		return { phase: "idle" };
	const recipe = recipes.get(state.recipeId);
	if (!recipe)
		throw new Error(`Sequenced-assembly state references unknown recipe ${state.recipeId}`);
	if (state.phase === "complete")
		return { output: assertStack(state.output, "Sequenced-assembly output"), phase: "complete", recipeId: recipe.id };
	if (!Number.isInteger(state.completedLoops) || state.completedLoops < 0 || state.completedLoops >= recipe.loops
		|| !Number.isInteger(state.stepIndex) || state.stepIndex < 0 || state.stepIndex >= recipe.steps.length)
		throw new RangeError("Sequenced-assembly processing progress is out of range");
	return {
		completedLoops: state.completedLoops,
		phase: "processing",
		recipeId: recipe.id,
		stepIndex: state.stepIndex
	};
}

/**
 * Server-authoritative core for Create's sequenced assembly. World adapters
 * consume the returned requirements only after their own escrow succeeds.
 */
export class SequencedAssemblyMachine {
	#recipes;
	#state = { phase: "idle" };

	constructor(recipes) {
		if (!Array.isArray(recipes) || recipes.length === 0)
			throw new TypeError("Sequenced-assembly machines require normalized recipes");
		this.#recipes = new Map(recipes.map(recipe => {
			validateRecipe(recipe);
			return [recipe.id, clone(recipe)];
		}));
		if (this.#recipes.size !== recipes.length)
			throw new Error("Sequenced-assembly recipe identifiers must be unique");
	}

	snapshot() {
		return clone(this.#state);
	}

	restore(state) {
		this.#state = normalizeState(state, this.#recipes);
		return this.snapshot();
	}

	begin(recipeId, input, { matchesTag = () => false } = {}) {
		if (this.#state.phase !== "idle")
			return { accepted: false, reason: "busy" };
		if (typeof matchesTag !== "function")
			throw new TypeError("Sequenced-assembly tag matching requires a function");
		const recipe = this.#recipes.get(recipeId);
		if (!recipe)
			return { accepted: false, reason: "unknown_recipe" };
		const stack = assertStack(input, "Sequenced-assembly input");
		if (!stackMatches(recipe.input, stack, matchesTag))
			return { accepted: false, reason: "wrong_input" };
		this.#state = { completedLoops: 0, phase: "processing", recipeId, stepIndex: 0 };
		return { accepted: true, consumed: { count: recipe.input.count, typeId: stack.typeId }, state: this.snapshot() };
	}

	matchesInput(recipeId, input, { matchesTag = () => false } = {}) {
		if (typeof matchesTag !== "function")
			throw new TypeError("Sequenced-assembly tag matching requires a function");
		const recipe = this.#recipes.get(recipeId);
		if (!recipe)
			return false;
		return stackMatches(recipe.input, assertStack(input, "Sequenced-assembly input"), matchesTag);
	}

	nextStep() {
		if (this.#state.phase !== "processing")
			return undefined;
		const recipe = this.#recipes.get(this.#state.recipeId);
		const step = recipe.steps[this.#state.stepIndex];
		return {
			completedLoops: this.#state.completedLoops,
			ingredients: clone(step.ingredients.slice(1)),
			recipeId: recipe.id,
			stepIndex: this.#state.stepIndex,
			type: step.type
		};
	}

	apply(type, { fluids = [], items = [], matchesTag = () => false, roll = 0 } = {}) {
		if (this.#state.phase !== "processing")
			return { applied: false, reason: "not_processing" };
		if (typeof matchesTag !== "function")
			throw new TypeError("Sequenced-assembly tag matching requires a function");
		const recipe = this.#recipes.get(this.#state.recipeId);
		const step = recipe.steps[this.#state.stepIndex];
		if (type !== step.type)
			return { applied: false, reason: "wrong_step_type" };
		const suppliedItems = items.map(item => assertStack(item, "Sequenced-assembly step item"));
		const suppliedFluids = fluids.map(fluid => assertFluid(fluid, "Sequenced-assembly step fluid"));
		const required = step.ingredients.slice(1);
		if (required.length !== suppliedItems.length + suppliedFluids.length)
			return { applied: false, reason: "wrong_ingredient_count" };
		const remainingItems = [...suppliedItems];
		const remainingFluids = [...suppliedFluids];
		for (const ingredient of required) {
			if (Array.isArray(ingredient) ? ingredient.some(entry => entry.kind === "fluid") : ingredient.kind === "fluid") {
				const index = remainingFluids.findIndex(fluid => Array.isArray(ingredient)
					? ingredient.some(entry => fluidMatches(entry, fluid))
					: fluidMatches(ingredient, fluid));
				if (index < 0)
					return { applied: false, reason: "wrong_fluid" };
				remainingFluids.splice(index, 1);
			} else {
				const index = remainingItems.findIndex(item => stackMatches(ingredient, item, matchesTag));
				if (index < 0)
					return { applied: false, reason: "wrong_item" };
				remainingItems.splice(index, 1);
			}
		}
		const nextStep = this.#state.stepIndex + 1;
		if (nextStep < recipe.steps.length) {
			this.#state = { ...this.#state, stepIndex: nextStep };
			return { applied: true, complete: false, state: this.snapshot() };
		}
		const completedLoops = this.#state.completedLoops + 1;
		if (completedLoops < recipe.loops) {
			this.#state = { ...this.#state, completedLoops, stepIndex: 0 };
			return { applied: true, complete: false, state: this.snapshot() };
		}
		const output = chooseWeightedOutput(recipe.outputs, roll);
		this.#state = { output, phase: "complete", recipeId: recipe.id };
		return { applied: true, complete: true, output: { ...output }, state: this.snapshot() };
	}

	takeOutput() {
		if (this.#state.phase !== "complete")
			return undefined;
		const output = { ...this.#state.output };
		this.#state = { phase: "idle" };
		return output;
	}
}

export { chooseWeightedOutput };
