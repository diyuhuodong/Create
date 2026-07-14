import { system } from "@minecraft/server";

import { getKernelDiagnostics } from "./index.js";
import { serializeDiagnosticsSummary } from "./diagnostics-summary.js";

const DIAGNOSTICS_EVENT_ID = "createbedrock:diagnostics";
const MAX_CHAT_DIAGNOSTICS_LENGTH = 1800;
let registered = false;

function formatDiagnostics(diagnostics) {
	return serializeDiagnosticsSummary(diagnostics, MAX_CHAT_DIAGNOSTICS_LENGTH);
}

export function registerDiagnosticsCommand() {
	if (registered)
		return;
	registered = true;
	system.afterEvents.scriptEventReceive.subscribe(event => {
		if (event.id !== DIAGNOSTICS_EVENT_ID)
			return;
		const output = formatDiagnostics(getKernelDiagnostics());
		console.warn(`[Create Bedrock] Diagnostics: ${output}`);
		try {
			if (typeof event.sourceEntity?.sendMessage === "function")
				event.sourceEntity.sendMessage(`[Create Bedrock] ${output}`);
		} catch (error) {
			console.warn(`[Create Bedrock] Could not return diagnostics to command source: ${error}`);
		}
	});
}
