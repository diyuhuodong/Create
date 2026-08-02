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

export async function normalizeStagedBlockMenuCategories({ behaviorPackRoot }) {
	const files = await blockFiles(resolve(behaviorPackRoot, "blocks"));
	let blocks = 0;
	for (const file of files) {
		const definition = JSON.parse(await readFile(file, "utf8"));
		if (!normalizeBlockMenuCategory(definition))
			continue;
		await writeFile(file, `${JSON.stringify(definition, null, 2)}\n`);
		blocks++;
	}
	return { blocks };
}
