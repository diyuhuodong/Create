import { cloneFluidStack } from "./fluid-stack.js";

export const FLUID_BUCKET_AMOUNT = 1_000;

const FLUID_TO_BUCKET = new Map([
	["minecraft:lava", "minecraft:lava_bucket"],
	["minecraft:water", "minecraft:water_bucket"]
]);
const BUCKET_TO_FLUID = new Map([...FLUID_TO_BUCKET].map(([fluidTypeId, bucketTypeId]) => [bucketTypeId, fluidTypeId]));
const EMPTY_BUCKET = "minecraft:bucket";

function canonicalFluid(typeId) {
	return { amount: FLUID_BUCKET_AMOUNT, typeId };
}

function canonicalFluidType(fluid) {
	if (!fluid || typeof fluid.typeId !== "string" || fluid.temperature !== undefined || (fluid.tags?.length ?? 0) !== 0)
		return undefined;
	return FLUID_TO_BUCKET.has(fluid.typeId) ? fluid.typeId : undefined;
}

function normalizeItem(item) {
	if (!item || typeof item.typeId !== "string" || !Number.isSafeInteger(item.amount) || item.amount < 1)
		return undefined;
	return { amount: item.amount, typeId: item.typeId };
}

function sameItem(left, right) {
	return left?.amount === right?.amount && left?.typeId === right?.typeId;
}

function rollback(extractFluid, insertFluid, direction, fluid) {
	try {
		if (direction === "fill") {
			const result = insertFluid(fluid);
			return result.accepted?.amount === fluid.amount && result.remainder === undefined;
		}
		const recovered = extractFluid({
			maxAmount: fluid.amount,
			predicate: candidate => canonicalFluidType(candidate) === fluid.typeId
		});
		return recovered?.amount === fluid.amount && canonicalFluidType(recovered) === fluid.typeId;
	} catch {
		return false;
	}
}

/**
 * Plans an all-or-nothing vanilla bucket exchange. Fluid metadata that a vanilla
 * bucket cannot represent is intentionally rejected instead of being discarded.
 */
export function planFluidBucketInteraction({ capacity, contents, item }) {
	if (!Number.isSafeInteger(capacity) || capacity < FLUID_BUCKET_AMOUNT)
		throw new RangeError("Fluid bucket interactions require a tank capacity of at least one bucket");
	const heldItem = normalizeItem(item);
	if (!heldItem || heldItem.amount !== 1)
		return undefined;

	if (heldItem.typeId === EMPTY_BUCKET) {
		const fluidTypeId = canonicalFluidType(contents);
		if (!fluidTypeId || contents.amount < FLUID_BUCKET_AMOUNT)
			return undefined;
		return {
			direction: "fill",
			expectedItem: heldItem,
			fluid: canonicalFluid(fluidTypeId),
			replacementItem: { amount: 1, typeId: FLUID_TO_BUCKET.get(fluidTypeId) }
		};
	}

	const fluidTypeId = BUCKET_TO_FLUID.get(heldItem.typeId);
	if (!fluidTypeId)
		return undefined;
	if (contents !== undefined) {
		if (canonicalFluidType(contents) !== fluidTypeId || contents.amount > capacity - FLUID_BUCKET_AMOUNT)
			return undefined;
	}
	return {
		direction: "drain",
		expectedItem: heldItem,
		fluid: canonicalFluid(fluidTypeId),
		replacementItem: { amount: 1, typeId: EMPTY_BUCKET }
	};
}

/**
 * Applies a previously planned exchange after the caller has revalidated the
 * held slot. The caller owns runtime-specific item conversion and persistence.
 */
export function settleFluidBucketInteraction({ extractFluid, getHeldItem, insertFluid, plan, setHeldItem }) {
	if (!plan || (plan.direction !== "fill" && plan.direction !== "drain"))
		throw new TypeError("Fluid bucket settlement requires a valid plan");
	for (const operation of [extractFluid, getHeldItem, insertFluid, setHeldItem]) {
		if (typeof operation !== "function")
			throw new TypeError("Fluid bucket settlement requires inventory and tank callbacks");
	}
	if (!sameItem(normalizeItem(getHeldItem()), plan.expectedItem))
		return { ok: false, reason: "held_item_changed" };

	if (plan.direction === "fill") {
		let fluid;
		try {
			fluid = extractFluid({
				maxAmount: FLUID_BUCKET_AMOUNT,
				predicate: candidate => canonicalFluidType(candidate) === plan.fluid.typeId
			});
		} catch (error) {
			return { error, ok: false, reason: "tank_error" };
		}
		if (!fluid)
			return { ok: false, reason: "tank_changed" };
		if (fluid.amount !== FLUID_BUCKET_AMOUNT || canonicalFluidType(fluid) !== plan.fluid.typeId)
			return {
				ok: false,
				reason: rollback(extractFluid, insertFluid, "fill", fluid) ? "tank_changed_rolled_back" : "rollback_failed"
			};
		try {
			setHeldItem(plan.replacementItem);
			return { fluid: cloneFluidStack(fluid), ok: true };
		} catch (error) {
			return { error, ok: false, reason: rollback(extractFluid, insertFluid, "fill", fluid) ? "inventory_error_rolled_back" : "rollback_failed" };
		}
	}

	let insertion;
	try {
		insertion = insertFluid(plan.fluid);
	} catch (error) {
		return { error, ok: false, reason: "tank_error" };
	}
	if (insertion.accepted?.amount !== FLUID_BUCKET_AMOUNT || insertion.remainder !== undefined) {
		const accepted = insertion.accepted;
		if (!accepted)
			return { ok: false, reason: "tank_changed" };
		return {
			ok: false,
			reason: rollback(extractFluid, insertFluid, "drain", accepted) ? "tank_changed_rolled_back" : "rollback_failed"
		};
	}
	try {
		setHeldItem(plan.replacementItem);
		return { fluid: cloneFluidStack(plan.fluid), ok: true };
	} catch (error) {
		return { error, ok: false, reason: rollback(extractFluid, insertFluid, "drain", plan.fluid) ? "inventory_error_rolled_back" : "rollback_failed" };
	}
}
