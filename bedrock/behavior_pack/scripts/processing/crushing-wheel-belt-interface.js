const HORIZONTAL_FACING = Object.freeze({
	east: { x: 1, y: 0, z: 0 },
	north: { x: 0, y: 0, z: -1 },
	south: { x: 0, y: 0, z: 1 },
	west: { x: -1, y: 0, z: 0 },
	2: { x: 0, y: 0, z: -1 },
	3: { x: 0, y: 0, z: 1 },
	4: { x: -1, y: 0, z: 0 },
	5: { x: 1, y: 0, z: 0 }
});

function assertLocation(location, name) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError(`${name} requires integer block coordinates`);
	return { x: location.x, y: location.y, z: location.z };
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function squaredDistance(left, right) {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	const dz = left.z - right.z;
	return dx * dx + dy * dy + dz * dz;
}

export function crushingBeltEndpoints({ belts, controller }) {
	const center = assertLocation(controller, "Crushing controller");
	if (!Array.isArray(belts))
		throw new TypeError("Crushing belt endpoints require a belt array");
	const inputs = [];
	const outputs = [];
	for (const belt of belts) {
		const location = assertLocation(belt?.location, "Crushing belt");
		const facing = HORIZONTAL_FACING[belt.facing];
		if (!facing || location.y !== center.y)
			continue;
		const fromController = { x: location.x - center.x, y: 0, z: location.z - center.z };
		if (Math.abs(fromController.x) + Math.abs(fromController.z) !== 1)
			continue;
		const endpoint = { facing: belt.facing, location };
		if (facing.x === -fromController.x && facing.z === -fromController.z)
			inputs.push(endpoint);
		if (facing.x === fromController.x && facing.z === fromController.z)
			outputs.push(endpoint);
	}
	const order = (left, right) => locationKey(left.location).localeCompare(locationKey(right.location));
	return { inputs: inputs.sort(order), outputs: outputs.sort(order) };
}

/** Pick exactly one item entity for one active controller, avoiding incidental nearby drops. */
export function selectCrushingEntityInput({ controller, endpoints, entities, pairActive }) {
	if (pairActive !== true || !Array.isArray(entities))
		return undefined;
	const center = assertLocation(controller, "Crushing controller");
	const intakeCenters = endpoints?.inputs?.map(endpoint => ({
		x: endpoint.location.x + 0.5,
		y: endpoint.location.y + 0.5,
		z: endpoint.location.z + 0.5
	})) ?? [];
	intakeCenters.push({ x: center.x + 0.5, y: center.y + 0.5, z: center.z + 0.5 });
	return entities
		.filter(entity => typeof entity?.id === "string" && entity.id.length > 0 && entity.item
			&& typeof entity.item.typeId === "string" && Number.isInteger(entity.item.count) && entity.item.count > 0
			&& entity.location && intakeCenters.some(target => squaredDistance(entity.location, target) <= 0.64))
		.sort((left, right) => left.id.localeCompare(right.id))[0];
}
