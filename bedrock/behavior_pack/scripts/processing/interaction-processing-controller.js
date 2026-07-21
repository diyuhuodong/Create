import { ItemPort, cloneItemStack, rekeyItemPortSnapshot } from "../logistics/item-port.js";

import { InteractionMachine } from "./interaction-machine.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function reserveExact(port, requirement) {
	if (!requirement)
		return undefined;
	const reservation = port.reserve({
		maxCount: requirement.count,
		predicate: stack => stack.typeId === requirement.typeId
	});
	return reservation?.item.count === requirement.count ? reservation : undefined;
}

function previewOutputs(port, outputs) {
	const staged = new ItemPort({ id: port.id, size: port.inspect().slots.length });
	staged.restore(rekeyItemPortSnapshot(port.snapshot(), staged.id));
	for (const output of outputs) {
		const inserted = staged.insert(output);
		if (inserted.remainder)
			return false;
	}
	return true;
}

/**
 * Durable bridge between normalized interaction recipes and world-facing
 * Deployer/Spout adapters. It owns only item ports; adapters supply a managed
 * FluidPort when a filling/emptying recipe asks for fluid.
 */
export class InteractionProcessingController {
	#held;
	#id;
	#input;
	#machine;
	#nextOperation = 0;
	#output;

	constructor(recipes, { id = "interaction-processing", inputSlots = 1, outputSlots = 4 } = {}) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Interaction-processing controllers require stable identifiers");
		this.#id = id;
		this.#machine = new InteractionMachine(recipes);
		this.#held = new ItemPort({ id: `${id}:held`, size: 1 });
		this.#input = new ItemPort({ id: `${id}:input`, size: inputSlots });
		this.#output = new ItemPort({ id: `${id}:output`, size: outputSlots });
	}

	get heldPort() {
		return this.#held;
	}

	get inputPort() {
		return this.#input;
	}

	get outputPort() {
		return this.#output;
	}

	inspect() {
		return {
			held: this.#held.inspect(),
			id: this.#id,
			input: this.#input.inspect(),
			nextOperation: this.#nextOperation,
			output: this.#output.inspect()
		};
	}

	restore(snapshot) {
		if (!snapshot || !snapshot.held || !snapshot.input || !snapshot.output || !Number.isInteger(snapshot.nextOperation) || snapshot.nextOperation < 0)
			throw new TypeError("Interaction-processing snapshots require ports and an operation counter");
		this.#held.restore(rekeyItemPortSnapshot(snapshot.held, this.#held.id));
		this.#input.restore(rekeyItemPortSnapshot(snapshot.input, this.#input.id));
		this.#output.restore(rekeyItemPortSnapshot(snapshot.output, this.#output.id));
		this.#nextOperation = snapshot.nextOperation;
		return this.inspect();
	}

	snapshot() {
		return {
			held: this.#held.snapshot(),
			input: this.#input.snapshot(),
			nextOperation: this.#nextOperation,
			output: this.#output.snapshot()
		};
	}

	/** Execute one deterministic recipe with escrow-style item/fluid rollback. */
	tick({ fluidPort, matchesComponents, matchesTag, random } = {}) {
		const inputReservation = this.#input.reserve();
		if (!inputReservation)
			return undefined;
		const heldReservation = this.#held.reserve();
		const fluidInspection = fluidPort?.inspect?.();
		const plan = this.#machine.planFirst({
			fluid: fluidInspection?.contents,
			heldItem: heldReservation?.item,
			input: inputReservation.item,
			matchesComponents,
			matchesTag,
			random
		});
		if (!plan.accepted)
			return plan;
		if (!previewOutputs(this.#output, plan.outputs.items))
			return { accepted: false, reason: "output_full" };

		const itemRequirements = plan.consumed.items.map(clone);
		const inputRequirement = itemRequirements.shift();
		const input = reserveExact(this.#input, inputRequirement);
		if (!input)
			return { accepted: false, reason: "input_changed" };
		const heldRequirement = itemRequirements.shift();
		const held = reserveExact(this.#held, heldRequirement);
		if (heldRequirement && !held)
			return { accepted: false, reason: "held_item_changed" };
		if (itemRequirements.length > 0)
			return { accepted: false, reason: "unsupported_extra_item_ingredient" };

		const fluidRequirement = plan.consumed.fluids[0];
		const fluid = fluidRequirement && fluidPort?.reserve?.({
			maxAmount: fluidRequirement.amount,
			predicate: candidate => candidate.typeId === fluidRequirement.typeId
		});
		if (fluidRequirement && (!fluid || fluid.fluid.amount < fluidRequirement.amount))
			return { accepted: false, reason: "fluid_changed" };
		if (plan.consumed.fluids.length > 1)
			return { accepted: false, reason: "unsupported_extra_fluid_ingredient" };

		const operation = this.#nextOperation;
		const extracted = [];
		try {
			extracted.push({ port: this.#input, stack: this.#input.extract(input, { receiptId: `${this.#id}:input:${operation}` }) });
			if (held)
				extracted.push({ port: this.#held, stack: this.#held.extract(held, { receiptId: `${this.#id}:held:${operation}` }) });
			let extractedFluid;
			if (fluid)
				extractedFluid = fluidPort.extract(fluid, { receiptId: `${this.#id}:fluid:${operation}` });
			for (const [index, output] of plan.outputs.items.entries()) {
				const inserted = this.#output.insert(output, { receiptId: `${this.#id}:output:${operation}:${index}` });
				if (inserted.remainder)
					throw new Error("Interaction output changed after a successful capacity preview");
			}
			this.#nextOperation++;
			return { accepted: true, consumed: plan.consumed, outputs: plan.outputs, recipeId: plan.recipeId };
		} catch (error) {
			for (const entry of extracted.reverse())
				entry.port.insert(entry.stack, { receiptId: `${this.#id}:rollback:${operation}:${entry.port.id}` });
			if (fluid)
				fluidPort.insert(fluid.fluid, { receiptId: `${this.#id}:rollback-fluid:${operation}` });
			throw error;
		}
	}
}
