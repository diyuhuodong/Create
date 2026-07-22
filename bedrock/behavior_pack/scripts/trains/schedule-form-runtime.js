import { openConfigurationFormSession, submitVersionedConfigurationForm } from "../kernel/configuration-protocol.js";
import { createScheduleAst, normalizeScheduleEntry } from "./schedule-ast.js";
import { updateScheduleItemState, validateScheduleItemState } from "./schedule-item-state.js";

function integer(value, label, minimum, maximum) {
	if (!Number.isInteger(value) || value < minimum || value > maximum)
		throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
	return value;
}

export function openScheduleFormSession(state, subjectId) {
	state = validateScheduleItemState(state);
	return openConfigurationFormSession({ revision: state.revision, subjectId });
}

export function applyScheduleFormIntent(schedule, intent) {
	if (!intent || typeof intent !== "object" || Array.isArray(intent))
		throw new TypeError("Schedule form intents must be objects");
	const entries = [...schedule.entries];
	switch (intent.type) {
		case "append_entry":
			entries.push(normalizeScheduleEntry(intent.entry));
			break;
		case "replace_entry":
			entries[integer(intent.index, "Schedule entry index", 0, entries.length - 1)] = normalizeScheduleEntry(intent.entry);
			break;
		case "remove_entry":
			entries.splice(integer(intent.index, "Schedule entry index", 0, entries.length - 1), 1);
			break;
		case "move_entry": {
			const from = integer(intent.from, "Schedule source index", 0, entries.length - 1);
			const to = integer(intent.to, "Schedule destination index", 0, entries.length - 1);
			entries.splice(to, 0, entries.splice(from, 1)[0]);
			break;
		}
		case "replace_schedule":
			return createScheduleAst({
				cyclic: intent.cyclic,
				entries: intent.entries,
				revision: schedule.revision,
				savedProgress: intent.savedProgress ?? 0
			});
		case "set_cyclic":
			if (typeof intent.cyclic !== "boolean")
				throw new TypeError("Schedule cycle edits require a boolean");
			return createScheduleAst({ ...schedule, cyclic: intent.cyclic });
		case "set_saved_progress":
			return createScheduleAst({ ...schedule, savedProgress: integer(intent.savedProgress, "Schedule saved progress", 0, entries.length) });
		default:
			throw new TypeError(`Unknown Schedule form intent ${intent.type}`);
	}
	return createScheduleAst({ ...schedule, entries, savedProgress: Math.min(schedule.savedProgress, entries.length) });
}

export function submitScheduleFormIntent({ currentState, intent, session }) {
	const current = validateScheduleItemState(typeof currentState === "function" ? currentState() : currentState);
	return submitVersionedConfigurationForm({
		actualRevision: current.revision,
		session,
		submit(expectedRevision) {
			const result = updateScheduleItemState(current, expectedRevision, schedule => applyScheduleFormIntent(schedule, intent));
			return { changed: result.changed, conflict: result.reason === "revision_conflict", state: result.state };
		}
	});
}
