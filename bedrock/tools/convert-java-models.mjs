import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

const MODELS = [
	{ name: "hand_crank", source: "hand_crank/block.json" },
	{ name: "shaft", source: "shaft.json" },
	{ name: "cogwheel", source: "cogwheel.json" },
	{ name: "millstone", source: "millstone/block.json" },
	{ name: "mechanical_press", source: "mechanical_press/block.json" },
	{
		name: "mechanical_bearing",
		source: "bearing/block.json",
		textureOverrides: {
			back: "create:block/gearbox",
			side: "create:block/mechanical_bearing_side"
		}
	}
];

function materialName(texturePath) {
	return basename(texturePath).replace(/[^a-zA-Z0-9_]/g, "_");
}

function resolveTexture(reference, textures, overrides, seen = new Set()) {
	if (typeof reference !== "string")
		throw new TypeError("Java model face textures must be strings");
	if (!reference.startsWith("#"))
		return reference;

	const key = reference.slice(1);
	if (seen.has(key))
		throw new Error(`Circular Java texture reference: ${[...seen, key].join(" -> ")}`);
	const resolved = overrides[key] ?? textures[key];
	if (!resolved)
		throw new Error(`Unresolved Java texture variable #${key}`);
	seen.add(key);
	return resolveTexture(resolved, textures, overrides, seen);
}

function convertFace(face, textures, textureOverrides) {
	if (!Array.isArray(face.uv) || face.uv.length !== 4)
		throw new TypeError("Java model faces must specify four UV coordinates");
	const [left, top, right, bottom] = face.uv;
	const converted = {
		material_instance: materialName(resolveTexture(face.texture, textures, textureOverrides)),
		uv: [left, top],
		uv_size: [right - left, bottom - top]
	};
	if (face.rotation !== undefined)
		converted.uv_rotation = face.rotation;
	return converted;
}

function convertRotation(rotation) {
	if (!rotation)
		return {};
	if (!Number.isFinite(rotation.angle) || !["x", "y", "z"].includes(rotation.axis) || !Array.isArray(rotation.origin))
		throw new TypeError("Unsupported Java element rotation");

	const converted = {
		pivot: [rotation.origin[0] - 8, rotation.origin[1], rotation.origin[2] - 8],
		rotation: [0, 0, 0]
	};
	converted.rotation[["x", "y", "z"].indexOf(rotation.axis)] = rotation.angle;
	return converted;
}

export function convertJavaModel({ identifier, model, textureOverrides = {} }) {
	if (!identifier || !Array.isArray(model?.elements))
		throw new TypeError("Java model conversion requires an identifier and elements");
	const textureSize = model.texture_size ?? [16, 16];
	if (!Array.isArray(textureSize) || textureSize.length !== 2)
		throw new TypeError("Java model texture_size must contain width and height");

	const cubes = model.elements.map(element => {
		if (!Array.isArray(element.from) || !Array.isArray(element.to))
			throw new TypeError("Java model elements require from and to coordinates");
		const uv = Object.fromEntries(Object.entries(element.faces ?? {})
			.map(([direction, face]) => [direction, convertFace(face, model.textures ?? {}, textureOverrides)]));
		return {
			origin: [element.from[0] - 8, element.from[1], element.from[2] - 8],
			size: element.to.map((coordinate, index) => coordinate - element.from[index]),
			uv,
			...convertRotation(element.rotation)
		};
	});

	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: textureSize[0],
				texture_height: textureSize[1],
				visible_bounds_width: 2,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [{ name: "java_model", pivot: [0, 0, 0], cubes }]
		}]
	};
}

export async function convertJavaModels(resourcePackRoot) {
	const outputDirectory = resolve(resourcePackRoot, "models/blocks");
	await mkdir(outputDirectory, { recursive: true });
	for (const entry of MODELS) {
		const source = resolve(repositoryRoot, "src/main/resources/assets/create/models/block", entry.source);
		const model = JSON.parse(await readFile(source, "utf8"));
		const geometry = convertJavaModel({
			identifier: `geometry.createbedrock.${entry.name}`,
			model,
			textureOverrides: entry.textureOverrides
		});
		await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
	}
	return MODELS.length;
}
