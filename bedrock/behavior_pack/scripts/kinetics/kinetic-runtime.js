import { system, world } from "@minecraft/server";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { deserializeVersionedState, serializeVersionedState } from "../kernel/versioned-state.js";
import { KineticWorld } from "./kinetic-world.js";

const kineticWorld = new KineticWorld();
const PERSISTENCE_KEY = "createbedrock:kinetic_world_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const BELT_CONNECTOR = "createbedrock:belt_connector";
const CLUTCH_BLOCK = "createbedrock:clutch";
const WATER_WHEEL_BLOCK = "createbedrock:water_wheel";
const WATER_WHEEL_CHECK_INTERVAL = 20;
const KINETIC_DIMENSION_TASK_BUDGET = 2;
const pendingBeltEndpoints = new Map();
let waterWheelTicks = 0;

function persist() {
	world.setDynamicProperty(PERSISTENCE_KEY, serializeVersionedState(PERSISTENCE_SCHEMA_VERSION, kineticWorld.snapshot()));
	kineticWorld.consumePersistenceDirty();
}

export function persistKineticWorld() {
	persist();
}

function restore() {
	const value = world.getDynamicProperty(PERSISTENCE_KEY);
	if (typeof value !== "string")
		return;

	try {
		kineticWorld.restore(deserializeVersionedState(value, {
			schemaVersion: PERSISTENCE_SCHEMA_VERSION,
			upgrades: {
				0: legacy => legacy
			}
		}));
		console.warn("[Create Bedrock] Restored kinetic world state");
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid kinetic world state: ${error}`);
	}
}

function refreshWaterWheel(wheel) {
	const dimension = world.getDimension(wheel.dimensionId);
	let hasWater = false;
	for (const offset of [
		{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
		{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
		{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
	]) {
		if ((wheel.axis === "x" && offset.x !== 0) || (wheel.axis === "y" && offset.y !== 0) || (wheel.axis === "z" && offset.z !== 0))
			continue;
		const neighbor = dimension.getBlock({
			x: wheel.location.x + offset.x,
			y: wheel.location.y + offset.y,
			z: wheel.location.z + offset.z
		});
		if (neighbor?.typeId === "minecraft:water") {
			hasWater = true;
			break;
		}
	}
	if (kineticWorld.setGeneratedSpeed(wheel.dimensionId, wheel.location, hasWater ? 8 : 0))
		persist();
}

export function registerKinetics() {
	registerKernelTaskGroup("kinetics", KINETIC_DIMENSION_TASK_BUDGET);
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
		if (event.block.typeId === CLUTCH_BLOCK) {
			const states = event.block.permutation.getAllStates();
			const enabled = states["createbedrock:enabled"] !== 0 && states["createbedrock:enabled"] !== false;
			event.block.setPermutation(event.block.permutation.withState("createbedrock:enabled", enabled ? 0 : 1));
			kineticWorld.trackPlacedBlock(event.block);
			persist();
			console.warn(`[Create Bedrock] Clutch ${enabled ? "disengaged" : "engaged"}`);
			return;
		}

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

		if (kineticWorld.activateHandCrank(event.block)) {
			persist();
			console.warn(`[Create Bedrock] Hand crank activated at ${event.block.location.x}, ${event.block.location.y}, ${event.block.location.z}`);
		}
	});

	registerTickHandler(() => {
		waterWheelTicks++;
		if (waterWheelTicks >= WATER_WHEEL_CHECK_INTERVAL) {
			waterWheelTicks = 0;
			for (const wheel of kineticWorld.getGeneratedSourceNodes(WATER_WHEEL_BLOCK)) {
				const key = `water-wheel:${wheel.dimensionId}:${wheel.location.x}:${wheel.location.y}:${wheel.location.z}`;
				enqueueUniqueKernelTask(key, () => refreshWaterWheel(wheel), "kinetics");
			}
		}
		for (const dimensionId of kineticWorld.advanceTick())
			enqueueUniqueKernelTask(`kinetics:${dimensionId}`, () => kineticWorld.resolveDirtyDimension(dimensionId), "kinetics");
		if (kineticWorld.consumePersistenceDirty())
			persist();
	});
}

export function getKineticWorldForTesting() {
	return kineticWorld;
}

export function getKineticDiagnostics() {
	return kineticWorld.diagnostics();
}
