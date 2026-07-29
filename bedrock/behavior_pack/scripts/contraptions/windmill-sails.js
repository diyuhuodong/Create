import { WINDMILL_SAIL_BLOCKS as FUNCTIONAL_WINDMILL_SAIL_BLOCKS } from "../kernel/functional-color-families.js";

export const SAIL_FRAME_BLOCK = "createbedrock:sail_frame";
export const WHITE_SAIL_BLOCK = "createbedrock:white_sail";
export const WINDMILL_SAIL_BLOCKS = Object.freeze(new Set(FUNCTIONAL_WINDMILL_SAIL_BLOCKS));
export const MINIMUM_WINDMILL_SAILS = 8;
export const SAILS_PER_RPM = 8;
export const MAX_WINDMILL_SPEED = 16;

export function isWindmillSail(typeId) {
	return WINDMILL_SAIL_BLOCKS.has(typeId);
}

export function windmillSailCount(blocks) {
	if (!Array.isArray(blocks))
		throw new TypeError("Windmill blocks must be an array");
	return blocks.reduce((count, block) => count + (isWindmillSail(block?.typeId) ? 1 : 0), 0);
}

export function windmillSpeedForSailCount(sailCount) {
	if (!Number.isInteger(sailCount) || sailCount < 0)
		throw new RangeError("Windmill sail count must be a non-negative integer");
	if (sailCount < MINIMUM_WINDMILL_SAILS)
		return 0;
	return Math.min(MAX_WINDMILL_SPEED, Math.ceil(sailCount / SAILS_PER_RPM));
}
