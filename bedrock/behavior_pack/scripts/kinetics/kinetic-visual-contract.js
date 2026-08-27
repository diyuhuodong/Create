export const KINETIC_VISUALS = Object.freeze({
	// The motor casing is a native block model. Only its rotating half-shaft is
	// an entity visual; this avoids fragile multi-controller entity composition.
	"createbedrock:creative_motor": { entityType: "createbedrock:creative_motor_visual", hidesBlock: false, usesFacing: true },
	"createbedrock:shaft": { entityType: "createbedrock:shaft_visual", hidesBlock: true },
	"createbedrock:cogwheel": { entityType: "createbedrock:cogwheel_visual", hidesBlock: true },
	"createbedrock:large_cogwheel": { entityType: "createbedrock:large_cogwheel_visual", hidesBlock: true },
	"createbedrock:crushing_wheel": { entityType: "createbedrock:crushing_wheel_visual", hidesBlock: true }
});

export const KINETIC_VISUAL_ENTITY_TYPES = Object.freeze(Object.values(KINETIC_VISUALS)
	.map(visual => visual.entityType));

export function kineticVisualForBlock(typeId) {
	return KINETIC_VISUALS[typeId];
}

export function kineticVisualAxis(axis) {
	return ({ x: 0, y: 1, z: 2 })[axis] ?? 1;
}

export function kineticVisualId(dimensionId, location) {
	if (typeof dimensionId !== "string" || !Number.isInteger(location?.x)
		|| !Number.isInteger(location?.y) || !Number.isInteger(location?.z))
		throw new TypeError("Kinetic visuals require a dimension and integer block location");
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}
