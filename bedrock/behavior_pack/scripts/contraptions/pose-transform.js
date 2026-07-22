export const ASSEMBLY_POSE_SCHEMA_VERSION = 2;
export const POSE_QUATERNION_UNITS = 1_000_000_000;
export const POSE_SUBBLOCK_UNITS = 4096;

const ALIGNMENT_EPSILON = 2 / POSE_QUATERNION_UNITS;

function assertIntegerVector(value, label) {
	if (![value?.x, value?.y, value?.z].every(Number.isInteger))
		throw new TypeError(`${label} must use integer x, y, and z coordinates`);
	return { x: value.x, y: value.y, z: value.z };
}

function assertFiniteVector(value, label) {
	if (![value?.x, value?.y, value?.z].every(Number.isFinite))
		throw new TypeError(`${label} must use finite x, y, and z coordinates`);
	return { x: value.x, y: value.y, z: value.z };
}

function normalizeQuaternion(value) {
	if (![value?.x, value?.y, value?.z, value?.w].every(Number.isFinite))
		throw new TypeError("Assembly pose quaternions require finite x, y, z, and w components");
	const magnitude = Math.hypot(value.x, value.y, value.z, value.w);
	if (magnitude < Number.EPSILON)
		throw new RangeError("Assembly pose quaternions cannot be zero");
	let normalized = {
		w: Math.round(value.w / magnitude * POSE_QUATERNION_UNITS),
		x: Math.round(value.x / magnitude * POSE_QUATERNION_UNITS),
		y: Math.round(value.y / magnitude * POSE_QUATERNION_UNITS),
		z: Math.round(value.z / magnitude * POSE_QUATERNION_UNITS)
	};
	// q and -q encode the same orientation. Canonical signs keep checksums stable.
	if (normalized.w < 0 || normalized.w === 0 && [normalized.x, normalized.y, normalized.z].find(component => component !== 0) < 0)
		normalized = Object.fromEntries(Object.entries(normalized).map(([key, component]) => [key, -component]));
	return normalized;
}

function runtimeQuaternion(value) {
	return {
		w: value.w / POSE_QUATERNION_UNITS,
		x: value.x / POSE_QUATERNION_UNITS,
		y: value.y / POSE_QUATERNION_UNITS,
		z: value.z / POSE_QUATERNION_UNITS
	};
}

function quaternionProduct(left, right) {
	return {
		w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
		x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
		y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
		z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w
	};
}

function rotateVector(quaternion, point) {
	const q = runtimeQuaternion(quaternion);
	const vector = { w: 0, ...point };
	const inverse = { w: q.w, x: -q.x, y: -q.y, z: -q.z };
	const rotated = quaternionProduct(quaternionProduct(q, vector), inverse);
	return { x: rotated.x, y: rotated.y, z: rotated.z };
}

export function createAssemblyPose({ quaternion = { w: POSE_QUATERNION_UNITS, x: 0, y: 0, z: 0 }, translation = { x: 0, y: 0, z: 0 } } = {}) {
	return {
		poseSchemaVersion: ASSEMBLY_POSE_SCHEMA_VERSION,
		quaternion: normalizeQuaternion(quaternion),
		translation: assertIntegerVector(translation, "Assembly pose translation")
	};
}

export function assemblyPoseFromAxisAngle({ axis = { x: 0, y: 1, z: 0 }, rotationMilliDegrees = 0, translation = { x: 0, y: 0, z: 0 } } = {}) {
	axis = assertFiniteVector(axis, "Assembly rotation axes");
	if (!Number.isInteger(rotationMilliDegrees))
		throw new TypeError("Assembly rotations must use integer millidegrees");
	const magnitude = Math.hypot(axis.x, axis.y, axis.z);
	if (magnitude < Number.EPSILON)
		throw new RangeError("Assembly rotation axes cannot be zero");
	const halfAngle = rotationMilliDegrees / 1000 * Math.PI / 360;
	const sine = Math.sin(halfAngle) / magnitude;
	return createAssemblyPose({
		quaternion: {
			w: Math.cos(halfAngle),
			x: axis.x * sine,
			y: axis.y * sine,
			z: axis.z * sine
		},
		translation
	});
}

export function normalizeAssemblyPose(value) {
	if (value?.poseSchemaVersion !== ASSEMBLY_POSE_SCHEMA_VERSION)
		throw new TypeError(`Assembly poses must use schema ${ASSEMBLY_POSE_SCHEMA_VERSION}`);
	return createAssemblyPose(value);
}

export function assemblyPoseBasis(value) {
	const pose = normalizeAssemblyPose(value);
	const x = rotateVector(pose.quaternion, { x: 1, y: 0, z: 0 });
	const y = rotateVector(pose.quaternion, { x: 0, y: 1, z: 0 });
	const z = rotateVector(pose.quaternion, { x: 0, y: 0, z: 1 });
	return { x, y, z };
}

export function transformAssemblyPoseVector(value, vector) {
	vector = assertFiniteVector(vector, "Assembly pose vectors");
	return rotateVector(normalizeAssemblyPose(value).quaternion, vector);
}

export function transformAssemblyPosePoint(value, point) {
	const pose = normalizeAssemblyPose(value);
	const rotated = transformAssemblyPoseVector(pose, point);
	return {
		x: pose.translation.x / POSE_SUBBLOCK_UNITS + rotated.x,
		y: pose.translation.y / POSE_SUBBLOCK_UNITS + rotated.y,
		z: pose.translation.z / POSE_SUBBLOCK_UNITS + rotated.z
	};
}

export function inverseTransformAssemblyPosePoint(value, point) {
	const pose = normalizeAssemblyPose(value);
	point = assertFiniteVector(point, "Assembly inverse-transform points");
	const translated = {
		x: point.x - pose.translation.x / POSE_SUBBLOCK_UNITS,
		y: point.y - pose.translation.y / POSE_SUBBLOCK_UNITS,
		z: point.z - pose.translation.z / POSE_SUBBLOCK_UNITS
	};
	return rotateVector({ ...pose.quaternion, x: -pose.quaternion.x, y: -pose.quaternion.y, z: -pose.quaternion.z }, translated);
}

export function composeAssemblyPoses(leftValue, rightValue) {
	const left = normalizeAssemblyPose(leftValue);
	const right = normalizeAssemblyPose(rightValue);
	const rotatedTranslation = rotateVector(left.quaternion, right.translation);
	const leftQuaternion = runtimeQuaternion(left.quaternion);
	const rightQuaternion = runtimeQuaternion(right.quaternion);
	return createAssemblyPose({
		quaternion: quaternionProduct(leftQuaternion, rightQuaternion),
		translation: {
			x: left.translation.x + Math.round(rotatedTranslation.x),
			y: left.translation.y + Math.round(rotatedTranslation.y),
			z: left.translation.z + Math.round(rotatedTranslation.z)
		}
	});
}

export function withAssemblyPoseDelta(value, { axis = { x: 0, y: 1, z: 0 }, local = false, rotationMilliDegrees = 0, translation = { x: 0, y: 0, z: 0 } } = {}) {
	const pose = normalizeAssemblyPose(value);
	const rotation = assemblyPoseFromAxisAngle({ axis, rotationMilliDegrees });
	const deltaTranslation = assertIntegerVector(translation, "Assembly pose translation delta");
	const current = runtimeQuaternion(pose.quaternion);
	const delta = runtimeQuaternion(rotation.quaternion);
	return createAssemblyPose({
		quaternion: local ? quaternionProduct(current, delta) : quaternionProduct(delta, current),
		translation: {
			x: pose.translation.x + deltaTranslation.x,
			y: pose.translation.y + deltaTranslation.y,
			z: pose.translation.z + deltaTranslation.z
		}
	});
}

function alignedComponent(value) {
	for (const expected of [-1, 0, 1])
		if (Math.abs(value - expected) <= ALIGNMENT_EPSILON * 8)
			return expected;
	return undefined;
}

export function blockAlignedAssemblyBasis(value) {
	const basis = assemblyPoseBasis(value);
	const aligned = {};
	for (const axis of ["x", "y", "z"]) {
		aligned[axis] = {};
		for (const component of ["x", "y", "z"]) {
			const normalized = alignedComponent(basis[axis][component]);
			if (normalized === undefined)
				return undefined;
			aligned[axis][component] = normalized;
		}
	}
	const rows = ["x", "y", "z"].map(component => [aligned.x[component], aligned.y[component], aligned.z[component]]);
	if (rows.some(row => row.filter(Boolean).length !== 1))
		return undefined;
	return aligned;
}

export function isBlockAlignedAssemblyPose(value) {
	const pose = normalizeAssemblyPose(value);
	return Object.values(pose.translation).every(component => component % POSE_SUBBLOCK_UNITS === 0)
		&& blockAlignedAssemblyBasis(pose) !== undefined;
}

export function transformBlockAlignedVector(value, vector) {
	const basis = blockAlignedAssemblyBasis(value);
	if (!basis)
		throw new Error("Assembly pose is not block-aligned");
	vector = assertIntegerVector(vector, "Block-aligned assembly vectors");
	return {
		x: basis.x.x * vector.x + basis.y.x * vector.y + basis.z.x * vector.z,
		y: basis.x.y * vector.x + basis.y.y * vector.y + basis.z.y * vector.z,
		z: basis.x.z * vector.x + basis.y.z * vector.y + basis.z.z * vector.z
	};
}

export function interpolateAssemblyPoses(startValue, endValue, ratio) {
	if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
		throw new RangeError("Assembly pose interpolation ratios must be between zero and one");
	const start = normalizeAssemblyPose(startValue);
	const end = normalizeAssemblyPose(endValue);
	let left = runtimeQuaternion(start.quaternion);
	let right = runtimeQuaternion(end.quaternion);
	let dot = left.w * right.w + left.x * right.x + left.y * right.y + left.z * right.z;
	if (dot < 0) {
		right = Object.fromEntries(Object.entries(right).map(([key, component]) => [key, -component]));
		dot = -dot;
	}
	let quaternion;
	if (dot > .9995) {
		quaternion = Object.fromEntries(["w", "x", "y", "z"].map(key => [key, left[key] + (right[key] - left[key]) * ratio]));
	} else {
		const angle = Math.acos(Math.min(1, dot));
		const denominator = Math.sin(angle);
		const leftWeight = Math.sin((1 - ratio) * angle) / denominator;
		const rightWeight = Math.sin(ratio * angle) / denominator;
		quaternion = Object.fromEntries(["w", "x", "y", "z"].map(key => [key, left[key] * leftWeight + right[key] * rightWeight]));
	}
	return createAssemblyPose({
		quaternion,
		translation: Object.fromEntries(["x", "y", "z"].map(axis => [axis, Math.round(start.translation[axis] + (end.translation[axis] - start.translation[axis]) * ratio)]))
	});
}

export function assemblyPoseToEuler(value) {
	const q = runtimeQuaternion(normalizeAssemblyPose(value).quaternion);
	const sinPitch = 2 * (q.w * q.x - q.z * q.y);
	const x = Math.asin(Math.max(-1, Math.min(1, sinPitch)));
	const y = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
	const z = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.x * q.x + q.z * q.z));
	return { x: x * 180 / Math.PI, y: y * 180 / Math.PI, z: z * 180 / Math.PI };
}

export function assemblyPoseAngularDistanceMilliDegrees(leftValue, rightValue) {
	const left = runtimeQuaternion(normalizeAssemblyPose(leftValue).quaternion);
	const right = runtimeQuaternion(normalizeAssemblyPose(rightValue).quaternion);
	const dot = Math.abs(left.w * right.w + left.x * right.x + left.y * right.y + left.z * right.z);
	return Math.round(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI * 1000);
}
