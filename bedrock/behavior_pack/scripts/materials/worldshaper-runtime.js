import { BlockPermutation, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import {
	WORLDSHAPER_BRUSHES,
	WORLDSHAPER_ITEM,
	WORLDSHAPER_PATTERNS,
	WORLDSHAPER_PLACEMENTS,
	WORLDSHAPER_TOOLS,
	captureWorldshaperMaterial,
	createWorldshaperState,
	effectiveWorldshaperTool,
	faceVector,
	requiresWorldshaperMaterial,
	resolveWorldshaperTargets,
	stateForWorldshaperItem,
	supportedWorldshaperTools,
	writeWorldshaperItemState
} from "./worldshaper.js";

const AIR = "minecraft:air";
const WORLDSHAPER_TASK_BUDGET = 4;
const WORLDSHAPER_MUTATIONS_PER_TASK = 128;
const jobs = new Map();
const handledUseOn = new Set();
let failedOperations = 0;
let appliedMutations = 0;
let registered = false;

function selectedWorldshaperSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0 || slot >= container.size)
		return undefined;
	const itemStack = container.getItem(slot);
	if (itemStack?.typeId !== WORLDSHAPER_ITEM)
		return undefined;
	return {
		itemStack,
		setItem(item) { container.setItem(slot, item); }
	};
}

function isCreative(player) {
	return player?.getGameMode?.() === "creative";
}

function isReplaceable(block) {
	return !block || [AIR, "minecraft:cave_air", "minecraft:void_air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"].includes(block.typeId);
}

function readBlock(dimension, location) {
	try {
		const block = dimension.getBlock(location);
		return block && { isReplaceable: isReplaceable(block), typeId: block.typeId };
	} catch {
		return undefined;
	}
}

function writePermutation(block, selected) {
	if (!block || !selected)
		return false;
	block.setPermutation(BlockPermutation.resolve(selected.typeId, selected.states));
	return true;
}

function signedCoordinate(location, face) {
	return location.x * face.x + location.y * face.y + location.z * face.z;
}

function flattenMutations(dimension, positions, rawFace) {
	const face = faceVector(rawFace);
	const surfaces = new Map();
	for (const location of positions) {
		let block;
		let front;
		try {
			block = dimension.getBlock(location);
			front = dimension.getBlock({ x: location.x + face.x, y: location.y + face.y, z: location.z + face.z });
		} catch {
			continue;
		}
		if (isReplaceable(block) || !isReplaceable(front))
			continue;
		const column = face.x !== 0 ? `${location.y}:${location.z}` : face.y !== 0 ? `${location.x}:${location.z}` : `${location.x}:${location.y}`;
		const current = surfaces.get(column);
		if (!current || signedCoordinate(location, face) > signedCoordinate(current.location, face))
			surfaces.set(column, { location, states: block.permutation.getAllStates(), typeId: block.typeId });
	}
	const ordered = [...surfaces.values()];
	if (ordered.length === 0)
		return [];
	const heights = ordered.map(surface => signedCoordinate(surface.location, face)).sort((left, right) => left - right);
	const level = heights[Math.floor(heights.length / 2)];
	const mutations = [];
	for (const surface of ordered) {
		const height = signedCoordinate(surface.location, face);
		if (height === level)
			continue;
		const step = height < level ? 1 : -1;
		for (let coordinate = height + step; step > 0 ? coordinate <= level : coordinate >= level; coordinate += step) {
			const delta = coordinate - height;
			mutations.push({
				location: {
					x: surface.location.x + face.x * delta,
					y: surface.location.y + face.y * delta,
					z: surface.location.z + face.z * delta
				},
				...(step > 0 ? { states: surface.states, typeId: surface.typeId } : { typeId: AIR })
			});
		}
	}
	return mutations;
}

function queueOperation(player, block, rawFace) {
	if (!isCreative(player)) {
		player.sendMessage?.("Creative Worldshaper is available only in Creative mode.");
		return false;
	}
	const holder = selectedWorldshaperSlot(player);
	if (!holder)
		return false;
	const settings = stateForWorldshaperItem(holder.itemStack);
	if (requiresWorldshaperMaterial(settings) && !settings.selected) {
		player.sendMessage?.("Sneak-use a block with the Worldshaper to select its material first.");
		return false;
	}
	const dimension = block?.dimension;
	if (!dimension || !block?.location)
		return false;
	const positions = resolveWorldshaperTargets({
		face: rawFace,
		readBlock: location => readBlock(dimension, location),
		settings,
		target: block.location
	});
	const tool = effectiveWorldshaperTool(settings);
	const job = {
		cursor: 0,
		dimensionId: dimension.id,
		face: rawFace,
		playerId: player.id,
		positions,
		settings,
		tool
	};
	if (tool === "flatten") {
		job.mutations = flattenMutations(dimension, positions, rawFace);
		job.positions = undefined;
	}
	jobs.set(player.id, job);
	player.sendMessage?.(`Worldshaper queued ${job.mutations?.length ?? positions.length} ${tool} mutation${(job.mutations?.length ?? positions.length) === 1 ? "" : "s"}.`);
	return true;
}

function applyCell(job, dimension, location) {
	let block;
	try {
		block = dimension.getBlock(location);
	} catch {
		return false;
	}
	if (!block)
		return false;
	const { selected } = job.settings;
	if (job.tool === "clear") {
		block.setType(AIR);
		return true;
	}
	if (job.tool === "fill") {
		if (!isReplaceable(block))
			return false;
		return writePermutation(block, selected);
	}
	if (job.tool === "replace") {
		if (isReplaceable(block))
			return false;
		return writePermutation(block, selected);
	}
	if (job.tool === "overlay") {
		if (isReplaceable(block))
			return false;
		const above = dimension.getBlock({ x: location.x, y: location.y + 1, z: location.z });
		if (!isReplaceable(above))
			return false;
		return writePermutation(above, selected);
	}
	return writePermutation(block, selected);
}

function applyMutation(dimension, mutation) {
	try {
		const block = dimension.getBlock(mutation.location);
		if (!block)
			return false;
		if (mutation.typeId === AIR) {
			block.setType(AIR);
			return true;
		}
		block.setPermutation(BlockPermutation.resolve(mutation.typeId, mutation.states));
		return true;
	} catch {
		return false;
	}
}

function processJobs() {
	for (const [playerId, job] of jobs) {
		let dimension;
		try {
			dimension = world.getDimension(job.dimensionId);
		} catch {
			jobs.delete(playerId);
			failedOperations++;
			continue;
		}
		const source = job.mutations ?? job.positions;
		let processed = 0;
		while (job.cursor < source.length && processed < WORLDSHAPER_MUTATIONS_PER_TASK) {
			const entry = source[job.cursor++];
			try {
				const changed = job.mutations ? applyMutation(dimension, entry) : applyCell(job, dimension, entry);
				if (changed)
					appliedMutations++;
			} catch {
				failedOperations++;
			}
			processed++;
		}
		if (job.cursor >= source.length)
			jobs.delete(playerId);
	}
}

function selectedIndex(values, value) {
	return Math.max(0, values.indexOf(value));
}

function selectedStateHolder(player) {
	const holder = selectedWorldshaperSlot(player);
	if (!holder)
		throw new Error("Hold the Creative Worldshaper in the selected inventory slot.");
	return { holder, state: stateForWorldshaperItem(holder.itemStack) };
}

function updateWorldshaperState(player, patch) {
	const { holder, state } = selectedStateHolder(player);
	const next = createWorldshaperState({ ...state, ...patch });
	writeWorldshaperItemState(holder.itemStack, next);
	holder.setItem(holder.itemStack);
	return next;
}

function showWorldshaperConfig(player) {
	let current;
	try {
		current = selectedStateHolder(player).state;
	} catch (error) {
		player.sendMessage?.(`Could not configure Worldshaper: ${error}`);
		return;
	}
	const form = new ModalFormData()
		.title("Creative Worldshaper")
		.dropdown("Brush", WORLDSHAPER_BRUSHES, selectedIndex(WORLDSHAPER_BRUSHES, current.brush))
		.dropdown("Tool", WORLDSHAPER_TOOLS, selectedIndex(WORLDSHAPER_TOOLS, current.tool))
		.dropdown("Pattern", WORLDSHAPER_PATTERNS, selectedIndex(WORLDSHAPER_PATTERNS, current.pattern))
		.dropdown("Placement", WORLDSHAPER_PLACEMENTS, selectedIndex(WORLDSHAPER_PLACEMENTS, current.placement))
		.slider("Width / Radius / Range", 0, 32, { defaultValue: current.params[0], valueStep: 1 })
		.slider("Height", 1, 32, { defaultValue: current.params[1], valueStep: 1 })
		.slider("Length", 1, 32, { defaultValue: current.params[2], valueStep: 1 })
		.toggle("Follow diagonals (Surface / Cluster)", current.connectDiagonals)
		.toggle("Ignore material borders (Surface / Cluster)", current.fuzzy);
	form.show(player).then(response => {
		if (response.canceled || !Array.isArray(response.formValues))
			return;
		const [brushIndex, toolIndex, patternIndex, placementIndex, first, second, third, connectDiagonals, fuzzy] = response.formValues;
		try {
			const brush = WORLDSHAPER_BRUSHES[brushIndex] ?? current.brush;
			const requestedTool = WORLDSHAPER_TOOLS[toolIndex] ?? current.tool;
			const settings = updateWorldshaperState(player, {
				brush,
				connectDiagonals: !!connectDiagonals,
				fuzzy: !!fuzzy,
				params: [Math.round(first), Math.round(second), Math.round(third)],
				pattern: WORLDSHAPER_PATTERNS[patternIndex] ?? current.pattern,
				placement: WORLDSHAPER_PLACEMENTS[placementIndex] ?? current.placement,
				tool: requestedTool
			});
			const validTools = supportedWorldshaperTools(settings.brush);
			player.sendMessage?.(`Worldshaper configured: ${settings.brush}, ${settings.tool}${validTools.includes(requestedTool) ? "" : ` (limited to ${validTools.join(", ")})`}.`);
		} catch (error) {
			failedOperations++;
			player.sendMessage?.(`Could not save Worldshaper settings: ${error}`);
		}
	}).catch(error => {
		failedOperations++;
		player.sendMessage?.(`Could not open Worldshaper settings: ${error}`);
	});
}

function selectWorldshaperMaterial(player, block) {
	if (!isCreative(player)) {
		player.sendMessage?.("Creative Worldshaper is available only in Creative mode.");
		return false;
	}
	const selected = captureWorldshaperMaterial(block);
	if (!selected) {
		player.sendMessage?.("Worldshaper can select a non-air block material only.");
		return false;
	}
	try {
		updateWorldshaperState(player, { selected });
		player.sendMessage?.(`Worldshaper material selected: ${selected.typeId}.`);
		return true;
	} catch (error) {
		failedOperations++;
		player.sendMessage?.(`Could not select Worldshaper material: ${error}`);
		return false;
	}
}

export function getWorldshaperDiagnostics() {
	return { appliedMutations, failedOperations, queuedJobs: jobs.size };
}

export function registerWorldshaper() {
	if (registered)
		return false;
	registered = true;
	registerKernelTaskGroup("worldshaper", WORLDSHAPER_TASK_BUDGET);
	world.afterEvents.itemStartUseOn.subscribe(event => {
		if (event.itemStack?.typeId !== WORLDSHAPER_ITEM)
			return;
		handledUseOn.add(event.source.id);
		system.run(() => handledUseOn.delete(event.source.id));
		try {
			if (event.source.isSneaking)
				selectWorldshaperMaterial(event.source, event.block);
			else
				queueOperation(event.source, event.block, event.blockFace);
		} catch (error) {
			failedOperations++;
			event.source?.sendMessage?.(`Worldshaper operation failed: ${error}`);
		}
	});
	world.afterEvents.itemUse.subscribe(event => {
		if (event.itemStack?.typeId !== WORLDSHAPER_ITEM || handledUseOn.has(event.source.id) || !event.source.isSneaking)
			return;
		showWorldshaperConfig(event.source);
	});
	world.afterEvents.playerLeave.subscribe(event => jobs.delete(event.playerId));
	registerTickHandler(processJobs, "worldshaper");
	return true;
}
