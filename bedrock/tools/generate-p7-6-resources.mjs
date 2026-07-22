import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { P76_PARTICLE_IDS } from "./p7-6-catalogs.mjs";
import { loadP76SoundCatalog, renderP76AnimationControllers, renderP76Animations, renderP76Particle, renderP76RenderControllers, renderP76RuntimeSoundCatalog, renderP76SoundDefinitions } from "./p7-6-resources.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(bedrockRoot, "..");

async function writeJson(path, value) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const catalog = await loadP76SoundCatalog(repositoryRoot);
await writeJson(resolve(bedrockRoot, "data/p7-6-sound-catalog.json"), catalog);
await writeJson(resolve(bedrockRoot, "resource_pack/sounds/sound_definitions.json"), renderP76SoundDefinitions(catalog));
await writeJson(resolve(bedrockRoot, "resource_pack/animations/createbedrock.p7_6.animation.json"), renderP76Animations());
await writeJson(resolve(bedrockRoot, "resource_pack/animation_controllers/createbedrock.p7_6.controllers.json"), renderP76AnimationControllers());
await writeJson(resolve(bedrockRoot, "resource_pack/render_controllers/createbedrock.p7_6.render_controllers.json"), renderP76RenderControllers());
await mkdir(resolve(bedrockRoot, "behavior_pack/scripts/effects"), { recursive: true });
await writeFile(resolve(bedrockRoot, "behavior_pack/scripts/effects/generated-sound-catalog.js"), renderP76RuntimeSoundCatalog(catalog));
for (const id of P76_PARTICLE_IDS)
	await writeJson(resolve(bedrockRoot, `resource_pack/particles/createbedrock.${id}.particle.json`), renderP76Particle(id));

async function attachAnimation(file, alias, { renderController } = {}) {
	const path = resolve(bedrockRoot, "resource_pack/entity", file);
	let document;
	try { document = JSON.parse(await readFile(path, "utf8")); } catch { return false; }
	const description = document["minecraft:client_entity"]?.description;
	if (!description)
		return false;
	description.animations = { ...(description.animations ?? {}), [alias]: `controller.animation.createbedrock.${alias}` };
	description.scripts = { ...(description.scripts ?? {}), animate: [...new Set([...(description.scripts?.animate ?? []), alias])] };
	if (renderController)
		description.render_controllers = [renderController];
	await writeJson(path, document);
	return true;
}

await attachAnimation("contraption_part.entity.json", "kinetic_rotation");
await attachAnimation("potato_projectile.entity.json", "equipment_idle");
await attachAnimation("train.entity.json", "train_bogey");
const projectionCatalog = JSON.parse(await readFile(resolve(bedrockRoot, "p7-5-projection-catalog.json"), "utf8"));
for (const entry of projectionCatalog.entries) {
	const path = entry.blockTypeId.split(":")[1];
	const file = `contraption_part_${path}.entity.json`;
	if (path.includes("belt"))
		await attachAnimation(file, "belt_scroll", { renderController: "controller.render.createbedrock.belt_animated" });
	else if (["fluid", "hose", "pipe", "pump", "tank", "valve"].some(token => path.includes(token)))
		await attachAnimation(file, "tank_liquid");
	else if (["basin", "crafter", "crushing", "deployer", "millstone", "mixer", "press", "saw"].some(token => path.includes(token)))
		await attachAnimation(file, "machine_cycle");
	else if (["bearing", "cogwheel", "gearbox", "shaft", "turntable", "wheel"].some(token => path.includes(token)))
		await attachAnimation(file, "kinetic_rotation");
}

console.log(`Generated ${catalog.summary.events} P7.6 sounds, ${P76_PARTICLE_IDS.length} particles, and core animation resources.`);
