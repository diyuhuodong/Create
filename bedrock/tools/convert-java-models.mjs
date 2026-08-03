import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

export const JAVA_MODELS = [
	{ name: "copper_backtank", source: "copper_backtank/block.json" },
	{ name: "netherite_backtank", source: "netherite_backtank/block.json" },
	// Toolbox colors share the Java mesh. Each block supplies its own `toolbox`
	// material instance, preserving the source silhouette without duplicating 16
	// geometries in the generated Bedrock pack.
	{ name: "toolbox", source: "toolbox/block.json", materialName: "toolbox" },
	{ name: "hand_crank", source: "hand_crank/block.json" },
	{ name: "shaft", source: "shaft.json" },
	{ name: "cogwheel", source: "cogwheel.json" },
	{ name: "large_cogwheel", source: "large_cogwheel.json" },
	{ name: "water_wheel", source: "water_wheel/block.json" },
	{ name: "millstone", source: "millstone/block.json" },
	{ name: "mechanical_press", source: "mechanical_press/block.json" },
	{ name: "mechanical_crafter", source: "mechanical_crafter/item.json" },
	{
		name: "clockwork_bearing",
		source: "bearing/block.json",
		textureOverrides: { back: "create:block/gearbox", side: "create:block/clockwork_bearing_side" }
	},
	{ name: "controls", source: "controls/item.json" },
	{ name: "contraption_controls", source: "contraption_controls/item.json" },
	{ name: "cart_assembler", source: "cart_assembler/block.json" },
	{ name: "minecart_anchor", source: "cart_assembler/minecart_anchor.json" },
	{ name: "sticker", source: "sticker/block.json" },
	{ name: "clipboard", source: "clipboard/block_empty.json" },
	{ name: "schematic_table", source: "schematic_table.json" },
	{ name: "schematicannon", source: "schematicannon/block.json" },
	{ name: "mechanical_plough", source: "mechanical_plough.json" },
	{
		name: "mechanical_drill",
		source: "mechanical_drill/block.json",
		textureOverrides: {
			"4": "create:block/mechanical_drill_top",
			"10": "create:block/andesite_casing_very_short",
			gearbox: "create:block/gearbox",
			gearbox_top: "create:block/gearbox_top"
		}
	},
	{ name: "deployer", source: "deployer/item.json" },
	{ name: "mechanical_harvester", source: "mechanical_harvester/item.json" },
	{ name: "mechanical_arm", source: "mechanical_arm/block.json" },
	{ name: "mechanical_roller", source: "mechanical_roller/block.json" },
	{ name: "piston_extension_pole", source: "piston_extension_pole.json" },
	{
		name: "mechanical_piston",
		source: "mechanical_piston/normal/block.json",
		textureOverrides: { "0": "create:block/andesite_casing", "1": "create:block/piston_bottom", "2": "create:block/gearbox", "6": "create:block/andesite_casing_piston" }
	},
	{ name: "mechanical_piston_head", source: "mechanical_piston/normal/head.json" },
	{ name: "rope_pulley", source: "rope_pulley/block.json" },
	{ name: "hose_pulley", source: "hose_pulley/block.json" },
	{ name: "elevator_pulley", source: "elevator_pulley/block.json" },
	{ name: "rope", source: "rope_pulley/rope.json" },
	{ name: "pulley_magnet", source: "rope_pulley/pulley_magnet.json" },
	{ name: "gantry_carriage", source: "gantry_carriage/horizontal.json" },
	{ name: "gantry_shaft", source: "gantry_shaft/block_single.json" },
	{ name: "portable_storage_interface", source: "portable_storage_interface/item.json" },
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
	{ name: "turntable", source: "turntable.json" },
	{
		name: "sail_frame",
		source: "sail_frame.json",
		textureOverrides: { "1": "create:block/sail/frame" }
	},
	{
		name: "white_sail",
		source: "white_sail.json",
		textureOverrides: {
			"0": "create:block/sail/canvas_white",
			"1": "create:block/sail/frame"
		}
	},
	{
		name: "nozzle",
		source: "nozzle/block.json",
		textureOverrides: {
			"3": "create:block/net",
			back: "create:block/gearbox"
		}
	},
	{
		name: "andesite_table_cloth",
		source: "table_cloth/block.json",
		textureOverrides: { "0": "create:block/table_cloth/andesite" }
	},
	{
		name: "brass_table_cloth",
		source: "table_cloth/block.json",
		textureOverrides: { "0": "create:block/table_cloth/brass" }
	},
	{
		name: "copper_table_cloth",
		source: "table_cloth/block.json",
		textureOverrides: { "0": "create:block/table_cloth/copper" }
	},
	{
		name: "metal_bracket",
		source: "bracket/item.json",
		textureOverrides: {
			plate: "create:block/bracket_plate_metal",
			bracket: "create:block/bracket_metal"
		}
	},
	{
		name: "wooden_bracket",
		source: "bracket/item.json",
		textureOverrides: {
			plate: "create:block/bracket_plate_wooden",
			bracket: "create:block/bracket_wooden"
		}
	},
	{ name: "metal_girder", source: "metal_girder/item.json" },
	{ name: "metal_girder_pole", source: "metal_girder/block_pole.json" },
	{ name: "metal_girder_x", source: "metal_girder/block_x.json" },
	{ name: "metal_girder_z", source: "metal_girder/block_z.json" },
	{ name: "metal_girder_cross", source: "metal_girder/block_cross.json" },
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
	{
		name: "blaze_burner",
		source: "blaze_burner/item.obj",
		converter: "blaze_burner_proxy"
	},
	{ name: "fluid_pipe", source: "fluid_pipe/item.json" },
	{ name: "cardboard_block", source: "cardboard_block.json" },
	{ name: "bound_cardboard_block", source: "bound_cardboard_block.json" },
	{ name: "experience_block", source: "experience_block.json" },
	{
		name: "framed_glass_trapdoor_bottom",
		source: "framed_glass_trapdoor/block_bottom.json",
		textureOverrides: {
			"0": "create:block/glass_door_side",
			"1": "create:block/palettes/framed_glass"
		}
	},
	{
		name: "framed_glass_trapdoor_top",
		source: "framed_glass_trapdoor/block_top.json",
		textureOverrides: {
			"0": "create:block/glass_door_side",
			"1": "create:block/palettes/framed_glass"
		}
	},
	{
		name: "framed_glass_trapdoor_open",
		source: "framed_glass_trapdoor/block_open.json",
		textureOverrides: {
			"0": "create:block/glass_door_side",
			"1": "create:block/palettes/framed_glass"
		}
	},
	{
		name: "andesite_ladder",
		source: "ladder.json",
		textureOverrides: {
			"0": "create:block/ladder_andesite_hoop",
			"1": "create:block/ladder_andesite"
		}
	},
	{
		name: "brass_ladder",
		source: "ladder.json",
		textureOverrides: {
			"0": "create:block/ladder_brass_hoop",
			"1": "create:block/ladder_brass"
		}
	},
	{
		name: "copper_ladder",
		source: "ladder.json",
		textureOverrides: {
			"0": "create:block/ladder_copper_hoop",
			"1": "create:block/ladder_copper"
		}
	},
	{
		name: "andesite_scaffolding",
		source: "scaffold/block.json",
		textureOverrides: {
			inside: "create:block/scaffold/andesite_scaffold_inside",
			side: "create:block/scaffold/andesite_scaffold",
			top: "create:block/funnel/andesite_funnel_frame"
		}
	},
	{
		name: "brass_scaffolding",
		source: "scaffold/block.json",
		textureOverrides: {
			inside: "create:block/scaffold/brass_scaffold_inside",
			side: "create:block/scaffold/brass_scaffold",
			top: "create:block/funnel/brass_funnel_frame"
		}
	},
	{
		name: "copper_scaffolding",
		source: "scaffold/block.json",
		textureOverrides: {
			inside: "create:block/scaffold/copper_scaffold_inside",
			side: "create:block/scaffold/copper_scaffold",
			top: "create:block/funnel/copper_funnel_frame"
		}
	},
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
	},
	{ name: "redstone_analog_lever", source: "analog_lever/block.json", materialName: "redstone_surface" },
	{ name: "redstone_content_observer", source: "content_observer/block.json", materialName: "redstone_surface" },
	{ name: "redstone_powered_latch", source: "diodes/latch_off.json", materialName: "redstone_surface" },
	{ name: "redstone_pulse_extender", source: "diodes/pulse_extender.json", materialName: "redstone_surface" },
	{ name: "redstone_pulse_repeater", source: "diodes/pulse_repeater.json", materialName: "redstone_surface" },
	{ name: "redstone_pulse_timer", source: "diodes/pulse_timer.json", materialName: "redstone_surface" },
	{ name: "redstone_contact", source: "redstone_contact/block.json", materialName: "redstone_surface" },
	{ name: "elevator_contact", source: "elevator_contact/block.json", materialName: "elevator_contact" },
	{ name: "redstone_link", source: "redstone_link/receiver.json", materialName: "redstone_surface" },
	{ name: "redstone_requester", source: "redstone_requester/block.json", materialName: "redstone_surface" },
	{ name: "redstone_rotation_speed_controller", source: "rotation_speed_controller/block.json", materialName: "redstone_surface" },
	{ name: "redstone_display_link", source: "display_link/block.json", materialName: "redstone_surface" },
	{ name: "redstone_nixie_tube", source: "nixie_tube/block.json", materialName: "redstone_surface" },
	{ name: "redstone_stock_link", source: "stock_link/block_horizontal.json", materialName: "redstone_surface" },
	{ name: "redstone_lectern_controller", converter: "lectern_controller_proxy" },
	{ name: "desk_bell", source: "desk_bell/block.json" },
	{ name: "desk_bell_powered", source: "desk_bell/block_powered.json" },
	{ name: "stockpile_switch_wall", source: "threshold_switch/block_wall.json" },
	{ name: "stockpile_switch_floor", source: "threshold_switch/block_floor.json" },
	{ name: "stockpile_switch_ceiling", source: "threshold_switch/block_ceiling.json" },
	{ name: "display_board", source: "display_board/block.json" },
	{ name: "placard", source: "placard.json" },
	{ name: "stock_ticker", source: "stock_ticker.json" },
	{ name: "copycat_base", source: "copycat_base/block.json", converter: "full_cube_proxy" },
	{ name: "copycat_panel", source: "copycat_base/panel.json" },
	{ name: "copycat_step", source: "copycat_base/step.json" },
	{
		name: "copycat_bars",
		source: "copycat_panel/bars.json",
		textureOverrides: { edge: "create:block/copycat_base" }
	},
	{
		name: "copycat_bars_vertical",
		source: "copycat_panel/bars_vertical.json",
		textureOverrides: { edge: "create:block/copycat_base" }
	},
	{
		name: "rose_quartz_lamp",
		source: "rose_quartz_lamp.json",
		sourceRoot: "src/generated/resources/assets/create/models/block",
		converter: "full_cube_proxy"
	},
	...[
		"brass_block",
		"refined_radiance_casing",
		"shadow_steel_casing",
		"rose_quartz_tiles",
		"small_rose_quartz_tiles"
	].map(name => ({
		name,
		source: `${name}.json`,
		sourceRoot: "src/generated/resources/assets/create/models/block",
		converter: "full_cube_proxy"
	})),
	...[
		"andesite_alloy_block",
		"deepslate_zinc_ore",
		"raw_zinc_block",
		"zinc_ore"
	].map(name => ({
		name,
		source: `${name}.json`,
		sourceRoot: "src/generated/resources/assets/create/models/block",
		converter: "full_cube_proxy"
	})),
	...[
		"rose_quartz_block",
		"weathered_iron_block"
	].map(name => ({
		name,
		source: `${name}.json`,
		sourceRoot: "src/generated/resources/assets/create/models/block",
		converter: "cube_column_proxy"
	})),
	{
		name: "railway_casing",
		source: "railway_casing.json",
		sourceRoot: "src/generated/resources/assets/create/models/block",
		converter: "cube_column_proxy"
	},
	{ name: "cuckoo_clock", source: "cuckoo_clock/block.json" },
	{ name: "peculiar_bell", source: "peculiar_bell.json" },
	{ name: "haunted_bell", source: "haunted_bell.json" },
	...[
		"andesite_door",
		"brass_door",
		"copper_door",
		"framed_glass_door",
		"train_door"
	].flatMap(name => ["bottom", "top"].map(half => ({ name: `${name}_${half}`, source: `${name}/block_${half}.json` }))),
	...["small", "medium", "large"].flatMap(size => [
		{ name: `steam_whistle_${size}_floor`, source: `steam_whistle/block_${size}_floor.json` },
		{ name: `steam_whistle_extension_${size}`, source: `steam_whistle/extension/${size}_single.json` }
	]),
	...[
		["speedometer", "speedometer"],
		["stressometer", "stressometer"]
	].flatMap(([name, gauge]) => Array.from({ length: 16 }, (_, level) => ({
		name: `${name}_gauge_${level}`,
		converter: "gauge_proxy",
		gauge,
		level
	})))
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

function convertFace(face, textures, textureOverrides, materialOverride) {
	// Java's block-model format permits omitted UVs. The affected Create model
	// is a full 16×16 experience block, so its inherited full-texture default
	// maps directly to this Bedrock face representation.
	if (face.uv !== undefined && (!Array.isArray(face.uv) || face.uv.length !== 4))
		throw new TypeError("Java model face UVs must contain four coordinates when present");
	const [left, top, right, bottom] = face.uv ?? [0, 0, 16, 16];
	const converted = {
		material_instance: materialOverride ?? materialName(resolveTexture(face.texture, textures, textureOverrides)),
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

function modelParts(model) {
	const parts = [];
	if (Array.isArray(model?.elements))
		parts.push({ elements: model.elements, textures: model.textures ?? {} });
	for (const child of Object.values(model?.children ?? {})) {
		if (!Array.isArray(child?.elements))
			continue;
		parts.push({
			elements: child.elements,
			textures: { ...(model.textures ?? {}), ...(child.textures ?? {}) }
		});
	}
	return parts;
}

export function convertJavaModel({ identifier, model, textureOverrides = {}, materialName: materialOverride }) {
	const parts = modelParts(model);
	if (!identifier || parts.length === 0)
		throw new TypeError("Java model conversion requires an identifier and elements");
	const textureSize = model.texture_size ?? [16, 16];
	if (!Array.isArray(textureSize) || textureSize.length !== 2)
		throw new TypeError("Java model texture_size must contain width and height");

	const cubes = parts.flatMap(part => part.elements.map(element => {
		if (!Array.isArray(element.from) || !Array.isArray(element.to))
			throw new TypeError("Java model elements require from and to coordinates");
		const uv = Object.fromEntries(Object.entries(element.faces ?? {})
			.map(([direction, face]) => [direction, convertFace(face, part.textures, textureOverrides, materialOverride)]));
		return {
			origin: [element.from[0] - 8, element.from[1], element.from[2] - 8],
			size: element.to.map((coordinate, index) => coordinate - element.from[index]),
			uv,
			...convertRotation(element.rotation)
		};
	}));

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

// Generated Create models such as rose_quartz_lamp intentionally inherit
// Minecraft's cube_all parent rather than duplicating six faces. Bedrock
// geometry has no equivalent parent inheritance, so retain the exact cube
// shape in a named geometry while the block definition supplies the Java
// texture through its `all` material instance.
export function convertFullCubeParent({ identifier, model }) {
	if (!(["minecraft:block/cube_all", "block/cube_all"].includes(model?.parent)) || typeof model?.textures?.all !== "string")
		throw new TypeError("Full-cube proxy requires a Java minecraft:block/cube_all model with an all texture");
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: 16,
				texture_height: 16,
				visible_bounds_width: 2,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [{
				name: "java_cube_all",
				pivot: [0, 0, 0],
				cubes: [cube([-8, 0, -8], [16, 16, 16], "all")]
			}]
		}]
	};
}

export function convertCubeColumnParent({ identifier, model }) {
	if (model?.parent !== "minecraft:block/cube_column"
		|| typeof model?.textures?.end !== "string"
		|| typeof model?.textures?.side !== "string")
		throw new TypeError("Cube-column proxy requires a Java minecraft:block/cube_column model with end and side textures");
	const column = cube([-8, 0, -8], [16, 16, 16], "side");
	column.uv.up.material_instance = "end";
	column.uv.down.material_instance = "end";
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: 16,
				texture_height: 16,
				visible_bounds_width: 2,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [{ name: "java_cube_column", pivot: [0, 0, 0], cubes: [column] }]
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
	// Bedrock permits at most 1 + 14/16 blocks of geometry on an axis. Scale
	// Java's 36-unit wheel footprint into the permitted 30-unit range.
	const scaleFootprint = ([x, y, z, width, height, depth]) => [x * 5 / 6, y, z * 5 / 6, width * 5 / 6, height, depth * 5 / 6];
	const rim = [
		[-4, 1, -18, 8, 14, 10], [10, 1, -18, 8, 14, 10],
		[-18, 1, -4, 10, 14, 8], [8, 1, -4, 10, 14, 8],
		[-14, 1, -14, 8, 14, 8], [6, 1, -14, 8, 14, 8],
		[-14, 1, 6, 8, 14, 8], [6, 1, 6, 8, 14, 8]
	].map(bounds => {
		const [x, y, z, width, height, depth] = scaleFootprint(bounds);
		return cube([x, y, z], [width, height, depth], "crushing_wheel_plates");
	});
	const hub = [
		cube([-5 * 5 / 6, 4, -5 * 5 / 6], [10 * 5 / 6, 8, 10 * 5 / 6], "crushing_wheel_insert"),
		cube([-2 * 5 / 6, -2, -2 * 5 / 6], [4 * 5 / 6, 20, 4 * 5 / 6], "axis"),
		cube([-3 * 5 / 6, 16, -3 * 5 / 6], [6 * 5 / 6, 1, 6 * 5 / 6], "axis_top")
	];
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: 16,
				texture_height: 16,
				visible_bounds_width: 2,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [{ name: "crushing_wheel", pivot: [0, 8, 0], cubes: [...rim, ...hub] }]
		}]
	};
}

// Create renders the burner through several OBJ partials (cage, blaze, rods
// and flame). Bedrock's current data-driven block geometry cannot consume OBJ
// meshes or Flywheel partials, so this deliberately keeps the recognizable
// brazier/cage silhouette in standard cuboids while the material slots retain
// the original Java textures and can be switched by the runtime heat state.
export function convertBlazeBurnerObj({ identifier, source }) {
	if (typeof source !== "string" || !/^v\s/m.test(source) || !/^f\s/m.test(source) || !/^usemtl\s/m.test(source))
		throw new TypeError("Blaze Burner OBJ must contain vertices, faces, and material groups");
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: 16,
				texture_height: 16,
				visible_bounds_width: 2,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [{
				name: "blaze_burner",
				pivot: [0, 0, 0],
				cubes: [
					cube([-7, 0, -7], [14, 4, 14], "blaze_heater_brazier"),
					cube([-6, 4, -6], [2, 10, 2], "blaze_heater_brazier"),
					cube([4, 4, -6], [2, 10, 2], "blaze_heater_brazier"),
					cube([-6, 4, 4], [2, 10, 2], "blaze_heater_brazier"),
					cube([4, 4, 4], [2, 10, 2], "blaze_heater_brazier"),
					cube([-4, 4, -4], [8, 8, 8], "blaze_face"),
					cube([-3, 12, -3], [6, 3, 6], "blaze_flame")
				]
			}]
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

// Create reuses the vanilla lectern model for the controller, so no Java
// model is present in its assets. This cuboid conversion keeps the distinct
// sloped reading stand and pedestal while the pack retains a standard
// Bedrock-only geometry with the existing brass-casing material.
export function convertLecternControllerProxy(identifier) {
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: 16,
				texture_height: 16,
				visible_bounds_width: 2,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [{
				name: "lectern_controller",
				pivot: [0, 0, 0],
				cubes: [
					cube([-7, 0, -7], [14, 2, 14], "redstone_surface"),
					cube([-3, 2, -3], [6, 8, 6], "redstone_surface"),
					cube([-7, 10, -5], [14, 3, 10], "redstone_surface", [-35, 0, 0])
				]
			}]
		}]
	};
}

/**
 * Java renders Gauge heads as dynamic Flywheel partials. Bedrock has no
 * equivalent per-block partial transform, so the build emits 16 source-model
 * composites whose dial rotation is quantized into block states. The meshes
 * and UVs remain direct Java assets; only the animation is discretized.
 */
export function convertGaugeProxy({ identifier, base, dial, head, level }) {
	if (!Number.isInteger(level) || level < 0 || level > 15)
		throw new RangeError("Gauge model level must be an integer between 0 and 15");
	if (![base, dial, head].every(model => Array.isArray(model?.elements)))
		throw new TypeError("Gauge proxy requires Java base, head, and dial model elements");
	const rotatedDial = dial.elements.map(element => ({
		...element,
		rotation: element.rotation && {
			...element.rotation,
			angle: -90 * (level / 15) * 1.125
		}
	}));
	return convertJavaModel({
		identifier,
		model: {
			texture_size: base.texture_size ?? [16, 16],
			textures: { ...(base.textures ?? {}), ...(head.textures ?? {}), ...(dial.textures ?? {}) },
			elements: [...base.elements, ...head.elements, ...rotatedDial]
		}
	});
}

export async function convertJavaModels(resourcePackRoot) {
	const outputDirectory = resolve(resourcePackRoot, "models/blocks");
	await mkdir(outputDirectory, { recursive: true });
	for (const entry of JAVA_MODELS) {
		const source = entry.source && resolve(repositoryRoot, entry.sourceRoot ?? "src/main/resources/assets/create/models/block", entry.source);
		if (entry.converter === "gauge_proxy") {
			const modelDirectory = resolve(repositoryRoot, "src/main/resources/assets/create/models/block/gauge");
			const [base, dial, head] = await Promise.all([
				readFile(resolve(modelDirectory, "base_wall.json"), "utf8"),
				readFile(resolve(modelDirectory, "dial.json"), "utf8"),
				readFile(resolve(modelDirectory, entry.gauge, "head.json"), "utf8")
			]);
			const geometry = convertGaugeProxy({
				identifier: `geometry.createbedrock.${entry.name}`,
				base: JSON.parse(base),
				dial: JSON.parse(dial),
				head: JSON.parse(head),
				level: entry.level
			});
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		if (entry.converter === "crushing_wheel_proxy") {
			const geometry = convertCrushingWheelObj({
				identifier: `geometry.createbedrock.${entry.name}`,
				source: await readFile(source, "utf8")
			});
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		if (entry.converter === "blaze_burner_proxy") {
			const geometry = convertBlazeBurnerObj({
				identifier: `geometry.createbedrock.${entry.name}`,
				source: await readFile(source, "utf8")
			});
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		if (entry.converter === "lectern_controller_proxy") {
			const geometry = convertLecternControllerProxy(`geometry.createbedrock.${entry.name}`);
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		const model = JSON.parse(await readFile(source, "utf8"));
		if (entry.converter === "full_cube_proxy") {
			const geometry = convertFullCubeParent({
				identifier: `geometry.createbedrock.${entry.name}`,
				model
			});
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		if (entry.converter === "cube_column_proxy") {
			const geometry = convertCubeColumnParent({
				identifier: `geometry.createbedrock.${entry.name}`,
				model
			});
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		const geometry = convertJavaModel({
			identifier: `geometry.createbedrock.${entry.name}`,
			model,
			materialName: entry.materialName,
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
