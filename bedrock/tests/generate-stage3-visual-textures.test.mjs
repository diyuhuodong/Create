import assert from "node:assert/strict";
import test from "node:test";

import { createFluidTile, encodePng } from "../tools/generate-stage3-visual-textures.mjs";

test("S3-13 fluid visual texture generator emits deterministic 16px PNGs", () => {
	const pixels = createFluidTile({ accent: [90, 170, 240], base: [30, 100, 200] });
	const png = encodePng({ height: 16, pixels, width: 16 });
	assert.equal(pixels.length, 16 * 16 * 4);
	assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
	assert.ok(png.length > 100);
});
