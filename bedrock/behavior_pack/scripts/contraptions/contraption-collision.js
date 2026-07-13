import { normalizeContraptionSnapshot } from "./contraption-snapshot.js";

const MAX_ROTATION_STEP = 15;

function validateOrigin(origin) {
	if (!Number.isInteger(origin?.x) || !Number.isInteger(origin?.y) || !Number.isInteger(origin?.z))
		throw new TypeError("Contraption collision origins require integer block coordinates");
}

function occupiedRange(minimum, maximum) {
	const first = Math.floor(minimum);
	const last = Math.ceil(maximum) - 1;
	return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

function footprintAt(snapshot, origin, rotation) {
	const radians = rotation * Math.PI / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const occupied = new Map();
	for (const block of snapshot.blocks) {
		const x = origin.x + block.relative.x * cosine - block.relative.z * sine;
		const z = origin.z + block.relative.x * sine + block.relative.z * cosine;
		for (const blockX of occupiedRange(x, x + 1)) {
			for (const blockY of occupiedRange(origin.y + block.relative.y, origin.y + block.relative.y + 1)) {
				for (const blockZ of occupiedRange(z, z + 1)) {
					const location = { x: blockX, y: blockY, z: blockZ };
					occupied.set(`${blockX}:${blockY}:${blockZ}`, location);
				}
			}
		}
	}
	return [...occupied.values()];
}

function shortestRotationDelta(startRotation, endRotation) {
	const delta = (endRotation - startRotation) % 360;
	if (delta > 180)
		return delta - 360;
	if (delta < -180)
		return delta + 360;
	return delta;
}

export function findContraptionCollision({ snapshot, origin, startRotation, endRotation, readBlock }) {
	if (typeof readBlock !== "function")
		throw new TypeError("Contraption collision checks require readBlock()");
	if (!Number.isFinite(startRotation) || !Number.isFinite(endRotation))
		throw new TypeError("Contraption collision rotations must be finite");
	validateOrigin(origin);
	const normalized = normalizeContraptionSnapshot(snapshot);
	const delta = shortestRotationDelta(startRotation, endRotation);
	const steps = Math.max(1, Math.ceil(Math.abs(delta) / MAX_ROTATION_STEP));
	for (let step = 0; step <= steps; step++) {
		const rotation = startRotation + delta * step / steps;
		for (const location of footprintAt(normalized, origin, rotation)) {
			const block = readBlock(location);
			if (block && block.typeId !== "minecraft:air")
				return { location, reason: "world_blocked", rotation };
		}
	}
	return undefined;
}
