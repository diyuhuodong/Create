import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { ElevatorColumnRegistry } from "./elevator-column.js";

const ELEVATOR_CONTACT_BLOCK = "createbedrock:elevator_contact";
const CALLING_STATE = "createbedrock:calling";
const POWERING_STATE = "createbedrock:powering";
const FACING_NAMES = { 2: "north", 3: "south", 4: "west", 5: "east", north: "north", south: "south", west: "west", east: "east" };
const registry = new ElevatorColumnRegistry();
const store = new ShardedStateStore({
	keyPrefix: "createbedrock:elevator_contacts_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Elevator contact state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind === "elevator_contact")
			return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.z / 16)}`;
		if (record?.kind === "elevator_column")
			return `${record.dimensionId}:${Math.floor(record.column.x / 16)}:${Math.floor(record.column.z / 16)}`;
		throw new TypeError("Unknown elevator contact record");
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function facingFor(block) {
	return FACING_NAMES[block?.permutation?.getAllStates?.()["minecraft:facing_direction"]];
}

function persist() {
	store.request(registry.snapshot());
}

function setBlockState(dimensionId, location, property, value) {
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		if (block?.typeId !== ELEVATOR_CONTACT_BLOCK || !block.permutation?.getAllStates || typeof block.setPermutation !== "function")
			return false;
		if (block.permutation.getAllStates()[property] === undefined || block.permutation.getAllStates()[property] === value)
			return false;
		block.setPermutation(block.permutation.withState(property, value));
		return true;
	} catch {
		return false;
	}
}

function ensureContact(block) {
	if (block?.typeId !== ELEVATOR_CONTACT_BLOCK)
		return undefined;
	const facing = facingFor(block);
	if (!facing)
		return undefined;
	const contact = registry.registerContact({ dimensionId: block.dimension.id, facing, location: block.location });
	persist();
	return contact;
}

function applyRequestVisuals(dimensionId, column, target) {
	for (const contact of registry.contactsInColumn(dimensionId, column))
		setBlockState(dimensionId, contact.location, CALLING_STATE, contact.location.y === target.location.y ? 1 : 0);
}

function showConfiguration(player, contact) {
	const form = new ModalFormData()
		.title("Elevator Contact")
		.label(`Floor settings • revision ${contact.revision}`)
		.textField("Floor identifier", "e.g. G, 1, lobby", { defaultValue: contact.floorId })
		.textField("Display name", "e.g. Ground Floor", { defaultValue: contact.floorName })
		.submitButton("Save");
	form.show(player).then(response => {
		if (response.canceled)
			return;
		const [floorId, floorName] = response.formValues ?? [];
		const result = registry.configureContact({
			dimensionId: contact.dimensionId,
			expectedRevision: contact.revision,
			location: contact.location,
			patch: { floorId, floorName }
		});
		if (result.conflict) {
			player.sendMessage?.("This elevator contact changed. Reopen it before saving.");
			return;
		}
		if (result.changed)
			persist();
	}).catch(error => player.sendMessage?.(`Could not configure elevator contact: ${error}`));
}

export function captureElevatorContactMovingData(dimensionId, location) {
	const block = world.getDimension(dimensionId).getBlock(location);
	const contact = ensureContact(block);
	return contact && { floorId: contact.floorId, floorName: contact.floorName, schemaVersion: 1 };
}

export function detachElevatorContactMovingData(dimensionId, location) {
	const removed = registry.removeContact(dimensionId, location);
	if (removed)
		persist();
	return removed;
}

export function restoreElevatorContactMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	if (data?.schemaVersion !== 1)
		throw new TypeError("Moving elevator contacts require schema version 1");
	const block = world.getDimension(dimensionId).getBlock(location);
	const facing = facingFor(block);
	if (!facing)
		throw new Error("Cannot restore an elevator contact without a horizontal facing");
	registry.registerContact({ dimensionId, facing, floorId: data.floorId, floorName: data.floorName, location });
	persist();
	return true;
}

/** Called by the motion contact edge tracker, never from marker positions. */
export function notifyElevatorContactReached(dimensionId, location) {
	const reached = registry.reportFloorReached({ dimensionId, location });
	for (const contact of reached.contacts)
		setBlockState(dimensionId, contact.location, CALLING_STATE, 0);
	setBlockState(dimensionId, location, POWERING_STATE, 1);
	system.runTimeout(() => setBlockState(dimensionId, location, POWERING_STATE, 0), 1);
	persist();
	return reached;
}

export function getElevatorContactDiagnostics() {
	return { contacts: registry.snapshot().filter(record => record.kind === "elevator_contact").length, persistence: store.diagnostics() };
}

export function registerElevatorContacts() {
	world.afterEvents.playerPlaceBlock.subscribe(event => ensureContact(event.block));
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (registry.removeContact(event.dimension.id, event.block.location))
			persist();
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId !== ELEVATOR_CONTACT_BLOCK || event.itemStack)
			return;
		const contact = ensureContact(event.block);
		if (!contact)
			return;
		if (event.player.isSneaking) {
			showConfiguration(event.player, contact);
			return;
		}
		const column = { facing: contact.facing, x: contact.location.x, z: contact.location.z };
		const result = registry.requestFloor({ column, dimensionId: contact.dimensionId, floorId: contact.floorId });
		if (!result.ok) {
			event.player.sendMessage?.("This elevator floor is not registered.");
			return;
		}
		applyRequestVisuals(contact.dimensionId, column, result.target);
		persist();
	});
	system.run(() => {
		try {
			const restored = store.read();
			if (restored)
				registry.restore(restored.records);
			for (const warning of restored?.warnings ?? [])
				console.warn(`[Create Bedrock] Ignored corrupt elevator contact shard ${warning.partition}: ${warning.error}`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not restore elevator contacts: ${error}`);
		}
	});
}
