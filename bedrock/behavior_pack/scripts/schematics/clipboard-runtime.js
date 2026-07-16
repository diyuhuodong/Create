import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { createClipboardState, normalizeClipboardRecord } from "./clipboard-state.js";

export const CLIPBOARD_BLOCK = "createbedrock:clipboard";

const records = new Map();
let failedUpdates = 0;
let registered = false;

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function recordId(dimensionId, location) {
	return `clipboard:${dimensionId}:${locationKey(location)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:clipboard_v1",
	onError(error) { console.warn(`[Create Bedrock] Clipboard state error: ${error}`); },
	partitionFor(record) {
		if (!record?.id?.startsWith("clipboard:"))
			throw new TypeError("Unknown Clipboard persistent record");
		return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.y / 16)}:${Math.floor(record.location.z / 16)}`;
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persist() {
	try { store.request([...records.values()].sort((left, right) => left.id.localeCompare(right.id))); } catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Clipboard state: ${error}`);
	}
}

function ensureRecord(block) {
	if (block?.typeId !== CLIPBOARD_BLOCK)
		return undefined;
	const id = recordId(block.dimension.id, block.location);
	const current = records.get(id);
	if (current)
		return current;
	const record = normalizeClipboardRecord({ dimensionId: block.dimension.id, location: block.location, state: createClipboardState() });
	records.set(id, record);
	persist();
	return record;
}

function removeRecord(dimensionId, location) {
	if (records.delete(recordId(dimensionId, location)))
		persist();
}

function editClipboard(player, block) {
	const record = ensureRecord(block);
	if (!record)
		return;
	new ModalFormData()
		.title("Clipboard")
		.textField("Notes", "Write up to 2,048 characters", { defaultValue: record.state.text })
		.show(player)
		.then(response => {
			if (response.canceled)
				return;
			try {
				const text = String(response.formValues?.[0] ?? "");
				record.state = createClipboardState({ revision: record.state.revision + 1, text });
				persist();
				player.sendMessage?.("Clipboard saved.");
			} catch (error) {
				failedUpdates++;
				player.sendMessage?.(`Clipboard update rejected: ${error}`);
			}
		})
		.catch(error => {
			failedUpdates++;
			player.sendMessage?.(`Could not open Clipboard: ${error}`);
		});
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Clipboard shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			const record = normalizeClipboardRecord(entry);
			records.set(record.id, record);
		}
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Clipboard state: ${error}`);
	}
}

export function getClipboardDiagnostics() {
	return { failedUpdates, persistence: store.diagnostics(), records: records.size };
}

export function registerClipboards() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block?.typeId === CLIPBOARD_BLOCK)
			ensureRecord(event.block);
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (event.block?.typeId === CLIPBOARD_BLOCK)
			removeRecord(event.dimension.id, event.block.location);
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block?.typeId === CLIPBOARD_BLOCK)
			editClipboard(event.player, event.block);
	});
	registerTickHandler(() => store.tick(), "clipboard");
	restore();
	return true;
}
