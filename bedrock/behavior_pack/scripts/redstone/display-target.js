import { normalizeDisplaySourceKind, normalizeDisplaySourceLines } from "./display-source.js";

export const DISPLAY_TARGET_SCHEMA = 1;
export const MAX_DISPLAY_LINES = 16;
export const MAX_DISPLAY_TEXT_LENGTH = 256;
export const DISPLAY_COLORS = Object.freeze(["orange", "blue", "green", "red", "white", "yellow"]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertText(value) {
	if (typeof value !== "string" || value.length > MAX_DISPLAY_TEXT_LENGTH || /[\r\n]/.test(value))
		throw new TypeError(`Display lines must be single-line text up to ${MAX_DISPLAY_TEXT_LENGTH} characters`);
	return value;
}

function assertLine(line, lineCount) {
	if (!Number.isInteger(line) || line < 0 || line >= lineCount)
		throw new RangeError("Display target line is outside the configured line range");
	return line;
}

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Display link offsets must resolve to integer block locations");
	return { x: location.x, y: location.y, z: location.z };
}

function addOffset(location, x, y, z) {
	return assertLocation({ x: location.x + x, y: location.y + y, z: location.z + z });
}

function offset(settings, prefix, fallback) {
	const value = settings?.[`${prefix}Offset${fallback.axis}`] ?? fallback.value;
	if (!Number.isInteger(value) || value < -64 || value > 64)
		throw new RangeError(`Display Link ${prefix} offset ${fallback.axis} must be an integer from -64 through 64`);
	return value;
}

/** A target document travels with its Nixie block and is independent of rendering. */
export function createDisplayTargetState({ brightness = 15, color = "orange", lineCount = 1 } = {}) {
	if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > MAX_DISPLAY_LINES)
		throw new RangeError(`Display target line counts must be from 1 through ${MAX_DISPLAY_LINES}`);
	if (!DISPLAY_COLORS.includes(color))
		throw new RangeError(`Display colors must be one of ${DISPLAY_COLORS.join(", ")}`);
	if (!Number.isInteger(brightness) || brightness < 0 || brightness > 15)
		throw new RangeError("Display brightness must be an integer from 0 through 15");
	return {
		schemaVersion: DISPLAY_TARGET_SCHEMA,
		revision: 0,
		lines: Array.from({ length: lineCount }, () => ""),
		style: { brightness, color }
	};
}

/** Accepts v1 data and fills absent target data from pre-R5 saves. */
export function normalizeDisplayTargetState(value) {
	if (value === undefined || value === null)
		return createDisplayTargetState();
	if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== DISPLAY_TARGET_SCHEMA)
		throw new TypeError(`Display target state must use schema ${DISPLAY_TARGET_SCHEMA}`);
	if (!Number.isInteger(value.revision) || value.revision < 0 || value.revision > Number.MAX_SAFE_INTEGER)
		throw new RangeError("Display target revisions must be non-negative safe integers");
	if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > MAX_DISPLAY_LINES)
		throw new RangeError(`Display targets require from 1 through ${MAX_DISPLAY_LINES} lines`);
	if (!value.style || !DISPLAY_COLORS.includes(value.style.color) || !Number.isInteger(value.style.brightness) || value.style.brightness < 0 || value.style.brightness > 15)
		throw new TypeError("Display target style is invalid");
	return {
		schemaVersion: DISPLAY_TARGET_SCHEMA,
		revision: value.revision,
		lines: value.lines.map(assertText),
		style: { brightness: value.style.brightness, color: value.style.color }
	};
}

export function writeDisplayTargetLine(state, { line = 0, text } = {}) {
	const current = normalizeDisplayTargetState(state);
	assertLine(line, current.lines.length);
	const nextText = assertText(text);
	if (current.lines[line] === nextText)
		return { changed: false, state: current };
	const lines = [...current.lines];
	lines[line] = nextText;
	return {
		changed: true,
		state: { ...current, lines, revision: current.revision + 1 }
	};
}

export function configureDisplayTargetStyle(state, { brightness, color } = {}) {
	const current = normalizeDisplayTargetState(state);
	const style = {
		brightness: brightness ?? current.style.brightness,
		color: color ?? current.style.color
	};
	if (!DISPLAY_COLORS.includes(style.color))
		throw new RangeError(`Display colors must be one of ${DISPLAY_COLORS.join(", ")}`);
	if (!Number.isInteger(style.brightness) || style.brightness < 0 || style.brightness > 15)
		throw new RangeError("Display brightness must be an integer from 0 through 15");
	if (style.color === current.style.color && style.brightness === current.style.brightness)
		return { changed: false, state: current };
	return { changed: true, state: { ...current, revision: current.revision + 1, style } };
}

/** Resolve a saved Display Link configuration without reading world state itself. */
export function resolveDisplayLinkWrite({ configuration, location, readSource }) {
	if (typeof readSource !== "function")
		throw new TypeError("Display Links require a source reader");
	const settings = configuration?.settings ?? {};
	const sourceKind = normalizeDisplaySourceKind(settings.sourceKind ?? "redstone_power");
	const anchor = assertLocation(location);
	const source = addOffset(anchor,
		offset(settings, "source", { axis: "X", value: 0 }),
		offset(settings, "source", { axis: "Y", value: 0 }),
		offset(settings, "source", { axis: "Z", value: -1 }));
	const target = addOffset(anchor,
		offset(settings, "target", { axis: "X", value: 0 }),
		offset(settings, "target", { axis: "Y", value: 0 }),
		offset(settings, "target", { axis: "Z", value: 1 }));
	const line = settings.targetLine ?? 0;
	if (!Number.isInteger(line) || line < 0 || line >= MAX_DISPLAY_LINES)
		throw new RangeError(`Display Link target lines must be from 0 through ${MAX_DISPLAY_LINES - 1}`);
	const sourceLine = settings.sourceLine ?? 0;
	if (!Number.isInteger(sourceLine) || sourceLine < 0 || sourceLine >= MAX_DISPLAY_LINES)
		throw new RangeError(`Display Link source lines must be from 0 through ${MAX_DISPLAY_LINES - 1}`);
	const lines = normalizeDisplaySourceLines(readSource({ kind: sourceKind, location: source }));
	if (sourceLine >= lines.length)
		throw new RangeError(`Display Source ${sourceKind} did not provide line ${sourceLine}`);
	return { line, source, sourceKind, sourceLine, target, text: lines[sourceLine] };
}
