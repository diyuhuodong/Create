import { ItemStack, system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { getKineticNetworkAt, getKineticSpeedAt, getKineticWorldForTesting, setKineticSpeedControllerTarget } from "../kinetics/kinetic-runtime.js";
import { getBoilerDisplayState, getFluidDisplayState } from "../fluids/fluid-runtime.js";
import { countDepotNetworkItem, depotRequestStatus, hasDepotAt, requestDepotItem } from "../logistics/depot-runtime.js";
import { getPackageDisplayState } from "../logistics/package-runtime.js";
import { getCrushingWheelControllerState } from "../processing/crushing-wheel-runtime.js";
import { linkedControllerChannelForSlot, normalizeLinkedControllerBindings } from "./linked-controller-bindings.js";
import { configureLinkedControllerChannel, configureLinkedControllerChannels, readLinkedControllerItemState, writeLinkedControllerItemState } from "./linked-controller-item-state.js";
import { createDisplayTargetState, normalizeDisplayTargetState, resolveDisplayLinkWrite, writeDisplayTargetLine } from "./display-target.js";
import { resolveDisplaySource } from "./display-source.js";
import { registerWorldDisplaySourceProviders } from "./display-world-sources.js";
import { writeDisplayBoardLine } from "../materials/display-board-runtime.js";
import { getTrainDisplayState } from "../trains/train-runtime.js";
import { collectNixieTubeGroup, composeNixieTubeDisplay, NIXIE_TUBE_BLOCK, nixieTubeGroupId } from "./nixie-display.js";
import { beginLecternControllerUse, clearLecternControllerSession, createLecternControllerState, endLecternControllerUse, installLecternController, normalizeLecternControllerState, triggerLecternControllerChannel } from "./lectern-controller-state.js";
import { fingerprintInventoryStacks } from "./redstone-inventory-fingerprint.js";
import { registerNativeRedstoneEventHandler } from "./redstone-native-events.js";
import { REDSTONE_BLOCK_DEVICES, redstoneDeviceForBlock, redstoneDeviceForId } from "./redstone-device-catalog.js";
import { configureRedstoneDevice, createRedstoneDeviceConfiguration, normalizeRedstoneDeviceConfiguration } from "./redstone-device-configuration.js";
import { showLecternControllerUseForm, showLinkedControllerConfigurationForm, showRedstoneDeviceConfigurationForm } from "./redstone-device-ui.js";
import { REDSTONE_LINK_RANGE, normalizeRedstoneLinkFrequency, receivedRedstoneLinkPower, redstoneLinkFrequencyKey } from "./redstone-link-network.js";
import { MAX_CONFIGURED_TICKS, createRedstoneDeviceState, nativeOutputPower, transitionRedstoneDevice, validateRedstoneDeviceState } from "./redstone-device-state.js";

const DEVICE_TASK_BUDGET = 8;
const DEVICE_TASK_GROUP = "redstone_devices";
const LINKED_CONTROLLER_ITEM = "createbedrock:linked_controller";
const CONFIGURABLE_BLOCK_DEVICE_IDS = new Set([
	"content_observer", "display_link", "nixie_tube", "pulse_extender", "pulse_repeater", "pulse_timer",
	"redstone_link", "redstone_requester", "rotation_speed_controller", "stock_link"
]);
const OUTPUT_STATE = "createbedrock:powered";
const ANALOG_OUTPUT_STATE = "createbedrock:signal";
const DISPLAY_STATE = "createbedrock:display_signal";
const NIXIE_DISPLAY_ENTITY = "createbedrock:nixie_display";
const NIXIE_DISPLAY_GROUP_PROPERTY = "createbedrock:nixie_display_group";
const worldDisplayTargets = new Map();
const NIXIE_COLOR_CODES = Object.freeze({ blue: "§9", green: "§a", orange: "§6", red: "§c", white: "§f", yellow: "§e" });
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
const dirtyNixieDimensions = new Set();
let roundRobinAfter;
let deviceTick = 0;
let displaySourceProvidersRegistered = false;

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
		if (record?.kind === "display_target")
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
			configuration: record.configuration,
			...(record.lectern ? { lectern: record.lectern } : {}),
			state: record.state
		}))
		.concat([...worldDisplayTargets.values()].map(record => ({ ...record, kind: "display_target" })))
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
		return setBlockState(block, DISPLAY_STATE, record.definition.id === "nixie_tube"
			? record.state.display.lines.some(line => line.length > 0) ? record.state.display.style.brightness : 0
			: Number(record.state.displayValue) || 0);
	return false;
}

function queueNixieDisplay(dimensionId) {
	if (typeof dimensionId === "string" && dimensionId.length > 0)
		dirtyNixieDimensions.add(dimensionId);
}

function nixieTubeRecord(record) {
	if (record?.definition.id !== "nixie_tube")
		return undefined;
	const block = resolveBlock(record);
	if (block?.typeId !== NIXIE_TUBE_BLOCK)
		return undefined;
	const facing = block.permutation?.getAllStates?.()["minecraft:facing_direction"];
	if (facing === undefined)
		return undefined;
	return { display: record.state.display, facing, location: record.location, typeId: NIXIE_TUBE_BLOCK };
}

function nixieMarkerLocation(group) {
	const center = group.tubes.reduce((sum, tube) => ({
		x: sum.x + tube.location.x + 0.5,
		y: sum.y + tube.location.y + 0.5,
		z: sum.z + tube.location.z + 0.5
	}), { x: 0, y: 0, z: 0 });
	center.x /= group.tubes.length;
	center.y /= group.tubes.length;
	center.z /= group.tubes.length;
	const facing = FACING_OFFSETS[group.facing] ?? { x: 0, y: 0, z: 0 };
	return { x: center.x + facing.x * 0.51, y: center.y + facing.y * 0.51 + 0.15, z: center.z + facing.z * 0.51 };
}

function reconcileNixieDisplays(dimensionId) {
	let dimension;
	try {
		dimension = world.getDimension(dimensionId);
	} catch {
		return false;
	}
	const recognized = new Set();
	const visited = new Set();
	const tubes = [...devices.values()]
		.filter(record => record.dimensionId === dimensionId && record.definition.id === "nixie_tube")
		.sort((left, right) => left.id.localeCompare(right.id));
	for (const record of tubes) {
		const seed = nixieTubeRecord(record);
		const seedKey = seed && `${seed.location.x}:${seed.location.y}:${seed.location.z}`;
		if (!seed || visited.has(seedKey))
			continue;
		try {
			const group = collectNixieTubeGroup({
				anchor: seed.location,
				readTube(location) {
					return nixieTubeRecord(devices.get(deviceId(dimensionId, location)));
				}
			});
			if (!group)
				continue;
			for (const tube of group.tubes)
				visited.add(`${tube.location.x}:${tube.location.y}:${tube.location.z}`);
			const groupId = nixieTubeGroupId(dimensionId, group);
			recognized.add(groupId);
			let marker = dimension.getEntities({ type: NIXIE_DISPLAY_ENTITY })
				.find(entity => entity.getDynamicProperty(NIXIE_DISPLAY_GROUP_PROPERTY) === groupId);
			const composed = composeNixieTubeDisplay(group);
			if (composed.text.length === 0) {
				marker?.remove();
				continue;
			}
			marker ??= dimension.spawnEntity(NIXIE_DISPLAY_ENTITY, nixieMarkerLocation(group));
			marker.setDynamicProperty(NIXIE_DISPLAY_GROUP_PROPERTY, groupId);
			marker.nameTag = `${NIXIE_COLOR_CODES[composed.style.color]}${composed.text}`;
			marker.teleport(nixieMarkerLocation(group));
		} catch (error) {
			console.warn(`[Create Bedrock] Could not render Nixie Tube group in ${dimensionId}: ${error}`);
		}
	}
	for (const marker of dimension.getEntities({ type: NIXIE_DISPLAY_ENTITY })) {
		if (!recognized.has(marker.getDynamicProperty(NIXIE_DISPLAY_GROUP_PROPERTY)))
			marker.remove();
	}
	return true;
}

function flushNixieDisplays() {
	let changed = false;
	for (const dimensionId of [...dirtyNixieDimensions].sort()) {
		dirtyNixieDimensions.delete(dimensionId);
		changed = reconcileNixieDisplays(dimensionId) || changed;
	}
	return changed;
}

function applyRotationSpeedController(record) {
	if (record.definition.id !== "rotation_speed_controller")
		return false;
	try {
		return setKineticSpeedControllerTarget(record.dimensionId, record.location, record.state.targetSpeed);
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

function logisticsRouting(record) {
	return {
		networkId: record.configuration?.settings?.networkId ?? "default",
		targetAddress: record.configuration?.settings?.targetAddress ?? ""
	};
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
				maxCount: record.state.requestAmount,
				...logisticsRouting(record)
			});
			if (result.ok)
				break;
		} catch (error) {
			console.warn(`[Create Bedrock] Redstone requester at ${record.id} could not create a depot request: ${error}`);
		}
	}
	const status = result.order?.state ?? (result.ok ? "pending" : "failed");
	return updateRecord(record, {
		type: "request_result",
		inFlight: status === "pending",
		nonce,
		status,
		success: status === "fulfilled" || status === "partial"
	});
}

function refreshRedstoneRequester(record) {
	if (record.definition.id !== "redstone_requester" || !record.state.requestInFlight)
		return false;
	try {
		const status = depotRequestStatus(`${record.id}:request:${record.state.requestNonce}`);
		if (!status || status.state === "pending")
			return false;
		return updateRecord(record, {
			type: "request_progress",
			nonce: record.state.requestNonce,
			status: status.state
		}, { persistState: false });
	} catch (error) {
		console.warn(`[Create Bedrock] Redstone Requester at ${record.id} could not read request status: ${error}`);
		return false;
	}
}

function refreshStockLink(record) {
	if (record.definition.id !== "stock_link" || record.state.filterItem === "minecraft:air")
		return false;
	try {
		const summary = countDepotNetworkItem({
			dimensionId: record.dimensionId,
			itemType: record.state.filterItem,
			...logisticsRouting(record)
		});
		return updateRecord(record, { type: "set_stock_available", active: summary.available >= record.state.minimumStock }, { persistState: false });
	} catch (error) {
		console.warn(`[Create Bedrock] Stock Link at ${record.id} could not query logistics stock: ${error}`);
		return false;
	}
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

function readDisplayRedstonePower(record, location) {
	const sourceRecord = devices.get(deviceId(record.dimensionId, location));
	if (sourceRecord)
		return nativeOutputPower(sourceRecord.state);
	try {
		const states = world.getDimension(record.dimensionId).getBlock(location)?.permutation?.getAllStates?.() ?? {};
		for (const property of [ANALOG_OUTPUT_STATE, OUTPUT_STATE, "minecraft:redstone_signal"])
			if (Number.isInteger(states[property]) && states[property] >= 0 && states[property] <= 15)
				return states[property];
		return states[OUTPUT_STATE] === true ? 15 : 0;
	} catch {
		return 0;
	}
}

function registerDisplaySourceProviders() {
	if (displaySourceProvidersRegistered)
		return;
	displaySourceProvidersRegistered = true;
	registerWorldDisplaySourceProviders({
		getBoiler: getBoilerDisplayState,
		getFluid: getFluidDisplayState,
		getPackage: getPackageDisplayState,
		getTrain: getTrainDisplayState,
		kineticNetwork: getKineticNetworkAt,
		kineticSpeed: getKineticSpeedAt,
		readNixie(dimensionId, location) {
			const source = devices.get(deviceId(dimensionId, location));
			return source?.definition.id === "nixie_tube" ? source.state.display.lines : undefined;
		},
		world
	});
}

function readDisplaySource(record, source) {
	const lines = resolveDisplaySource({ context: { record }, kind: source.kind, location: source.location });
	if (!lines)
		throw new Error(`Display Source ${source.kind} is not available for this world state`);
	return lines;
}

function displayTargetId(dimensionId, location) {
	return `display-target:${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function worldDisplayTargetKind(block) {
	if (block?.typeId === "minecraft:lectern")
		return "lectern";
	if (typeof block?.typeId === "string" && (block.typeId.endsWith("_sign") || block.typeId.endsWith("_wall_sign") || block.typeId.endsWith("_hanging_sign")))
		return "sign";
	return undefined;
}

function applyWorldDisplayTarget(record) {
	const block = world.getDimension(record.dimensionId).getBlock(record.location);
	if (worldDisplayTargetKind(block) !== record.targetKind)
		return false;
	const text = record.state.lines.join("\n");
	if (record.targetKind === "sign") {
		const component = block.getComponent?.("minecraft:sign");
		if (typeof component?.setText !== "function")
			return false;
		component.setText(text);
		return true;
	}
	const container = block.getComponent?.("minecraft:inventory")?.container;
	const book = container?.getItem(0);
	if (!book)
		return false;
	for (const componentId of ["minecraft:writable_book_content", "minecraft:written_book_content", "minecraft:book_content"]) {
		const component = book.getComponent?.(componentId);
		if (!component)
			continue;
		if (typeof component.setPages === "function")
			component.setPages(record.state.lines);
		else if ("pages" in component)
			component.pages = [...record.state.lines];
		else
			continue;
		container.setItem(0, book);
		return true;
	}
	return false;
}

function writeWorldDisplayTarget(dimensionId, location, { line, text }) {
	const block = world.getDimension(dimensionId).getBlock(location);
	const targetKind = worldDisplayTargetKind(block);
	if (!targetKind)
		return false;
	const id = displayTargetId(dimensionId, location);
	const previous = worldDisplayTargets.get(id);
	const state = previous?.state ?? createDisplayTargetState({ lineCount: targetKind === "sign" ? 4 : 16 });
	if (line >= state.lines.length)
		return false;
	const update = writeDisplayTargetLine(state, { line, text });
	if (!update.changed)
		return false;
	const record = { dimensionId, id, location: assertLocation(location), state: update.state, targetKind };
	worldDisplayTargets.set(id, record);
	persist();
	try { applyWorldDisplayTarget(record); } catch (error) { console.warn(`[Create Bedrock] Could not project ${targetKind} display ${id}: ${error}`); }
	return true;
}

/** Display Link stores offsets only; this is the sole world-facing target adapter. */
function refreshDisplayLink(record) {
	if (record.definition.id !== "display_link")
		return false;
	let write;
	try {
		write = resolveDisplayLinkWrite({
			configuration: record.configuration,
			location: record.location,
			readSource: source => readDisplaySource(record, source)
		});
	} catch (error) {
		console.warn(`[Create Bedrock] Display Link at ${record.id} could not resolve its source: ${error}`);
		return false;
	}
	let target = devices.get(deviceId(record.dimensionId, write.target));
	if (!target) {
		try {
			target = ensureDevice(world.getDimension(record.dimensionId).getBlock(write.target));
		} catch {
			return false;
		}
	}
	if (target?.definition.id === "nixie_tube") {
		if (write.line >= target.state.display.lines.length)
			return false;
		return updateRecord(target, { line: write.line, text: write.text, type: "set_display_text" }, { persistState: false });
	}
	try {
		const targetBlock = world.getDimension(record.dimensionId).getBlock(write.target);
		if (targetBlock?.typeId === "createbedrock:display_board")
			return writeDisplayBoardLine(record.dimensionId, write.target, { line: write.line, text: write.text }, getKineticWorldForTesting());
		return writeWorldDisplayTarget(record.dimensionId, write.target, { line: write.line, text: write.text });
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
		configuration: createRedstoneDeviceConfiguration(),
		lectern: descriptor.definition.id === "lectern_controller" ? createLecternControllerState() : undefined,
		state: createRedstoneDeviceState(descriptor.definition.id)
	};
	devices.set(record.id, record);
	applyStateToBlock(record, block);
	if (record.definition.id === "nixie_tube")
		queueNixieDisplay(record.dimensionId);
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
	if (record.definition.id === "nixie_tube")
		queueNixieDisplay(record.dimensionId);
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

function configureRecord(record, player, expectedRevision, patch) {
	const result = configureRedstoneDevice({
		configuration: record.configuration,
		editorId: player?.id,
		expectedRevision,
		patch,
		state: record.state
	});
	if (result.conflict) {
		player?.sendMessage?.("These settings changed while the form was open. Reopen it and try again.");
		return false;
	}
	if (!result.changed)
		return false;
	const previousState = record.state;
	record.configuration = result.configuration;
	record.state = result.state;
	if (record.definition.id === "nixie_tube") {
		record.state = transitionRedstoneDevice(record.state, {
			brightness: record.configuration.settings.styleBrightness ?? 15,
			color: record.configuration.settings.styleColor ?? "orange",
			type: "set_display_style"
		});
		if (patch.customText !== undefined)
			record.state = transitionRedstoneDevice(record.state, { text: patch.customText, type: "set_display_text" });
		queueNixieDisplay(record.dimensionId);
	}
	applyStateToBlock(record);
	applyRotationSpeedController(record);
	if (record.definition.id === "redstone_link") {
		refreshRedstoneLinkNetwork(record.dimensionId, previousState.frequency);
		refreshRedstoneLinkNetwork(record.dimensionId, record.state.frequency);
	}
	persist();
	player?.sendMessage?.(`${record.definition.id.replaceAll("_", " ")} settings saved.`);
	return true;
}

function handleNativeDeviceInput({ block, powerLevel }) {
	const record = ensureDevice(block);
	if (!record || !record.definition.input)
		return false;
	updateRecord(record, { type: "input", power: powerLevel });
	return true;
}

function replaceSelectedItem(player, itemStack) {
	try {
		const container = player?.getComponent?.("minecraft:inventory")?.container;
		if (!container || !Number.isInteger(player.selectedSlotIndex) || player.selectedSlotIndex < 0)
			return false;
		container.setItem(player.selectedSlotIndex, itemStack);
		return true;
	} catch {
		return false;
	}
}

function stateForLinkedControllerItem(player, itemStack) {
	const state = readLinkedControllerItemState(itemStack);
	const legacy = controllerBindings.get(player?.id);
	// Migrates controller bindings written by the pre-R1 player-scoped prototype
	// at the first safe interaction with the actual controller ItemStack.
	if (legacy && state.revision === 0 && state.channels.every(pair => pair[0] === "minecraft:air" && pair[1] === "minecraft:air"))
		return { ...state, channels: normalizeLinkedControllerBindings(legacy) };
	return state;
}

function createLinkedControllerItem(controllerState) {
	const itemStack = new ItemStack(LINKED_CONTROLLER_ITEM, 1);
	writeLinkedControllerItemState(itemStack, controllerState);
	return itemStack;
}

function installLinkedControllerInLectern(record, player, itemStack) {
	if (record.definition.id !== "lectern_controller")
		return false;
	try {
		const result = installLecternController({
			controller: stateForLinkedControllerItem(player, itemStack),
			state: record.lectern
		});
		if (!result.changed) {
			player.sendMessage?.("This Lectern Controller already contains a controller. Sneak-break it to recover the stored item.");
			return false;
		}
		if (!replaceSelectedItem(player, undefined))
			throw new Error("could not remove the installed controller from the selected slot");
		record.lectern = result.state;
		controllerBindings.delete(player.id);
		persist();
		player.sendMessage?.("Linked Controller installed in Lectern Controller.");
		return true;
	} catch (error) {
		player.sendMessage?.(`Could not install Linked Controller: ${error}`);
		return false;
	}
}

function playerNearLectern(player, record) {
	if (!player?.location || !record?.location)
		return false;
	const dx = player.location.x - (record.location.x + 0.5);
	const dy = player.location.y - (record.location.y + 0.5);
	const dz = player.location.z - (record.location.z + 0.5);
	return dx * dx + dy * dy + dz * dz <= 16;
}

function openLecternController(record, player) {
	if (!player?.id)
		return false;
	const started = beginLecternControllerUse({ playerId: player.id, state: record.lectern, tick: deviceTick });
	if (!started.changed) {
		player.sendMessage?.(started.reason === "in_use"
			? "This Lectern Controller is currently in use by another player."
			: "Install a Linked Controller before using this Lectern Controller.");
		return false;
	}
	record.lectern = started.state;
	persist();
	showLecternControllerUseForm({
		player,
		state: record.lectern,
		trigger(channel) {
			if (!playerNearLectern(player, record)) {
				player.sendMessage?.("Move back within range of the Lectern Controller.");
				return false;
			}
			const signal = triggerLecternControllerChannel({ channel, playerId: player.id, state: record.lectern, tick: deviceTick });
			if (!signal.frequency) {
				player.sendMessage?.("The Lectern Controller session has expired.");
				return false;
			}
			updateRecord(record, { type: "trigger" });
			return activateControllerFrequency(player, signal.frequency);
		},
		close() {
			const ended = endLecternControllerUse({ playerId: player.id, state: record.lectern });
			if (ended.changed) {
				record.lectern = ended.state;
				persist();
			}
		}
	});
	return true;
}

function dropLecternController(event, record) {
	if (!record?.lectern?.controller)
		return;
	try {
		event.dimension.spawnItem(createLinkedControllerItem(record.lectern.controller), {
			x: record.location.x + 0.5,
			y: record.location.y + 0.5,
			z: record.location.z + 0.5
		});
	} catch (error) {
		console.warn(`[Create Bedrock] Could not recover Lectern Controller item at ${record.id}: ${error}`);
	}
}

function bindLinkedController(player, itemStack, frequency) {
	if (!player?.id || !itemStack)
		return false;
	try {
		const state = stateForLinkedControllerItem(player, itemStack);
		const channel = linkedControllerChannelForSlot(player.selectedSlotIndex);
		const result = configureLinkedControllerChannel({ channel, expectedRevision: state.revision, frequency, state });
		if (!result.changed)
			return false;
		writeLinkedControllerItemState(itemStack, result.state);
		if (!replaceSelectedItem(player, itemStack))
			throw new Error("could not update the selected controller slot");
		if (controllerBindings.delete(player.id))
			persist();
		player.sendMessage?.(`Linked Controller channel ${channel + 1} bound to ${result.state.channels[channel][0]} + ${result.state.channels[channel][1]}.`);
		return true;
	} catch (error) {
		player.sendMessage?.(`Could not bind this Linked Controller: ${error}`);
		return false;
	}
}

function activateControllerFrequency(source, frequency) {
	if (!source?.id || !source.dimension?.id || !source.location)
		return false;
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

function activateLinkedController(source, itemStack) {
	if (!source?.id || !itemStack)
		return false;
	try {
		const state = stateForLinkedControllerItem(source, itemStack);
		return activateControllerFrequency(source, state.channels[linkedControllerChannelForSlot(source.selectedSlotIndex)]);
	} catch (error) {
		source.sendMessage?.(`Could not read this Linked Controller: ${error}`);
		return false;
	}
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

function inventoryFingerprint(block, filterItem) {
	try {
		const container = block?.getComponent("minecraft:inventory")?.container;
		if (!container)
			return "";
		const contents = [];
		for (let slot = 0; slot < container.size; slot++) {
			const item = container.getItem(slot);
			contents.push(item ? { amount: item.amount, typeId: item.typeId } : undefined);
		}
		return fingerprintInventoryStacks(contents, filterItem);
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
		}), record.state.filterItem)).join(";");
	} catch {
		return undefined;
	}
}

function setRedstoneLinkFrequency(record, item, player) {
	if (record.definition.id !== "redstone_link" || !item?.typeId)
		return false;
	const slot = player?.isSneaking ? 1 : 0;
	const changed = configureRecord(record, player, record.configuration.revision, slot === 0
		? { frequencyLeft: item.typeId }
		: { frequencyRight: item.typeId });
	if (changed)
		player?.sendMessage?.(`Redstone Link frequency ${slot + 1} set to ${item.typeId}.`);
	return changed;
}

function setLogisticsFilter(record, item, player) {
	if (!["redstone_requester", "stock_link"].includes(record.definition.id) || !item?.typeId)
		return false;
	const changed = configureRecord(record, player, record.configuration.revision, { filterItem: item.typeId });
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
	if (record.definition.id === "redstone_requester")
		changed = refreshRedstoneRequester(record) || changed;
	if (record.definition.id === "redstone_contact")
		changed = refreshRedstoneContact(record) || changed;
	if (record.definition.id === "crushing_wheel_controller")
		changed = refreshCrushingWheelController(record) || changed;
	if (record.definition.id === "display_link")
		changed = refreshDisplayLink(record) || changed;
	if (record.definition.id === "lectern_controller" && record.lectern?.activeUserId !== "" && record.lectern.activeUntilTick <= deviceTick) {
		record.lectern = clearLecternControllerSession(record.lectern);
		changed = true;
	}
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
			if (record?.kind === "display_target") {
				const location = assertLocation(record.location);
				if (typeof record.dimensionId !== "string" || !["sign", "lectern"].includes(record.targetKind) || record.id !== displayTargetId(record.dimensionId, location))
					throw new Error("World Display Target state has an invalid identity");
				worldDisplayTargets.set(record.id, {
					dimensionId: record.dimensionId,
					id: record.id,
					location,
					state: normalizeDisplayTargetState(record.state),
					targetKind: record.targetKind
				});
				continue;
			}
			if (record?.kind !== "device" || typeof record.id !== "string" || typeof record.dimensionId !== "string")
				throw new Error("Redstone device state contains an unknown record");
			const location = assertLocation(record.location);
			const state = validateRedstoneDeviceState(record.state);
			const configuration = normalizeRedstoneDeviceConfiguration(record.configuration);
			const definition = redstoneDeviceForBlock(`createbedrock:${state.kind}`);
			if (!definition || record.id !== deviceId(record.dimensionId, location))
				throw new Error("Redstone device state has an invalid identity");
			const lectern = definition.id === "lectern_controller"
				? clearLecternControllerSession(normalizeLecternControllerState(record.lectern))
				: undefined;
			devices.set(record.id, { configuration, definition, dimensionId: record.dimensionId, id: record.id, lectern, location, state });
		}
		for (const record of devices.values()) {
			applyStateToBlock(record);
			applyRotationSpeedController(record);
			if (record.definition.id === "nixie_tube")
				queueNixieDisplay(record.dimensionId);
		}
		for (const record of worldDisplayTargets.values())
			try { applyWorldDisplayTarget(record); } catch {}
		if (devices.size > 0)
			console.warn(`[Create Bedrock] Restored ${devices.size} redstone devices`);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore redstone devices: ${error}`);
	}
}

/** Capture only the durable block-scoped state; transient controller signals stay world-local. */
export function captureRedstoneDeviceMovingData(dimensionId, location) {
	const record = devices.get(deviceId(dimensionId, location));
	if (!record)
		return undefined;
	return {
		configuration: clone(record.configuration),
		...(record.lectern === undefined ? {} : { lectern: clone(record.lectern) }),
		state: clone(record.state)
	};
}

export function detachRedstoneDeviceMovingData(dimensionId, location) {
	const id = deviceId(dimensionId, location);
	if (!devices.delete(id))
		return false;
	persist();
	return true;
}

export function restoreRedstoneDeviceMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	const id = deviceId(dimensionId, location);
	if (devices.has(id))
		throw new Error(`Cannot restore moving redstone state over existing device ${id}`);
	const state = validateRedstoneDeviceState(data?.state);
	const definition = redstoneDeviceForId(state.kind);
	if (!definition?.blockId)
		throw new TypeError("Moving redstone data must identify a block device");
	const configuration = normalizeRedstoneDeviceConfiguration(data.configuration);
	const lectern = definition.id === "lectern_controller"
		? clearLecternControllerSession(normalizeLecternControllerState(data.lectern))
		: undefined;
	const record = { configuration, definition, dimensionId, id, lectern, location: assertLocation(location), state };
	devices.set(id, record);
	applyStateToBlock(record);
	applyRotationSpeedController(record);
	if (record.definition.id === "nixie_tube")
		queueNixieDisplay(record.dimensionId);
	persist();
	return true;
}

/**
 * A moving contact can only drive a real Bedrock redstone output on the
 * stationary counterpart.  Route that edge through the same authoritative
 * device state used by ordinary world contacts.
 */
export function setRedstoneContactFromAssembly(dimensionId, location, active) {
	if (typeof dimensionId !== "string" || typeof active !== "boolean")
		throw new TypeError("Assembly contact updates require a dimension and boolean output");
	let record = devices.get(deviceId(dimensionId, location));
	if (!record) {
		const block = world.getDimension(dimensionId).getBlock(location);
		record = ensureDevice(block);
	}
	if (record?.definition.id !== "redstone_contact")
		return false;
	return updateRecord(record, { type: "set_contact", active });
}

export function getRedstoneDeviceDiagnostics() {
	const byKind = Object.fromEntries(REDSTONE_BLOCK_DEVICES.map(device => [device.id, 0]));
	for (const record of devices.values())
		byKind[record.definition.id]++;
	return {
		active: devices.size,
		worldDisplayTargets: worldDisplayTargets.size,
		legacyControllerBindings: controllerBindings.size,
		controllerSignals: controllerSignals.size,
		byKind,
		roundRobinAfter,
		persistence: store.diagnostics()
	};
}

export function registerRedstoneDevices() {
	registerDisplaySourceProviders();
	registerKernelTaskGroup(DEVICE_TASK_GROUP, DEVICE_TASK_BUDGET);
	registerNativeRedstoneEventHandler(handleNativeDeviceInput);
	world.afterEvents.playerPlaceBlock.subscribe(event => ensureDevice(event.block));
	world.afterEvents.playerBreakBlock.subscribe(event => {
		const id = deviceId(event.dimension.id, event.block.location);
		const record = devices.get(id);
		if (record) {
			dropLecternController(event, record);
			devices.delete(id);
			if (record.definition.id === "nixie_tube")
				queueNixieDisplay(record.dimensionId);
			persist();
		}
		if (worldDisplayTargets.delete(displayTargetId(event.dimension.id, event.block.location)))
			persist();
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		const record = ensureDevice(event.block);
		if (record?.definition.id === "lectern_controller" && event.itemStack?.typeId === LINKED_CONTROLLER_ITEM) {
			installLinkedControllerInLectern(record, event.player, event.itemStack);
			return;
		}
		if (record?.definition.id === "redstone_link" && event.itemStack?.typeId === LINKED_CONTROLLER_ITEM) {
			bindLinkedController(event.player, event.itemStack, record.state.frequency);
			return;
		}
		if (record?.definition.id === "redstone_link" && event.itemStack)
			setRedstoneLinkFrequency(record, event.itemStack, event.player);
		else if (["redstone_requester", "stock_link"].includes(record?.definition.id) && event.itemStack)
			setLogisticsFilter(record, event.itemStack, event.player);
		else if (record && !event.itemStack) {
			if (record.definition.id === "lectern_controller")
				openLecternController(record, event.player);
			else if (CONFIGURABLE_BLOCK_DEVICE_IDS.has(record.definition.id)) {
				showRedstoneDeviceConfigurationForm({
					configuration: record.configuration,
					currentRevision: () => record.configuration.revision,
					player: event.player,
					state: record.state,
					subjectId: record.id,
					submit: ({ expectedRevision, patch }) => configureRecord(record, event.player, expectedRevision, patch)
				});
			} else
				interact(record, event.player);
		}
	});
	world.afterEvents.itemUse.subscribe(event => {
		if (event.itemStack?.typeId !== LINKED_CONTROLLER_ITEM)
			return;
		if (event.source?.isSneaking) {
			try {
				const state = stateForLinkedControllerItem(event.source, event.itemStack);
				showLinkedControllerConfigurationForm({
					player: event.source,
					state,
					submit: ({ expectedRevision, frequencies }) => {
						try {
							const current = stateForLinkedControllerItem(event.source, event.itemStack);
							const result = configureLinkedControllerChannels({ expectedRevision, frequencies, state: current });
							if (result.conflict) {
								event.source.sendMessage?.("This controller changed while the form was open. Reopen it and try again.");
								return false;
							}
							if (!result.changed)
								return false;
							writeLinkedControllerItemState(event.itemStack, result.state);
							if (!replaceSelectedItem(event.source, event.itemStack))
								throw new Error("could not update the selected controller slot");
							event.source.sendMessage?.("Linked Controller settings saved.");
							return true;
						} catch (error) {
							event.source.sendMessage?.(`Could not save this Linked Controller: ${error}`);
							return false;
						}
					}
				});
			} catch (error) {
				event.source.sendMessage?.(`Could not open Linked Controller settings: ${error}`);
			}
			return;
		}
		activateLinkedController(event.source, event.itemStack);
	});
	registerTickHandler(() => {
		deviceTick++;
		const displaysChanged = flushNixieDisplays();
		for (const [playerId, signal] of controllerSignals) {
			if (signal.expiresAt > deviceTick)
				continue;
			controllerSignals.delete(playerId);
			refreshRedstoneLinkNetwork(signal.dimensionId, signal.frequency);
		}
		const ordered = [...devices.values()].sort((left, right) => left.id.localeCompare(right.id));
		if (ordered.length === 0)
			return store.tick() || displaysChanged;
		const start = roundRobinAfter ? Math.max(0, ordered.findIndex(record => record.id > roundRobinAfter)) : 0;
		const selected = [...ordered.slice(start), ...ordered.slice(0, start)].slice(0, DEVICE_TASK_BUDGET);
		let changed = false;
		for (const record of selected) {
			roundRobinAfter = record.id;
			changed = tickOne(record) || changed;
		}
		if (changed)
			persist();
		return store.tick() || changed || displaysChanged;
	}, DEVICE_TASK_GROUP);
	system.run(restore);
}
