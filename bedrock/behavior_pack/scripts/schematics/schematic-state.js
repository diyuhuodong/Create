export const SCHEMATIC_SNAPSHOT_SCHEMA = 1;
export const SCHEMATIC_PLACEMENT_SCHEMA = 1;
export const MAX_SCHEMATIC_BLOCKS = 512;
export const MAX_SCHEMATIC_ITEM_BYTES = 28_672;
export const MAX_SCHEMATIC_NAME_LENGTH = 64;

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_STATE_ENTRIES = 32;
const MAX_STATE_KEY_LENGTH = 96;
const MAX_STRING_STATE_LENGTH = 128;
const MAX_TRANSACTION_ID_LENGTH = 192;
const AIRLIKE_BLOCKS = new Set([
	"minecraft:air", "minecraft:cave_air", "minecraft:void_air",
	"minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"
]);

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compareLocation(left, right) {
	return left.x - right.x || left.y - right.y || left.z - right.z;
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function assertIntegerLocation(location, label) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError(`${label} must use integer block coordinates`);
	return { x: location.x, y: location.y, z: location.z };
}

function assertShortString(value, label, maximum = MAX_IDENTIFIER_LENGTH) {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum)
		throw new TypeError(`${label} must be a non-empty string no longer than ${maximum} characters`);
	return value;
}

function assertBlockIdentifier(value, { own = false } = {}) {
	const typeId = assertShortString(value, "Schematic block identifier");
	if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(typeId))
		throw new TypeError("Schematic block identifiers must be qualified Bedrock identifiers");
	if (own && !typeId.startsWith("createbedrock:"))
		throw new Error(`Schematic snapshots may contain only Create Bedrock blocks, not ${typeId}`);
	return typeId;
}

function normalizeStates(value) {
	if (value === undefined)
		return {};
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Schematic block states must be an object");
	const entries = Object.entries(value);
	if (entries.length > MAX_STATE_ENTRIES)
		throw new RangeError(`Schematic blocks may have at most ${MAX_STATE_ENTRIES} saved states`);
	const states = {};
	for (const [key, state] of entries) {
		if (key.length === 0 || key.length > MAX_STATE_KEY_LENGTH || key === "__proto__" || key === "constructor")
			throw new TypeError("Schematic block state names are invalid");
		if (!["string", "number", "boolean"].includes(typeof state)
			|| typeof state === "string" && state.length > MAX_STRING_STATE_LENGTH
			|| typeof state === "number" && !Number.isFinite(state))
			throw new TypeError("Schematic block states must be short primitive values");
		states[key] = state;
	}
	return Object.fromEntries(Object.entries(states).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeSnapshotBlock(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Schematic snapshot blocks must be objects");
	return {
		offset: assertIntegerLocation(value.offset, "Schematic block offset"),
		states: normalizeStates(value.states),
		typeId: assertBlockIdentifier(value.typeId, { own: true })
	};
}

function normalizeWorldBlock(value) {
	if (value === undefined || value === null)
		return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("World block snapshots must be objects or undefined");
	return {
		states: normalizeStates(value.states),
		typeId: assertBlockIdentifier(value.typeId)
	};
}

function sameBlock(left, right) {
	return JSON.stringify(normalizeWorldBlock(left)) === JSON.stringify(normalizeWorldBlock(right));
}

function isAirlike(block) {
	return block === undefined || AIRLIKE_BLOCKS.has(block.typeId);
}

function assertSnapshotSize(serialized, maximum = MAX_SCHEMATIC_ITEM_BYTES) {
	if (serialized.length > maximum)
		throw new RangeError(`Schematic snapshot exceeds the ${maximum}-character persistence budget`);
	return serialized;
}

function normalizedSnapshotName(value) {
	if (value === undefined)
		return "Untitled Schematic";
	if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_SCHEMATIC_NAME_LENGTH)
		throw new TypeError(`Schematic names must contain 1-${MAX_SCHEMATIC_NAME_LENGTH} characters`);
	return value;
}

/** A restricted, versioned snapshot. It never serializes arbitrary Bedrock
 * blocks, inventories, entities, files, commands, or script callbacks. */
export function createSchematicSnapshot({ blocks = [], name, schemaVersion = SCHEMATIC_SNAPSHOT_SCHEMA } = {}) {
	if (schemaVersion !== SCHEMATIC_SNAPSHOT_SCHEMA)
		throw new Error(`Schematic snapshots must use schema ${SCHEMATIC_SNAPSHOT_SCHEMA}`);
	if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > MAX_SCHEMATIC_BLOCKS)
		throw new RangeError(`Schematic snapshots require 1-${MAX_SCHEMATIC_BLOCKS} blocks`);
	const occupied = new Set();
	const normalized = blocks.map(normalizeSnapshotBlock).sort((left, right) => compareLocation(left.offset, right.offset));
	for (const block of normalized) {
		const key = locationKey(block.offset);
		if (occupied.has(key))
			throw new Error(`Schematic snapshots cannot contain duplicate offset ${key}`);
		occupied.add(key);
	}
	return { blocks: normalized, name: normalizedSnapshotName(name), schemaVersion: SCHEMATIC_SNAPSHOT_SCHEMA };
}

/** Bedrock item dynamic properties are strings. A palette keeps ordinary
 * 512-block structures well inside the per-property budget without hiding
 * data: all type IDs and state maps stay explicit and are revalidated when
 * decoded. */
function encodeSchematicSnapshot(snapshot) {
	const palette = [];
	const paletteIndexes = new Map();
	const blocks = snapshot.blocks.map(block => {
		const key = `${block.typeId}:${JSON.stringify(block.states)}`;
		let index = paletteIndexes.get(key);
		if (index === undefined) {
			index = palette.length;
			paletteIndexes.set(key, index);
			palette.push([block.typeId, block.states]);
		}
		return [block.offset.x, block.offset.y, block.offset.z, index];
	});
	return { blocks, name: snapshot.name, palette, schemaVersion: SCHEMATIC_SNAPSHOT_SCHEMA };
}

function decodeSchematicSnapshot(value) {
	if (!Array.isArray(value?.palette) || !Array.isArray(value.blocks))
		return value;
	if (value.palette.length === 0 || value.palette.length > MAX_SCHEMATIC_BLOCKS)
		throw new RangeError("Schematic snapshot palette is invalid");
	const palette = value.palette.map(entry => {
		if (!Array.isArray(entry) || entry.length !== 2)
			throw new TypeError("Schematic snapshot palette entries are invalid");
		return { states: normalizeStates(entry[1]), typeId: assertBlockIdentifier(entry[0], { own: true }) };
	});
	return {
		blocks: value.blocks.map(entry => {
			if (!Array.isArray(entry) || entry.length !== 4 || !entry.slice(0, 4).every(Number.isInteger))
				throw new TypeError("Schematic snapshot block payload is invalid");
			const selected = palette[entry[3]];
			if (!selected)
				throw new Error("Schematic snapshot references a missing palette entry");
			return { offset: { x: entry[0], y: entry[1], z: entry[2] }, states: selected.states, typeId: selected.typeId };
		}),
		name: value.name,
		schemaVersion: value.schemaVersion
	};
}

export function parseSchematicSnapshot(serialized) {
	if (typeof serialized !== "string" || serialized.length === 0 || serialized.length > MAX_SCHEMATIC_ITEM_BYTES)
		throw new TypeError("Schematic item data must be a bounded JSON string");
	try {
		return createSchematicSnapshot(decodeSchematicSnapshot(JSON.parse(serialized)));
	} catch (error) {
		throw new Error(`Invalid schematic item data: ${error.message}`);
	}
}

export function serializeSchematicSnapshot(snapshot) {
	return assertSnapshotSize(JSON.stringify(encodeSchematicSnapshot(createSchematicSnapshot(snapshot))));
}

/** Capture an inclusive selection. Any non-air foreign block rejects the
 * capture rather than silently producing a partial or unsafe schematic. */
export function captureSchematicSelection({ first, readBlock, second, name } = {}) {
	if (typeof readBlock !== "function")
		throw new TypeError("Schematic capture requires readBlock()");
	first = assertIntegerLocation(first, "Schematic first corner");
	second = assertIntegerLocation(second, "Schematic second corner");
	const minimum = {
		x: Math.min(first.x, second.x),
		y: Math.min(first.y, second.y),
		z: Math.min(first.z, second.z)
	};
	const maximum = {
		x: Math.max(first.x, second.x),
		y: Math.max(first.y, second.y),
		z: Math.max(first.z, second.z)
	};
	const volume = (maximum.x - minimum.x + 1) * (maximum.y - minimum.y + 1) * (maximum.z - minimum.z + 1);
	if (volume > MAX_SCHEMATIC_BLOCKS)
		throw new RangeError(`Schematic selections may inspect at most ${MAX_SCHEMATIC_BLOCKS} cells`);
	const blocks = [];
	for (let x = minimum.x; x <= maximum.x; x++)
		for (let y = minimum.y; y <= maximum.y; y++)
			for (let z = minimum.z; z <= maximum.z; z++) {
				const worldBlock = normalizeWorldBlock(readBlock({ x, y, z }));
				if (isAirlike(worldBlock))
					continue;
				if (!worldBlock.typeId.startsWith("createbedrock:"))
					throw new Error(`Schematic capture rejected foreign block ${worldBlock.typeId} at ${x}:${y}:${z}`);
				blocks.push({
					offset: { x: x - minimum.x, y: y - minimum.y, z: z - minimum.z },
					states: worldBlock.states,
					typeId: worldBlock.typeId
				});
			}
	if (blocks.length === 0)
		throw new Error("Schematic selections require at least one Create Bedrock block");
	return { anchor: minimum, snapshot: createSchematicSnapshot({ blocks, name }) };
}

function assertPlacementId(value) {
	return assertShortString(value, "Schematic placement ID", MAX_TRANSACTION_ID_LENGTH);
}

function assertOwner(value) {
	if (value === undefined)
		return undefined;
	return assertShortString(value, "Schematic placement owner", MAX_TRANSACTION_ID_LENGTH);
}

function placementKey(record, location) {
	return `${record.dimensionId}:${locationKey(location)}`;
}

function normalizePlacementOperation(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Schematic placement operations must be objects");
	return {
		before: normalizeWorldBlock(value.before),
		block: normalizeSnapshotBlock({ offset: { x: 0, y: 0, z: 0 }, states: value.block?.states, typeId: value.block?.typeId }),
		target: assertIntegerLocation(value.target, "Schematic placement target")
	};
}

function createOperations(snapshot, anchor, dimensionId, readBlock, canPlace) {
	return snapshot.blocks.map(block => {
		const target = { x: anchor.x + block.offset.x, y: anchor.y + block.offset.y, z: anchor.z + block.offset.z };
		const before = normalizeWorldBlock(readBlock(dimensionId, target));
		if (!canPlace(dimensionId, target, before, block))
			throw new Error(`Schematic preflight rejected target ${locationKey(target)}`);
		return { before, block: { offset: { x: 0, y: 0, z: 0 }, states: block.states, typeId: block.typeId }, target };
	});
}

function createPlacementRecord({ anchor, dimensionId, id, ownerId, snapshot, operations }) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0 || dimensionId.length > MAX_IDENTIFIER_LENGTH)
		throw new TypeError("Schematic placements require a dimension identifier");
	return {
		anchor: assertIntegerLocation(anchor, "Schematic placement anchor"),
		cursor: 0,
		dimensionId,
		id: assertPlacementId(id),
		operations: operations.map(normalizePlacementOperation),
		ownerId: assertOwner(ownerId),
		phase: "placing",
		rollbackCursor: undefined,
		schemaVersion: SCHEMATIC_PLACEMENT_SCHEMA,
		snapshot: createSchematicSnapshot(snapshot)
	};
}

function normalizePlacementRecord(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Schematic placement records must be objects");
	if (value.schemaVersion !== SCHEMATIC_PLACEMENT_SCHEMA)
		throw new Error(`Schematic placement records must use schema ${SCHEMATIC_PLACEMENT_SCHEMA}`);
	if (!Array.isArray(value.operations) || value.operations.length === 0 || value.operations.length > MAX_SCHEMATIC_BLOCKS)
		throw new RangeError("Schematic placement records require bounded operations");
	if (!Number.isInteger(value.cursor) || value.cursor < 0 || value.cursor > value.operations.length)
		throw new RangeError("Schematic placement cursor is invalid");
	if (!["placing", "rollback", "write_intent"].includes(value.phase))
		throw new Error("Schematic placement phase is invalid");
	const record = createPlacementRecord({
		anchor: value.anchor,
		dimensionId: value.dimensionId,
		id: value.id,
		operations: value.operations,
		ownerId: value.ownerId,
		snapshot: value.snapshot
	});
	record.cursor = value.cursor;
	record.phase = value.phase;
	if (value.phase === "rollback") {
		if (!Number.isInteger(value.rollbackCursor) || value.rollbackCursor < 0 || value.rollbackCursor > value.cursor)
			throw new RangeError("Schematic rollback cursor is invalid");
		record.rollbackCursor = value.rollbackCursor;
	}
	if (value.phase === "write_intent") {
		if (value.cursor >= value.operations.length || value.writeIntentCursor !== value.cursor)
			throw new RangeError("Schematic write intent cursor is invalid");
		record.writeIntentCursor = value.writeIntentCursor;
	}
	for (let index = 0; index < record.operations.length; index++) {
		const expected = record.snapshot.blocks[index];
		const operation = record.operations[index];
		if (!expected || expected.typeId !== operation.block.typeId || JSON.stringify(expected.states) !== JSON.stringify(operation.block.states))
			throw new Error("Schematic placement operations do not match their snapshot");
	}
	return record;
}

/** Transactional placement authority. It is entirely Bedrock-independent:
 * the runtime supplies reads/writes while this class owns preflight locks,
 * bounded batching, restart records, and compensation ordering. */
export class SchematicPlacementController {
	#active = new Map();
	#claims = new Map();
	#completed = 0;
	#rolledBack = 0;
	#world;

	constructor(worldPort) {
		for (const method of ["canPlace", "placeBlock", "readBlock", "restoreBlock"])
			if (typeof worldPort?.[method] !== "function")
				throw new TypeError(`Schematic world port requires ${method}()`);
		this.#world = worldPort;
	}

	begin({ anchor, dimensionId, id, ownerId, snapshot } = {}) {
		id = assertPlacementId(id);
		if (this.#active.has(id))
			throw new Error(`Schematic placement ${id} already exists`);
		const normalized = createSchematicSnapshot(snapshot);
		anchor = assertIntegerLocation(anchor, "Schematic placement anchor");
		if (typeof dimensionId !== "string" || dimensionId.length === 0 || dimensionId.length > MAX_IDENTIFIER_LENGTH)
			throw new TypeError("Schematic placements require a dimension identifier");
		const operations = createOperations(normalized, anchor, dimensionId, this.#world.readBlock, this.#world.canPlace);
		const keys = operations.map(operation => `${dimensionId}:${locationKey(operation.target)}`);
		if (new Set(keys).size !== keys.length)
			throw new Error("Schematic placement targets cannot repeat");
		for (const key of keys)
			if (this.#claims.has(key))
				throw new Error(`Schematic target ${key} is already reserved by ${this.#claims.get(key)}`);
		const record = createPlacementRecord({ anchor, dimensionId, id, operations, ownerId, snapshot: normalized });
		this.#active.set(id, record);
		for (const key of keys)
			this.#claims.set(key, id);
		return clone(record);
	}

	abort(id, reason = "aborted") {
		const record = this.#require(id);
		if (["placing", "write_intent"].includes(record.phase)) {
			record.phase = "rollback";
			record.rollbackCursor = record.cursor;
			delete record.writeIntentCursor;
			record.reason = assertShortString(reason, "Schematic rollback reason", MAX_IDENTIFIER_LENGTH);
		}
		return clone(record);
	}

	/** Persist this intent before calling commitPrepared(). If the process dies
	 * between the two calls, commitPrepared() recognizes the desired block on
	 * recovery and advances idempotently instead of placing it twice. */
	prepare(id) {
		const record = this.#require(id);
		if (record.phase === "rollback")
			return clone(record);
		if (record.phase === "write_intent")
			return clone(record);
		if (record.cursor === record.operations.length)
			throw new Error(`Schematic placement ${id} has no remaining writes`);
		const operation = record.operations[record.cursor];
		if (!sameBlock(this.#world.readBlock(record.dimensionId, operation.target), operation.before)) {
			this.abort(id, "target_changed_after_preflight");
			return clone(record);
		}
		record.phase = "write_intent";
		record.writeIntentCursor = record.cursor;
		return clone(record);
	}

	commitPrepared(id) {
		const record = this.#require(id);
		if (record.phase !== "write_intent")
			throw new Error(`Schematic placement ${id} has no persisted write intent`);
		const operation = record.operations[record.writeIntentCursor];
		const current = this.#world.readBlock(record.dimensionId, operation.target);
		try {
			if (sameBlock(current, operation.before))
				this.#world.placeBlock(record.dimensionId, operation.target, clone(operation.block));
			else if (!sameBlock(current, operation.block)) {
				this.abort(id, "target_changed_during_write");
				return { completed: false, id, processed: 0, rolledBack: false };
			}
			record.cursor++;
			record.phase = "placing";
			delete record.writeIntentCursor;
			if (record.cursor === record.operations.length) {
				this.#finish(record, "completed");
				return { completed: true, id, processed: 1, rolledBack: false };
			}
			return { completed: false, id, processed: 1, rolledBack: false };
		} catch (error) {
			this.abort(id, `write_failed:${String(error).slice(0, 96)}`);
			return { completed: false, id, processed: 0, rolledBack: false };
		}
	}

	advance(id, budget = 32) {
		if (!Number.isInteger(budget) || budget < 1 || budget > MAX_SCHEMATIC_BLOCKS)
			throw new RangeError(`Schematic placement batches must contain 1-${MAX_SCHEMATIC_BLOCKS} writes`);
		const record = this.#require(id);
		if (record.phase === "rollback")
			return this.#advanceRollback(record, budget);
		let processed = 0;
		while (record.cursor < record.operations.length && processed < budget) {
			const prepared = this.prepare(id);
			if (prepared.phase === "rollback")
				return this.#advanceRollback(record, budget - processed);
			const result = this.commitPrepared(id);
			if (result.completed)
				return { ...result, processed: processed + result.processed };
			processed += result.processed;
			if (record.phase === "rollback")
				return this.#advanceRollback(record, budget - processed);
		}
		return { completed: false, id, processed, rolledBack: false };
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Schematic placement restore requires an array");
		const pending = records.map(normalizePlacementRecord);
		const ids = new Set(this.#active.keys());
		const claims = new Set(this.#claims.keys());
		for (const record of pending) {
			if (ids.has(record.id))
				throw new Error(`Schematic placement ${record.id} already exists`);
			ids.add(record.id);
			for (const operation of record.operations) {
				const key = placementKey(record, operation.target);
				if (claims.has(key))
					throw new Error(`Schematic target ${key} is already reserved`);
				claims.add(key);
			}
		}
		for (const record of pending) {
			this.#active.set(record.id, record);
			for (const operation of record.operations)
				this.#claims.set(placementKey(record, operation.target), record.id);
		}
	}

	get(id) {
		return clone(this.#require(id));
	}

	activeRecords() {
		return [...this.#active.values()].sort((left, right) => left.id.localeCompare(right.id)).map(clone);
	}

	diagnostics() {
		return { active: this.#active.size, completed: this.#completed, reservations: this.#claims.size, rolledBack: this.#rolledBack };
	}

	#advanceRollback(record, budget) {
		let processed = 0;
		while (record.rollbackCursor > 0 && processed < budget) {
			const operation = record.operations[record.rollbackCursor - 1];
			try {
				this.#world.restoreBlock(record.dimensionId, operation.target, clone(operation.before));
				record.rollbackCursor--;
				processed++;
			} catch {
				return { completed: false, id: record.id, processed, rolledBack: false };
			}
		}
		if (record.rollbackCursor === 0) {
			this.#finish(record, "rolled_back");
			return { completed: true, id: record.id, processed, rolledBack: true };
		}
		return { completed: false, id: record.id, processed, rolledBack: false };
	}

	#finish(record, outcome) {
		this.#active.delete(record.id);
		for (const operation of record.operations)
			this.#claims.delete(placementKey(record, operation.target));
		if (outcome === "completed")
			this.#completed++;
		else
			this.#rolledBack++;
	}

	#require(id) {
		id = assertPlacementId(id);
		const record = this.#active.get(id);
		if (!record)
			throw new Error(`Unknown schematic placement ${id}`);
		return record;
	}
}
