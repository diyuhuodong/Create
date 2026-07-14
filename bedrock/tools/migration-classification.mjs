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
	["crushing_wheel", "behavior_pack/scripts/processing/crushing-wheel-runtime.js"],
	["creative_motor", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["encased_chain_drive", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["flywheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["gearbox", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["gearshift", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["hand_crank", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["large_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["large_water_wheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["mechanical_bearing", "behavior_pack/scripts/contraptions/contraption-runtime.js"],
	["mechanical_pump", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["metal_girder_encased_shaft", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["mechanical_press", "behavior_pack/scripts/processing/mechanical-press-runtime.js"],
	["millstone", "behavior_pack/scripts/processing/millstone-runtime.js"],
	["fluid_pipe", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["fluid_tank", "behavior_pack/scripts/fluids/fluid-runtime.js"],
	["shaft", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["track", "behavior_pack/scripts/trains/train-runtime.js"],
	["track_station", "behavior_pack/scripts/trains/train-runtime.js"],
	["water_wheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"]
]);

// S3-4 replaces the Stage-2 processor prototypes with durable input/output
// ports and a source-recipe conversion report. Their resource state remains
// partial because the visual conversion work is deliberately tracked in S3-7.
const STAGE_THREE_PROCESSORS = new Map([
	["crushing_wheel", { domain: "processing" }],
	["mechanical_press", { domain: "processing" }],
	["millstone", { domain: "processing" }]
]);

// S3-5 makes the fixed, virtual-fluid vertical slice durable. Pipe visuals,
// multiblock tanks, and the remaining fluid machines stay explicitly partial.
const STAGE_THREE_FLUIDS = new Map([
	["fluid_pipe", { domain: "fluids" }],
	["fluid_tank", { domain: "fluids" }],
	["mechanical_pump", { domain: "fluids" }]
]);

// S3-6 uses stable Block.getRedstonePower polling to control the existing
// fixed devices. It deliberately does not claim the missing custom-output
// machines, which require a newer Bedrock producer component.
const STAGE_THREE_REDSTONE_CONTROLS = new Map([
	["andesite_funnel", { domain: "logistics" }],
	["clutch", { domain: "kinetics" }]
]);

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
const STAGE_THREE_KINETIC_FOUNDATION = new Map([
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
	["windmill_bearing", { domain: "kinetics" }]
]);
const REDSTONE_OUTPUT_BLOCKER = "Target Bedrock 1.21.80 cannot provide this custom redstone output without minecraft:redstone_producer (requires block format 1.21.120); retain it as an explicit compatibility blocker.";

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
	const fluid = STAGE_THREE_FLUIDS.get(identifier);
	const redstoneControl = STAGE_THREE_REDSTONE_CONTROLS.get(identifier);
	const foundationContent = STAGE_THREE_FOUNDATION_CONTENT.get(identifier);
	const kineticFoundation = STAGE_THREE_KINETIC_FOUNDATION.get(identifier);
	const staticSystem = processor ?? fluid ?? redstoneControl;
	const rule = RULES.find(candidate => candidate.pattern.test(identifier));
	const classification = staticSystem
		? { ...staticSystem, phase: 3, status: "static_verified" }
		: foundationContent
		? { ...foundationContent, phase: 3, status: "implementation_in_progress" }
		: kineticFoundation
		? { ...kineticFoundation, phase: 3, status: "implementation_in_progress" }
		: prototype
		? { ...prototype, phase: 2, status: "implementation_in_progress" }
		: rule ?? { domain: "content", phase: 3 };
	const blockedByTargetVersion = !staticSystem && !prototype && classification.domain === "redstone";

	return {
		acceptanceId: acceptanceId(identifier, classification.domain, kind),
		behaviorPath: BEHAVIOR_PATHS.get(identifier) ?? null,
		blockingReason: blockedByTargetVersion ? REDSTONE_OUTPUT_BLOCKER : null,
		domain: classification.domain,
		persistenceSchema: staticSystem || kineticFoundation ? 2 : prototype && BEHAVIOR_PATHS.has(identifier) ? 1 : null,
		phase: classification.phase,
		resourceStatus: prototype || staticSystem || foundationContent || kineticFoundation ? "partial" : "pending",
		status: blockedByTargetVersion ? "blocked" : classification.status ?? "specification_pending"
	};
}
