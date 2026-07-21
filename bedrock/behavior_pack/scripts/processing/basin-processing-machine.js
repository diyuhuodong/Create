import { cloneItemStack, itemStackFingerprint, ItemPort, rekeyItemPortSnapshot } from "../logistics/item-port.js";
import { FluidLedger } from "../fluids/fluid-ledger.js";
import { isHeatSatisfied, normalizeHeatRequirement } from "../fluids/heat-level.js";
import { fluidMatchesRequirement } from "../fluids/fluid-registry.js";
import { cloneFluidStack } from "../fluids/fluid-stack.js";
import { itemMatchesBasinRequirement } from "./basin-item-tags.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function normalizeItemRequirement(ingredient) {
	if (!ingredient || !Number.isInteger(ingredient.count) || ingredient.count < 1 || (typeof ingredient.typeId !== "string" && typeof ingredient.tag !== "string"))
		throw new TypeError("Basin item ingredients require a type/tag and positive count");
	return ingredient.typeId ? { count: ingredient.count, typeId: ingredient.typeId } : { count: ingredient.count, tag: ingredient.tag };
}

function normalizeOutput(output) {
	if (!output || typeof output.typeId !== "string" || !Number.isInteger(output.count) || output.count < 1 || !Number.isFinite(output.chance) || output.chance < 0 || output.chance > 1)
		throw new TypeError("Basin item outputs require a type, count, and chance");
	return { chance: output.chance, count: output.count, typeId: output.typeId };
}

function normalizeFluidIngredient(ingredient) {
	if (!ingredient || !Number.isSafeInteger(ingredient.amount) || ingredient.amount < 1 || (typeof ingredient.typeId !== "string" && typeof ingredient.tag !== "string"))
		throw new TypeError("Basin fluid ingredients require a type/tag and positive amount");
	return ingredient.typeId ? { amount: ingredient.amount, typeId: ingredient.typeId } : { amount: ingredient.amount, tag: ingredient.tag };
}

function normalizeRecipe(recipe) {
	if (!recipe || typeof recipe.id !== "string" || typeof recipe.mode !== "string" || !Number.isFinite(recipe.processingTicks) || recipe.processingTicks <= 0)
		throw new TypeError("Basin recipes require identifiers, modes, and positive processing time");
	const ingredients = (recipe.ingredients ?? []).map(normalizeItemRequirement);
	const fluidIngredients = (recipe.fluidIngredients ?? []).map(normalizeFluidIngredient);
	const outputs = (recipe.outputs ?? []).map(normalizeOutput);
	const fluidOutputs = (recipe.fluidOutputs ?? []).map(cloneFluidStack);
	if (ingredients.length === 0 && fluidIngredients.length === 0)
		throw new TypeError("Basin recipes require at least one item or fluid ingredient");
	if (outputs.length === 0 && fluidOutputs.length === 0)
		throw new TypeError("Basin recipes require at least one item or fluid output");
	return {
		fluidIngredients,
		fluidOutputs,
		heatRequirement: normalizeHeatRequirement(recipe.heatRequirement),
		id: recipe.id,
		ingredients,
		mode: recipe.mode,
		outputs,
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
 * Basin-specific processing keeps item input, fluid receipts and heat
 * conditions in one recoverable snapshot. This intentionally remains a
 * separate adapter from BatchProcessingMachine: fan/cutting never own a fluid
 * port and must not acquire Basin-only persistence rules.
 */
export class BasinProcessingMachine {
	#active;
	#id;
	#input;
	#ledger = new FluidLedger();
	#nextOperation = 0;
	#output;
	#pendingOutputs = [];
	#recipes;

	constructor(recipes, { id = "basin-processing-machine", inputSlots = 9, outputSlots = 4 } = {}) {
		if (!Array.isArray(recipes))
			throw new TypeError("Basin processing machines require a recipe array");
		this.#id = id;
		this.#recipes = new Map(recipes.map(normalizeRecipe).map(recipe => [recipe.id, recipe]));
		if (this.#recipes.size !== recipes.length)
			throw new Error("Basin recipes require unique identifiers");
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
		return this.#active !== undefined || this.#pendingOutputs.length > 0 || this.#input.inspect().slots.some(Boolean) || this.#output.inspect().slots.some(Boolean);
	}

	insertInput(stack, options) {
		const requested = cloneItemStack(stack);
		if (![...this.#recipes.values()].some(recipe => recipe.ingredients.some(ingredient => itemMatchesBasinRequirement(requested, ingredient))))
			return { accepted: undefined, remainder: requested };
		return this.#input.insert(requested, options);
	}

	inspect() {
		return {
			active: this.#active && clone(this.#active),
			id: this.#id,
			input: this.#input.inspect(),
			ledger: this.#ledger.snapshot(),
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
			this.#ledger.restore([]);
			this.#nextOperation = 0;
			this.#pendingOutputs = [];
			return;
		}
		if (!snapshot.input || !snapshot.output || !Array.isArray(snapshot.ledger) || !Array.isArray(snapshot.pendingOutputs) || !Number.isInteger(snapshot.nextOperation))
			throw new TypeError("Basin snapshots require ports, ledger and sequence state");
		if (snapshot.active !== undefined && (!this.#recipes.has(snapshot.active.recipeId) || !Number.isFinite(snapshot.active.progress) || snapshot.active.progress < 0))
			throw new TypeError("Basin snapshots contain invalid active work");
		this.#input.restore(rekeyItemPortSnapshot(snapshot.input, this.#input.id));
		this.#output.restore(rekeyItemPortSnapshot(snapshot.output, this.#output.id));
		this.#ledger.restore(snapshot.ledger);
		this.#active = snapshot.active && clone(snapshot.active);
		this.#nextOperation = snapshot.nextOperation;
		this.#pendingOutputs = snapshot.pendingOutputs.map(cloneItemStack);
	}

	snapshot() {
		return {
			active: this.#active && clone(this.#active),
			input: this.#input.snapshot(),
			ledger: this.#ledger.snapshot(),
			nextOperation: this.#nextOperation,
			output: this.#output.snapshot(),
			pendingOutputs: this.#pendingOutputs.map(cloneItemStack)
		};
	}

	tick({ fluidPort, heatLevel = 0, mode, powered, random, workUnits = 1 } = {}) {
		if (this.#pendingOutputs.length > 0)
			return this.#deliverPendingOutput();
		if (this.#active?.fluidOperationId) {
			if (!fluidPort)
				return { paused: true, recipeId: this.#active.recipeId, reason: "fluid_port_unavailable" };
			const settled = this.#ledger.settle(this.#active.fluidOperationId, fluidPort.id === undefined ? fluidPort : id => id === fluidPort.id ? fluidPort : undefined);
			if (!settled.ok)
				return { pendingFluidOutput: true, recipeId: this.#active.recipeId };
			const recipeId = this.#active.recipeId;
			this.#active = undefined;
			return { completed: true, pendingOutput: false, recipeId };
		}
		if (typeof mode !== "string" || !powered)
			return undefined;
		if (!Number.isFinite(workUnits) || workUnits <= 0)
			throw new RangeError("Basin processing work units must be positive");
		if (!this.#active)
			return this.#start(mode, heatLevel, fluidPort, random);
		if (this.#active.mode !== mode)
			return { paused: true, recipeId: this.#active.recipeId };
		const recipe = this.#recipes.get(this.#active.recipeId);
		if (!isHeatSatisfied(heatLevel, recipe.heatRequirement))
			return { paused: true, reason: "heat_requirement", recipeId: recipe.id };
		this.#active.progress += workUnits;
		if (this.#active.progress < recipe.processingTicks)
			return { completed: false, progress: this.#active.progress, recipeId: recipe.id };
		this.#pendingOutputs = this.#active.outputs.map(cloneItemStack);
		if (this.#pendingOutputs.length > 0) {
			if (!this.#active.fluidOperationId)
				this.#active = undefined;
			return { completed: true, pendingOutput: true, recipeId: recipe.id };
		}
		return this.tick({ fluidPort, heatLevel, mode, powered: false });
	}

	#availableItemRequirements(recipe) {
		const available = this.#input.inspect().slots.filter(Boolean);
		return recipe.ingredients.every(ingredient => available.reduce((sum, stack) => sum + (itemMatchesBasinRequirement(stack, ingredient) ? stack.count : 0), 0) >= ingredient.count);
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

	#start(mode, heatLevel, fluidPort, random) {
		const recipe = [...this.#recipes.values()]
			.sort((left, right) => left.id.localeCompare(right.id))
			.find(candidate => candidate.mode === mode && isHeatSatisfied(heatLevel, candidate.heatRequirement) && this.#availableItemRequirements(candidate)
				&& candidate.fluidIngredients.every(ingredient => {
					const reservation = fluidPort?.reserve?.({ maxAmount: ingredient.amount, predicate: fluid => fluidMatchesRequirement(fluid, ingredient) });
					return reservation?.fluid.amount >= ingredient.amount;
				}));
		if (!recipe)
			return undefined;
		const operation = this.#nextOperation;
		const fluidOperationId = recipe.fluidIngredients.length > 0 || recipe.fluidOutputs.length > 0 ? `${this.#id}:fluid:${operation}` : undefined;
		if (fluidOperationId) {
			const begun = this.#ledger.begin({
				id: fluidOperationId,
				inputs: recipe.fluidIngredients.map(ingredient => ({ ...ingredient, port: fluidPort })),
				outputs: recipe.fluidOutputs.map(fluid => ({ fluid, port: fluidPort }))
			});
			if (!begun.ok)
				return undefined;
		}
		for (const ingredient of recipe.ingredients) {
			const reservation = this.#input.reserve({ maxCount: ingredient.count, predicate: stack => itemMatchesBasinRequirement(stack, ingredient) });
			if (!reservation || reservation.item.count !== ingredient.count)
				throw new Error("Basin input changed after recipe selection");
			const extracted = this.#input.extract(reservation, { receiptId: `${this.#id}:input:${operation}:${itemStackFingerprint(reservation.item)}` });
			if (extracted.count !== ingredient.count)
				throw new Error("Basin extracted an item that differs from its recipe plan");
		}
		const roll = random ?? seededRandom(`${this.#id}:${operation}`);
		this.#active = {
			fluidOperationId,
			mode: recipe.mode,
			outputs: recipe.outputs.filter(output => roll() <= output.chance).map(output => ({ count: output.count, typeId: output.typeId })),
			progress: 0,
			recipeId: recipe.id
		};
		this.#nextOperation++;
		return { consumed: recipe.ingredients.map(clone), recipeId: recipe.id, started: true };
	}
}
