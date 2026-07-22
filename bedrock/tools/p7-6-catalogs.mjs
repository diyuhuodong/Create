import { readFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";

export const P76_CATALOG_SCHEMA_VERSION = 1;
export const P76_PACKAGE_IDS = Object.freeze(["P7.6.0", "P7.6A", "P7.6B", "P7.6C", "P7.6D", "P7.6E", "P7.6F", "P7.6G"]);
export const P76_PARTICLE_IDS = Object.freeze([
	"rotation_indicator", "air_flow", "air", "steam_jet", "cube", "fluid_particle", "basin_fluid",
	"fluid_drip", "wifi", "soul", "soul_base", "soul_perimeter", "soul_expanding_perimeter"
]);

const PACKAGE_DEFINITIONS = Object.freeze([
	{
		id: "P7.6.0",
		name: "Baseline and migration gates",
		javaEvidence: ["work/doc/create-bedrock-stage7-complete-migration-design.md", "bedrock/data/domain-inventory.json"],
		implementation: ["bedrock/tools/p7-6-catalogs.mjs", "bedrock/tools/generate-p7-6-catalogs.mjs", "bedrock/tests/p7-6-catalogs.test.mjs"]
	},
	{
		id: "P7.6A",
		name: "Equipment upgrades and air authority",
		javaEvidence: ["src/main/java/com/simibubi/create/AllEnchantments.java", "src/main/java/com/simibubi/create/content/equipment/armor/BacktankUtil.java"],
		implementation: ["bedrock/behavior_pack/scripts/equipment/equipment-upgrade-state.js", "bedrock/behavior_pack/scripts/equipment/equipment-state.js", "bedrock/tests/equipment-upgrade-state.test.mjs"]
	},
	{
		id: "P7.6B",
		name: "Potato Cannon and recovery",
		javaEvidence: ["src/main/java/com/simibubi/create/content/equipment/potatoCannon/AllPotatoProjectileTypes.java", "src/main/java/com/simibubi/create/content/equipment/potatoCannon/PotatoProjectileEntity.java"],
		implementation: ["bedrock/behavior_pack/scripts/equipment/potato-cannon-journal.js", "bedrock/behavior_pack/scripts/materials/potato-projectile.js", "bedrock/tests/potato-cannon-journal.test.mjs"]
	},
	{
		id: "P7.6C",
		name: "Goggles, Wrench, Extendo, and Toolbox",
		javaEvidence: ["src/main/java/com/simibubi/create/content/equipment/goggles/GogglesItem.java", "src/main/java/com/simibubi/create/content/equipment/toolbox/ToolboxHandler.java"],
		implementation: ["bedrock/behavior_pack/scripts/equipment/goggles-diagnostics-registry.js", "bedrock/behavior_pack/scripts/equipment/wrench-handler-registry.js", "bedrock/behavior_pack/scripts/equipment/toolbox-bindings.js", "bedrock/tests/equipment-tools.test.mjs"]
	},
	{
		id: "P7.6D",
		name: "Core visual resources",
		javaEvidence: ["src/main/resources/assets/create", "src/generated/resources/assets/create"],
		implementation: ["bedrock/tools/p7-6-resources.mjs", "bedrock/resource_pack/animations/createbedrock.p7_6.animation.json", "bedrock/resource_pack/animation_controllers/createbedrock.p7_6.controllers.json", "bedrock/tests/p7-6-resources.test.mjs"]
	},
	{
		id: "P7.6E",
		name: "Sounds, particles, language, and resource closure",
		javaEvidence: ["src/main/java/com/simibubi/create/AllSoundEvents.java", "src/main/java/com/simibubi/create/AllParticleTypes.java", "src/generated/resources/assets/create/sounds.json"],
		implementation: ["bedrock/data/p7-6-resource-ledger.json", "bedrock/data/p7-6-sound-catalog.json", "bedrock/resource_pack/particles", "bedrock/tests/p7-6-effects.test.mjs"]
	},
	{
		id: "P7.6F",
		name: "Ponder-equivalent guidance",
		javaEvidence: ["src/main/java/com/simibubi/create/infrastructure/ponder/AllCreatePonderScenes.java", "src/main/java/com/simibubi/create/infrastructure/ponder/scenes"],
		implementation: ["bedrock/data/p7-6-guidance-ledger.json", "bedrock/behavior_pack/scripts/guidance/guidance-catalog.js", "bedrock/behavior_pack/scripts/guidance/guidance-runtime.js", "bedrock/tests/p7-6-guidance.test.mjs"]
	},
	{
		id: "P7.6G",
		name: "Static closure and P7.7 handoff",
		javaEvidence: ["work/doc/create-bedrock-p7-6-equipment-resources-guidance-design.md"],
		implementation: ["bedrock/tools/p7-6-static-contract.mjs", "bedrock/tests/p7-6-static-contract.test.mjs", "work/doc/create-bedrock-p7-6-static-completion.md"]
	}
]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function portablePath(path) {
	return path.replaceAll("\\", "/");
}

function assetTarget(source) {
	const sourcePrefix = "src/main/resources/assets/create/";
	const generatedPrefix = "src/generated/resources/assets/create/";
	const extension = extname(source).toLowerCase();
	if (source.startsWith(sourcePrefix)) {
		const path = source.slice(sourcePrefix.length);
		if (extension === ".png" && path.startsWith("textures/gui/"))
			return { relation: "runtime_equivalent", target: "behavior_pack/scripts/guidance and server-ui forms", reason: "Java GUI textures cannot be loaded as Bedrock screens; the same interaction is exposed through stable server-ui forms." };
		if (extension === ".png" && path.startsWith("textures/ponder/"))
			return { relation: "runtime_equivalent", target: "createbedrock:engineers_guide", reason: "Java Ponder presentation textures are replaced by the indexed Bedrock guide while preserving storyboard teaching outcomes." };
		if (extension === ".png")
			return { relation: "direct_copy", target: `resource_pack/textures/create_java_full/${path.replace(/^textures\//, "")}` };
		if (extension === ".ogg")
			return { relation: "direct_copy", target: `resource_pack/sounds/create/${path.replace(/^sounds\//, "").replace(/\.ogg$/, "")}` };
		if (path === "lang/en_us.json")
			return { relation: "converted", target: "resource_pack/texts/en_US.lang" };
		if (path === "lang/zh_cn.json")
			return { relation: "converted", target: "resource_pack/texts/zh_CN.lang" };
		if (path.startsWith("lang/") && extension === ".json")
			return { relation: "not_applicable", target: "P7.6 locale policy", reason: "P7.6 release locales are EN/US and ZH/CN; the Java translation remains upstream source material." };
		if (extension === ".json" && (path.startsWith("models/") || path.startsWith("blockstates/")))
			return { relation: "runtime_equivalent", target: "resource_pack/models and behavior_pack block definitions", reason: "Java model graph is converted or represented by the owning Bedrock content family." };
	}
	if (source.startsWith(generatedPrefix)) {
		const path = source.slice(generatedPrefix.length);
		if (extension === ".json" && (path.startsWith("models/") || path.startsWith("blockstates/")))
			return { relation: "runtime_equivalent", target: "resource_pack/models and behavior_pack block definitions", reason: "Generated Java variants are compiled into Bedrock family geometry, states, and atlases." };
		if (path.startsWith("lang/"))
			return { relation: "runtime_equivalent", target: "resource_pack/texts", reason: "Generated language keys are merged into the EN/ZH release catalogs." };
	}
	if ([".obj", ".mtl", ".bbmodel", ".mcmeta"].includes(extension))
		return { relation: "runtime_equivalent", target: "resource_pack geometry, animation, and render controllers", reason: "Java authoring formats are not Bedrock runtime formats; observable visuals are represented by converted resources." };
	if (source.includes("/ponder/") || extension === ".nbt")
		return { relation: "runtime_equivalent", target: "data/p7-6-guidance-ledger.json", reason: "Java Ponder structures are represented by Bedrock guidance pages instead of loading Java NBT scenes." };
	if ([".glsl", ".vert", ".fsh", ".vsh", ".donotload", ".md"].includes(extension))
		return { relation: "not_applicable", target: "Bedrock RenderDragon boundary", reason: "Java/Flywheel development or shader source cannot execute in the Bedrock RenderDragon resource-pack pipeline." };
	return { relation: "not_applicable", target: "P7.6 reviewed exclusion", reason: "The Java-only client resource has no independently observable Bedrock runtime role." };
}

export function buildP76WorkQueue() {
	return {
		schemaVersion: P76_CATALOG_SCHEMA_VERSION,
		baseline: "ac7a4b587",
		packages: PACKAGE_DEFINITIONS.map((entry, index) => ({
			...clone(entry),
			dependencies: index === 0 ? ["P7.1", "P7.5"] : [P76_PACKAGE_IDS[index - 1]],
			status: "static_verified"
		})),
		platform: { windows: "pending", realm: "pending", ps: "pending" }
	};
}

export function buildP76ResourceLedger(domainInventory) {
	const domains = new Map(domainInventory?.domains?.map(domain => [domain.name, domain.entries]) ?? []);
	const assets = [...(domains.get("source_assets") ?? []), ...(domains.get("generated_assets") ?? [])]
		.map(entry => ({ source: entry.source, status: "static_verified", ...assetTarget(entry.source) }))
		.sort((left, right) => left.source.localeCompare(right.source));
	const relations = {};
	for (const entry of assets)
		relations[entry.relation] = (relations[entry.relation] ?? 0) + 1;
	return {
		schemaVersion: P76_CATALOG_SCHEMA_VERSION,
		generatedFrom: "bedrock/data/domain-inventory.json",
		entries: assets,
		summary: { total: assets.length, relations }
	};
}

function sceneRegistrations(source) {
	const registrations = [];
	for (const match of source.matchAll(/addStoryBoard\([\s\S]{0,500}?"([^"]+)"\s*,\s*([A-Za-z0-9_]+)::([A-Za-z0-9_]+)/g))
		registrations.push({ id: match[1], owner: match[2], method: match[3] });
	return registrations;
}

export async function buildP76GuidanceLedger({ domainInventory, repositoryRoot }) {
	const sceneDomain = domainInventory?.domains?.find(domain => domain.name === "ponder_scenes");
	if (!sceneDomain || sceneDomain.entries.length !== 52)
		throw new Error("P7.6 guidance requires the 52 Java Ponder scene source files");
	const registrationSource = await readFile(resolve(repositoryRoot, "src/main/java/com/simibubi/create/infrastructure/ponder/AllCreatePonderScenes.java"), "utf8");
	const registrations = sceneRegistrations(registrationSource);
	const advancementDomain = domainInventory?.domains?.find(domain => domain.name === "advancements");
	if (!advancementDomain || advancementDomain.entries.length !== 1150)
		throw new Error("P7.6 guidance requires all 1,150 Java advancement records");
	const entries = [];
	for (const scene of sceneDomain.entries) {
		const owner = basename(scene.source, ".java");
		const storyboards = registrations.filter(entry => entry.owner === owner).map(({ id, method }) => ({ id, method }));
		entries.push({
			source: scene.source,
			owner,
			storyboards,
			tutorialId: `createbedrock:guide/${owner.replace(/Scenes$/, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}`,
			status: "static_verified"
		});
	}
	return {
		schemaVersion: P76_CATALOG_SCHEMA_VERSION,
		generatedFrom: "AllCreatePonderScenes and the 52 Ponder scene source files",
		advancements: advancementDomain.entries.map(entry => {
			const recipeUnlock = entry.source.includes("/recipes/");
			return {
				relation: recipeUnlock ? "not_applicable" : "runtime_equivalent",
				reason: recipeUnlock ? "Bedrock recipes use the P7.1 survival acquisition chain instead of Java recipe-book advancement unlocks." : "The observable gameplay goal is indexed as a local, non-authoritative guide milestone.",
				source: entry.source,
				status: "static_verified",
				target: recipeUnlock ? "behavior_pack/recipes" : "createbedrock:guide/milestones"
			};
		}),
		entries,
		summary: { advancements: advancementDomain.entries.length, sceneFamilies: entries.length, storyboards: entries.reduce((total, entry) => total + entry.storyboards.length, 0) }
	};
}

export function relativeToRepository(repositoryRoot, path) {
	return portablePath(relative(repositoryRoot, path));
}
