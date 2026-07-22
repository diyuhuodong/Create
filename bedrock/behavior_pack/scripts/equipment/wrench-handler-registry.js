const handlers = [];

export function registerWrenchHandler({ actions = [], id, invoke, supports }) {
	if (typeof id !== "string" || !id || handlers.some(handler => handler.id === id))
		throw new TypeError("Wrench handler id must be unique and non-empty");
	if (!Array.isArray(actions) || actions.some(action => !["configure", "remove", "rotate"].includes(action)))
		throw new TypeError("Wrench handler actions are invalid");
	if (typeof supports !== "function" || typeof invoke !== "function")
		throw new TypeError("Wrench handlers require supports and invoke callbacks");
	handlers.push({ actions: new Set(actions), id, invoke, supports });
	return () => {
		const index = handlers.findIndex(handler => handler.id === id);
		if (index >= 0)
			handlers.splice(index, 1);
	};
}

export function invokeWrenchHandler(context, action) {
	if (!["configure", "remove", "rotate"].includes(action))
		throw new TypeError("Unknown Wrench action");
	const handler = handlers.find(candidate => candidate.actions.has(action) && candidate.supports(context, action));
	if (!handler)
		return { handled: false, reason: "unsupported" };
	const result = handler.invoke(context, action);
	return result?.handled === true ? { ...result, handlerId: handler.id } : { handled: false, reason: result?.reason ?? "rejected", handlerId: handler.id };
}

export function wrenchHandlerIds() {
	return handlers.map(handler => handler.id);
}

export function clearWrenchHandlersForTesting() {
	handlers.length = 0;
}
