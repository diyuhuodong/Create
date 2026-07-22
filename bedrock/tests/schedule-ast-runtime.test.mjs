import assert from "node:assert/strict";
import test from "node:test";

import {
	createScheduleAst,
	legacyScheduleView,
	migrateLegacySchedule,
	normalizeScheduleCondition,
	normalizeScheduleInstruction,
	SCHEDULE_CONDITION_TYPES,
	SCHEDULE_INSTRUCTION_TYPES,
	updateScheduleAst
} from "../behavior_pack/scripts/trains/schedule-ast.js";
import { evaluateScheduleCondition, ScheduleRuntime, SCHEDULE_RUNTIME_STATE } from "../behavior_pack/scripts/trains/schedule-runtime.js";

test("Schedule AST accepts all five instructions and nine wait conditions", () => {
	const instructions = [
		{ exact: true, filter: "Central", type: "destination" },
		{ address: "Factory", type: "package_delivery" },
		{ address: "Depot", type: "package_retrieval" },
		{ title: "Night Express", type: "rename" },
		{ percent: 45, type: "throttle" }
	];
	const conditions = [
		{ ticks: 20, type: "delay" },
		{ hour: 6, minute: 30, rotation: 1, type: "time_of_day" },
		{ amount: 1_000, fluidId: "minecraft:water", operator: "gte", type: "fluid_threshold" },
		{ count: 16, filter: "minecraft:iron_ingot", operator: "lte", type: "item_threshold" },
		{ frequencyA: "iron", frequencyB: "brass", powered: true, type: "redstone_link" },
		{ count: 2, operator: "gte", type: "player_count" },
		{ ticks: 100, type: "idle" },
		{ type: "unloaded" },
		{ powered: false, type: "powered" }
	];
	assert.deepEqual(instructions.map(value => normalizeScheduleInstruction(value).type), SCHEDULE_INSTRUCTION_TYPES);
	assert.deepEqual(conditions.map(value => normalizeScheduleCondition(value).type), SCHEDULE_CONDITION_TYPES);
	assert.throws(() => normalizeScheduleCondition({ powered: "yes", type: "powered" }), /boolean/);
});

test("Schedule AST migrates legacy stop lists and protects revisioned edits", () => {
	const migrated = migrateLegacySchedule({ cyclic: false, dwellTicks: 30, revision: 4, stopIds: ["a", "b"] });
	assert.deepEqual(legacyScheduleView(migrated), { cyclic: false, dwellTicks: 30, revision: 4, stopIds: ["a", "b"] });
	assert.deepEqual(updateScheduleAst(migrated, 3, schedule => schedule), { current: migrated, ok: false, reason: "revision_conflict" });
	const updated = updateScheduleAst(migrated, 4, schedule => createScheduleAst({ ...schedule, cyclic: true }));
	assert.equal(updated.schedule.cyclic, true);
	assert.equal(updated.schedule.revision, 5);
});

test("Schedule wait evaluator uses sequential AND inside branches", () => {
	const delay = { ticks: 2, type: "delay" };
	const context = {};
	assert.equal(evaluateScheduleCondition(delay, context, {}), false);
	assert.equal(evaluateScheduleCondition(delay, context, {}), true);
	assert.equal(evaluateScheduleCondition({ hour: 6, minute: 0, rotation: 1, type: "time_of_day" }, {}, { timeOfDay: () => 30_000 }), true);
	assert.equal(evaluateScheduleCondition({ count: 3, operator: "gte", type: "player_count" }, {}, { passengerCount: () => 3 }), true);
});

test("Schedule runtime executes instructions, OR branches, pause, and restart recovery", () => {
	const schedule = createScheduleAst({
		cyclic: false,
		entries: [
			{ conditionBranches: [[{ ticks: 2, type: "delay" }], [{ powered: true, type: "powered" }]], instruction: { exact: true, filter: "b", type: "destination" } },
			{ conditionBranches: [], instruction: { title: "Brass Line", type: "rename" } },
			{ conditionBranches: [], instruction: { percent: 40, type: "throttle" } },
			{ conditionBranches: [], instruction: { address: "Factory", type: "package_delivery" } },
			{ conditionBranches: [], instruction: { address: "Depot", type: "package_retrieval" } }
		]
	});
	let navigating = false;
	const calls = [];
	const environment = {
		deliverPackages: address => (calls.push(`deliver:${address}`), true),
		navigationActive: () => navigating,
		renameTrain: title => (calls.push(`rename:${title}`), true),
		resolveDestination: filter => filter,
		retrievePackages: address => (calls.push(`retrieve:${address}`), true),
		setThrottle: percent => (calls.push(`throttle:${percent}`), true),
		startNavigation: destination => (navigating = destination === "b")
	};
	const runtime = new ScheduleRuntime(schedule);
	assert.equal(runtime.tick(environment).state, SCHEDULE_RUNTIME_STATE.IN_TRANSIT);
	navigating = false;
	assert.equal(runtime.tick(environment).state, SCHEDULE_RUNTIME_STATE.POST_TRANSIT);
	assert.equal(runtime.tick({ ...environment, stationPowered: () => true }).state, SCHEDULE_RUNTIME_STATE.PRE_TRANSIT);
	runtime.setPaused(true);
	const persisted = runtime.snapshot();
	const restored = new ScheduleRuntime();
	restored.restore(persisted);
	assert.equal(restored.tick(environment).changed, false);
	restored.setPaused(false);
	for (let index = 0; index < 5; index++)
		restored.tick(environment);
	assert.deepEqual(calls, ["rename:Brass Line", "throttle:40", "deliver:Factory", "retrieve:Depot"]);
	assert.equal(restored.snapshot().completed, true);
});

test("Schedule runtime preserves a transit interruption for a safe route retry", () => {
	const runtime = new ScheduleRuntime(migrateLegacySchedule({ stopIds: ["b"] }));
	runtime.tick({ resolveDestination: value => value, startNavigation: () => true });
	assert.equal(runtime.transitInterrupted(), true);
	const restored = new ScheduleRuntime();
	restored.restore(runtime.snapshot());
	assert.equal(restored.snapshot().state, SCHEDULE_RUNTIME_STATE.PRE_TRANSIT);
});
