import { ItemStack, system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { BedrockEscrowRegistry } from "../logistics/bedrock-escrow-registry.js";
import { registerEscrowProtection } from "../logistics/external-escrow-runtime.js";
import { createBedrockWorldFluidEscrows } from "./bedrock-world-fluid-escrow.js";
import { CreativeFluidPort } from "./creative-fluid-port.js";
import { planFluidBucketInteraction, settleFluidBucketInteraction } from "./fluid-container.js";
import { fluidTankId, FluidNetworkState } from "./fluid-network-state.js";
import { configureFluidRun, FLUID_FACING_OFFSETS, fluidDeviceId, fluidDeviceLocation, offsetFluidLocation } from "./fluid-topology.js";
import { fluidFromVanillaSource, VanillaWorldFluidPort } from "./world-fluid-port.js";
import { steamEngineOutput } from "../kinetics/steam-engine.js";

const COPPER_VALVE_HANDLE_BLOCK = "createbedrock:copper_valve_handle";
const CREATIVE_FLUID_TANK_BLOCK = "createbedrock:creative_fluid_tank";
const ENCASED_FLUID_PIPE_BLOCK = "createbedrock:encased_fluid_pipe";
const FLUID_TASK_BUDGET = 8;
const FLUID_TASK_GROUP = "fluids";
const FLUID_TANK_BLOCK = "createbedrock:fluid_tank";
const FLUID_VALVE_BLOCK = "createbedrock:fluid_valve";
const GLASS_FLUID_PIPE_BLOCK = "createbedrock:glass_fluid_pipe";
const ITEM_DRAIN_BLOCK = "createbedrock:item_drain";
const MECHANICAL_PUMP_BLOCK = "createbedrock:mechanical_pump";
const PORTABLE_FLUID_INTERFACE_BLOCK = "createbedrock:portable_fluid_interface";
const POWERED_SHAFT_BLOCK = "createbedrock:powered_shaft";
const SMART_FLUID_PIPE_BLOCK = "createbedrock:smart_fluid_pipe";
const SPOUT_BLOCK = "createbedrock:spout";
const STEAM_ENGINE_BLOCK = "createbedrock:steam_engine";
const FLUID_PIPE_BLOCKS = new Set([
	"createbedrock:fluid_pipe",
	ENCASED_FLUID_PIPE_BLOCK,
	FLUID_VALVE_BLOCK,
	GLASS_FLUID_PIPE_BLOCK,
	SMART_FLUID_PIPE_BLOCK
]);
const FLUID_ENDPOINT_CAPACITIES = new Map([
	[FLUID_TANK_BLOCK, 8_000],
	[ITEM_DRAIN_BLOCK, 1_000],
	[PORTABLE_FLUID_INTERFACE_BLOCK, 1_000],
	[SPOUT_BLOCK, 1_000]
]);
const NEIGHBOR_OFFSETS = [
	{ x: 1, y: 0, z: 0 },
	{ x: -1, y: 0, z: 0 },
	{ x: 0, y: 1, z: 0 },
	{ x: 0, y: -1, z: 0 },
	{ x: 0, y: 0, z: 1 },
	{ x: 0, y: 0, z: -1 }
];
let kineticWorldProvider;
const creativePorts = new Map();
const redstoneLockedPumpIds = new Set();
const worldFluidEscrows = new BedrockEscrowRegistry();
const state = new FluidNetworkState({
	externalPortFactory({ descriptor, id }) {
		return createWorldFluidPort(descriptor, id);
	},
	onError(error) {
		console.warn(`[Create Bedrock] Fluid state error: ${error}`);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

registerEscrowProtection(() => state.activeExternalEscrowIds());

function blockKind(block) {
	if (FLUID_PIPE_BLOCKS.has(block?.typeId))
		return "pipe";
	if (block?.typeId === MECHANICAL_PUMP_BLOCK)
		return "pump";
	return undefined;
}

function fluidTankAt(dimension, location) {
	const block = dimension.getBlock(location);
	return FLUID_ENDPOINT_CAPACITIES.has(block?.typeId) ? fluidTankId(dimension.id, block.location) : undefined;
}

function fluidSectionPartition(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

function snapshotBlock(block) {
	if (!block)
		return undefined;
	return {
		...(block.isWaterlogged === undefined ? {} : { isWaterlogged: block.isWaterlogged }),
		states: block.permutation.getAllStates(),
		typeId: block.typeId
	};
}

function worldFluidPortId(dimensionId, location) {
	return `world-fluid:${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function creativeFluidPortId(dimensionId, location) {
	return `creative-fluid:${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function creativeFluidType(block) {
	const configured = block?.permutation?.getAllStates?.()["createbedrock:fluid_type"];
	return configured === "lava" ? "minecraft:lava" : "minecraft:water";
}

function creativeFluidDescriptor(dimensionId, location, fluidType) {
	return {
		dimensionId,
		fluidType,
		kind: "creative_fluid_tank",
		location: { x: location.x, y: location.y, z: location.z }
	};
}

function worldFluidDescriptor(dimensionId, kind, location) {
	return {
		dimensionId,
		kind,
		location: { x: location.x, y: location.y, z: location.z }
	};
}

function createWorldFluidPort(descriptor, id) {
	if (descriptor?.kind === "creative_fluid_tank") {
		if (typeof descriptor.dimensionId !== "string" || !descriptor.location || !Number.isInteger(descriptor.location.x) || !Number.isInteger(descriptor.location.y) || !Number.isInteger(descriptor.location.z))
			throw new TypeError("Invalid persisted creative-fluid endpoint descriptor");
		if (id !== creativeFluidPortId(descriptor.dimensionId, descriptor.location))
			throw new Error("Creative-fluid endpoint identifier does not match its descriptor");
		const existing = creativePorts.get(id);
		if (existing) {
			existing.setFluidType(descriptor.fluidType);
			return existing;
		}
		const port = new CreativeFluidPort({ fluidType: descriptor.fluidType, id });
		creativePorts.set(id, port);
		return port;
	}
	if ((descriptor?.kind !== "vanilla_world_source" && descriptor?.kind !== "vanilla_world_sink") || typeof descriptor.dimensionId !== "string" || !descriptor.location || !Number.isInteger(descriptor.location.x) || !Number.isInteger(descriptor.location.y) || !Number.isInteger(descriptor.location.z))
		throw new TypeError("Invalid persisted world-fluid endpoint descriptor");
	if (id !== worldFluidPortId(descriptor.dimensionId, descriptor.location))
		throw new Error("World-fluid endpoint identifier does not match its descriptor");
	const dimension = world.getDimension(descriptor.dimensionId);
	const location = { ...descriptor.location };
	return new VanillaWorldFluidPort({
		escrows: createBedrockWorldFluidEscrows({ anchor: location, dimension, registry: worldFluidEscrows }),
		id,
		readBlock() {
			return snapshotBlock(dimension.getBlock(location));
		},
		writeBlock(replacement) {
			const block = dimension.getBlock(location);
			if (!block)
				throw new Error("World-fluid source block is unavailable");
			block.setType(replacement.typeId);
		}
	});
}

function creativePortAt(dimension, location) {
	const block = dimension.getBlock(location);
	if (block?.typeId !== CREATIVE_FLUID_TANK_BLOCK)
		return undefined;
	const id = creativeFluidPortId(dimension.id, block.location);
	const descriptor = creativeFluidDescriptor(dimension.id, block.location, creativeFluidType(block));
	let port = creativePorts.get(id);
	if (!port) {
		port = new CreativeFluidPort({ fluidType: descriptor.fluidType, id });
		creativePorts.set(id, port);
	}
	port.setFluidType(descriptor.fluidType);
	try {
		state.registerExternalPort({
			descriptor,
			partition: fluidSectionPartition(dimension.id, block.location),
			port
		});
	} catch (error) {
		if (!String(error).includes("conflicting metadata"))
			throw error;
		state.updateExternalPortDescriptor(id, descriptor);
	}
	return id;
}

function worldSourceAt(dimension, location) {
	const block = dimension.getBlock(location);
	if (!fluidFromVanillaSource(snapshotBlock(block)))
		return undefined;
	const descriptor = worldFluidDescriptor(dimension.id, "vanilla_world_source", location);
	const id = worldFluidPortId(dimension.id, location);
	state.registerExternalPort({
		descriptor,
		partition: fluidSectionPartition(dimension.id, location),
		port: createWorldFluidPort(descriptor, id)
	});
	return id;
}

function worldSinkAt(dimension, location) {
	const block = dimension.getBlock(location);
	const snapshot = snapshotBlock(block);
	if (!snapshot || snapshot.typeId !== "minecraft:air" || snapshot.isWaterlogged)
		return undefined;
	const descriptor = worldFluidDescriptor(dimension.id, "vanilla_world_sink", location);
	const id = worldFluidPortId(dimension.id, location);
	state.registerExternalPort({
		descriptor,
		partition: fluidSectionPartition(dimension.id, location),
		port: createWorldFluidPort(descriptor, id)
	});
	return id;
}

function tankIdentifier(block) {
	return fluidTankId(block.dimension.id, block.location);
}

function endpointCapacity(block) {
	return FLUID_ENDPOINT_CAPACITIES.get(block?.typeId);
}

function isFluidEndpoint(block) {
	return endpointCapacity(block) !== undefined;
}

function createFluidEndpoint(block) {
	const capacity = endpointCapacity(block);
	if (capacity === undefined)
		return undefined;
	return state.createTank({ capacity, dimensionId: block.dimension.id, location: block.location });
}

function pumpRunning(block, kineticWorld) {
	return Math.abs(kineticWorld?.speedAt(block.dimension.id, block.location) ?? 0) > 0;
}

function topologyDeviceAt(dimension, location) {
	const block = dimension.getBlock(location);
	const kind = blockKind(block);
	if (!kind)
		return undefined;
	return {
		dimensionId: dimension.id,
		facing: block.permutation.getAllStates()["minecraft:facing_direction"],
		kind,
		location: { ...block.location }
	};
}

function pipeRunConfiguration(dimension, members) {
	let filter;
	let open = true;
	for (const member of members) {
		const device = fluidDeviceLocation("pipe", member);
		if (!device)
			continue;
		const block = dimension.getBlock(device.location);
		if (block?.typeId === FLUID_VALVE_BLOCK && block.permutation.getAllStates()["createbedrock:open"] !== 1)
			open = false;
		if (block?.typeId !== SMART_FLUID_PIPE_BLOCK)
			continue;
		const selected = block.permutation.getAllStates()["createbedrock:fluid_filter"];
		const next = selected === "water" ? "minecraft:water" : selected === "lava" ? "minecraft:lava" : undefined;
		if (!next)
			continue;
		if (filter && filter !== next)
			open = false;
		else
			filter = next;
	}
	return { filter, open };
}

function endpointAt(dimension, location) {
	return fluidTankAt(dimension, location) ?? creativePortAt(dimension, location);
}

function configureDevice(block, kineticWorld) {
	const kind = blockKind(block);
	if (!kind)
		return false;
	const result = configureFluidRun({
		createLink(options) {
			if (options.kind === "pipe") {
				const configuration = pipeRunConfiguration(block.dimension, options.members);
				state.createPipe({ ...options, ...configuration });
			}
			else
				state.createPump({
					...options,
					running: pumpRunning(block, kineticWorld) && !redstoneLockedPumpIds.has(fluidDeviceId("pump", block.dimension.id, block.location))
				});
		},
		destinationAt(location) {
			return endpointAt(block.dimension, location)
				?? (kind === "pump" ? worldSinkAt(block.dimension, location) : undefined);
		},
		device: topologyDeviceAt(block.dimension, block.location),
		deviceAt(location) {
			return topologyDeviceAt(block.dimension, location);
		},
		hasLink(id) {
			return state.hasLink(id);
		},
		sourceAt(location) {
			return endpointAt(block.dimension, location)
				?? (kind === "pump" ? worldSourceAt(block.dimension, location) : undefined);
		}
	});
	// A pump scan can discover a world endpoint before finding the opposite
	// endpoint. Do not leave that unlinked descriptor persisted.
	if (!result.ok)
		state.pruneExternalPorts();
	return result.ok && !result.reused;
}

function syncPipeConfiguration(block) {
	if (blockKind(block) !== "pipe")
		return false;
	let changed = false;
	for (const link of linksForDevice(block).filter(link => link.kind === "pipe")) {
		const configuration = pipeRunConfiguration(block.dimension, link.members ?? [fluidDeviceId("pipe", block.dimension.id, block.location)]);
		changed = state.setPipeOpen(link.id, configuration.open) || changed;
		changed = state.setPipeFilter(link.id, configuration.filter) || changed;
	}
	return changed;
}

function configureAdjacentDevices(anchor, kineticWorld) {
	let changed = false;
	for (const offset of NEIGHBOR_OFFSETS) {
		const neighbor = anchor.dimension.getBlock(offsetFluidLocation(anchor.location, offset));
		changed = configureDevice(neighbor, kineticWorld) || changed;
	}
	return changed;
}

function linksForDevice(block) {
	const kind = blockKind(block);
	if (!kind)
		return [];
	const id = fluidDeviceId(kind, block.dimension.id, block.location);
	return state.links().filter(link => link.id === id || link.members?.includes(id));
}

function removeDevice(block) {
	const links = linksForDevice(block);
	for (const link of links)
		state.removeLink(link.id);
	if (links.length > 0)
		state.pruneExternalPorts();
	return links.length > 0;
}

function interactWithTankBucket({ allowedDirection, dimensionId, location, plan, player, slot }) {
	if (player.selectedSlotIndex !== slot)
		return { ok: false, reason: "held_slot_changed" };
	const dimension = world.getDimension(dimensionId);
	const block = dimension.getBlock(location);
	if (!isFluidEndpoint(block))
		return { ok: false, reason: "tank_removed" };
	if (allowedDirection && plan.direction !== allowedDirection)
		return { ok: false, reason: "unsupported_direction" };
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

function setBlockState(block, property, value) {
	const states = block?.permutation?.getAllStates?.();
	if (!states || states[property] === undefined || states[property] === value)
		return false;
	block.setPermutation(block.permutation.withState(property, value));
	return true;
}

function fluidTypeForBucket(item) {
	if (item?.typeId === "minecraft:water_bucket")
		return "water";
	if (item?.typeId === "minecraft:lava_bucket")
		return "lava";
	return undefined;
}

function cycleSmartPipeFilter(block) {
	const current = block.permutation.getAllStates()["createbedrock:fluid_filter"];
	const next = current === "any" ? "water" : current === "water" ? "lava" : "any";
	return setBlockState(block, "createbedrock:fluid_filter", next);
}

function toggleValve(block) {
	const current = block.permutation.getAllStates()["createbedrock:open"];
	const changed = setBlockState(block, "createbedrock:open", current === 1 ? 0 : 1);
	if (changed)
		syncPipeConfiguration(block);
	return changed;
}

function toggleAdjacentValve(block) {
	for (const offset of NEIGHBOR_OFFSETS) {
		const valve = block.dimension.getBlock(offsetFluidLocation(block.location, offset));
		if (valve?.typeId === FLUID_VALVE_BLOCK)
			return toggleValve(valve);
	}
	return false;
}

function configureCreativeFluidType(block, type) {
	if (!setBlockState(block, "createbedrock:fluid_type", type))
		return false;
	creativePortAt(block.dimension, block.location);
	for (const neighbor of NEIGHBOR_OFFSETS)
		configureDevice(block.dimension.getBlock(offsetFluidLocation(block.location, neighbor)), kineticWorldProvider?.());
	return true;
}

function syncPumpStates(kineticWorld) {
	for (const pump of state.links().filter(link => link.kind === "pump")) {
		const pumpMember = pump.members?.find(member => member.startsWith("pump:"));
		const location = fluidDeviceLocation("pump", pumpMember ?? pump.id);
		if (!location)
			continue;
		try {
			const dimension = world.getDimension(location.dimensionId);
			const block = dimension.getBlock(location.location);
			if (block?.typeId === MECHANICAL_PUMP_BLOCK)
				state.setPumpRunning(pump.id, pumpRunning(block, kineticWorld) && !redstoneLockedPumpIds.has(pumpMember ?? pump.id));
		} catch (error) {
			console.warn(`[Create Bedrock] Could not synchronize pump ${pump.id}: ${error}`);
		}
	}
}

function steamDirection(block) {
	return FLUID_FACING_OFFSETS[block?.permutation?.getAllStates?.()["minecraft:facing_direction"]] ?? { x: 0, y: 1, z: 0 };
}

function findSteamEndpoint(block, direction, typeId) {
	const direct = block.dimension.getBlock(offsetFluidLocation(block.location, direction));
	if (direct?.typeId === typeId)
		return direct;
	for (const offset of NEIGHBOR_OFFSETS) {
		const candidate = block.dimension.getBlock(offsetFluidLocation(block.location, offset));
		if (candidate?.typeId === typeId)
			return candidate;
	}
	return undefined;
}

function adjacentPoweredShafts(block) {
	return NEIGHBOR_OFFSETS
		.map(offset => block.dimension.getBlock(offsetFluidLocation(block.location, offset)))
		.filter(candidate => candidate?.typeId === POWERED_SHAFT_BLOCK);
}

function syncSteamEngines(kineticWorld) {
	if (!kineticWorld || typeof kineticWorld.getNodesByType !== "function" || typeof kineticWorld.setExternalSource !== "function")
		return false;
	let changed = false;
	for (const node of kineticWorld.getNodesByType(STEAM_ENGINE_BLOCK)) {
		try {
			const dimension = world.getDimension(node.dimensionId);
			const engine = dimension.getBlock(node.location);
			if (engine?.typeId !== STEAM_ENGINE_BLOCK)
				continue;
			const direction = steamDirection(engine);
			const tank = findSteamEndpoint(engine, { x: -direction.x, y: -direction.y, z: -direction.z }, FLUID_TANK_BLOCK);
			const shaft = findSteamEndpoint(engine, direction, POWERED_SHAFT_BLOCK);
			for (const candidate of adjacentPoweredShafts(engine))
				if (candidate.location.x !== shaft?.location.x || candidate.location.y !== shaft?.location.y || candidate.location.z !== shaft?.location.z)
					changed = kineticWorld.setExternalSource(node.dimensionId, candidate.location, { capacity: 0, speed: 0 }) || changed;
			if (!shaft)
				continue;
			const inspection = tank && state.hasTank(tankIdentifier(tank)) ? state.inspectTank(tankIdentifier(tank)) : undefined;
			const output = steamEngineOutput(inspection?.contents);
			if (output.consume > 0 && tank)
				state.extract(tankIdentifier(tank), {
					maxAmount: output.consume,
					predicate: fluid => fluid.typeId === "minecraft:water"
				});
			changed = kineticWorld.setExternalSource(node.dimensionId, shaft.location, output) || changed;
		} catch (error) {
			console.warn(`[Create Bedrock] Could not synchronize steam engine at ${node.dimensionId}:${node.location.x}:${node.location.y}:${node.location.z}: ${error}`);
		}
	}
	return changed;
}

export function extractFluidTank(block, options) {
	return state.extract(tankIdentifier(block), options);
}

export function getFluidDiagnostics() {
	return { ...state.diagnostics(), redstoneLockedPumps: redstoneLockedPumpIds.size };
}

export function inspectFluidTank(block) {
	return state.inspectTank(tankIdentifier(block));
}

export function getFluidTankId(block) {
	return tankIdentifier(block);
}

export function insertFluidTank(block, fluid, options) {
	return state.insert(tankIdentifier(block), fluid, options);
}

export function setFluidPumpRedstonePowered(dimensionId, location, powered) {
	if (typeof dimensionId !== "string" || !location || typeof powered !== "boolean")
		throw new TypeError("Redstone pump updates require a dimension, location, and power state");
	const physicalId = fluidDeviceId("pump", dimensionId, location);
	if (powered)
		redstoneLockedPumpIds.add(physicalId);
	else
		redstoneLockedPumpIds.delete(physicalId);
	let changed = false;
	for (const pump of state.links().filter(link => link.kind === "pump" && (link.id === physicalId || link.members?.includes(physicalId)))) {
		const block = world.getDimension(dimensionId).getBlock(location);
		const kineticWorld = kineticWorldProvider?.();
		changed = state.setPumpRunning(pump.id, !powered && block?.typeId === MECHANICAL_PUMP_BLOCK && pumpRunning(block, kineticWorld)) || changed;
	}
	return changed;
}

export function registerFluids(getKineticWorld) {
	if (typeof getKineticWorld !== "function")
		throw new TypeError("Fluid runtime requires the kinetic-world provider");
	kineticWorldProvider = getKineticWorld;
	registerKernelTaskGroup(FLUID_TASK_GROUP, FLUID_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (isFluidEndpoint(event.block)) {
				createFluidEndpoint(event.block);
				configureAdjacentDevices(event.block, getKineticWorld());
				return;
			}
			if (event.block.typeId === CREATIVE_FLUID_TANK_BLOCK) {
				creativePortAt(event.block.dimension, event.block.location);
				configureAdjacentDevices(event.block, getKineticWorld());
				return;
			}
			configureDevice(event.block, getKineticWorld());
			configureAdjacentDevices(event.block, getKineticWorld());
		} catch (error) {
			console.warn(`[Create Bedrock] Could not configure fluid block: ${error}`);
		}
	});

	world.beforeEvents.playerBreakBlock.subscribe(event => {
		try {
			if (isFluidEndpoint(event.block) && !state.canRemoveTank(tankIdentifier(event.block))) {
				event.cancel = true;
				event.player.sendMessage("Cannot remove a fluid endpoint while it stores fluid or has an active connection.");
				return;
			}
			if (event.block.typeId === CREATIVE_FLUID_TANK_BLOCK && !state.canRemovePort(creativeFluidPortId(event.block.dimension.id, event.block.location))) {
				event.cancel = true;
				event.player.sendMessage("Cannot remove a creative fluid tank while it has an active connection.");
				return;
			}
			if (linksForDevice(event.block).some(link => link.activeTransferId)) {
				event.cancel = true;
				event.player.sendMessage("Cannot remove a fluid device with an active transfer.");
			}
		} catch (error) {
			console.warn(`[Create Bedrock] Could not validate fluid block removal: ${error}`);
		}
	});

	world.beforeEvents.playerInteractWithBlock.subscribe(event => {
		if (!event.isFirstEvent)
			return;
		try {
			const selectedFluid = fluidTypeForBucket(event.itemStack);
			if (event.block.typeId === CREATIVE_FLUID_TANK_BLOCK && selectedFluid) {
				event.cancel = true;
				const dimensionId = event.block.dimension.id;
				const location = { ...event.block.location };
				system.run(() => {
					const block = world.getDimension(dimensionId).getBlock(location);
					if (block?.typeId === CREATIVE_FLUID_TANK_BLOCK)
						configureCreativeFluidType(block, selectedFluid);
				});
				return;
			}
			if (event.block.typeId === SMART_FLUID_PIPE_BLOCK && (selectedFluid || !event.itemStack)) {
				event.cancel = true;
				const dimensionId = event.block.dimension.id;
				const location = { ...event.block.location };
				system.run(() => {
					const block = world.getDimension(dimensionId).getBlock(location);
					if (block?.typeId !== SMART_FLUID_PIPE_BLOCK)
						return;
					if (selectedFluid)
						setBlockState(block, "createbedrock:fluid_filter", selectedFluid);
					else
						cycleSmartPipeFilter(block);
					syncPipeConfiguration(block);
				});
				return;
			}
			if (event.block.typeId === FLUID_VALVE_BLOCK && !event.itemStack) {
				event.cancel = true;
				const dimensionId = event.block.dimension.id;
				const location = { ...event.block.location };
				system.run(() => {
					const block = world.getDimension(dimensionId).getBlock(location);
					if (block?.typeId === FLUID_VALVE_BLOCK)
						toggleValve(block);
				});
				return;
			}
			if (event.block.typeId === COPPER_VALVE_HANDLE_BLOCK && !event.itemStack) {
				event.cancel = true;
				const dimensionId = event.block.dimension.id;
				const location = { ...event.block.location };
				system.run(() => {
					const block = world.getDimension(dimensionId).getBlock(location);
					if (block?.typeId === COPPER_VALVE_HANDLE_BLOCK)
						toggleAdjacentValve(block);
				});
				return;
			}
			if (!isFluidEndpoint(event.block))
				return;
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
			const allowedDirection = event.block.typeId === ITEM_DRAIN_BLOCK ? "drain" : event.block.typeId === SPOUT_BLOCK ? "fill" : undefined;
			if (allowedDirection && plan.direction !== allowedDirection)
				return;
			const slot = event.player.selectedSlotIndex;
			event.cancel = true;
			const dimensionId = event.block.dimension.id;
			const location = { ...event.block.location };
			system.run(() => {
				try {
					const result = interactWithTankBucket({ allowedDirection, dimensionId, location, plan, player: event.player, slot });
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
			if (isFluidEndpoint(event.block) && state.hasTank(tankIdentifier(event.block)))
				state.removeTank(tankIdentifier(event.block));
			else if (event.block.typeId === CREATIVE_FLUID_TANK_BLOCK) {
				const id = creativeFluidPortId(event.block.dimension.id, event.block.location);
				state.unregisterExternalPort(id);
				creativePorts.delete(id);
				configureAdjacentDevices(event.block, getKineticWorld());
			}
			else {
				removeDevice(event.block);
				configureAdjacentDevices(event.block, getKineticWorld());
			}
		} catch (error) {
			console.warn(`[Create Bedrock] Fluid endpoint removal deferred: ${error}`);
		}
	});

	registerTickHandler(() => {
		const kineticWorld = getKineticWorld();
		syncPumpStates(kineticWorld);
		syncSteamEngines(kineticWorld);
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
