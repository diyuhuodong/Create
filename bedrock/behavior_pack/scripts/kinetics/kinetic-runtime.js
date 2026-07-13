import { system, world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { KineticWorld } from "./kinetic-world.js";

const kineticWorld = new KineticWorld();
const PERSISTENCE_KEY = "createbedrock:kinetic_world_v1";
const BELT_CONNECTOR = "createbedrock:belt_connector";
const pendingBeltEndpoints = new Map();

function persist() {
	world.setDynamicProperty(PERSISTENCE_KEY, JSON.stringify(kineticWorld.snapshot()));
}

export function persistKineticWorld() {
	persist();
}

function restore() {
	const value = world.getDynamicProperty(PERSISTENCE_KEY);
	if (typeof value !== "string")
		return;

	try {
		kineticWorld.restore(JSON.parse(value));
		console.warn("[Create Bedrock] Restored kinetic world state");
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid kinetic world state: ${error}`);
	}
}

export function registerKinetics() {
	system.run(restore);

	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (kineticWorld.trackPlacedBlock(event.block))
			persist();
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (kineticWorld.trackBrokenBlock(event.dimension.id, event.block.location))
			persist();
	});

	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.itemStack?.typeId === BELT_CONNECTOR) {
			const playerId = event.player.id;
			const pending = pendingBeltEndpoints.get(playerId);
			if (!pending) {
				if (kineticWorld.isBeltPulley(event.block.dimension.id, event.block.location)) {
					pendingBeltEndpoints.set(playerId, {
						dimensionId: event.block.dimension.id,
						location: { ...event.block.location }
					});
					console.warn("[Create Bedrock] Belt connector selected its first shaft");
				}
				return;
			}

			pendingBeltEndpoints.delete(playerId);
			const result = pending.dimensionId === event.block.dimension.id
				? kineticWorld.connectBelt(pending.dimensionId, pending.location, event.block.location)
				: { ok: false, reason: "different_dimension" };
			if (result.ok) {
				persist();
				console.warn("[Create Bedrock] Belt link created");
			} else {
				console.warn(`[Create Bedrock] Belt link rejected: ${result.reason}`);
			}
			return;
		}

		if (kineticWorld.activateHandCrank(event.block))
			console.warn(`[Create Bedrock] Hand crank activated at ${event.block.location.x}, ${event.block.location.y}, ${event.block.location.z}`);
	});

	registerTickHandler(() => kineticWorld.tick());
}

export function getKineticWorldForTesting() {
	return kineticWorld;
}
