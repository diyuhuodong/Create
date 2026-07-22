const adapters = [];

function nonEmpty(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`${label} must be a non-empty string`);
	return value;
}

function normalizedSnapshot(value, adapterId) {
	if (!value)
		return undefined;
	const lines = Array.isArray(value.lines) ? value.lines.filter(line => typeof line === "string") : [];
	return {
		adapterId,
		lines,
		revision: Number.isInteger(value.revision) ? value.revision : 0,
		severity: ["info", "warning", "error"].includes(value.severity) ? value.severity : "info",
		title: nonEmpty(value.title, "Goggles diagnostics title")
	};
}

export function registerGogglesDiagnosticAdapter({ id, inspect, supports }) {
	id = nonEmpty(id, "Goggles adapter id");
	if (adapters.some(adapter => adapter.id === id))
		throw new Error(`Duplicate Goggles adapter ${id}`);
	if (typeof supports !== "function" || typeof inspect !== "function")
		throw new TypeError("Goggles adapters require supports and inspect callbacks");
	adapters.push({ id, inspect, supports });
	return () => {
		const index = adapters.findIndex(adapter => adapter.id === id);
		if (index >= 0)
			adapters.splice(index, 1);
	};
}

export function queryGogglesDiagnostics(context) {
	for (const adapter of adapters) {
		if (!adapter.supports(context))
			continue;
		const snapshot = normalizedSnapshot(adapter.inspect(context), adapter.id);
		if (snapshot)
			return snapshot;
	}
	return undefined;
}

export function gogglesDiagnosticAdapterIds() {
	return adapters.map(adapter => adapter.id);
}

export function clearGogglesDiagnosticAdaptersForTesting() {
	adapters.length = 0;
}
