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

// Interaction events and raycasts both use Direction, but Script API releases
// have exposed it as either the numeric enum or a named string. Normalising
// here keeps the value board and its click target on the exact same faces.
export function creativeMotorFaceIndex(face) {
	if (Number.isInteger(face) && face >= 0 && face <= 5)
		return face;
	if (typeof face !== "string")
		return undefined;
	return FACING_DIRECTION_INDEX[face.toLowerCase()];
}

/**
 * Convert the modern placement-direction strings to Bedrock's numeric face
 * index. Numbers stay accepted solely to keep old saved permutations readable.
 */
export function creativeMotorFacingIndex(facingDirection) {
	return creativeMotorFaceIndex(facingDirection);
}

function inValueBox(value) {
	return Number.isFinite(value) && value >= CREATIVE_MOTOR_VALUE_BOX_MIN && value <= CREATIVE_MOTOR_VALUE_BOX_MAX;
}

/** Whether a hit targets one of Java Create's visible Creative Motor value boxes. */
export function isCreativeMotorValueBox({ blockFace, faceLocation, facingDirection }) {
	const faceIndex = creativeMotorFaceIndex(blockFace);
	const facingIndex = creativeMotorFacingIndex(facingDirection);
	if (!Number.isInteger(faceIndex) || !Number.isInteger(facingIndex) || !faceLocation)
		return false;
	const blockAxis = FACE_AXIS[faceIndex];
	const facingAxis = FACE_AXIS[facingIndex];
	if (!blockAxis || !facingAxis || blockAxis === facingAxis)
		return false;
	if (facingAxis !== "y" && faceIndex === 0)
		return false;
	// Direction is the Bedrock block-facing enum: down/up/north/south/west/east.
	// Test only the two coordinates that lie in the selected face plane.
	if (faceIndex === 0 || faceIndex === 1)
		return inValueBox(faceLocation.x) && inValueBox(faceLocation.z);
	if (faceIndex === 2 || faceIndex === 3)
		return inValueBox(faceLocation.x) && inValueBox(faceLocation.y);
	if (faceIndex === 4 || faceIndex === 5)
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

/**
 * Modal-form dropdowns have returned both indexes and labels across Script API
 * versions. Accept each representation so choosing \"反转\" cannot silently
 * fall through to the positive direction.
 */
export function creativeMotorDirectionFromEditorValue(value) {
	if (value === 1 || value === true)
		return -1;
	if (value === 0 || value === false)
		return 1;
	if (typeof value !== "string")
		throw new TypeError("Creative Motor direction selection is invalid");
	const normalized = value.trim().toLowerCase();
	if (["1", "reverse", "反转"].includes(normalized))
		return -1;
	if (["0", "forward", "正转"].includes(normalized))
		return 1;
	throw new TypeError("Creative Motor direction selection is invalid");
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
