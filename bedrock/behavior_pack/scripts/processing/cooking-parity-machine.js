import { cloneItemStack, itemStackFingerprint, ItemPort, rekeyItemPortSnapshot } from "../logistics/item-port.js";

export const COOKING_PARITY_MACHINE_SCHEMA = 1;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function nonEmptyString(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`${label} must be a non-empty string`);
	return value;
}

function normalizeRecipe(recipe) {
	if (!recipe || typeof recipe !== "object")
		throw new TypeError("Cooking parity recipes must be objects");
	for (const field of ["id", "input", "output"])
		nonEmptyString(recipe[field], `Cooking parity recipe ${field}`);
	if (!Array.isArray(recipe.stations) || recipe.stations.length === 0)
		throw new TypeError("Cooking parity recipes require at least one station");
	const stations = [...new Set(recipe.stations.map(station => nonEmptyString(station, "Cooking parity station")))].sort();
	if (!Number.isInteger(recipe.processingTicks) || recipe.processingTicks < 1)
		throw new RangeError("Cooking parity recipes require positive processing ticks");
	if (!Number.isFinite(recipe.experience) || recipe.experience < 0)
		throw new RangeError("Cooking parity recipes require non-negative experience");
	return {
		experience: recipe.experience,
		id: recipe.id,
		input: recipe.input,
		output: recipe.output,
		processingTicks: recipe.processingTicks,
		stations
	};
}

function normalizeSnapshotRecord(value, recipes) {
	if (!value || typeof value !== "object" || !recipes.has(value.recipeId) || !Number.isInteger(value.operationId) || value.operationId < 0)
		throw new TypeError("Cooking parity snapshots contain an invalid recipe operation");
	return {
		operationId: value.operationId,
		progress: value.progress,
		recipeId: value.recipeId
	};
}

function normalizePendingRecord(value, recipes) {
	const record = normalizeSnapshotRecord(value, recipes);
	if (!Number.isFinite(value.experience) || value.experience < 0 || !value.stack)
		throw new TypeError("Cooking parity snapshots contain an invalid pending output");
	return {
		...record,
		experience: value.experience,
		stack: cloneItemStack(value.stack)
	};
}

/**
 * Authoritative engine for the recipes whose Java furnace time or experience
 * cannot be expressed by Bedrock's native recipe JSON. It owns managed ports
 * rather than touching a native furnace directly; the platform bridge must
 * prove it can reserve input, publish output, and award XP before binding it.
 */
export class CookingParityMachine {
	#active;
	#claimable = [];
	#claims = new Map();
	#delivered;
	#id;
	#input;
	#nextOperation = 0;
	#output;
	#pending;
	#recipes;

	constructor(recipes, { id = "cooking-parity-machine" } = {}) {
		nonEmptyString(id, "Cooking parity machine ID");
		if (!Array.isArray(recipes))
			throw new TypeError("Cooking parity machines require recipe arrays");
		this.#recipes = new Map(recipes.map(normalizeRecipe).map(recipe => [recipe.id, recipe]));
		if (this.#recipes.size !== recipes.length)
			throw new Error("Cooking parity recipes require unique identifiers");
		this.#id = id;
		this.#input = new ItemPort({ id: `${id}:input`, size: 1 });
		this.#output = new ItemPort({ id: `${id}:output`, size: 1 });
	}

	insertInput(stack, options) {
		const requested = cloneItemStack(stack);
		if (![...this.#recipes.values()].some(recipe => recipe.input === requested.typeId))
			return { accepted: undefined, remainder: requested };
		return this.#input.insert(requested, options);
	}

	extractOutput({ claimerId } = {}) {
		nonEmptyString(claimerId, "Cooking parity output claimer");
		if (!this.#delivered)
			return undefined;
		const reservation = this.#output.reserve({
			maxCount: this.#delivered.stack.count,
			predicate: stack => itemStackFingerprint(stack) === itemStackFingerprint(this.#delivered.stack)
		});
		if (!reservation || reservation.item.count !== this.#delivered.stack.count)
			throw new Error("Cooking parity output differs from its delivered operation");
		const stack = this.#output.extract(reservation, { receiptId: `${this.#id}:output:${this.#delivered.operationId}` });
		const operation = this.#delivered;
		this.#delivered = undefined;
		if (operation.experience > 0)
			this.#claimable.push({ claimerId, experience: operation.experience, operationId: operation.operationId });
		return { operationId: operation.operationId, stack };
	}

	claimExperience({ claimerId, operationId, receiptId } = {}) {
		nonEmptyString(claimerId, "Cooking parity experience claimer");
		nonEmptyString(receiptId, "Cooking parity experience receipt");
		if (!Number.isInteger(operationId) || operationId < 0)
			throw new TypeError("Cooking parity experience claims require a non-negative operation ID");
		const replay = this.#claims.get(receiptId);
		if (replay) {
			if (replay.claimerId !== claimerId || replay.operationId !== operationId)
				throw new Error("Cooking parity experience receipt was reused for another claimant or operation");
			return { amount: 0, operationId, replay: true };
		}
		const index = this.#claimable.findIndex(claim => claim.operationId === operationId && claim.claimerId === claimerId);
		if (index < 0)
			return undefined;
		const [claim] = this.#claimable.splice(index, 1);
		this.#claims.set(receiptId, { claimerId, operationId });
		return { amount: claim.experience, operationId, replay: false };
	}

	inspect() {
		return {
			active: this.#active && clone(this.#active),
			claimable: this.#claimable.map(clone),
			delivered: this.#delivered && clone(this.#delivered),
			id: this.#id,
			input: this.#input.inspect(),
			nextOperation: this.#nextOperation,
			output: this.#output.inspect(),
			pending: this.#pending && clone(this.#pending)
		};
	}

	restore(snapshot) {
		if (snapshot === undefined) {
			this.#input.restore({ ...this.#input.snapshot(), slots: [undefined] });
			this.#output.restore({ ...this.#output.snapshot(), slots: [undefined] });
			this.#active = undefined;
			this.#claimable = [];
			this.#claims.clear();
			this.#delivered = undefined;
			this.#nextOperation = 0;
			this.#pending = undefined;
			return;
		}
		if (!snapshot || snapshot.schemaVersion !== COOKING_PARITY_MACHINE_SCHEMA || !snapshot.input || !snapshot.output || !Number.isInteger(snapshot.nextOperation) || snapshot.nextOperation < 0 || !Array.isArray(snapshot.claimable) || !Array.isArray(snapshot.claims))
			throw new TypeError("Cooking parity snapshots require schema, ports, operation state, and claims");
		this.#input.restore(rekeyItemPortSnapshot(snapshot.input, this.#input.id));
		this.#output.restore(rekeyItemPortSnapshot(snapshot.output, this.#output.id));
		this.#active = snapshot.active === undefined ? undefined : normalizeSnapshotRecord(snapshot.active, this.#recipes);
		this.#pending = snapshot.pending === undefined ? undefined : normalizePendingRecord(snapshot.pending, this.#recipes);
		this.#delivered = snapshot.delivered === undefined ? undefined : {
			...normalizeSnapshotRecord(snapshot.delivered, this.#recipes),
			experience: snapshot.delivered.experience,
			stack: cloneItemStack(snapshot.delivered.stack)
		};
		for (const record of [this.#active, this.#pending])
			if (record && (!Number.isInteger(record.progress) || record.progress < 0))
				throw new TypeError("Cooking parity snapshots contain invalid progress");
		if (this.#delivered && (!Number.isFinite(this.#delivered.experience) || this.#delivered.experience < 0))
			throw new TypeError("Cooking parity snapshots contain invalid delivered experience");
		this.#claimable = snapshot.claimable.map(claim => {
			if (!claim || !Number.isInteger(claim.operationId) || claim.operationId < 0 || !Number.isFinite(claim.experience) || claim.experience <= 0)
				throw new TypeError("Cooking parity snapshots contain invalid claimable experience");
			return { claimerId: nonEmptyString(claim.claimerId, "Cooking parity snapshot claimer"), experience: claim.experience, operationId: claim.operationId };
		});
		this.#claims = new Map(snapshot.claims.map(claim => {
			if (!Array.isArray(claim) || claim.length !== 2)
				throw new TypeError("Cooking parity snapshots contain invalid claim receipts");
			const [receiptId, value] = claim;
			if (!Number.isInteger(value?.operationId) || value.operationId < 0)
				throw new TypeError("Cooking parity snapshots contain invalid claim operation IDs");
			return [nonEmptyString(receiptId, "Cooking parity snapshot receipt"), {
				claimerId: nonEmptyString(value?.claimerId, "Cooking parity snapshot claim claimer"),
				operationId: value.operationId
			}];
		}));
		this.#nextOperation = snapshot.nextOperation;
	}

	snapshot() {
		return {
			active: this.#active && clone(this.#active),
			claimable: this.#claimable.map(clone),
			claims: [...this.#claims.entries()].map(clone).sort(([left], [right]) => left.localeCompare(right)),
			delivered: this.#delivered && clone(this.#delivered),
			input: this.#input.snapshot(),
			nextOperation: this.#nextOperation,
			output: this.#output.snapshot(),
			pending: this.#pending && clone(this.#pending),
			schemaVersion: COOKING_PARITY_MACHINE_SCHEMA
		};
	}

	tick({ station, workUnits = 1 } = {}) {
		nonEmptyString(station, "Cooking parity station");
		if (!Number.isInteger(workUnits) || workUnits < 1)
			throw new RangeError("Cooking parity work units must be positive integers");
		if (this.#pending)
			return this.#deliverPending();
		if (!this.#active)
			return this.#start(station);
		const recipe = this.#recipes.get(this.#active.recipeId);
		if (!recipe.stations.includes(station))
			return { paused: true, recipeId: recipe.id };
		this.#active.progress += workUnits;
		if (this.#active.progress < recipe.processingTicks)
			return { completed: false, progress: this.#active.progress, recipeId: recipe.id };
		this.#pending = {
			experience: recipe.experience,
			operationId: this.#active.operationId,
			progress: recipe.processingTicks,
			recipeId: recipe.id,
			stack: { count: 1, typeId: recipe.output }
		};
		this.#active = undefined;
		return { completed: true, operationId: this.#pending.operationId, recipeId: recipe.id };
	}

	#deliverPending() {
		const inserted = this.#output.insert(this.#pending.stack, { receiptId: `${this.#id}:deliver:${this.#pending.operationId}` });
		if (inserted.remainder)
			return { pendingOutput: true };
		this.#delivered = this.#pending;
		this.#pending = undefined;
		return { delivered: true, operationId: this.#delivered.operationId };
	}

	#start(station) {
		const candidate = this.#input.reserve();
		if (!candidate)
			return undefined;
		const recipe = [...this.#recipes.values()]
			.sort((left, right) => left.id.localeCompare(right.id))
			.find(entry => entry.input === candidate.item.typeId && entry.stations.includes(station));
		if (!recipe)
			return undefined;
		const reservation = this.#input.reserve({ maxCount: 1, predicate: stack => stack.typeId === recipe.input });
		if (!reservation || reservation.item.count !== 1)
			throw new Error("Cooking parity input changed after recipe selection");
		this.#input.extract(reservation, { receiptId: `${this.#id}:input:${this.#nextOperation}` });
		this.#active = { operationId: this.#nextOperation++, progress: 0, recipeId: recipe.id };
		return { operationId: this.#active.operationId, recipeId: recipe.id, started: true };
	}
}
