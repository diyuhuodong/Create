import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function blockFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(entry => entry.isDirectory()
		? blockFiles(resolve(directory, entry.name))
		: entry.name.endsWith(".json") ? [resolve(directory, entry.name)] : []));
	return nested.flat();
}

export function normalizeBlockMenuCategory(definition) {
	const menuCategory = definition?.["minecraft:block"]?.description?.menu_category;
	if (typeof menuCategory?.group !== "string" || menuCategory.group.includes(":"))
		return false;
	menuCategory.group = `minecraft:${menuCategory.group}`;
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
	const bounds = normalizeBlockBounds(definition);
	const renderMethods = normalizeMaterialRenderMethods(definition);
	return menuCategory || bounds || renderMethods;
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
