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
	["belt_connector", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["clutch", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["crushing_wheel", "behavior_pack/scripts/processing/crushing-wheel-runtime.js"],
	["encased_chain_drive", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["gearbox", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["hand_crank", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["large_cogwheel", "behavior_pack/scripts/kinetics/kinetic-runtime.js"],
	["mechanical_bearing", "behavior_pack/scripts/contraptions/contraption-runtime.js"],
	["mechanical_pump", "behavior_pack/scripts/fluids/fluid-runtime.js"],
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
	const staticSystem = processor ?? fluid;
	const classification = staticSystem
		? { ...staticSystem, phase: 3, status: "static_verified" }
		: prototype
		? { ...prototype, phase: 2, status: "implementation_in_progress" }
		: RULES.find(rule => rule.pattern.test(identifier)) ?? { domain: "content", phase: 3 };

	return {
		acceptanceId: acceptanceId(identifier, classification.domain, kind),
		behaviorPath: BEHAVIOR_PATHS.get(identifier) ?? null,
		blockingReason: null,
		domain: classification.domain,
		persistenceSchema: staticSystem ? 2 : prototype && BEHAVIOR_PATHS.has(identifier) ? 1 : null,
		phase: classification.phase,
		resourceStatus: prototype || staticSystem ? "partial" : "pending",
		status: classification.status ?? "specification_pending"
	};
}
