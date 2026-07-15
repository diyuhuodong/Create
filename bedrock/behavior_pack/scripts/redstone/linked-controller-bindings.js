import { normalizeRedstoneLinkFrequency } from "./redstone-link-network.js";

export const LINKED_CONTROLLER_CHANNELS = 6;

function emptyFrequency() {
	return ["minecraft:air", "minecraft:air"];
}

/** Accept the former single-pair record while normalizing current six-pair bindings. */
export function normalizeLinkedControllerBindings(value) {
	if (Array.isArray(value) && value.length === 2 && value.every(part => typeof part === "string")) {
		const legacy = normalizeRedstoneLinkFrequency(value);
		return [legacy, ...Array.from({ length: LINKED_CONTROLLER_CHANNELS - 1 }, emptyFrequency)];
	}
	if (!Array.isArray(value) || value.length !== LINKED_CONTROLLER_CHANNELS)
		return Array.from({ length: LINKED_CONTROLLER_CHANNELS }, emptyFrequency);
	return value.map(normalizeRedstoneLinkFrequency);
}

export function linkedControllerChannelForSlot(slot) {
	if (!Number.isInteger(slot) || slot < 0)
		return 0;
	return slot % LINKED_CONTROLLER_CHANNELS;
}

export function setLinkedControllerChannel(bindings, channel, frequency) {
	if (!Number.isInteger(channel) || channel < 0 || channel >= LINKED_CONTROLLER_CHANNELS)
		throw new RangeError(`Linked Controller channels must be from 0 through ${LINKED_CONTROLLER_CHANNELS - 1}`);
	const next = normalizeLinkedControllerBindings(bindings).map(pair => [...pair]);
	next[channel] = normalizeRedstoneLinkFrequency(frequency);
	return next;
}
