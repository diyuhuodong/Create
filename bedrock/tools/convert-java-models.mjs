import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

export const JAVA_MODELS = [
	{ name: "hand_crank", source: "hand_crank/block.json" },
	{ name: "shaft", source: "shaft.json" },
	{ name: "cogwheel", source: "cogwheel.json" },
	{ name: "large_cogwheel", source: "large_cogwheel.json" },
	{ name: "water_wheel", source: "water_wheel/block.json" },
	{ name: "millstone", source: "millstone/block.json" },
	{ name: "mechanical_press", source: "mechanical_press/block.json" },
	{ name: "basin", source: "basin/block.json" },
	{
		name: "encased_fan",
		source: "encased_fan/block.json",
		textureOverrides: {
			"3": "create:block/funnel/andesite_funnel_frame",
			back: "create:block/gearbox",
			fan_casing: "create:block/fan_casing",
			fan_side: "create:block/fan_side"
		}
	},
	{
		name: "mechanical_mixer",
		source: "mechanical_mixer/block.json",
		textureOverrides: {
			"2": "create:block/gearbox_top",
			"4": "create:block/mixer_base_side",
			"11": "create:block/mechanical_press_top"
		}
	},
	{
		name: "mechanical_saw",
		source: "mechanical_saw/horizontal.json",
		textureOverrides: {
			andesite_casing_short: "create:block/andesite_casing_short",
			encased_belt: "create:block/encased_chain_drive",
			gearbox: "create:block/gearbox",
			gearbox_top: "create:block/gearbox_top",
			slit: "create:block/mechanical_saw_top_no_slot"
		}
	},
	{ name: "depot", source: "depot/block.json" },
	{ name: "belt", source: "belt/middle.json" },
	{ name: "belt_start", source: "belt/start.json" },
	{ name: "belt_end", source: "belt/end.json" },
	{ name: "chute", source: "chute/block.json" },
	{ name: "fluid_tank", source: "fluid_tank/block_single_window.json" },
	{ name: "fluid_tank_bottom", source: "fluid_tank/block_bottom_window.json" },
	{ name: "fluid_tank_middle", source: "fluid_tank/block_middle_window.json" },
	{ name: "fluid_tank_top", source: "fluid_tank/block_top_window.json" },
	{
		name: "crushing_wheel",
		source: "crushing_wheel/crushing_wheel.obj",
		converter: "crushing_wheel_proxy"
	},
	{ name: "fluid_pipe", source: "fluid_pipe/item.json" },
	{ name: "encased_fluid_pipe", source: "encased_fluid_pipe/block_open.json" },
	{ name: "glass_fluid_pipe", source: "fluid_pipe/window.json" },
	{ name: "fluid_valve", source: "fluid_valve/item.json" },
	{ name: "item_drain", source: "item_drain.json" },
	{ name: "portable_fluid_interface", source: "portable_fluid_interface/block.json" },
	{ name: "smart_fluid_pipe", source: "smart_fluid_pipe/item.json" },
	{ name: "spout", source: "spout/item.json" },
	{ name: "mechanical_pump", source: "mechanical_pump/block.json" },
	{
		name: "andesite_funnel",
		source: "funnel/block_vertical_filterless.json",
		textureOverrides: {
			base: "create:block/funnel/andesite_funnel",
			direction: "create:block/funnel/andesite_funnel_pull",
			frame: "create:block/funnel/andesite_funnel_frame",
			redstone: "create:block/funnel/andesite_funnel_unpowered"
		}
	},
	{
		name: "mechanical_bearing",
		source: "bearing/block.json",
		textureOverrides: {
			back: "create:block/gearbox",
			side: "create:block/mechanical_bearing_side"
		}
	}
];

export function plannedGeometryIdentifiers() {
	const identifiers = new Set(JAVA_MODELS.map(entry => `geometry.createbedrock.${entry.name}`));
	for (const entry of JAVA_MODELS) {
		if (!entry.name.startsWith("fluid_tank"))
			continue;
		for (const level of [1, 2, 3, 4])
			identifiers.add(`geometry.createbedrock.${entry.name}_level_${level}`);
	}
	return identifiers;
}

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

function face(material, uv = [0, 0], uvSize = [16, 16]) {
	return { material_instance: material, uv, uv_size: uvSize };
}

function cube(origin, size, material, rotation) {
	return {
		origin,
		size,
		uv: Object.fromEntries(["north", "south", "east", "west", "up", "down"].map(direction => [direction, face(material)])),
		...(rotation ? { pivot: [0, 8, 0], rotation } : {})
	};
}

// Bedrock's poly_mesh is deprecated and rejected by current content tooling.
// The Java OBJ remains the authoritative source, while this stable cuboid
// approximation preserves its oversized, toothed wheel silhouette on console
// and Realm clients that only need standard block geometry.
export function convertCrushingWheelObj({ identifier, source }) {
	if (typeof source !== "string" || !/^v\s/m.test(source) || !/^f\s/m.test(source) || !/^usemtl\s/m.test(source))
		throw new TypeError("Crushing Wheel OBJ must contain vertices, faces, and material groups");
	const rim = [
		[-4, 1, -18, 8, 14, 10], [10, 1, -18, 8, 14, 10],
		[-18, 1, -4, 10, 14, 8], [8, 1, -4, 10, 14, 8],
		[-14, 1, -14, 8, 14, 8], [6, 1, -14, 8, 14, 8],
		[-14, 1, 6, 8, 14, 8], [6, 1, 6, 8, 14, 8]
	].map(([x, y, z, width, height, depth]) => cube([x, y, z], [width, height, depth], "crushing_wheel_plates"));
	const hub = [
		cube([-5, 4, -5], [10, 8, 10], "crushing_wheel_insert"),
		cube([-2, -2, -2], [4, 20, 4], "axis"),
		cube([-3, 16, -3], [6, 1, 6], "axis_top")
	];
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: 16,
				texture_height: 16,
				visible_bounds_width: 3,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [{ name: "crushing_wheel", pivot: [0, 8, 0], cubes: [...rim, ...hub] }]
		}]
	};
}

function liquidCube(level) {
	return cube([-7, 4, -7], [14, level * 2, 14], "fluid_fill");
}

export function addTankFillLevels(geometry, name) {
	const base = geometry?.["minecraft:geometry"]?.[0];
	if (!base?.bones?.[0]?.cubes)
		throw new TypeError("Fluid tank geometry must contain a converted Java-model bone");
	return [1, 2, 3, 4].map(level => ({
		format_version: geometry.format_version,
		"minecraft:geometry": [{
			description: { ...base.description, identifier: `geometry.createbedrock.${name}_level_${level}` },
			bones: [{ ...base.bones[0], cubes: [...base.bones[0].cubes, liquidCube(level)] }]
		}]
	}));
}

export async function convertJavaModels(resourcePackRoot) {
	const outputDirectory = resolve(resourcePackRoot, "models/blocks");
	await mkdir(outputDirectory, { recursive: true });
	for (const entry of JAVA_MODELS) {
		const source = resolve(repositoryRoot, "src/main/resources/assets/create/models/block", entry.source);
		if (entry.converter === "crushing_wheel_proxy") {
			const geometry = convertCrushingWheelObj({
				identifier: `geometry.createbedrock.${entry.name}`,
				source: await readFile(source, "utf8")
			});
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		const model = JSON.parse(await readFile(source, "utf8"));
		const geometry = convertJavaModel({
			identifier: `geometry.createbedrock.${entry.name}`,
			model,
			textureOverrides: entry.textureOverrides
		});
		await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
		if (entry.name.startsWith("fluid_tank")) {
			for (const filledGeometry of addTankFillLevels(geometry, entry.name)) {
				const identifier = filledGeometry["minecraft:geometry"][0].description.identifier.replace("geometry.createbedrock.", "");
				await writeFile(resolve(outputDirectory, `${identifier}.geo.json`), `${JSON.stringify(filledGeometry, null, 2)}\n`);
			}
		}
	}
	return JAVA_MODELS.length;
}
