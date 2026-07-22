import { createScheduleAst, normalizeScheduleAst, SCHEDULE_CONDITION_TYPES, SCHEDULE_INSTRUCTION_TYPES } from "./schedule-ast.js";

export const SCHEDULE_RUNTIME_SCHEMA_VERSION = 2;
export const SCHEDULE_RUNTIME_STATE = Object.freeze({ IN_TRANSIT: "IN_TRANSIT", POST_TRANSIT: "POST_TRANSIT", PRE_TRANSIT: "PRE_TRANSIT" });

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function compare(actual, expected, operator) {
	return operator === "gte" ? actual >= expected : actual <= expected;
}

function environmentCall(environment, name, fallback, ...args) {
	const callback = environment?.[name];
	return typeof callback === "function" ? callback(...args) : fallback;
}

export function evaluateScheduleCondition(condition, context, environment) {
	if (!SCHEDULE_CONDITION_TYPES.includes(condition?.type) || !context || typeof context !== "object")
		throw new TypeError("Schedule condition evaluation requires a known condition and context");
	switch (condition.type) {
		case "delay":
			context.elapsed = (context.elapsed ?? 0) + 1;
			return context.elapsed >= condition.ticks;
		case "time_of_day": {
			const time = environmentCall(environment, "timeOfDay", 0);
			const day = typeof time === "number" ? Math.floor(time / 24_000) : time.day ?? 0;
			const minute = typeof time === "number" ? Math.floor((time % 24_000) / 1000 * 60) : time.hour * 60 + time.minute;
			return day >= condition.rotation && minute >= condition.hour * 60 + condition.minute;
		}
		case "fluid_threshold": return compare(environmentCall(environment, "fluidAmount", 0, condition.fluidId), condition.amount, condition.operator);
		case "item_threshold": return compare(environmentCall(environment, "itemCount", 0, condition.filter), condition.count, condition.operator);
		case "redstone_link": return !!environmentCall(environment, "redstoneLinkPowered", false, condition.frequencyA, condition.frequencyB) === !!condition.powered;
		case "player_count": return compare(environmentCall(environment, "passengerCount", 0), condition.count, condition.operator);
		case "idle": return environmentCall(environment, "cargoIdleTicks", 0) >= condition.ticks;
		case "unloaded": return !!environmentCall(environment, "cargoEmpty", false);
		case "powered": return !!environmentCall(environment, "stationPowered", false) === !!condition.powered;
	}
}

export class ScheduleRuntime {
	#cooldown = 0;

	constructor(schedule = createScheduleAst()) {
		this.setSchedule(schedule);
	}

	setSchedule(schedule) {
		this.schedule = normalizeScheduleAst(schedule);
		this.currentEntry = Math.min(this.schedule.savedProgress, Math.max(0, this.schedule.entries.length - 1));
		this.state = SCHEDULE_RUNTIME_STATE.PRE_TRANSIT;
		this.paused = false;
		this.completed = false;
		this.conditionProgress = [];
		this.conditionContext = [];
		this.currentTitle = "";
		this.ticksInTransit = 0;
		this.predictionTicks = this.schedule.entries.map(() => -1);
		this.#cooldown = 0;
		return this.snapshot();
	}

	tick(environment = {}) {
		if (this.paused || this.completed)
			return { changed: false, state: this.state };
		if (this.schedule.entries.length === 0) {
			this.paused = true;
			this.completed = true;
			return { changed: true, state: this.state };
		}
		if (this.state === SCHEDULE_RUNTIME_STATE.IN_TRANSIT) {
			if (environmentCall(environment, "navigationActive", false)) {
				this.ticksInTransit++;
				return { changed: true, state: this.state };
			}
			this.destinationReached();
			return { changed: true, state: this.state };
		}
		if (this.#cooldown > 0) {
			this.#cooldown--;
			return { changed: true, state: this.state };
		}
		if (this.state === SCHEDULE_RUNTIME_STATE.POST_TRANSIT)
			return this.#tickConditions(environment);
		return this.#startInstruction(environment);
	}

	destinationReached() {
		if (this.state !== SCHEDULE_RUNTIME_STATE.IN_TRANSIT)
			return false;
		if (this.ticksInTransit > 0) {
			const previous = this.predictionTicks[this.currentEntry];
			this.predictionTicks[this.currentEntry] = previous > 0 ? Math.round((previous + this.ticksInTransit) / 2) : this.ticksInTransit;
		}
		this.state = SCHEDULE_RUNTIME_STATE.POST_TRANSIT;
		const branches = this.schedule.entries[this.currentEntry]?.conditionBranches ?? [];
		this.conditionProgress = branches.map(() => 0);
		this.conditionContext = branches.map(() => ({}));
		return true;
	}

	transitInterrupted() {
		if (this.state !== SCHEDULE_RUNTIME_STATE.IN_TRANSIT)
			return false;
		this.state = SCHEDULE_RUNTIME_STATE.PRE_TRANSIT;
		this.#cooldown = 0;
		return true;
	}

	setPaused(paused) {
		const normalized = !!paused;
		if (normalized === this.paused)
			return false;
		this.paused = normalized;
		return true;
	}

	estimatedStayTicks(index = this.currentEntry) {
		const branches = this.schedule.entries[index]?.conditionBranches ?? [];
		const totals = branches.filter(branch => branch.every(condition => condition.type === "delay")).map(branch => branch.reduce((total, condition) => total + condition.ticks, 0));
		return totals.length === 0 ? -2 : Math.min(...totals);
	}

	snapshot() {
		return {
			completed: this.completed,
			conditionContext: clone(this.conditionContext),
			conditionProgress: [...this.conditionProgress],
			cooldown: this.#cooldown,
			currentEntry: this.currentEntry,
			currentTitle: this.currentTitle,
			paused: this.paused,
			predictionTicks: [...this.predictionTicks],
			schedule: normalizeScheduleAst(this.schedule),
			schemaVersion: SCHEDULE_RUNTIME_SCHEMA_VERSION,
			state: this.state,
			ticksInTransit: this.ticksInTransit
		};
	}

	restore(value) {
		if (value?.schemaVersion !== SCHEDULE_RUNTIME_SCHEMA_VERSION || !Object.values(SCHEDULE_RUNTIME_STATE).includes(value.state))
			throw new TypeError("Invalid Schedule runtime snapshot");
		const schedule = normalizeScheduleAst(value.schedule);
		if (!Number.isInteger(value.currentEntry) || value.currentEntry < 0 || value.currentEntry > schedule.entries.length || !Array.isArray(value.conditionProgress) || !Array.isArray(value.conditionContext) || value.conditionProgress.length !== value.conditionContext.length)
			throw new TypeError("Invalid Schedule runtime progress");
		this.schedule = schedule;
		this.currentEntry = value.currentEntry;
		this.state = value.state;
		this.paused = !!value.paused;
		this.completed = !!value.completed;
		this.conditionProgress = value.conditionProgress.map(progress => Number.isInteger(progress) && progress >= 0 ? progress : (() => { throw new TypeError("Invalid Schedule condition progress"); })());
		this.conditionContext = clone(value.conditionContext);
		this.currentTitle = typeof value.currentTitle === "string" ? value.currentTitle : "";
		this.ticksInTransit = Number.isInteger(value.ticksInTransit) && value.ticksInTransit >= 0 ? value.ticksInTransit : 0;
		this.predictionTicks = Array.isArray(value.predictionTicks) && value.predictionTicks.length === schedule.entries.length ? [...value.predictionTicks] : schedule.entries.map(() => -1);
		this.#cooldown = Number.isInteger(value.cooldown) && value.cooldown >= 0 ? value.cooldown : 0;
		return this.snapshot();
	}

	#startInstruction(environment) {
		if (this.currentEntry >= this.schedule.entries.length) {
			if (this.schedule.cyclic)
				this.currentEntry = 0;
			else {
				this.paused = true;
				this.completed = true;
				return { changed: true, state: this.state };
			}
		}
		const instruction = this.schedule.entries[this.currentEntry].instruction;
		if (!SCHEDULE_INSTRUCTION_TYPES.includes(instruction.type))
			throw new Error(`Unknown Schedule instruction ${instruction.type}`);
		if (instruction.type === "destination") {
			const destination = environmentCall(environment, "resolveDestination", undefined, instruction.filter, instruction.exact);
			if (destination === undefined || environmentCall(environment, "startNavigation", false, destination) === false) {
				this.#cooldown = 40;
				return { changed: false, reason: "destination_unavailable", state: this.state };
			}
			this.state = SCHEDULE_RUNTIME_STATE.IN_TRANSIT;
			this.ticksInTransit = 0;
			if (environmentCall(environment, "atDestination", false, destination))
				this.destinationReached();
			return { changed: true, destination, state: this.state };
		}
		let ok = true;
		if (instruction.type === "package_delivery")
			ok = environmentCall(environment, "deliverPackages", false, instruction.address);
		if (instruction.type === "package_retrieval")
			ok = environmentCall(environment, "retrievePackages", false, instruction.address);
		if (instruction.type === "rename") {
			this.currentTitle = instruction.title;
			ok = environmentCall(environment, "renameTrain", true, instruction.title);
		}
		if (instruction.type === "throttle")
			ok = environmentCall(environment, "setThrottle", true, instruction.percent);
		if (ok === false) {
			this.#cooldown = 40;
			return { changed: false, reason: `${instruction.type}_unavailable`, state: this.state };
		}
		this.currentEntry++;
		return { changed: true, state: this.state };
	}

	#tickConditions(environment) {
		const branches = this.schedule.entries[this.currentEntry].conditionBranches;
		if (branches.length === 0) {
			this.#advanceEntry();
			return { changed: true, state: this.state };
		}
		for (let index = 0; index < branches.length; index++) {
			const branch = branches[index];
			const progress = this.conditionProgress[index];
			if (progress >= branch.length) {
				this.#advanceEntry();
				return { changed: true, state: this.state };
			}
			const context = this.conditionContext[index];
			if (evaluateScheduleCondition(branch[progress], context, environment)) {
				this.conditionProgress[index]++;
				this.conditionContext[index] = {};
				if (this.conditionProgress[index] >= branch.length) {
					this.#advanceEntry();
					return { changed: true, state: this.state };
				}
			}
		}
		return { changed: true, state: this.state };
	}

	#advanceEntry() {
		this.currentEntry++;
		this.state = SCHEDULE_RUNTIME_STATE.PRE_TRANSIT;
		this.conditionProgress = [];
		this.conditionContext = [];
	}
}
