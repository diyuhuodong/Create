import { system } from "@minecraft/server";

import { BudgetScheduler } from "./budget-scheduler.js";

const TASK_BUDGET_PER_TICK = 32;
const DEFAULT_TASK_GROUP = "default";
const scheduler = new BudgetScheduler({
	onError(name, error) {
		console.warn(`[Create Bedrock] Kernel task in ${name} failed: ${error}`);
	}
});
scheduler.registerGroup(DEFAULT_TASK_GROUP, TASK_BUDGET_PER_TICK);
const tickHandlers = [];
let started = false;

export function enqueueKernelTask(task, group = DEFAULT_TASK_GROUP) {
	scheduler.enqueue(group, task);
}

export function registerKernelTaskGroup(name, budget) {
	scheduler.registerGroup(name, budget);
}

export function getKernelDiagnostics() {
	return scheduler.diagnostics();
}

export function registerTickHandler(handler) {
	if (typeof handler !== "function")
		throw new TypeError("Kernel tick handlers must be functions");

	tickHandlers.push(handler);
}

export function startKernel() {
	if (started)
		return;

	started = true;
	system.runInterval(() => {
		scheduler.tick();
		for (const handler of tickHandlers) {
			try {
				handler();
			} catch (error) {
				console.warn(`[Create Bedrock] Kernel tick handler failed: ${error}`);
			}
		}
	}, 1);
	console.warn("[Create Bedrock] Kernel started");
}
