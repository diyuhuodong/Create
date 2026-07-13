import { ItemStack } from "@minecraft/server";

import { ContainerItemPort } from "./container-item-port.js";
import { cloneItemStack } from "./item-port.js";

function assertPlainStack(stack) {
	if (!stack?.isStackable)
		throw new TypeError("Container logistics currently accepts only plain stackable Bedrock ItemStacks");
	return stack;
}

const codec = {
	create(stack) {
		const normalized = cloneItemStack(stack);
		if (normalized.metadata !== undefined)
			throw new TypeError("Container logistics cannot safely recreate custom item metadata yet");
		return new ItemStack(normalized.typeId, normalized.count);
	},
	decode(stack) {
		const plain = assertPlainStack(stack);
		return { count: plain.amount, typeId: plain.typeId };
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
