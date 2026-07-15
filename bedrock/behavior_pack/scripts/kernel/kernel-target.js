// Keep the production scheduler limits in a pure module so build-time
// acceptance tooling can validate them without importing the Script API.
export const KERNEL_DEFAULT_TASK_BUDGET = 32;
export const KERNEL_MAX_TASKS_PER_TICK = 64;
