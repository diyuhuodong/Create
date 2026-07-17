import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import { getKineticNetworkAt, getKineticSpeedAt } from "../kinetics/kinetic-runtime.js";
import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { POTATO_PROJECTILE_PROFILES } from "../materials/potato-projectile.js";
import { spawnPotatoProjectile } from "../materials/potato-projectile-runtime.js";
import {
	armPotatoCannon,
	BACKTANK_ITEMS,
	consumeBacktankAir,
	createBacktankState,
	createPotatoCannonState,
	readBacktankState,
	readPotatoCannonState,
	refillBacktank
} from "./equipment-state.js";
import { createToolboxState, extractToolboxStack, insertToolboxStack, readToolboxState, TOOLBOX_COMPARTMENTS } from "./toolbox-state.js";

const BACKTANK_ITEM_PROPERTY = "createbedrock:backtank_v1";
const CANNON_ITEM_PROPERTY = "createbedrock:potato_cannon_v1";
const EQUIPMENT_TASK_BUDGET = 24;
const EQUIPMENT_TASK_GROUP = "equipment";
const EXTENDO_GRIP = "createbedrock:extendo_grip";
const GOGGLES = "createbedrock:goggles";
const POTATO_CANNON = "createbedrock:potato_cannon";
const TOOLBOX_ITEM_LORE_PREFIX = "createbedrock:toolbox:v1:";
const TOOLBOX_ITEM_LORE_CHUNK = 180;
const TOOLBOX_RANGE = 10;
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
	const equipmentSlot = equippable?.getEquipmentSlot?.(slot);
	if (!equipmentSlot)
		return undefined;
	return {
		getItem() { return equipmentSlot.getItem?.() ?? equippable.getEquipment?.(slot); },
		setItem(item) { equipmentSlot.setItem?.(item); }
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
		return readBacktankState(readJsonProperty(item, BACKTANK_ITEM_PROPERTY, { itemType: item.typeId }));
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

function consumeCannonAmmo(player) {
	const container = inventory(player);
	if (!container)
		return undefined;
	for (let index = 0; index < container.size; index++) {
		if (index === player.selectedSlotIndex)
			continue;
		const item = container.getItem(index);
		if (!item || !Object.hasOwn(POTATO_PROJECTILE_PROFILES, item.typeId))
			continue;
		const itemTypeId = item.typeId;
		if (!removeOne({ getItem() { return container.getItem(index); }, setItem(value) { container.setItem(index, value); } }))
			continue;
		return itemTypeId;
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
	try { return readPotatoCannonState(readJsonProperty(item, CANNON_ITEM_PROPERTY, undefined)); } catch { return createPotatoCannonState(); }
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
	const armed = armPotatoCannon(cannonState(holder), { cooldownTicks: 12, now: system.currentTick ?? equipmentTicks });
	if (!armed.fired)
		return false;
	const ammo = consumeCannonAmmo(player);
	if (!ammo)
		return false;
	if (!writeCannonState(holder, armed.state)) {
		giveItem(player, new ItemStack(ammo, 1));
		return false;
	}
	if (!consumeChestAir(player, 1) && !damageCannon(holder)) {
		giveItem(player, new ItemStack(ammo, 1));
		return false;
	}
	const direction = player.getViewDirection?.();
	if (!direction)
		return false;
	spawnPotatoProjectile({
		dimension: player.dimension,
		direction,
		itemTypeId: ammo,
		location: { x: player.location.x, y: player.location.y + 1.5, z: player.location.z },
		ownerId: player.id
	});
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

function wrenchBlock(player, block) {
	if (!block || isBacktankBlock(block) || isToolboxBlock(block))
		return false;
	if (player.isSneaking) {
		try {
			block.setType("minecraft:air");
			giveItem(player, new ItemStack(block.typeId, 1));
			return true;
		} catch {
			return false;
		}
	}
	return rotateBlock(block);
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
	if (!consumeChestAir(player, 1))
		return false;
	return wrenchBlock(player, target);
}

function gogglesMessage(player) {
	const target = player.getBlockFromViewDirection?.({ maxDistance: 12 })?.block;
	if (!target)
		return false;
	const network = getKineticNetworkAt(target.dimension.id, target.location);
	const speed = getKineticSpeedAt(target.dimension.id, target.location) ?? 0;
	player.sendMessage?.(`§bCreate§r ${target.typeId}\nSpeed: ${Math.round(speed * 100) / 100} rpm\nStress: ${network?.stressImpact ?? 0}/${network?.stressCapacity ?? 0}`);
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
	attachedToolboxes.set(player.id, locationKey(block.dimension.id, block.location));
	player.sendMessage?.("Attached to Toolbox. Sneak-interact it again to deposit; interaction opens storage.");
	return true;
}

function refillFromAttachedToolbox(player) {
	const key = attachedToolboxes.get(player.id);
	if (!key)
		return false;
	const state = toolboxes.get(key);
	if (!state || toolboxDistance(player, state) > TOOLBOX_RANGE) {
		attachedToolboxes.delete(player.id);
		return false;
	}
	const container = inventory(player);
	if (!container)
		return false;
	for (let index = 0; index < container.size; index++) {
		const item = container.getItem(index);
		if (!item || item.amount >= item.maxAmount)
			continue;
		const compartmentIndex = state.compartments.findIndex(compartment => compartment.filter?.typeId === item.typeId);
		if (compartmentIndex < 0)
			continue;
		const result = extractToolboxStack(state, compartmentIndex, { maxCount: item.maxAmount - item.amount, receiptId: `refill:${player.id}:${equipmentTicks}:${index}` });
		if (!result.extracted)
			continue;
		const next = item.clone();
		next.amount += result.extracted.count;
		container.setItem(index, next);
		toolboxes.set(key, result.state);
		toolboxTransfers++;
		return true;
	}
	return false;
}

function serializeRecords() {
	return [
		...backtanks.values().map(record => ({ kind: "backtank", ...record })),
		...toolboxes.values().map(state => ({ kind: "toolbox", state }))
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
	world.afterEvents.itemUseOn.subscribe(event => {
		try {
			rememberPlacementItem(event.source, event.itemStack);
			if (event.itemStack?.typeId === "createbedrock:wrench")
				wrenchBlock(event.source, event.block);
		} catch { failedUpdates++; }
	});
	world.afterEvents.itemUse.subscribe(event => {
		try {
			if (event.itemStack?.typeId === POTATO_CANNON)
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
				if (equipmentTicks % 20 === 0)
					dirty = refillFromAttachedToolbox(player) || dirty;
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
