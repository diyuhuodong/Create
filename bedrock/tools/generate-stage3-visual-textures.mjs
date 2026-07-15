import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

function crc32(bytes) {
	let value = 0xffffffff;
	for (const byte of bytes) {
		value ^= byte;
		for (let bit = 0; bit < 8; bit++)
			value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
	}
	return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const kind = Buffer.from(type, "ascii");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(crc32(Buffer.concat([kind, data])));
	return Buffer.concat([length, kind, data, checksum]);
}

export function encodePng({ height, pixels, width }) {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || pixels.length !== width * height * 4)
		throw new TypeError("PNG pixels must be one RGBA value for every coordinate");
	const scanlines = Buffer.alloc((width * 4 + 1) * height);
	for (let row = 0; row < height; row++) {
		const destination = row * (width * 4 + 1);
		scanlines[destination] = 0;
		Buffer.from(pixels.subarray(row * width * 4, (row + 1) * width * 4)).copy(scanlines, destination + 1);
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 6;
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(scanlines)),
		chunk("IEND", Buffer.alloc(0))
	]);
}

export function createFluidTile({ accent, base }) {
	const pixels = new Uint8Array(16 * 16 * 4);
	for (let y = 0; y < 16; y++) {
		for (let x = 0; x < 16; x++) {
			const index = (y * 16 + x) * 4;
			const highlight = ((x * 5 + y * 3) % 11) < 3;
			pixels[index] = highlight ? accent[0] : base[0];
			pixels[index + 1] = highlight ? accent[1] : base[1];
			pixels[index + 2] = highlight ? accent[2] : base[2];
			pixels[index + 3] = 185;
		}
	}
	return pixels;
}

export async function generateStage3VisualTextures(resourcePackRoot) {
	const outputDirectory = resolve(resourcePackRoot, "textures/createbedrock/generated");
	await mkdir(outputDirectory, { recursive: true });
	const textures = [
		["fluid_water.png", { base: [29, 103, 196], accent: [83, 168, 237] }],
		["fluid_lava.png", { base: [201, 61, 14], accent: [255, 183, 37] }]
	];
	for (const [file, palette] of textures)
		await writeFile(resolve(outputDirectory, file), encodePng({ height: 16, pixels: createFluidTile(palette), width: 16 }));
	return textures.length;
}
