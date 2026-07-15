import { cloneFluidStack, fluidReservationFingerprint } from "./fluid-stack.js";

function assertFluidType(typeId) {
	if (typeof typeId !== "string" || typeId.length === 0)
		throw new TypeError("Creative fluid ports require a fluid identifier");
	return typeId;
}

function assertMaximum(maxAmount) {
	if (!Number.isSafeInteger(maxAmount) || maxAmount < 1)
		throw new RangeError("Creative fluid reservations require a positive safe-integer limit");
	return maxAmount;
}

// A Creative Fluid Tank is a stable, inexhaustible source. It deliberately
// participates in the same reserve/extract protocol as normal tanks so a
// persisted transfer can be safely resumed or abandoned after reload.
export class CreativeFluidPort {
	#fluidType;
	#id;

	constructor({ fluidType = "minecraft:water", id }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Creative fluid ports require an identifier");
		this.#id = id;
		this.#fluidType = assertFluidType(fluidType);
	}

	get id() {
		return this.#id;
	}

	get fluidType() {
		return this.#fluidType;
	}

	inspect() {
		return {
			contents: { amount: Number.MAX_SAFE_INTEGER, typeId: this.#fluidType },
			creative: true,
			id: this.#id
		};
	}

	setFluidType(typeId) {
		const normalized = assertFluidType(typeId);
		if (normalized === this.#fluidType)
			return false;
		this.#fluidType = normalized;
		return true;
	}

	reserve({ maxAmount = Number.MAX_SAFE_INTEGER, predicate = () => true } = {}) {
		assertMaximum(maxAmount);
		if (typeof predicate !== "function")
			throw new TypeError("Creative fluid reservation predicates must be functions");
		const fluid = { amount: maxAmount, typeId: this.#fluidType };
		if (!predicate(cloneFluidStack(fluid)))
			return undefined;
		return { fluid, portId: this.#id, typeId: this.#fluidType };
	}

	extract(reservation, { receiptId } = {}) {
		if (!reservation || reservation.portId !== this.#id || reservation.typeId !== this.#fluidType)
			throw new Error("Creative fluid reservation no longer matches the selected fluid");
		if (receiptId !== undefined && (typeof receiptId !== "string" || receiptId.length === 0))
			throw new TypeError("Creative fluid extraction receipts require an identifier");
		const fluid = cloneFluidStack(reservation.fluid);
		if (fluid.typeId !== this.#fluidType || fluidReservationFingerprint(reservation).length === 0)
			throw new Error("Creative fluid reservation is invalid");
		return fluid;
	}

	insert(fluid) {
		const requested = cloneFluidStack(fluid);
		return { accepted: undefined, remainder: requested };
	}
}
