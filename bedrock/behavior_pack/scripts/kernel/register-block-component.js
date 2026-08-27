// Script packs may be reloaded while Bedrock retains the custom-component
// registry. Re-registering the identical id is safe to ignore, but every
// other registry failure must still reach the content log.
export function registerBlockComponent(registry, identifier, component) {
	try {
		registry.registerCustomComponent(identifier, component);
		return true;
	} catch (error) {
		if (error?.name === "BlockCustomComponentAlreadyRegisteredError")
			return false;
		throw error;
	}
}
