import { system } from "@minecraft/server";

import { registerBlockComponent } from "../kernel/register-block-component.js";
import { dispatchNativeRedstoneUpdate } from "./redstone-native-events.js";
import { NATIVE_REDSTONE_INPUT_COMPONENT } from "./redstone-target.js";

export { NATIVE_REDSTONE_INPUT_COMPONENT };

let registered = false;

/**
 * Bedrock requires custom block components to be registered during startup.
 * The component is shared by every native consumer; type-specific routing
 * remains in the redstone runtime, where it can be persisted and tested.
 */
export function registerNativeRedstoneInputComponent() {
	if (registered)
		return false;
	registered = true;
	system.beforeEvents.startup.subscribe(event => {
		registerBlockComponent(event.blockComponentRegistry, NATIVE_REDSTONE_INPUT_COMPONENT, {
			onRedstoneUpdate(redstoneEvent) {
				try {
					dispatchNativeRedstoneUpdate({
						block: redstoneEvent.block,
						powerLevel: redstoneEvent.powerLevel
					});
				} catch (error) {
					console.warn(`[Create Bedrock] Could not process native redstone input: ${error}`);
				}
			}
		});
	});
	return true;
}
