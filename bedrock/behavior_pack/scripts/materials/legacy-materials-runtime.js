import { ItemStack, system, world } from "@minecraft/server";

import {
	CHROMATIC_COMPOUND,
	CHROMATIC_LIGHT_KEY,
	chromaticLight,
	isChromaticCompound,
	isCollectableLightSource,
	nextChromaticOutcome
} from "./legacy-materials.js";

const DIMENSIONS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
const LIGHT_SEARCH_RADIUS = 3;
let chargedCompounds = 0;
let failedUpdates = 0;
let refinedRadiance = 0;
let shadowSteel = 0;
let registered = false;

function itemStackFor(entity) {
	try { return entity?.getComponent?.("minecraft:item")?.itemStack; } catch { return undefined; }
}

function belowWorld(entity) {
	const minimum = entity?.dimension?.heightRange?.min ?? -64;
	return entity?.location?.y < minimum;
}

function beaconBelow(entity) {
	const dimension = entity?.dimension;
	if (!dimension || !entity?.location)
		return false;
	const x = Math.floor(entity.location.x);
	const z = Math.floor(entity.location.z);
	const minimum = dimension.heightRange?.min ?? -64;
	for (let y = Math.floor(entity.location.y); y >= minimum; y--) {
		const block = dimension.getBlock({ x, y, z });
		if (!block || block.typeId === "minecraft:air")
			continue;
		return block.typeId === "minecraft:beacon";
	}
	return false;
}

function nearestLightSource(entity) {
	const dimension = entity?.dimension;
	if (!dimension || !entity?.location)
		return undefined;
	const origin = {
		x: Math.floor(entity.location.x),
		y: Math.floor(entity.location.y),
		z: Math.floor(entity.location.z)
	};
	for (let distance = 0; distance <= LIGHT_SEARCH_RADIUS; distance++) {
		for (let x = -distance; x <= distance; x++) for (let y = -distance; y <= distance; y++) for (let z = -distance; z <= distance; z++) {
			if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== distance)
				continue;
			const block = dimension.getBlock({ x: origin.x + x, y: origin.y + y, z: origin.z + z });
			if (isCollectableLightSource(block?.typeId))
				return block;
		}
	}
	return undefined;
}

function replaceEntityStack(entity, replacement, remainder) {
	const location = entity.location;
	const dimension = entity.dimension;
	entity.remove();
	if (remainder)
		dimension.spawnItem(remainder, location);
	return dimension.spawnItem(replacement, location);
}

function splitChromaticStack(stack) {
	if (stack.amount <= 1)
		return undefined;
	const remainder = stack.clone();
	remainder.amount--;
	return remainder;
}

function convertCompound(entity, stack, output) {
	const replacement = new ItemStack(output, stack.amount);
	replaceEntityStack(entity, replacement);
	if (output.endsWith("shadow_steel"))
		shadowSteel += stack.amount;
	else
		refinedRadiance += stack.amount;
	return true;
}

function chargeFromLight(entity, stack, lightSource) {
	const current = chromaticLight(stack.getDynamicProperty?.(CHROMATIC_LIGHT_KEY));
	const outcome = nextChromaticOutcome({ light: current });
	const remainder = splitChromaticStack(stack);
	if (outcome.kind === "convert") {
		const replacement = new ItemStack(outcome.output, 1);
		replaceEntityStack(entity, replacement, remainder);
		lightSource.setType("minecraft:air");
		refinedRadiance++;
		return true;
	}
	const charged = new ItemStack(CHROMATIC_COMPOUND, 1);
	charged.setDynamicProperty(CHROMATIC_LIGHT_KEY, outcome.light);
	replaceEntityStack(entity, charged, remainder);
	lightSource.setType("minecraft:air");
	chargedCompounds++;
	return true;
}

export function processChromaticEntity(entity) {
	const stack = itemStackFor(entity);
	if (!isChromaticCompound(stack?.typeId))
		return false;
	if (belowWorld(entity))
		return convertCompound(entity, stack, "createbedrock:shadow_steel");
	if (beaconBelow(entity))
		return convertCompound(entity, stack, "createbedrock:refined_radiance");
	const lightSource = nearestLightSource(entity);
	return lightSource ? chargeFromLight(entity, stack, lightSource) : false;
}

function tickLegacyMaterials() {
	for (const id of DIMENSIONS) {
		try {
			for (const entity of world.getDimension(id).getEntities({ type: "minecraft:item" }))
				processChromaticEntity(entity);
		} catch {
			failedUpdates++;
		}
	}
}

export function getLegacyMaterialsDiagnostics() {
	return { chargedCompounds, failedUpdates, refinedRadiance, shadowSteel };
}

export function registerLegacyMaterials() {
	if (registered)
		return false;
	registered = true;
	system.runInterval(tickLegacyMaterials, 5);
	return true;
}
