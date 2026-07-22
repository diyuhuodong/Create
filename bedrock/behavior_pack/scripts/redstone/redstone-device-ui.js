import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

import { openConfigurationFormSession, submitVersionedConfigurationForm } from "../kernel/configuration-protocol.js";
import { deviceConfigurationFields } from "./redstone-device-configuration.js";
import { LINKED_CONTROLLER_CHANNELS } from "./linked-controller-bindings.js";

function displayName(kind) {
	return kind.split("_").map(part => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function formValue(response, index) {
	const value = response.formValues?.[index];
	if (value === undefined || value === null)
		throw new Error("Bedrock returned an incomplete configuration form");
	return value;
}

function parseInteger(value, field) {
	if (typeof value !== "string" || !/^-?\d+$/.test(value.trim()))
		throw new TypeError(`${field.label} must be a whole number`);
	return Number(value.trim());
}

function parseItem(value, field) {
	if (typeof value !== "string")
		throw new TypeError(`${field.label} must be an item identifier`);
	return value.trim();
}

function patchFromResponse(response, fields) {
	const patch = {};
	for (let index = 0; index < fields.length; index++) {
		const field = fields[index];
		const value = formValue(response, index);
		if (field.type === "integer")
			patch[field.key] = parseInteger(value, field);
		else if (field.type === "item")
			patch[field.key] = parseItem(value, field);
		else if (field.type === "boolean") {
			if (typeof value !== "boolean")
				throw new TypeError(`${field.label} must be true or false`);
			patch[field.key] = value;
		} else if (field.type === "enum") {
			if (!Number.isInteger(value) || value < 0 || value >= field.options.length)
				throw new RangeError(`${field.label} selection is invalid`);
			patch[field.key] = field.options[value];
		} else if (field.type === "text" || field.type === "network" || field.type === "address")
			patch[field.key] = parseItem(value, field);
	}
	return patch;
}

function currentValue(configuration, state, field) {
	if (field.storage === "settings")
		return configuration.settings[field.key] ?? field.defaultValue;
	if (field.key === "frequencyLeft")
		return state.frequency[0];
	if (field.key === "frequencyRight")
		return state.frequency[1];
	return state[field.key];
}

function addField(form, configuration, state, field) {
	const current = currentValue(configuration, state, field);
	if (field.type === "integer")
		form.textField(field.label, `${field.min}..${field.max}`, { defaultValue: String(current) });
	else if (field.type === "item")
		form.textField(field.label, "minecraft:air", { defaultValue: String(current) });
	else if (field.type === "boolean")
		form.toggle(field.label, { defaultValue: current === true });
	else if (field.type === "enum")
		form.dropdown(field.label, field.options, { defaultValueIndex: Math.max(0, field.options.indexOf(current)) });
	else if (field.type === "text" || field.type === "network" || field.type === "address")
		form.textField(field.label, "Optional text", { defaultValue: String(current) });
}

/**
 * Opens the common server-authoritative block-settings form. The caller owns
 * the final compare-and-swap commit because a player may leave the UI open
 * while another player changes the same block.
 */
export function showRedstoneDeviceConfigurationForm({ configuration, currentRevision, player, state, subjectId, submit }) {
	const fields = deviceConfigurationFields(state.kind);
	if (fields.length === 0) {
		player.sendMessage?.(`${displayName(state.kind)} has no editable settings in this phase.`);
		return Promise.resolve(false);
	}
	const session = openConfigurationFormSession({ revision: configuration.revision, subjectId });
	const form = new ModalFormData()
		.title(`${displayName(state.kind)} Settings`)
		.label(`Public settings • revision ${configuration.revision}`);
	for (const field of fields)
		addField(form, configuration, state, field);
	form.submitButton("Save");
	return form.show(player).then(response => {
		if (response.canceled)
			return false;
		const result = submitVersionedConfigurationForm({
			actualRevision: currentRevision,
			session,
			submit: expectedRevision => submit({ expectedRevision, patch: patchFromResponse(response, fields) })
		});
		if (result.conflict)
			player.sendMessage?.("These settings changed while the form was open. Reopen it and try again.");
		return result.changed;
	}).catch(error => {
		player.sendMessage?.(`Could not save ${displayName(state.kind)} settings: ${error}`);
		return false;
	});
}

/** The handheld Controller has six independent ordered Redstone Link pairs. */
export function showLinkedControllerConfigurationForm({ player, state, submit }) {
	const form = new ModalFormData()
		.title("Linked Controller Settings")
		.label(`Stored on this controller • revision ${state.revision}`);
	for (let channel = 0; channel < LINKED_CONTROLLER_CHANNELS; channel++) {
		form.textField(`Channel ${channel + 1}, frequency item 1`, "minecraft:air", { defaultValue: state.channels[channel][0] });
		form.textField(`Channel ${channel + 1}, frequency item 2`, "minecraft:air", { defaultValue: state.channels[channel][1] });
	}
	form.submitButton("Save controller");
	return form.show(player).then(response => {
		if (response.canceled)
			return false;
		const frequencies = [];
		for (let channel = 0; channel < LINKED_CONTROLLER_CHANNELS; channel++) {
			const first = formValue(response, channel * 2);
			const second = formValue(response, channel * 2 + 1);
			frequencies.push([parseItem(first, { label: `Channel ${channel + 1} frequency item 1` }), parseItem(second, { label: `Channel ${channel + 1} frequency item 2` })]);
		}
		return submit({ expectedRevision: state.revision, frequencies }) === true;
	}).catch(error => {
		player.sendMessage?.(`Could not save Linked Controller settings: ${error}`);
		return false;
	});
}

/**
 * Bedrock has no keyboard-equivalent item menu while a controller is installed
 * in a lectern, so its six persisted channels are exposed as a short,
 * server-authoritative action form. The runtime owns session acquisition and
 * release around this asynchronous UI call.
 */
export function showLecternControllerUseForm({ close, player, state, trigger }) {
	const form = new ActionFormData()
		.title("Lectern Controller")
		.body("Choose a stored Linked Controller channel.");
	for (let channel = 0; channel < LINKED_CONTROLLER_CHANNELS; channel++) {
		const frequency = state.controller.channels[channel];
		form.button(`Channel ${channel + 1}\n${frequency[0]} + ${frequency[1]}`);
	}
	return form.show(player).then(response => {
		if (response.canceled || !Number.isInteger(response.selection))
			return false;
		return trigger(response.selection) === true;
	}).catch(error => {
		player.sendMessage?.(`Could not use Lectern Controller: ${error}`);
		return false;
	}).then(result => {
		try {
			close();
		} catch (error) {
			player.sendMessage?.(`Could not release Lectern Controller: ${error}`);
		}
		return result;
	});
}
