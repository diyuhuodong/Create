import { KINETIC_BLOCKS } from "../kinetics/kinetic-world.js";
import { registerMovingBlockDataContributor } from "./moving-block-data.js";

/** Registers kinetic state as one contributor beside any machine-specific data. */
export function registerKineticMovingDataAdapters(kineticWorld) {
	if (!kineticWorld || typeof kineticWorld.captureNode !== "function" || typeof kineticWorld.restoreCapturedNode !== "function")
		throw new TypeError("Kinetic moving data adapters require captureNode() and restoreCapturedNode()");
	for (const typeId of Object.keys(KINETIC_BLOCKS)) {
		registerMovingBlockDataContributor(typeId, "kinetic", {
			capture(dimensionId, location) {
				return kineticWorld.captureNode(dimensionId, location);
			},
			detach() {
				// DynamicAssemblyWorldPort owns trackBrokenBlock() so the matching
				// world mutation and kinetic topology mutation stay in one transaction.
			},
			restore(dimensionId, location, state) {
				if (!state)
					return;
				kineticWorld.restoreCapturedNode({ ...state, dimensionId, location: { ...location } });
			},
			schemaVersion: 1,
			validate(state) {
				if (!state || typeof state !== "object" || !KINETIC_BLOCKS[state.typeId])
					throw new TypeError("Kinetic moving data must be a captured kinetic node");
			}
		});
	}
}
