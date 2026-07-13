export function serializeVersionedState(schemaVersion, payload) {
	if (!Number.isInteger(schemaVersion) || schemaVersion < 1)
		throw new RangeError("Persistent state schema versions must be positive integers");
	return JSON.stringify({ payload, schemaVersion });
}

export function deserializeVersionedState(serialized, { schemaVersion, upgrades = {}, upgradeLegacy = value => value }) {
	if (!Number.isInteger(schemaVersion) || schemaVersion < 1)
		throw new RangeError("Persistent state schema versions must be positive integers");
	if (typeof serialized !== "string")
		throw new TypeError("Persistent state must be a JSON string");

	const parsed = JSON.parse(serialized);
	let version;
	let payload;
	if (parsed && typeof parsed === "object" && Number.isInteger(parsed.schemaVersion) && Object.hasOwn(parsed, "payload")) {
		version = parsed.schemaVersion;
		payload = parsed.payload;
	} else {
		version = 0;
		payload = upgradeLegacy(parsed);
	}

	if (version > schemaVersion)
		throw new RangeError(`Persistent state schema ${version} is newer than supported schema ${schemaVersion}`);
	while (version < schemaVersion) {
		const upgrade = upgrades[version];
		if (typeof upgrade !== "function")
			throw new Error(`Missing persistent state upgrade from schema ${version} to ${version + 1}`);
		payload = upgrade(payload);
		version++;
	}
	return payload;
}
