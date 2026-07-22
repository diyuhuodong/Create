import { ASSEMBLY_QUARTER_TURN, ASSEMBLY_SUBBLOCK_UNITS, createAssemblyTransform, isBlockAlignedAssemblyTransform } from "./assembly-transform.js";
import { transformAssemblyBlockStates } from "./block-state-transform.js";
import { isMovableBlockType } from "./movable-blocks.js";
import { ASSEMBLY_POSE_SCHEMA_VERSION, assemblyPoseFromAxisAngle, transformBlockAlignedVector } from "./pose-transform.js";

export const DYNAMIC_ASSEMBLY_SNAPSHOT_SCHEMA = 2;
export const MAX_DYNAMIC_ASSEMBLY_BLOCKS = 512;

const NEIGHBOR_OFFSETS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function checksumFor(payload) {
	let hash = 0x811c9dc5;
	for (const character of stableStringify(payload)) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function assertLocation(value, label) {
	if (![value?.x, value?.y, value?.z].every(Number.isInteger))
		throw new TypeError(`${label} must use integer block coordinates`);
	return { x: value.x, y: value.y, z: value.z };
}

function keyFor(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function normalizeBlock(block) {
	const relative = assertLocation(block?.relative, "Dynamic assembly block relative location");
	if (typeof block?.typeId !== "string" || !isMovableBlockType(block.typeId))
		throw new RangeError(`Unsupported dynamic assembly block type: ${block?.typeId}`);
	return {
		relative,
		typeId: block.typeId,
		...(block.states === undefined ? {} : { states: clone(block.states) }),
		...(block.data === undefined ? {} : { data: clone(block.data) })
	};
}

function normalizedPayload(snapshot) {
	const anchor = assertLocation(snapshot?.anchor, "Dynamic assembly anchor");
	if (!Array.isArray(snapshot?.blocks) || snapshot.blocks.length === 0 || snapshot.blocks.length > MAX_DYNAMIC_ASSEMBLY_BLOCKS)
		throw new RangeError(`Dynamic assemblies require between one and ${MAX_DYNAMIC_ASSEMBLY_BLOCKS} blocks`);
	const blocks = snapshot.blocks.map(normalizeBlock).sort((left, right) => keyFor(left.relative).localeCompare(keyFor(right.relative)));
	if (new Set(blocks.map(block => keyFor(block.relative))).size !== blocks.length)
		throw new Error("Dynamic assembly snapshots cannot contain duplicate blocks");
	if (!blocks.some(block => keyFor(block.relative) === "0:0:0"))
		throw new Error("Dynamic assembly anchors must be included in their block set");
	const reached = new Set(["0:0:0"]);
	const pending = [{ x: 0, y: 0, z: 0 }];
	const byLocation = new Set(blocks.map(block => keyFor(block.relative)));
	while (pending.length > 0) {
		const current = pending.shift();
		for (const [x, y, z] of NEIGHBOR_OFFSETS) {
			const next = { x: current.x + x, y: current.y + y, z: current.z + z };
			const key = keyFor(next);
			if (byLocation.has(key) && !reached.has(key)) {
				reached.add(key);
				pending.push(next);
			}
		}
	}
	if (reached.size !== blocks.length)
		throw new Error("Dynamic assembly blocks must form one face-connected component");
	return {
		anchor,
		blocks,
		...(snapshot.attachments === undefined ? {} : { attachments: clone(snapshot.attachments) })
	};
}

function seal(payload) {
	const normalized = normalizedPayload(payload);
	return { checksum: checksumFor(normalized), schemaVersion: DYNAMIC_ASSEMBLY_SNAPSHOT_SCHEMA, ...normalized };
}

export function createDynamicAssemblySnapshot({ anchor, attachments, blocks }) {
	if (!Array.isArray(blocks))
		throw new TypeError("Dynamic assembly creation requires blocks");
	const normalizedAnchor = assertLocation(anchor, "Dynamic assembly anchor");
	return seal({
		anchor: normalizedAnchor,
		...(attachments === undefined ? {} : { attachments }),
		blocks: blocks.map(block => ({
			data: block.data,
			location: assertLocation(block.location, "Dynamic assembly source location"),
			states: block.states,
			typeId: block.typeId
		})).map(block => ({
			...block,
			relative: {
				x: block.location.x - normalizedAnchor.x,
				y: block.location.y - normalizedAnchor.y,
				z: block.location.z - normalizedAnchor.z
			}
		}))
	});
}

export function normalizeDynamicAssemblySnapshot(snapshot) {
	if (![1, DYNAMIC_ASSEMBLY_SNAPSHOT_SCHEMA].includes(snapshot?.schemaVersion))
		throw new TypeError("Unsupported dynamic assembly snapshot schema");
	const payload = normalizedPayload(snapshot);
	if (snapshot.checksum !== checksumFor(payload))
		throw new Error("Dynamic assembly snapshot checksum mismatch");
	return seal(payload);
}

function rotateCardinal(relative, quarterTurns) {
	switch ((quarterTurns % 4 + 4) % 4) {
		case 0: return { ...relative };
		case 1: return { x: -relative.z, y: relative.y, z: relative.x };
		case 2: return { x: -relative.x, y: relative.y, z: -relative.z };
		case 3: return { x: relative.z, y: relative.y, z: -relative.x };
	}
}

/** Materialization is only legal at a block-aligned transform. */
export function materializeDynamicAssembly(snapshot, transform) {
	const normalized = normalizeDynamicAssemblySnapshot(snapshot);
	const normalizedTransform = createAssemblyTransform(transform);
	if (!isBlockAlignedAssemblyTransform(normalizedTransform))
		throw new Error("Dynamic assemblies can only disassemble at a block-aligned transform");
	const pose = normalizedTransform.poseSchemaVersion === ASSEMBLY_POSE_SCHEMA_VERSION
		? normalizedTransform
		: assemblyPoseFromAxisAngle({ rotationMilliDegrees: normalizedTransform.rotationMilliDegrees, translation: normalizedTransform.translation });
	const quarterTurns = normalizedTransform.rotationMilliDegrees === undefined ? undefined : normalizedTransform.rotationMilliDegrees / ASSEMBLY_QUARTER_TURN;
	const translation = Object.fromEntries(Object.entries(normalizedTransform.translation)
		.map(([axis, value]) => [axis, value / ASSEMBLY_SUBBLOCK_UNITS]));
	return normalized.blocks.map(block => {
		const relative = quarterTurns === undefined ? transformBlockAlignedVector(pose, block.relative) : rotateCardinal(block.relative, quarterTurns);
		return {
			data: clone(block.data),
			location: {
				x: normalized.anchor.x + translation.x + relative.x,
				y: normalized.anchor.y + translation.y + relative.y,
				z: normalized.anchor.z + translation.z + relative.z
			},
			states: transformAssemblyBlockStates(block.states, pose),
			typeId: block.typeId
		};
	});
}

export function migrateDynamicAssemblySnapshot(snapshot) {
	return normalizeDynamicAssemblySnapshot(snapshot);
}
