export class DiagnosticsRegistry {
	#providers = new Map();

	register(name, provider) {
		if (typeof name !== "string" || name.length === 0)
			throw new TypeError("Diagnostic providers require a name");
		if (typeof provider !== "function")
			throw new TypeError("Diagnostic providers must be functions");
		if (this.#providers.has(name))
			throw new Error(`Diagnostic provider ${name} already exists`);
		this.#providers.set(name, provider);
	}

	collect() {
		const providers = {};
		const failures = {};
		for (const [name, provider] of this.#providers) {
			try {
				providers[name] = provider();
			} catch (error) {
				failures[name] = String(error);
			}
		}
		return { failures, providers };
	}
}
