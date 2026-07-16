export const CLIPBOARD_STATE_SCHEMA = 1;
export const CLIPBOARD_MAX_TEXT_LENGTH = 2_048;

export function createClipboardState({ revision = 0, text = "" } = {}) {
	if (typeof text !== "string" || text.length > CLIPBOARD_MAX_TEXT_LENGTH)
		throw new RangeError(`Clipboard text must contain at most ${CLIPBOARD_MAX_TEXT_LENGTH} characters`);
	if (!Number.isInteger(revision) || revision < 0 || revision > Number.MAX_SAFE_INTEGER)
		throw new TypeError("Clipboard revision must be a non-negative safe integer");
	return { revision, schemaVersion: CLIPBOARD_STATE_SCHEMA, text };
}

export function normalizeClipboardRecord(value) {
	if (typeof value?.dimensionId !== "string" || value.dimensionId.length === 0 || value.dimensionId.length > 128)
		throw new TypeError("Clipboard records require a dimension identifier");
	if (![value?.location?.x, value?.location?.y, value?.location?.z].every(Number.isInteger))
		throw new TypeError("Clipboard records require an integer block location");
	const id = `clipboard:${value.dimensionId}:${value.location.x}:${value.location.y}:${value.location.z}`;
	if (value.id !== undefined && value.id !== id)
		throw new Error("Clipboard record identity does not match its location");
	return {
		dimensionId: value.dimensionId,
		id,
		location: { x: value.location.x, y: value.location.y, z: value.location.z },
		state: createClipboardState(value.state)
	};
}
