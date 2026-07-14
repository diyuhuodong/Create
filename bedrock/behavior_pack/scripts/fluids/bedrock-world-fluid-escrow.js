import { ItemStack } from "@minecraft/server";

const BUCKETS = new Map([
	["minecraft:lava", "minecraft:lava_bucket"],
	["minecraft:water", "minecraft:water_bucket"]
]);
const FLUIDS = new Map([...BUCKETS].map(([fluidTypeId, bucketTypeId]) => [bucketTypeId, fluidTypeId]));

function bucketForFluid(fluid) {
	if (!fluid || fluid.amount !== 1_000 || fluid.temperature !== undefined || (fluid.tags?.length ?? 0) !== 0)
		return undefined;
	return BUCKETS.get(fluid.typeId);
}

function fluidFromBucket(stack) {
	if (!stack || stack.amount !== 1)
		return undefined;
	const typeId = FLUIDS.get(stack.typeId);
	return typeId ? { amount: 1_000, typeId } : undefined;
}

function requireEscrow(registry, escrowId, transactionId) {
	const escrow = registry.resolve(escrowId, transactionId);
	if (!escrow)
		return undefined;
	if (!escrow.container || escrow.container.size !== 1)
		throw new Error(`Fluid escrow ${escrowId} has no private one-slot inventory`);
	return escrow;
}

/**
 * Bridges a vanilla still source block to the existing private Add-On escrow
 * entity. A bucket in the entity is the durable physical witness for a world
 * fluid transfer until FluidNetworkState commits its target Tank update.
 */
export function createBedrockWorldFluidEscrows({ anchor, dimension, registry }) {
	if (!registry || typeof registry.create !== "function" || typeof registry.destroy !== "function" || typeof registry.resolve !== "function")
		throw new TypeError("Bedrock world fluid escrows require an entity registry");
	if (!dimension || typeof dimension.spawnEntity !== "function")
		throw new TypeError("Bedrock world fluid escrows require a writable dimension");
	if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z))
		throw new TypeError("Bedrock world fluid escrows require a finite anchor");

	return {
		create({ transactionId }) {
			const escrow = registry.create({
				id: transactionId,
				source: { dimension, location: anchor }
			});
			return { id: escrow.id };
		},
		resolve({ escrowId, transactionId }) {
			const escrow = requireEscrow(registry, escrowId, transactionId);
			if (!escrow)
				return undefined;
			return {
				clear() {
					escrow.container.setItem(0);
				},
				read() {
					return fluidFromBucket(escrow.container.getItem(0));
				},
				retire() {
					registry.destroy(escrow.id);
				},
				write(fluid) {
					const bucket = bucketForFluid(fluid);
					if (!bucket)
						throw new TypeError("World fluid escrows only represent canonical vanilla water and lava buckets");
					escrow.container.setItem(0, new ItemStack(bucket, 1));
				}
			};
		}
	};
}
