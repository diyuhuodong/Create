import { ItemStack, system, world } from "@minecraft/server";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { deserializeVersionedState } from "../kernel/versioned-state.js";
import { CRUSHING_RECIPES } from "./generated/crushing-recipes.js";
import { crushingBeltEndpoints, selectCrushingEntityInput } from "./crushing-wheel-belt-interface.js";
import { CrushingWheelMachine } from "./crushing-wheel-machine.js";
import { resolveCrushingWheelControllerPair } from "./crushing-wheel-controller.js";
import { supportedProcessingRecipes } from "./processing-item-support.js";
import { registerMovingBlockDataAdapter } from "../contraptions/moving-block-data.js";
import { createShardedMachineState } from "./sharded-machine-state.js";
import { canRemoveManagedLogisticsPort, registerManagedLogisticsPort, removeManagedLogisticsPort } from "../logistics/depot-runtime.js";

const CRUSHING_WHEEL_BLOCK = "createbedrock:crushing_wheel";
const CRUSHING_WHEEL_CONTROLLER_BLOCK = "createbedrock:crushing_wheel_controller";
const BELT_BLOCK = "createbedrock:belt";
const LEGACY_PERSISTENCE_KEY = "createbedrock:crushing_wheels_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const CRUSHING_WHEEL_TASK_GROUP = "crushing_wheels";
const CRUSHING_WHEEL_TASK_BUDGET = 4;
const ACTIVE_CRUSHING_RECIPES = supportedProcessingRecipes(CRUSHING_RECIPES);
const HORIZONTAL_FACING = new Set(["north", "south", "east", "west", 2, 3, 4, 5]);
const wheels = new Map();
const controllers = new Map();
const shardedState = createShardedMachineState({
	keyPrefix: "createbedrock:crushing_wheel_state_v2",
	legacyKey: LEGACY_PERSISTENCE_KEY,
	name: "crushing wheel",
	world
});

function snapshot() {
	return [
		...[...wheels.values()].map(wheel => ({
			dimensionId: wheel.dimensionId,
			kind: "wheel",
			location: wheel.location,
			processor: wheel.machine.snapshot()
		})),
		...[...controllers.values()].map(controller => ({
			dimensionId: controller.dimensionId,
			kind: "controller",
			location: controller.location,
			processor: controller.machine.snapshot()
		}))
	].sort((left, right) => keyFor(left.dimensionId, left.location).localeCompare(keyFor(right.dimensionId, right.location)));
}

const persistence = new DeferredPersistence({
	name: "crushing_wheels",
	write() {
		shardedState.request(snapshot());
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist crushing wheel state: ${error}`);
	}
});

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function createCrushingWheelMachine(dimensionId, location) {
	return new CrushingWheelMachine(ACTIVE_CRUSHING_RECIPES, { id: `crushing-wheel:${keyFor(dimensionId, location)}` });
}

function controllerPortId(controller, role) {
	return `crushing-wheel-controller:${keyFor(controller.dimensionId, controller.location)}:${role}`;
}

function controllerPortBindings(controller) {
	return [
		{ id: controllerPortId(controller, "input"), port: controller.machine.inputPort, role: "input" },
		{ id: controllerPortId(controller, "output"), port: controller.machine.outputPort, role: "output" }
	];
}

function attachControllerPorts(controller) {
	for (const binding of controllerPortBindings(controller)) {
		registerManagedLogisticsPort({
			dimensionId: controller.dimensionId,
			id: binding.id,
			location: controller.location,
			onPortMutation: persist,
			port: binding.port,
			role: binding.role
		});
	}
}

function controllerPortsRemovable(controller) {
	return controllerPortBindings(controller).every(binding => canRemoveManagedLogisticsPort(binding.id));
}

function removeControllerPorts(controller) {
	for (const binding of controllerPortBindings(controller)) {
		removeManagedLogisticsPort({
			dimensionId: controller.dimensionId,
			id: binding.id,
			location: controller.location,
			role: binding.role
		});
	}
}

function persist() {
	persistence.request();
}

function ensureWheel(block) {
	const key = keyFor(block.dimension.id, block.location);
	let wheel = wheels.get(key);
	if (!wheel) {
		wheel = {
			dimensionId: block.dimension.id,
			location: { ...block.location },
			machine: createCrushingWheelMachine(block.dimension.id, block.location)
		};
		wheels.set(key, wheel);
	}
	return wheel;
}

function ensureController(block) {
	const key = keyFor(block.dimension.id, block.location);
	let controller = controllers.get(key);
	if (!controller) {
		controller = {
			dimensionId: block.dimension.id,
			location: { ...block.location },
			machine: createCrushingWheelMachine(block.dimension.id, block.location)
		};
		controllers.set(key, controller);
	}
	attachControllerPorts(controller);
	return controller;
}

function captureWheel(dimensionId, location) {
	return wheels.get(keyFor(dimensionId, location))?.machine.snapshot();
}

function detachWheel(dimensionId, location) {
	const key = keyFor(dimensionId, location);
	const state = captureWheel(dimensionId, location);
	wheels.delete(key);
	persist();
	return state;
}

function captureController(dimensionId, location) {
	return controllers.get(keyFor(dimensionId, location))?.machine.snapshot();
}

function detachController(dimensionId, location) {
	const key = keyFor(dimensionId, location);
	const controller = controllers.get(key);
	const state = controller?.machine.snapshot();
	if (controller)
		removeControllerPorts(controller);
	controllers.delete(key);
	persist();
	return state;
}

function restoreWheel(dimensionId, location, state) {
	const machine = createCrushingWheelMachine(dimensionId, location);
	machine.restore(state);
	wheels.set(keyFor(dimensionId, location), {
		dimensionId,
		location: { ...location },
		machine
	});
	persist();
}

function restoreController(dimensionId, location, state) {
	const machine = createCrushingWheelMachine(dimensionId, location);
	machine.restore(state);
	const controller = {
		dimensionId,
		location: { ...location },
		machine
	};
	controllers.set(keyFor(dimensionId, location), controller);
	attachControllerPorts(controller);
	persist();
}

function restore() {
	try {
		const restored = shardedState.read();
		if (restored) {
			restoreRecords(restored.records);
			for (const warning of restored.warnings)
				console.warn(`[Create Bedrock] Ignored invalid crushing wheel shard ${warning.partition}: ${warning.error}`);
			console.warn("[Create Bedrock] Restored sharded crushing wheel state");
			return;
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore sharded crushing wheel state: ${error}`);
	}

	const serialized = world.getDynamicProperty(LEGACY_PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;
	try {
		const records = deserializeVersionedState(serialized, {
			schemaVersion: PERSISTENCE_SCHEMA_VERSION,
			upgrades: { 0: legacy => legacy }
		});
		restoreRecords(records);
		shardedState.markLegacyForMigration();
		persist();
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid crushing wheel state: ${error}`);
	}
}

function restoreRecords(records) {
	if (!Array.isArray(records))
		throw new TypeError("Crushing wheel records must be an array");
	for (const entry of records) {
		try {
			if (!entry?.dimensionId || !entry?.location)
				throw new TypeError("missing record location");
			const machine = createCrushingWheelMachine(entry.dimensionId, entry.location);
			machine.restore(entry.processor);
			const collection = entry.kind === "controller" ? controllers : wheels;
			const restored = {
				dimensionId: entry.dimensionId,
				location: entry.location,
				machine
			};
			collection.set(keyFor(entry.dimensionId, entry.location), restored);
			if (entry.kind === "controller")
				attachControllerPorts(restored);
		} catch (error) {
			console.warn(`[Create Bedrock] Ignored invalid crushing wheel ${entry?.dimensionId ?? "unknown"}: ${error}`);
		}
	}
}

function tryInsertFromPlayer(player, wheel) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size)
		return false;
	const stack = inventory.getItem(slot);
	if (!stack)
		return false;
	const inserted = wheel.machine.insertInput({ typeId: stack.typeId, count: stack.amount });
	if (!inserted.accepted)
		return false;
	if (stack.amount === inserted.accepted.count)
		inventory.setItem(slot);
	else {
		const remaining = stack.clone();
		remaining.amount -= inserted.accepted.count;
		inventory.setItem(slot, remaining);
	}
	return true;
}

function tryExtractToPlayer(player, wheel) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size || inventory.getItem(slot) !== undefined)
		return false;
	const output = wheel.machine.peekOutput();
	const input = output ? undefined : wheel.machine.peekInput();
	const next = output ?? input;
	if (!next)
		return false;
	let physical;
	try {
		physical = new ItemStack(next.typeId, next.count);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not recreate crushing wheel inventory item: ${error}`);
		return false;
	}
	const extracted = output ? wheel.machine.extractOutput() : wheel.machine.extractInput();
	if (!extracted || extracted.typeId !== next.typeId || extracted.count !== next.count)
		throw new Error("Crushing wheel inventory changed while extracting an item");
	inventory.setItem(slot, physical);
	return true;
}

function processWheel(key, getKineticWorld) {
	const wheel = wheels.get(key);
	if (!wheel)
		return;
	const update = wheel.machine.tick(getKineticWorld().speedAt(wheel.dimensionId, wheel.location));
	if (update)
		persist();
}

function controllerBelts(controller) {
	let dimension;
	try {
		dimension = world.getDimension(controller.dimensionId);
	} catch {
		return { inputs: [], outputs: [] };
	}
	const offsets = [
		{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
		{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }
	];
	const belts = [];
	for (const offset of offsets) {
		const location = {
			x: controller.location.x + offset.x,
			y: controller.location.y + offset.y,
			z: controller.location.z + offset.z
		};
		try {
			const block = dimension.getBlock(location);
			const facing = block?.permutation?.getAllStates?.()["minecraft:facing_direction"];
			if (block?.typeId === BELT_BLOCK && HORIZONTAL_FACING.has(facing))
				belts.push({ facing, location });
		} catch {
			// A temporarily unavailable chunk has no usable belt endpoint this tick.
		}
	}
	return crushingBeltEndpoints({ belts, controller: controller.location });
}

function entityItem(entity) {
	try {
		const item = entity?.getComponent?.("minecraft:item")?.itemStack;
		if (!item || typeof item.typeId !== "string" || !Number.isInteger(item.amount) || item.amount < 1)
			return undefined;
		return { count: item.amount, typeId: item.typeId };
	} catch {
		return undefined;
	}
}

function intakeControllerEntity(controller, pair, endpoints) {
	if (!pair.active)
		return false;
	let entities;
	try {
		entities = world.getDimension(controller.dimensionId).getEntities({
			location: { x: controller.location.x + 0.5, y: controller.location.y + 0.5, z: controller.location.z + 0.5 },
			maxDistance: 2,
			type: "minecraft:item"
		});
	} catch {
		return false;
	}
	const candidates = entities.map(entity => ({
		entity,
		id: entity.id,
		item: entityItem(entity),
		location: entity.location
	}));
	const selected = selectCrushingEntityInput({
		controller: controller.location,
		endpoints,
		entities: candidates,
		pairActive: pair.active
	});
	if (!selected)
		return false;
	const preview = controller.machine.previewInput(selected.item);
	if (!preview.accepted || preview.accepted.count !== selected.item.count)
		return false;
	try {
		selected.entity.remove();
	} catch {
		return false;
	}
	const inserted = controller.machine.insertInput(selected.item);
	if (inserted.accepted?.count === selected.item.count)
		return true;
	try {
		world.getDimension(controller.dimensionId).spawnItem(new ItemStack(selected.item.typeId, selected.item.count), selected.location);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore an unaccepted crushing input entity: ${error}`);
	}
	return false;
}

/**
 * Resolve the kinetic validity of a controller from tracked wheel nodes. This
 * is shared with the Redstone output device so processing and emitted state
 * always use the same two-wheel rule.
 */
export function getCrushingWheelControllerState(dimensionId, location, kineticWorld) {
	if (typeof dimensionId !== "string" || !location || !kineticWorld || typeof kineticWorld.getNodesByType !== "function")
		throw new TypeError("Crushing-wheel controller state requires a dimension, location, and kinetic world");
	const wheelsInDimension = kineticWorld.getNodesByType(CRUSHING_WHEEL_BLOCK)
		.filter(wheel => wheel.dimensionId === dimensionId)
		.map(wheel => ({ ...wheel, speed: kineticWorld.speedAt(dimensionId, wheel.location) }));
	return resolveCrushingWheelControllerPair({ controller: location, wheels: wheelsInDimension });
}

function processController(key, getKineticWorld) {
	const controller = controllers.get(key);
	if (!controller)
		return;
	const pair = getCrushingWheelControllerState(controller.dimensionId, controller.location, getKineticWorld());
	const endpoints = controllerBelts(controller);
	const acceptedEntity = intakeControllerEntity(controller, pair, endpoints);
	const update = controller.machine.tick(pair.speed);
	// Output remains in the machine-owned managed port. DepotNetwork advances it
	// over a configured physical belt with its ordinary persisted transport
	// record, rather than turning it into an untracked item entity.
	if (acceptedEntity || update)
		persist();
}

export function registerCrushingWheels(getKineticWorld) {
	registerKernelTaskGroup(CRUSHING_WHEEL_TASK_GROUP, CRUSHING_WHEEL_TASK_BUDGET);
	registerMovingBlockDataAdapter(CRUSHING_WHEEL_BLOCK, {
		capture: captureWheel,
		detach: detachWheel,
		restore: restoreWheel,
		schemaVersion: 1,
		validate(state) {
			if (!state || typeof state !== "object" || Array.isArray(state))
				throw new TypeError("Crushing Wheel moving data must be a machine snapshot");
		}
	});
	registerMovingBlockDataAdapter(CRUSHING_WHEEL_CONTROLLER_BLOCK, {
		capture: captureController,
		detach: detachController,
		restore: restoreController,
		schemaVersion: 1,
		validate(state) {
			if (!state || typeof state !== "object" || Array.isArray(state))
				throw new TypeError("Crushing Wheel Controller moving data must be a machine snapshot");
		}
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block.typeId === CRUSHING_WHEEL_BLOCK) {
			ensureWheel(event.block);
			persist();
		}
		if (event.block.typeId === CRUSHING_WHEEL_CONTROLLER_BLOCK) {
			ensureController(event.block);
			persist();
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		const key = keyFor(event.dimension.id, event.block.location);
		let changed = wheels.delete(key);
		const controller = controllers.get(key);
		if (controller) {
			try {
				removeControllerPorts(controller);
				controllers.delete(key);
				changed = true;
			} catch (error) {
				console.warn(`[Create Bedrock] Crushing controller endpoint removal deferred: ${error}`);
			}
		}
		if (changed)
			persist();
	});
	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (![CRUSHING_WHEEL_BLOCK, CRUSHING_WHEEL_CONTROLLER_BLOCK].includes(event.block.typeId))
			return;
		const machine = (event.block.typeId === CRUSHING_WHEEL_BLOCK ? wheels : controllers)
			.get(keyFor(event.block.dimension.id, event.block.location));
		if (machine?.machine.hasContents()) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a crushing wheel or controller while it stores or processes items.");
			return;
		}
		if (event.block.typeId === CRUSHING_WHEEL_CONTROLLER_BLOCK && machine && !controllerPortsRemovable(machine)) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a crushing controller while a belt route or item transport is attached.");
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (![CRUSHING_WHEEL_BLOCK, CRUSHING_WHEEL_CONTROLLER_BLOCK].includes(event.block.typeId))
			return;
		const wheel = event.block.typeId === CRUSHING_WHEEL_BLOCK ? ensureWheel(event.block) : ensureController(event.block);
		const changed = event.itemStack
			? tryInsertFromPlayer(event.player, wheel)
			: tryExtractToPlayer(event.player, wheel);
		if (changed)
			persist();
	});
	registerTickHandler(() => {
		for (const key of wheels.keys())
			enqueueUniqueKernelTask(`crushing_wheel:${key}`, () => processWheel(key, getKineticWorld), CRUSHING_WHEEL_TASK_GROUP);
		for (const key of controllers.keys())
			enqueueUniqueKernelTask(`crushing_wheel_controller:${key}`, () => processController(key, getKineticWorld), CRUSHING_WHEEL_TASK_GROUP);
		persistence.tick();
		shardedState.tick();
	});
	system.run(restore);
}
