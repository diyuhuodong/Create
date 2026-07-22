import { ItemStack, system, world } from "@minecraft/server";

import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { BedrockEscrowRegistry } from "../logistics/bedrock-escrow-registry.js";
import { registerEscrowProtection } from "../logistics/external-escrow-runtime.js";
import { createBoilerController, evaluateBoilerController, observeBoilerWater } from "../kinetics/boiler-controller.js";
import { boilerSteamEngineOutput } from "../kinetics/steam-engine.js";
import { BURNER_HEAT_LEVEL } from "./heat-level.js";
import { createBedrockWorldFluidEscrows } from "./bedrock-world-fluid-escrow.js";
import { CreativeFluidPort } from "./creative-fluid-port.js";
import { planFluidBucketInteraction, settleFluidBucketInteraction } from "./fluid-container.js";
import { fluidFromContainer } from "./fluid-registry.js";
import { fluidTankId, FluidNetworkState } from "./fluid-network-state.js";
import { configureFluidRun, FLUID_FACING_OFFSETS, fluidDeviceId, fluidDeviceLocation, offsetFluidLocation } from "./fluid-topology.js";
import { fluidFromWorldSource, VanillaWorldFluidPort, worldSourceForFluid } from "./world-fluid-port.js";
import { fluidFillLevel, fluidVisualKind, tankSegmentForNeighbors } from "./fluid-tank-visuals.js";
import { blazeHeatAt } from "../materials/blaze-burner-runtime.js";

const COPPER_VALVE_HANDLE_BLOCK = "createbedrock:copper_valve_handle";
const BASIN_BLOCK = "createbedrock:basin";
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
const PASSIVE_BOILER_HEATERS = new Set([
	"createbedrock:lit_blaze_burner",
	"minecraft:fire",
	"minecraft:lava",
	"minecraft:magma_block",
	"minecraft:soul_fire",
	"minecraft:campfire",
	"minecraft:soul_campfire"
]);
const FLUID_PIPE_BLOCKS = new Set([
	"createbedrock:fluid_pipe",
	ENCASED_FLUID_PIPE_BLOCK,
	FLUID_VALVE_BLOCK,
	GLASS_FLUID_PIPE_BLOCK,
	SMART_FLUID_PIPE_BLOCK
]);
const FLUID_ENDPOINT_CAPACITIES = new Map([
	[FLUID_TANK_BLOCK, 8_000],
	[BASIN_BLOCK, 1_000],
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
let boilerTick = 0;
const boilerControllers = new Map();
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

const boilerStore = new ShardedStateStore({
	keyPrefix: "createbedrock:boiler_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Boiler state error: ${error}`);
	},
	partitionFor(record) {
		if (!record?.dimensionId || !record?.members?.[0])
			throw new TypeError("Boiler records require a dimension and Tank members");
		const location = record.members[0];
		return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
	},
	storage: createWorldDynamicPropertyStorage(world)
});
const boilerPersistence = new DeferredPersistence({
	name: "boiler",
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist Boiler state: ${error}`);
	},
	write() {
		boilerStore.request([...boilerControllers.values()].sort((left, right) => left.id.localeCompare(right.id)));
	}
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
	return {
		chocolate: "createbedrock:chocolate",
		honey: "createbedrock:honey",
		milk: "createbedrock:milk",
		lava: "minecraft:lava",
		tea: "createbedrock:tea",
		water: "minecraft:water"
	}[configured] ?? "minecraft:water";
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
	if ((descriptor?.kind !== "vanilla_world_source" && descriptor?.kind !== "vanilla_world_sink" && descriptor?.kind !== "world_source" && descriptor?.kind !== "world_sink") || typeof descriptor.dimensionId !== "string" || !descriptor.location || !Number.isInteger(descriptor.location.x) || !Number.isInteger(descriptor.location.y) || !Number.isInteger(descriptor.location.z))
		throw new TypeError("Invalid persisted world-fluid endpoint descriptor");
	if (id !== worldFluidPortId(descriptor.dimensionId, descriptor.location))
		throw new Error("World-fluid endpoint identifier does not match its descriptor");
	const dimension = world.getDimension(descriptor.dimensionId);
	const location = { ...descriptor.location };
	return new VanillaWorldFluidPort({
		blockForFluid: worldSourceForFluid,
		escrows: createBedrockWorldFluidEscrows({ anchor: location, dimension, registry: worldFluidEscrows }),
		fluidFromBlock: fluidFromWorldSource,
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
	if (!fluidFromWorldSource(snapshotBlock(block)))
		return undefined;
	const descriptor = worldFluidDescriptor(dimension.id, "world_source", location);
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
	const descriptor = worldFluidDescriptor(dimension.id, "world_sink", location);
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

function isNormalFluidTank(block) {
	return block?.typeId === FLUID_TANK_BLOCK;
}

function tankVisualSegment(block) {
	return tankSegmentForNeighbors({
		hasTankAbove: isNormalFluidTank(block.dimension.getBlock(offsetFluidLocation(block.location, { x: 0, y: 1, z: 0 }))),
		hasTankBelow: isNormalFluidTank(block.dimension.getBlock(offsetFluidLocation(block.location, { x: 0, y: -1, z: 0 })))
	});
}

function syncFluidTankVisual(block) {
	if (!isNormalFluidTank(block) || !state.hasTank(tankIdentifier(block)))
		return false;
	const inspection = state.inspectTank(tankIdentifier(block));
	const visual = {
		"createbedrock:fluid_kind": fluidVisualKind(inspection.contents),
		"createbedrock:fluid_level": fluidFillLevel(inspection),
		"createbedrock:tank_segment": tankVisualSegment(block)
	};
	let permutation = block.permutation;
	let changed = false;
	for (const [property, value] of Object.entries(visual)) {
		const states = permutation.getAllStates();
		if (states[property] === undefined || states[property] === value)
			continue;
		permutation = permutation.withState(property, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function syncFluidTankColumn(dimension, location) {
	let changed = false;
	for (const offset of [{ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }])
		changed = syncFluidTankVisual(dimension.getBlock(offsetFluidLocation(location, offset))) || changed;
	return changed;
}

function syncFluidTankVisuals() {
	let changed = false;
	for (const entry of state.tankEntries()) {
		const block = world.getDimension(entry.dimensionId).getBlock(entry.location);
		changed = syncFluidTankVisual(block) || changed;
	}
	return changed;
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
		const next = {
			chocolate: "createbedrock:chocolate",
			honey: "createbedrock:honey",
			lava: "minecraft:lava",
			milk: "createbedrock:milk",
			tea: "createbedrock:tea",
			water: "minecraft:water"
		}[selected];
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
	const result = settleFluidBucketInteraction({
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
	if (result.ok)
		syncFluidTankVisual(block);
	return result;
}

function setBlockState(block, property, value) {
	const states = block?.permutation?.getAllStates?.();
	if (!states || states[property] === undefined || states[property] === value)
		return false;
	block.setPermutation(block.permutation.withState(property, value));
	return true;
}

function fluidTypeForBucket(item) {
	const fluid = fluidFromContainer(item);
	return {
		"createbedrock:chocolate": "chocolate",
		"createbedrock:honey": "honey",
		"createbedrock:milk": "milk",
		"minecraft:lava": "lava",
		"minecraft:water": "water"
	}[fluid?.typeId];
}

function cycleSmartPipeFilter(block) {
	const current = block.permutation.getAllStates()["createbedrock:fluid_filter"];
	const filters = ["any", "water", "lava", "honey", "chocolate", "tea", "milk"];
	const next = filters[(filters.indexOf(current) + 1) % filters.length];
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

function boilerLocationId(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function compareLocations(left, right) {
	return left.x - right.x || left.y - right.y || left.z - right.z;
}

function collectBoilerMembers(tank) {
	const members = [];
	const pending = [{ ...tank.location }];
	const visited = new Set();
	while (pending.length > 0 && members.length < 512) {
		const location = pending.shift();
		const id = boilerLocationId(tank.dimension.id, location);
		if (visited.has(id))
			continue;
		visited.add(id);
		const block = tank.dimension.getBlock(location);
		if (block?.typeId !== FLUID_TANK_BLOCK || !state.hasTank(tankIdentifier(block)))
			continue;
		members.push({ ...block.location });
		for (const offset of NEIGHBOR_OFFSETS)
			pending.push(offsetFluidLocation(location, offset));
	}
	return members.sort(compareLocations);
}

function boilerHeat(dimension, members) {
	let activeHeat = 0;
	let passiveHeat = false;
	for (const member of members) {
		const heaterLocation = offsetFluidLocation(member, { x: 0, y: -1, z: 0 });
		const heat = blazeHeatAt(dimension.id, heaterLocation);
		if (heat >= BURNER_HEAT_LEVEL.FADING)
			activeHeat += heat === BURNER_HEAT_LEVEL.SEETHING ? 2 : 1;
		else if (PASSIVE_BOILER_HEATERS.has(dimension.getBlock(heaterLocation)?.typeId))
			passiveHeat = true;
	}
	return { activeHeat: Math.min(18, activeHeat), passiveHeat };
}

function inspectBoilerWater(dimension, members) {
	let amount = 0;
	for (const location of members) {
		const block = dimension.getBlock(location);
		if (!block || !state.hasTank(tankIdentifier(block)))
			continue;
		const contents = state.inspectTank(tankIdentifier(block)).contents;
		if (contents?.typeId === "minecraft:water")
			amount += contents.amount;
	}
	return amount;
}

function boilerWaterSnapshot(dimension, members) {
	return Object.fromEntries(members.map(location => {
		const block = dimension.getBlock(location);
		const tankId = fluidTankId(dimension.id, location);
		const contents = block && state.hasTank(tankId) ? state.inspectTank(tankId).contents : undefined;
		return [tankId, contents?.typeId === "minecraft:water" ? contents.amount : 0];
	}));
}

function extractBoilerWater(dimension, members, engineId) {
	for (const location of members) {
		const block = dimension.getBlock(location);
		if (!block || !state.hasTank(tankIdentifier(block)))
			continue;
		const tankId = tankIdentifier(block);
		const inspection = state.inspectTank(tankId);
		if (inspection.contents?.typeId !== "minecraft:water" || inspection.contents.amount < 50)
			continue;
		const extracted = state.extract(tankId, {
			maxAmount: 50,
			predicate: fluid => fluid.typeId === "minecraft:water",
			receiptId: `boiler:${engineId}:${tankId}:${inspection.revision}`
		});
		if (extracted?.amount === 50)
			return true;
	}
	return false;
}

function steamEngineDescriptor(node) {
	const dimension = world.getDimension(node.dimensionId);
	const engine = dimension.getBlock(node.location);
	if (engine?.typeId !== STEAM_ENGINE_BLOCK)
		return undefined;
	const direction = steamDirection(engine);
	const tank = findSteamEndpoint(engine, { x: -direction.x, y: -direction.y, z: -direction.z }, FLUID_TANK_BLOCK);
	const shaft = findSteamEndpoint(engine, direction, POWERED_SHAFT_BLOCK);
	return {
		dimension,
		engine,
		id: boilerLocationId(node.dimensionId, node.location),
		node,
		shaft,
		tank
	};
}

function zeroUnusedSteamShafts(kineticWorld, descriptor) {
	let changed = false;
	for (const candidate of adjacentPoweredShafts(descriptor.engine))
		if (candidate.location.x !== descriptor.shaft?.location.x || candidate.location.y !== descriptor.shaft?.location.y || candidate.location.z !== descriptor.shaft?.location.z)
			changed = kineticWorld.setExternalSource(descriptor.node.dimensionId, candidate.location, { capacity: 0, speed: 0 }) || changed;
	return changed;
}

function syncSteamEngines(kineticWorld) {
	if (!kineticWorld || typeof kineticWorld.getNodesByType !== "function" || typeof kineticWorld.setExternalSource !== "function")
		return false;
	boilerTick++;
	let changed = false;
	const groups = new Map();
	for (const node of kineticWorld.getNodesByType(STEAM_ENGINE_BLOCK)) {
		try {
			const descriptor = steamEngineDescriptor(node);
			if (!descriptor)
				continue;
			changed = zeroUnusedSteamShafts(kineticWorld, descriptor) || changed;
			if (!descriptor.tank || !descriptor.shaft) {
				if (descriptor.shaft)
					changed = kineticWorld.setExternalSource(node.dimensionId, descriptor.shaft.location, { capacity: 0, speed: 0 }) || changed;
				continue;
			}
			const members = collectBoilerMembers(descriptor.tank);
			if (members.length === 0)
				continue;
			const controllerId = boilerLocationId(node.dimensionId, members[0]);
			const group = groups.get(controllerId) ?? { dimension: descriptor.dimension, engines: [], id: controllerId, members };
			group.engines.push(descriptor);
			groups.set(controllerId, group);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not synchronize steam engine at ${node.dimensionId}:${node.location.x}:${node.location.y}:${node.location.z}: ${error}`);
		}
	}

	const activeControllers = new Set();
	let persistenceChanged = false;
	for (const group of groups.values()) {
		activeControllers.add(group.id);
		const previous = boilerControllers.get(group.id);
		persistenceChanged = true;
		const heat = boilerHeat(group.dimension, group.members);
		const memberWater = boilerWaterSnapshot(group.dimension, group.members);
		let controller = createBoilerController({
			...previous,
			...heat,
			dimensionId: group.dimension.id,
			engineIds: group.engines.map(engine => engine.id),
			id: group.id,
			members: group.members,
			waterSamples: previous?.waterSamples ?? []
		});
		// Java's BoilerFluidHandler gathers only admitted water. Positive Tank
		// deltas are the Bedrock equivalent; stored water from before a restart
		// is deliberately not mistaken for continuing supply.
		controller = observeBoilerWater(controller, memberWater);
		boilerControllers.set(group.id, controller);
		const evaluation = evaluateBoilerController(controller);
		let availableWater = inspectBoilerWater(group.dimension, group.members);
		for (const engine of group.engines.sort((left, right) => left.id.localeCompare(right.id))) {
			let output = boilerSteamEngineOutput({ amount: availableWater, typeId: "minecraft:water" }, controller);
			if (evaluation.engines[engine.id] <= 0 || output.consume > 0 && !extractBoilerWater(group.dimension, group.members, engine.id))
				output = { capacity: 0, consume: 0, speed: 0 };
			else
				availableWater -= output.consume;
			changed = kineticWorld.setExternalSource(engine.node.dimensionId, engine.shaft.location, output) || changed;
		}
	}
	for (const id of [...boilerControllers.keys()])
		if (!activeControllers.has(id)) {
			boilerControllers.delete(id);
			persistenceChanged = true;
		}
	if (persistenceChanged)
		boilerPersistence.request();
	return changed;
}

export function extractFluidTank(block, options) {
	const fluid = state.extract(tankIdentifier(block), options);
	if (fluid)
		syncFluidTankVisual(block);
	return fluid;
}

export function getFluidDiagnostics() {
	return {
		...state.diagnostics(),
		boilerPersistence: boilerPersistence.diagnostics(),
		boilers: boilerControllers.size,
		boilerStorage: boilerStore.diagnostics(),
		redstoneLockedPumps: redstoneLockedPumpIds.size
	};
}

export function getBoilerDisplayState(dimensionId, location) {
	if (typeof dimensionId !== "string" || !location)
		throw new TypeError("Boiler display lookups require a dimension and location");
	const controller = [...boilerControllers.values()].find(candidate => candidate.dimensionId === dimensionId
		&& candidate.members.some(member => member.x === location.x && member.y === location.y && member.z === location.z));
	if (!controller)
		return undefined;
	const evaluation = evaluateBoilerController(controller);
	return {
		activeHeat: controller.activeHeat,
		engineCount: controller.engineIds.length,
		heatLevel: evaluation.heatLevel,
		passiveHeat: controller.passiveHeat,
		tankBlocks: controller.members.length,
		waterSupply: Math.max(0, ...controller.waterSamples)
	};
}

export function getFluidDisplayState(dimensionId, location) {
	const id = fluidTankId(dimensionId, location);
	if (!state.hasTank(id))
		return undefined;
	const inspection = state.inspectTank(id);
	return {
		amount: inspection.contents?.amount ?? 0,
		capacity: inspection.capacity,
		typeId: inspection.contents?.typeId
	};
}

export function inspectFluidTank(block) {
	return state.inspectTank(tankIdentifier(block));
}

export function getFluidTankId(block) {
	return tankIdentifier(block);
}

export function fluidPortForBlock(block) {
	if (!isFluidEndpoint(block) || !state.hasTank(tankIdentifier(block)))
		return undefined;
	return state.tankPort(tankIdentifier(block));
}

export function insertFluidTank(block, fluid, options) {
	const result = state.insert(tankIdentifier(block), fluid, options);
	if (result.accepted)
		syncFluidTankVisual(block);
	return result;
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
				if (isNormalFluidTank(event.block))
					syncFluidTankColumn(event.block.dimension, event.block.location);
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
			if (event.block.typeId === FLUID_TANK_BLOCK)
				syncFluidTankColumn(event.dimension, event.block.location);
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
		const steamChanged = syncSteamEngines(kineticWorld);
		const ticked = state.tick();
		const boilerRequested = boilerPersistence.tick();
		const boilerStored = boilerStore.tick();
		const visualsChanged = steamChanged || ticked ? syncFluidTankVisuals() : false;
		return steamChanged || ticked || boilerRequested || boilerStored || visualsChanged;
	}, FLUID_TASK_GROUP);
	system.run(() => {
		try {
			const restored = state.restore();
			const restoredBoilers = boilerStore.read();
			boilerControllers.clear();
			for (const record of restoredBoilers?.records ?? []) {
				const controller = createBoilerController(record);
				if (typeof record.id !== "string" || record.id.length === 0 || typeof record.dimensionId !== "string")
					throw new TypeError("Persisted Boiler controllers require stable identifiers");
				boilerControllers.set(record.id, { ...controller, dimensionId: record.dimensionId, id: record.id });
			}
			syncFluidTankVisuals();
			if (restored.tanks > 0 || restored.links > 0 || restored.transfers > 0 || restored.frozen)
				console.warn(`[Create Bedrock] Restored ${restored.tanks} fluid tanks, ${restored.links} links, and ${restored.transfers} fluid transfers${restored.frozen ? " (frozen)" : ""}`);
			if (boilerControllers.size > 0)
				console.warn(`[Create Bedrock] Restored ${boilerControllers.size} Boiler controllers`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore fluid state: ${error}`);
		}
	});
}
