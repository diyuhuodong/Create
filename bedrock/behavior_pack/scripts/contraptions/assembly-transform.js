export const ASSEMBLY_SUBBLOCK_UNITS = 4096;
export const ASSEMBLY_FULL_ROTATION = 360000;
export const ASSEMBLY_QUARTER_TURN = 90000;

function assertIntegerVector(value, label) {
	if (![value?.x, value?.y, value?.z].every(Number.isInteger))
		throw new TypeError(`${label} must use integer x, y, and z coordinates`);
	return { x: value.x, y: value.y, z: value.z };
}

function normalizeRotation(value) {
	if (!Number.isInteger(value))
		throw new TypeError("Assembly rotation must use integer millidegrees");
	return (value % ASSEMBLY_FULL_ROTATION + ASSEMBLY_FULL_ROTATION) % ASSEMBLY_FULL_ROTATION;
}

export function createAssemblyTransform({ rotationMilliDegrees = 0, translation = { x: 0, y: 0, z: 0 } } = {}) {
	return {
		rotationMilliDegrees: normalizeRotation(rotationMilliDegrees),
		translation: assertIntegerVector(translation, "Assembly translation")
	};
}

export function assemblyTransformToRuntime(transform) {
	const normalized = createAssemblyTransform(transform);
	return {
		rotation: normalized.rotationMilliDegrees / 1000,
		translation: {
			x: normalized.translation.x / ASSEMBLY_SUBBLOCK_UNITS,
			y: normalized.translation.y / ASSEMBLY_SUBBLOCK_UNITS,
			z: normalized.translation.z / ASSEMBLY_SUBBLOCK_UNITS
		}
	};
}

export function isBlockAlignedAssemblyTransform(transform) {
	const normalized = createAssemblyTransform(transform);
	return normalized.rotationMilliDegrees % ASSEMBLY_QUARTER_TURN === 0
		&& Object.values(normalized.translation).every(value => value % ASSEMBLY_SUBBLOCK_UNITS === 0);
}

/** Applies the persisted transform to a local block-relative coordinate. */
export function transformAssemblyPoint(transform, point) {
	if (![point?.x, point?.y, point?.z].every(Number.isFinite))
		throw new TypeError("Assembly local points require finite x, y, and z coordinates");
	const runtime = assemblyTransformToRuntime(transform);
	const radians = runtime.rotation * Math.PI / 180;
	return {
		x: runtime.translation.x + point.x * Math.cos(radians) - point.z * Math.sin(radians),
		y: runtime.translation.y + point.y,
		z: runtime.translation.z + point.x * Math.sin(radians) + point.z * Math.cos(radians)
	};
}

export function withAssemblyTransformDelta(transform, { rotationMilliDegrees = 0, translation = { x: 0, y: 0, z: 0 } } = {}) {
	const current = createAssemblyTransform(transform);
	const delta = assertIntegerVector(translation, "Assembly translation delta");
	if (!Number.isInteger(rotationMilliDegrees))
		throw new TypeError("Assembly rotation delta must use integer millidegrees");
	return createAssemblyTransform({
		rotationMilliDegrees: current.rotationMilliDegrees + rotationMilliDegrees,
		translation: {
			x: current.translation.x + delta.x,
			y: current.translation.y + delta.y,
			z: current.translation.z + delta.z
		}
	});
}
