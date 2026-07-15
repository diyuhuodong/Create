import { cloneItemStack, itemStackFingerprint, ItemPort, rekeyItemPortSnapshot } from "../logistics/item-port.js";
import { MachineProcessor } from "./machine-processor.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
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
 * A fixed processing machine keeps its input, in-process item, decided chance
 * outputs, and output buffer in one serializable state. It deliberately does
 * not own a Bedrock Container: runtime adapters decide how a player or another
 * external endpoint exchanges a complete stack with these managed ports.
 */
export class ProcessingMachine {
	#id;
	#input;
	#inputAutomationPort;
	#nextOperation = 0;
	#output;
	#pendingOutputs = [];
	#processor;

	constructor(recipes, { id = "processing-machine", inputSlots = 1, outputSlots = 4 } = {}) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Processing machines require stable identifiers");
		this.#id = id;
		this.#input = new ItemPort({ id: `${id}:input`, size: inputSlots });
		this.#output = new ItemPort({ id: `${id}:output`, size: outputSlots });
		this.#inputAutomationPort = this.#createInputAutomationPort();
		this.#processor = new MachineProcessor(recipes);
	}

	extractOutput(options) {
		const reservation = this.#output.reserve(options);
		if (!reservation)
			return undefined;
		return this.#output.extract(reservation);
	}

	extractInput(options) {
		if (this.#processor.snapshot())
			return undefined;
		const reservation = this.#input.reserve(options);
		if (!reservation)
			return undefined;
		return this.#input.extract(reservation);
	}

	hasContents() {
		return this.#processor.snapshot() !== undefined
			|| this.#pendingOutputs.length > 0
			|| this.#input.inspect().slots.some(Boolean)
			|| this.#output.inspect().slots.some(Boolean);
	}

	insertInput(stack, options) {
		const requested = cloneItemStack(stack);
		if (!this.#processor.acceptsInput(requested))
			return { accepted: undefined, remainder: requested };
		return this.#input.insert(requested, options);
	}

	inspect() {
		return {
			id: this.#id,
			input: this.#input.inspect(),
			nextOperation: this.#nextOperation,
			output: this.#output.inspect(),
			pendingOutputs: this.#pendingOutputs.map(cloneItemStack),
			processor: this.#processor.snapshot()
		};
	}

	/**
	 * Automation owners expose managed ports without exposing processor state.
	 * The machine remains the authoritative persistence owner for both ports.
	 */
	get inputPort() {
		return this.#inputAutomationPort;
	}

	get outputPort() {
		return this.#output;
	}

	peekOutput(options) {
		const reservation = this.#output.reserve(options);
		return reservation && cloneItemStack(reservation.item);
	}

	peekInput(options) {
		if (this.#processor.snapshot())
			return undefined;
		const reservation = this.#input.reserve(options);
		return reservation && cloneItemStack(reservation.item);
	}

	previewInput(stack) {
		const requested = cloneItemStack(stack);
		if (!this.#processor.acceptsInput(requested))
			return { accepted: undefined, remainder: requested };
		return this.#input.previewInsert(requested);
	}

	startDirect(input, { random } = {}) {
		if (this.#processor.snapshot() || this.#pendingOutputs.length > 0 || this.#input.inspect().slots.some(Boolean))
			return false;
		const operation = this.#nextOperation++;
		const started = this.#processor.start(input, { random: random ?? seededRandom(`${this.#id}:${operation}`) });
		return started && { ...started, operation };
	}

	// Kept for the three original fixed-machine callers. Automated callers use
	// insertInput(), whose stack remains in the durable input ItemPort until work starts.
	tryInsert(input, options) {
		return this.startDirect(input, options);
	}

	tick({ powered, workUnits = 1 } = {}) {
		if (this.#pendingOutputs.length > 0)
			return this.#deliverPendingOutput();
		if (!powered)
			return undefined;
		if (!Number.isFinite(workUnits) || workUnits <= 0)
			throw new RangeError("Machine work units must be positive");

		if (!this.#processor.snapshot()) {
			const started = this.#startBufferedInput();
			if (started)
				return { started: true, ...started };
			return undefined;
		}

		const update = this.#processor.tick({ powered, workUnits });
		if (!update?.completed)
			return update;
		this.#pendingOutputs = update.outputs.map(cloneItemStack);
		return { ...update, pendingOutput: this.#pendingOutputs.length > 0 };
	}

	snapshot() {
		return {
			input: this.#input.snapshot(),
			nextOperation: this.#nextOperation,
			output: this.#output.snapshot(),
			pendingOutputs: this.#pendingOutputs.map(cloneItemStack),
			processor: this.#processor.snapshot()
		};
	}

	restore(snapshot) {
		if (snapshot === undefined) {
			this.#input.restore({ ...this.#input.snapshot(), slots: this.#input.inspect().slots.map(() => undefined) });
			this.#output.restore({ ...this.#output.snapshot(), slots: this.#output.inspect().slots.map(() => undefined) });
			this.#pendingOutputs = [];
			this.#nextOperation = 0;
			this.#processor.restore(undefined);
			return;
		}
		// Legacy fixed-machine records stored only MachineProcessor state.
		if (!snapshot.input && !snapshot.output && !snapshot.processor) {
			this.#processor.restore(snapshot);
			this.#pendingOutputs = [];
			this.#nextOperation = 0;
			return;
		}
		if (!snapshot.input || !snapshot.output || !Array.isArray(snapshot.pendingOutputs) || !Number.isInteger(snapshot.nextOperation) || snapshot.nextOperation < 0)
			throw new TypeError("Processing machine snapshots require ports, pending outputs, and sequence state");
		this.#input.restore(rekeyItemPortSnapshot(snapshot.input, this.#input.id));
		this.#output.restore(rekeyItemPortSnapshot(snapshot.output, this.#output.id));
		this.#pendingOutputs = snapshot.pendingOutputs.map(cloneItemStack);
		this.#nextOperation = snapshot.nextOperation;
		this.#processor.restore(snapshot.processor);
	}

	#deliverPendingOutput() {
		const stack = this.#pendingOutputs[0];
		const inserted = this.#output.insert(stack);
		if (inserted.remainder)
			this.#pendingOutputs[0] = inserted.remainder;
		else
			this.#pendingOutputs.shift();
		return {
			delivered: inserted.accepted,
			pendingOutput: this.#pendingOutputs.length > 0
		};
	}

	#createInputAutomationPort() {
		const port = this.#input;
		return Object.freeze({
			extract: (...args) => port.extract(...args),
			id: port.id,
			inspect: () => port.inspect(),
			insert: (stack, options) => this.insertInput(stack, options),
			previewInsert: stack => this.previewInput(stack),
			reserve: options => port.reserve(options),
			restore: state => port.restore(state),
			snapshot: () => port.snapshot(),
			transactionStorage: port.transactionStorage
		});
	}

	#startBufferedInput() {
		const candidate = this.#input.reserve();
		if (!candidate)
			return undefined;
		const operation = this.#nextOperation;
		const started = this.#processor.start(candidate.item, { random: seededRandom(`${this.#id}:${operation}`) });
		if (!started)
			return undefined;
		const reservation = this.#input.reserve({
			maxCount: started.consumed.count,
			predicate: stack => itemStackFingerprint(stack) === itemStackFingerprint(started.consumed)
		});
		if (!reservation) {
			this.#processor.restore(undefined);
			return undefined;
		}
		const extracted = this.#input.extract(reservation, { receiptId: `${this.#id}:input:${operation}` });
		if (itemStackFingerprint(extracted) !== itemStackFingerprint(started.consumed) || extracted.count !== started.consumed.count)
			throw new Error("Processing machine extracted an input that differs from its recipe plan");
		this.#nextOperation++;
		return { ...started, operation };
	}
}
