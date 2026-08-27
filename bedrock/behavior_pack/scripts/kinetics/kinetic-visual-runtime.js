import { system, world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { creativeMotorFacingIndex } from "./creative-motor-configuration.js";
import { KINETIC_VISUAL_ENTITY_TYPES, kineticVisualAxis, kineticVisualForBlock, kineticVisualId } from "./kinetic-visual-contract.js";

const VISUAL_ID_PROPERTY = "createbedrock:kinetic_visual_id";
const VISUAL_AXIS_PROPERTY = "createbedrock:axis";
const VISUAL_FACING_PROPERTY = "createbedrock:facing";
const VISUAL_RPM_PROPERTY = "createbedrock:rpm";
const VISUAL_PHASE_PROPERTY = "createbedrock:phase";
const VISUAL_ACTIVE_PROPERTY = "createbedrock:active";
const VISUAL_BLOCK_STATE = "createbedrock:kinetic_visual";
const RECONCILE_INTERVAL = 5;
const ORPHAN_SWEEP_INTERVAL = 80;
const DIMENSION_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

let registered = false;
let ticks = 0;
let visualCount = 0;
let lastReconciled = 0;
const phaseMemory = new Map();

function normalizedDegrees(angle) {
	const normalized = angle % 360;
	return normalized < 0 ? normalized + 360 : normalized;
}

function phaseSeed(id) {
	let hash = 2166136261;
	for (const character of id) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash % 360;
}

// The entity property is client-synchronised and survives normal chunk entity
// persistence. Memory advances the authoritative phase between syncs without
// respawning the machine whenever its RPM changes.
function advanceVisualPhase(id, entity, rpm) {
	const now = system.currentTick;
	let phase = phaseMemory.get(id);
	if (!phase) {
		const saved = Number(entity.getProperty(VISUAL_PHASE_PROPERTY));
		phase = {
			angle: Number.isFinite(saved) ? normalizedDegrees(saved) : phaseSeed(id),
			rpm,
			tick: now
		};
	} else {
		phase.angle = normalizedDegrees(phase.angle + phase.rpm * 6 * ((now - phase.tick) / 20));
		phase.rpm = rpm;
		phase.tick = now;
	}
	phaseMemory.set(id, phase);
	return phase.angle;
}

function setVisualBlockState(block, visible) {
	const states = block?.permutation?.getAllStates?.();
	if (!states || states[VISUAL_BLOCK_STATE] === undefined || states[VISUAL_BLOCK_STATE] === (visible ? 1 : 0))
		return false;
	try {
		block.setPermutation(block.permutation.withState(VISUAL_BLOCK_STATE, visible ? 1 : 0));
		return true;
	} catch {
		return false;
	}
}

function visualAt(dimension, type, location, id) {
	try {
		const matches = dimension.getEntities({
			type,
			location: visualLocation(location),
			maxDistance: 0.35
		}).filter(entity => entity.getDynamicProperty(VISUAL_ID_PROPERTY) === id);
		const [visual, ...duplicates] = matches;
		// Older visual packages could leave a same-id entity behind after a
		// reload. Two overlapping entities with distinct client animation clocks
		// look exactly like a flickering machine, so retain one authoritative copy.
		for (const duplicate of duplicates)
			duplicate.remove();
		return visual;
	} catch {
		return undefined;
	}
}

function visualLocation(location) {
	// Entity positions use the block floor as Y.  Querying at Y + 0.5 while
	// spawning at Y made every reconciliation miss its own visual and leak a
	// duplicate entity. Keep both paths on the same non-colliding position.
	return { x: location.x + 0.5, y: location.y + 0.01, z: location.z + 0.5 };
}

function visualFacing(block) {
	const facing = block?.permutation?.getState?.("minecraft:facing_direction");
	return creativeMotorFacingIndex(facing) ?? 3;
}

function updateVisual(entity, id, node, speed, visual, block) {
	const rpm = Number.isFinite(speed) ? Math.max(-256, Math.min(256, speed)) : 0;
	try {
		entity.setProperty(VISUAL_AXIS_PROPERTY, kineticVisualAxis(node.axis));
		if (visual.usesFacing)
			entity.setProperty(VISUAL_FACING_PROPERTY, visualFacing(block));
		entity.setProperty(VISUAL_RPM_PROPERTY, rpm);
		if (visual.usesPhase)
			entity.setProperty(VISUAL_PHASE_PROPERTY, advanceVisualPhase(id, entity, rpm));
		entity.setProperty(VISUAL_ACTIVE_PROPERTY, Math.abs(rpm) > 0.0001);
		return true;
	} catch (error) {
		console.warn(`[Create Bedrock] Could not update kinetic visual: ${error}`);
		return false;
	}
}

function reconcileNode(kineticWorld, node) {
	const visual = kineticVisualForBlock(node.typeId);
	if (!visual)
		return false;
	let dimension;
	let block;
	try {
		dimension = world.getDimension(node.dimensionId);
		block = dimension.getBlock(node.location);
	} catch {
		return false;
	}
	if (!block || block.typeId !== node.typeId)
		return false;

	const id = kineticVisualId(node.dimensionId, node.location);
	let entity = visualAt(dimension, visual.entityType, node.location, id);
	if (!entity) {
		try {
			entity = dimension.spawnEntity(visual.entityType, visualLocation(node.location));
			entity.setDynamicProperty(VISUAL_ID_PROPERTY, id);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not create kinetic visual: ${error}`);
			return false;
		}
	}

	if (!updateVisual(entity, id, node, kineticWorld.speedAt(node.dimensionId, node.location), visual, block))
		return false;
	// Also restore legacy Creative Motors whose shell an earlier pack hid while
	// it attempted to render the entire motor through a client entity.
	setVisualBlockState(block, Boolean(visual.hidesBlock));
	return true;
}

function removeVisualsAt(dimension, location) {
	let removed = 0;
	for (const type of KINETIC_VISUAL_ENTITY_TYPES) {
		try {
				for (const entity of dimension.getEntities({
				type,
				location: visualLocation(location),
				maxDistance: 0.35
				})) {
					entity.remove();
					phaseMemory.delete(kineticVisualId(dimension.id, location));
				removed++;
			}
		} catch {
			// Entity definitions can be unavailable while a pack is being upgraded.
		}
	}
	return removed;
}

function sweepOrphans(activeIds) {
	for (const id of phaseMemory.keys())
		if (!activeIds.has(id)) phaseMemory.delete(id);
	for (const dimensionId of DIMENSION_IDS) {
		let dimension;
		try {
			dimension = world.getDimension(dimensionId);
		} catch {
			continue;
		}
		for (const type of KINETIC_VISUAL_ENTITY_TYPES) {
			try {
				for (const entity of dimension.getEntities({ type })) {
					if (!activeIds.has(entity.getDynamicProperty(VISUAL_ID_PROPERTY)))
						entity.remove();
				}
			} catch {
				// Keep reconciliation available even if a single visual definition failed to load.
			}
		}
	}
}

function reconcile(kineticWorld) {
	const nodes = kineticWorld.snapshot().nodes.filter(node => kineticVisualForBlock(node.typeId));
	const activeIds = new Set(nodes.map(node => kineticVisualId(node.dimensionId, node.location)));
	visualCount = nodes.reduce((count, node) => count + (reconcileNode(kineticWorld, node) ? 1 : 0), 0);
	lastReconciled = system.currentTick;
	if (ticks % ORPHAN_SWEEP_INTERVAL === 0)
		sweepOrphans(activeIds);
}

export function registerKineticVisuals(kineticWorld) {
	if (registered)
		return false;
	if (!kineticWorld || typeof kineticWorld.snapshot !== "function" || typeof kineticWorld.speedAt !== "function")
		throw new TypeError("Kinetic visuals require a KineticWorld");
	registered = true;

	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (!kineticVisualForBlock(event.block?.typeId))
			return;
		system.run(() => reconcile(kineticWorld));
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		removeVisualsAt(event.dimension, event.block.location);
	});
	registerTickHandler(() => {
		ticks++;
		if (ticks % RECONCILE_INTERVAL === 0)
			reconcile(kineticWorld);
	});
	system.run(() => reconcile(kineticWorld));
	return true;
}

export function getKineticVisualDiagnostics() {
	return { lastReconciled, trackedVisuals: visualCount };
}
