export const METAL_GIRDER = "createbedrock:metal_girder";
export const BRACKET_TYPES = Object.freeze({
	"createbedrock:metal_bracket": "metal",
	"createbedrock:wooden_bracket": "wooden"
});

export function girderShapeForConnections({ xNegative = false, xPositive = false, zNegative = false, zPositive = false } = {}) {
	const x = xNegative || xPositive;
	const z = zNegative || zPositive;
	if (x && z)
		return "cross";
	if (x)
		return "x";
	if (z)
		return "z";
	return "pole";
}

export function bracketTypeForNeighbor(typeId) {
	if (typeof typeId !== "string")
		return undefined;
	if (typeId.includes("cogwheel"))
		return "cog";
	if (typeId.includes("fluid_pipe") || typeId.includes("mechanical_pump") || typeId.includes("fluid_valve"))
		return "pipe";
	if (typeId.includes("shaft") || typeId.includes("cog") || typeId.includes("gearbox"))
		return "shaft";
	return undefined;
}
