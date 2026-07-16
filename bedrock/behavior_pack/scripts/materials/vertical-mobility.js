export const LADDER_BLOCKS = new Set([
	"createbedrock:andesite_ladder",
	"createbedrock:brass_ladder",
	"createbedrock:copper_ladder"
]);

export const SCAFFOLD_BLOCKS = new Set([
	"createbedrock:andesite_scaffolding",
	"createbedrock:brass_scaffolding",
	"createbedrock:copper_scaffolding"
]);

export const VERTICAL_MOBILITY_BLOCKS = new Set([...LADDER_BLOCKS, ...SCAFFOLD_BLOCKS]);

export function blockLocationsForEntity(location) {
	if (!location || ![location.x, location.y, location.z].every(Number.isFinite))
		throw new TypeError("Vertical mobility requires a finite entity location");
	const x = Math.floor(location.x);
	const y = Math.floor(location.y);
	const z = Math.floor(location.z);
	return [{ x, y, z }, { x, y: y + 1, z }];
}

export function findVerticalMobilityBlock(location, readBlock) {
	if (typeof readBlock !== "function")
		throw new TypeError("Vertical mobility requires a block reader");
	for (const blockLocation of blockLocationsForEntity(location)) {
		const block = readBlock(blockLocation);
		if (VERTICAL_MOBILITY_BLOCKS.has(block?.typeId))
			return { block, location: blockLocation, kind: LADDER_BLOCKS.has(block.typeId) ? "ladder" : "scaffolding" };
	}
	return undefined;
}

export function verticalMotionImpulse({ verticalVelocity, isJumping = false, isSneaking = false }) {
	if (!Number.isFinite(verticalVelocity))
		throw new TypeError("Vertical mobility requires a finite vertical velocity");
	const desiredVelocity = isJumping
		? Math.max(0.2, verticalVelocity)
		: isSneaking
			? -0.12
			: -0.08;
	return desiredVelocity - verticalVelocity;
}
