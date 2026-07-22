/**
 * Shared server-authoritative contract for editable block and item state.
 * Domain modules keep their own schema and validation; this module supplies
 * the common compare-and-swap and asynchronous-form boundaries.
 */
export const CONFIGURATION_PROTOCOL_SCHEMA_VERSION = 1;

const SUBJECT_ID = /^[a-z0-9][a-z0-9_.:/-]{2,255}$/;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

export function normalizeConfigurationEditorId(value) {
	if (value === undefined || value === null)
		return "";
	if (typeof value !== "string" || value.length > 128)
		throw new TypeError("Configuration editors must be short identifiers");
	return value;
}

export function assertConfigurationRevision(value, label = "Configuration revision") {
	if (!Number.isSafeInteger(value) || value < 0)
		throw new RangeError(`${label} must be a non-negative safe integer`);
	return value;
}

export function openConfigurationFormSession({ revision, subjectId }) {
	if (typeof subjectId !== "string" || !SUBJECT_ID.test(subjectId))
		throw new TypeError("Configuration form sessions require a stable subject identifier");
	return Object.freeze({
		protocolVersion: CONFIGURATION_PROTOCOL_SCHEMA_VERSION,
		revision: assertConfigurationRevision(revision, "Configuration form revision"),
		subjectId
	});
}

export function validateConfigurationFormSession(session) {
	if (!session || typeof session !== "object" || Array.isArray(session)
		|| session.protocolVersion !== CONFIGURATION_PROTOCOL_SCHEMA_VERSION)
		throw new TypeError("Unsupported configuration form session");
	return openConfigurationFormSession(session);
}

/**
 * Guards an asynchronous ModalFormData response before it reaches a domain
 * mutation. `actualRevision` may be a callback so the latest authoritative
 * record is read after the player closes the form, not when it opens.
 */
export function submitVersionedConfigurationForm({ actualRevision, session, submit }) {
	const opened = validateConfigurationFormSession(session);
	if (typeof submit !== "function")
		throw new TypeError("Configuration form submissions require a commit callback");
	const currentRevision = assertConfigurationRevision(
		typeof actualRevision === "function" ? actualRevision() : actualRevision,
		"Current configuration revision"
	);
	if (currentRevision !== opened.revision)
		return { changed: false, conflict: true };
	const result = submit(opened.revision);
	if (typeof result === "boolean")
		return { changed: result, conflict: false };
	if (!result || typeof result !== "object" || typeof result.changed !== "boolean" || typeof result.conflict !== "boolean")
		throw new TypeError("Configuration commit callbacks must return a boolean or { changed, conflict }");
	return { ...result, changed: result.changed, conflict: result.conflict };
}

/**
 * Apply one domain-validated compare-and-swap edit. State remains owned by
 * the caller: no generic protocol is allowed to bypass field validation,
 * inventory authority, or persistence ownership in a feature module.
 */
export function applyVersionedConfiguration({
	apply,
	changed,
	current,
	editorId,
	editorKey,
	expectedRevision,
	revisionKey = "revision",
	validate
}) {
	if (typeof validate !== "function" || typeof apply !== "function")
		throw new TypeError("Versioned configuration edits require validate and apply callbacks");
	if (typeof revisionKey !== "string" || revisionKey.length === 0)
		throw new TypeError("Configuration revision keys must be non-empty strings");
	if (editorKey !== undefined && (typeof editorKey !== "string" || editorKey.length === 0))
		throw new TypeError("Configuration editor keys must be non-empty strings");
	const normalizedCurrent = validate(current);
	const currentRevision = assertConfigurationRevision(normalizedCurrent?.[revisionKey], "Stored configuration revision");
	const expected = assertConfigurationRevision(expectedRevision, "Expected configuration revision");
	if (expected !== currentRevision)
		return { changed: false, conflict: true, state: normalizedCurrent };
	const candidate = validate(apply(clone(normalizedCurrent)));
	const hasChanged = changed === undefined ? JSON.stringify(candidate) !== JSON.stringify(normalizedCurrent) : changed === true;
	if (!hasChanged)
		return { changed: false, conflict: false, state: normalizedCurrent };
	const next = { ...candidate, [revisionKey]: currentRevision + 1 };
	if (editorKey !== undefined)
		next[editorKey] = normalizeConfigurationEditorId(editorId);
	return { changed: true, conflict: false, state: validate(next) };
}
