import { chassisLinkedLocationsForAssembly } from "./chassis-runtime.js";
import { gluedLocationsForAssembly } from "./super-glue-runtime.js";
import { mergeAssemblyAttachmentLocations } from "./sticker-state.js";
import { stickerLinkedLocationsForAssembly } from "./sticker-runtime.js";

/** Single deterministic edge provider for every dynamic assembly collector. */
export function linkedLocationsForAssembly(dimensionId, location) {
	return mergeAssemblyAttachmentLocations(
		location,
		gluedLocationsForAssembly(dimensionId, location),
		chassisLinkedLocationsForAssembly(dimensionId, location),
		stickerLinkedLocationsForAssembly(dimensionId, location)
	);
}
