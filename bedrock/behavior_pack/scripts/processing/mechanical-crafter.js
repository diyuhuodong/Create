export const MECHANICAL_CRAFTER_BLOCK = "createbedrock:mechanical_crafter";

// Create's four data-driven mechanical-crafting recipes. The matcher keeps the
// recipe language independent of Bedrock's unavailable vanilla recipe registry
// so more recipes (including a world's configured recipes) can be appended.
export const MECHANICAL_CRAFTING_RECIPES = Object.freeze([
	{
		id: "create:mechanical_crafting/crushing_wheel",
		key: {
			A: { item: "createbedrock:andesite_alloy" },
			P: { tag: "minecraft:planks" },
			S: { tag: "c:stones" }
		},
		output: { count: 2, typeId: "createbedrock:crushing_wheel" },
		pattern: [" AAA ", "AAPAA", "APSPA", "AAPAA", " AAA "]
	},
	{
		id: "create:mechanical_crafting/extendo_grip",
		key: {
			H: { item: "createbedrock:brass_hand" },
			L: { tag: "c:ingots/brass" },
			R: { item: "createbedrock:precision_mechanism" },
			S: { tag: "c:rods/wooden" }
		},
		output: { count: 1, typeId: "createbedrock:extendo_grip" },
		pattern: [" L ", " R ", "SSS", "SSS", " H "]
	},
	{
		id: "create:mechanical_crafting/potato_cannon",
		key: {
			C: { tag: "c:ingots/copper" },
			L: { item: "createbedrock:andesite_alloy" },
			R: { item: "createbedrock:precision_mechanism" },
			S: { item: "createbedrock:fluid_pipe" }
		},
		output: { count: 1, typeId: "createbedrock:potato_cannon" },
		pattern: ["LRSSS", "CC   "]
	},
	{
		id: "create:mechanical_crafting/wand_of_symmetry",
		key: {
			B: { tag: "c:ingots/brass" },
			E: { tag: "c:ender_pearls" },
			G: { tag: "c:glass_blocks" },
			O: { tag: "c:obsidians" },
			P: { item: "createbedrock:precision_mechanism" }
		},
		output: { count: 1, typeId: "createbedrock:wand_of_symmetry" },
		pattern: [" G ", "GEG", " P ", " B ", " O "]
	}
]);

const STONE_TYPES = new Set([
	"minecraft:stone", "minecraft:cobblestone", "minecraft:deepslate", "minecraft:cobbled_deepslate",
	"minecraft:granite", "minecraft:diorite", "minecraft:andesite", "minecraft:tuff", "minecraft:calcite"
]);
const PLANK_SUFFIX = /^(?:minecraft:)?(?:acacia|bamboo|birch|cherry|crimson|dark_oak|jungle|mangrove|oak|pale_oak|spruce|warped)_planks$/;

function typeIdFor(cell) {
	return typeof cell === "string" ? cell : cell?.typeId;
}

function validateRecipe(recipe) {
	if (typeof recipe?.id !== "string" || !Array.isArray(recipe.pattern) || recipe.pattern.length === 0 || !recipe.pattern.every(row => typeof row === "string"))
		throw new TypeError("Mechanical crafting recipes require an id and non-empty string pattern");
	const width = recipe.pattern[0].length;
	if (width === 0 || !recipe.pattern.every(row => row.length === width))
		throw new RangeError("Mechanical crafting recipe rows must share a positive width");
	if (!recipe.output || typeof recipe.output.typeId !== "string" || !Number.isInteger(recipe.output.count) || recipe.output.count < 1)
		throw new TypeError("Mechanical crafting recipes require a positive output stack");
	for (const symbol of new Set(recipe.pattern.join("")))
		if (symbol !== " " && !recipe.key?.[symbol])
			throw new Error(`Mechanical crafting recipe ${recipe.id} is missing key ${symbol}`);
	return recipe;
}

export function mechanicalCrafterPlane(facing) {
	if ([0, 1, "down", "up"].includes(facing))
		return ["x", "z"];
	if ([2, 3, "north", "south"].includes(facing))
		return ["x", "y"];
	return ["z", "y"];
}

export function mechanicalCrafterIngredientMatches(ingredient, typeId) {
	if (typeof typeId !== "string" || !ingredient || typeof ingredient !== "object")
		return false;
	if (typeof ingredient.item === "string")
		return ingredient.item === typeId;
	if (Array.isArray(ingredient.items))
		return ingredient.items.includes(typeId);
	switch (ingredient.tag) {
		case "minecraft:planks": return PLANK_SUFFIX.test(typeId);
		case "c:stones": return STONE_TYPES.has(typeId);
		case "c:ingots/brass": return typeId === "createbedrock:brass_ingot";
		case "c:rods/wooden": return typeId === "minecraft:stick";
		case "c:ingots/copper": return typeId === "minecraft:copper_ingot";
		case "c:ender_pearls": return typeId === "minecraft:ender_pearl";
		case "c:glass_blocks": return ["minecraft:glass", "minecraft:tinted_glass"].includes(typeId);
		case "c:obsidians": return typeId === "minecraft:obsidian";
		default: return false;
	}
}

/** Match an already-trimmed crafter grid. Empty cells are `undefined`. */
export function matchMechanicalCraftingRecipe(grid, recipes = MECHANICAL_CRAFTING_RECIPES) {
	if (!Array.isArray(grid) || grid.length === 0 || !grid.every(row => Array.isArray(row)) || grid.some(row => row.length !== grid[0].length))
		throw new TypeError("Mechanical crafting grids must be rectangular non-empty arrays");
	for (const recipe of recipes) {
		validateRecipe(recipe);
		if (recipe.pattern.length !== grid.length || recipe.pattern[0].length !== grid[0].length)
			continue;
		let matched = true;
		for (let row = 0; row < grid.length && matched; row++)
			for (let column = 0; column < grid[row].length; column++) {
				const symbol = recipe.pattern[row][column];
				const typeId = typeIdFor(grid[row][column]);
				if (symbol === " ") {
					if (typeId !== undefined)
						matched = false;
				} else if (!mechanicalCrafterIngredientMatches(recipe.key[symbol], typeId)) {
					matched = false;
				}
			}
		if (matched)
			return { id: recipe.id, output: { ...recipe.output } };
	}
	return undefined;
}

export function crafterWorkTicks(speed) {
	if (!Number.isFinite(speed) || speed === 0)
		return undefined;
	return Math.max(4, Math.ceil(200 / Math.max(4, Math.abs(speed))));
}
