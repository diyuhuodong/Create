import { cloneFluidStack } from "./fluid-stack.js";

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

function uncertainWorldState(message, cause) {
	const error = new Error(message);
	if (cause !== undefined)
		error.cause = cause;
	error.transactionState = "uncertain";
	return error;
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
 * Adapter contract for one world location. It is intentionally detached from
 * FluidNetworkState until a durable in-world escrow marker is added: deleting a
 * vanilla source before an escrow record commits would otherwise lose fluid on
 * a process crash.
 */
export class VanillaWorldFluidPort {
	#extractionReceipts = new Map();
	#id;
	#insertionReceipts = new Map();
	#readBlock;
	#writeBlock;

	constructor({ id, readBlock, writeBlock }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("World fluid ports require an identifier");
		if (typeof readBlock !== "function" || typeof writeBlock !== "function")
			throw new TypeError("World fluid ports require block read and write callbacks");
		this.#id = id;
		this.#readBlock = readBlock;
		this.#writeBlock = writeBlock;
	}

	get id() {
		return this.#id;
	}

	inspect() {
		const block = this.#read();
		return { block, fluid: fluidFromVanillaSource(block), id: this.#id };
	}

	insert(fluid, { receiptId } = {}) {
		const requested = cloneFluidStack(fluid);
		if (receiptId !== undefined) {
			const existing = this.#insertionReceipts.get(receiptId);
			if (existing) {
				if (!sameReservation(existing.fluid, requested))
					throw new Error(`World fluid insertion receipt ${receiptId} was reused with another fluid stack`);
				return clone(existing.result);
			}
		}
		const replacement = vanillaSourceForFluid(requested);
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

	reserve({ maxAmount = Number.MAX_SAFE_INTEGER, predicate = () => true } = {}) {
		if (!Number.isSafeInteger(maxAmount) || maxAmount < 1)
			throw new RangeError("World fluid reservation limits must be positive safe integers");
		if (typeof predicate !== "function")
			throw new TypeError("World fluid reservation predicates must be functions");
		const block = this.#read();
		const fluid = fluidFromVanillaSource(block);
		if (!fluid || fluid.amount > maxAmount || !predicate(cloneFluidStack(fluid)))
			return undefined;
		return {
			fluid,
			revision: stableStringify(block),
			tankId: this.#id
		};
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
		const before = this.#read();
		const fluid = fluidFromVanillaSource(before);
		if (!fluid || stableStringify(before) !== reservation.revision || !sameReservation(fluid, reservation.fluid))
			throw new Error("World fluid reservation is stale");
		this.#writeAndConfirm(before, AIR_BLOCK);
		if (receiptId !== undefined)
			this.#extractionReceipts.set(receiptId, { fluid: cloneFluidStack(fluid), reservation: clone(reservation) });
		return fluid;
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
