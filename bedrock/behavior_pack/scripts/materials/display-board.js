export const DISPLAY_BOARD_BLOCK = "createbedrock:display_board";
export const DISPLAY_BOARD_SCHEMA = 1;
export const DISPLAY_BOARD_MAX_WIDTH = 32;
export const DISPLAY_BOARD_MAX_HEIGHT = 32;
export const DISPLAY_BOARD_MAX_LINES = DISPLAY_BOARD_MAX_HEIGHT * 2;
export const DISPLAY_BOARD_MAX_TEXT_LENGTH = 256;
export const DISPLAY_BOARD_COLORS = Object.freeze(["orange", "blue", "green", "red", "white", "yellow"]);
export const DISPLAY_BOARD_MIN_SPEED = 8;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Display Board locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function assertText(value) {
	if (typeof value !== "string" || value.length > DISPLAY_BOARD_MAX_TEXT_LENGTH || /[\r\n]/.test(value))
		throw new TypeError(`Display Board lines must be single-line text up to ${DISPLAY_BOARD_MAX_TEXT_LENGTH} characters`);
	return value;
}

export function displayBoardGroupDirection(facing) {
	if (["north", "south", 2, 3].includes(facing))
		return { x: 1, y: 0, z: 0 };
	if (["east", "west", 4, 5].includes(facing))
		return { x: 0, y: 0, z: 1 };
	throw new TypeError("Display Boards must have a horizontal facing direction");
}

function offset(location, delta) {
	return { x: location.x + delta.x, y: location.y + delta.y, z: location.z + delta.z };
}

function axisCoordinate(location, direction) {
	return direction.x !== 0 ? location.x : location.z;
}

function matchingBoard(readBoard, location, facing) {
	const board = readBoard(assertLocation(location));
	if (!board || board.typeId !== DISPLAY_BOARD_BLOCK || board.facing !== facing)
		return undefined;
	return { ...board, location: assertLocation(location) };
}

/**
 * Create's controller is the lower-left member of an aligned, same-facing board
 * rectangle. This is deterministic and intentionally independent of Script API.
 */
export function collectDisplayBoardGroup({ anchor, readBoard, maxWidth = DISPLAY_BOARD_MAX_WIDTH, maxHeight = DISPLAY_BOARD_MAX_HEIGHT } = {}) {
	if (typeof readBoard !== "function")
		throw new TypeError("Display Board group collection requires a board reader");
	if (!Number.isInteger(maxWidth) || maxWidth < 1 || maxWidth > DISPLAY_BOARD_MAX_WIDTH
		|| !Number.isInteger(maxHeight) || maxHeight < 1 || maxHeight > DISPLAY_BOARD_MAX_HEIGHT)
		throw new RangeError(`Display Board groups are limited to ${DISPLAY_BOARD_MAX_WIDTH} by ${DISPLAY_BOARD_MAX_HEIGHT}`);
	const seedLocation = assertLocation(anchor);
	const seed = readBoard(seedLocation);
	if (!seed || seed.typeId !== DISPLAY_BOARD_BLOCK)
		return undefined;
	const facing = seed.facing;
	const direction = displayBoardGroupDirection(facing);
	const queue = [seedLocation];
	const members = [];
	const visited = new Set();
	const limits = maxWidth * maxHeight;
	for (let index = 0; index < queue.length; index++) {
		const location = queue[index];
		const key = locationKey(location);
		if (visited.has(key))
			continue;
		visited.add(key);
		const board = matchingBoard(readBoard, location, facing);
		if (!board)
			continue;
		members.push(board);
		if (members.length > limits)
			throw new RangeError(`Display Board group exceeds ${maxWidth} by ${maxHeight}`);
		for (const delta of [direction, { x: -direction.x, y: 0, z: -direction.z }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }])
			queue.push(offset(location, delta));
	}
	const horizontal = members.map(board => axisCoordinate(board.location, direction));
	const vertical = members.map(board => board.location.y);
	const minHorizontal = Math.min(...horizontal);
	const maxHorizontal = Math.max(...horizontal);
	const minY = Math.min(...vertical);
	const maxY = Math.max(...vertical);
	const width = maxHorizontal - minHorizontal + 1;
	const height = maxY - minY + 1;
	if (width > maxWidth || height > maxHeight)
		throw new RangeError(`Display Board group exceeds ${maxWidth} by ${maxHeight}`);
	const root = direction.x !== 0
		? { x: minHorizontal, y: minY, z: seedLocation.z }
		: { x: seedLocation.x, y: minY, z: minHorizontal };
	const grid = new Map(members.map(board => [`${axisCoordinate(board.location, direction)}:${board.location.y}`, board]));
	const rectangular = width * height === members.length
		&& Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => grid.has(`${minHorizontal + x}:${minY + y}`)).every(Boolean)).every(Boolean);
	members.sort((left, right) => left.location.y - right.location.y
		|| axisCoordinate(left.location, direction) - axisCoordinate(right.location, direction));
	return { direction, facing, height, members, rectangular, root, width };
}

export function createDisplayBoardState({ lineCount = 2, ...patch } = {}) {
	if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > DISPLAY_BOARD_MAX_LINES)
		throw new RangeError(`Display Board line counts must be from 1 through ${DISPLAY_BOARD_MAX_LINES}`);
	return validateDisplayBoardState({
		schemaVersion: DISPLAY_BOARD_SCHEMA,
		revision: 0,
		lines: Array.from({ length: lineCount }, () => ""),
		color: "orange",
		glowing: false,
		manualLines: true,
		...clone(patch)
	});
}

export function validateDisplayBoardState(state) {
	if (!state || typeof state !== "object" || Array.isArray(state))
		throw new TypeError("Display Board state must be an object");
	if (state.schemaVersion !== DISPLAY_BOARD_SCHEMA)
		throw new Error(`Display Board state must use schema ${DISPLAY_BOARD_SCHEMA}`);
	if (!Number.isSafeInteger(state.revision) || state.revision < 0)
		throw new RangeError("Display Board revisions must be non-negative safe integers");
	if (!Array.isArray(state.lines) || state.lines.length < 1 || state.lines.length > DISPLAY_BOARD_MAX_LINES)
		throw new RangeError(`Display Boards require from 1 through ${DISPLAY_BOARD_MAX_LINES} lines`);
	if (!DISPLAY_BOARD_COLORS.includes(state.color))
		throw new RangeError(`Display Board colors must be one of ${DISPLAY_BOARD_COLORS.join(", ")}`);
	if (typeof state.glowing !== "boolean" || typeof state.manualLines !== "boolean")
		throw new TypeError("Display Board glow and manual-line state must be boolean");
	return clone({ ...state, lines: state.lines.map(assertText) });
}

export function resizeDisplayBoardState(state, lineCount) {
	const current = validateDisplayBoardState(state);
	if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > DISPLAY_BOARD_MAX_LINES)
		throw new RangeError(`Display Board line counts must be from 1 through ${DISPLAY_BOARD_MAX_LINES}`);
	if (current.lines.length === lineCount)
		return current;
	return validateDisplayBoardState({
		...current,
		lines: Array.from({ length: lineCount }, (_, index) => current.lines[index] ?? "")
	});
}

export function configureDisplayBoard({ expectedRevision, patch, state }) {
	const current = validateDisplayBoardState(state);
	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
		throw new RangeError("Display Board edits require a non-negative expected revision");
	if (expectedRevision !== current.revision)
		return { changed: false, conflict: true, state: current };
	if (!patch || typeof patch !== "object" || Array.isArray(patch))
		throw new TypeError("Display Board edits require an object patch");
	const permitted = new Set(["color", "glowing", "lines", "manualLines"]);
	for (const key of Object.keys(patch))
		if (!permitted.has(key))
			throw new Error(`Display Board does not support configuration field ${key}`);
	const next = {
		...current,
		...(patch.color === undefined ? {} : { color: patch.color }),
		...(patch.glowing === undefined ? {} : { glowing: patch.glowing }),
		...(patch.lines === undefined ? {} : { lines: patch.lines }),
		...(patch.manualLines === undefined ? {} : { manualLines: patch.manualLines })
	};
	const normalized = validateDisplayBoardState(next);
	if (JSON.stringify(normalized) === JSON.stringify(current))
		return { changed: false, conflict: false, state: current };
	return { changed: true, conflict: false, state: { ...normalized, revision: current.revision + 1 } };
}

export function displayBoardCanRender(state, speed) {
	const current = validateDisplayBoardState(state);
	return Number.isFinite(speed) && Math.abs(speed) >= DISPLAY_BOARD_MIN_SPEED && current.lines.some(line => line.length > 0);
}
