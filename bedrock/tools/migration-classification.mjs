import { REDSTONE_DEVICE_CATALOG } from "../behavior_pack/scripts/redstone/redstone-device-catalog.js";

const STAGE_TWO_PROTOTYPES = new Map([
	["andesite_casing", { domain: "content" }],
	["brass_casing", { domain: "content" }],
	["belt_connector", { domain: "kinetics" }],
	["clutch", { domain: "kinetics" }],
	["cogwheel", { domain: "kinetics" }],
	["copper_casing", { domain: "content" }],
	["crushing_wheel", { domain: "processing" }],
	["encased_chain_drive", { domain: "kinetics" }],
	["gearbox", { domain: "kinetics" }],
	["hand_crank", { domain: "kinetics" }],
	["industrial_iron_block", { domain: "content" }],
	["large_cogwheel", { domain: "kinetics" }],
	["mechanical_bearing", { domain: "contraptions" }],
	["mechanical_press", { domain: "processing" }],
	["millstone", { domain: "processing" }],
	["shaft", { domain: "kinetics" }],
	["track", { domain: "trains" }],
	["track_station", { domain: "trains" }],
	["water_wheel", { domain: "kinetics" }],
	["zinc_block", { domain: "content" }]
]);

const BEHAVIOR_PATHS = new Map([
	["andesite_funnel", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["andesite_belt_funnel", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["andesite_tunnel", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["attribute_filter", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["belt", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["brass_belt_funnel", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["brass_funnel", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["brass_tunnel", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["chute", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["creative_crate", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["depot", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["filter", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["funnel", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["item_hatch", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["item_vault", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["smart_chute", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["weighted_ejector", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["belt_connector", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["clutch", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["adjustable_chain_gearshift", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["andesite_encased_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["andesite_encased_large_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["andesite_encased_shaft", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["brass_encased_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["brass_encased_large_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["brass_encased_shaft", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["chain_conveyor", "behavior_pack/scripts/logistics/depot-runtime.js"],
	["basin", "behavior_pack/scripts/processing/stage3-processing-runtime.js"],
	["crushing_wheel", "behavior_pack/scripts/processing/crushing-wheel-runtime.js"],
	["encased_fan", "behavior_pack/scripts/processing/stage3-processing-runtime.js"],
	["creative_motor", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["encased_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["encased_large_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["encased_shaft", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["encased_chain_drive", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["flywheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["gearbox", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["gearshift", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["hand_crank", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["large_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["large_water_wheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["mechanical_bearing", "behavior_pack/scripts/contraptions/contraption-runtime.js"],
	["mechanical_pump", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["powered_shaft", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["mechanical_mixer", "behavior_pack/scripts/processing/stage3-processing-runtime.js"],
	["metal_girder_encased_shaft", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["motor", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["mechanical_press", "behavior_pack/scripts/processing/mechanical-press-runtime.js"],
	["mechanical_saw", "behavior_pack/scripts/processing/stage3-processing-runtime.js"],
	["millstone", "behavior_pack/scripts/processing/millstone-runtime.js"],
	["fluid_pipe", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["fluid_tank", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["copper_valve_handle", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["valve_handle", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["creative_fluid_tank", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["encased_fluid_pipe", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["fluid_valve", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["glass_fluid_pipe", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["item_drain", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["portable_fluid_interface", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["smart_fluid_pipe", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["spout", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["shaft", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["saw", "behavior_pack/scripts/processing/stage3-processing-runtime.js"],
	["sequenced_gearshift", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["simple_kinetic", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["steam_engine", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["track", "behavior_pack/scripts/trains/train-runtime.js"],
	["track_station", "behavior_pack/scripts/trains/train-runtime.js"],
	["water_wheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["water_wheel_structure", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["windmill_bearing", "behavior_pack/scripts/contraptions/contraption-runtime.js"],
	["vertical_gearbox", "behavior_pack/scripts/kinetics/kinetic-runtime.js"]
]);

export const STAGE_FOUR_CONTRAPTION_FOUNDATION = new Map([
	["contraption", { domain: "contraptions", persistenceSchema: 2 }],
	["stationary_contraption", { domain: "contraptions", persistenceSchema: 2 }],
	["contraption_controls", { domain: "contraptions", persistenceSchema: 1 }]
]);

for (const identifier of ["contraption", "stationary_contraption"])
	BEHAVIOR_PATHS.set(identifier, "behavior_pack/scripts/contraptions/contraption-runtime.js");
BEHAVIOR_PATHS.set("contraption_controls", "behavior_pack/scripts/contraptions/contraption-actors-runtime.js");

// P4.2 keeps every linear mover on the shared dynamic-assembly transaction:
// one root/shard snapshot, fixed-point transform, swept collision boundary,
// and owner restore bridge.  The block-entity registrations are represented
// by that versioned host state rather than unsafe per-block script state.
export const STAGE_FOUR_LINEAR_ACTUATOR_FOUNDATION = new Map([
	["mechanical_piston", { domain: "contraptions", persistenceSchema: 2 }],
	["sticky_mechanical_piston", { domain: "contraptions", persistenceSchema: 2 }],
	["mechanical_piston_head", { domain: "contraptions", persistenceSchema: 2 }],
	["rope_pulley", { domain: "contraptions", persistenceSchema: 2 }],
	["rope", { domain: "contraptions", persistenceSchema: 2 }],
	["pulley_magnet", { domain: "contraptions", persistenceSchema: 2 }],
	["hose_pulley", { domain: "contraptions", persistenceSchema: 2 }],
	["gantry_carriage", { domain: "contraptions", persistenceSchema: 2 }],
	["gantry_contraption", { domain: "contraptions", persistenceSchema: 2 }],
	["gantry_pinion", { domain: "contraptions", persistenceSchema: 2 }],
	["gantry_shaft", { domain: "contraptions", persistenceSchema: 2 }]
]);

for (const identifier of STAGE_FOUR_LINEAR_ACTUATOR_FOUNDATION.keys())
	BEHAVIOR_PATHS.set(identifier, "behavior_pack/scripts/contraptions/linear-actuator-runtime.js");

// P4.3 binds the persistent column registry to an active vertical assembly.
// Contact state and Pulley target state are both versioned records; the
// moving-contact tracker remains the sole producer of native redstone edges.
export const STAGE_FOUR_ELEVATOR_FOUNDATION = new Map([
	["elevator_contact", { domain: "contraptions", persistenceSchema: 2 }],
	["elevator_pulley", { domain: "contraptions", persistenceSchema: 2 }]
]);

BEHAVIOR_PATHS.set("elevator_contact", "behavior_pack/scripts/contraptions/elevator-contact-runtime.js");
BEHAVIOR_PATHS.set("elevator_pulley", "behavior_pack/scripts/contraptions/linear-actuator-runtime.js");

// P4.4 actors execute only from an authoritative moving snapshot.  Their
// state is a moving-data contributor, so inventories/cooldowns and successful
// mutations survive assembly recovery rather than living on visual entities.
export const STAGE_FOUR_ACTOR_FOUNDATION = new Map([
	["deployer", { domain: "contraptions", persistenceSchema: 2 }],
	["drill", { domain: "contraptions", persistenceSchema: 2 }],
	["harvester", { domain: "contraptions", persistenceSchema: 2 }],
	["mechanical_drill", { domain: "contraptions", persistenceSchema: 2 }],
	["mechanical_harvester", { domain: "contraptions", persistenceSchema: 2 }],
	["mechanical_arm", { domain: "contraptions", persistenceSchema: 2 }]
]);

for (const identifier of STAGE_FOUR_ACTOR_FOUNDATION.keys())
	BEHAVIOR_PATHS.set(identifier, "behavior_pack/scripts/contraptions/contraption-actors-runtime.js");

for (const device of REDSTONE_DEVICE_CATALOG)
	BEHAVIOR_PATHS.set(device.id, "behavior_pack/scripts/redstone/redstone-device-runtime.js");

// S3-4 replaces the Stage-2 processor prototypes with durable input/output
// ports and a source-recipe conversion report. Their resource state remains
// partial because the visual conversion work is deliberately tracked in S3-7.
const STAGE_THREE_PROCESSORS = new Map([
	["crushing_wheel", { domain: "processing" }],
	["mechanical_press", { domain: "processing" }],
	["millstone", { domain: "processing" }]
]);

// S3-11 extends fixed processing with a shared multi-input, durable machine
// boundary. The source assets and recipe outcomes are now specified, while
// platform execution remains an explicit S3-15 acceptance item.
export const STAGE_THREE_PROCESSING_FOUNDATION = new Map([
	["basin", { domain: "processing" }],
	["encased_fan", { domain: "processing" }],
	["mechanical_mixer", { domain: "processing" }],
	["mechanical_saw", { domain: "processing" }],
	["saw", { domain: "processing" }]
]);

// S3-5 makes the fixed, virtual-fluid vertical slice durable. Pipe visuals,
// multiblock tanks, and the remaining fluid machines stay explicitly partial.
const STAGE_THREE_FLUIDS = new Map([
	["fluid_pipe", { domain: "fluids" }],
	["fluid_tank", { domain: "fluids" }],
	["mechanical_pump", { domain: "fluids" }]
]);

// S3-12 extends the durable S3-5 fluid journal with filterable pipe variants,
// an inexhaustible creative source, local fill/drain endpoints, and valve
// controls. The Java block entities are intentionally represented by those
// persisted runtime records instead of unsafe custom Bedrock block entities.
export const STAGE_THREE_FLUID_FOUNDATION = new Map([
	["copper_valve_handle", { domain: "fluids" }],
	["valve_handle", { domain: "fluids" }],
	["creative_fluid_tank", { domain: "fluids" }],
	["encased_fluid_pipe", { domain: "fluids" }],
	["fluid_valve", { domain: "fluids" }],
	["glass_fluid_pipe", { domain: "fluids" }],
	["item_drain", { domain: "fluids" }],
	["portable_fluid_interface", { domain: "fluids" }],
	["smart_fluid_pipe", { domain: "fluids" }],
	["spout", { domain: "fluids" }]
]);

// S3-6 uses stable Block.getRedstonePower polling to control the existing
// fixed devices. It deliberately does not claim the missing custom-output
// machines, which require a newer Bedrock producer component.
const STAGE_THREE_REDSTONE_CONTROLS = new Map([
	["andesite_funnel", { domain: "logistics" }],
	["clutch", { domain: "kinetics" }]
]);

// S3-14 now has source resources, native producer/consumer declarations,
// deterministic state transitions, and sharded persistence for every tracked
// Create redstone registration. They remain implementation-in-progress until
// the per-device parity contract and platform evidence are complete.
const STAGE_THREE_REDSTONE_FOUNDATION = new Map(REDSTONE_DEVICE_CATALOG.map(device => [device.id, { domain: "redstone" }]));

// S3-8 starts with a deliberately narrow resource vertical slice. These
// entries are usable from the creative inventory and have explicit drops and
// recipes where their Java acquisition path is representable without an
// unported machine. World generation and enchantment-sensitive ore drops stay
// partial until their target-platform behavior has been verified.
const STAGE_THREE_FOUNDATION_CONTENT = new Map([
	["andesite_alloy_block", { domain: "content" }],
	["deepslate_zinc_ore", { domain: "content" }],
	["raw_zinc_block", { domain: "content" }],
	["rose_quartz_block", { domain: "content" }],
	["weathered_iron_block", { domain: "content" }],
	["zinc_ore", { domain: "content" }]
]);

// S3-9 extends the durable kinetic index without claiming Java-model visual
// parity. The entries below have a concrete runtime and resource boundary
// (the large-wheel structure is generated rather than player-placeable);
// remaining visual and acquisition work stays visible through
// `resourceStatus: partial`.
export const STAGE_THREE_KINETIC_FOUNDATION = new Map([
	["adjustable_chain_gearshift", { domain: "kinetics" }],
	["andesite_encased_cogwheel", { domain: "kinetics" }],
	["andesite_encased_large_cogwheel", { domain: "kinetics" }],
	["andesite_encased_shaft", { domain: "kinetics" }],
	["brass_encased_cogwheel", { domain: "kinetics" }],
	["brass_encased_large_cogwheel", { domain: "kinetics" }],
	["brass_encased_shaft", { domain: "kinetics" }],
	["chain_conveyor", { domain: "kinetics" }],
	["creative_motor", { domain: "kinetics" }],
	["flywheel", { domain: "kinetics" }],
	["gearshift", { domain: "kinetics" }],
	["large_water_wheel", { domain: "kinetics" }],
	["metal_girder_encased_shaft", { domain: "kinetics" }],
	["powered_shaft", { domain: "kinetics" }],
	["sequenced_gearshift", { domain: "kinetics" }],
	["steam_engine", { domain: "kinetics" }],
	["water_wheel_structure", { domain: "kinetics" }],
	["windmill_bearing", { domain: "kinetics" }],
	["encased_cogwheel", { domain: "kinetics" }],
	["encased_large_cogwheel", { domain: "kinetics" }],
	["encased_shaft", { domain: "kinetics" }],
	["motor", { domain: "kinetics" }],
	["simple_kinetic", { domain: "kinetics" }],
	["vertical_gearbox", { domain: "kinetics" }]
]);

// S3-10 moves the foundational item network into a single durable port and
// transfer journal. Block-entity registrations are intentionally absorbed by
// that runtime rather than represented as unsafe Bedrock block entities.
export const STAGE_THREE_LOGISTICS_FOUNDATION = new Map([
	["andesite_belt_funnel", { domain: "logistics" }],
	["andesite_tunnel", { domain: "logistics" }],
	["attribute_filter", { domain: "logistics" }],
	["belt", { domain: "logistics" }],
	["brass_belt_funnel", { domain: "logistics" }],
	["brass_funnel", { domain: "logistics" }],
	["brass_tunnel", { domain: "logistics" }],
	["chute", { domain: "logistics" }],
	["creative_crate", { domain: "logistics" }],
	["depot", { domain: "logistics" }],
	["filter", { domain: "logistics" }],
	["funnel", { domain: "logistics" }],
	["item_hatch", { domain: "logistics" }],
	["item_vault", { domain: "logistics" }],
	["smart_chute", { domain: "logistics" }],
	["weighted_ejector", { domain: "logistics" }]
]);
export const REDSTONE_NATIVE_COMPONENT_BASELINE = "Target Bedrock 1.26.0 provides stable minecraft:redstone_consumer and minecraft:redstone_producer components; implement the device before claiming parity.";

const RULES = [
	{ domain: "contraptions", phase: 4, pattern: /(cart_assembler|contraption|deployer|drill|elevator|gantry|harvester|mechanical_arm|mechanical_piston|minecart|pulley|rope|seat|sticker)/ },
	{ domain: "schematics", phase: 4, pattern: /(blueprint|clipboard|schematic|wand)/ },
	{ domain: "trains", phase: 5, pattern: /(bogey|conductor|controller_rail|schedule|signal|station|track|train)/ },
	{ domain: "logistics", phase: 5, pattern: /(factory|frogport|package|packager|postbox)/ },
	{ domain: "equipment", phase: 6, pattern: /(backtank|diving|extendo|goggles|potato_cannon|sandpaper|toolbox|wrench)/ },
	{ domain: "redstone", phase: 3, pattern: /(analog|contact|controller|diode|latch|lever|link|nixie|observer|pulse|redstone|threshold|timer)/ },
	{ domain: "fluids", phase: 3, pattern: /(boiler|drain|fluid|hose|pipe|pump|spout|tank|valve)/ },
	{ domain: "logistics", phase: 3, pattern: /(belt|chute|crate|depot|ejector|filter|funnel|hatch|inventory|tunnel|vault)/ },
	{ domain: "processing", phase: 3, pattern: /(basin|crushing|fan|mixer|millstone|press|saw)/ },
	{ domain: "kinetics", phase: 3, pattern: /(chain|clutch|cogwheel|crank|engine|flywheel|gear|kinetic|motor|rotation|shaft|wheel|windmill)/ }
];

function acceptanceId(identifier, domain, kind) {
	return `${domain.toUpperCase()}-${identifier.replaceAll("_", "-").toUpperCase()}-${kind.toUpperCase()}`;
}

export function classifyRegistration(identifier, kind) {
	const prototype = STAGE_TWO_PROTOTYPES.get(identifier);
	const processor = STAGE_THREE_PROCESSORS.get(identifier);
	const processingFoundation = STAGE_THREE_PROCESSING_FOUNDATION.get(identifier);
	const fluid = STAGE_THREE_FLUIDS.get(identifier);
	const fluidFoundation = STAGE_THREE_FLUID_FOUNDATION.get(identifier);
	const redstoneControl = STAGE_THREE_REDSTONE_CONTROLS.get(identifier);
	const redstoneFoundation = STAGE_THREE_REDSTONE_FOUNDATION.get(identifier);
	const foundationContent = STAGE_THREE_FOUNDATION_CONTENT.get(identifier);
	const kineticFoundation = STAGE_THREE_KINETIC_FOUNDATION.get(identifier);
	const logisticsFoundation = STAGE_THREE_LOGISTICS_FOUNDATION.get(identifier);
	const stageFourFoundation = STAGE_FOUR_CONTRAPTION_FOUNDATION.get(identifier)
		?? STAGE_FOUR_LINEAR_ACTUATOR_FOUNDATION.get(identifier)
		?? STAGE_FOUR_ELEVATOR_FOUNDATION.get(identifier)
		?? STAGE_FOUR_ACTOR_FOUNDATION.get(identifier);
	const staticSystem = processor ?? fluid ?? redstoneControl;
	const rule = RULES.find(candidate => candidate.pattern.test(identifier));
	const classification = staticSystem
		? { ...staticSystem, phase: 3, status: "static_verified" }
	: foundationContent
		? { ...foundationContent, phase: 3, status: "static_verified" }
		: processingFoundation
		? { ...processingFoundation, phase: 3, status: "static_verified" }
		: kineticFoundation
		? { ...kineticFoundation, phase: 3, status: "static_verified" }
	: logisticsFoundation
		? { ...logisticsFoundation, phase: 3, status: "static_verified" }
		: fluidFoundation
		? { ...fluidFoundation, phase: 3, status: "static_verified" }
	: redstoneFoundation
		? { ...redstoneFoundation, phase: 3, status: "static_verified" }
	: stageFourFoundation
		? { ...stageFourFoundation, phase: 4, status: "static_verified" }
		: prototype
		? { ...prototype, phase: 2, status: "implementation_in_progress" }
		: rule ?? { domain: "content", phase: 3 };
	if (classification.phase === 3 && classification.domain === "content" && classification.status === undefined)
		classification.status = "static_verified";
	return {
		acceptanceId: acceptanceId(identifier, classification.domain, kind),
		behaviorPath: BEHAVIOR_PATHS.get(identifier) ?? null,
		blockingReason: null,
		domain: classification.domain,
		persistenceSchema: stageFourFoundation?.persistenceSchema ?? (staticSystem || processingFoundation || kineticFoundation || logisticsFoundation || fluidFoundation ? 2 : redstoneFoundation || prototype && BEHAVIOR_PATHS.has(identifier) ? 1 : null),
		phase: classification.phase,
		resourceStatus: prototype || staticSystem || foundationContent || processingFoundation || kineticFoundation || logisticsFoundation || fluidFoundation || redstoneFoundation || stageFourFoundation || classification.status === "static_verified" ? "partial" : "pending",
		status: classification.status ?? "specification_pending"
	};
}
