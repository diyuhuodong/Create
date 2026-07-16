import { EquipmentSlot, system, world } from "@minecraft/server";

import { cardboardSwordImpulse, hasFullCardboardArmor, isArthropod, isCardboardSword } from "./cardboard-equipment.js";

let armorStealthTicks = 0;
let swordImpacts = 0;
let failedEquipmentTicks = 0;

function armorEquipment(player) {
	const equippable = player?.getComponent?.("minecraft:equippable");
	if (!equippable?.getEquipment)
		return undefined;
	return {
		head: equippable.getEquipment(EquipmentSlot.Head),
		chest: equippable.getEquipment(EquipmentSlot.Chest),
		legs: equippable.getEquipment(EquipmentSlot.Legs),
		feet: equippable.getEquipment(EquipmentSlot.Feet)
	};
}

export function applyCardboardArmorStealth(player) {
	if (!player?.isSneaking || !hasFullCardboardArmor(armorEquipment(player)))
		return false;
	// Bedrock has no public player hitbox or AI-target-selector mutation API.
	// A short server-authoritative invisibility effect is the portable equivalent
	// of Create's crouched full-set visibility suppression and expires at once
	// when any piece is removed or crouching ends.
	player.addEffect("invisibility", 4, { amplifier: 0, showParticles: false });
	armorStealthTicks++;
	return true;
}

export function applyCardboardSwordImpact(attacker, target) {
	if (!isCardboardSword(attacker?.getComponent?.("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)))
		return false;
	try {
		attacker.dimension.playSound("createbedrock:cardboard_bonk", attacker.location, { pitch: 1.85, volume: 0.75 });
	} catch {
		// Sound availability must not change combat semantics on a Realm server.
	}
	target.applyImpulse(cardboardSwordImpulse(attacker.location, target.location));
	if (target.typeId !== "minecraft:player")
		target.addEffect("slowness", 60, { amplifier: 9, showParticles: false });
	swordImpacts++;
	return true;
}

export function getCardboardEquipmentDiagnostics() {
	return { armorStealthTicks, failedEquipmentTicks, swordImpacts };
}

export function registerCardboardEquipment() {
	system.runInterval(() => {
		for (const player of world.getAllPlayers()) {
			try {
				applyCardboardArmorStealth(player);
			} catch {
				failedEquipmentTicks++;
			}
		}
	}, 1);
	world.beforeEvents.entityHurt.subscribe(event => {
		const attacker = event.damageSource.damagingEntity;
		const target = event.hurtEntity;
		if (!isCardboardSword(attacker?.getComponent?.("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand))
			|| isArthropod(target))
			return;
		event.cancel = true;
		// Before-event callbacks cannot mutate gameplay state. Defer the faithful
		// non-damaging knockback until cancellation has committed.
		system.run(() => {
			try {
				applyCardboardSwordImpact(attacker, target);
			} catch {
				failedEquipmentTicks++;
			}
		});
	});
	world.afterEvents.entityHitBlock.subscribe(event => {
		const attacker = event.damagingEntity;
		if (!isCardboardSword(attacker?.getComponent?.("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)))
			return;
		try {
			attacker.dimension.playSound("createbedrock:cardboard_bonk", attacker.location, { pitch: 1.85, volume: 0.5 });
		} catch {
			failedEquipmentTicks++;
		}
	});
}
