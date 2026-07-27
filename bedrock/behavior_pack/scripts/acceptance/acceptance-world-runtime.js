import { system, world } from "@minecraft/server";

import { ACCEPTANCE_WORLD_LAYOUT } from "./generated/acceptance-world-layout.js";
import { AcceptanceWorldState } from "./acceptance-world-state.js";

const EVENT_ID = "createbedrock:acceptance";
const STATE_KEY = "createbedrock:p7_7_acceptance_world";
let registered = false;

function describe(result) {
	const state = result.state ?? result;
	return `acceptance world: ${result.ok === false ? result.reason : "ok"}; checkpoint=${state.activeCheckpoint ?? "none"}; zones=${state.zoneCount}; scenarios=${state.scenarioCount}`;
}

function reply(event, result) {
	const message = `[Create Bedrock] ${describe(result)}`;
	console.warn(message);
	try { event.sourceEntity?.sendMessage?.(message); } catch (error) { console.warn(`[Create Bedrock] Could not return acceptance status: ${error}`); }
}

function readState() {
	const saved = world.getDynamicProperty(STATE_KEY);
	const state = new AcceptanceWorldState(ACCEPTANCE_WORLD_LAYOUT);
	if (typeof saved === "string" && saved.length > 0)
		state.restore(JSON.parse(saved));
	return state;
}

function persist(state) {
	world.setDynamicProperty(STATE_KEY, JSON.stringify(state.snapshot()));
}

function snapshots(providers) {
	return Object.fromEntries(Object.entries(providers).map(([id, provider]) => {
		try { return [id, provider()]; } catch (error) { console.warn(`[Create Bedrock] Acceptance snapshot provider ${id} failed: ${error}`); return [id, undefined]; }
	}));
}

export function registerAcceptanceWorld({ providers = {} } = {}) {
	if (registered)
		return;
	registered = true;
	system.afterEvents.scriptEventReceive.subscribe(event => {
		if (event.id !== EVENT_ID)
			return;
		const [command, checkpoint] = String(event.message ?? "").trim().split(/\s+/, 2);
		const state = readState();
		let result;
		if (command === "setup")
			result = state.setup(snapshots(providers));
		else if (command === "reset") {
			state.reset();
			result = { ok: true, state: state.status() };
		} else if (command === "checkpoint" && checkpoint)
			result = state.checkpoint(checkpoint, snapshots(providers));
		else if (command === "status")
			result = { ok: true, state: state.status() };
		else
			result = { ok: false, reason: "usage setup|reset|checkpoint W1|W2|W3|status", state: state.status() };
		if (command !== "status")
			persist(state);
		reply(event, result);
	});
}

export function getAcceptanceWorldDiagnostics() {
	try {
		const status = readState().status();
		return { activeCheckpoint: status.activeCheckpoint, checkpoints: Object.keys(status.checkpoints).length, zones: status.zoneCount };
	} catch (error) {
		return { error: String(error), state: "unavailable" };
	}
}
