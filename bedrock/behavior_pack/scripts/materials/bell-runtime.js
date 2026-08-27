import { EquipmentSlot, system, world } from "@minecraft/server";

import { registerBlockComponent } from "../kernel/register-block-component.js";
import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerNativeRedstoneEventHandler } from "../redstone/redstone-native-events.js";
import {
	BELL_BLOCKS,
	BELL_RING_DURATION,
	HAUNTED_BELL_BLOCK,
	HAUNTED_BELL_EFFECT_TICKS,
	HAUNTED_BELL_HELD_DISTANCE,
	HAUNTED_BELL_HELD_RECHARGE_TICKS,
	HAUNTED_BELL_HELD_WARMUP_TICKS,
	HAUNTED_BELL_PULSE_DISTANCE,
	PECULIAR_BELL_BLOCK,
	bellCanRing,
	bellPowerState,
	bellRingState,
	isBell,
	nextBellTicks,
	shouldHauntPeculiarBell
} from "./bell.js";

export const BELL_COMPONENT = "createbedrock:bell_runtime";
const POWERED_STATE = "createbedrock:powered";
const RINGING_TICKS_STATE = "createbedrock:ringing_ticks";
const EFFECT_TICKS_STATE = "createbedrock:effect_ticks";
const heldWarmups = new Map();
let failedUpdates = 0;
let heldPulses = 0;
let pulses = 0;
let rings = 0;
let registered = false;

function setStates(block, states) {
	if (!isBell(block?.typeId) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [name, value] of Object.entries(states)) {
		if (permutation.getAllStates?.()[name] === value)
			continue;
		permutation = permutation.withState(name, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function stateFor(block, state, fallback = 0) {
	const value = block?.permutation?.getAllStates?.()[state];
	return Number.isInteger(value) ? value : fallback;
}

function pulse(block, distance) {
	if (block?.typeId !== HAUNTED_BELL_BLOCK)
		return false;
	try {
		for (const entity of block.dimension.getEntities({ location: block.location, maxDistance: distance }))
			block.dimension.spawnParticle?.("minecraft:soul_particle", entity.location);
		pulses++;
		return true;
	} catch {
		failedUpdates++;
		return false;
	}
}

export function ringBell(block) {
	if (!isBell(block?.typeId) || !bellCanRing(block.typeId, stateFor(block, RINGING_TICKS_STATE)))
		return false;
	const state = bellRingState(block.typeId);
	setStates(block, state);
	block.dimension.playSound?.(block.typeId === HAUNTED_BELL_BLOCK ? "createbedrock:haunted_bell_use" : "block.bell.hit", block.location, { volume: block.typeId === HAUNTED_BELL_BLOCK ? 4 : 2, pitch: 1 });
	if (block.typeId === HAUNTED_BELL_BLOCK)
		pulse(block, HAUNTED_BELL_PULSE_DISTANCE);
	rings++;
	return true;
}

export function tickBell(block) {
	if (!isBell(block?.typeId))
		return false;
	if (shouldHauntPeculiarBell(block.typeId, block.dimension.getBlock({ x: block.location.x, y: block.location.y - 1, z: block.location.z })?.typeId)) {
		const oldStates = block.permutation.getAllStates?.() ?? {};
		block.setType(HAUNTED_BELL_BLOCK);
		setStates(block, { [POWERED_STATE]: oldStates[POWERED_STATE] ?? 0, [RINGING_TICKS_STATE]: 0, [EFFECT_TICKS_STATE]: HAUNTED_BELL_EFFECT_TICKS });
		block.dimension.playSound?.("createbedrock:haunted_bell_convert", block.location);
		return true;
	}
	const next = nextBellTicks({ ringingTicks: stateFor(block, RINGING_TICKS_STATE), effectTicks: stateFor(block, EFFECT_TICKS_STATE) });
	return setStates(block, next);
}

function updateBellPower(block, powerLevel) {
	if (!isBell(block?.typeId))
		return false;
	const powered = bellPowerState(powerLevel);
	const wasPowered = stateFor(block, POWERED_STATE);
	setStates(block, { [POWERED_STATE]: powered });
	if (powered && !wasPowered)
		ringBell(block);
	return true;
}

function heldBellTick() {
	for (const player of world.getAllPlayers()) {
		try {
			const item = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
			if (item?.typeId !== HAUNTED_BELL_BLOCK) {
				heldWarmups.delete(player.id);
				continue;
			}
			const elapsed = (heldWarmups.get(player.id) ?? 0) + 1;
			heldWarmups.set(player.id, elapsed);
			if (elapsed < HAUNTED_BELL_HELD_WARMUP_TICKS || (elapsed - HAUNTED_BELL_HELD_WARMUP_TICKS) % HAUNTED_BELL_HELD_RECHARGE_TICKS !== 0)
				continue;
			for (const entity of player.dimension.getEntities({ location: player.location, maxDistance: HAUNTED_BELL_HELD_DISTANCE }))
				player.dimension.spawnParticle?.("minecraft:soul_particle", entity.location);
			heldPulses++;
		} catch {
			failedUpdates++;
		}
	}
}

function captureBellData(dimensionId, location) {
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		if (!isBell(block?.typeId))
			return undefined;
		return { effectTicks: stateFor(block, EFFECT_TICKS_STATE), ringingTicks: stateFor(block, RINGING_TICKS_STATE) };
	} catch {
		return undefined;
	}
}

function restoreBellData(dimensionId, location, data) {
	if (!data || !Number.isInteger(data.effectTicks) || !Number.isInteger(data.ringingTicks))
		return false;
	try {
		return setStates(world.getDimension(dimensionId).getBlock(location), data);
	} catch {
		return false;
	}
}

export function getBellDiagnostics() {
	return { failedUpdates, heldPulses, pulses, rings };
}

export function registerBells() {
	if (registered)
		return false;
	registered = true;
	system.beforeEvents.startup.subscribe(event => {
		registerBlockComponent(event.blockComponentRegistry, BELL_COMPONENT, {
			onPlayerInteract(interaction) {
				try { ringBell(interaction.block); } catch { failedUpdates++; }
			},
			onTick(tick) {
				try { tickBell(tick.block); } catch { failedUpdates++; }
			}
		});
	});
	registerNativeRedstoneEventHandler(({ block, powerLevel }) => updateBellPower(block, powerLevel));
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (!isBell(event.block?.typeId))
			return;
		try { updateBellPower(event.block, event.block.getRedstonePower?.() ?? 0); } catch { failedUpdates++; }
	});
	system.runInterval(heldBellTick, 1);
	for (const typeId of BELL_BLOCKS)
		registerMovingBlockDataContributor(typeId, "bell", {
			capture: captureBellData,
			detach() {},
			restore: restoreBellData,
			schemaVersion: 1,
			validate(data) {
				if (!data || !Number.isInteger(data.ringingTicks) || data.ringingTicks < 0 || data.ringingTicks > BELL_RING_DURATION
					|| !Number.isInteger(data.effectTicks) || data.effectTicks < 0 || data.effectTicks > HAUNTED_BELL_EFFECT_TICKS)
					throw new TypeError("Moving bell data must retain ring and effect counters");
			}
		});
	return true;
}
