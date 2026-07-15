function assertLocation(location) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError("Elevator contacts require integer block locations");
	return { x: location.x, y: location.y, z: location.z };
}

function assertText(value, label) {
	if (typeof value !== "string" || value.length === 0 || value.length > 32 || /[\u0000-\u001f\u007f]/.test(value))
		throw new TypeError(`${label} must be printable text up to 32 characters`);
	return value;
}

function assertDimensionId(dimensionId) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Elevator contacts require a dimension identifier");
	return dimensionId;
}

function assertFacing(facing) {
	if (!["north", "south", "east", "west"].includes(facing))
		throw new TypeError("Elevator contacts require a horizontal facing");
	return facing;
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function contactKey(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function columnKey(dimensionId, { x, z, facing }) {
	return `${dimensionId}:${x}:${z}:${facing}`;
}

function normalizeColumn(column) {
	if (!column || !Number.isInteger(column.x) || !Number.isInteger(column.z))
		throw new TypeError("Elevator columns require integer x/z coordinates");
	return { facing: assertFacing(column.facing), x: column.x, z: column.z };
}

/** Durable floor registry independent of an eventual elevator drive implementation. */
export class ElevatorColumnRegistry {
	#columns = new Map();
	#contacts = new Map();

	registerContact({ dimensionId, facing, floorId, floorName, location }) {
		const normalizedDimension = assertDimensionId(dimensionId);
		const normalizedLocation = assertLocation(location);
		const normalizedFacing = assertFacing(facing);
		const id = contactKey(normalizedDimension, normalizedLocation);
		const existing = this.#contacts.get(id);
		const contact = {
			dimensionId: normalizedDimension,
			facing: normalizedFacing,
			floorId: assertText(floorId ?? existing?.floorId ?? String(normalizedLocation.y), "Elevator floor IDs"),
			floorName: assertText(floorName ?? existing?.floorName ?? String(normalizedLocation.y), "Elevator floor names"),
			location: normalizedLocation,
			revision: existing?.revision ?? 0
		};
		if (existing && (existing.facing !== contact.facing || existing.floorId !== contact.floorId || existing.floorName !== contact.floorName))
			contact.revision++;
		this.#contacts.set(id, contact);
		this.#ensureColumn(contact);
		if (existing && this.#columnKeyFor(existing) !== this.#columnKeyFor(contact))
			this.#pruneColumn(existing);
		return clone(contact);
	}

	configureContact({ dimensionId, expectedRevision, location, patch }) {
		const contact = this.#requireContact(dimensionId, location);
		if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
			throw new TypeError("Elevator contact edits require a non-negative revision");
		if (expectedRevision !== contact.revision)
			return { changed: false, conflict: true, contact: clone(contact) };
		if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some(key => !["floorId", "floorName"].includes(key)))
			throw new TypeError("Elevator contact edits only accept a floor ID and display name");
		const next = {
			...contact,
			floorId: patch.floorId === undefined ? contact.floorId : assertText(patch.floorId, "Elevator floor IDs"),
			floorName: patch.floorName === undefined ? contact.floorName : assertText(patch.floorName, "Elevator floor names")
		};
		if (next.floorId === contact.floorId && next.floorName === contact.floorName)
			return { changed: false, conflict: false, contact: clone(contact) };
		next.revision++;
		this.#contacts.set(contactKey(contact.dimensionId, contact.location), next);
		return { changed: true, conflict: false, contact: clone(next) };
	}

	contactAt(dimensionId, location) {
		const contact = this.#contacts.get(contactKey(assertDimensionId(dimensionId), assertLocation(location)));
		return contact && clone(contact);
	}

	contactsInColumn(dimensionId, column) {
		const key = columnKey(assertDimensionId(dimensionId), normalizeColumn(column));
		return [...this.#contacts.values()]
			.filter(contact => this.#columnKeyFor(contact) === key)
			.sort((left, right) => left.location.y - right.location.y)
			.map(clone);
	}

	requestFloor({ column, dimensionId, floorId }) {
		const normalizedDimension = assertDimensionId(dimensionId);
		const normalizedColumn = normalizeColumn(column);
		const targetFloor = assertText(floorId, "Elevator floor IDs");
		const contacts = this.contactsInColumn(normalizedDimension, normalizedColumn);
		const target = contacts.find(contact => contact.floorId === targetFloor);
		if (!target)
			return { ok: false, reason: "unknown_floor" };
		const key = columnKey(normalizedDimension, normalizedColumn);
		const state = this.#columns.get(key) ?? { active: false, column: normalizedColumn, currentFloorId: "", currentFloorName: "", dimensionId: normalizedDimension };
		state.active = true;
		state.targetFloorId = target.floorId;
		state.targetY = target.location.y;
		this.#columns.set(key, state);
		return { ok: true, target: clone(target) };
	}

	reportFloorReached({ dimensionId, location }) {
		const contact = this.#requireContact(dimensionId, location);
		const key = this.#columnKeyFor(contact);
		const state = this.#columns.get(key) ?? this.#ensureColumn(contact);
		state.active = false;
		state.currentFloorId = contact.floorId;
		state.currentFloorName = contact.floorName;
		state.targetFloorId = undefined;
		state.targetY = undefined;
		return {
			column: clone(state.column),
			contacts: this.contactsInColumn(contact.dimensionId, state.column),
			currentFloorId: contact.floorId,
			currentFloorName: contact.floorName
		};
	}

	columnState(dimensionId, column) {
		const state = this.#columns.get(columnKey(assertDimensionId(dimensionId), normalizeColumn(column)));
		return state && clone(state);
	}

	removeContact(dimensionId, location) {
		const key = contactKey(assertDimensionId(dimensionId), assertLocation(location));
		const contact = this.#contacts.get(key);
		if (!contact)
			return false;
		this.#contacts.delete(key);
		this.#pruneColumn(contact);
		return true;
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Elevator registry restore requires records");
		const contacts = new Map();
		const columns = new Map();
		for (const record of records) {
			if (record?.kind === "elevator_contact") {
				const contact = this.#normalizeContactRecord(record);
				const key = contactKey(contact.dimensionId, contact.location);
				if (contacts.has(key))
					throw new Error(`Duplicate elevator contact ${key}`);
				contacts.set(key, contact);
				continue;
			}
			if (record?.kind === "elevator_column") {
				const state = this.#normalizeColumnRecord(record);
				const key = columnKey(state.dimensionId, state.column);
				if (columns.has(key))
					throw new Error(`Duplicate elevator column ${key}`);
				columns.set(key, state);
				continue;
			}
			throw new TypeError("Unknown elevator registry record");
		}
		this.#contacts = contacts;
		this.#columns = columns;
		for (const contact of contacts.values())
			this.#ensureColumn(contact);
	}

	snapshot() {
		const contacts = [...this.#contacts.values()]
			.map(contact => ({ ...clone(contact), kind: "elevator_contact" }))
			.sort((left, right) => contactKey(left.dimensionId, left.location).localeCompare(contactKey(right.dimensionId, right.location)));
		const columns = [...this.#columns.values()]
			.map(state => ({ ...clone(state), kind: "elevator_column" }))
			.sort((left, right) => columnKey(left.dimensionId, left.column).localeCompare(columnKey(right.dimensionId, right.column)));
		return [...contacts, ...columns];
	}

	#columnKeyFor(contact) {
		return columnKey(contact.dimensionId, { facing: contact.facing, x: contact.location.x, z: contact.location.z });
	}

	#ensureColumn(contact) {
		const key = this.#columnKeyFor(contact);
		let state = this.#columns.get(key);
		if (!state) {
			state = {
				active: false,
				column: { facing: contact.facing, x: contact.location.x, z: contact.location.z },
				currentFloorId: "",
				currentFloorName: "",
				dimensionId: contact.dimensionId
			};
			this.#columns.set(key, state);
		}
		return state;
	}

	#normalizeColumnRecord(record) {
		const dimensionId = assertDimensionId(record.dimensionId);
		const column = normalizeColumn(record.column);
		if (typeof record.active !== "boolean" || typeof record.currentFloorId !== "string" || typeof record.currentFloorName !== "string")
			throw new TypeError("Elevator column records require state fields");
		if (record.active && (!Number.isInteger(record.targetY) || typeof record.targetFloorId !== "string"))
			throw new TypeError("Active elevator column records require a target floor");
		return {
			active: record.active,
			column,
			currentFloorId: record.currentFloorId,
			currentFloorName: record.currentFloorName,
			dimensionId,
			...(record.active ? { targetFloorId: record.targetFloorId, targetY: record.targetY } : {})
		};
	}

	#normalizeContactRecord(record) {
		if (!Number.isInteger(record?.revision) || record.revision < 0)
			throw new TypeError("Elevator contact records require a non-negative revision");
		return {
			dimensionId: assertDimensionId(record.dimensionId),
			facing: assertFacing(record.facing),
			floorId: assertText(record.floorId, "Elevator floor IDs"),
			floorName: assertText(record.floorName, "Elevator floor names"),
			location: assertLocation(record.location),
			revision: record.revision
		};
	}

	#pruneColumn(contact) {
		const key = this.#columnKeyFor(contact);
		if ([...this.#contacts.values()].some(candidate => this.#columnKeyFor(candidate) === key))
			return;
		const state = this.#columns.get(key);
		if (state && !state.active)
			this.#columns.delete(key);
	}

	#requireContact(dimensionId, location) {
		const contact = this.#contacts.get(contactKey(assertDimensionId(dimensionId), assertLocation(location)));
		if (!contact)
			throw new Error("Unknown elevator contact");
		return contact;
	}
}
