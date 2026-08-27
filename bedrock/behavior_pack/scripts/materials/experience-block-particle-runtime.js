import { system } from "@minecraft/server";

import { registerBlockComponent } from "../kernel/register-block-component.js";
import { EXPERIENCE_BLOCK, EXPERIENCE_PARTICLE, experienceBlockParticleLocation } from "./experience-block-particle.js";

export const EXPERIENCE_BLOCK_PARTICLE_COMPONENT = "createbedrock:experience_block_particle";

let emittedParticles = 0;
let failedParticleTicks = 0;
let registered = false;

export function emitExperienceBlockParticle(block) {
	if (block?.typeId !== EXPERIENCE_BLOCK || typeof block.dimension?.spawnParticle !== "function")
		return false;
	block.dimension.spawnParticle(EXPERIENCE_PARTICLE, experienceBlockParticleLocation(block.location));
	emittedParticles++;
	return true;
}

export function getExperienceBlockParticleDiagnostics() {
	return { emittedParticles, failedParticleTicks };
}

export function registerExperienceBlockParticles() {
	if (registered)
		return false;
	registered = true;
	system.beforeEvents.startup.subscribe(event => {
		registerBlockComponent(event.blockComponentRegistry, EXPERIENCE_BLOCK_PARTICLE_COMPONENT, {
			onTick(tickEvent) {
				try {
					emitExperienceBlockParticle(tickEvent.block);
				} catch {
					failedParticleTicks++;
				}
			}
		});
	});
	return true;
}
