import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { deserializeVersionedState, serializeVersionedState } from "../kernel/versioned-state.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { KineticWorld } from "./kinetic-world.js";
import { registerCreativeMotorValueBoards } from "./creative-motor-value-board.js";
import {
	creativeMotorFacingIndex,
	isCreativeMotorValueBox,
	nudgeCreativeMotorSpeed,
	parseCreativeMotorSpeed
} from "./creative-motor-configuration.js";

const kineticWorld = new KineticWorld();
const LEGACY_PERSISTENCE_KEY = "createbedrock:kinetic_world_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const BELT_CONNECTOR = "createbedrock:belt_connector";
const WRENCH = "createbedrock:wrench";
const CLUTCH_BLOCK = "createbedrock:clutch";
const CREATIVE_MOTOR_BLOCK = "createbedrock:creative_motor";
const GEARSHIFT_BLOCK = "createbedrock:gearshift";
const CHAIN_GEARSHIFT_BLOCK = "createbedrock:adjustable_chain_gearshift";
const SEQUENCED_GEARSHIFT_BLOCK = "createbedrock:sequenced_gearshift";
const LARGE_WATER_WHEEL_BLOCK = "createbedrock:large_water_wheel";
const WATER_WHEEL_STRUCTURE_BLOCK = "createbedrock:water_wheel_structure";
const WATER_WHEEL_CHECK_INTERVAL = 20;
const KINETIC_DIMENSION_TASK_BUDGET = 2;
const SEQUENCED_GEARSHIFT_PRESETS = [
	[{ duration: 20, multiplier: 1 }, { duration: 20, multiplier: -1 }],
	[{ duration: 10, multiplier: 1 }, { duration: 10, multiplier: -1 }],
	[{ duration: 20, multiplier: 2 }, { duration: 20, multiplier: -2 }]
];
const pendingBeltEndpoints = new Map();
let waterWheelTicks = 0;
let legacyStatePendingMigration = false;

function sectionKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

function kineticRecords() {
	const snapshot = kineticWorld.snapshot();
	return [
		...snapshot.nodes.map(node => ({ kind: "node", ...node })),
		...snapshot.beltLinks.map(link => ({ kind: "belt_link", ...link }))
	];
}

function restoreKineticRecords(records) {
	const nodes = [];
	const beltLinks = [];
	for (const record of records) {
		if (record?.kind === "node") {
			const { kind, ...node } = record;
			nodes.push(node);
		} else if (record?.kind === "belt_link") {
			const { kind, ...link } = record;
			beltLinks.push(link);
		}
	}
	kineticWorld.restore({ beltLinks, nodes, schemaVersion: 2 });
}

const shardedPersistence = new ShardedStateStore({
	keyPrefix: "createbedrock:kinetic_state_v2",
	onCommit() {
		if (!legacyStatePendingMigration)
			return;
		world.setDynamicProperty(LEGACY_PERSISTENCE_KEY, undefined);
		legacyStatePendingMigration = false;
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not write sharded kinetic state: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind === "node")
			return sectionKey(record.dimensionId, record.location);
		if (record?.kind === "belt_link")
			return sectionKey(record.left.dimensionId, record.left.location);
		throw new TypeError("Unknown kinetic persistent record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});

const persistence = new DeferredPersistence({
	name: "kinetics",
	write() {
		shardedPersistence.request(kineticRecords());
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist kinetic state: ${error}`);
	}
});

function persist() {
	persistence.request();
}

function setClutchEnabled(block, enabled) {
	if (block?.typeId !== CLUTCH_BLOCK || typeof enabled !== "boolean")
		return false;
	const current = block.permutation.getAllStates()["createbedrock:enabled"];
	const worldChanged = (current !== 0 && current !== false) !== enabled;
	if (worldChanged)
		block.setPermutation(block.permutation.withState("createbedrock:enabled", enabled ? 1 : 0));
	const networkChanged = kineticWorld.setClutchEnabled(block.dimension.id, block.location, enabled);
	if (worldChanged || networkChanged)
		persist();
	return worldChanged || networkChanged;
}

function setBlockState(block, stateName, value) {
	if (!block?.permutation?.getAllStates || typeof block.setPermutation !== "function")
		return false;
	const current = block.permutation.getAllStates()[stateName];
	if (current === value)
		return false;
	try {
		block.setPermutation(block.permutation.withState(stateName, value));
		return true;
	} catch {
		return false;
	}
}

function setGearshiftReversed(block, reversed) {
	if (block?.typeId !== GEARSHIFT_BLOCK || typeof reversed !== "boolean")
		return false;
	const worldChanged = setBlockState(block, "createbedrock:powered", reversed ? 1 : 0);
	const networkChanged = kineticWorld.setGearshiftReversed(block.dimension.id, block.location, reversed);
	if (worldChanged || networkChanged)
		persist();
	return worldChanged || networkChanged;
}

function setChainGearshiftSignal(block, signal) {
	if (block?.typeId !== CHAIN_GEARSHIFT_BLOCK || !Number.isInteger(signal) || signal < 0 || signal > 15)
		return false;
	const worldChanged = setBlockState(block, "createbedrock:signal", signal);
	const networkChanged = kineticWorld.setChainGearshiftSignal(block.dimension.id, block.location, signal);
	if (worldChanged || networkChanged)
		persist();
	return worldChanged || networkChanged;
}

function setSequencedGearshiftPowered(block, powered) {
	if (block?.typeId !== SEQUENCED_GEARSHIFT_BLOCK || typeof powered !== "boolean")
		return false;
	const worldChanged = setBlockState(block, "createbedrock:powered", powered ? 1 : 0);
	const networkChanged = kineticWorld.setSequencedGearshiftPowered(block.dimension.id, block.location, powered);
	if (worldChanged || networkChanged)
		persist();
	return worldChanged || networkChanged;
}

function cycleSequencedGearshiftProgram(block) {
	if (block?.typeId !== SEQUENCED_GEARSHIFT_BLOCK)
		return false;
	const node = kineticWorld.snapshot().nodes.find(candidate => candidate.dimensionId === block.dimension.id
		&& candidate.location.x === block.location.x && candidate.location.y === block.location.y && candidate.location.z === block.location.z);
	const current = JSON.stringify(node?.sequence?.program);
	const index = SEQUENCED_GEARSHIFT_PRESETS.findIndex(program => JSON.stringify(program) === current);
	const changed = kineticWorld.configureSequencedGearshift(block.dimension.id, block.location, SEQUENCED_GEARSHIFT_PRESETS[(index + 1) % SEQUENCED_GEARSHIFT_PRESETS.length]);
	if (changed)
		persist();
	return changed;
}

export function persistKineticWorld() {
	persist();
}

export function setKineticClutchRedstonePowered(dimensionId, location, powered) {
	if (typeof dimensionId !== "string" || !location || typeof powered !== "boolean")
		throw new TypeError("Redstone clutch updates require a dimension, location, and power state");
	const block = world.getDimension(dimensionId).getBlock(location);
	return setClutchEnabled(block, !powered);
}

export function setKineticGearshiftRedstonePowered(dimensionId, location, powered) {
	if (typeof dimensionId !== "string" || !location || typeof powered !== "boolean")
		throw new TypeError("Redstone gearshift updates require a dimension, location, and power state");
	return setGearshiftReversed(world.getDimension(dimensionId).getBlock(location), powered);
}

export function setKineticChainGearshiftRedstonePower(dimensionId, location, power) {
	if (typeof dimensionId !== "string" || !location || !Number.isInteger(power) || power < 0 || power > 15)
		throw new TypeError("Chain-gearshift updates require a dimension, location, and power from 0 to 15");
	return setChainGearshiftSignal(world.getDimension(dimensionId).getBlock(location), power);
}

export function setKineticSequencedGearshiftRedstonePowered(dimensionId, location, powered) {
	if (typeof dimensionId !== "string" || !location || typeof powered !== "boolean")
		throw new TypeError("Sequenced-gearshift updates require a dimension, location, and power state");
	return setSequencedGearshiftPowered(world.getDimension(dimensionId).getBlock(location), powered);
}

export function configureKineticSequencedGearshift(dimensionId, location, program) {
	const changed = kineticWorld.configureSequencedGearshift(dimensionId, location, program);
	if (changed)
		persist();
	return changed;
}

/**
 * Set a configurable kinetic source's target speed. Redstone devices use this
 * narrow API instead of mutating KineticWorld directly so persistence and
 * dirty-network propagation remain identical to normal player configuration.
 */
export function setKineticGeneratedSpeed(dimensionId, location, speed) {
	if (typeof dimensionId !== "string" || !location || !Number.isFinite(speed))
		throw new TypeError("Kinetic speed updates require a dimension, location, and finite speed");
	const changed = kineticWorld.setGeneratedSpeed(dimensionId, location, speed);
	if (changed)
		persist();
	return changed;
}

/**
 * Set the requested output speed of a Rotation Speed Controller. Unlike a
 * generated source, the controller only transfers capacity from a powered
 * kinetic side through a valid large-cog output.
 */
export function setKineticSpeedControllerTarget(dimensionId, location, speed) {
	if (typeof dimensionId !== "string" || !location || !Number.isFinite(speed))
		throw new TypeError("Rotation Speed Controller updates require a dimension, location, and finite target speed");
	const changed = kineticWorld.setSpeedControllerTarget(dimensionId, location, speed);
	if (changed)
		persist();
	return changed;
}

function restore() {
	try {
		const restored = shardedPersistence.read();
		if (restored) {
			restoreKineticRecords(restored.records);
			for (const warning of restored.warnings)
				console.warn(`[Create Bedrock] Ignored invalid kinetic shard ${warning.partition}: ${warning.error}`);
			console.warn("[Create Bedrock] Restored sharded kinetic world state");
			return;
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore sharded kinetic state: ${error}`);
	}

	const value = world.getDynamicProperty(LEGACY_PERSISTENCE_KEY);
	if (typeof value !== "string")
		return;

	try {
		kineticWorld.restore(deserializeVersionedState(value, {
			schemaVersion: PERSISTENCE_SCHEMA_VERSION,
			upgrades: {
				0: legacy => legacy
			}
		}));
		legacyStatePendingMigration = true;
		persist();
		console.warn("[Create Bedrock] Restored kinetic world state");
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid kinetic world state: ${error}`);
	}
}

function waterOffsets(axis, radius) {
	const offsets = [];
	for (const offset of [
		{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
		{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
		{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
	]) {
		if (offset[axis] !== 0)
			continue;
		if (radius === 1) {
			offsets.push(offset);
			continue;
		}
		const outer = { x: offset.x * radius, y: offset.y * radius, z: offset.z * radius };
		offsets.push(outer);
		for (const side of [
			{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
			{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
			{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
		]) {
			if (side[axis] !== 0 || (side.x !== 0 && offset.x !== 0) || (side.y !== 0 && offset.y !== 0) || (side.z !== 0 && offset.z !== 0))
				continue;
			offsets.push({ x: outer.x + side.x, y: outer.y + side.y, z: outer.z + side.z });
		}
	}
	return offsets;
}

function wheelStructureLocations(location, axis) {
	const perpendicular = ["x", "y", "z"].filter(candidate => candidate !== axis);
	const locations = [];
	for (const first of [-1, 0, 1])
		for (const second of [-1, 0, 1]) {
			if (first === 0 && second === 0)
				continue;
			locations.push({
				x: location.x + (perpendicular[0] === "x" ? first : perpendicular[1] === "x" ? second : 0),
				y: location.y + (perpendicular[0] === "y" ? first : perpendicular[1] === "y" ? second : 0),
				z: location.z + (perpendicular[0] === "z" ? first : perpendicular[1] === "z" ? second : 0)
			});
		}
	return locations;
}

function placeLargeWaterWheelStructure(block) {
	if (block?.typeId !== LARGE_WATER_WHEEL_BLOCK)
		return false;
	let changed = false;
	const facing = block.permutation?.getAllStates?.()["minecraft:facing_direction"];
	const axis = facing === 4 || facing === 5 ? "x" : facing === 2 || facing === 3 ? "z" : "y";
	for (const location of wheelStructureLocations(block.location, axis)) {
		const target = block.dimension.getBlock(location);
		if (target?.typeId !== "minecraft:air")
			continue;
		target.setType(WATER_WHEEL_STRUCTURE_BLOCK);
		changed = true;
	}
	return changed;
}

function removeLargeWaterWheelStructure(dimensionId, location, axis) {
	const dimension = world.getDimension(dimensionId);
	let changed = false;
	for (const marker of wheelStructureLocations(location, axis)) {
		const target = dimension.getBlock(marker);
		if (target?.typeId !== WATER_WHEEL_STRUCTURE_BLOCK)
			continue;
		target.setType("minecraft:air");
		changed = true;
	}
	return changed;
}

function refreshWaterWheel(wheel) {
	const dimension = world.getDimension(wheel.dimensionId);
	let hasWater = false;
	for (const offset of waterOffsets(wheel.axis, wheel.waterRadius)) {
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
	const speed = wheel.typeId === "createbedrock:large_water_wheel" ? 4 : 8;
	if (wheel.typeId === LARGE_WATER_WHEEL_BLOCK)
		placeLargeWaterWheelStructure(dimension.getBlock(wheel.location));
	if (kineticWorld.setGeneratedSpeed(wheel.dimensionId, wheel.location, hasWater ? speed : 0))
		persist();
}

function creativeMotorAt(dimensionId, location) {
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		return block?.typeId === CREATIVE_MOTOR_BLOCK ? block : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Rotate a Creative Motor around its six placement directions.
 *
 * Unlike most Create Bedrock blocks, motors use the placement-direction trait.
 * Current Bedrock exposes that trait as named directions while older saves can
 * still present numeric indices, so this intentionally bypasses the generic
 * wrench state enumerator. Re-tracking the node also updates its output shaft
 * axis and all connected kinetic networks immediately.
 */
export function rotateCreativeMotorFacing(block) {
	if (block?.typeId !== CREATIVE_MOTOR_BLOCK || !block.setPermutation)
		return false;
	const directions = ["south", "east", "north", "west", "up", "down"];
	const namesByIndex = ["down", "up", "north", "south", "west", "east"];
	let current;
	try {
		current = block.permutation?.getState?.("minecraft:facing_direction");
	} catch {
		return false;
	}
	const normalized = typeof current === "string" ? current : namesByIndex[creativeMotorFacingIndex(current)];
	const index = directions.indexOf(normalized);
	if (index < 0)
		return false;
	try {
		block.setPermutation(block.permutation.withState("minecraft:facing_direction", directions[(index + 1) % directions.length]));
		const updated = creativeMotorAt(block.dimension.id, block.location);
		if (!updated)
			return false;
		kineticWorld.trackPlacedBlock(updated);
		persist();
		return true;
	} catch (error) {
		console.warn(`[Create Bedrock] Could not rotate Creative Motor: ${error}`);
		return false;
	}
}

function setCreativeMotorSpeed(block, speed) {
	if (block?.typeId !== CREATIVE_MOTOR_BLOCK || !Number.isInteger(speed) || speed === 0)
		return false;
	const changed = kineticWorld.setGeneratedSpeed(block.dimension.id, block.location, speed);
	if (changed)
		persist();
	return changed;
}

function showCreativeMotorExactConfiguration(block, player) {
	if (block?.typeId !== CREATIVE_MOTOR_BLOCK)
		return false;
	const dimensionId = block.dimension.id;
	const location = { ...block.location };
	const openedSpeed = kineticWorld.generatedSpeedAt(dimensionId, location);

	new ModalFormData()
		.title("创造马达：精确设置")
		.label("输入有符号转速：正数为正转，负数为反转；范围 -256..-1 或 1..256 RPM。")
		.textField("转速（RPM）", "例如 -16", { defaultValue: String(openedSpeed) })
		.submitButton("保存")
		.show(player)
		.then(response => {
			if (response.canceled)
				return false;
			const currentBlock = creativeMotorAt(dimensionId, location);
			if (!currentBlock) {
				player.sendMessage?.("创造马达已被移除，未保存转速。");
				return false;
			}
			if (kineticWorld.generatedSpeedAt(dimensionId, location) !== openedSpeed) {
				player.sendMessage?.("创造马达转速已被其他操作修改，请重新打开配置。");
				return false;
			}
			try {
				const speed = parseCreativeMotorSpeed(response.formValues?.[0]);
				if (setCreativeMotorSpeed(currentBlock, speed)) {
					player.sendMessage?.(`创造马达转速已设为 ${speed} RPM。`);
					return true;
				}
				player.sendMessage?.(`创造马达转速未改变（当前为 ${kineticWorld.generatedSpeedAt(dimensionId, location)} RPM）。`);
				return false;
			} catch (error) {
				player.sendMessage?.(`无法保存创造马达转速：${error.message ?? error}`);
				return false;
			}
		})
		.catch(error => player.sendMessage?.(`无法打开创造马达配置：${error.message ?? error}`));
	return true;
}

function showCreativeMotorConfiguration(block, player) {
	if (block?.typeId !== CREATIVE_MOTOR_BLOCK)
		return false;
	const dimensionId = block.dimension.id;
	const location = { ...block.location };
	const speed = kineticWorld.generatedSpeedAt(dimensionId, location);
	const form = new ActionFormData()
		.title("创造马达")
		.body(`当前转速：${speed} RPM\n\n数值正负决定转向；可直接设置正转或反转。`)
		.button("加 1 RPM")
		.button("加 32 RPM")
		.button("减 1 RPM")
		.button("减 32 RPM")
		.button("设为正转")
		.button("设为反转")
		.button("精确输入…");
	form.show(player)
		.then(response => {
			if (response.canceled || !Number.isInteger(response.selection))
				return false;
			const currentBlock = creativeMotorAt(dimensionId, location);
			if (!currentBlock)
				return false;
			if (response.selection === 6)
				return showCreativeMotorExactConfiguration(currentBlock, player);
			const currentSpeed = kineticWorld.generatedSpeedAt(dimensionId, location);
			const next = response.selection === 4
				? Math.max(1, Math.abs(currentSpeed))
				: response.selection === 5
					? -Math.max(1, Math.abs(currentSpeed))
					: nudgeCreativeMotorSpeed(currentSpeed, [1, 32, -1, -32][response.selection]);
			if (setCreativeMotorSpeed(currentBlock, next))
				player.sendMessage?.(`创造马达转速已设为 ${next} RPM。`);
			return true;
		})
		.catch(error => player.sendMessage?.(`无法打开创造马达配置：${error.message ?? error}`));
	return true;
}

function handleCreativeMotorValueBox(event) {
	if (event.itemStack?.typeId !== WRENCH || event.player?.isSneaking || event.block?.typeId !== CREATIVE_MOTOR_BLOCK)
		return false;
	if (!isCreativeMotorValueBox({
		blockFace: event.blockFace,
		faceLocation: event.faceLocation,
		facingDirection: event.block.permutation?.getState?.("minecraft:facing_direction")
	}))
		return false;

	// Bedrock cannot map Java's mouse-wheel editing gesture directly. The same
	// visible value box therefore opens an exact-RPM editor, while normal clicks
	// outside it continue into the standard wrench rotation route.
	event.cancel = true;
	if (event.isFirstEvent === false)
		return true;
	const dimensionId = event.block.dimension.id;
	const location = { ...event.block.location };
	const player = event.player;
	system.run(() => {
		const block = creativeMotorAt(dimensionId, location);
		if (block)
			showCreativeMotorConfiguration(block, player);
	});
	return true;
}

export function registerKinetics() {
	registerKernelTaskGroup("kinetics", KINETIC_DIMENSION_TASK_BUDGET);
	system.run(restore);
	registerCreativeMotorValueBoards(kineticWorld);

	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (kineticWorld.trackPlacedBlock(event.block))
			persist();
		try {
			placeLargeWaterWheelStructure(event.block);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not place large-water-wheel structure: ${error}`);
		}
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		const wasLargeWaterWheel = event.block.typeId === LARGE_WATER_WHEEL_BLOCK;
		const axis = kineticWorld.snapshot().nodes.find(node => node.dimensionId === event.dimension.id
			&& node.location.x === event.block.location.x && node.location.y === event.block.location.y && node.location.z === event.block.location.z)?.axis ?? "y";
		if (kineticWorld.trackBrokenBlock(event.dimension.id, event.block.location))
			persist();
		if (wasLargeWaterWheel) {
			try {
				removeLargeWaterWheelStructure(event.dimension.id, event.block.location, axis);
			} catch (error) {
				console.warn(`[Create Bedrock] Could not remove large-water-wheel structure: ${error}`);
			}
		}
	});

	world.beforeEvents.playerInteractWithBlock.subscribe(event => {
		try {
			handleCreativeMotorValueBox(event);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not route Creative Motor value-box interaction: ${error}`);
		}
	});

	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId === CLUTCH_BLOCK) {
		event.player.sendMessage("This clutch is controlled by redstone power.");
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
		if (!event.itemStack && cycleSequencedGearshiftProgram(event.block))
			event.player.sendMessage("Sequenced gearshift program changed. Apply a redstone pulse to start it.");
	});

	registerTickHandler(() => {
		waterWheelTicks++;
		if (waterWheelTicks >= WATER_WHEEL_CHECK_INTERVAL) {
			waterWheelTicks = 0;
			for (const wheel of kineticWorld.getWaterDrivenSourceNodes()) {
				const key = `water-wheel:${wheel.dimensionId}:${wheel.location.x}:${wheel.location.y}:${wheel.location.z}`;
				enqueueUniqueKernelTask(key, () => refreshWaterWheel(wheel), "kinetics");
			}
		}
		for (const dimensionId of kineticWorld.advanceTick())
			enqueueUniqueKernelTask(`kinetics:${dimensionId}`, () => kineticWorld.resolveDirtyDimension(dimensionId), "kinetics");
		if (kineticWorld.consumePersistenceDirty())
			persist();
		persistence.tick();
		shardedPersistence.tick();
	});
}

export function getKineticWorldForTesting() {
	return kineticWorld;
}

export function getKineticSpeedAt(dimensionId, location) {
	return kineticWorld.speedAt(dimensionId, location);
}

export function getKineticNetworkAt(dimensionId, location) {
	return kineticWorld.networkAt(dimensionId, location);
}

export function getKineticDiagnostics() {
	return {
		...kineticWorld.diagnostics(),
		persistence: {
			deferred: persistence.diagnostics(),
			sharded: shardedPersistence.diagnostics()
		}
	};
}
