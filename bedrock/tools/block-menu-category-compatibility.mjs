import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SLIDING_DOOR_IDENTIFIERS = new Set([
	"createbedrock:andesite_door",
	"createbedrock:brass_door",
	"createbedrock:copper_door",
	"createbedrock:framed_glass_door",
	"createbedrock:train_door"
]);
const ITEM_VISUAL_FALLBACK_IDENTIFIERS = new Set([
	"createbedrock:crushing_wheel",
	"createbedrock:crushing_wheel_controller",
	"createbedrock:deployer",
	"createbedrock:vertical_gearbox"
]);
const BLOCK_GEOMETRY_FALLBACK_IDENTIFIERS = new Set(["createbedrock:vertical_gearbox"]);

async function blockFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(entry => entry.isDirectory()
		? blockFiles(resolve(directory, entry.name))
		: entry.name.endsWith(".json") ? [resolve(directory, entry.name)] : []));
	return nested.flat();
}

export function normalizeBlockMenuCategory(definition) {
	return normalizeMenuCategory(definition?.["minecraft:block"]?.description);
}

function normalizeMenuCategory(description) {
	const menuCategory = description?.menu_category;
	if (typeof menuCategory?.group !== "string" || menuCategory.group.includes(":"))
		return false;
	menuCategory.group = `minecraft:${menuCategory.group}`;
	return true;
}

function normalizeBlockStates(definition) {
	const description = definition?.["minecraft:block"]?.description;
	if (!description?.properties || description.states)
		return normalizeStateEnums(description?.states);
	description.states = description.properties;
	delete description.properties;
	return normalizeStateEnums(description.states) || true;
}

function normalizeStateEnums(states) {
	if (!states || typeof states !== "object")
		return false;
	let changed = false;
	for (const [name, values] of Object.entries(states)) {
		if (!Array.isArray(values))
			continue;
		if (values.length === 1) {
			values.push(typeof values[0] === "number" ? values[0] + 1 : `${values[0]}_alt`);
			changed = true;
		}
		if (values.length > 16) {
			values.splice(0, values.length, ...(name === "createbedrock:output_mask"
				? Array.from({ length: 16 }, (_, value) => value)
				: values.slice(0, 16)));
			changed = true;
		}
	}
	return changed;
}

function normalizeBlockGeometry(definition) {
	const components = definition?.["minecraft:block"]?.components;
	if (!components?.["minecraft:material_instances"] || components["minecraft:geometry"])
		return false;
	components["minecraft:geometry"] = "minecraft:geometry.full_block";
	return true;
}

function normalizeBlockComponents(definition) {
	let changed = false;
	const normalizeMaterials = materials => {
		if (!materials || typeof materials !== "object")
			return;
		const entries = Object.entries(materials).filter(([, material]) => material && typeof material === "object");
		if (entries.length === 0)
			return;
		if (!materials["*"]) {
			materials["*"] = { ...entries[0][1] };
			changed = true;
		}
		const transparent = Object.values(materials).some(material => material?.render_method === "blend" || material?.render_method === "alpha_blend");
		if (!transparent)
			return;
		for (const material of Object.values(materials)) {
			if (material?.render_method === "opaque") {
				material.render_method = "blend";
				changed = true;
			}
		}
	};
	const normalizeComponents = components => {
		if (!components || typeof components !== "object")
			return;
		normalizeMaterials(components["minecraft:material_instances"]);
		normalizeMaterials(components["minecraft:item_visual"]?.material_instances);
	};
	const block = definition?.["minecraft:block"];
	normalizeComponents(block?.components);
	for (const permutation of block?.permutations ?? [])
		normalizeComponents(permutation.components);
	return changed;
}

function normalizeSlidingDoorTransformations(definition) {
	const block = definition?.["minecraft:block"];
	if (!SLIDING_DOOR_IDENTIFIERS.has(block?.description?.identifier))
		return false;
	let changed = false;
	for (const permutation of block.permutations ?? []) {
		if (!permutation?.components?.["minecraft:transformation"])
			continue;
		delete permutation.components["minecraft:transformation"];
		changed = true;
	}
	return changed;
}

function normalizeOversizedItemVisuals(definition) {
	const components = definition?.["minecraft:block"]?.components;
	const identifier = definition?.["minecraft:block"]?.description?.identifier;
	if (!ITEM_VISUAL_FALLBACK_IDENTIFIERS.has(identifier) || !components?.["minecraft:item_visual"]?.geometry)
		return false;
	components["minecraft:item_visual"].geometry.identifier = "minecraft:geometry.full_block";
	if (BLOCK_GEOMETRY_FALLBACK_IDENTIFIERS.has(identifier))
		components["minecraft:geometry"] = "minecraft:geometry.full_block";
	return true;
}

function normalizeBlockBounds(definition) {
	let changed = false;
	const normalizeComponents = components => {
		for (const [name, maximumY] of [["minecraft:collision_box", 24], ["minecraft:selection_box", 16]]) {
			const box = components?.[name];
			if (!Array.isArray(box?.origin) || !Array.isArray(box?.size) || box.origin.length !== 3 || box.size.length !== 3)
				continue;
			if (box.origin[1] < 0) {
				box.origin[1] = 0;
				changed = true;
			}
			if (box.origin[1] + box.size[1] > maximumY) {
				box.size[1] = maximumY - box.origin[1];
				changed = true;
			}
		}
	};
	const block = definition?.["minecraft:block"];
	normalizeComponents(block?.components);
	for (const permutation of block?.permutations ?? [])
		normalizeComponents(permutation.components);
	return changed;
}

function normalizeMaterialRenderMethods(value) {
	if (!value || typeof value !== "object")
		return false;
	let changed = false;
	for (const [key, child] of Object.entries(value)) {
		if (key === "render_method" && child === "alpha_blend") {
			value[key] = "blend";
			changed = true;
		} else
			changed = normalizeMaterialRenderMethods(child) || changed;
	}
	return changed;
}

export function normalizeBlockContent(definition) {
	const menuCategory = normalizeBlockMenuCategory(definition);
	const states = normalizeBlockStates(definition);
	const geometry = normalizeBlockGeometry(definition);
	const components = normalizeBlockComponents(definition);
	const doorTransformations = normalizeSlidingDoorTransformations(definition);
	const itemVisuals = normalizeOversizedItemVisuals(definition);
	const bounds = normalizeBlockBounds(definition);
	const renderMethods = normalizeMaterialRenderMethods(definition);
	return menuCategory || states || geometry || components || doorTransformations || itemVisuals || bounds || renderMethods;
}

export async function normalizeStagedBlockContent({ behaviorPackRoot }) {
	const files = await blockFiles(resolve(behaviorPackRoot, "blocks"));
	let blocks = 0;
	for (const file of files) {
		const definition = JSON.parse(await readFile(file, "utf8"));
		if (!normalizeBlockContent(definition))
			continue;
		await writeFile(file, `${JSON.stringify(definition, null, 2)}\n`);
		blocks++;
	}
	return { blocks };
}

export function normalizeItemContent(definition) {
	return normalizeMenuCategory(definition?.["minecraft:item"]?.description);
}

export async function normalizeStagedItemContent({ behaviorPackRoot }) {
	const files = await blockFiles(resolve(behaviorPackRoot, "items"));
	let items = 0;
	for (const file of files) {
		const definition = JSON.parse(await readFile(file, "utf8"));
		if (!normalizeItemContent(definition))
			continue;
		await writeFile(file, `${JSON.stringify(definition, null, 2)}\n`);
		items++;
	}
	return { items };
}
