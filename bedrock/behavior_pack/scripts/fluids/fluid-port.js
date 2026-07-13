import { cloneFluidStack } from "./fluid-stack.js";

export class FluidPort {
	#accepts;
	#extractionEnabled;
	#insertionEnabled;
	#tank;

	constructor({ accepts = () => true, extractionEnabled = true, insertionEnabled = true, tank }) {
		if (!tank || typeof tank.id !== "string" || typeof tank.insert !== "function" || typeof tank.reserve !== "function" || typeof tank.extract !== "function")
			throw new TypeError("Fluid ports require a tank endpoint");
		if (typeof accepts !== "function")
			throw new TypeError("Fluid port acceptance predicates must be functions");
		if (typeof extractionEnabled !== "boolean" || typeof insertionEnabled !== "boolean")
			throw new TypeError("Fluid port directions must be boolean");
		this.#accepts = accepts;
		this.#extractionEnabled = extractionEnabled;
		this.#insertionEnabled = insertionEnabled;
		this.#tank = tank;
	}

	get id() {
		return this.#tank.id;
	}

	inspect() {
		return this.#tank.inspect();
	}

	insert(fluid, options) {
		const requested = cloneFluidStack(fluid);
		if (!this.#insertionEnabled || !this.#accepts(requested))
			return { accepted: undefined, remainder: requested };
		return this.#tank.insert(requested, options);
	}

	extract(reservation, options) {
		if (!this.#extractionEnabled)
			throw new Error("Fluid port does not allow extraction");
		return this.#tank.extract(reservation, options);
	}

	reserve({ predicate = () => true, ...options } = {}) {
		if (!this.#extractionEnabled)
			return undefined;
		if (typeof predicate !== "function")
			throw new TypeError("Fluid reservation predicates must be functions");
		return this.#tank.reserve({
			...options,
			predicate: fluid => this.#accepts(fluid) && predicate(fluid)
		});
	}
}
