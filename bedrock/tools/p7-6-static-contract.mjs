import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP76GuidanceLedger, buildP76ResourceLedger, buildP76WorkQueue, P76_PACKAGE_IDS, P76_PARTICLE_IDS } from "./p7-6-catalogs.mjs";
import { buildP76GuidanceTutorials, renderP76GuidanceCatalog, renderP76GuidanceLanguage } from "./p7-6-guidance.mjs";
import { loadP76SoundCatalog, P76_ANIMATION_IDS, renderP76AnimationControllers, renderP76Animations, renderP76RenderControllers, renderP76RuntimeSoundCatalog, renderP76SoundDefinitions } from "./p7-6-resources.mjs";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function json(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function fileExists(path) {
	try { return (await stat(path)).isFile(); } catch { return false; }
}

function same(actual, expected, label) {
	if (JSON.stringify(actual) !== JSON.stringify(expected))
		throw new Error(`${label} is stale; run npm run p7:compile.`);
}

export async function validateP76StaticContract({ root = defaultRoot, trackingRoot = defaultRoot } = {}) {
	const repositoryRoot = resolve(trackingRoot, "..");
	const dataRoot = resolve(trackingRoot, "data");
	const domainInventory = await json(resolve(dataRoot, "domain-inventory.json"));
	const workQueue = await json(resolve(dataRoot, "p7-6-work-queue.json"));
	const resources = await json(resolve(dataRoot, "p7-6-resource-ledger.json"));
	const guidance = await json(resolve(dataRoot, "p7-6-guidance-ledger.json"));
	const sounds = await json(resolve(dataRoot, "p7-6-sound-catalog.json"));
	same(workQueue, buildP76WorkQueue(), "P7.6 work queue");
	same(resources, buildP76ResourceLedger(domainInventory), "P7.6 resource ledger");
	same(guidance, await buildP76GuidanceLedger({ domainInventory, repositoryRoot }), "P7.6 guidance ledger");
	same(sounds, await loadP76SoundCatalog(repositoryRoot), "P7.6 sound catalog");
	if (workQueue.packages.length !== 8 || workQueue.packages.some((entry, index) => entry.id !== P76_PACKAGE_IDS[index] || entry.status !== "static_verified"))
		throw new Error("All eight ordered P7.6 packages must be static_verified");
	if (Object.values(workQueue.platform).some(status => status !== "pending"))
		throw new Error("P7.6 cannot claim platform verification before P7.7");
	if (resources.entries.length !== 5016 || resources.entries.some(entry => entry.status !== "static_verified" || !entry.relation || !entry.target || (["runtime_equivalent", "not_applicable"].includes(entry.relation) && !entry.reason)))
		throw new Error("P7.6 must classify all 5,016 Java resources with targets and reasons");
	if (guidance.entries.length !== 52 || guidance.summary.storyboards < 100 || guidance.advancements.length !== 1150 || [...guidance.entries, ...guidance.advancements].some(entry => entry.status !== "static_verified"))
		throw new Error("P7.6 guidance coverage is incomplete");
	const soundDefinitions = await json(resolve(root, "resource_pack/sounds/sound_definitions.json"));
	same(soundDefinitions, renderP76SoundDefinitions(sounds), "P7.6 sound definitions");
	if (sounds.entries.length !== 79)
		throw new Error("P7.6 requires all 79 Java sound events");
	for (const particle of P76_PARTICLE_IDS) {
		const document = await json(resolve(root, `resource_pack/particles/createbedrock.${particle}.particle.json`));
		if (document.particle_effect?.description?.identifier !== `createbedrock:${particle}`)
			throw new Error(`P7.6 particle ${particle} has an invalid identifier`);
	}
	same(await json(resolve(root, "resource_pack/animations/createbedrock.p7_6.animation.json")), renderP76Animations(), "P7.6 animations");
	same(await json(resolve(root, "resource_pack/animation_controllers/createbedrock.p7_6.controllers.json")), renderP76AnimationControllers(), "P7.6 animation controllers");
	same(await json(resolve(root, "resource_pack/render_controllers/createbedrock.p7_6.render_controllers.json")), renderP76RenderControllers(), "P7.6 render controllers");
	if (await readFile(resolve(root, "behavior_pack/scripts/effects/generated-sound-catalog.js"), "utf8") !== renderP76RuntimeSoundCatalog(sounds))
		throw new Error("P7.6 runtime sound catalog is stale");
	const tutorials = buildP76GuidanceTutorials(guidance);
	const guidanceSource = await readFile(resolve(root, "behavior_pack/scripts/guidance/guidance-catalog.js"), "utf8");
	if (guidanceSource !== renderP76GuidanceCatalog(tutorials))
		throw new Error("P7.6 guidance runtime catalog is stale");
	for (const locale of ["en_US", "zh_CN"]) {
		const language = await readFile(resolve(root, `resource_pack/texts/${locale}.lang`), "utf8");
		if (!language.includes(renderP76GuidanceLanguage(tutorials, locale)))
			throw new Error(`P7.6 ${locale} guidance language catalog is stale`);
	}
	for (const file of ["capacity_upgrade", "potato_recovery_upgrade", "engineers_guide"]) {
		if (!await fileExists(resolve(root, `behavior_pack/items/${file}.json`)) || !await fileExists(resolve(root, `behavior_pack/recipes/${file}.json`)))
			throw new Error(`P7.6 item or acquisition recipe missing for ${file}`);
	}
	const main = await readFile(resolve(root, "behavior_pack/scripts/main.js"), "utf8");
	const equipment = await readFile(resolve(root, "behavior_pack/scripts/equipment/equipment-runtime.js"), "utf8");
	for (const token of ["registerGuidance", "registerEquipment"])
		if (!main.includes(token))
			throw new Error(`P7.6 main runtime is missing ${token}`);
	for (const token of ["applyEquipmentUpgrade", "beginPotatoCannonShot", "queryGogglesDiagnostics", "invokeWrenchHandler", "readPlayerBindings"])
		if (!equipment.includes(token))
			throw new Error(`P7.6 equipment runtime is missing ${token}`);
	const migrationLedger = await json(resolve(trackingRoot, "data/migration-ledger.json"));
	const equipmentEntries = migrationLedger.registrationEntries.filter(entry => entry.family === "p7_6/equipment");
	if (equipmentEntries.length !== 28 || equipmentEntries.some(entry => entry.status !== "implemented" || entry.mapping.relation === "unmapped"))
		throw new Error("P7.6 equipment migration ledger must close all 28 registration records");
	if (root !== trackingRoot) {
		for (const entry of resources.entries.filter(entry => entry.relation === "direct_copy")) {
			let target = resolve(root, entry.target);
			if (entry.source.endsWith(".ogg") && !target.endsWith(".ogg"))
				target += ".ogg";
			if (!await fileExists(target))
				throw new Error(`P7.6 build is missing direct-copy asset ${entry.target}`);
		}
	}
	return {
		animations: P76_ANIMATION_IDS.length,
		equipmentEntries: equipmentEntries.length,
		guidanceFamilies: guidance.entries.length,
		particles: P76_PARTICLE_IDS.length,
		resources: resources.entries.length,
		sounds: sounds.entries.length,
		storyboards: guidance.summary.storyboards
	};
}
