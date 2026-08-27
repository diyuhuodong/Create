import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

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
	// The Java motor body is deliberately static while SHAFT_HALF rotates. In
	// Bedrock both parts live in one visual entity so its orientation, lifetime,
	// and animation are always a single coherent machine.
	{ name: "creative_motor", source: "creative_motor/block.json" },
	{ name: "creative_motor_vertical", source: "creative_motor/block_vertical.json" },
	{ name: "creative_motor_shaft", source: "shaft_half.json", converter: "creative_motor_shaft_proxy" },
	// Generates one complete entity geometry for each Java model variant, plus a
	// texture atlas containing the casing, panel, and shaft textures.
	{ name: "creative_motor_visual", converter: "creative_motor_visual_proxy" },
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
	{ name: "crushing_wheel_controller", converter: "crushing_wheel_controller_proxy" },
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
// This cube reconstruction is measured from Create's crushing_wheel.obj:
// - its octagonal outer teeth reach +/-1.070326 blocks from the centre;
// - the stone wheel occupies y=0.119..0.881 (12.192 pixels), not a full block;
// - the source is a continuous circular crusher plate with teeth only at its rim.
// A block's geometry is limited to 30 pixels across, so the static block is
// reduced only in X/Z. The dynamic entity uses the original Java dimensions.
const CRUSHING_WHEEL_SOURCE = Object.freeze({
	bodyHeight: 12.192,
	bodyY: 1.904,
	coreRadius: 4,
	outerRadius: 17.125216,
	staticFootprintScale: 30 / 34.250432,
	segments: 16,
	toothSkew: -12,
	insertDiameter: 28,
	insertTextureSize: 16
});

function scaleCrushingWheelCube({ origin, size, material, rotation }, footprintScale) {
	const scale = (value, axis) => axis === 1 ? value : value * footprintScale;
	const scaled = cube(origin.map(scale), size.map(scale), material, rotation);
	return scaled;
}

function crushingWheelRing({ footprintScale, material, radialEnd, radialStart, tangentialWidth, y = CRUSHING_WHEEL_SOURCE.bodyY, height = CRUSHING_WHEEL_SOURCE.bodyHeight }) {
	const radialDepth = radialEnd - radialStart;
	return Array.from({ length: CRUSHING_WHEEL_SOURCE.segments }, (_, index) => scaleCrushingWheelCube({
		origin: [-tangentialWidth / 2, y, -radialEnd],
		size: [tangentialWidth, height, radialDepth],
		material,
		rotation: [0, index * 360 / CRUSHING_WHEEL_SOURCE.segments, 0]
	}, footprintScale));
}

function crushingWheelDisc(footprintScale) {
	// Java's top view is one continuous insert texture with one central wooden
	// motif. The cuboids only approximate its circular outline; their top UVs
	// must form one texture space, otherwise each band repeats that wooden motif.
	const bands = [
		[-14, -12, 5.2], [-12, -10, 8.6], [-10, -8, 10.8],
		[-8, -6, 12.5], [-6, -4, 13.5], [-4, 4, 14],
		[4, 6, 13.5], [6, 8, 12.5], [8, 10, 10.8],
		[10, 12, 8.6], [12, 14, 5.2]
	];
	return bands.map(([start, end, halfWidth]) => {
		const origin = [-halfWidth, CRUSHING_WHEEL_SOURCE.bodyY, start];
		const size = [halfWidth * 2, CRUSHING_WHEEL_SOURCE.bodyHeight, end - start];
		const disc = scaleCrushingWheelCube({ origin, size, material: "crushing_wheel_insert" }, footprintScale);
		const diameter = CRUSHING_WHEEL_SOURCE.insertDiameter;
		const textureSize = CRUSHING_WHEEL_SOURCE.insertTextureSize;
		// Use the cube's original, unscaled placement for UVs. The static proxy
		// and dynamic entity can have different footprints without changing where
		// the one centre texture lands.
		disc.uv.up = face("crushing_wheel_insert", [
			(origin[0] + diameter / 2) * textureSize / diameter,
			(origin[2] + diameter / 2) * textureSize / diameter
		], [size[0] * textureSize / diameter, size[2] * textureSize / diameter]);
		return disc;
	});
}

function crushingWheelGroups(footprintScale) {
	const disc = crushingWheelDisc(footprintScale);
	// One identical tooth is repeated at 22.5-degree intervals. This is the
	// deliberate visual skeleton; OBJ material patches are not tooth geometry.
	const stoneTeeth = crushingWheelRing({
		footprintScale,
		material: "crushing_wheel_plates",
		radialStart: 14.16,
		radialEnd: CRUSHING_WHEEL_SOURCE.outerRadius,
		tangentialWidth: 4.4
	});
	const core = scaleCrushingWheelCube({
		origin: [-CRUSHING_WHEEL_SOURCE.coreRadius, 1, -CRUSHING_WHEEL_SOURCE.coreRadius],
		size: [8, 14, 8],
		material: "spruce_log_top"
	}, footprintScale);
	const axle = scaleCrushingWheelCube({
		origin: [-2, 0, -2],
		size: [4, 16, 4],
		material: "axis"
	}, footprintScale);
	axle.uv.up.material_instance = "axis_top";
	axle.uv.down.material_instance = "axis_top";
	return {
		disc,
		teeth: stoneTeeth,
		core: [core],
		axle: [axle]
	};
}

function crushingWheelCubes(footprintScale) {
	return Object.values(crushingWheelGroups(footprintScale)).flat();
}

function assertCrushingWheelObj(source) {
	if (typeof source !== "string" || !/^v\s/m.test(source) || !/^f\s/m.test(source) || !/^usemtl\s/m.test(source))
		throw new TypeError("Crushing Wheel OBJ must contain vertices, faces, and material groups");
}

export function convertCrushingWheelObj({ identifier, source }) {
	assertCrushingWheelObj(source);
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
				name: "crushing_wheel",
				pivot: [0, 8, 0],
				cubes: crushingWheelCubes(CRUSHING_WHEEL_SOURCE.staticFootprintScale)
			}]
		}]
	};
}

// Java materializes this controller only as an invisible intermediary between
// two opposing wheels. It deliberately has no renderable cubes in Bedrock as
// well; runtime state owns the processing region between the visible wheels.
export function convertCrushingWheelControllerProxy(identifier) {
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: 16,
				texture_height: 16,
				visible_bounds_width: 1,
				visible_bounds_height: 1,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [{
				name: "crushing_wheel_controller",
				pivot: [0, 8, 0]
			}]
		}]
	};
}

const CRUSHING_WHEEL_ATLAS_TEXTURES = Object.freeze([
	"crushing_wheel_plates",
	"crushing_wheel_insert",
	"axis",
	"axis_top",
	"spruce_log_top"
]);
const CRUSHING_WHEEL_ATLAS_SOURCE_OVERRIDES = Object.freeze({
	// Create's source material map references minecraft:block/spruce_log_top.
	// The entity atlas needs every source material in one texture image.
	spruce_log_top: resolve(bedrockRoot, "resource_pack/textures/createbedrock/kinetics/spruce_log_top.png")
});
const CRUSHING_WHEEL_ATLAS_TILE_SIZE = 32;

// The placed block needs to remain inside Bedrock's block-geometry envelope,
// but its dynamic entity does not. It therefore uses the source-calibrated
// wheel unchanged, including the thin circular stone body, rim teeth, wood core,
// exposed axle, and full 34.250432-pixel Java footprint. Like the Creative
// Motor, a root bone owns independently-renderable children and is the only
// bone the kinetic animation rotates.
export function convertCrushingWheelVisual({ identifier, source }) {
	assertCrushingWheelObj(source);
	const atlasCube = sourceCube => ({
		...sourceCube,
		uv: Object.fromEntries(Object.entries(sourceCube.uv).map(([direction, definition]) => {
			const textureIndex = CRUSHING_WHEEL_ATLAS_TEXTURES.indexOf(definition.material_instance);
			if (textureIndex < 0)
				throw new RangeError(`Crushing Wheel visual cannot atlas material ${definition.material_instance}`);
			const atlasScale = CRUSHING_WHEEL_ATLAS_TILE_SIZE / CRUSHING_WHEEL_SOURCE.insertTextureSize;
			return [direction, {
				...definition,
				material_instance: "default",
				uv: [textureIndex * CRUSHING_WHEEL_ATLAS_TILE_SIZE + definition.uv[0] * atlasScale, definition.uv[1] * atlasScale],
				uv_size: definition.uv_size.map(value => value * atlasScale)
			}];
		}))
	});
	const groups = crushingWheelGroups(1);
	const toothCentreZ = -(14.16 + CRUSHING_WHEEL_SOURCE.outerRadius) / 2;
	const visualTooth = sourceCube => {
		// The parent supplies the radial position. A small local yaw creates the
		// swept, diagonal Create-style tooth instead of a straight spoke.
		const { pivot, rotation, ...unrotated } = sourceCube;
		return {
			...atlasCube(unrotated),
			pivot: [0, 8, toothCentreZ],
			rotation: [0, CRUSHING_WHEEL_SOURCE.toothSkew, 0]
		};
	};
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: CRUSHING_WHEEL_ATLAS_TEXTURES.length * CRUSHING_WHEEL_ATLAS_TILE_SIZE,
				texture_height: CRUSHING_WHEEL_ATLAS_TILE_SIZE,
				visible_bounds_width: 3,
				visible_bounds_height: 2.5,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [
				{ name: "crushing_wheel_orientation", pivot: [0, 8, 0] },
				{ name: "crushing_wheel", parent: "crushing_wheel_orientation", pivot: [0, 8, 0] },
				...Object.entries(groups).filter(([name]) => name !== "teeth").map(([name, cubes]) => ({
					name: "crushing_wheel_" + name,
					parent: "crushing_wheel",
					pivot: [0, 8, 0],
					cubes: cubes.map(atlasCube)
				})),
				{ name: "crushing_wheel_teeth", parent: "crushing_wheel", pivot: [0, 8, 0] },
				...groups.teeth.map((tooth, index) => ({
					name: `crushing_wheel_tooth_${index}`,
					parent: "crushing_wheel_teeth",
					pivot: [0, 8, 0],
					rotation: [0, index * 360 / CRUSHING_WHEEL_SOURCE.segments, 0],
					cubes: [visualTooth(tooth)]
				}))
			]
		}]
	};
}

// Create's motor block model intentionally has an empty `shaft` group. Java
// renders AllPartialModels.SHAFT_HALF separately, from the block centre toward
// its FACING side. Keep this exact partial in a dedicated bone so only the
// output shaft rotates; the converted motor casing always stays still.
export function convertCreativeMotorShaftProxy({ identifier, model }) {
	const axis = model?.elements?.find(element => element?.name === "Axis");
	if (!axis || !Array.isArray(axis.from) || !Array.isArray(axis.to) || !axis.faces)
		throw new TypeError("Creative Motor shaft conversion requires the Java SHAFT_HALF Axis element");
	const shaft = {
		origin: [axis.from[0] - 8, axis.from[1], axis.from[2] - 8],
		size: axis.to.map((coordinate, index) => coordinate - axis.from[index]),
		uv: Object.fromEntries(Object.entries(axis.faces)
			.map(([direction, faceDefinition]) => [direction, convertFace(faceDefinition, model.textures ?? {}, {}, undefined)])),
		...convertRotation(axis.rotation)
	};
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
			bones: [
				{ name: "motor_orientation", pivot: [0, 8, 0] },
				{
					name: "motor_shaft",
					parent: "motor_orientation",
					pivot: [0, 8, 0],
					cubes: [shaft]
				}
			]
		}]
	};
}

const CREATIVE_MOTOR_ATLAS_TEXTURES = Object.freeze([
	"axis", "axis_top", "creative_casing", "creative_motor", "flap_display_front"
]);
const CREATIVE_MOTOR_ATLAS_TILE_SIZE = 16;

function creativeMotorAtlasFace(face, textures) {
	const texture = materialName(resolveTexture(face.texture, textures, {}));
	const index = CREATIVE_MOTOR_ATLAS_TEXTURES.indexOf(texture);
	if (index < 0)
		throw new RangeError(`Creative Motor visual cannot atlas Java texture ${texture}`);
	const converted = convertFace(face, textures, {}, "default");
	converted.uv[0] += index * CREATIVE_MOTOR_ATLAS_TILE_SIZE;
	return converted;
}

function creativeMotorAtlasCube(element, textures) {
	if (!Array.isArray(element?.from) || !Array.isArray(element?.to))
		throw new TypeError("Creative Motor visual requires Java model element bounds");
	return {
		origin: [element.from[0] - 8, element.from[1], element.from[2] - 8],
		size: element.to.map((coordinate, index) => coordinate - element.from[index]),
		uv: Object.fromEntries(Object.entries(element.faces ?? {})
			.map(([direction, face]) => [direction, creativeMotorAtlasFace(face, textures)])),
		...convertRotation(element.rotation)
	};
}

function creativeMotorCasingCubes(model) {
	return modelParts(model).flatMap(part => part.elements
		.map(element => creativeMotorAtlasCube(element, part.textures)));
}

function creativeMotorShaftCube(model, orientation) {
	const axis = model?.elements?.find(element => element?.name === "Axis");
	if (!axis || !Array.isArray(axis.from) || !Array.isArray(axis.to) || !axis.faces)
		throw new TypeError("Creative Motor visual requires the Java SHAFT_HALF Axis element");
	if (orientation === "horizontal")
		return creativeMotorAtlasCube(axis, model.textures ?? {});
	if (orientation !== "vertical")
		throw new RangeError(`Unknown Creative Motor visual orientation: ${orientation}`);
	const verticalFace = Object.freeze({ north: "down", south: "up", east: "east", west: "west", up: "north", down: "south" });
	return {
		origin: [axis.from[0] - 8, 8, axis.from[1] - 8],
		size: [axis.to[0] - axis.from[0], axis.to[2] - axis.from[2], axis.to[1] - axis.from[1]],
		uv: Object.fromEntries(Object.entries(axis.faces)
			.map(([direction, face]) => [verticalFace[direction], creativeMotorAtlasFace(face, model.textures ?? {})])),
		...convertRotation(axis.rotation)
	};
}

const VALUE_BOARD_SEGMENTS = Object.freeze({
	0: ["a", "b", "c", "d", "e", "f"],
	1: ["b", "c"],
	2: ["a", "b", "g", "e", "d"],
	3: ["a", "b", "g", "c", "d"],
	4: ["f", "g", "b", "c"],
	5: ["a", "f", "g", "c", "d"],
	6: ["a", "f", "g", "e", "c", "d"],
	7: ["a", "b", "c"],
	8: ["a", "b", "c", "d", "e", "f", "g"],
	9: ["a", "b", "c", "d", "f", "g"]
});

function valueBoardCube(origin, size, lit) {
	const uv = lit ? [1, 0] : [0, 0];
	return {
		origin,
		size,
		uv: Object.fromEntries(["north", "south", "east", "west", "up", "down"].map(direction => [direction, face("default", uv, [1, 1])]))
	};
}

function valueBoardDigitCubes(x, digit) {
	const segmentBounds = {
		a: [-1.15, 2.45, 0, 2.3, 0.45, 0.35],
		b: [1.15, 0.15, 0, 0.45, 2.3, 0.35],
		c: [1.15, -2.15, 0, 0.45, 2.3, 0.35],
		d: [-1.15, -2.6, 0, 2.3, 0.45, 0.35],
		e: [-1.6, -2.15, 0, 0.45, 2.3, 0.35],
		f: [-1.6, 0.15, 0, 0.45, 2.3, 0.35],
		g: [-1.15, -0.225, 0, 2.3, 0.45, 0.35]
	};
	return VALUE_BOARD_SEGMENTS[digit].map(segment => {
		const [offsetX, y, z, width, height, depth] = segmentBounds[segment];
		return valueBoardCube([x + offsetX, y, z], [width, height, depth], true);
	});
}

// Java's hover outline shows only the formatted value. Direction is selected
// inside its separate settings board, not painted next to the motor, so the
// Bedrock overlay follows that same compact, number-only presentation.
export function convertCreativeMotorValueBoard(identifier) {
	const bones = [
		// Java's value board is an interaction overlay. A solid Bedrock backplate
		// reads as an opaque black rectangle, so retain only its floating digits
		// while the player focuses the value box.
		{ name: "board_root", pivot: [0, 0, 0] },
		// ScrollValueRenderer draws a wide, non-filled outline around the Java
		// value. Four hairline cuboids reproduce that focus cue without creating
		// a dark panel or blocking the motor beneath it.
		{
			name: "board_outline",
			parent: "board_root",
			pivot: [0, 0, 0],
			cubes: [
				valueBoardCube([-7, 3.15, -0.12], [14, 0.25, 0.22], true),
				valueBoardCube([-7, -3.4, -0.12], [14, 0.25, 0.22], true),
				valueBoardCube([-7, -3.15, -0.12], [0.25, 6.3, 0.22], true),
				valueBoardCube([6.75, -3.15, -0.12], [0.25, 6.3, 0.22], true)
			]
		}
	];
	for (const [place, x] of [["hundreds", -4.7], ["tens", -1.25], ["ones", 2.2]]) {
		for (let digit = 0; digit <= 9; digit++) {
			bones.push({
				name: `board_${place}_${digit}`,
				parent: "board_root",
				pivot: [0, 0, 0],
				cubes: valueBoardDigitCubes(x, digit)
			});
		}
	}
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: 2,
				texture_height: 1,
				visible_bounds_width: 2,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0, 0]
			},
			bones
		}]
	};
}

export function creativeMotorValueBoardAnimation() {
	const bones = {
		board_root: {
			// The unscaled glyph geometry is authored in model pixels. Java renders
			// value text at 1/64 font scale inside a half-block hit target; a 0.45
			// model scale gives the same small, readable in-world cue instead of a
			// sign-sized display.
			scale: [0.45, 0.45, 0.45],
			rotation: [
				"query.property('createbedrock:face') == 0 ? 90 : query.property('createbedrock:face') == 1 ? -90 : 0",
				"query.property('createbedrock:face') == 2 ? 180 : query.property('createbedrock:face') == 4 ? 90 : query.property('createbedrock:face') == 5 ? -90 : 0",
				0
			]
		}
	};
	for (const place of ["hundreds", "tens", "ones"])
		for (let digit = 0; digit <= 9; digit++) {
			const shown = `query.property('createbedrock:digit_${place}') == ${digit} ? 1 : 0`;
			bones[`board_${place}_${digit}`] = { scale: [shown, shown, shown] };
		}
	return {
		format_version: "1.8.0",
		animations: {
			"animation.createbedrock.creative_motor_value_board": {
				animation_length: 1,
				loop: true,
				bones
			}
		}
	};
}

// A single entity owns the static shell, panel, and Java SHAFT_HALF. Its root
// handles direction while the shaft child is the only rotating bone.
export function convertCreativeMotorVisual({ identifier, casingModel, orientation, shaftModel }) {
	if (!identifier || !casingModel || !shaftModel)
		throw new TypeError("Creative Motor visual conversion requires casing and shaft models");
	const shaftBone = orientation === "vertical" ? "motor_shaft_vertical" : "motor_shaft_horizontal";
	return {
		format_version: "1.21.0",
		"minecraft:geometry": [{
			description: {
				identifier,
				texture_width: CREATIVE_MOTOR_ATLAS_TEXTURES.length * CREATIVE_MOTOR_ATLAS_TILE_SIZE,
				texture_height: CREATIVE_MOTOR_ATLAS_TILE_SIZE,
				visible_bounds_width: 2,
				visible_bounds_height: 2,
				visible_bounds_offset: [0, 0.5, 0]
			},
			bones: [
				{ name: "motor_root", pivot: [0, 8, 0] },
				{ name: "motor_casing", parent: "motor_root", pivot: [0, 8, 0], cubes: creativeMotorCasingCubes(casingModel) },
				{ name: shaftBone, parent: "motor_root", pivot: [0, 8, 0], cubes: [creativeMotorShaftCube(shaftModel, orientation)] }
			]
		}]
	};
}

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const value of buffer) {
		crc ^= value;
		for (let bit = 0; bit < 8; bit++)
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
	const typeBuffer = Buffer.from(type, "ascii");
	const chunk = Buffer.alloc(12 + data.length);
	chunk.writeUInt32BE(data.length, 0);
	typeBuffer.copy(chunk, 4);
	data.copy(chunk, 8);
	chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
	return chunk;
}

function paeth(left, above, upperLeft) {
	const estimate = left + above - upperLeft;
	const leftDistance = Math.abs(estimate - left);
	const aboveDistance = Math.abs(estimate - above);
	const upperLeftDistance = Math.abs(estimate - upperLeft);
	return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left
		: aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePngRgba(source) {
	if (source.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0)
		throw new TypeError("Creative Motor atlas source is not a PNG");
	let offset = 8;
	let header;
	let palette;
	let transparency;
	const data = [];
	while (offset < source.length) {
		const length = source.readUInt32BE(offset);
		const type = source.subarray(offset + 4, offset + 8).toString("ascii");
		const chunk = source.subarray(offset + 8, offset + 8 + length);
		offset += 12 + length;
		if (type === "IHDR") header = { bitDepth: chunk[8], colorType: chunk[9], height: chunk.readUInt32BE(4), width: chunk.readUInt32BE(0) };
		else if (type === "PLTE") palette = chunk;
		else if (type === "tRNS") transparency = chunk;
		else if (type === "IDAT") data.push(chunk);
		else if (type === "IEND") break;
	}
	if (!header || ![2, 3, 6].includes(header.colorType)
		|| (header.colorType !== 3 && header.bitDepth !== 8)
		|| (header.colorType === 3 && ![1, 2, 4, 8].includes(header.bitDepth)))
		throw new TypeError("Creative Motor atlas supports 8-bit RGB/RGBA and indexed PNG sources");
	const bytesPerPixel = header.colorType === 3 ? 1 : ({ 2: 3, 6: 4 })[header.colorType];
	const decoded = inflateSync(Buffer.concat(data));
	const scanlineLength = header.colorType === 3
		? Math.ceil(header.width * header.bitDepth / 8)
		: header.width * bytesPerPixel;
	const unfiltered = Buffer.alloc(header.height * scanlineLength);
	let cursor = 0;
	for (let y = 0; y < header.height; y++) {
		const filter = decoded[cursor++];
		const rowOffset = y * scanlineLength;
		for (let x = 0; x < scanlineLength; x++) {
			const raw = decoded[cursor++];
			const left = x >= bytesPerPixel ? unfiltered[rowOffset + x - bytesPerPixel] : 0;
			const above = y > 0 ? unfiltered[rowOffset - scanlineLength + x] : 0;
			const upperLeft = y > 0 && x >= bytesPerPixel ? unfiltered[rowOffset - scanlineLength + x - bytesPerPixel] : 0;
			const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : 0;
			unfiltered[rowOffset + x] = (raw + predictor) & 0xff;
		}
	}
	const rgba = Buffer.alloc(header.width * header.height * 4);
	for (let pixel = 0; pixel < header.width * header.height; pixel++) {
		const sourceIndex = header.colorType === 3
			? Math.floor(pixel / header.width) * scanlineLength + Math.floor((pixel % header.width) * header.bitDepth / 8)
			: pixel * bytesPerPixel;
		const targetIndex = pixel * 4;
		if (header.colorType === 3) {
			const bitOffset = (pixel % header.width) * header.bitDepth % 8;
			const paletteIndex = (unfiltered[sourceIndex] >> (8 - header.bitDepth - bitOffset)) & ((1 << header.bitDepth) - 1);
			rgba[targetIndex] = palette?.[paletteIndex * 3] ?? 0;
			rgba[targetIndex + 1] = palette?.[paletteIndex * 3 + 1] ?? 0;
			rgba[targetIndex + 2] = palette?.[paletteIndex * 3 + 2] ?? 0;
			rgba[targetIndex + 3] = transparency?.[paletteIndex] ?? 255;
		} else {
			unfiltered.copy(rgba, targetIndex, sourceIndex, sourceIndex + bytesPerPixel);
			if (header.colorType === 2) rgba[targetIndex + 3] = 255;
		}
	}
	return { height: header.height, rgba, width: header.width };
}

function encodePngRgba({ height, rgba, width }) {
	const scanlines = Buffer.alloc(height * (1 + width * 4));
	for (let y = 0; y < height; y++) {
		const targetOffset = y * (1 + width * 4);
		scanlines[targetOffset] = 0;
		rgba.copy(scanlines, targetOffset + 1, y * width * 4, (y + 1) * width * 4);
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 6;
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(scanlines)), pngChunk("IEND", Buffer.alloc(0))]);
}

async function writeCreativeMotorAtlas(resourcePackRoot) {
	const textureDirectory = resolve(resourcePackRoot, "textures/createbedrock/kinetics");
	const sourceDirectory = resolve(repositoryRoot, "src/main/resources/assets/create/textures/block");
	const textures = await Promise.all(CREATIVE_MOTOR_ATLAS_TEXTURES.map(async name => ({
		...decodePngRgba(await readFile(resolve(sourceDirectory, `${name}.png`)))
	})));
	if (!textures.every(texture => texture.width === CREATIVE_MOTOR_ATLAS_TILE_SIZE && texture.height === CREATIVE_MOTOR_ATLAS_TILE_SIZE))
		throw new TypeError("Creative Motor atlas source textures must remain 16 by 16 pixels");
	const width = textures.length * CREATIVE_MOTOR_ATLAS_TILE_SIZE;
	const rgba = Buffer.alloc(width * CREATIVE_MOTOR_ATLAS_TILE_SIZE * 4);
	for (const [index, texture] of textures.entries()) {
		for (let y = 0; y < texture.height; y++)
			texture.rgba.copy(rgba, (y * width + index * texture.width) * 4, y * texture.width * 4, (y + 1) * texture.width * 4);
	}
	await mkdir(textureDirectory, { recursive: true });
	await writeFile(resolve(textureDirectory, "creative_motor_atlas.png"), encodePngRgba({ height: CREATIVE_MOTOR_ATLAS_TILE_SIZE, rgba, width }));
}

async function writeCrushingWheelAtlas(resourcePackRoot) {
	const textureDirectory = resolve(resourcePackRoot, "textures/createbedrock/kinetics");
	const sourceDirectory = resolve(repositoryRoot, "src/main/resources/assets/create/textures/block");
	const textures = await Promise.all(CRUSHING_WHEEL_ATLAS_TEXTURES.map(async name => decodePngRgba(await readFile(
		CRUSHING_WHEEL_ATLAS_SOURCE_OVERRIDES[name] ?? resolve(sourceDirectory, `${name}.png`)
	))));
	if (!textures.every(texture => [16, 32].includes(texture.width) && texture.width === texture.height))
		throw new TypeError("Crushing Wheel atlas source textures must remain square 16 or 32 pixel images");
	const width = textures.length * CRUSHING_WHEEL_ATLAS_TILE_SIZE;
	const rgba = Buffer.alloc(width * CRUSHING_WHEEL_ATLAS_TILE_SIZE * 4);
	for (const [index, texture] of textures.entries())
		for (let y = 0; y < CRUSHING_WHEEL_ATLAS_TILE_SIZE; y++)
			for (let x = 0; x < CRUSHING_WHEEL_ATLAS_TILE_SIZE; x++) {
				const sourceX = Math.floor(x * texture.width / CRUSHING_WHEEL_ATLAS_TILE_SIZE);
				const sourceY = Math.floor(y * texture.height / CRUSHING_WHEEL_ATLAS_TILE_SIZE);
				const targetOffset = (y * width + index * CRUSHING_WHEEL_ATLAS_TILE_SIZE + x) * 4;
				texture.rgba.copy(rgba, targetOffset, (sourceY * texture.width + sourceX) * 4, (sourceY * texture.width + sourceX + 1) * 4);
			}
	await mkdir(textureDirectory, { recursive: true });
	await writeFile(resolve(textureDirectory, "crushing_wheel_atlas.png"), encodePngRgba({ height: CRUSHING_WHEEL_ATLAS_TILE_SIZE, rgba, width }));
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
	const entityOutputDirectory = resolve(resourcePackRoot, "models/entity");
	await mkdir(outputDirectory, { recursive: true });
	await mkdir(entityOutputDirectory, { recursive: true });
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
			const visual = convertCrushingWheelVisual({
				identifier: `geometry.createbedrock.${entry.name}_visual`,
				source: await readFile(source, "utf8")
			});
			await writeFile(resolve(outputDirectory, `${entry.name}_visual.geo.json`), `${JSON.stringify(visual, null, 2)}\n`);
			await writeCrushingWheelAtlas(resourcePackRoot);
			continue;
		}
		if (entry.converter === "crushing_wheel_controller_proxy") {
			const geometry = convertCrushingWheelControllerProxy(`geometry.createbedrock.${entry.name}`);
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		if (entry.converter === "creative_motor_shaft_proxy") {
			const model = JSON.parse(await readFile(source, "utf8"));
			const geometry = convertCreativeMotorShaftProxy({ identifier: `geometry.createbedrock.${entry.name}`, model });
			await writeFile(resolve(outputDirectory, `${entry.name}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			continue;
		}
		if (entry.converter === "creative_motor_visual_proxy") {
			const modelDirectory = resolve(repositoryRoot, "src/main/resources/assets/create/models/block");
			const [horizontalSource, verticalSource, shaftSource] = await Promise.all([
				readFile(resolve(modelDirectory, "creative_motor/block.json"), "utf8"),
				readFile(resolve(modelDirectory, "creative_motor/block_vertical.json"), "utf8"),
				readFile(resolve(modelDirectory, "shaft_half.json"), "utf8")
			]);
			const shaftModel = JSON.parse(shaftSource);
			for (const [orientation, casingModel] of [["horizontal", JSON.parse(horizontalSource)], ["vertical", JSON.parse(verticalSource)]]) {
				const geometry = convertCreativeMotorVisual({
					identifier: `geometry.createbedrock.creative_motor_visual_${orientation}`,
					casingModel,
					orientation,
					shaftModel
				});
				await writeFile(resolve(entityOutputDirectory, `creative_motor_visual_${orientation}.geo.json`), `${JSON.stringify(geometry, null, 2)}\n`);
			}
			await writeCreativeMotorAtlas(resourcePackRoot);
			const valueBoard = convertCreativeMotorValueBoard("geometry.createbedrock.creative_motor_value_board");
			const animationDirectory = resolve(resourcePackRoot, "animations");
			const textureDirectory = resolve(resourcePackRoot, "textures/createbedrock/kinetics");
			await mkdir(animationDirectory, { recursive: true });
			await mkdir(textureDirectory, { recursive: true });
			await writeFile(resolve(entityOutputDirectory, "creative_motor_value_board.geo.json"), `${JSON.stringify(valueBoard, null, 2)}\n`);
			await writeFile(resolve(animationDirectory, "creative_motor_value_board.animation.json"), `${JSON.stringify(creativeMotorValueBoardAnimation(), null, 2)}\n`);
			await writeFile(resolve(textureDirectory, "creative_motor_value_board.png"), encodePngRgba({
				width: 2,
				height: 1,
				rgba: Buffer.from([38, 30, 24, 255, 255, 209, 73, 255])
			}));
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
