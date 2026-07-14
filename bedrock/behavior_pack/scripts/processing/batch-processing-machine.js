import { cloneItemStack, itemStackFingerprint, ItemPort } from "../logistics/item-port.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function normalizedStack(stack, name) {
	if (!stack || typeof stack.typeId !== "string" || stack.typeId.length === 0 || !Number.isInteger(stack.count) || stack.count < 1)
		throw new TypeError(`${name} require a type identifier and positive count`);
	return { count: stack.count, typeId: stack.typeId };
}

function normalizedOutputs(outputs) {
	if (!Array.isArray(outputs) || outputs.length === 0)
		throw new TypeError("Batch processing recipes require outputs");
	return outputs.map(output => {
		const stack = normalizedStack(output, "Batch processing outputs");
		if (!Number.isFinite(output.chance) || output.chance < 0 || output.chance > 1)
			throw new RangeError("Batch processing output chances must be between zero and one");
		return { ...stack, chance: output.chance };
	});
}

function normalizedIngredients(ingredients) {
	if (!Array.isArray(ingredients) || ingredients.length === 0)
		throw new TypeError("Batch processing recipes require ingredients");
	const counts = new Map();
	for (const ingredient of ingredients) {
		const normalized = normalizedStack(ingredient, "Batch processing ingredients");
		counts.set(normalized.typeId, (counts.get(normalized.typeId) ?? 0) + normalized.count);
	}
	return [...counts.entries()]
		.map(([typeId, count]) => ({ count, typeId }))
		.sort((left, right) => left.typeId.localeCompare(right.typeId));
}

function normalizedRecipe(recipe) {
	if (!recipe || typeof recipe.id !== "string" || recipe.id.length === 0 || typeof recipe.mode !== "string" || recipe.mode.length === 0)
		throw new TypeError("Batch processing recipes require identifiers and modes");
	if (!Number.isFinite(recipe.processingTicks) || recipe.processingTicks <= 0)
		throw new RangeError("Batch processing recipes require positive processing time");
	return {
		ingredients: normalizedIngredients(recipe.ingredients),
		id: recipe.id,
		mode: recipe.mode,
		outputs: normalizedOutputs(recipe.outputs),
		processingTicks: recipe.processingTicks
	};
}

function seededRandom(seed) {
	let state = 0x811c9dc5;
	for (let index = 0; index < seed.length; index++) {
		state ^= seed.charCodeAt(index);
		state = Math.imul(state, 0x01000193);
	}
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ value >>> 15, value | 1);
		value ^= value + Math.imul(value ^ value >>> 7, value | 61);
		return ((value ^ value >>> 14) >>> 0) / 4294967296;
	};
}

/**
 * A multi-input processing machine with managed input/output ports. Recipes
 * retain their consumed ingredients and decided random outputs in one snapshot
 * so a restart never rolls a bonus output twice.
 */
export class BatchProcessingMachine {
	#active;
	#id;
	#input;
	#nextOperation = 0;
	#output;
	#pendingOutputs = [];
	#recipes;

	constructor(recipes, { id = "batch-processing-machine", inputSlots = 9, outputSlots = 4 } = {}) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Batch processing machines require stable identifiers");
		if (!Array.isArray(recipes))
			throw new TypeError("Batch processing machines require recipe arrays");
		this.#id = id;
		this.#recipes = new Map(recipes.map(normalizedRecipe).map(recipe => [recipe.id, recipe]));
		if (this.#recipes.size !== recipes.length)
			throw new Error("Batch processing recipes require unique identifiers");
		this.#input = new ItemPort({ id: `${id}:input`, size: inputSlots });
		this.#output = new ItemPort({ id: `${id}:output`, size: outputSlots });
	}

	extractInput(options) {
		if (this.#active)
			return undefined;
		const reservation = this.#input.reserve(options);
		return reservation && this.#input.extract(reservation);
	}

	extractOutput(options) {
		const reservation = this.#output.reserve(options);
		return reservation && this.#output.extract(reservation);
	}

	hasContents() {
		return this.#active !== undefined
			|| this.#pendingOutputs.length > 0
			|| this.#input.inspect().slots.some(Boolean)
			|| this.#output.inspect().slots.some(Boolean);
	}

	insertInput(stack, options) {
		const requested = cloneItemStack(stack);
		if (![...this.#recipes.values()].some(recipe => recipe.ingredients.some(ingredient => ingredient.typeId === requested.typeId)))
			return { accepted: undefined, remainder: requested };
		return this.#input.insert(requested, options);
	}

	inspect() {
		return {
			active: this.#active && clone(this.#active),
			id: this.#id,
			input: this.#input.inspect(),
			nextOperation: this.#nextOperation,
			output: this.#output.inspect(),
			pendingOutputs: this.#pendingOutputs.map(cloneItemStack)
		};
	}

	peekInput(options) {
		if (this.#active)
			return undefined;
		const reservation = this.#input.reserve(options);
		return reservation && cloneItemStack(reservation.item);
	}

	peekOutput(options) {
		const reservation = this.#output.reserve(options);
		return reservation && cloneItemStack(reservation.item);
	}

	restore(snapshot) {
		if (snapshot === undefined) {
			this.#input.restore({ ...this.#input.snapshot(), slots: this.#input.inspect().slots.map(() => undefined) });
			this.#output.restore({ ...this.#output.snapshot(), slots: this.#output.inspect().slots.map(() => undefined) });
			this.#active = undefined;
			this.#nextOperation = 0;
			this.#pendingOutputs = [];
			return;
		}
		if (!snapshot.input || !snapshot.output || !Array.isArray(snapshot.pendingOutputs) || !Number.isInteger(snapshot.nextOperation) || snapshot.nextOperation < 0)
			throw new TypeError("Batch processing snapshots require ports, outputs, and sequence state");
		if (snapshot.active !== undefined && (!this.#recipes.has(snapshot.active?.recipeId) || !Number.isFinite(snapshot.active.progress) || snapshot.active.progress < 0 || !Array.isArray(snapshot.active.outputs)))
			throw new TypeError("Batch processing snapshots contain invalid active work");
		this.#input.restore(snapshot.input);
		this.#output.restore(snapshot.output);
		this.#active = snapshot.active && {
			ingredients: normalizedIngredients(snapshot.active.ingredients),
			mode: this.#recipes.get(snapshot.active.recipeId).mode,
			outputs: normalizedOutputs(snapshot.active.outputs),
			progress: snapshot.active.progress,
			recipeId: snapshot.active.recipeId
		};
		this.#nextOperation = snapshot.nextOperation;
		this.#pendingOutputs = snapshot.pendingOutputs.map(cloneItemStack);
	}

	snapshot() {
		return {
			active: this.#active && clone(this.#active),
			input: this.#input.snapshot(),
			nextOperation: this.#nextOperation,
			output: this.#output.snapshot(),
			pendingOutputs: this.#pendingOutputs.map(cloneItemStack)
		};
	}

	tick({ mode, powered, random, workUnits = 1 } = {}) {
		if (this.#pendingOutputs.length > 0)
			return this.#deliverPendingOutput();
		if (typeof mode !== "string" || mode.length === 0)
			return undefined;
		if (!powered)
			return undefined;
		if (!Number.isFinite(workUnits) || workUnits <= 0)
			throw new RangeError("Batch processing work units must be positive");
		if (!this.#active) {
			const started = this.#startBufferedInput(mode, random);
			return started && { started: true, ...started };
		}
		if (this.#active.mode !== mode)
			return { paused: true, recipeId: this.#active.recipeId };
		const recipe = this.#recipes.get(this.#active.recipeId);
		this.#active.progress += workUnits;
		if (this.#active.progress < recipe.processingTicks)
			return { completed: false, progress: this.#active.progress, recipeId: recipe.id };
		const completed = this.#active;
		this.#active = undefined;
		this.#pendingOutputs = completed.outputs.map(cloneItemStack);
		return { completed: true, outputs: completed.outputs.map(clone), pendingOutput: this.#pendingOutputs.length > 0, recipeId: recipe.id };
	}

	#availableCounts() {
		const counts = new Map();
		for (const stack of this.#input.inspect().slots) {
			if (stack)
				counts.set(stack.typeId, (counts.get(stack.typeId) ?? 0) + stack.count);
		}
		return counts;
	}

	#deliverPendingOutput() {
		const stack = this.#pendingOutputs[0];
		const inserted = this.#output.insert(stack);
		if (inserted.remainder)
			this.#pendingOutputs[0] = inserted.remainder;
		else
			this.#pendingOutputs.shift();
		return { delivered: inserted.accepted, pendingOutput: this.#pendingOutputs.length > 0 };
	}

	#startBufferedInput(mode, random) {
		const available = this.#availableCounts();
		const recipe = [...this.#recipes.values()]
			.sort((left, right) => left.id.localeCompare(right.id))
			.find(candidate => candidate.mode === mode && candidate.ingredients.every(ingredient => (available.get(ingredient.typeId) ?? 0) >= ingredient.count));
		if (!recipe)
			return undefined;
		const operation = this.#nextOperation;
		for (const ingredient of recipe.ingredients) {
			const reservation = this.#input.reserve({
				maxCount: ingredient.count,
				predicate: stack => stack.typeId === ingredient.typeId
			});
			if (!reservation || reservation.item.count !== ingredient.count)
				throw new Error("Batch processing input changed after recipe selection");
			const extracted = this.#input.extract(reservation, { receiptId: `${this.#id}:input:${operation}:${ingredient.typeId}` });
			if (extracted.count !== ingredient.count || itemStackFingerprint(extracted) !== itemStackFingerprint(ingredient))
				throw new Error("Batch processing extracted an input that differs from its recipe plan");
		}
		const roll = random ?? seededRandom(`${this.#id}:${operation}`);
		if (typeof roll !== "function")
			throw new TypeError("Batch processing random sources must be functions");
		this.#active = {
			ingredients: recipe.ingredients.map(clone),
			mode: recipe.mode,
			outputs: recipe.outputs.filter(output => roll() <= output.chance).map(output => ({ ...output })),
			progress: 0,
			recipeId: recipe.id
		};
		this.#nextOperation++;
		return { consumed: recipe.ingredients.map(clone), recipeId: recipe.id };
	}
}
