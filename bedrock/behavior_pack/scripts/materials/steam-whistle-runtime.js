import { EquipmentSlot, system, world } from "@minecraft/server";

import { inspectFluidTank } from "../fluids/fluid-runtime.js";
import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerNativeRedstoneEventHandler } from "../redstone/redstone-native-events.js";
import {
	MAX_WHISTLE_EXTENSION_HEIGHT,
	STEAM_WHISTLE_BLOCK,
	STEAM_WHISTLE_EXTENSION_BLOCK,
	isSteamWhistle,
	isSteamWhistleExtension,
	nextWhistleSize,
	whistlePitch,
	whistleSoundPitch
} from "./steam-whistle.js";

export const STEAM_WHISTLE_COMPONENT = "createbedrock:steam_whistle_runtime";
const POWERED_STATE = "createbedrock:powered";
const SIZE_STATE = "createbedrock:size";
const PITCH_STATE = "createbedrock:pitch";
const EXTENSION_SHAPE_STATE = "createbedrock:extension_shape";
let failedUpdates = 0;
let notesPlayed = 0;
let registered = false;
let resizedWhistles = 0;

function stateFor(block, state, fallback = 0) {
	const value = block?.permutation?.getAllStates?.()[state];
	return Number.isInteger(value) ? value : fallback;
}

function setStates(block, values) {
	if (!(isSteamWhistle(block?.typeId) || isSteamWhistleExtension(block?.typeId)) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [name, value] of Object.entries(values)) {
		if (permutation.getAllStates?.()[name] === value)
			continue;
		permutation = permutation.withState(name, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function extensionsFor(block) {
	const shapes = [];
	for (let y = 1; y <= MAX_WHISTLE_EXTENSION_HEIGHT; y++) {
		const extension = block.dimension.getBlock({ x: block.location.x, y: block.location.y + y, z: block.location.z });
		if (!isSteamWhistleExtension(extension?.typeId))
			break;
		shapes.push(stateFor(extension, EXTENSION_SHAPE_STATE));
	}
	return shapes;
}

function isFuelled(block) {
	const facing = stateFor(block, "minecraft:facing_direction", 1);
	const offset = ({ 2: { x: 0, y: 0, z: 1 }, 3: { x: 0, y: 0, z: -1 }, 4: { x: 1, y: 0, z: 0 }, 5: { x: -1, y: 0, z: 0 }, 0: { x: 0, y: -1, z: 0 }, 1: { x: 0, y: -1, z: 0 } })[facing];
	const tank = block.dimension.getBlock({ x: block.location.x + offset.x, y: block.location.y + offset.y, z: block.location.z + offset.z });
	try {
		const contents = inspectFluidTank(tank)?.contents;
		return Boolean(contents && contents.amount > 0);
	} catch {
		return false;
	}
}

export function updateSteamWhistlePitch(block) {
	if (!isSteamWhistle(block?.typeId))
		return false;
	return setStates(block, { [PITCH_STATE]: whistlePitch(extensionsFor(block)) });
}

export function applySteamWhistlePower(block, powerLevel) {
	if (!isSteamWhistle(block?.typeId))
		return false;
	return setStates(block, { [POWERED_STATE]: powerLevel > 0 ? 1 : 0 });
}

function playWhistle(block) {
	if (!isSteamWhistle(block?.typeId) || stateFor(block, POWERED_STATE) !== 1 || !isFuelled(block))
		return false;
	const size = stateFor(block, SIZE_STATE, 1);
	const pitch = whistleSoundPitch(stateFor(block, PITCH_STATE));
	const sound = size === 0 ? "createbedrock:whistle_low" : size === 2 ? "createbedrock:whistle_high" : "createbedrock:whistle";
	block.dimension.playSound?.(sound, block.location, { pitch, volume: 1 });
	block.dimension.spawnParticle?.("minecraft:basic_smoke_particle", { x: block.location.x + 0.5, y: block.location.y + 1.25, z: block.location.z + 0.5 });
	notesPlayed++;
	return true;
}

function extendWhistle(block) {
	for (let y = 1; y <= MAX_WHISTLE_EXTENSION_HEIGHT; y++) {
		const target = block.dimension.getBlock({ x: block.location.x, y: block.location.y + y, z: block.location.z });
		if (isSteamWhistleExtension(target?.typeId)) {
			if (stateFor(target, EXTENSION_SHAPE_STATE) === 0) {
				setStates(target, { [EXTENSION_SHAPE_STATE]: 1 });
				updateSteamWhistlePitch(block);
				return true;
			}
			continue;
		}
		if (target?.typeId !== "minecraft:air")
			return false;
		target.setType(STEAM_WHISTLE_EXTENSION_BLOCK);
		setStates(target, { [SIZE_STATE]: stateFor(block, SIZE_STATE, 1), [EXTENSION_SHAPE_STATE]: 0 });
		updateSteamWhistlePitch(block);
		return true;
	}
	return false;
}

function heldWhistle(player) {
	return player?.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId === STEAM_WHISTLE_BLOCK;
}

function captureWhistleData(dimensionId, location) {
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		return isSteamWhistle(block?.typeId) ? { pitch: stateFor(block, PITCH_STATE), size: stateFor(block, SIZE_STATE), powered: stateFor(block, POWERED_STATE) } : undefined;
	} catch {
		return undefined;
	}
}

function restoreWhistleData(dimensionId, location, data) {
	if (!data || !Number.isInteger(data.pitch) || !Number.isInteger(data.size) || !Number.isInteger(data.powered))
		return false;
	try {
		return setStates(world.getDimension(dimensionId).getBlock(location), { [PITCH_STATE]: data.pitch, [SIZE_STATE]: data.size, [POWERED_STATE]: data.powered });
	} catch {
		return false;
	}
}

export function getSteamWhistleDiagnostics() {
	return { failedUpdates, notesPlayed, resizedWhistles };
}

export function registerSteamWhistles() {
	if (registered)
		return false;
	registered = true;
	system.beforeEvents.startup.subscribe(event => {
		event.blockComponentRegistry.registerCustomComponent(STEAM_WHISTLE_COMPONENT, {
			onPlayerInteract(interaction) {
				try {
					if (!heldWhistle(interaction.player))
						return;
					setStates(interaction.block, { [SIZE_STATE]: nextWhistleSize(stateFor(interaction.block, SIZE_STATE, 1)) });
					resizedWhistles++;
				} catch { failedUpdates++; }
			},
			onTick(tick) {
				try { updateSteamWhistlePitch(tick.block); playWhistle(tick.block); } catch { failedUpdates++; }
			}
		});
	});
	registerNativeRedstoneEventHandler(({ block, powerLevel }) => applySteamWhistlePower(block, powerLevel));
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (isSteamWhistle(event.block?.typeId)) {
				updateSteamWhistlePitch(event.block);
				applySteamWhistlePower(event.block, event.block.getRedstonePower?.() ?? 0);
			} else if (isSteamWhistleExtension(event.block?.typeId)) {
				const root = event.block.dimension.getBlock({ x: event.block.location.x, y: event.block.location.y - 1, z: event.block.location.z });
				if (isSteamWhistle(root?.typeId)) updateSteamWhistlePitch(root);
			}
		} catch { failedUpdates++; }
	});
	registerMovingBlockDataContributor(STEAM_WHISTLE_BLOCK, "steam_whistle", {
		capture: captureWhistleData,
		detach() {},
		restore: restoreWhistleData,
		schemaVersion: 1,
		validate(data) {
			if (!data || !Number.isInteger(data.pitch) || data.pitch < 0 || data.pitch > 24 || !Number.isInteger(data.size) || data.size < 0 || data.size > 2 || ![0, 1].includes(data.powered))
				throw new TypeError("Moving Steam Whistle data must preserve powered size and pitch");
		}
	});
	return true;
}
