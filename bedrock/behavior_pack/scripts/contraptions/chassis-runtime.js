import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerAssemblyAttachmentProvider } from "./assembly-attachments.js";
import { isMovableBlockType } from "./movable-blocks.js";
import {
	chassisRange,
	CHASSIS_BLOCKS,
	DIRECTION_VECTORS,
	isChassis,
	isLinearChassis,
	offsetLocation,
	oppositeFacing,
	perpendicularFacings,
	radialDistance,
	radialStickyProperty
} from "./chassis.js";

let configured = 0;
let registered = false;

function statesFor(block) { return block?.permutation?.getAllStates?.() ?? {}; }
function facingFor(block) {
	const facing = statesFor(block)["minecraft:facing_direction"];
	return DIRECTION_VECTORS[facing] ? facing : 1;
}
function setStates(block, patch) {
	if (!isChassis(block?.typeId) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	for (const [name, value] of Object.entries(patch))
		permutation = permutation.withState(name, value);
	block.setPermutation(permutation);
	return true;
}
function cloneLocation(location) { return { x: location.x, y: location.y, z: location.z }; }

function linearLocations(dimension, block) {
	const states = statesFor(block);
	const facing = facingFor(block);
	const locations = [];
	for (const [direction, property] of [[facing, "createbedrock:sticky_positive"], [oppositeFacing(facing), "createbedrock:sticky_negative"]]) {
		if (states[property] !== 1 || direction === undefined)
			continue;
		for (let distance = 1; distance <= chassisRange(states); distance++) {
			const location = offsetLocation(block.location, direction, distance);
			const candidate = dimension.getBlock(location);
			if (!candidate || !isMovableBlockType(candidate.typeId))
				break;
			locations.push(location);
		}
	}
	return locations;
}

function radialLocations(dimension, block) {
	const states = statesFor(block);
	const facing = facingFor(block);
	const range = chassisRange(states);
	const pending = [];
	for (const direction of perpendicularFacings(facing)) {
		const property = radialStickyProperty(direction);
		if (property && states[property] === 1)
			pending.push(offsetLocation(block.location, direction));
	}
	const visited = new Set();
	const locations = [];
	while (pending.length > 0) {
		const location = pending.shift();
		const key = `${location.x}:${location.y}:${location.z}`;
		if (visited.has(key) || radialDistance(block.location, location) > range)
			continue;
		visited.add(key);
		const candidate = dimension.getBlock(location);
		if (!candidate || !isMovableBlockType(candidate.typeId))
			continue;
		locations.push(location);
		for (const direction of perpendicularFacings(facing))
			pending.push(offsetLocation(location, direction));
	}
	return locations;
}

/** The assembly collector calls this for every visited chassis. */
export function chassisLinkedLocationsForAssembly(dimensionId, location) {
	try {
		const dimension = world.getDimension(dimensionId);
		const block = dimension.getBlock(location);
		if (!isChassis(block?.typeId))
			return [];
		const linked = isLinearChassis(block.typeId) ? linearLocations(dimension, block) : radialLocations(dimension, block);
		return linked.map(cloneLocation);
	} catch {
		return [];
	}
}

function showConfiguration(player, block) {
	const states = statesFor(block);
	const linear = isLinearChassis(block.typeId);
	const form = new ModalFormData()
		.title(linear ? "Linear Chassis" : "Radial Chassis")
		.slider(linear ? "Attachment range" : "Attachment radius", 1, 16, { defaultValue: chassisRange(states) });
	if (linear) {
		form.toggle("Positive axis sticky", { defaultValue: states["createbedrock:sticky_positive"] === 1 });
		form.toggle("Negative axis sticky", { defaultValue: states["createbedrock:sticky_negative"] === 1 });
	} else {
		form.toggle("North sticky", { defaultValue: states["createbedrock:sticky_north"] === 1 });
		form.toggle("South sticky", { defaultValue: states["createbedrock:sticky_south"] === 1 });
		form.toggle("West sticky", { defaultValue: states["createbedrock:sticky_west"] === 1 });
		form.toggle("East sticky", { defaultValue: states["createbedrock:sticky_east"] === 1 });
	}
	form.submitButton("Save chassis settings");
	form.show(player).then(response => {
		if (response.canceled)
			return;
		const values = response.formValues ?? [];
		const patch = { "createbedrock:range": Math.round(Number(values[0])) };
		if (linear) {
			patch["createbedrock:sticky_positive"] = values[1] === true ? 1 : 0;
			patch["createbedrock:sticky_negative"] = values[2] === true ? 1 : 0;
		} else {
			for (const [index, name] of ["north", "south", "west", "east"].entries())
				patch[`createbedrock:sticky_${name}`] = values[index + 1] === true ? 1 : 0;
		}
		if (setStates(block, patch)) {
			configured++;
			player.sendMessage?.("Chassis attachment settings saved.");
		}
	}).catch(error => player.sendMessage?.(`Could not configure chassis: ${error}`));
}

export function getChassisDiagnostics() { return { configured }; }

export function registerChassis() {
	if (registered)
		return false;
	registered = true;
	registerAssemblyAttachmentProvider("chassis", chassisLinkedLocationsForAssembly);
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (!isChassis(event.block?.typeId) || !event.player.isSneaking)
			return;
		showConfiguration(event.player, event.block);
	});
	return true;
}
