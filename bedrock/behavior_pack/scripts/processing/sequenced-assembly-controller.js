import { cloneItemStack, ItemPort } from "../logistics/item-port.js";
import { cloneFluidStack } from "../fluids/fluid-stack.js";

import { SequencedAssemblyMachine } from "./sequenced-assembly-machine.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function itemMatches(ingredient, stack, matchesTag) {
	if (Array.isArray(ingredient))
		return ingredient.some(entry => itemMatches(entry, stack, matchesTag));
	if (ingredient.kind === "item")
		return stack.typeId === ingredient.typeId && stack.count >= ingredient.count;
	return ingredient.kind === "tag" && stack.count >= ingredient.count && matchesTag(ingredient.tag, stack.typeId);
}

function fluidMatches(ingredient, fluid) {
	if (Array.isArray(ingredient))
		return ingredient.some(entry => fluidMatches(entry, fluid));
	return ingredient.kind === "fluid" && fluid.typeId === ingredient.typeId && fluid.amount >= ingredient.amount;
}

function ingredientKind(ingredient) {
	if (Array.isArray(ingredient)) {
		const kinds = new Set(ingredient.map(ingredientKind));
		if (kinds.size !== 1)
			throw new TypeError("Sequenced-assembly ingredient alternatives cannot mix item and fluid kinds");
		return [...kinds][0];
	}
	return ingredient?.kind;
}

function exactItemCount(ingredient) {
	if (Array.isArray(ingredient))
		return Math.max(...ingredient.map(exactItemCount));
	return ingredient.count;
}

function exactFluidAmount(ingredient) {
	if (Array.isArray(ingredient))
		return Math.max(...ingredient.map(exactFluidAmount));
	return ingredient.amount;
}

/**
 * Transactional adapter for the ingredients surrounding a sequenced item.
 * World-facing deployer, press, and spout adapters provide their managed
 * ports; this controller owns only sequence progress and its buffered output.
 */
export class SequencedAssemblyController {
	#id;
	#machine;
	#nextOperation = 0;
	#output;

	constructor(recipes, { id = "sequenced-assembly", outputSlots = 4 } = {}) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Sequenced-assembly controllers require a stable identifier");
		if (!Number.isInteger(outputSlots) || outputSlots < 1)
			throw new RangeError("Sequenced-assembly controllers require positive output slots");
		this.#id = id;
		this.#machine = new SequencedAssemblyMachine(recipes);
		this.#output = new ItemPort({ id: `${id}:output`, size: outputSlots });
	}

	get outputPort() {
		return this.#output;
	}

	inspect() {
		return {
			id: this.#id,
			machine: this.#machine.snapshot(),
			nextOperation: this.#nextOperation,
			output: this.#output.inspect()
		};
	}

	snapshot() {
		return {
			machine: this.#machine.snapshot(),
			nextOperation: this.#nextOperation,
			output: this.#output.snapshot()
		};
	}

	restore(snapshot) {
		if (!snapshot || typeof snapshot !== "object" || !Number.isInteger(snapshot.nextOperation) || snapshot.nextOperation < 0)
			throw new TypeError("Sequenced-assembly controller snapshots require progress and an operation counter");
		this.#machine.restore(snapshot.machine);
		this.#output.restore(snapshot.output);
		this.#nextOperation = snapshot.nextOperation;
		return this.inspect();
	}

	start(recipeId, inputPort, { matchesTag = () => false } = {}) {
		if (!inputPort || typeof inputPort.reserve !== "function" || typeof inputPort.extract !== "function")
			throw new TypeError("Sequenced-assembly starts require a reservable input port");
		const reservation = inputPort.reserve({
			maxCount: 1,
			predicate: stack => this.#machine.matchesInput(recipeId, stack, { matchesTag })
		});
		if (!reservation)
			return { accepted: false, reason: "missing_input" };
		const before = this.#machine.snapshot();
		const started = this.#machine.begin(recipeId, reservation.item, { matchesTag });
		if (!started.accepted)
			return started;
		try {
			const extracted = inputPort.extract(reservation, { receiptId: `${this.#id}:start:${this.#nextOperation}` });
			if (extracted.count !== started.consumed.count || extracted.typeId !== started.consumed.typeId)
				throw new Error("Sequenced-assembly input extraction did not match its reserved recipe input");
		} catch (error) {
			this.#machine.restore(before);
			throw error;
		}
		this.#nextOperation++;
		return started;
	}

	apply(type, { fluidPort, itemPort, matchesTag = () => false, roll = 0 } = {}) {
		const step = this.#machine.nextStep();
		if (!step)
			return { applied: false, reason: "not_processing" };
		if (type !== step.type)
			return { applied: false, reason: "wrong_step_type" };
		if (step.ingredients.length > 1)
			return { applied: false, reason: "unsupported_multi_ingredient_step" };

		let reservation;
		let suppliedFluids = [];
		let suppliedItems = [];
		let sourcePort;
		const ingredient = step.ingredients[0];
		if (ingredient) {
			const kind = ingredientKind(ingredient);
			if (kind === "fluid") {
				if (!fluidPort || typeof fluidPort.reserve !== "function" || typeof fluidPort.extract !== "function")
					return { applied: false, reason: "missing_fluid_port" };
				reservation = fluidPort.reserve({
					maxAmount: exactFluidAmount(ingredient),
					predicate: fluid => fluidMatches(ingredient, fluid)
				});
				if (!reservation || reservation.fluid.amount < exactFluidAmount(ingredient))
					return { applied: false, reason: "missing_fluid" };
				suppliedFluids = [cloneFluidStack(reservation.fluid)];
				sourcePort = fluidPort;
			} else if (kind === "item" || kind === "tag") {
				if (!itemPort || typeof itemPort.reserve !== "function" || typeof itemPort.extract !== "function")
					return { applied: false, reason: "missing_item_port" };
				reservation = itemPort.reserve({
					maxCount: exactItemCount(ingredient),
					predicate: stack => itemMatches(ingredient, stack, matchesTag)
				});
				if (!reservation || reservation.item.count < exactItemCount(ingredient))
					return { applied: false, reason: "missing_item" };
				suppliedItems = [cloneItemStack(reservation.item)];
				sourcePort = itemPort;
			} else {
				throw new TypeError("Sequenced-assembly steps contain an unsupported ingredient kind");
			}
		}

		const before = this.#machine.snapshot();
		const applied = this.#machine.apply(type, { fluids: suppliedFluids, items: suppliedItems, matchesTag, roll });
		if (!applied.applied)
			return applied;
		try {
			if (reservation) {
				const receiptId = `${this.#id}:step:${this.#nextOperation}`;
				const extracted = sourcePort.extract(reservation, { receiptId });
				if (suppliedItems.length > 0 && (extracted.typeId !== suppliedItems[0].typeId || extracted.count !== suppliedItems[0].count))
					throw new Error("Sequenced-assembly item extraction did not match its reservation");
				if (suppliedFluids.length > 0 && (extracted.typeId !== suppliedFluids[0].typeId || extracted.amount !== suppliedFluids[0].amount))
					throw new Error("Sequenced-assembly fluid extraction did not match its reservation");
			}
		} catch (error) {
			this.#machine.restore(before);
			throw error;
		}
		this.#nextOperation++;
		return { ...applied, delivered: this.flushOutput() };
	}

	flushOutput() {
		const state = this.#machine.snapshot();
		if (state.phase !== "complete")
			return undefined;
		const preview = this.#output.previewInsert(state.output);
		if (preview.remainder)
			return undefined;
		const output = this.#machine.takeOutput();
		const inserted = this.#output.insert(output, { receiptId: `${this.#id}:output:${this.#nextOperation}` });
		if (inserted.remainder)
			throw new Error("Sequenced-assembly output changed after a successful capacity preview");
		return inserted.accepted;
	}
}
