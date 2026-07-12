import { system } from "@minecraft/server";

import { TaskQueue } from "./task-queue.js";

const TASK_BUDGET_PER_TICK = 32;
const taskQueue = new TaskQueue();
const tickHandlers = [];
let started = false;

export function enqueueKernelTask(task) {
	taskQueue.enqueue(task);
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
		taskQueue.drain(TASK_BUDGET_PER_TICK);
		for (const handler of tickHandlers)
			handler();
	}, 1);
	console.warn("[Create Bedrock] Kernel started");
}
