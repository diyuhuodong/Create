import { world } from "@minecraft/server";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerTickHandler } from "../kernel/index.js";
import {
	CLOCK_ANIMATION,
	CUCKOO_CLOCK_BLOCKS,
	cuckooClockAnimation,
	cuckooClockHand,
	cuckooClockTime,
	isCuckooClock,
	isMysteriousCuckooClock,
	nextCuckooAnimation,
	clockCanRun
} from "./cuckoo-clock.js";

const ANIMATION_STATE = "createbedrock:animation";
const HOUR_HAND_STATE = "createbedrock:hour_hand";
const MINUTE_HAND_STATE = "createbedrock:minute_hand";
const animationProgress = new Map();
let animationsStarted = 0;
let failedUpdates = 0;
let surprises = 0;
let registered = false;

function locationKey(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function stateFor(block, name, fallback = 0) {
	const value = block?.permutation?.getAllStates?.()[name];
	return Number.isInteger(value) ? value : fallback;
}

function setStates(block, states) {
	if (!isCuckooClock(block?.typeId) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [name, value] of Object.entries(states)) {
		if (permutation.getAllStates?.()[name] === value)
			continue;
		permutation = permutation.withState(name, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function isNaturalDimension(dimensionId) {
	return dimensionId === "minecraft:overworld";
}

function play(block, sound, options = {}) {
	if (typeof block?.dimension?.playSound === "function")
		block.dimension.playSound(sound, block.location, options);
}

function showAnimationSound(block, animation, progress) {
	if (progress === 1)
		play(block, "note.chime", { pitch: 0.5, volume: 1 });
	if (progress === 21)
		play(block, "note.chime", { pitch: 0.793701, volume: 1 });
	if (progress < 30 || progress > 60)
		return;
	const step = animation === CLOCK_ANIMATION.SURPRISE ? 3 : 15;
	if (progress % step === 0)
		play(block, animation === CLOCK_ANIMATION.PIG ? "mob.pig.say" : "mob.creeper.say", { pitch: animation === CLOCK_ANIMATION.PIG ? 1 : 3, volume: 0.25 });
}

function triggerSurprise(block) {
	// This deliberately retains Java Create's destructive surprise. It is only
	// reachable from the mysterious-clock noon/dusk animation, never on place.
	try {
		play(block, "random.fuse", { volume: 1, pitch: 1 });
		block.setType("minecraft:air");
		block.dimension.createExplosion?.({ x: block.location.x + 0.5, y: block.location.y + 0.5, z: block.location.z + 0.5 }, 3, { breaksBlocks: true, causesFire: false });
		surprises++;
	} catch {
		failedUpdates++;
	}
}

export function tickCuckooClock(block, speed, absoluteTime) {
	if (!isCuckooClock(block?.typeId) || !clockCanRun(speed))
		return false;
	const naturalDimension = isNaturalDimension(block.dimension.id);
	const time = cuckooClockTime(absoluteTime, naturalDimension);
	const hands = cuckooClockHand(time.hours, time.minutes);
	const key = locationKey(block.dimension.id, block.location);
	let animation = stateFor(block, ANIMATION_STATE);
	let progress = animationProgress.get(key) ?? 0;
	if (animation === CLOCK_ANIMATION.NONE) {
		const next = cuckooClockAnimation({ ...time, mysterious: isMysteriousCuckooClock(block.typeId), naturalDimension });
		if (next !== CLOCK_ANIMATION.NONE) {
			animation = next;
			progress = 0;
			animationsStarted++;
		}
	}
	if (animation !== CLOCK_ANIMATION.NONE) {
		const advanced = nextCuckooAnimation({ animation, progress });
		animation = advanced.animation;
		progress = advanced.progress;
		if (advanced.surprise)
			triggerSurprise(block);
		else
			showAnimationSound(block, stateFor(block, ANIMATION_STATE), progress);
	}
	if (animation === CLOCK_ANIMATION.NONE)
		animationProgress.delete(key);
	else
		animationProgress.set(key, progress);
	return setStates(block, { [ANIMATION_STATE]: animation, [HOUR_HAND_STATE]: hands.hour, [MINUTE_HAND_STATE]: hands.minute });
}

function captureClockData(dimensionId, location) {
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		if (!isCuckooClock(block?.typeId))
			return undefined;
		const key = locationKey(dimensionId, location);
		return { animation: stateFor(block, ANIMATION_STATE), progress: animationProgress.get(key) ?? 0 };
	} catch {
		return undefined;
	}
}

function restoreClockData(dimensionId, location, data) {
	if (!data || !Number.isInteger(data.animation) || !Number.isInteger(data.progress))
		return false;
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		if (!isCuckooClock(block?.typeId))
			return false;
		animationProgress.set(locationKey(dimensionId, location), data.progress);
		return setStates(block, { [ANIMATION_STATE]: data.animation });
	} catch {
		return false;
	}
}

export function getCuckooClockDiagnostics() {
	return { animationsStarted, failedUpdates, runningAnimations: animationProgress.size, surprises };
}

export function registerCuckooClocks(kineticWorld) {
	if (registered)
		return false;
	if (!kineticWorld || typeof kineticWorld.snapshot !== "function")
		throw new TypeError("Cuckoo Clock runtime requires the kinetic world snapshot API");
	registered = true;
	registerTickHandler(() => {
		const absoluteTime = world.getAbsoluteTime();
		for (const node of kineticWorld.snapshot().nodes) {
			if (!CUCKOO_CLOCK_BLOCKS.has(node.typeId))
				continue;
			try {
				const block = world.getDimension(node.dimensionId).getBlock(node.location);
				tickCuckooClock(block, node.network?.speed ?? kineticWorld.networkAt(node.dimensionId, node.location)?.speed ?? 0, absoluteTime);
			} catch {
				failedUpdates++;
			}
		}
	});
	for (const typeId of CUCKOO_CLOCK_BLOCKS)
		registerMovingBlockDataContributor(typeId, "cuckoo_clock", {
			capture: captureClockData,
			detach() {},
			restore: restoreClockData,
			schemaVersion: 1,
			validate(data) {
				if (!data || !Object.values(CLOCK_ANIMATION).includes(data.animation) || !Number.isInteger(data.progress) || data.progress < 0 || data.progress > 101)
					throw new TypeError("Moving Cuckoo Clock data must preserve its animation and progress");
			}
		});
	return true;
}
