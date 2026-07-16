import { system, world } from "@minecraft/server";

import { getKineticSpeedAt } from "../kinetics/kinetic-runtime.js";
import { TURNTABLE, turntableRotationDelta } from "./turntable.js";

let rotatedPlayers = 0;
let failedTicks = 0;

export function applyTurntableRotation(player) {
	if (player?.isOnGround === false)
		return false;
	const location = {
		x: Math.floor(player.location.x),
		y: Math.floor(player.location.y - 0.01),
		z: Math.floor(player.location.z)
	};
	const block = player.dimension.getBlock(location);
	if (block?.typeId !== TURNTABLE)
		return false;
	const speed = getKineticSpeedAt(player.dimension.id, location);
	if (speed === 0)
		return false;
	const rotation = player.getRotation();
	player.setRotation({ x: rotation.x, y: rotation.y + turntableRotationDelta(speed) });
	rotatedPlayers++;
	return true;
}

export function getTurntableDiagnostics() {
	return { failedTicks, rotatedPlayers };
}

export function registerTurntable() {
	system.runInterval(() => {
		for (const player of world.getAllPlayers()) {
			try {
				applyTurntableRotation(player);
			} catch {
				failedTicks++;
			}
		}
	}, 1);
}
