import { boilerEngineEfficiency } from "./boiler-model.js";

export const BOILER_CONTROLLER_SCHEMA = 1;
export const BOILER_SAMPLE_INTERVAL_TICKS = 5;
export const BOILER_SAMPLE_WINDOW = 20;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function integer(value, label, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isInteger(value) || value < 0 || value > maximum)
		throw new RangeError(`${label} must be a non-negative bounded integer`);
	return value;
}

export function createBoilerController({ activeHeat = 0, engineIds = [], gatheredSupply = 0, memberWater = {}, members = [], passiveHeat = false, sampleTicks = 0, waterSamples = [], ...patch } = {}) {
	if (!Array.isArray(engineIds) || engineIds.some(id => typeof id !== "string" || id.length === 0) || new Set(engineIds).size !== engineIds.length)
		throw new TypeError("Boiler engines must use unique stable identifiers");
	if (!Array.isArray(members) || members.length === 0)
		throw new TypeError("Boiler controllers require at least one Tank member");
	if (!Array.isArray(waterSamples) || waterSamples.length > BOILER_SAMPLE_WINDOW)
		throw new RangeError("Boiler sample history exceeds its bounded window");
	if (typeof passiveHeat !== "boolean")
		throw new TypeError("Boiler passive heat must be boolean");
	if (!memberWater || typeof memberWater !== "object" || Array.isArray(memberWater))
		throw new TypeError("Boiler member water observations must be an object");
	const normalizedMemberWater = {};
	for (const [id, amount] of Object.entries(memberWater)) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Boiler member water observations require Tank identifiers");
		normalizedMemberWater[id] = integer(amount, "Boiler member water");
	}
	return {
		...clone(patch),
		activeHeat: integer(activeHeat, "Boiler active heat", 18),
		engineIds: [...engineIds].sort(),
		gatheredSupply: integer(gatheredSupply, "Boiler gathered supply"),
		memberWater: normalizedMemberWater,
		members: clone(members),
		passiveHeat,
		sampleTicks: integer(sampleTicks, "Boiler sample ticks", BOILER_SAMPLE_INTERVAL_TICKS - 1),
		schemaVersion: BOILER_CONTROLLER_SCHEMA,
		waterSamples: waterSamples.map(sample => integer(sample, "Boiler water sample"))
	};
}

export function sampleBoilerWater(controller, suppliedWater) {
	const current = createBoilerController(controller);
	const samples = [...current.waterSamples, integer(suppliedWater, "Boiler supplied water")].slice(-BOILER_SAMPLE_WINDOW);
	return createBoilerController({ ...current, waterSamples: samples });
}

export function observeBoilerWater(controller, memberWater) {
	const current = createBoilerController(controller);
	const observed = createBoilerController({ ...current, memberWater });
	let gatheredSupply = current.gatheredSupply;
	for (const [tankId, amount] of Object.entries(observed.memberWater))
		if (current.memberWater[tankId] !== undefined)
			gatheredSupply += Math.max(0, amount - current.memberWater[tankId]);
	const sampleTicks = current.sampleTicks + 1;
	const next = createBoilerController({ ...observed, gatheredSupply, sampleTicks: sampleTicks % BOILER_SAMPLE_INTERVAL_TICKS });
	if (sampleTicks < BOILER_SAMPLE_INTERVAL_TICKS)
		return next;
	return sampleBoilerWater({ ...next, gatheredSupply: 0 }, Math.floor(gatheredSupply / BOILER_SAMPLE_INTERVAL_TICKS));
}

export function evaluateBoilerController(controller) {
	const current = createBoilerController(controller);
	const distribution = boilerEngineEfficiency({
		activeHeat: current.activeHeat,
		engineCount: current.engineIds.length,
		passiveHeat: current.passiveHeat,
		tankBlocks: current.members.length,
		waterSamples: current.waterSamples.length === 0 ? [0] : current.waterSamples
	});
	return {
		...distribution,
		engines: Object.fromEntries(current.engineIds.map(id => [id, distribution.efficiency])),
		waterSamples: [...current.waterSamples]
	};
}
