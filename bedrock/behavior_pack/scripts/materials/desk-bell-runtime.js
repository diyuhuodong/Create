import { EquipmentSlot, system, world } from "@minecraft/server";

import {
	DESK_BELL_BLOCK,
	DESK_BELL_SOUND,
	deskBellReleaseDelay,
	deskBellSoundOptions,
	withDeskBellPower
} from "./desk-bell.js";

export const DESK_BELL_INTERACTION_COMPONENT = "createbedrock:desk_bell_interaction";

const pendingReleases = new Map();
let failedInteractions = 0;
let pressedBells = 0;
let releasedBells = 0;
let registered = false;

function bellKey(dimensionId, location) {
	if (typeof dimensionId !== "string" || !location || !Number.isInteger(location.x)
		|| !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Desk Bell release locations require an integer position and dimension");
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function isDeskBell(block) {
	return block?.typeId === DESK_BELL_BLOCK;
}

function setPower(block, powered) {
	if (!isDeskBell(block) || typeof block.setPermutation !== "function")
		return false;
	block.setPermutation(withDeskBellPower(block.permutation, powered));
	return true;
}

function releaseDeskBell(dimensionId, location) {
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		if (!setPower(block, 0))
			return false;
		releasedBells++;
		return true;
	} catch {
		failedInteractions++;
		return false;
	}
}

function scheduleRelease(block) {
	const dimensionId = block.dimension.id;
	const location = { ...block.location };
	const key = bellKey(dimensionId, location);
	const existing = pendingReleases.get(key);
	if (existing !== undefined)
		system.clearRun(existing);
	const runId = system.runTimeout(() => {
		pendingReleases.delete(key);
		releaseDeskBell(dimensionId, location);
	}, deskBellReleaseDelay());
	pendingReleases.set(key, runId);
}

export function pressDeskBell(block) {
	if (!isDeskBell(block))
		return false;
	if (!setPower(block, 1))
		return false;
	block.dimension.playSound(DESK_BELL_SOUND, block.location, deskBellSoundOptions());
	scheduleRelease(block);
	pressedBells++;
	return true;
}

export function getDeskBellDiagnostics() {
	return {
		failedInteractions,
		pendingReleases: pendingReleases.size,
		pressedBells,
		releasedBells
	};
}

function removePendingRelease(event) {
	const key = bellKey(event.dimension.id, event.block.location);
	const runId = pendingReleases.get(key);
	if (runId === undefined)
		return false;
	system.clearRun(runId);
	pendingReleases.delete(key);
	return true;
}

function playerHasMainHandItem(player) {
	const equippable = player?.getComponent?.("minecraft:equippable");
	return Boolean(equippable?.getEquipment?.(EquipmentSlot.Mainhand));
}

export function registerDeskBell() {
	if (registered)
		return false;
	registered = true;
	system.beforeEvents.startup.subscribe(event => {
		event.blockComponentRegistry.registerCustomComponent(DESK_BELL_INTERACTION_COMPONENT, {
			onPlayerInteract(interactionEvent) {
				if (playerHasMainHandItem(interactionEvent.player))
					return;
				try {
					pressDeskBell(interactionEvent.block);
				} catch {
					failedInteractions++;
				}
			}
		});
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			removePendingRelease(event);
		} catch {
			failedInteractions++;
		}
	});
	return true;
}
