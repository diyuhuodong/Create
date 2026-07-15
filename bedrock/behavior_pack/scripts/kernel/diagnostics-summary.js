const MAX_DEPTH = 4;
const SENSITIVE_KEY = /(?:contents?|delivery|dimension|entity|inventory|item|location|metadata|player|record|reservation|slot|source|stack|target)/i;

function summarizeString(value) {
	const compact = value
		.replace(/[\r\n\t]+/g, " ")
		.replace(/\{[^{}]*\}|\[[^\[\]]*\]/g, "<redacted>")
		.replace(/\s{2,}/g, " ");
	return compact.length <= 160 ? compact : `${compact.slice(0, 157)}...`;
}

function summarizeValue(value, key = "", depth = 0) {
	if (SENSITIVE_KEY.test(key) && typeof value !== "number" && typeof value !== "boolean")
		return undefined;
	if (typeof value === "number" || typeof value === "boolean" || value === null)
		return value;
	if (typeof value === "string")
		return summarizeString(value);
	if (Array.isArray(value))
		return { count: value.length };
	if (!value || typeof value !== "object" || depth >= MAX_DEPTH)
		return undefined;

	const summary = {};
	for (const [childKey, child] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
		const summarized = summarizeValue(child, childKey, depth + 1);
		if (summarized !== undefined)
			summary[childKey] = summarized;
	}
	return summary;
}

function schedulerSummary(groups) {
	let budget = 0;
	let failed = 0;
	let pending = 0;
	for (const group of Object.values(groups ?? {})) {
		budget += Number.isFinite(group?.budget) ? group.budget : 0;
		failed += Number.isFinite(group?.failed) ? group.failed : 0;
		pending += Number.isFinite(group?.pending) ? group.pending : 0;
	}
	return { budget, failed, groups: Object.keys(groups ?? {}).length, pending };
}

// This is the public surface for /scriptevent createbedrock:diagnostics. It
// preserves counters and errors needed for operations while excluding stacks,
// inventories, player data, locations, and transaction payloads.
export function createDiagnosticsSummary(diagnostics) {
	const providers = summarizeValue(diagnostics?.providers ?? {}, "providers") ?? {};
	const failures = summarizeValue(diagnostics?.failures ?? {}, "failures") ?? {};
	const performance = summarizeValue(diagnostics?.performance ?? {}, "performance") ?? {};
	const scheduler = summarizeValue(diagnostics?.scheduler ?? {}, "scheduler") ?? {};
	return {
		failures,
		kernel: schedulerSummary(diagnostics?.scheduler),
		performance,
		providers,
		scheduler
	};
}

export function serializeDiagnosticsSummary(diagnostics, maximumLength = 1800) {
	if (!Number.isInteger(maximumLength) || maximumLength < 64)
		throw new RangeError("Diagnostic message length must be at least 64 characters");
	const summary = createDiagnosticsSummary(diagnostics);
	const serialized = JSON.stringify(summary);
	if (serialized.length <= maximumLength)
		return serialized;
	return JSON.stringify({
		failures: Object.keys(summary.failures),
		kernel: summary.kernel,
		providerCount: Object.keys(summary.providers).length,
		truncated: true
	});
}
