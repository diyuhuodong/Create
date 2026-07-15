import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { getKineticWorldForTesting, setKineticGeneratedSpeed } from "../kinetics/kinetic-runtime.js";
import { countDepotItem, hasDepotAt, requestDepotItem } from "../logistics/depot-runtime.js";
import { getCrushingWheelControllerState } from "../processing/crushing-wheel-runtime.js";
import { linkedControllerChannelForSlot, normalizeLinkedControllerBindings, setLinkedControllerChannel } from "./linked-controller-bindings.js";
import { registerNativeRedstoneEventHandler } from "./redstone-native-events.js";
import { REDSTONE_BLOCK_DEVICES, redstoneDeviceForBlock } from "./redstone-device-catalog.js";
import { REDSTONE_LINK_RANGE, normalizeRedstoneLinkFrequency, receivedRedstoneLinkPower, redstoneLinkFrequencyKey } from "./redstone-link-network.js";
import { MAX_CONFIGURED_TICKS, createRedstoneDeviceState, nativeOutputPower, transitionRedstoneDevice, validateRedstoneDeviceState } from "./redstone-device-state.js";

const DEVICE_TASK_BUDGET = 8;
const DEVICE_TASK_GROUP = "redstone_devices";
const LINKED_CONTROLLER_ITEM = "createbedrock:linked_controller";
const OUTPUT_STATE = "createbedrock:powered";
const ANALOG_OUTPUT_STATE = "createbedrock:signal";
const DISPLAY_STATE = "createbedrock:display_signal";
const NEIGHBOR_OFFSETS = [
	{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
	{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 },
	{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }
];
const FACING_OFFSETS = {
	0: { x: 0, y: -1, z: 0 },
	1: { x: 0, y: 1, z: 0 },
	2: { x: 0, y: 0, z: -1 },
	3: { x: 0, y: 0, z: 1 },
	4: { x: -1, y: 0, z: 0 },
	5: { x: 1, y: 0, z: 0 },
	down: { x: 0, y: -1, z: 0 },
	up: { x: 0, y: 1, z: 0 },
	north: { x: 0, y: 0, z: -1 },
	south: { x: 0, y: 0, z: 1 },
	west: { x: -1, y: 0, z: 0 },
	east: { x: 1, y: 0, z: 0 }
};
const devices = new Map();
const controllerBindings = new Map();
const controllerSignals = new Map();
let roundRobinAfter;
let deviceTick = 0;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Redstone devices require integer block locations");
	return { x: location.x, y: location.y, z: location.z };
}

function deviceId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Redstone devices require a dimension identifier");
	const normalized = assertLocation(location);
	return `redstone-device:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	const { location } = record;
	return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:redstone_device_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Redstone device state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind === "device")
			return partitionFor(record);
		if (record?.kind === "controller_binding" && typeof record.playerId === "string")
			return `controller:${record.playerId}`;
		throw new TypeError("Unknown redstone device persistent record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function records() {
	return [...devices.values()]
		.map(record => ({
			kind: "device",
			id: record.id,
			dimensionId: record.dimensionId,
			location: record.location,
			state: record.state
		}))
		.concat([...controllerBindings.entries()].map(([playerId, frequencies]) => ({
			frequencies,
			kind: "controller_binding",
			playerId
		})))
		.sort((left, right) => (left.id ?? left.playerId).localeCompare(right.id ?? right.playerId));
}

function persist() {
	try {
		store.request(records());
	} catch (error) {
		console.warn(`[Create Bedrock] Could not persist redstone devices: ${error}`);
	}
}

function recordForBlock(block) {
	const definition = redstoneDeviceForBlock(block?.typeId);
	if (!definition)
		return undefined;
	const location = assertLocation(block.location);
	return {
		definition,
		dimensionId: block.dimension.id,
		id: deviceId(block.dimension.id, location),
		location
	};
}

function resolveBlock(record) {
	try {
		return world.getDimension(record.dimensionId).getBlock(record.location);
	} catch {
		return undefined;
	}
}

function setBlockState(block, property, value) {
	if (!block?.permutation?.getAllStates || typeof block.setPermutation !== "function")
		return false;
	try {
		const states = block.permutation.getAllStates();
		if (states[property] === undefined || states[property] === value)
			return false;
		block.setPermutation(block.permutation.withState(property, value));
		return true;
	} catch {
		return false;
	}
}

function applyStateToBlock(record, block = resolveBlock(record)) {
	if (!block || block.typeId !== record.definition.blockId)
		return false;
	if (record.definition.output) {
		const analogOutput = record.definition.id === "analog_lever" || record.definition.id === "redstone_link";
		const property = analogOutput ? ANALOG_OUTPUT_STATE : OUTPUT_STATE;
		const value = analogOutput ? nativeOutputPower(record.state) : nativeOutputPower(record.state) > 0 ? 1 : 0;
		return setBlockState(block, property, value);
	}
	if (record.definition.id === "display_link" || record.definition.id === "nixie_tube")
		return setBlockState(block, DISPLAY_STATE, Number(record.state.displayValue) || 0);
	return false;
}

function applyRotationSpeedController(record) {
	if (record.definition.id !== "rotation_speed_controller")
		return false;
	try {
		return setKineticGeneratedSpeed(record.dimensionId, record.location, record.state.active ? record.state.targetSpeed : 0);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not apply Rotation Speed Controller at ${record.id}: ${error}`);
	}
	return false;
}

function adjacentDepotLocations(record) {
	return NEIGHBOR_OFFSETS.map(offset => ({
		x: record.location.x + offset.x,
		y: record.location.y + offset.y,
		z: record.location.z + offset.z
	})).filter(location => hasDepotAt(record.dimensionId, location));
}

function executeRedstoneRequest(record) {
	if (record.definition.id !== "redstone_requester" || record.state.filterItem === "minecraft:air")
		return false;
	const nonce = record.state.requestNonce + 1;
	let result = { ok: false, reason: "no_adjacent_depot" };
	for (const destinationLocation of adjacentDepotLocations(record)) {
		try {
			result = requestDepotItem({
				allowPartial: record.state.allowPartialRequests,
				destinationLocation,
				dimensionId: record.dimensionId,
				id: `${record.id}:request:${nonce}`,
				itemType: record.state.filterItem,
				maxCount: record.state.requestAmount
			});
			if (result.ok)
				break;
		} catch (error) {
			console.warn(`[Create Bedrock] Redstone requester at ${record.id} could not create a depot request: ${error}`);
		}
	}
	return updateRecord(record, { type: "request_result", nonce, success: result.ok });
}

function refreshStockLink(record) {
	if (record.definition.id !== "stock_link" || record.state.filterItem === "minecraft:air")
		return false;
	const available = adjacentDepotLocations(record)
		.reduce((count, location) => count + countDepotItem({ dimensionId: record.dimensionId, itemType: record.state.filterItem, location }), 0);
	return updateRecord(record, { type: "set_stock_available", active: available >= record.state.minimumStock }, { persistState: false });
}

function sameOffset(left, right) {
	return left && right && left.x === right.x && left.y === right.y && left.z === right.z;
}

/** Match the opposing contact face every tick, including a contact restored after a chunk reload. */
function refreshRedstoneContact(record) {
	if (record.definition.id !== "redstone_contact")
		return false;
	try {
		const block = resolveBlock(record);
		const facing = FACING_OFFSETS[block?.permutation?.getAllStates?.()["minecraft:facing_direction"]];
		if (!facing)
			return false;
		const adjacent = world.getDimension(record.dimensionId).getBlock({
			x: record.location.x + facing.x,
			y: record.location.y + facing.y,
			z: record.location.z + facing.z
		});
		const opposite = adjacent && FACING_OFFSETS[adjacent.permutation?.getAllStates?.()["minecraft:facing_direction"]];
		return updateRecord(record, {
			type: "set_contact",
			active: adjacent?.typeId === "createbedrock:redstone_contact" && sameOffset(opposite, { x: -facing.x, y: -facing.y, z: -facing.z })
		}, { persistState: false });
	} catch {
		return false;
	}
}

function refreshCrushingWheelController(record) {
	if (record.definition.id !== "crushing_wheel_controller")
		return false;
	try {
		const state = getCrushingWheelControllerState(record.dimensionId, record.location, getKineticWorldForTesting());
		return updateRecord(record, { type: "set_active", active: state.active }, { persistState: false });
	} catch {
		return false;
	}
}

function ensureDevice(block) {
	const descriptor = recordForBlock(block);
	if (!descriptor)
		return undefined;
	let record = devices.get(descriptor.id);
	if (record && record.definition.id === descriptor.definition.id)
		return record;
	record = {
		...descriptor,
		state: createRedstoneDeviceState(descriptor.definition.id)
	};
	devices.set(record.id, record);
	applyStateToBlock(record, block);
	persist();
	return record;
}

function updateRecord(record, action, { persistState = true } = {}) {
	const previous = JSON.stringify(record.state);
	const previousState = record.state;
	const next = transitionRedstoneDevice(record.state, action);
	if (JSON.stringify(next) === previous)
		return false;
	record.state = next;
	applyStateToBlock(record);
	applyRotationSpeedController(record);
	if (record.definition.id === "redstone_link") {
		refreshRedstoneLinkNetwork(record.dimensionId, previousState.frequency);
		refreshRedstoneLinkNetwork(record.dimensionId, record.state.frequency);
	}
	if (record.definition.id === "redstone_requester" && action.type === "input" && record.state.active && !previousState.active)
		executeRedstoneRequest(record);
	if (persistState)
		persist();
	return true;
}

function handleNativeDeviceInput({ block, powerLevel }) {
	const record = ensureDevice(block);
	if (!record || !record.definition.input)
		return false;
	updateRecord(record, { type: "input", power: powerLevel });
	return true;
}

function bindLinkedController(player, frequency) {
	if (!player?.id)
		return false;
	const channel = linkedControllerChannelForSlot(player.selectedSlotIndex);
	const bindings = setLinkedControllerChannel(controllerBindings.get(player.id), channel, frequency);
	if (JSON.stringify(controllerBindings.get(player.id)) === JSON.stringify(bindings))
		return false;
	controllerBindings.set(player.id, bindings);
	persist();
	player.sendMessage?.(`Linked Controller channel ${channel + 1} bound to ${bindings[channel][0]} + ${bindings[channel][1]}.`);
	return true;
}

function activateLinkedController(source) {
	if (!source?.id || !source.dimension?.id || !source.location)
		return false;
	const channel = linkedControllerChannelForSlot(source.selectedSlotIndex);
	const frequency = normalizeLinkedControllerBindings(controllerBindings.get(source.id))[channel];
	const previous = controllerSignals.get(source.id);
	controllerSignals.set(source.id, {
		dimensionId: source.dimension.id,
		expiresAt: deviceTick + 30,
		frequency,
		location: { ...source.location }
	});
	if (previous)
		refreshRedstoneLinkNetwork(previous.dimensionId, previous.frequency);
	refreshRedstoneLinkNetwork(source.dimension.id, frequency);
	return true;
}

/**
 * Resolve one dimension-local frequency without scanning blocks. Only devices
 * explicitly registered on placement or restored from state participate.
 */
function refreshRedstoneLinkNetwork(dimensionId, frequency) {
	const key = redstoneLinkFrequencyKey(frequency);
	const transmitters = [...devices.values()]
		.filter(record => record.dimensionId === dimensionId && record.definition.id === "redstone_link"
			&& record.state.mode === "transmitter" && redstoneLinkFrequencyKey(record.state.frequency) === key)
		.map(record => ({ key, location: record.location, power: nativeOutputPower(record.state) }))
		.concat([...controllerSignals.values()]
			.filter(signal => signal.dimensionId === dimensionId && signal.expiresAt > deviceTick
				&& redstoneLinkFrequencyKey(signal.frequency) === key)
			.map(signal => ({ key, location: signal.location, power: 15 })));
	for (const record of devices.values()) {
		if (record.dimensionId !== dimensionId || record.definition.id !== "redstone_link"
			|| record.state.mode !== "receiver" || redstoneLinkFrequencyKey(record.state.frequency) !== key)
			continue;
		const power = receivedRedstoneLinkPower({ frequency, receiver: record.location, transmitters });
		updateRecord(record, { type: "receive", power }, { persistState: false });
	}
}

function inventoryFingerprint(block) {
	try {
		const container = block?.getComponent("minecraft:inventory")?.container;
		if (!container)
			return "";
		const contents = [];
		for (let slot = 0; slot < container.size; slot++) {
			const item = container.getItem(slot);
			contents.push(item ? `${slot}:${item.typeId}:${item.amount}` : `${slot}:`);
		}
		return contents.join("|");
	} catch {
		return "";
	}
}

function adjacentInventoryFingerprint(record) {
	try {
		const dimension = world.getDimension(record.dimensionId);
		return NEIGHBOR_OFFSETS.map(offset => inventoryFingerprint(dimension.getBlock({
			x: record.location.x + offset.x,
			y: record.location.y + offset.y,
			z: record.location.z + offset.z
		}))).join(";");
	} catch {
		return undefined;
	}
}

function setRedstoneLinkFrequency(record, item, player) {
	if (record.definition.id !== "redstone_link" || !item?.typeId)
		return false;
	const frequency = [...record.state.frequency];
	const slot = player?.isSneaking ? 1 : 0;
	frequency[slot] = item.typeId;
	const changed = updateRecord(record, { type: "configure", frequency });
	if (changed)
		player?.sendMessage?.(`Redstone Link frequency ${slot + 1} set to ${item.typeId}.`);
	return changed;
}

function setLogisticsFilter(record, item, player) {
	if (!["redstone_requester", "stock_link"].includes(record.definition.id) || !item?.typeId)
		return false;
	const changed = updateRecord(record, { type: "configure", filterItem: item.typeId });
	if (changed)
		player?.sendMessage?.(`${record.definition.id === "stock_link" ? "Stock Link" : "Redstone Requester"} filter set to ${item.typeId}.`);
	return changed;
}

function interact(record, player) {
	switch (record.definition.id) {
		case "analog_lever":
			return updateRecord(record, { type: "adjust", delta: player.isSneaking ? -1 : 1 });
		case "content_observer": {
			const fingerprint = adjacentInventoryFingerprint(record);
			return fingerprint === undefined ? false : updateRecord(record, { type: "observe", inventory: fingerprint });
		}
		case "crushing_wheel_controller":
			// The controller is a passive output: the processing runtime computes
			// its state from the actual opposing-wheel pair every tick.
			return false;
		case "lectern_controller":
			return updateRecord(record, { type: "trigger" });
		case "powered_latch":
		case "powered_toggle_latch":
			return updateRecord(record, { type: "input", power: record.state.inputPower > 0 ? 0 : 15 });
		case "pulse_extender":
		case "pulse_repeater":
		case "pulse_timer":
			if (player.isSneaking)
				return updateRecord(record, { type: "configure", timerTicks: record.state.timerTicks >= MAX_CONFIGURED_TICKS ? 2 : record.state.timerTicks + 2 });
			return updateRecord(record, { type: "input", power: record.state.inputPower > 0 ? 0 : 15 });
		case "redstone_contact":
			return updateRecord(record, { type: "set_contact", active: !record.state.active });
		case "redstone_link":
			return updateRecord(record, player.isSneaking
				? { type: "configure", mode: record.state.mode === "transmitter" ? "receiver" : "transmitter" }
				: { type: "configure", channel: (record.state.channel + 1) % 16 });
		case "redstone_requester":
			return updateRecord(record, player.isSneaking
				? { type: "configure", allowPartialRequests: !record.state.allowPartialRequests }
				: { type: "configure", requestAmount: record.state.requestAmount >= 64 ? 1 : record.state.requestAmount + 1 });
		case "rotation_speed_controller":
			return updateRecord(record, {
				type: "configure",
				targetSpeed: player.isSneaking
					? record.state.targetSpeed <= -256 ? 256 : record.state.targetSpeed - 16
					: record.state.targetSpeed >= 256 ? -256 : record.state.targetSpeed + 16
			});
		case "stock_link":
			return updateRecord(record, { type: "configure", minimumStock: player.isSneaking
				? record.state.minimumStock >= 4096 ? 1 : record.state.minimumStock * 2
				: record.state.minimumStock >= 4096 ? 1 : record.state.minimumStock + 1 });
		default:
			return false;
	}
}

function tickOne(record) {
	let changed = updateRecord(record, { type: "tick" }, { persistState: false });
	if (record.definition.id === "content_observer") {
		const fingerprint = adjacentInventoryFingerprint(record);
		if (fingerprint !== undefined)
			changed = updateRecord(record, { type: "observe", inventory: fingerprint }, { persistState: false }) || changed;
	}
	if (record.definition.id === "stock_link")
		changed = refreshStockLink(record) || changed;
	if (record.definition.id === "redstone_contact")
		changed = refreshRedstoneContact(record) || changed;
	if (record.definition.id === "crushing_wheel_controller")
		changed = refreshCrushingWheelController(record) || changed;
	return changed;
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored redstone device state shard ${warning.partition}: ${warning.error}`);
		for (const record of restored.records) {
			if (record?.kind === "controller_binding") {
				if (typeof record.playerId !== "string" || record.playerId.length === 0)
					throw new Error("Linked Controller binding has an invalid player identity");
				controllerBindings.set(record.playerId, normalizeLinkedControllerBindings(record.frequencies ?? record.frequency));
				continue;
			}
			if (record?.kind !== "device" || typeof record.id !== "string" || typeof record.dimensionId !== "string")
				throw new Error("Redstone device state contains an unknown record");
			const location = assertLocation(record.location);
			const state = validateRedstoneDeviceState(record.state);
			const definition = redstoneDeviceForBlock(`createbedrock:${state.kind}`);
			if (!definition || record.id !== deviceId(record.dimensionId, location))
				throw new Error("Redstone device state has an invalid identity");
			devices.set(record.id, { definition, dimensionId: record.dimensionId, id: record.id, location, state });
		}
		for (const record of devices.values()) {
			applyStateToBlock(record);
			applyRotationSpeedController(record);
		}
		if (devices.size > 0)
			console.warn(`[Create Bedrock] Restored ${devices.size} redstone devices`);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore redstone devices: ${error}`);
	}
}

export function getRedstoneDeviceDiagnostics() {
	const byKind = Object.fromEntries(REDSTONE_BLOCK_DEVICES.map(device => [device.id, 0]));
	for (const record of devices.values())
		byKind[record.definition.id]++;
	return {
		active: devices.size,
		controllerBindings: controllerBindings.size,
		controllerSignals: controllerSignals.size,
		byKind,
		roundRobinAfter,
		persistence: store.diagnostics()
	};
}

export function registerRedstoneDevices() {
	registerKernelTaskGroup(DEVICE_TASK_GROUP, DEVICE_TASK_BUDGET);
	registerNativeRedstoneEventHandler(handleNativeDeviceInput);
	world.afterEvents.playerPlaceBlock.subscribe(event => ensureDevice(event.block));
	world.afterEvents.playerBreakBlock.subscribe(event => {
		const id = deviceId(event.dimension.id, event.block.location);
		if (devices.delete(id))
			persist();
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		const record = ensureDevice(event.block);
		if (record?.definition.id === "redstone_link" && event.itemStack?.typeId === LINKED_CONTROLLER_ITEM) {
			bindLinkedController(event.player, record.state.frequency);
			return;
		}
		if (record?.definition.id === "redstone_link" && event.itemStack)
			setRedstoneLinkFrequency(record, event.itemStack, event.player);
		else if (["redstone_requester", "stock_link"].includes(record?.definition.id) && event.itemStack)
			setLogisticsFilter(record, event.itemStack, event.player);
		else if (record && !event.itemStack)
			interact(record, event.player);
	});
	world.afterEvents.itemUse.subscribe(event => {
		if (event.itemStack?.typeId === LINKED_CONTROLLER_ITEM)
			activateLinkedController(event.source);
	});
	registerTickHandler(() => {
		deviceTick++;
		for (const [playerId, signal] of controllerSignals) {
			if (signal.expiresAt > deviceTick)
				continue;
			controllerSignals.delete(playerId);
			refreshRedstoneLinkNetwork(signal.dimensionId, signal.frequency);
		}
		const ordered = [...devices.values()].sort((left, right) => left.id.localeCompare(right.id));
		if (ordered.length === 0)
			return store.tick();
		const start = roundRobinAfter ? Math.max(0, ordered.findIndex(record => record.id > roundRobinAfter)) : 0;
		const selected = [...ordered.slice(start), ...ordered.slice(0, start)].slice(0, DEVICE_TASK_BUDGET);
		let changed = false;
		for (const record of selected) {
			roundRobinAfter = record.id;
			changed = tickOne(record) || changed;
		}
		if (changed)
			persist();
		return store.tick() || changed;
	}, DEVICE_TASK_GROUP);
	system.run(restore);
}
