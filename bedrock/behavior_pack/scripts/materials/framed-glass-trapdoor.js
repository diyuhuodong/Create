export const FRAMED_GLASS_TRAPDOOR_BLOCK = "createbedrock:framed_glass_trapdoor";
export const TRAPDOOR_OPEN_STATE = "createbedrock:open";
export const TRAPDOOR_POWERED_STATE = "createbedrock:powered";

function assertBinaryState(value, name) {
	if (value !== 0 && value !== 1)
		throw new RangeError(`Framed glass trapdoor ${name} must be 0 or 1`);
	return value;
}

export function trapdoorOpenState(permutation) {
	const value = permutation?.getAllStates?.()[TRAPDOOR_OPEN_STATE];
	return assertBinaryState(value, "open state");
}

export function trapdoorStatesForPower(powerLevel) {
	if (!Number.isInteger(powerLevel) || powerLevel < 0 || powerLevel > 15)
		throw new RangeError("Framed glass trapdoor redstone power must be an integer from 0 through 15");
	const powered = powerLevel > 0 ? 1 : 0;
	return { open: powered, powered };
}

export function withTrapdoorStates(permutation, { open, powered } = {}) {
	if (!permutation || typeof permutation.withState !== "function")
		throw new TypeError("Framed glass trapdoor requires a mutable block permutation");
	let next = permutation;
	if (open !== undefined)
		next = next.withState(TRAPDOOR_OPEN_STATE, assertBinaryState(open, "open state"));
	if (powered !== undefined)
		next = next.withState(TRAPDOOR_POWERED_STATE, assertBinaryState(powered, "powered state"));
	return next;
}

export function toggledTrapdoorPermutation(permutation) {
	return withTrapdoorStates(permutation, { open: trapdoorOpenState(permutation) === 0 ? 1 : 0 });
}
