import { cloneFluidStack } from "./fluid-stack.js";
import { containerForFluid, FLUID_BUCKET_AMOUNT as REGISTRY_BUCKET_AMOUNT, fluidFromContainer } from "./fluid-registry.js";

export const FLUID_BUCKET_AMOUNT = REGISTRY_BUCKET_AMOUNT;
const EMPTY_BUCKET = "minecraft:bucket";
const EMPTY_BOTTLE = "minecraft:glass_bottle";

function canonicalFluid(typeId) {
	return { amount: FLUID_BUCKET_AMOUNT, typeId };
}

function canonicalFluidType(fluid) {
	if (!fluid || typeof fluid.typeId !== "string" || fluid.temperature !== undefined || (fluid.tags?.length ?? 0) !== 0 || fluid.components !== undefined)
		return undefined;
	return containerForFluid({ ...fluid, amount: FLUID_BUCKET_AMOUNT })?.item.typeId || containerForFluid({ ...fluid, amount: 250 })?.item.typeId
		? fluid.typeId
		: undefined;
}

function containedFluidForEmptyContainer(contents, emptyContainer) {
	if (!contents)
		return undefined;
	for (const amount of [FLUID_BUCKET_AMOUNT, 250]) {
		if (contents.amount < amount)
			continue;
		const fluid = { ...contents, amount };
		const container = containerForFluid(fluid);
		if (container?.emptyContainer === emptyContainer)
			return { container, fluid };
	}
	return undefined;
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
 * Plans an all-or-nothing bucket or bottle exchange. Metadata unavailable to a
 * physical container is deliberately rejected instead of being discarded.
 */
export function planFluidBucketInteraction({ capacity, contents, item }) {
	if (!Number.isSafeInteger(capacity) || capacity < 250)
		throw new RangeError("Fluid container interactions require a tank capacity of at least one bottle");
	const heldItem = normalizeItem(item);
	if (!heldItem || heldItem.amount !== 1)
		return undefined;

	if (heldItem.typeId === EMPTY_BUCKET || heldItem.typeId === EMPTY_BOTTLE) {
		const contained = containedFluidForEmptyContainer(contents, heldItem.typeId);
		if (!contained)
			return undefined;
		return {
			direction: "fill",
			expectedItem: heldItem,
			fluid: cloneFluidStack(contained.fluid),
			replacementItem: contained.container.item
		};
	}

	const containerFluid = fluidFromContainer(heldItem);
	if (!containerFluid)
		return undefined;
	const fluidTypeId = containerFluid.typeId;
	if (contents !== undefined) {
		if (canonicalFluidType(contents) !== fluidTypeId || contents.amount > capacity - containerFluid.amount)
			return undefined;
	}
	const container = containerForFluid(containerFluid);
	if (!container)
		return undefined;
	return {
		direction: "drain",
		expectedItem: heldItem,
		fluid: containerFluid,
		replacementItem: { amount: 1, typeId: container.emptyContainer }
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
			maxAmount: plan.fluid.amount,
			predicate: candidate => canonicalFluidType(candidate) === plan.fluid.typeId
			});
		} catch (error) {
			return { error, ok: false, reason: "tank_error" };
		}
		if (!fluid)
			return { ok: false, reason: "tank_changed" };
		if (fluid.amount !== plan.fluid.amount || canonicalFluidType(fluid) !== plan.fluid.typeId)
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
	if (insertion.accepted?.amount !== plan.fluid.amount || insertion.remainder !== undefined) {
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
