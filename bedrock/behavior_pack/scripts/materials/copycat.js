export const COPYCAT_PANEL = "createbedrock:copycat_panel";
export const COPYCAT_STEP = "createbedrock:copycat_step";
export const COPYCAT_BLOCKS = Object.freeze(new Set([COPYCAT_PANEL, COPYCAT_STEP]));
export const COPYCAT_STATE_SCHEMA = 1;
export const COPYCAT_EMPTY_MATERIAL = "minecraft:air";

function validIdentifier(value) {
	return typeof value === "string" && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value);
}

function material(value) {
	if (!validIdentifier(value))
		throw new TypeError("Copycat material must use a qualified item identifier");
	return value;
}

export function isCopycatBlock(typeId) {
	return COPYCAT_BLOCKS.has(typeId);
}

export function createCopycatState(patch = {}) {
	const materialItemType = material(patch.materialItemType ?? COPYCAT_EMPTY_MATERIAL);
	return {
		materialItemType,
		rotation: Number.isInteger(patch.rotation) ? ((patch.rotation % 4) + 4) % 4 : 0,
		schemaVersion: COPYCAT_STATE_SCHEMA
	};
}

export function validateCopycatState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Copycat state must be an object");
	if (value.schemaVersion !== COPYCAT_STATE_SCHEMA)
		throw new Error(`Copycat state must use schema ${COPYCAT_STATE_SCHEMA}`);
	return createCopycatState(value);
}

export function copycatHasMaterial(state) {
	return validateCopycatState(state).materialItemType !== COPYCAT_EMPTY_MATERIAL;
}

/** Mirrors Java's one-material rule: reusing that material rotates it; replacing requires a reset. */
export function applyCopycatMaterial(state, materialItemType) {
	const current = validateCopycatState(state);
	const nextMaterial = material(materialItemType);
	if (nextMaterial === COPYCAT_EMPTY_MATERIAL)
		return { changed: false, reason: "air", state: current };
	if (current.materialItemType === COPYCAT_EMPTY_MATERIAL)
		return { changed: true, consumed: true, reason: "applied", state: { ...current, materialItemType: nextMaterial } };
	if (current.materialItemType !== nextMaterial)
		return { changed: false, reason: "occupied", state: current };
	return { changed: true, consumed: false, reason: "rotated", state: { ...current, rotation: (current.rotation + 1) % 4 } };
}

export function clearCopycatMaterial(state) {
	const current = validateCopycatState(state);
	if (current.materialItemType === COPYCAT_EMPTY_MATERIAL)
		return { changed: false, materialItemType: COPYCAT_EMPTY_MATERIAL, state: current };
	return {
		changed: true,
		materialItemType: current.materialItemType,
		state: { ...current, materialItemType: COPYCAT_EMPTY_MATERIAL, rotation: 0 }
	};
}
