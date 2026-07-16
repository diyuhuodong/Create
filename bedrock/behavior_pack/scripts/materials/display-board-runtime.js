import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	DISPLAY_BOARD_BLOCK,
	DISPLAY_BOARD_COLORS,
	collectDisplayBoardGroup,
	configureDisplayBoard,
	createDisplayBoardState,
	displayBoardCanRender,
	resizeDisplayBoardState,
	validateDisplayBoardState
} from "./display-board.js";

const DISPLAY_BOARD_TEXT_ENTITY = "createbedrock:display_board_text";
const DISPLAY_BOARD_MARKER_PROPERTY = "createbedrock:display_board_marker";
const ACTIVE_STATE = "createbedrock:active";
const GLOWING_STATE = "createbedrock:glowing";
const DISPLAY_SYNC_INTERVAL_TICKS = 4;
const DISPLAY_COLOR_CODES = Object.freeze({ blue: "§9", green: "§a", orange: "§6", red: "§c", white: "§f", yellow: "§e" });
const HORIZONTAL_FACINGS = new Set([2, 3, 4, 5]);
const records = new Map();
const dirtyDimensions = new Set();
let failedUpdates = 0;
let registered = false;
let runtimeTicks = 0;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Display Board locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function locationKey(location) {
	const normalized = assertLocation(location);
	return `${normalized.x}:${normalized.y}:${normalized.z}`;
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Display Boards require a dimension identifier");
	return `display-board:${dimensionId}:${locationKey(location)}`;
}

function partitionFor(record) {
	const location = record.location;
	return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:display_board_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Display Board state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind !== "display_board")
			throw new TypeError("Unknown Display Board persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [...records.values()].map(record => ({
		kind: "display_board",
		id: record.id,
		dimensionId: record.dimensionId,
		location: clone(record.location),
		state: clone(record.state)
	})).sort((left, right) => left.id.localeCompare(right.id));
}

function persist() {
	try {
		store.request(persistentRecords());
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Display Boards: ${error}`);
	}
}

function isDisplayBoard(block) {
	return block?.typeId === DISPLAY_BOARD_BLOCK;
}

function resolveBlock(dimensionId, location) {
	try {
		return world.getDimension(dimensionId).getBlock(location);
	} catch {
		return undefined;
	}
}

function setBlockStates(block, values) {
	if (!isDisplayBoard(block) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [state, value] of Object.entries(values)) {
		if (permutation.getAllStates?.()[state] === value)
			continue;
		permutation = permutation.withState(state, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function boardDescriptor(dimensionId, location) {
	const block = resolveBlock(dimensionId, location);
	if (!isDisplayBoard(block))
		return undefined;
	const facing = block.permutation?.getAllStates?.()["minecraft:facing_direction"];
	return HORIZONTAL_FACINGS.has(facing) ? { facing, typeId: DISPLAY_BOARD_BLOCK } : undefined;
}

function collectGroup(dimensionId, location) {
	const group = collectDisplayBoardGroup({
		anchor: location,
		readBoard(candidate) {
			return boardDescriptor(dimensionId, candidate);
		}
	});
	if (!group || group.rectangular)
		return group;
	const seed = boardDescriptor(dimensionId, location);
	if (!seed)
		return undefined;
	return {
		direction: group.direction,
		facing: seed.facing,
		height: 1,
		members: [{ ...seed, location: assertLocation(location) }],
		rectangular: true,
		root: assertLocation(location),
		width: 1
	};
}

function createRecord(dimensionId, location) {
	const normalized = assertLocation(location);
	const id = recordId(dimensionId, normalized);
	const existing = records.get(id);
	if (existing)
		return existing;
	const record = { dimensionId, id, location: normalized, state: createDisplayBoardState() };
	records.set(id, record);
	return record;
}

function stateForGroup(dimensionId, group) {
	const candidates = group.members.map(member => createRecord(dimensionId, member.location));
	candidates.sort((left, right) => right.state.revision - left.state.revision || left.id.localeCompare(right.id));
	const canonical = resizeDisplayBoardState(candidates[0].state, group.height * 2);
	let changed = false;
	for (const record of candidates) {
		if (JSON.stringify(record.state) === JSON.stringify(canonical))
			continue;
		record.state = clone(canonical);
		changed = true;
	}
	return { changed, state: canonical };
}

function groupMarkerId(dimensionId, group, row) {
	return `display-board:${dimensionId}:${locationKey(group.root)}:${group.facing}:${row}`;
}

function facingOffset(facing) {
	return ({ 2: { x: 0, y: 0, z: -0.51 }, 3: { x: 0, y: 0, z: 0.51 }, 4: { x: -0.51, y: 0, z: 0 }, 5: { x: 0.51, y: 0, z: 0 } })[facing] ?? { x: 0, y: 0, z: 0 };
}

function markerLocation(group, row) {
	const front = facingOffset(group.facing);
	return {
		x: group.root.x + 0.5 + group.direction.x * (group.width - 1) / 2 + front.x,
		y: group.root.y + row + 0.5 + front.y,
		z: group.root.z + 0.5 + group.direction.z * (group.width - 1) / 2 + front.z
	};
}

function speedForGroup(dimensionId, group, kineticWorld) {
	for (const member of group.members) {
		try {
			const speed = kineticWorld.networkAt(dimensionId, member.location)?.speed;
			if (Number.isFinite(speed))
				return speed;
		} catch {
			// A restored board can precede its kinetic node; retry on the next sync.
		}
	}
	return 0;
}

function applyGroupBlockStates(dimensionId, group, state, kineticWorld) {
	const active = displayBoardCanRender(state, speedForGroup(dimensionId, group, kineticWorld)) ? 1 : 0;
	for (const member of group.members)
		setBlockStates(resolveBlock(dimensionId, member.location), { [ACTIVE_STATE]: active, [GLOWING_STATE]: state.glowing ? 1 : 0 });
	return active === 1;
}

function reconcileMarkers(dimensionId, group, state, active) {
	let dimension;
	try {
		dimension = world.getDimension(dimensionId);
	} catch {
		return false;
	}
	const recognized = new Set();
	for (let row = 0; row < group.height; row++) {
		const markerId = groupMarkerId(dimensionId, group, row);
		recognized.add(markerId);
		const first = state.lines[row * 2] ?? "";
		const second = state.lines[row * 2 + 1] ?? "";
		const text = active ? [first, second].filter(Boolean).join("\n") : "";
		let marker = dimension.getEntities({ type: DISPLAY_BOARD_TEXT_ENTITY })
			.find(entity => entity.getDynamicProperty(DISPLAY_BOARD_MARKER_PROPERTY) === markerId);
		if (text.length === 0) {
			marker?.remove();
			continue;
		}
		const location = markerLocation(group, row);
		marker ??= dimension.spawnEntity(DISPLAY_BOARD_TEXT_ENTITY, location);
		marker.setDynamicProperty(DISPLAY_BOARD_MARKER_PROPERTY, markerId);
		marker.nameTag = `${DISPLAY_COLOR_CODES[state.color]}${state.glowing ? "§l" : ""}${text}`;
		marker.teleport(location);
	}
	return recognized;
}

function reconcileDimension(dimensionId, kineticWorld) {
	const visited = new Set();
	const recognized = new Set();
	let changed = false;
	for (const record of [...records.values()].filter(candidate => candidate.dimensionId === dimensionId).sort((left, right) => left.id.localeCompare(right.id))) {
		const key = locationKey(record.location);
		if (visited.has(key))
			continue;
		const group = collectGroup(dimensionId, record.location);
		if (!group)
			continue;
		for (const member of group.members)
			visited.add(locationKey(member.location));
		const synchronized = stateForGroup(dimensionId, group);
		changed = synchronized.changed || changed;
		const active = applyGroupBlockStates(dimensionId, group, synchronized.state, kineticWorld);
		for (const markerId of reconcileMarkers(dimensionId, group, synchronized.state, active) || [])
			recognized.add(markerId);
	}
	try {
		for (const marker of world.getDimension(dimensionId).getEntities({ type: DISPLAY_BOARD_TEXT_ENTITY }))
			if (!recognized.has(marker.getDynamicProperty(DISPLAY_BOARD_MARKER_PROPERTY)))
				marker.remove();
	} catch {
		// The dimension can disappear while a world transition is in progress.
	}
	return changed;
}

function configureGroup(dimensionId, location, expectedRevision, patch, kineticWorld) {
	const group = collectGroup(dimensionId, location);
	if (!group)
		return { changed: false, conflict: false };
	const synchronized = stateForGroup(dimensionId, group);
	const result = configureDisplayBoard({ expectedRevision, patch, state: synchronized.state });
	if (result.conflict)
		return result;
	if (!result.changed)
		return result;
	for (const member of group.members)
		createRecord(dimensionId, member.location).state = clone(result.state);
	applyGroupBlockStates(dimensionId, group, result.state, kineticWorld);
	reconcileMarkers(dimensionId, group, result.state, displayBoardCanRender(result.state, speedForGroup(dimensionId, group, kineticWorld)));
	dirtyDimensions.add(dimensionId);
	persist();
	return result;
}

function showConfiguration(dimensionId, location, player, kineticWorld) {
	const group = collectGroup(dimensionId, location);
	if (!group)
		return;
	const state = stateForGroup(dimensionId, group).state;
	const form = new ModalFormData()
		.title("Display Board Settings")
		.label(`${group.width}×${group.height} board • ${state.lines.length} lines • revision ${state.revision}`)
		.dropdown("Text color", DISPLAY_BOARD_COLORS, { defaultValueIndex: DISPLAY_BOARD_COLORS.indexOf(state.color) })
		.toggle("Glow text", { defaultValue: state.glowing });
	for (let line = 0; line < state.lines.length; line++)
		form.textField(`Line ${line + 1}`, "Optional text", { defaultValue: state.lines[line] });
	form.submitButton("Save");
	form.show(player).then(response => {
		if (response.canceled)
			return false;
		const values = response.formValues ?? [];
		const colorIndex = values[0];
		if (!Number.isInteger(colorIndex) || !DISPLAY_BOARD_COLORS[colorIndex])
			throw new RangeError("Display Board color selection is invalid");
		const lines = state.lines.map((_, index) => {
			const value = values[index + 2];
			if (typeof value !== "string")
				throw new TypeError("Display Board line input is invalid");
			return value;
		});
		return configureGroup(dimensionId, location, state.revision, {
			color: DISPLAY_BOARD_COLORS[colorIndex],
			glowing: values[1] === true,
			lines,
			manualLines: true
		}, kineticWorld).changed;
	}).then(changed => {
		if (changed)
			player.sendMessage?.("Display Board settings saved.");
	}).catch(error => {
		player.sendMessage?.(`Could not save Display Board settings: ${error}`);
	});
}

/** Display Link uses this target adapter when it points at any member of a board controller. */
export function writeDisplayBoardLine(dimensionId, location, { line = 0, text } = {}, kineticWorld) {
	const group = collectGroup(dimensionId, location);
	if (!group || !Number.isInteger(line) || line < 0)
		return false;
	const current = stateForGroup(dimensionId, group).state;
	if (line >= current.lines.length)
		return false;
	const lines = [...current.lines];
	lines[line] = text;
	return configureGroup(dimensionId, location, current.revision, { lines, manualLines: false }, kineticWorld).changed;
}

export function captureDisplayBoardMovingData(dimensionId, location) {
	const record = records.get(recordId(dimensionId, location));
	return record && { state: clone(record.state) };
}

export function detachDisplayBoardMovingData(dimensionId, location) {
	if (!records.delete(recordId(dimensionId, location)))
		return false;
	dirtyDimensions.add(dimensionId);
	persist();
	return true;
}

export function restoreDisplayBoardMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore Display Board state over an existing record: ${id}`);
	records.set(id, { dimensionId, id, location: assertLocation(location), state: validateDisplayBoardState(data.state) });
	dirtyDimensions.add(dimensionId);
	persist();
	return true;
}

export function getDisplayBoardDiagnostics() {
	return { active: records.size, failedUpdates, persistence: store.diagnostics() };
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Display Board state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "display_board" || typeof entry.dimensionId !== "string")
				throw new Error("Display Board state contains an unknown record");
			const location = assertLocation(entry.location);
			const id = recordId(entry.dimensionId, location);
			if (entry.id !== id)
				throw new Error("Display Board state has an invalid identity");
			records.set(id, { dimensionId: entry.dimensionId, id, location, state: validateDisplayBoardState(entry.state) });
			dirtyDimensions.add(entry.dimensionId);
		}
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Display Board state: ${error}`);
	}
}

export function registerDisplayBoards(kineticWorld) {
	if (registered)
		return false;
	if (!kineticWorld || typeof kineticWorld.networkAt !== "function")
		throw new TypeError("Display Board runtime requires the kinetic network API");
	registered = true;
	registerMovingBlockDataContributor(DISPLAY_BOARD_BLOCK, "display_board", {
		capture: captureDisplayBoardMovingData,
		detach: detachDisplayBoardMovingData,
		restore: restoreDisplayBoardMovingData,
		schemaVersion: 1,
		validate(data) {
			if (!data || typeof data !== "object")
				throw new TypeError("Moving Display Board data must contain its persistent state");
			validateDisplayBoardState(data.state);
		}
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (!isDisplayBoard(event.block))
			return;
		try {
			createRecord(event.block.dimension.id, event.block.location);
			dirtyDimensions.add(event.block.dimension.id);
			persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not place Display Board: ${error}`);
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (event.block?.typeId !== DISPLAY_BOARD_BLOCK)
			return;
		try {
			if (records.delete(recordId(event.dimension.id, event.block.location))) {
				dirtyDimensions.add(event.dimension.id);
				persist();
			}
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not remove Display Board: ${error}`);
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (!isDisplayBoard(event.block) || event.itemStack?.typeId)
			return;
		try {
			showConfiguration(event.block.dimension.id, event.block.location, event.player, kineticWorld);
		} catch (error) {
			failedUpdates++;
			event.player?.sendMessage?.(`Could not configure Display Board: ${error}`);
		}
	});
	registerTickHandler(() => {
		runtimeTicks++;
		if (runtimeTicks % DISPLAY_SYNC_INTERVAL_TICKS !== 0)
			return store.tick();
		let changed = false;
		const dimensions = new Set([...dirtyDimensions, ...[...records.values()].map(record => record.dimensionId)]);
		for (const dimensionId of [...dimensions].sort()) {
			dirtyDimensions.delete(dimensionId);
			changed = reconcileDimension(dimensionId, kineticWorld) || changed;
		}
		if (changed)
			persist();
		return store.tick() || changed;
	});
	system.run(restore);
	return true;
}
