import { system, world } from "@minecraft/server";

import { findVerticalMobilityBlock, verticalMotionImpulse } from "./vertical-mobility.js";

let compensatedPlayers = 0;
let failedTicks = 0;

export function applyVerticalMobility(player) {
	if (!player || player.isFlying || player.isGliding || player.isClimbing)
		return false;
	const match = findVerticalMobilityBlock(player.location, location => player.dimension.getBlock(location));
	if (!match)
		return false;
	const velocity = player.getVelocity();
	const impulse = verticalMotionImpulse({
		verticalVelocity: velocity.y,
		isJumping: player.isJumping,
		isSneaking: player.isSneaking
	});
	if (Math.abs(impulse) < 0.0001)
		return false;
	player.applyImpulse({ x: 0, y: impulse, z: 0 });
	compensatedPlayers++;
	return true;
}

export function getVerticalMobilityDiagnostics() {
	return { compensatedPlayers, failedTicks };
}

export function registerVerticalMobility() {
	system.runInterval(() => {
		for (const player of world.getAllPlayers()) {
			try {
				applyVerticalMobility(player);
			} catch {
				failedTicks++;
			}
		}
	}, 1);
}
