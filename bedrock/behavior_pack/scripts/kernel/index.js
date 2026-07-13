import { system } from "@minecraft/server";

import { BudgetScheduler } from "./budget-scheduler.js";
import { DiagnosticsRegistry } from "./diagnostics-registry.js";

const TASK_BUDGET_PER_TICK = 32;
const DEFAULT_TASK_GROUP = "default";
const scheduler = new BudgetScheduler({
	onError(name, error) {
		console.warn(`[Create Bedrock] Kernel task in ${name} failed: ${error}`);
	}
});
scheduler.registerGroup(DEFAULT_TASK_GROUP, TASK_BUDGET_PER_TICK);
const diagnostics = new DiagnosticsRegistry();
const tickHandlers = [];
let started = false;

export function enqueueKernelTask(task, group = DEFAULT_TASK_GROUP) {
	scheduler.enqueue(group, task);
}

export function enqueueUniqueKernelTask(key, task, group = DEFAULT_TASK_GROUP) {
	return scheduler.enqueueUnique(group, key, task);
}

export function registerKernelTaskGroup(name, budget) {
	scheduler.registerGroup(name, budget);
}

export function getKernelDiagnostics() {
	return {
		scheduler: scheduler.diagnostics(),
		...diagnostics.collect()
	};
}

export function registerKernelDiagnosticProvider(name, provider) {
	diagnostics.register(name, provider);
}

export function registerTickHandler(handler, group = DEFAULT_TASK_GROUP) {
	if (typeof handler !== "function")
		throw new TypeError("Kernel tick handlers must be functions");
	if (!scheduler.hasGroup(group))
		throw new Error(`Unknown kernel task group ${group}`);

	tickHandlers.push({ group, handler });
}

export function startKernel() {
	if (started)
		return;

	started = true;
	system.runInterval(() => {
		for (const { group, handler } of tickHandlers)
			scheduler.enqueue(group, handler);
		scheduler.tick();
	}, 1);
	console.warn("[Create Bedrock] Kernel started");
}
