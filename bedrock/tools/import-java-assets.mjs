import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

// These files remain in the Java source tree.  The build only stages copies in
// the generated Bedrock pack, preserving their original provenance and license.
export const JAVA_BLOCK_TEXTURES = [
	"axis.png",
	"axis_top.png",
	"andesite_block.png",
	"andesite_casing.png",
	"andesite_casing_short.png",
	"andesite_casing_very_short.png",
	"basin.png",
	"belt.png",
	"funnel/andesite_funnel.png",
	"bearing_top.png",
	"brass_casing.png",
	"brass_block.png",
	"brass_door_bottom.png",
	"brass_door_side.png",
	"brass_door_top.png",
	"bell.png",
	"bell_anim.png",
	"bell_frame.png",
	"bell_frame_side.png",
	"bracket_metal.png",
	"bracket_plate_metal.png",
	"bracket_plate_wooden.png",
	"bracket_wooden.png",
	"blaze_active.png",
	"blaze_burner_flame.png",
	"blaze_heater_brazier.png",
	"blaze_heater_brazier_soul.png",
	"blaze_idle.png",
	"blaze_inert.png",
	"blaze_super.png",
	"cardboard_block_front.png",
	"cardboard_block_side.png",
	"cardboard_block_top.png",
	"bound_cardboard_block_front.png",
	"bound_cardboard_block_side.png",
	"bound_cardboard_block_top.png",
	"ladder_andesite.png",
	"ladder_andesite_hoop.png",
	"ladder_brass.png",
	"ladder_brass_hoop.png",
	"ladder_copper.png",
	"ladder_copper_hoop.png",
	"cogwheel.png",
	"cogwheel_axis.png",
	"clockwork_bearing_side.png",
	"contraption_controls.png",
	"contraption_controls_frame.png",
	"controls.png",
	"controls_frame.png",
	"crafter_side.png",
	"crafter_thingies.png",
	"cuckoo_clock.png",
	"clutch_off.png",
	"clutch_on.png",
	"copper_casing.png",
	"copper_door_bottom.png",
	"copper_door_side.png",
	"copper_door_top.png",
	"copper_underside.png",
	"creative_fluid_tank.png",
	"chute.png",
	"chute_hole.png",
	"depot_side.png",
	"depot_top.png",
	"desk_bell.png",
	"dark_metal_block.png",
	"encased_chain_drive.png",
	"experience_block.png",
	"glass_door_side.png",
	"glass_door_bottom.png",
	"glass_door_top.png",
	"girder.png",
	"girder_pole.png",
	"girder_pole_side.png",
	"encased_pipe.png",
	"funnel/andesite_funnel_frame.png",
	"funnel/brass_funnel_frame.png",
	"funnel/copper_funnel_frame.png",
	"funnel/andesite_funnel_pull.png",
	"funnel/andesite_funnel_unpowered.png",
	"funnel/funnel_closed.png",
	"fluid_tank.png",
	"fluid_tank_inner.png",
	"fluid_tank_top.png",
	"fluid_tank_window.png",
	"fluid_tank_window_single.png",
	"fluid_valve.png",
	"flap_display_front.png",
	"flap_display_inside.png",
	"flap_display_side.png",
	"flap_display_top.png",
	"glass_fluid_pipe.png",
	"fan_casing.png",
	"fan_side.png",
	"crushing_wheel_plates.png",
	"crushing_wheel_insert.png",
	"gearbox.png",
	"gearbox_top.png",
	"gauge.png",
	"industrial_iron_block.png",
	"item_drain_side.png",
	"item_drain_top.png",
	"large_cogwheel.png",
	"mechanical_press_bottom.png",
	"mechanical_press_side.png",
	"mechanical_press_top.png",
	"pole_end.png",
	"portable_storage_interface.png",
	"roller_casing.png",
	"smooth_dark_log_top.png",
	"mechanical_saw_top_no_slot.png",
	"mixer_base_side.png",
	"mechanical_bearing_side.png",
	"mechanical_drill_top.png",
	"millstone.png",
	"pipes.png",
	"placard.png",
	"portable_fluid_interface.png",
	"pump.png",
	"smart_pipe_1.png",
	"smart_pipe_2.png",
	"smart_pipe_3.png",
	"spout.png",
	"spout_nozzle.png",
	"stock_ticker.png",
	"train_door_bottom.png",
	"train_door_side.png",
	"train_door_top.png",
	"train_controller_base.png",
	"andesite_door_bottom.png",
	"andesite_door_side.png",
	"andesite_door_top.png",
	"whistle.png",
	"whistle_particle.png",
	"standard_track.png",
	"station.png",
	"zinc_block.png",
	"zinc_ore.png",
	"deepslate_zinc_ore.png",
	"raw_zinc_block.png",
	"railway_casing.png",
	"railway_casing_side.png",
	"refined_radiance_casing.png",
	"shadow_steel_casing.png",
	"palettes/rose_quartz_tiles.png",
	"palettes/framed_glass.png",
	"palettes/small_rose_quartz_tiles.png",
	"scaffold/andesite_scaffold.png",
	"scaffold/andesite_scaffold_inside.png",
	"scaffold/brass_scaffold.png",
	"scaffold/brass_scaffold_inside.png",
	"scaffold/copper_scaffold.png",
	"scaffold/copper_scaffold_inside.png",
	"valve_closed.png",
	"valve_open.png",
	"valve_handle/valve_handle_copper.png",
	"weathered_iron_block.png",
	"weathered_iron_block_top.png",
	"palettes/rose_quartz_side.png",
	"palettes/rose_quartz_top.png",
	"rose_quartz_lamp.png",
	"rose_quartz_lamp_powered.png",
	"analog_lever.png",
	"smart_observer.png",
	"diodes/brass_diode_base.png",
	"diodes/pulse_extender/idle.png",
	"diodes/pulse_repeater/idle.png",
	"diodes/pulse_timer/idle.png",
	"contact_front.png",
	"redstone_antenna.png",
	"redstone_requester.png",
	"rotation_speed_controller.png",
	"nixie_tube.png",
	"link_base_unpowered.png",
	"stock_link.png",
	"smart_observer_top.png",
	"sail/canvas_white.png",
	"sail/frame.png",
	"threshold_switch_back.png",
	"threshold_switch_front.png",
	"threshold_switch/level_0.png",
	"threshold_switch/level_1.png",
	"threshold_switch/level_2.png",
	"threshold_switch/level_3.png",
	"threshold_switch/level_4.png",
	"threshold_switch/level_5.png",
	"tunnel/brass_tunnel_top_connected.png",
	"net.png",
	"table_cloth/andesite.png",
	"table_cloth/brass.png",
	"table_cloth/copper.png",
	"copycat_base.png",
	"terrain_zapper_mesh.png"
	,"linear_chassis_side.png"
	,"secondary_linear_chassis_side.png"
	,"radial_chassis_side.png"
];
export const JAVA_ITEM_TEXTURES = ["belt_connector.png", "brass_ingot.png", "raw_zinc.png", "zinc_ingot.png", "zinc_nugget.png", "copper_nugget.png", "andesite_alloy.png", "rose_quartz.png", "polished_rose_quartz.png", "sand_paper.png", "red_sand_paper.png", "chromatic_compound_1.png", "refined_radiance.png", "shadow_steel.png", "shopping_list.png", "filter.png", "attribute_filter.png", "linked_controller.png", "cardboard.png", "cardboard_boots.png", "cardboard_chestplate.png", "cardboard_helmet.png", "cardboard_leggings.png", "cardboard_sword.png", "blaze_cake_base.png", "blaze_cake.png", "creative_blaze_cake.png", "crushed_raw_copper.png", "crushed_raw_gold.png", "crushed_raw_iron.png", "crushed_raw_zinc.png", "bar_of_chocolate.png", "sweet_roll.png", "chocolate_glazed_berries.png", "honeyed_apple.png", "builders_tea.png", "experience_nugget.png", "super_glue.png", "tree_fertilizer.png"];
export const JAVA_ARMOR_TEXTURES = ["models/armor/cardboard_layer_1.png", "models/armor/cardboard_layer_2.png"];
export const JAVA_SOUND_ASSETS = [
	{ source: "desk_bell.ogg", target: "create/desk_bell.ogg" },
	{ source: "haunted_bell_use.ogg", target: "create/haunted_bell_use.ogg" },
	{ source: "haunted_bell_convert.ogg", target: "create/haunted_bell_convert.ogg" },
	{ source: "whistle.ogg", target: "create/whistle.ogg" },
	{ source: "whistle_low.ogg", target: "create/whistle_low.ogg" },
	{ source: "whistle_high.ogg", target: "create/whistle_high.ogg" },
	{ source: "cardboard_bonk.ogg", target: "create/cardboard_bonk.ogg" }
];

export async function importJavaAssets(resourcePackRoot) {
	const sourceDirectory = resolve(repositoryRoot, "src/main/resources/assets/create/textures/block");
	const targetDirectory = resolve(resourcePackRoot, "textures/create_java/block");
	const itemSourceDirectory = resolve(repositoryRoot, "src/main/resources/assets/create/textures/item");
	const itemTargetDirectory = resolve(resourcePackRoot, "textures/create_java/item");
	const soundSourceDirectory = resolve(repositoryRoot, "src/main/resources/assets/create/sounds");
	const soundTargetDirectory = resolve(resourcePackRoot, "sounds");
	await mkdir(targetDirectory, { recursive: true });
	await mkdir(itemTargetDirectory, { recursive: true });
	await mkdir(soundTargetDirectory, { recursive: true });

	for (const texture of JAVA_BLOCK_TEXTURES)
		await mkdir(dirname(resolve(targetDirectory, texture)), { recursive: true }).then(() => cp(resolve(sourceDirectory, texture), resolve(targetDirectory, texture)));
	for (const texture of JAVA_ITEM_TEXTURES)
		await cp(resolve(itemSourceDirectory, texture), resolve(itemTargetDirectory, texture));
	for (const texture of JAVA_ARMOR_TEXTURES)
		await cp(resolve(repositoryRoot, "src/main/resources/assets/create/textures", texture), resolve(resourcePackRoot, "textures/create_java", texture));
	for (const sound of JAVA_SOUND_ASSETS) {
		const target = resolve(soundTargetDirectory, sound.target);
		await mkdir(dirname(target), { recursive: true });
		await cp(resolve(soundSourceDirectory, sound.source), target);
	}

	await writeFile(resolve(resourcePackRoot, "create-java-asset-provenance.json"), `${JSON.stringify({
			sources: {
				block: { directory: "src/main/resources/assets/create/textures/block", files: JAVA_BLOCK_TEXTURES },
				item: { directory: "src/main/resources/assets/create/textures/item", files: JAVA_ITEM_TEXTURES },
				armor: { directory: "src/main/resources/assets/create/textures", files: JAVA_ARMOR_TEXTURES },
				sound: { directory: "src/main/resources/assets/create/sounds", files: JAVA_SOUND_ASSETS }
		},
		note: "Build-time copies only. Java models require explicit Bedrock geometry conversion."
	}, null, 2)}\n`);
	return JAVA_BLOCK_TEXTURES.length + JAVA_ITEM_TEXTURES.length + JAVA_SOUND_ASSETS.length;
}
