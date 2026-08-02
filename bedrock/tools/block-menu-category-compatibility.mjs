import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function blockFiles(directory) {
	return readdir(directory, { withFileTypes: true }).then(entries => entries
		.filter(entry => entry.isFile() && entry.name.endsWith(".json"))
		.map(entry => resolve(directory, entry.name)));
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
