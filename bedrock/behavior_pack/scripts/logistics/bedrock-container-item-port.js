import { ItemStack } from "@minecraft/server";

import { ContainerItemPort } from "./container-item-port.js";
import { cloneItemStack } from "./item-port.js";

function assertPlainStack(stack) {
	if (!stack?.isStackable)
		throw new TypeError("Container logistics currently accepts only plain stackable Bedrock ItemStacks");
	return stack;
}

export function decodeBedrockContainerStack(stack) {
	const plain = assertPlainStack(stack);
	return { count: plain.amount, typeId: plain.typeId };
}

const codec = {
	create(stack) {
		const normalized = cloneItemStack(stack);
		if (normalized.metadata !== undefined)
			throw new TypeError("Container logistics cannot safely recreate custom item metadata yet");
		return new ItemStack(normalized.typeId, normalized.count);
	},
	decode(stack) {
		return decodeBedrockContainerStack(stack);
	},
	maxAmount(stack, requested) {
		return stack?.maxAmount ?? new ItemStack(requested.typeId, 1).maxAmount;
	},
	withCount(stack, count) {
		const copy = assertPlainStack(stack).clone();
		copy.amount = count;
		return copy;
	}
};

export function createBedrockContainerItemPort({ container, id }) {
	return new ContainerItemPort({ codec, container, id });
}

export function createBedrockContainerEscrowEndpoint({ container, dimension, id, location, slot = 0 }) {
	if (!dimension || typeof dimension.spawnEntity !== "function")
		throw new TypeError("Bedrock escrow endpoints require a writable dimension");
	if (!location || !Number.isFinite(location.x) || !Number.isFinite(location.y) || !Number.isFinite(location.z))
		throw new TypeError("Bedrock escrow endpoints require a finite anchor location");
	if (!Number.isInteger(slot) || slot < 0)
		throw new RangeError("Bedrock escrow endpoint slots must be non-negative integers");
	return {
		container,
		dimension,
		id,
		location: { x: location.x, y: location.y, z: location.z },
		slot
	};
}
