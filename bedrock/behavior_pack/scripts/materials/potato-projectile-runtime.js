import { BlockPermutation, ItemStack, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import {
	launchVelocity,
	nextProjectileMotion,
	potatoProjectileProfile,
	POTATO_PROJECTILE_ENTITY
} from "./potato-projectile.js";

const AGE_PROPERTY = "createbedrock:potato_age";
const ITEM_PROPERTY = "createbedrock:potato_item";
const OWNER_PROPERTY = "createbedrock:potato_owner";
const STUCK_PROPERTY = "createbedrock:potato_stuck";
const VELOCITY_PROPERTY = "createbedrock:potato_velocity";
const POTATO_PROJECTILE_TASK_GROUP = "potatoProjectiles";
const POTATO_PROJECTILE_TASK_BUDGET = 32;
const MAX_PROJECTILE_AGE = 200;
const HIT_RADIUS = .45;

let blockHits = 0;
let entityHits = 0;
let failedUpdates = 0;
let registered = false;
let spawned = 0;

function finiteVector(value) {
	return [value?.x, value?.y, value?.z].every(Number.isFinite);
}

function isAir(block) {
	return !block || ["minecraft:air", "minecraft:cave_air", "minecraft:void_air"].includes(block.typeId);
}

function readVelocity(entity) {
	try {
		const value = entity.getDynamicProperty(VELOCITY_PROPERTY);
		const parsed = typeof value === "string" ? JSON.parse(value) : undefined;
		return finiteVector(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function writeVelocity(entity, velocity) {
	entity.setDynamicProperty(VELOCITY_PROPERTY, JSON.stringify(velocity));
}

function profileFor(entity) {
	const itemTypeId = entity.getDynamicProperty(ITEM_PROPERTY);
	return typeof itemTypeId === "string" ? potatoProjectileProfile(itemTypeId) : undefined;
}

function nextLocation(location, velocity) {
	return { x: location.x + velocity.x, y: location.y + velocity.y, z: location.z + velocity.z };
}

function blockAt(dimension, location) {
	try {
		return dimension.getBlock({ x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) });
	} catch {
		return undefined;
	}
}

function directionOffset(velocity) {
	const axis = ["x", "y", "z"].reduce((best, candidate) => Math.abs(velocity[candidate]) > Math.abs(velocity[best]) ? candidate : best, "x");
	return { x: axis === "x" ? Math.sign(velocity.x) || 1 : 0, y: axis === "y" ? Math.sign(velocity.y) || 1 : 0, z: axis === "z" ? Math.sign(velocity.z) || 1 : 0 };
}

function placeOrPlantProjectile(dimension, hitBlock, velocity, profile) {
	try {
		if (profile.plant) {
			const farmland = hitBlock?.typeId === "minecraft:farmland" ? hitBlock : blockAt(dimension, {
				x: hitBlock.location.x,
				y: hitBlock.location.y - 1,
				z: hitBlock.location.z
			});
			const above = farmland && blockAt(dimension, { x: farmland.location.x, y: farmland.location.y + 1, z: farmland.location.z });
			if (farmland?.typeId === "minecraft:farmland" && isAir(above)) {
				above.setPermutation(BlockPermutation.resolve(profile.plant));
				return true;
			}
		}
		if (profile.place) {
			const offset = directionOffset(velocity);
			const destination = blockAt(dimension, {
				x: hitBlock.location.x + offset.x,
				y: hitBlock.location.y + offset.y,
				z: hitBlock.location.z + offset.z
			});
			if (isAir(destination)) {
				destination.setPermutation(BlockPermutation.resolve(profile.place));
				return true;
			}
		}
	} catch {
		failedUpdates++;
	}
	return false;
}

function applyHitEffects(target, profile, velocity) {
	try {
		if (profile.damage > 0)
			target.applyDamage?.(profile.damage);
		if (profile.knockback > 0) {
			const horizontal = Math.hypot(velocity.x, velocity.z) || 1;
			target.applyImpulse?.({
				x: velocity.x / horizontal * profile.knockback,
				y: Math.min(.4, profile.knockback * .1),
				z: velocity.z / horizontal * profile.knockback
			});
		}
		if (profile.effect)
			target.addEffect?.(profile.effect.type, profile.effect.duration, { amplifier: profile.effect.amplifier, showParticles: true });
		if (profile.fireSeconds)
			target.setOnFire?.(profile.fireSeconds, true);
	} catch {
		failedUpdates++;
	}
}

function teleportHitTarget(target, diameter) {
	if (!target?.teleport || !Number.isFinite(diameter))
		return;
	const offset = {
		x: (Math.random() * 2 - 1) * diameter / 2,
		y: 0,
		z: (Math.random() * 2 - 1) * diameter / 2
	};
	try {
		target.teleport({ x: target.location.x + offset.x, y: target.location.y, z: target.location.z + offset.z }, { checkForBlocks: true });
	} catch {
		failedUpdates++;
	}
}

function stickToTarget(projectile, target) {
	try {
		projectile.setDynamicProperty(STUCK_PROPERTY, JSON.stringify({
			offset: {
				x: projectile.location.x - target.location.x,
				y: projectile.location.y - target.location.y,
				z: projectile.location.z - target.location.z
			},
			targetId: target.id
		}));
		projectile.setDynamicProperty(VELOCITY_PROPERTY, JSON.stringify({ x: 0, y: 0, z: 0 }));
		return true;
	} catch {
		failedUpdates++;
		return false;
	}
}

function releaseStuckProjectile(projectile) {
	try { projectile.setDynamicProperty(STUCK_PROPERTY, undefined); } catch { failedUpdates++; }
}

function followStuckProjectile(projectile) {
	let stuck;
	try {
		const value = projectile.getDynamicProperty(STUCK_PROPERTY);
		stuck = typeof value === "string" ? JSON.parse(value) : undefined;
	} catch {
		failedUpdates++;
		return false;
	}
	if (!stuck)
		return false;
	const target = typeof stuck.targetId === "string" ? world.getEntity(stuck.targetId) : undefined;
	if (!target?.isValid || !finiteVector(stuck.offset)) {
		releaseStuckProjectile(projectile);
		return false;
	}
	projectile.teleport({
		x: target.location.x + stuck.offset.x,
		y: target.location.y + stuck.offset.y,
		z: target.location.z + stuck.offset.z
	});
	return true;
}

function spawnSplitProjectiles(projectile, profile, velocity) {
	if (!profile.split || profile.split < 2)
		return;
	for (let index = 1; index < profile.split; index++) {
		const direction = {
			x: velocity.x + (index - (profile.split - 1) / 2) * .14,
			y: velocity.y + .06,
			z: velocity.z - (index - (profile.split - 1) / 2) * .14
		};
		try {
			spawnPotatoProjectile({
				dimension: projectile.dimension,
				direction,
				itemTypeId: profile.itemTypeId,
				location: projectile.location,
				ownerId: projectile.getDynamicProperty(OWNER_PROPERTY)
			});
		} catch {
			failedUpdates++;
		}
	}
}

function dropProfileItem(projectile, profile) {
	if (!profile.drop)
		return;
	try { projectile.dimension.spawnItem(new ItemStack(profile.drop, 1), projectile.location); } catch { failedUpdates++; }
}

function hitEntity(projectile, target, profile, velocity) {
	applyHitEffects(target, profile, velocity);
	if (profile.teleportDiameter)
		teleportHitTarget(target, profile.teleportDiameter);
	entityHits++;
	if (profile.sticky && stickToTarget(projectile, target))
		return;
	spawnSplitProjectiles(projectile, profile, velocity);
	dropProfileItem(projectile, profile);
	projectile.remove();
}

function impactBlock(projectile, hitBlock, profile, velocity) {
	placeOrPlantProjectile(projectile.dimension, hitBlock, velocity, profile);
	blockHits++;
	spawnSplitProjectiles(projectile, profile, velocity);
	dropProfileItem(projectile, profile);
	projectile.remove();
}

function targetAt(projectile, location) {
	const ownerId = projectile.getDynamicProperty(OWNER_PROPERTY);
	try {
		return projectile.dimension.getEntities({ location, maxDistance: HIT_RADIUS })
			.find(entity => entity.id !== projectile.id && entity.id !== ownerId && entity.typeId !== POTATO_PROJECTILE_ENTITY && entity.isValid);
	} catch {
		failedUpdates++;
		return undefined;
	}
}

function tickProjectile(projectile) {
	if (!projectile?.isValid || followStuckProjectile(projectile))
		return;
	const profile = profileFor(projectile);
	const velocity = readVelocity(projectile);
	if (!profile || !velocity) {
		projectile.remove();
		failedUpdates++;
		return;
	}
	const age = projectile.getDynamicProperty(AGE_PROPERTY);
	if (!Number.isInteger(age) || age >= MAX_PROJECTILE_AGE) {
		projectile.remove();
		return;
	}
	const location = nextLocation(projectile.location, velocity);
	const target = targetAt(projectile, location);
	if (target) {
		hitEntity(projectile, target, profile, velocity);
		return;
	}
	const hitBlock = blockAt(projectile.dimension, location);
	if (!isAir(hitBlock)) {
		impactBlock(projectile, hitBlock, profile, velocity);
		return;
	}
	try {
		projectile.teleport(location);
		writeVelocity(projectile, nextProjectileMotion(velocity, profile));
		projectile.setDynamicProperty(AGE_PROPERTY, age + 1);
	} catch {
		failedUpdates++;
	}
}

export function spawnPotatoProjectile({ dimension, direction, itemTypeId, location, ownerId } = {}) {
	if (!dimension?.spawnEntity || !finiteVector(location) || !finiteVector(direction))
		throw new TypeError("Potato projectile spawning requires a dimension, location, and direction");
	const velocity = launchVelocity(itemTypeId, direction);
	const projectile = dimension.spawnEntity(POTATO_PROJECTILE_ENTITY, location);
	projectile.setDynamicProperty(AGE_PROPERTY, 0);
	projectile.setDynamicProperty(ITEM_PROPERTY, itemTypeId);
	if (typeof ownerId === "string")
		projectile.setDynamicProperty(OWNER_PROPERTY, ownerId);
	writeVelocity(projectile, velocity);
	spawned++;
	return projectile;
}

export function getPotatoProjectileDiagnostics() {
	return { blockHits, entityHits, failedUpdates, spawned };
}

export function registerPotatoProjectiles() {
	if (registered)
		return false;
	registered = true;
	registerKernelTaskGroup(POTATO_PROJECTILE_TASK_GROUP, POTATO_PROJECTILE_TASK_BUDGET);
	registerTickHandler(() => {
		const dimensions = typeof world.getDimensions === "function"
			? world.getDimensions()
			: ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].map(id => world.getDimension(id));
		for (const dimension of dimensions) {
			try {
				for (const projectile of dimension.getEntities({ type: POTATO_PROJECTILE_ENTITY }))
					tickProjectile(projectile);
			} catch {
				failedUpdates++;
			}
		}
	}, POTATO_PROJECTILE_TASK_GROUP);
	return true;
}
