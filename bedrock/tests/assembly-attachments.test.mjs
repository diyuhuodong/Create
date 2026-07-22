import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	assemblyAttachmentProviderIds,
	linkedLocationsForAssembly,
	mergeAssemblyAttachmentLocations,
	registerAssemblyAttachmentProvider
} from "../behavior_pack/scripts/contraptions/assembly-attachments.js";

test("assembly attachments merge registered providers deterministically without importing later packages", () => {
	const unregisterZeta = registerAssemblyAttachmentProvider("zeta", () => [{ x: 1, y: 0, z: 0 }]);
	const unregisterAlpha = registerAssemblyAttachmentProvider("alpha", () => [{ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
	try {
		assert.deepEqual(assemblyAttachmentProviderIds(), ["alpha", "zeta"]);
		assert.deepEqual(linkedLocationsForAssembly("minecraft:overworld", { x: 0, y: 0, z: 0 }), [
			{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }
		]);
		assert.throws(() => registerAssemblyAttachmentProvider("alpha", () => []), /already registered/);
	} finally {
		unregisterAlpha();
		unregisterZeta();
	}
	assert.deepEqual(assemblyAttachmentProviderIds(), []);
});

test("assembly attachments reject malformed edge contributions", () => {
	assert.throws(() => mergeAssemblyAttachmentLocations({ x: 0, y: 0, z: 0 }, [{ x: .5, y: 0, z: 0 }]), /integer coordinates/);
	assert.throws(() => registerAssemblyAttachmentProvider("Bad Name", () => []), /lowercase identifiers/);
});

test("P4.1 attachment collector has no direct dependency on P4.6 Sticker", async () => {
	const source = await readFile(fileURLToPath(new URL("../behavior_pack/scripts/contraptions/assembly-attachments.js", import.meta.url)), "utf8");
	assert.doesNotMatch(source, /from "\.\/(?:sticker|super-glue|chassis)-/);
});
