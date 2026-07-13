import { ItemStack, system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { planFluidBucketInteraction, settleFluidBucketInteraction } from "./fluid-container.js";
import { fluidTankId, FluidNetworkState } from "./fluid-network-state.js";
import { configureFluidDevice, fluidDeviceId, fluidDeviceLocation, offsetFluidLocation } from "./fluid-topology.js";

const FLUID_PIPE_BLOCK = "createbedrock:fluid_pipe";
const FLUID_TASK_BUDGET = 8;
const FLUID_TASK_GROUP = "fluids";
const FLUID_TANK_BLOCK = "createbedrock:fluid_tank";
const MECHANICAL_PUMP_BLOCK = "createbedrock:mechanical_pump";
const NEIGHBOR_OFFSETS = [
	{ x: 1, y: 0, z: 0 },
	{ x: -1, y: 0, z: 0 },
	{ x: 0, y: 1, z: 0 },
	{ x: 0, y: -1, z: 0 },
	{ x: 0, y: 0, z: 1 },
	{ x: 0, y: 0, z: -1 }
];
const state = new FluidNetworkState({
	onError(error) {
		console.warn(`[Create Bedrock] Fluid state error: ${error}`);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function blockKind(block) {
	if (block?.typeId === FLUID_PIPE_BLOCK)
		return "pipe";
	if (block?.typeId === MECHANICAL_PUMP_BLOCK)
		return "pump";
	return undefined;
}

function fluidTankAt(dimension, location) {
	const block = dimension.getBlock(location);
	return block?.typeId === FLUID_TANK_BLOCK ? fluidTankId(dimension.id, block.location) : undefined;
}

function tankIdentifier(block) {
	return fluidTankId(block.dimension.id, block.location);
}

function pumpRunning(block, kineticWorld) {
	return Math.abs(kineticWorld?.speedAt(block.dimension.id, block.location) ?? 0) > 0;
}

function configureDevice(block, kineticWorld) {
	const kind = blockKind(block);
	if (!kind)
		return false;
	const result = configureFluidDevice({
		createLink(options) {
			if (kind === "pipe")
				state.createPipe(options);
			else
				state.createPump({ ...options, running: pumpRunning(block, kineticWorld) });
		},
		device: { dimensionId: block.dimension.id, location: block.location },
		facing: block.permutation.getAllStates()["minecraft:facing_direction"],
		hasLink(id) {
			return state.hasLink(id);
		},
		kind,
		tankAt(location) {
			return fluidTankAt(block.dimension, location);
		}
	});
	return result.ok && !result.reused;
}

function configureAdjacentDevices(tank, kineticWorld) {
	let changed = false;
	for (const offset of NEIGHBOR_OFFSETS) {
		const neighbor = tank.dimension.getBlock(offsetFluidLocation(tank.location, offset));
		changed = configureDevice(neighbor, kineticWorld) || changed;
	}
	return changed;
}

function removeDevice(block) {
	const kind = blockKind(block);
	if (!kind)
		return false;
	const id = fluidDeviceId(kind, block.dimension.id, block.location);
	return state.hasLink(id) ? state.removeLink(id) : false;
}

function interactWithTankBucket({ dimensionId, location, plan, player, slot }) {
	if (player.selectedSlotIndex !== slot)
		return { ok: false, reason: "held_slot_changed" };
	const dimension = world.getDimension(dimensionId);
	const block = dimension.getBlock(location);
	if (block?.typeId !== FLUID_TANK_BLOCK)
		return { ok: false, reason: "tank_removed" };
	const tankId = tankIdentifier(block);
	if (!state.hasTank(tankId))
		return { ok: false, reason: "tank_unavailable" };
	const inventory = player.getComponent("minecraft:inventory")?.container;
	if (!inventory)
		return { ok: false, reason: "inventory_unavailable" };
	return settleFluidBucketInteraction({
		extractFluid(options) {
			return state.extract(tankId, options);
		},
		getHeldItem() {
			const stack = inventory.getItem(slot);
			return stack && { amount: stack.amount, typeId: stack.typeId };
		},
		insertFluid(fluid) {
			return state.insert(tankId, fluid);
		},
		plan,
		setHeldItem(item) {
			inventory.setItem(slot, new ItemStack(item.typeId, item.amount));
		}
	});
}

function syncPumpStates(kineticWorld) {
	for (const pump of state.links().filter(link => link.kind === "pump")) {
		const location = fluidDeviceLocation("pump", pump.id);
		if (!location)
			continue;
		try {
			const dimension = world.getDimension(location.dimensionId);
			const block = dimension.getBlock(location.location);
			if (block?.typeId === MECHANICAL_PUMP_BLOCK)
				state.setPumpRunning(pump.id, pumpRunning(block, kineticWorld));
		} catch (error) {
			console.warn(`[Create Bedrock] Could not synchronize pump ${pump.id}: ${error}`);
		}
	}
}

export function extractFluidTank(block, options) {
	return state.extract(tankIdentifier(block), options);
}

export function getFluidDiagnostics() {
	return state.diagnostics();
}

export function getFluidTankId(block) {
	return tankIdentifier(block);
}

export function insertFluidTank(block, fluid, options) {
	return state.insert(tankIdentifier(block), fluid, options);
}

export function registerFluids(getKineticWorld) {
	if (typeof getKineticWorld !== "function")
		throw new TypeError("Fluid runtime requires the kinetic-world provider");
	registerKernelTaskGroup(FLUID_TASK_GROUP, FLUID_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (event.block.typeId === FLUID_TANK_BLOCK) {
				state.createTank({ dimensionId: event.block.dimension.id, location: event.block.location });
				configureAdjacentDevices(event.block, getKineticWorld());
				return;
			}
			configureDevice(event.block, getKineticWorld());
		} catch (error) {
			console.warn(`[Create Bedrock] Could not configure fluid block: ${error}`);
		}
	});

	world.beforeEvents.playerBreakBlock.subscribe(event => {
		try {
			if (event.block.typeId === FLUID_TANK_BLOCK && !state.canRemoveTank(tankIdentifier(event.block))) {
				event.cancel = true;
				event.player.sendMessage("Cannot remove a fluid tank while it stores fluid or has an active connection.");
				return;
			}
			const kind = blockKind(event.block);
			if (kind && state.hasLink(fluidDeviceId(kind, event.block.dimension.id, event.block.location))) {
				const link = state.links().find(entry => entry.id === fluidDeviceId(kind, event.block.dimension.id, event.block.location));
				if (link?.activeTransferId) {
					event.cancel = true;
					event.player.sendMessage("Cannot remove a fluid device with an active transfer.");
				}
			}
		} catch (error) {
			console.warn(`[Create Bedrock] Could not validate fluid block removal: ${error}`);
		}
	});

	world.beforeEvents.playerInteractWithBlock.subscribe(event => {
		if (!event.isFirstEvent || event.block.typeId !== FLUID_TANK_BLOCK)
			return;
		try {
			const tankId = tankIdentifier(event.block);
			if (!state.hasTank(tankId))
				return;
			const inspection = state.inspectTank(tankId);
			const plan = planFluidBucketInteraction({
				capacity: inspection.capacity,
				contents: inspection.contents,
				item: event.itemStack && { amount: event.itemStack.amount, typeId: event.itemStack.typeId }
			});
			if (!plan)
				return;
			const slot = event.player.selectedSlotIndex;
			event.cancel = true;
			const dimensionId = event.block.dimension.id;
			const location = { ...event.block.location };
			system.run(() => {
				try {
					const result = interactWithTankBucket({ dimensionId, location, plan, player: event.player, slot });
					if (!result.ok && result.reason === "rollback_failed")
						console.warn(`[Create Bedrock] Fluid bucket rollback failed at ${dimensionId}:${location.x}:${location.y}:${location.z}`);
				} catch (error) {
					console.warn(`[Create Bedrock] Fluid bucket interaction failed: ${error}`);
				}
			});
		} catch (error) {
			console.warn(`[Create Bedrock] Could not plan fluid bucket interaction: ${error}`);
		}
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			if (event.block.typeId === FLUID_TANK_BLOCK && state.hasTank(tankIdentifier(event.block)))
				state.removeTank(tankIdentifier(event.block));
			else
				removeDevice(event.block);
		} catch (error) {
			console.warn(`[Create Bedrock] Fluid endpoint removal deferred: ${error}`);
		}
	});

	registerTickHandler(() => {
		syncPumpStates(getKineticWorld());
		return state.tick();
	}, FLUID_TASK_GROUP);
	system.run(() => {
		try {
			const restored = state.restore();
			if (restored.tanks > 0 || restored.links > 0 || restored.transfers > 0 || restored.frozen)
				console.warn(`[Create Bedrock] Restored ${restored.tanks} fluid tanks, ${restored.links} links, and ${restored.transfers} fluid transfers${restored.frozen ? " (frozen)" : ""}`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore fluid state: ${error}`);
		}
	});
}
