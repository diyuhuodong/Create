export const CREATIVE_MOTOR_MIN_SPEED = -256;
export const CREATIVE_MOTOR_MAX_SPEED = 256;
export const CREATIVE_MOTOR_MIN_MAGNITUDE = 1;
export const CREATIVE_MOTOR_MAX_MAGNITUDE = 256;

// Java Create renders the scroll value box in the centre of its active side
// panels. Those panels are perpendicular to the output axis; a horizontal
// motor intentionally has no value box on its underside. The 8x8-pixel
// footprint matches ValueBoxTransform's 0.5-scale hit radius.
export const CREATIVE_MOTOR_VALUE_BOX_MIN = 4 / 16;
export const CREATIVE_MOTOR_VALUE_BOX_MAX = 12 / 16;

const FACE_AXIS = Object.freeze(["y", "y", "z", "z", "x", "x"]);
const FACING_DIRECTION_INDEX = Object.freeze({
	down: 0,
	up: 1,
	north: 2,
	south: 3,
	west: 4,
	east: 5
});

/**
 * Convert the modern placement-direction strings to Bedrock's numeric face
 * index. Numbers stay accepted solely to keep old saved permutations readable.
 */
export function creativeMotorFacingIndex(facingDirection) {
	if (Number.isInteger(facingDirection) && facingDirection >= 0 && facingDirection <= 5)
		return facingDirection;
	return FACING_DIRECTION_INDEX[facingDirection];
}

function inValueBox(value) {
	return Number.isFinite(value) && value >= CREATIVE_MOTOR_VALUE_BOX_MIN && value <= CREATIVE_MOTOR_VALUE_BOX_MAX;
}

/** Whether a hit targets one of Java Create's visible Creative Motor value boxes. */
export function isCreativeMotorValueBox({ blockFace, faceLocation, facingDirection }) {
	const facingIndex = creativeMotorFacingIndex(facingDirection);
	if (!Number.isInteger(blockFace) || !Number.isInteger(facingIndex) || !faceLocation)
		return false;
	const blockAxis = FACE_AXIS[blockFace];
	const facingAxis = FACE_AXIS[facingIndex];
	if (!blockAxis || !facingAxis || blockAxis === facingAxis)
		return false;
	if (facingAxis !== "y" && blockFace === 0)
		return false;
	// Direction is the Bedrock block-facing enum: down/up/north/south/west/east.
	// Test only the two coordinates that lie in the selected face plane.
	if (blockFace === 0 || blockFace === 1)
		return inValueBox(faceLocation.x) && inValueBox(faceLocation.z);
	if (blockFace === 2 || blockFace === 3)
		return inValueBox(faceLocation.x) && inValueBox(faceLocation.y);
	if (blockFace === 4 || blockFace === 5)
		return inValueBox(faceLocation.z) && inValueBox(faceLocation.y);
	return false;
}

/** Parse the positive magnitude field used by the Bedrock motor editor. */
export function parseCreativeMotorMagnitude(value) {
	if (typeof value !== "string" || !/^\d+$/.test(value.trim()))
		throw new TypeError("Speed magnitude must be a whole number");
	const magnitude = Number(value.trim());
	if (!Number.isSafeInteger(magnitude) || magnitude < CREATIVE_MOTOR_MIN_MAGNITUDE || magnitude > CREATIVE_MOTOR_MAX_MAGNITUDE)
		throw new RangeError(`Speed magnitude must be between ${CREATIVE_MOTOR_MIN_MAGNITUDE} and ${CREATIVE_MOTOR_MAX_MAGNITUDE} RPM`);
	return magnitude;
}

export function creativeMotorSpeed(direction, magnitude) {
	if (direction !== 1 && direction !== -1)
		throw new TypeError("Creative motor direction must be 1 or -1");
	if (!Number.isInteger(magnitude) || magnitude < CREATIVE_MOTOR_MIN_MAGNITUDE || magnitude > CREATIVE_MOTOR_MAX_MAGNITUDE)
		throw new RangeError(`Speed magnitude must be between ${CREATIVE_MOTOR_MIN_MAGNITUDE} and ${CREATIVE_MOTOR_MAX_MAGNITUDE} RPM`);
	return direction * magnitude;
}

/** Apply an editor nudge while retaining Java Create's non-zero value range. */
export function nudgeCreativeMotorSpeed(speed, delta) {
	if (!Number.isInteger(speed) || Math.abs(speed) > CREATIVE_MOTOR_MAX_SPEED)
		throw new RangeError(`Speed must be between ${CREATIVE_MOTOR_MIN_SPEED} and ${CREATIVE_MOTOR_MAX_SPEED} RPM`);
	if (![1, 32, -1, -32].includes(delta))
		throw new TypeError("Creative motor nudges must be ±1 or ±32 RPM");
	const next = Math.max(CREATIVE_MOTOR_MIN_SPEED, Math.min(CREATIVE_MOTOR_MAX_SPEED, speed + delta));
	return next === 0 ? (delta > 0 ? 1 : -1) : next;
}

/** Parse the exact signed RPM entered in the Bedrock wrench form. */
export function parseCreativeMotorSpeed(value) {
	if (typeof value !== "string" || !/^-?\d+$/.test(value.trim()))
		throw new TypeError("Speed must be a whole number");
	const speed = Number(value.trim());
	if (!Number.isSafeInteger(speed) || speed === 0 || speed < CREATIVE_MOTOR_MIN_SPEED || speed > CREATIVE_MOTOR_MAX_SPEED)
		throw new RangeError(`Speed must be between ${CREATIVE_MOTOR_MIN_SPEED} and ${CREATIVE_MOTOR_MAX_SPEED} RPM`);
	return speed;
}
