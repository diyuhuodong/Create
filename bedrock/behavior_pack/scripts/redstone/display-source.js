/** Java's display-source registry expressed as a bounded Bedrock extension
 * point. Feature packages register only the samples they own; Display Link
 * never reads private inventories, train state, or boiler state directly. */
export const DISPLAY_SOURCE_KINDS = Object.freeze([
	"death_count", "scoreboard", "enchant_power", "redstone_power", "nixie_tube", "item_names", "boiler", "current_floor",
	"fill_level", "gauge_status", "entity_name", "time_of_day", "stopwatch", "kinetic_speed", "kinetic_stress", "station_summary",
	"train_status", "observed_train_name", "accumulate_items", "item_throughput", "count_items", "list_items", "count_fluids",
	"list_fluids", "read_package_address", "computer"
]);

export const DISPLAY_TARGET_KINDS = Object.freeze(["nixie_tube", "display_board", "sign", "lectern"]);
export const MAX_DISPLAY_SOURCE_LINES = 16;
export const MAX_DISPLAY_SOURCE_TEXT_LENGTH = 256;

const sourceProviders = new Map();

function assertText(value) {
	if (typeof value !== "string" || value.length > MAX_DISPLAY_SOURCE_TEXT_LENGTH || /[\r\n]/.test(value))
		throw new TypeError(`Display source lines must be single-line text up to ${MAX_DISPLAY_SOURCE_TEXT_LENGTH} characters`);
	return value;
}

export function normalizeDisplaySourceKind(kind) {
	if (kind === "redstone_signal")
		return "redstone_power";
	if (!DISPLAY_SOURCE_KINDS.includes(kind))
		throw new RangeError(`Unknown Display Source ${kind}`);
	return kind;
}

export function normalizeDisplayTargetKind(kind) {
	if (!DISPLAY_TARGET_KINDS.includes(kind))
		throw new RangeError(`Unknown Display Target ${kind}`);
	return kind;
}

export function normalizeDisplaySourceLines(value) {
	const lines = Array.isArray(value) ? value : [value];
	if (lines.length < 1 || lines.length > MAX_DISPLAY_SOURCE_LINES)
		throw new RangeError(`Display Sources must provide from 1 through ${MAX_DISPLAY_SOURCE_LINES} lines`);
	return lines.map(line => assertText(typeof line === "number" ? String(line) : line));
}

/** Register a server-owned source adapter. Later packages (logistics, boiler,
 * trains) may add their samples without Display Link importing their runtime. */
export function registerDisplaySourceProvider(kind, provider) {
	kind = normalizeDisplaySourceKind(kind);
	if (typeof provider !== "function")
		throw new TypeError("Display Source providers must be functions");
	if (sourceProviders.has(kind))
		throw new Error(`Display Source ${kind} already has a provider`);
	sourceProviders.set(kind, provider);
	return () => sourceProviders.delete(kind);
}

export function displaySourceProviderKinds() {
	return [...sourceProviders.keys()].sort();
}

export function resolveDisplaySource({ context, kind, location }) {
	kind = normalizeDisplaySourceKind(kind);
	const provider = sourceProviders.get(kind);
	if (!provider)
		return undefined;
	const lines = provider({ context, kind, location });
	return lines === undefined ? undefined : normalizeDisplaySourceLines(lines);
}
