import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import { CREATE_EFFECTS, emitCreateEffect, playCreateSound } from "../effects/effects-runtime.js";
import { getKineticNetworkAt, getKineticSpeedAt } from "../kinetics/kinetic-runtime.js";
import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { POTATO_PROJECTILE_PROFILES } from "../materials/potato-projectile.js";
import { activePotatoProjectileReceipts, spawnPotatoProjectile } from "../materials/potato-projectile-runtime.js";
import {
	armPotatoCannon,
	backtankCapacity,
	BACKTANK_ITEMS,
	consumeBacktankAir,
	createBacktankState,
	createPotatoCannonState,
	readBacktankState,
	readPotatoCannonState,
	refillBacktank
} from "./equipment-state.js";
import { applyEquipmentUpgrade, upgradeKindForItem } from "./equipment-upgrade-state.js";
import { queryGogglesDiagnostics, registerGogglesDiagnosticAdapter } from "./goggles-diagnostics-registry.js";
import { beginPotatoCannonShot, escrowPotatoCannonAmmo, markPotatoCannonProjectileSpawned, reconcilePotatoCannonJournal, settlePotatoCannonShot } from "./potato-cannon-journal.js";
import { bindToolboxSlot, createToolboxBindings, readToolboxBindings, reconcileToolboxBindings } from "./toolbox-bindings.js";
import { createToolboxState, extractToolboxStack, insertToolboxStack, readToolboxState, TOOLBOX_COMPARTMENTS } from "./toolbox-state.js";
import { invokeWrenchHandler, registerWrenchHandler } from "./wrench-handler-registry.js";

const BACKTANK_ITEM_PROPERTY = "createbedrock:backtank_v2";
const BACKTANK_ITEM_PROPERTY_LEGACY = "createbedrock:backtank_v1";
const CANNON_ITEM_PROPERTY = "createbedrock:potato_cannon_v2";
const CANNON_ITEM_PROPERTY_LEGACY = "createbedrock:potato_cannon_v1";
const EQUIPMENT_TASK_BUDGET = 24;
const EQUIPMENT_TASK_GROUP = "equipment";
const EXTENDO_GRIP = "createbedrock:extendo_grip";
const GOGGLES = "createbedrock:goggles";
const POTATO_CANNON = "createbedrock:potato_cannon";
const TOOLBOX_ITEM_LORE_PREFIX = "createbedrock:toolbox:v1:";
const TOOLBOX_ITEM_LORE_CHUNK = 180;
const TOOLBOX_RANGE = 10;
const TOOLBOX_BINDINGS_PROPERTY = "createbedrock:toolbox_bindings_v2";
const TOOLBOX_COLORS = Object.freeze([
	"white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
	"light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"
]);
const BACKTANK_BLOCKS = new Map([
	["createbedrock:copper_backtank", "createbedrock:copper_backtank"],
	["createbedrock:netherite_backtank", "createbedrock:netherite_backtank"]
]);
const DIVING_HELMETS = new Set(["createbedrock:copper_diving_helmet", "createbedrock:netherite_diving_helmet"]);
const DIVING_BOOTS = new Set(["createbedrock:copper_diving_boots", "createbedrock:netherite_diving_boots"]);
const TOOLBOX_BLOCKS = new Map(TOOLBOX_COLORS.map(color => [`createbedrock:${color}_toolbox`, color]));

const backtanks = new Map();
const toolboxes = new Map();
const attachedToolboxes = new Map();
const pendingPlacementBlocks = new Map();
const pendingPlacementItems = new Map();
let equipmentTicks = 0;
let failedUpdates = 0;
let gogglesQueries = 0;
let registered = false;
let stationaryBacktankRefills = 0;
let toolboxTransfers = 0;

const WRENCH_SAFE_REMOVALS = new Set([
	"createbedrock:andesite_casing", "createbedrock:brass_casing", "createbedrock:cogwheel", "createbedrock:copper_casing",
	"createbedrock:encased_chain_drive", "createbedrock:gearbox", "createbedrock:large_cogwheel", "createbedrock:metal_bracket",
	"createbedrock:shaft", "createbedrock:vertical_gearbox", "createbedrock:wooden_bracket"
]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function locationKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
}

function sectionKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)},${Math.floor(location.y / 16)},${Math.floor(location.z / 16)}`;
}

function isBacktankItem(item) {
	return BACKTANK_ITEMS.has(item?.typeId);
}

function isToolboxBlock(block) {
	return TOOLBOX_BLOCKS.has(block?.typeId);
}

function isBacktankBlock(block) {
	return BACKTANK_BLOCKS.has(block?.typeId);
}

function isWater(typeId) {
	return typeId === "minecraft:water" || typeId === "minecraft:flowing_water";
}

function isLava(typeId) {
	return typeId === "minecraft:lava" || typeId === "minecraft:flowing_lava";
}

function headBlock(player) {
	try {
		const location = player.getHeadLocation?.() ?? { x: player.location.x, y: player.location.y + 1.5, z: player.location.z };
		return player.dimension.getBlock({ x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) });
	} catch {
		return undefined;
	}
}

function equipmentSlot(player, slot) {
	const equippable = player?.getComponent?.("minecraft:equippable");
	if (typeof equippable?.getEquipment !== "function" || typeof equippable?.setEquipment !== "function")
		return undefined;
	return {
		getItem() { return equippable.getEquipment(slot); },
		setItem(item) { return equippable.setEquipment(slot, item); }
	};
}

function selectedSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const index = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(index) || index < 0 || index >= container.size)
		return undefined;
	return {
		getItem() { return container.getItem(index); },
		index,
		setItem(item) { container.setItem(index, item); }
	};
}

function inventory(player) {
	return player?.getComponent?.("minecraft:inventory")?.container;
}

function readPlayerBindings(player) {
	try {
		const value = player?.getDynamicProperty?.(TOOLBOX_BINDINGS_PROPERTY);
		return readToolboxBindings(typeof value === "string" ? JSON.parse(value) : undefined);
	} catch {
		return createToolboxBindings();
	}
}

function writePlayerBindings(player, state) {
	try {
		player.setDynamicProperty?.(TOOLBOX_BINDINGS_PROPERTY, JSON.stringify(readToolboxBindings(state)));
		return true;
	} catch {
		return false;
	}
}

function readJsonProperty(item, property, fallback) {
	try {
		const value = item?.getDynamicProperty?.(property);
		return typeof value === "string" ? JSON.parse(value) : fallback;
	} catch {
		return fallback;
	}
}

function writeJsonProperty(item, property, state) {
	if (!item?.setDynamicProperty)
		return false;
	try {
		item.setDynamicProperty(property, JSON.stringify(state));
		return true;
	} catch {
		return false;
	}
}

function readItemBacktank(item) {
	if (!isBacktankItem(item))
		return undefined;
	try {
		return readBacktankState(readJsonProperty(item, BACKTANK_ITEM_PROPERTY, readJsonProperty(item, BACKTANK_ITEM_PROPERTY_LEGACY, { itemType: item.typeId })));
	} catch {
		return createBacktankState({ itemType: item.typeId });
	}
}

function writeItemBacktank(holder, state) {
	const current = holder?.getItem?.();
	if (!isBacktankItem(current))
		return false;
	const next = current.clone?.() ?? current;
	if (!writeJsonProperty(next, BACKTANK_ITEM_PROPERTY, state))
		return false;
	holder.setItem(next);
	return true;
}

function chestBacktank(player) {
	const holder = equipmentSlot(player, EquipmentSlot.Chest);
	const item = holder?.getItem();
	return isBacktankItem(item) ? { holder, item, state: readItemBacktank(item) } : undefined;
}

function consumeChestAir(player, amount = 1) {
	const backtank = chestBacktank(player);
	if (!backtank)
		return false;
	const result = consumeBacktankAir(backtank.state, amount);
	return result.consumed && writeItemBacktank(backtank.holder, result.state);
}

function logicalStack(item) {
	if (!item?.typeId || !Number.isInteger(item.amount) || item.amount < 1)
		return undefined;
	return { count: item.amount, typeId: item.typeId };
}

function physicalStack(stack) {
	if (!stack?.typeId || !Number.isInteger(stack.count) || stack.count < 1)
		return undefined;
	return new ItemStack(stack.typeId, stack.count);
}

function toolboxLore(state) {
	const encoded = encodeURIComponent(JSON.stringify({ ...state, host: { kind: "item" } }));
	const lines = [TOOLBOX_ITEM_LORE_PREFIX];
	for (let offset = 0; offset < encoded.length; offset += TOOLBOX_ITEM_LORE_CHUNK)
		lines.push(encoded.slice(offset, offset + TOOLBOX_ITEM_LORE_CHUNK));
	return lines;
}

function readToolboxItem(item, color) {
	try {
		const lore = item?.getLore?.() ?? [];
		if (lore[0] !== TOOLBOX_ITEM_LORE_PREFIX)
			return createToolboxState({ color, host: { kind: "item" }, toolboxId: `item:${color}:new` });
		return readToolboxState(JSON.parse(decodeURIComponent(lore.slice(1).join(""))));
	} catch {
		return createToolboxState({ color, host: { kind: "item" }, toolboxId: `item:${color}:recovered` });
	}
}

function writeToolboxItem(item, state) {
	const next = item?.clone?.() ?? item;
	if (!next?.setLore)
		return undefined;
	try {
		next.setLore(toolboxLore(state));
		return next;
	} catch {
		return undefined;
	}
}

function makeToolboxId(dimensionId, location) {
	return `block:${locationKey(dimensionId, location)}`;
}

function blockToolboxRecord(block) {
	const key = locationKey(block.dimension.id, block.location);
	const existing = toolboxes.get(key);
	if (existing)
		return existing;
	const color = TOOLBOX_BLOCKS.get(block.typeId);
	const state = createToolboxState({
		color,
		host: { dimensionId: block.dimension.id, kind: "block", location: { ...block.location } },
		toolboxId: makeToolboxId(block.dimension.id, block.location)
	});
	toolboxes.set(key, state);
	return state;
}

function saveToolbox(block, state) {
	toolboxes.set(locationKey(block.dimension.id, block.location), readToolboxState(state));
}

function giveItem(player, item) {
	const container = inventory(player);
	if (!container || !item)
		return false;
	const remainder = container.addItem(item);
	if (remainder)
		player.dimension.spawnItem(remainder, player.location);
	return true;
}

function removeOne(holder) {
	const item = holder?.getItem?.();
	if (!item || item.amount < 1)
		return false;
	if (item.amount === 1) {
		holder.setItem(undefined);
		return true;
	}
	const next = item.clone();
	next.amount--;
	holder.setItem(next);
	return true;
}

function addLogicalStack(player, stack) {
	if (!stack?.typeId || !Number.isInteger(stack.count) || stack.count < 1)
		return false;
	// ItemStack clamps to an item's native maximum (for example, 16 for some
	// utility items). Split logical Toolbox output before handing it to Bedrock
	// so a 64-count compartment extraction never silently loses the excess.
	let remaining = stack.count;
	while (remaining > 0) {
		const item = new ItemStack(stack.typeId, Math.min(remaining, 64));
		const emitted = item.amount;
		if (!giveItem(player, item))
			return false;
		remaining -= emitted;
	}
	return true;
}

function findCannonAmmo(player) {
	const container = inventory(player);
	if (!container)
		return undefined;
	for (let index = 0; index < container.size; index++) {
		if (index === player.selectedSlotIndex)
			continue;
		const item = container.getItem(index);
		if (!item || !Object.hasOwn(POTATO_PROJECTILE_PROFILES, item.typeId))
			continue;
		return {
			holder: { getItem() { return container.getItem(index); }, setItem(value) { container.setItem(index, value); } },
			itemTypeId: item.typeId
		};
	}
	return undefined;
}

function damageCannon(holder) {
	const current = holder?.getItem?.();
	const next = current?.clone?.();
	const durability = next?.getComponent?.("minecraft:durability");
	if (!next || !durability)
		return false;
	if (durability.damage + 1 >= durability.maxDurability)
		holder.setItem(undefined);
	else {
		durability.damage++;
		holder.setItem(next);
	}
	return true;
}

function cannonState(holder) {
	const item = holder?.getItem?.();
	if (item?.typeId !== POTATO_CANNON)
		return undefined;
	try { return readPotatoCannonState(readJsonProperty(item, CANNON_ITEM_PROPERTY, readJsonProperty(item, CANNON_ITEM_PROPERTY_LEGACY, undefined))); } catch { return createPotatoCannonState(); }
}

function writeCannonState(holder, state) {
	const current = holder?.getItem?.();
	const next = current?.clone?.();
	if (!next || !writeJsonProperty(next, CANNON_ITEM_PROPERTY, state))
		return false;
	holder.setItem(next);
	return true;
}

function firePotatoCannon(player) {
	const holder = selectedSlot(player);
	if (holder?.getItem()?.typeId !== POTATO_CANNON)
		return false;
	let current = cannonState(holder);
	const recovery = reconcilePotatoCannonJournal(current, activePotatoProjectileReceipts());
	if (recovery.action === "wait")
		return false;
	if (recovery.action === "refund")
		giveItem(player, new ItemStack(recovery.ammoTypeId, 1));
	if (recovery.action !== "none") {
		current = recovery.state;
		if (!writeCannonState(holder, current))
			return false;
	}
	const armed = armPotatoCannon(current, { cooldownTicks: 12, now: system.currentTick ?? equipmentTicks });
	if (!armed.fired)
		return false;
	const ammo = findCannonAmmo(player);
	if (!ammo)
		return false;
	const direction = player.getViewDirection?.();
	if (!direction)
		return false;
	const shotId = `${player.id}:${system.currentTick ?? equipmentTicks}:${armed.state.revision}`;
	const begun = beginPotatoCannonShot(armed.state, { ammoTypeId: ammo.itemTypeId, ownerId: player.id, recoveryRoll: Math.random(), shotId });
	if (!begun.begun || !writeCannonState(holder, begun.state))
		return false;
	if (!removeOne(ammo.holder)) {
		writeCannonState(holder, settlePotatoCannonShot(begun.state, shotId).state);
		return false;
	}
	const escrowed = escrowPotatoCannonAmmo(cannonState(holder));
	if (!escrowed.advanced || !writeCannonState(holder, escrowed.state)) {
		giveItem(player, new ItemStack(ammo.itemTypeId, 1));
		return false;
	}
	if (!consumeChestAir(player, 1) && !damageCannon(holder)) {
		giveItem(player, new ItemStack(ammo.itemTypeId, 1));
		writeCannonState(holder, settlePotatoCannonShot(cannonState(holder), shotId).state);
		return false;
	}
	spawnPotatoProjectile({
		dimension: player.dimension,
		direction,
		itemTypeId: ammo.itemTypeId,
		location: { x: player.location.x, y: player.location.y + 1.5, z: player.location.z },
		ownerId: player.id,
		receiptId: shotId,
		recover: begun.state.journal.recover
	});
	emitCreateEffect(player.dimension, CREATE_EFFECTS.air, { x: player.location.x, y: player.location.y + 1.5, z: player.location.z });
	playCreateSound(player.dimension, "createbedrock:potato_hit", player.location, { pitch: 1.2, volume: .7 });
	const spawned = markPotatoCannonProjectileSpawned(cannonState(holder));
	if (spawned.advanced)
		writeCannonState(holder, settlePotatoCannonShot(spawned.state, shotId).state);
	return true;
}

function applyHeldUpgrade(player, itemStack) {
	const kind = upgradeKindForItem(itemStack?.typeId);
	if (!kind)
		return false;
	const upgradeHolder = selectedSlot(player);
	let target;
	if (kind === "capacity") {
		target = chestBacktank(player);
		if (!target)
			return false;
	} else {
		const holder = equipmentSlot(player, EquipmentSlot.Offhand);
		const item = holder?.getItem?.();
		if (item?.typeId !== POTATO_CANNON)
			return false;
		target = { holder, item, state: cannonState(holder) };
	}
	const receiptId = `upgrade:${player.id}:${system.currentTick ?? equipmentTicks}:${kind}`;
	const result = applyEquipmentUpgrade(target.state, { expectedRevision: target.state.revision, kind, receiptId, targetTypeId: target.item.typeId });
	if (!result.applied)
		return false;
	const written = kind === "capacity"
		? writeItemBacktank(target.holder, createBacktankState(result.state))
		: writeCannonState(target.holder, createPotatoCannonState(result.state));
	if (!written)
		return false;
	if (!removeOne(upgradeHolder)) {
		if (kind === "capacity")
			writeItemBacktank(target.holder, target.state);
		else
			writeCannonState(target.holder, target.state);
		return false;
	}
	player.sendMessage?.(`§aCreate§r ${kind === "capacity" ? "Capacity" : "Potato Recovery"} ${result.state.upgrades[kind]}/3 applied.`);
	emitCreateEffect(player.dimension, CREATE_EFFECTS.rotationIndicator, player.location);
	playCreateSound(player.dimension, "createbedrock:confirm", player.location, { volume: .8 });
	return true;
}

function rotateBlock(block) {
	if (!block?.permutation?.getAllStates || !block.setPermutation)
		return false;
	const state = block.permutation.getAllStates();
	const cycles = [
		["minecraft:cardinal_direction", ["north", "east", "south", "west"]],
		["minecraft:facing_direction", [2, 5, 3, 4]],
		["createbedrock:axis", ["x", "z", "y"]]
	];
	for (const [name, values] of cycles) {
		if (!Object.hasOwn(state, name))
			continue;
		const current = values.indexOf(state[name]);
		if (current < 0)
			continue;
		try {
			block.setPermutation(block.permutation.withState(name, values[(current + 1) % values.length]));
			return true;
		} catch {
			return false;
		}
	}
	return false;
}

function safeWrenchRemoval(block) {
	return WRENCH_SAFE_REMOVALS.has(block?.typeId);
}

function registerEquipmentAdapters() {
	const domains = Object.freeze({
		contraptions: ["bearing", "chassis", "contraption", "gantry", "piston", "pulley", "sticker"],
		fluids: ["drain", "fluid", "hose", "pipe", "pump", "tank", "valve"],
		logistics: ["belt", "depot", "funnel", "link", "package", "requester", "tunnel", "vault"],
		processing: ["basin", "crafter", "crushing", "deploy", "millstone", "mixer", "press", "saw"],
		redstone: ["analog", "contact", "diode", "lever", "nixie", "redstone", "rose_quartz"],
		trains: ["bogey", "schedule", "signal", "station", "track", "train"],
		kinetics: []
	});
	const domainFor = typeId => Object.entries(domains).find(([domain, tokens]) => domain !== "kinetics" && tokens.some(token => typeId.includes(token)))?.[0] ?? "kinetics";
	for (const domain of ["contraptions", "fluids", "logistics", "processing", "redstone", "trains", "kinetics"])
		registerGogglesDiagnosticAdapter({
			id: domain,
			supports: ({ block }) => block?.typeId?.startsWith("createbedrock:") && domainFor(block.typeId) === domain,
			inspect: ({ block }) => {
				const network = getKineticNetworkAt(block.dimension.id, block.location);
				const speed = getKineticSpeedAt(block.dimension.id, block.location) ?? 0;
				return { title: `${domain}: ${block.typeId}`, lines: [`Speed: ${Math.round(speed * 100) / 100} rpm`, `Stress: ${network?.stressImpact ?? 0}/${network?.stressCapacity ?? 0}`], revision: network?.revision ?? 0 };
			}
		});
	registerWrenchHandler({
		actions: ["rotate"],
		id: "createbedrock:rotation",
		supports: ({ block }) => block?.typeId?.startsWith("createbedrock:") && !isBacktankBlock(block) && !isToolboxBlock(block),
		invoke: ({ block }) => ({ handled: rotateBlock(block), reason: "no_rotatable_state" })
	});
	registerWrenchHandler({
		actions: ["remove"],
		id: "createbedrock:safe_removal",
		supports: ({ block }) => safeWrenchRemoval(block),
		invoke: ({ block, player }) => {
			const typeId = block.typeId;
			try {
				block.setType("minecraft:air");
				giveItem(player, new ItemStack(typeId, 1));
				return { handled: true };
			} catch {
				return { handled: false, reason: "domain_rejected" };
			}
		}
	});
}

function wrenchBlock(player, block) {
	return invokeWrenchHandler({ block, player, typeId: block?.typeId }, player.isSneaking ? "remove" : "rotate").handled;
}

function extendoRange(player) {
	const offhand = equipmentSlot(player, EquipmentSlot.Offhand)?.getItem()?.typeId === EXTENDO_GRIP;
	return offhand ? 10 : 8;
}

function useExtendo(player) {
	const holder = selectedSlot(player);
	if (holder?.getItem()?.typeId !== EXTENDO_GRIP)
		return false;
	const target = player.getBlockFromViewDirection?.({ maxDistance: extendoRange(player) })?.block;
	if (!target)
		return false;
	const nativeTarget = player.getBlockFromViewDirection?.({ maxDistance: 5 })?.block;
	if (nativeTarget && locationKey(nativeTarget.dimension.id, nativeTarget.location) === locationKey(target.dimension.id, target.location))
		return false;
	const backtank = chestBacktank(player);
	const durability = holder.getItem()?.getComponent?.("minecraft:durability");
	if (!backtank?.state?.air && (!durability || durability.damage + 1 >= durability.maxDurability))
		return false;
	if (!wrenchBlock(player, target))
		return false;
	if (!consumeChestAir(player, 1))
		damageCannon(holder);
	return true;
}

function gogglesMessage(player) {
	const target = player.getBlockFromViewDirection?.({ maxDistance: 12 })?.block;
	if (!target)
		return false;
	const snapshot = queryGogglesDiagnostics({ block: target, player });
	if (!snapshot)
		return false;
	const air = chestBacktank(player)?.state;
	player.sendMessage?.(`§bCreate§r ${snapshot.title}\n${snapshot.lines.join("\n")}${air ? `\nAir: ${air.air}/${backtankCapacity(air.capacityLevel)}` : ""}`);
	gogglesQueries++;
	return true;
}

function playerHasGoggles(player) {
	return equipmentSlot(player, EquipmentSlot.Head)?.getItem()?.typeId === GOGGLES;
}

function tickDivingEquipment(player) {
	const head = equipmentSlot(player, EquipmentSlot.Head)?.getItem();
	const feet = equipmentSlot(player, EquipmentSlot.Feet)?.getItem();
	if (!DIVING_HELMETS.has(head?.typeId) && !DIVING_BOOTS.has(feet?.typeId))
		return;
	const block = headBlock(player);
	const submerged = isWater(block?.typeId);
	const lava = isLava(block?.typeId);
	if (DIVING_HELMETS.has(head?.typeId) && submerged && equipmentTicks % 20 === 0 && consumeChestAir(player, 1))
		player.addEffect?.("water_breathing", 40, { amplifier: 0, showParticles: false });
	if (DIVING_BOOTS.has(feet?.typeId) && submerged && player.isSneaking)
		player.applyImpulse?.({ x: 0, y: -.025, z: 0 });
	const chest = chestBacktank(player)?.item?.typeId;
	const legs = equipmentSlot(player, EquipmentSlot.Legs)?.getItem()?.typeId;
	const fullNetherite = head?.typeId === "createbedrock:netherite_diving_helmet"
		&& feet?.typeId === "createbedrock:netherite_diving_boots"
		&& chest === "createbedrock:netherite_backtank"
		&& legs === "minecraft:netherite_leggings";
	if (lava && fullNetherite && equipmentTicks % 20 === 0 && consumeChestAir(player, 1)) {
		player.addEffect?.("fire_resistance", 40, { amplifier: 0, showParticles: false });
		player.addEffect?.("night_vision", 40, { amplifier: 0, showParticles: false });
	}
}

function stationaryBacktank(block) {
	const key = locationKey(block.dimension.id, block.location);
	const existing = backtanks.get(key);
	if (existing)
		return existing;
	const state = createBacktankState({ itemType: BACKTANK_BLOCKS.get(block.typeId) });
	const record = { dimensionId: block.dimension.id, location: { ...block.location }, state, ticksUntilRefill: 0 };
	backtanks.set(key, record);
	return record;
}

function tickStationaryBacktank(record) {
	let block;
	try { block = world.getDimension(record.dimensionId).getBlock(record.location); } catch { return false; }
	if (!isBacktankBlock(block)) {
		backtanks.delete(locationKey(record.dimensionId, record.location));
		return true;
	}
	if (record.ticksUntilRefill > 0) {
		record.ticksUntilRefill--;
		return false;
	}
	const result = refillBacktank(record.state, { speed: getKineticSpeedAt(record.dimensionId, record.location) ?? 0, waterlogged: isWater(block.typeId) });
	record.ticksUntilRefill = result.ticksUntilNextFill;
	if (!result.changed)
		return false;
	record.state = result.state;
	stationaryBacktankRefills++;
	return true;
}

function toolboxDistance(player, state) {
	const location = state.host?.location;
	if (!location || state.host.dimensionId !== player.dimension.id)
		return Infinity;
	return Math.hypot(player.location.x - location.x, player.location.y - location.y, player.location.z - location.z);
}

function depositSelectedIntoToolbox(player, block, state) {
	const holder = selectedSlot(player);
	const item = holder?.getItem?.();
	const stack = logicalStack(item);
	if (!stack)
		return false;
	for (let index = 0; index < TOOLBOX_COMPARTMENTS; index++) {
		const result = insertToolboxStack(state, index, stack, `deposit:${player.id}:${equipmentTicks}:${index}`);
		if (!result.accepted)
			continue;
		const remaining = result.remainder?.count ?? 0;
		if (remaining === 0)
			holder.setItem(undefined);
		else {
			const next = item.clone();
			next.amount = remaining;
			holder.setItem(next);
		}
		saveToolbox(block, result.state);
		toolboxTransfers++;
		return true;
	}
	return false;
}

function withdrawToolboxCompartment(player, block, state, index) {
	const result = extractToolboxStack(state, index, { maxCount: 64, receiptId: `withdraw:${player.id}:${equipmentTicks}:${index}` });
	if (!result.extracted)
		return false;
	if (!addLogicalStack(player, result.extracted))
		return false;
	saveToolbox(block, result.state);
	toolboxTransfers++;
	return true;
}

function showToolbox(player, block, state) {
	const form = new ActionFormData().title(`${state.color} Toolbox`).body("Sneak-interact deposits the selected stack. Select a compartment to withdraw it.");
	for (let index = 0; index < TOOLBOX_COMPARTMENTS; index++) {
		const compartment = state.compartments[index];
		const count = compartment.slots.reduce((total, stack) => total + (stack?.count ?? 0), 0);
		form.button(`${index + 1}. ${compartment.filter?.typeId ?? "Empty"} (${count})`);
	}
	form.show(player).then(response => {
		if (response.canceled || !Number.isInteger(response.selection))
			return;
		try { withdrawToolboxCompartment(player, block, blockToolboxRecord(block), response.selection); } catch { failedUpdates++; }
	});
}

function attachToolbox(player, block, state) {
	if (toolboxDistance(player, state) > TOOLBOX_RANGE)
		return false;
	const hotbarSlot = player.selectedSlotIndex;
	if (!Number.isInteger(hotbarSlot) || hotbarSlot < 0 || hotbarSlot > 8)
		return false;
	const itemTypeId = selectedSlot(player)?.getItem?.()?.typeId;
	const compartment = Math.max(0, state.compartments.findIndex(candidate => !itemTypeId || candidate.filter?.typeId === itemTypeId));
	const bindings = readPlayerBindings(player);
	const result = bindToolboxSlot(bindings, { compartment, hotbarSlot, revision: state.revision, toolboxId: state.toolboxId }, bindings.revision);
	if (!result.bound || !writePlayerBindings(player, result.state))
		return false;
	attachedToolboxes.set(player.id, locationKey(block.dimension.id, block.location));
	player.sendMessage?.(`Toolbox compartment ${compartment + 1} attached to hotbar slot ${hotbarSlot + 1}.`);
	return true;
}

function refillFromAttachedToolbox(player) {
	let bindings = readPlayerBindings(player);
	const toolboxFor = binding => [...toolboxes.values()].find(state => state.toolboxId === binding.toolboxId);
	bindings = reconcileToolboxBindings(bindings, binding => {
		const state = toolboxFor(binding);
		return state && toolboxDistance(player, state) <= TOOLBOX_RANGE && binding.compartment < state.compartments.length;
	});
	writePlayerBindings(player, bindings);
	const container = inventory(player);
	if (!container)
		return false;
	for (const binding of bindings.bindings) {
		const state = toolboxFor(binding);
		const item = container.getItem(binding.hotbarSlot);
		const filter = state?.compartments[binding.compartment]?.filter;
		if (!state || !filter || (item && (item.typeId !== filter.typeId || item.amount >= item.maxAmount)))
			continue;
		if (binding.revision !== state.revision) {
			const refreshed = bindToolboxSlot(bindings, { ...binding, revision: state.revision }, bindings.revision);
			if (refreshed.bound) {
				bindings = refreshed.state;
				writePlayerBindings(player, bindings);
			}
			continue;
		}
		const maxCount = item ? item.maxAmount - item.amount : 64;
		const result = extractToolboxStack(state, binding.compartment, { maxCount, receiptId: `refill:${player.id}:${equipmentTicks}:${binding.hotbarSlot}` });
		if (!result.extracted)
			continue;
		const next = item?.clone?.() ?? new ItemStack(result.extracted.typeId, result.extracted.count);
		if (item)
			next.amount += result.extracted.count;
		container.setItem(binding.hotbarSlot, next);
		toolboxes.set(locationKey(result.state.host.dimensionId, result.state.host.location), result.state);
		const updated = bindToolboxSlot(bindings, { ...binding, revision: result.state.revision }, bindings.revision);
		if (updated.bound) {
			bindings = updated.state;
			writePlayerBindings(player, bindings);
		}
		toolboxTransfers++;
		return true;
	}
	return false;
}

function serializeRecords() {
	return [
		...[...backtanks.values()].map(record => ({ kind: "backtank", ...record })),
		...[...toolboxes.values()].map(state => ({ kind: "toolbox", state }))
	];
}

function restoreRecords(records) {
	for (const record of records) {
		try {
			if (record?.kind === "backtank" && typeof record.dimensionId === "string" && record.location)
				backtanks.set(locationKey(record.dimensionId, record.location), {
					dimensionId: record.dimensionId,
					location: record.location,
					state: readBacktankState(record.state),
					ticksUntilRefill: Number.isInteger(record.ticksUntilRefill) ? Math.max(0, record.ticksUntilRefill) : 0
				});
			if (record?.kind === "toolbox") {
				const state = readToolboxState(record.state);
				if (state.host.kind === "block")
					toolboxes.set(locationKey(state.host.dimensionId, state.host.location), state);
			}
		} catch {
			failedUpdates++;
		}
	}
}

const persistence = new ShardedStateStore({
	keyPrefix: "createbedrock:equipment_v1",
	onError(error) { console.warn(`[Create Bedrock] Could not persist equipment state: ${error}`); },
	partitionFor(record) {
		if (record?.kind === "backtank")
			return sectionKey(record.dimensionId, record.location);
		if (record?.kind === "toolbox")
			return sectionKey(record.state.host.dimensionId, record.state.host.location);
		throw new TypeError("Unknown equipment persistent record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persist() {
	persistence.request(serializeRecords());
}

function handleBacktankPlacement(block, item) {
	if (!isBacktankBlock(block))
		return false;
	const record = stationaryBacktank(block);
	const carried = readItemBacktank(item);
	if (carried && carried.itemType === BACKTANK_BLOCKS.get(block.typeId))
		record.state = carried;
	persist();
	return true;
}

function placementTargetFor(item) {
	if (item?.typeId === "createbedrock:copper_backtank")
		return "createbedrock:copper_backtank";
	if (item?.typeId === "createbedrock:netherite_backtank")
		return "createbedrock:netherite_backtank";
	if (item?.typeId === "createbedrock:copper_backtank_placeable")
		return "createbedrock:copper_backtank";
	if (item?.typeId === "createbedrock:netherite_backtank_placeable")
		return "createbedrock:netherite_backtank";
	return TOOLBOX_BLOCKS.has(item?.typeId) ? item.typeId : undefined;
}

function resolvePendingPlacement(playerId) {
	const placed = pendingPlacementBlocks.get(playerId);
	const item = pendingPlacementItems.get(playerId);
	if (!placed || !item || placementTargetFor(item.itemStack) !== placed.block.typeId)
		return false;
	pendingPlacementBlocks.delete(playerId);
	pendingPlacementItems.delete(playerId);
	try {
		if (isBacktankBlock(placed.block))
			handleBacktankPlacement(placed.block, item.itemStack);
		else if (isToolboxBlock(placed.block)) {
			const color = TOOLBOX_BLOCKS.get(placed.block.typeId);
			const state = readToolboxItem(item.itemStack, color);
			state.host = { dimensionId: placed.block.dimension.id, kind: "block", location: { ...placed.block.location } };
			state.toolboxId = makeToolboxId(placed.block.dimension.id, placed.block.location);
			toolboxes.set(locationKey(placed.block.dimension.id, placed.block.location), readToolboxState(state));
			persist();
		}
		return true;
	} catch {
		failedUpdates++;
		return false;
	}
}

function rememberPlacedBlock(player, block) {
	if (!isBacktankBlock(block) && !isToolboxBlock(block))
		return false;
	pendingPlacementBlocks.set(player.id, { block, tick: equipmentTicks });
	// The stable PlayerPlaceBlockAfterEvent intentionally exposes no item
	// stack. Pair it with ItemUseOnAfterEvent, which carries the exact pre-use
	// stack, in either delivery order; stale unmatched blocks become defaults.
	if (!resolvePendingPlacement(player.id)) {
		if (isBacktankBlock(block))
			stationaryBacktank(block);
		else
			blockToolboxRecord(block);
		persist();
	}
	return true;
}

function rememberPlacementItem(player, itemStack) {
	if (!placementTargetFor(itemStack))
		return false;
	pendingPlacementItems.set(player.id, { itemStack: itemStack.clone?.() ?? itemStack, tick: equipmentTicks });
	return resolvePendingPlacement(player.id);
}

function pickupBacktank(player, block) {
	const record = stationaryBacktank(block);
	const item = new ItemStack(record.state.itemType, 1);
	if (!writeJsonProperty(item, BACKTANK_ITEM_PROPERTY, record.state))
		return false;
	block.setType("minecraft:air");
	backtanks.delete(locationKey(block.dimension.id, block.location));
	giveItem(player, item);
	persist();
	return true;
}

function pickupToolbox(player, block) {
	const state = blockToolboxRecord(block);
	const item = writeToolboxItem(new ItemStack(block.typeId, 1), state);
	if (!item)
		return false;
	block.setType("minecraft:air");
	toolboxes.delete(locationKey(block.dimension.id, block.location));
	giveItem(player, item);
	persist();
	return true;
}

export function getEquipmentDiagnostics() {
	return {
		attachedToolboxes: attachedToolboxes.size,
		backtanks: backtanks.size,
		failedUpdates,
		gogglesQueries,
		persistence: persistence.diagnostics(),
		stationaryBacktankRefills,
		toolboxes: toolboxes.size,
		toolboxTransfers
	};
}

export function registerEquipment() {
	if (registered)
		return false;
	registered = true;
	registerEquipmentAdapters();
	registerKernelTaskGroup(EQUIPMENT_TASK_GROUP, EQUIPMENT_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			rememberPlacedBlock(event.player, event.block);
		} catch { failedUpdates++; }
	});
	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (!isBacktankBlock(event.block) && !isToolboxBlock(event.block))
			return;
		event.cancel = true;
		const player = event.player;
		const block = event.block;
		system.run(() => {
			try {
				if (isBacktankBlock(block))
					pickupBacktank(player, block);
				else if (isToolboxBlock(block))
					pickupToolbox(player, block);
			} catch { failedUpdates++; }
		});
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		try {
			if (isBacktankBlock(event.block) && !event.itemStack) {
				pickupBacktank(event.player, event.block);
				return;
			}
			if (!isToolboxBlock(event.block))
				return;
			const state = blockToolboxRecord(event.block);
			if (event.player.isSneaking) {
				if (!depositSelectedIntoToolbox(event.player, event.block, state))
					attachToolbox(event.player, event.block, state);
			} else
				showToolbox(event.player, event.block, state);
		} catch { failedUpdates++; }
	});
	world.afterEvents.itemStartUseOn.subscribe(event => {
		try {
			rememberPlacementItem(event.source, event.itemStack);
			if (event.itemStack?.typeId === "createbedrock:wrench")
				wrenchBlock(event.source, event.block);
		} catch { failedUpdates++; }
	});
	world.afterEvents.itemUse.subscribe(event => {
		try {
			if (upgradeKindForItem(event.itemStack?.typeId))
				applyHeldUpgrade(event.source, event.itemStack);
			else if (event.itemStack?.typeId === POTATO_CANNON)
				firePotatoCannon(event.source);
			else if (event.itemStack?.typeId === EXTENDO_GRIP)
				useExtendo(event.source);
			else if (event.itemStack?.typeId === GOGGLES || playerHasGoggles(event.source))
				gogglesMessage(event.source);
		} catch { failedUpdates++; }
	});
	registerTickHandler(() => {
		equipmentTicks++;
		let dirty = false;
		for (const [playerId, pending] of pendingPlacementBlocks) {
			if (equipmentTicks - pending.tick <= 2)
				continue;
			pendingPlacementBlocks.delete(playerId);
		}
		for (const [playerId, pending] of pendingPlacementItems) {
			if (equipmentTicks - pending.tick <= 2)
				continue;
			pendingPlacementItems.delete(playerId);
		}
		for (const record of backtanks.values())
			dirty = tickStationaryBacktank(record) || dirty;
		for (const player of world.getAllPlayers()) {
			try {
				tickDivingEquipment(player);
				if (equipmentTicks % 20 === 0) {
					const backtank = chestBacktank(player)?.state;
					if (backtank)
						player.onScreenDisplay?.setActionBar?.(`Air ${backtank.air}/${backtankCapacity(backtank.capacityLevel)} · Capacity ${backtank.capacityLevel}/3`);
					dirty = refillFromAttachedToolbox(player) || dirty;
				}
			} catch { failedUpdates++; }
		}
		if (dirty || equipmentTicks % 200 === 0)
			persist();
		persistence.tick();
	}, EQUIPMENT_TASK_GROUP);
	system.run(() => {
		try {
			const restored = persistence.read();
			if (restored)
				restoreRecords(restored.records);
		} catch { failedUpdates++; }
	});
	return true;
}
