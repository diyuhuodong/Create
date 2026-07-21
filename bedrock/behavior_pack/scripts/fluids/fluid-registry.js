import { cloneFluidStack } from "./fluid-stack.js";

export const FLUID_BUCKET_AMOUNT = 1_000;
export const FLUID_BOTTLE_AMOUNT = 250;

const PROFILES = new Map([
	["minecraft:water", { bucket: "minecraft:water_bucket", worldBlock: "minecraft:water" }],
	["minecraft:lava", { bucket: "minecraft:lava_bucket", worldBlock: "minecraft:lava" }],
	["createbedrock:honey", { bucket: "createbedrock:honey_bucket", worldBlock: "createbedrock:honey" }],
	["createbedrock:chocolate", { bucket: "createbedrock:chocolate_bucket", worldBlock: "createbedrock:chocolate" }],
	// Tea, milk, and potion retain their identity in tanks and containers. They
	// intentionally have no world projection: Bedrock Add-Ons cannot add a
	// flowing liquid simulation that interoperates with the vanilla engine.
	["createbedrock:tea", { bottle: "createbedrock:builders_tea", virtual: true }],
	["createbedrock:milk", { bucket: "minecraft:milk_bucket", virtual: true }],
	["createbedrock:potion", { virtual: true }]
]);

const TAG_FLUIDS = new Map([
	["c:honey", ["createbedrock:honey"]],
	["c:milk", ["createbedrock:milk"]]
]);

const BUCKET_TO_FLUID = new Map([...PROFILES.entries()]
	.filter(([, profile]) => profile.bucket)
	.map(([typeId, profile]) => [profile.bucket, typeId]));

function normalizeRequirement(requirement) {
	if (typeof requirement === "string")
		return requirement;
	if (!requirement || typeof requirement !== "object")
		return undefined;
	return requirement.typeId ?? requirement.tag;
}

export function fluidProfile(typeId) {
	if (typeof typeId !== "string" || typeId.length === 0)
		return undefined;
	const profile = PROFILES.get(typeId);
	return profile && { ...profile };
}

export function fluidMatchesRequirement(fluid, requirement) {
	const normalized = cloneFluidStack(fluid);
	const expected = normalizeRequirement(requirement);
	if (!expected)
		return false;
	if (expected.startsWith("#"))
		return (TAG_FLUIDS.get(expected.slice(1)) ?? []).includes(normalized.typeId);
	if (expected.includes(":")) {
		if (expected === normalized.typeId)
			return true;
		return (TAG_FLUIDS.get(expected) ?? []).includes(normalized.typeId);
	}
	return false;
}

export function fluidFromContainer(item) {
	if (!item || typeof item.typeId !== "string")
		return undefined;
	const bucketType = BUCKET_TO_FLUID.get(item.typeId);
	if (bucketType)
		return { amount: FLUID_BUCKET_AMOUNT, typeId: bucketType };
	if (item.typeId === "minecraft:honey_bottle")
		return { amount: FLUID_BOTTLE_AMOUNT, typeId: "createbedrock:honey" };
	if (item.typeId === "createbedrock:builders_tea")
		return { amount: FLUID_BOTTLE_AMOUNT, typeId: "createbedrock:tea" };
	return undefined;
}

export function containerForFluid(fluid, { emptyContainer = "minecraft:bucket" } = {}) {
	const normalized = cloneFluidStack(fluid);
	const profile = PROFILES.get(normalized.typeId);
	if (!profile || normalized.temperature !== undefined || (normalized.tags?.length ?? 0) !== 0 || normalized.components !== undefined)
		return undefined;
	if (profile.bucket && normalized.amount === FLUID_BUCKET_AMOUNT)
		return { emptyContainer, item: { amount: 1, typeId: profile.bucket } };
	if (normalized.typeId === "createbedrock:honey" && normalized.amount === FLUID_BOTTLE_AMOUNT)
		return { emptyContainer: "minecraft:glass_bottle", item: { amount: 1, typeId: "minecraft:honey_bottle" } };
	if (normalized.typeId === "createbedrock:tea" && normalized.amount === FLUID_BOTTLE_AMOUNT)
		return { emptyContainer: "minecraft:glass_bottle", item: { amount: 1, typeId: "createbedrock:builders_tea" } };
	return undefined;
}

export function fluidFromWorldBlock(block) {
	if (!block || typeof block.typeId !== "string" || block.isWaterlogged || block.states?.liquid_depth > 0)
		return undefined;
	for (const [typeId, profile] of PROFILES)
		if (profile.worldBlock === block.typeId)
			return { amount: FLUID_BUCKET_AMOUNT, typeId };
	return undefined;
}

export function worldBlockForFluid(fluid) {
	const normalized = cloneFluidStack(fluid);
	const profile = PROFILES.get(normalized.typeId);
	if (!profile?.worldBlock || normalized.amount !== FLUID_BUCKET_AMOUNT || normalized.temperature !== undefined || (normalized.tags?.length ?? 0) !== 0 || normalized.components !== undefined)
		return undefined;
	return {
		states: normalized.typeId.startsWith("minecraft:") ? { liquid_depth: 0 } : {},
		typeId: profile.worldBlock
	};
}

export function isWorldRepresentable(fluid) {
	return worldBlockForFluid(fluid) !== undefined;
}
