function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function assertItem(stack, name) {
	if (typeof stack?.typeId !== "string" || !Number.isInteger(stack.count) || stack.count < 1)
		throw new TypeError(`${name} must be a positive item stack`);
	return { count: stack.count, typeId: stack.typeId };
}

function assertFluid(fluid, name) {
	if (typeof fluid?.typeId !== "string" || !Number.isInteger(fluid.amount) || fluid.amount < 1)
		throw new TypeError(`${name} must be a positive fluid stack`);
	return { amount: fluid.amount, components: clone(fluid.components ?? {}), typeId: fluid.typeId };
}

function ingredientMatches(ingredient, supplied, { matchesComponents, matchesTag }) {
	if (Array.isArray(ingredient))
		return ingredient.some(entry => ingredientMatches(entry, supplied, { matchesComponents, matchesTag }));
	if (ingredient.kind === "item")
		return supplied?.typeId === ingredient.typeId && supplied.count >= ingredient.count;
	if (ingredient.kind === "tag")
		return supplied?.count >= ingredient.count && matchesTag(ingredient.tag, supplied.typeId);
	if (ingredient.kind === "fluid")
		return supplied?.typeId === ingredient.typeId && supplied.amount >= ingredient.amount;
	return ingredient.kind === "component_fluid" && supplied?.typeId === ingredient.typeId && supplied.amount >= ingredient.amount
		&& matchesComponents(ingredient.components, supplied.components ?? {});
}

function expectedKind(ingredient) {
	if (Array.isArray(ingredient)) {
		const kinds = new Set(ingredient.map(expectedKind));
		if (kinds.size !== 1)
			throw new TypeError("Interaction recipe alternatives cannot mix item and fluid ingredients");
		return [...kinds][0];
	}
	return ingredient?.kind === "fluid" || ingredient?.kind === "component_fluid" ? "fluid" : "item";
}

function requiredAmount(ingredient) {
	if (Array.isArray(ingredient))
		return Math.max(...ingredient.map(requiredAmount));
	return expectedKind(ingredient) === "fluid" ? ingredient.amount : ingredient.count;
}

function outputFor(result, roll) {
	if (roll() > result.chance)
		return undefined;
	return result.kind === "fluid"
		? { amount: result.amount, typeId: result.typeId }
		: { count: result.count, typeId: result.typeId };
}

function normalizeRecipe(recipe) {
	if (!recipe || typeof recipe.id !== "string" || typeof recipe.source?.type !== "string" || !Array.isArray(recipe.ingredients)
		|| !Array.isArray(recipe.results) || typeof recipe.keepHeldItem !== "boolean" || !["port_runtime", "special_runtime"].includes(recipe.strategy))
		throw new TypeError("Interaction machines require normalized interaction recipes");
	return clone(recipe);
}

/**
 * Pure, server-authoritative recipe matcher for Deployer/Spout/Sandpaper
 * actions. World adapters provide managed item/fluid ports and commit this
 * returned plan through their own escrow protocol.
 */
export class InteractionMachine {
	#recipes;

	constructor(recipes) {
		if (!Array.isArray(recipes))
			throw new TypeError("Interaction machines require a recipe array");
		this.#recipes = new Map(recipes.map(normalizeRecipe).map(recipe => [recipe.id, recipe]));
		if (this.#recipes.size !== recipes.length)
			throw new Error("Interaction recipe identifiers must be unique");
	}

	plan(recipeId, { fluid, heldItem, input, matchesComponents = (expected, actual) => stableStringify(expected) === stableStringify(actual), matchesTag = () => false, random = () => 0 } = {}) {
		if (typeof matchesComponents !== "function" || typeof matchesTag !== "function" || typeof random !== "function")
			throw new TypeError("Interaction plans require component, tag, and random functions");
		const recipe = this.#recipes.get(recipeId);
		if (!recipe)
			return { accepted: false, reason: "unknown_recipe" };
		if (recipe.strategy === "special_runtime")
			return { accepted: false, reason: "special_runtime" };
		const suppliedInput = assertItem(input, "Interaction input");
		const consumed = { fluids: [], items: [] };
		for (const [index, ingredient] of recipe.ingredients.entries()) {
			const kind = expectedKind(ingredient);
			const supplied = index === 0 ? suppliedInput : kind === "fluid" ? fluid && assertFluid(fluid, "Interaction fluid") : heldItem && assertItem(heldItem, "Interaction held item");
			if (!ingredientMatches(ingredient, supplied, { matchesComponents, matchesTag }))
				return { accepted: false, reason: index === 0 ? "wrong_input" : kind === "fluid" ? "wrong_fluid" : "wrong_held_item" };
			if (index === 0 || !recipe.keepHeldItem) {
				const required = requiredAmount(ingredient);
				if (kind === "fluid")
					consumed.fluids.push({ amount: required, typeId: supplied.typeId });
				else
					consumed.items.push({ count: required, typeId: supplied.typeId });
			}
		}
		const outputs = { fluids: [], items: [] };
		for (const result of recipe.results) {
			const output = outputFor(result, random);
			if (!output)
				continue;
			if (result.kind === "fluid")
				outputs.fluids.push(output);
			else
				outputs.items.push(output);
		}
		return { accepted: true, consumed, keepHeldItem: recipe.keepHeldItem, outputs, recipeId: recipe.id };
	}

	/**
	 * World adapters normally only know the supplied input and the deployed
	 * tool/fluid. Resolve the same deterministic first match used by Create's
	 * recipe manager without exposing this machine's mutable recipe map.
	 */
	planFirst(options = {}) {
		for (const recipeId of [...this.#recipes.keys()].sort((left, right) => left.localeCompare(right))) {
			const plan = this.plan(recipeId, options);
			if (plan.accepted)
				return plan;
		}
		return { accepted: false, reason: "no_matching_recipe" };
	}
}
