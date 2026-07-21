import { cloneFluidStack } from "./fluid-stack.js";
import { fluidFromWorldBlock, worldBlockForFluid } from "./fluid-registry.js";

export const VANILLA_SOURCE_FLUID_AMOUNT = 1_000;

const AIR_BLOCK = { states: {}, typeId: "minecraft:air" };
const FLUID_BLOCKS = new Map([
	["minecraft:lava", "minecraft:lava"],
	["minecraft:water", "minecraft:water"]
]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function normalizeBlock(block) {
	if (!block || typeof block.typeId !== "string" || block.typeId.length === 0)
		return undefined;
	if (block.states !== undefined && (typeof block.states !== "object" || Array.isArray(block.states)))
		throw new TypeError("World fluid block states must be an object");
	return {
		...(block.isWaterlogged === undefined ? {} : { isWaterlogged: block.isWaterlogged === true }),
		states: { ...(block.states ?? {}) },
		typeId: block.typeId
	};
}

function sameBlock(left, right) {
	return stableStringify(normalizeBlock(left)) === stableStringify(normalizeBlock(right));
}

function sameReservation(left, right) {
	return stableStringify(left) === stableStringify(right);
}

function sameFluid(left, right) {
	if (left === undefined || right === undefined)
		return left === right;
	return sameReservation(cloneFluidStack(left), cloneFluidStack(right));
}

function uncertainWorldState(message, cause) {
	const error = new Error(message);
	if (cause !== undefined)
		error.cause = cause;
	error.transactionState = "uncertain";
	return error;
}

function retryWorldTransaction(message, cause) {
	const error = new Error(message);
	if (cause !== undefined)
		error.cause = cause;
	error.transactionState = "retry";
	return error;
}

function validateEscrowAdapter(escrows) {
	if (!escrows || typeof escrows.create !== "function" || typeof escrows.resolve !== "function")
		throw new TypeError("Durable world fluid ports require escrow create and resolve callbacks");
	return escrows;
}

/**
 * Converts only a full, still vanilla source block. Flowing blocks and
 * waterlogged blocks are deliberately excluded because they are not a stable
 * one-bucket representation.
 */
export function fluidFromVanillaSource(block) {
	const normalized = normalizeBlock(block);
	if (!normalized || normalized.isWaterlogged || normalized.states.liquid_depth !== 0)
		return undefined;
	const fluidTypeId = FLUID_BLOCKS.get(normalized.typeId);
	return fluidTypeId ? { amount: VANILLA_SOURCE_FLUID_AMOUNT, typeId: fluidTypeId } : undefined;
}

/**
 * Converts only losslessly representable virtual fluid into a still vanilla
 * source block. Temperature and tags remain virtual-only metadata.
 */
export function vanillaSourceForFluid(fluid) {
	const normalized = cloneFluidStack(fluid);
	if (normalized.amount !== VANILLA_SOURCE_FLUID_AMOUNT || normalized.temperature !== undefined || (normalized.tags?.length ?? 0) !== 0)
		return undefined;
	const blockTypeId = FLUID_BLOCKS.get(normalized.typeId);
	return blockTypeId ? { states: { liquid_depth: 0 }, typeId: blockTypeId } : undefined;
}

/**
 * The general world projection includes Create's static Honey and Chocolate
 * source blocks. It intentionally does not claim to implement vanilla-style
 * flowing-liquid physics; only full source blocks participate in the pipe
 * transaction boundary.
 */
export function fluidFromWorldSource(block) {
	return fluidFromWorldBlock(block);
}

export function worldSourceForFluid(fluid) {
	return worldBlockForFluid(fluid);
}

/**
 * Adapter contract for one world location. When supplied with a private
 * escrow adapter it moves a source into that physical escrow before reporting
 * an in-memory fluid transfer as extracted, so restart recovery can identify
 * the sole owner instead of rolling a second world mutation.
 */
export class VanillaWorldFluidPort {
	#escrows;
	#extractionReceipts = new Map();
	#fluidFromBlock;
	#id;
	#insertionReceipts = new Map();
	#blockForFluid;
	#readBlock;
	#writeBlock;

	constructor({ blockForFluid = vanillaSourceForFluid, escrows, fluidFromBlock = fluidFromVanillaSource, id, readBlock, writeBlock }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("World fluid ports require an identifier");
		if (typeof readBlock !== "function" || typeof writeBlock !== "function")
			throw new TypeError("World fluid ports require block read and write callbacks");
		this.#id = id;
		if (typeof blockForFluid !== "function" || typeof fluidFromBlock !== "function")
			throw new TypeError("World fluid ports require fluid/block conversion functions");
		this.#blockForFluid = blockForFluid;
		this.#fluidFromBlock = fluidFromBlock;
		this.#escrows = escrows === undefined ? undefined : validateEscrowAdapter(escrows);
		this.#readBlock = readBlock;
		this.#writeBlock = writeBlock;
	}

	get id() {
		return this.#id;
	}

	inspect() {
		const block = this.#read();
		return { block, fluid: this.#fluidFromBlock(block), id: this.#id };
	}

	insert(fluid, { delivery, receiptId, sourceReservation, transactionId } = {}) {
		const requested = cloneFluidStack(fluid);
		if (receiptId !== undefined) {
			const existing = this.#insertionReceipts.get(receiptId);
			if (existing) {
				if (!sameReservation(existing.fluid, requested))
					throw new Error(`World fluid insertion receipt ${receiptId} was reused with another fluid stack`);
				return clone(existing.result);
			}
		}
		const witness = sourceReservation?.escrowId !== undefined
			? sourceReservation
			: delivery?.escrowId !== undefined ? delivery : undefined;
		if (witness) {
			const result = this.#insertThroughEscrow(requested, witness);
			if (receiptId !== undefined)
				this.#insertionReceipts.set(receiptId, { fluid: requested, result: clone(result) });
			return result;
		}
		const replacement = this.#blockForFluid(requested);
		if (!replacement)
			return { accepted: undefined, remainder: requested };
		const before = this.#read();
		if (before?.typeId !== AIR_BLOCK.typeId || before.isWaterlogged)
			return { accepted: undefined, remainder: requested };
		this.#writeAndConfirm(before, replacement);
		const result = { accepted: requested, remainder: undefined };
		if (receiptId !== undefined)
			this.#insertionReceipts.set(receiptId, { fluid: requested, result: clone(result) });
		return result;
	}

	prepareDelivery({ fluid, sourceReservation, transactionId }) {
		if (!this.#escrows || sourceReservation?.escrowId !== undefined || !this.#blockForFluid(fluid))
			return undefined;
		if (typeof transactionId !== "string" || transactionId.length === 0)
			throw new TypeError("Durable world fluid deliveries require transaction identifiers");
		const before = this.#read();
		if (!sameBlock(before, AIR_BLOCK) || before.isWaterlogged)
			return undefined;
		const escrow = this.#escrows.create({ portId: this.#id, transactionId });
		if (!escrow || typeof escrow.id !== "string" || escrow.id.length === 0)
			throw new Error("World fluid delivery escrow factories must return stable identifiers");
		return { escrowId: escrow.id, fluid: cloneFluidStack(fluid), transactionId };
	}

	reserve({ maxAmount = Number.MAX_SAFE_INTEGER, predicate = () => true, transactionId } = {}) {
		if (!Number.isSafeInteger(maxAmount) || maxAmount < 1)
			throw new RangeError("World fluid reservation limits must be positive safe integers");
		if (typeof predicate !== "function")
			throw new TypeError("World fluid reservation predicates must be functions");
		const block = this.#read();
		const fluid = this.#fluidFromBlock(block);
		if (!fluid || fluid.amount > maxAmount || !predicate(cloneFluidStack(fluid)))
			return undefined;
		const reservation = {
			fluid,
			revision: stableStringify(block),
			tankId: this.#id
		};
		if (!this.#escrows)
			return reservation;
		if (typeof transactionId !== "string" || transactionId.length === 0)
			throw new TypeError("Durable world fluid reservations require transaction identifiers");
		const escrow = this.#escrows.create({ portId: this.#id, transactionId });
		if (!escrow || typeof escrow.id !== "string" || escrow.id.length === 0)
			throw new Error("World fluid escrow factories must return stable identifiers");
		return { ...reservation, escrowId: escrow.id, transactionId };
	}

	extract(reservation, { receiptId } = {}) {
		if (!reservation || reservation.tankId !== this.#id || typeof reservation.revision !== "string")
			throw new Error("World fluid reservation belongs to another port");
		if (receiptId !== undefined) {
			const existing = this.#extractionReceipts.get(receiptId);
			if (existing) {
				if (!sameReservation(existing.reservation, reservation))
					throw new Error(`World fluid extraction receipt ${receiptId} was reused with another reservation`);
				return cloneFluidStack(existing.fluid);
			}
		}
		if (reservation.escrowId !== undefined)
			return this.#extractThroughEscrow(reservation);
		const before = this.#read();
		const fluid = this.#fluidFromBlock(before);
		if (!fluid || stableStringify(before) !== reservation.revision || !sameReservation(fluid, reservation.fluid))
			throw new Error("World fluid reservation is stale");
		this.#writeAndConfirm(before, AIR_BLOCK);
		if (receiptId !== undefined)
			this.#extractionReceipts.set(receiptId, { fluid: cloneFluidStack(fluid), reservation: clone(reservation) });
		return fluid;
	}

	finalizeReservation(reservation) {
		if (!this.#escrows || reservation?.escrowId === undefined)
			return true;
		const escrow = this.#resolveEscrow(reservation);
		// An already-destroyed entity is the idempotent completed state.
		if (!escrow)
			return true;
		const held = this.#readEscrow(escrow);
		if (held !== undefined && !sameFluid(held, reservation.fluid))
			throw uncertainWorldState("World fluid escrow contains conflicting fluid during retirement");
		if (typeof escrow.retire !== "function")
			throw new Error("World fluid escrow cannot be retired");
		escrow.retire();
		return true;
	}

	#extractThroughEscrow(reservation) {
		const expected = cloneFluidStack(reservation.fluid);
		const escrow = this.#resolveEscrow(reservation);
		if (!escrow)
			throw retryWorldTransaction("World fluid escrow is temporarily unavailable");
		const before = this.#read();
		const sourceFluid = this.#fluidFromBlock(before);
		const escrowFluid = this.#readEscrow(escrow);
		if (sameFluid(sourceFluid, expected) && escrowFluid === undefined) {
			this.#writeEscrow(escrow, expected);
			try {
				this.#writeAndConfirm(before, AIR_BLOCK);
			} catch (error) {
				const after = this.#read();
				if (sameBlock(after, before)) {
					this.#clearEscrow(escrow);
					throw error;
				}
				throw uncertainWorldState("World fluid source changed while moving to escrow", error);
			}
			return expected;
		}
		if (sameBlock(before, AIR_BLOCK) && sameFluid(escrowFluid, expected))
			return expected;
		if (sameFluid(sourceFluid, expected) && sameFluid(escrowFluid, expected)) {
			this.#clearEscrow(escrow);
			throw retryWorldTransaction("World source still owns fluid after escrow write");
		}
		if (sameBlock(before, AIR_BLOCK) && escrowFluid === undefined)
			throw uncertainWorldState("World fluid escrow lost its source fluid");
		throw uncertainWorldState("World fluid escrow ownership is conflicting");
	}

	#insertThroughEscrow(fluid, reservation) {
		const replacement = this.#blockForFluid(fluid);
		if (!replacement)
			return { accepted: undefined, remainder: fluid };
		const escrow = this.#resolveEscrow(reservation);
		if (!escrow)
			throw retryWorldTransaction("World fluid delivery escrow is temporarily unavailable");
		const before = this.#read();
		const escrowFluid = this.#readEscrow(escrow);
		if (sameBlock(before, replacement)) {
			if (sameFluid(escrowFluid, fluid))
				return { accepted: fluid, remainder: undefined };
			throw uncertainWorldState("World fluid target exists without its escrow witness");
		}
		if (!sameBlock(before, AIR_BLOCK) || before.isWaterlogged)
			return { accepted: undefined, remainder: fluid };
		if (escrowFluid === undefined)
			this.#writeEscrow(escrow, fluid);
		else if (!sameFluid(escrowFluid, fluid))
			throw uncertainWorldState("World fluid delivery escrow contains conflicting fluid");
		try {
			this.#writeAndConfirm(before, replacement);
		} catch (error) {
			const after = this.#read();
			if (sameBlock(after, before)) {
				this.#clearEscrow(escrow);
				throw error;
			}
			throw uncertainWorldState("World fluid target changed while receiving escrow", error);
		}
		return { accepted: fluid, remainder: undefined };
	}

	#clearEscrow(escrow) {
		if (typeof escrow.clear !== "function")
			throw new Error("World fluid escrow cannot be cleared");
		escrow.clear();
		if (this.#readEscrow(escrow) !== undefined)
			throw uncertainWorldState("World fluid escrow clear could not be verified");
	}

	#readEscrow(escrow) {
		if (typeof escrow.read !== "function")
			throw new Error("World fluid escrow cannot be inspected");
		const fluid = escrow.read();
		return fluid === undefined ? undefined : cloneFluidStack(fluid);
	}

	#resolveEscrow(reservation) {
		try {
			return this.#escrows.resolve({ escrowId: reservation.escrowId, transactionId: reservation.transactionId });
		} catch (error) {
			throw retryWorldTransaction("World fluid escrow could not be resolved", error);
		}
	}

	#writeEscrow(escrow, fluid) {
		if (typeof escrow.write !== "function")
			throw new Error("World fluid escrow cannot be written");
		escrow.write(cloneFluidStack(fluid));
		if (!sameFluid(this.#readEscrow(escrow), fluid))
			throw uncertainWorldState("World fluid escrow write could not be verified");
	}

	#read() {
		return normalizeBlock(this.#readBlock());
	}

	#writeAndConfirm(before, replacement) {
		let writeError;
		try {
			this.#writeBlock(clone(replacement));
		} catch (error) {
			writeError = error;
		}

		let after;
		try {
			after = this.#read();
		} catch (error) {
			throw uncertainWorldState("World fluid write could not be verified", error);
		}
		if (sameBlock(after, replacement))
			return;
		if (sameBlock(after, before))
			throw writeError ?? new Error("World fluid write was rejected");
		throw uncertainWorldState("World fluid target changed during mutation", writeError);
	}
}
