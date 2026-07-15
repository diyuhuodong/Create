const AXES = ["x", "y", "z"];

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Crushing-wheel controller locations require integer coordinates");
	return location;
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function oppositeWheelLocation(controller, axis, distance) {
	return {
		x: controller.x + (axis === "x" ? distance : 0),
		y: controller.y + (axis === "y" ? distance : 0),
		z: controller.z + (axis === "z" ? distance : 0)
	};
}

/**
 * Resolve the Java Create crushing-wheel arrangement without depending on a
 * live Bedrock Block object. A valid controller sits exactly between two
 * wheels with the same rotation axis; their rotations must oppose each other
 * and the wheel axle cannot point through the controller.
 */
export function resolveCrushingWheelControllerPair({ controller, wheels }) {
	const location = assertLocation(controller);
	if (!Array.isArray(wheels))
		throw new TypeError("Crushing-wheel controller resolution requires a wheel array");
	const byLocation = new Map(wheels.map(wheel => [locationKey(assertLocation(wheel.location)), wheel]));
	for (const separationAxis of AXES) {
		const first = byLocation.get(locationKey(oppositeWheelLocation(location, separationAxis, -1)));
		const second = byLocation.get(locationKey(oppositeWheelLocation(location, separationAxis, 1)));
		if (!first || !second || !AXES.includes(first.axis) || first.axis !== second.axis || first.axis === separationAxis)
			continue;
		if (!Number.isFinite(first.speed) || !Number.isFinite(second.speed) || first.speed === 0 || second.speed === 0)
			continue;
		if ((first.speed > 0) === (second.speed > 0))
			continue;
		return {
			active: true,
			rotationAxis: first.axis,
			separationAxis,
			speed: Math.min(Math.abs(first.speed), Math.abs(second.speed))
		};
	}
	return { active: false, speed: 0 };
}
