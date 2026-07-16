const CART_KINDS = new Set(["minecart", "chest_minecart", "furnace_minecart"]);
const PHASES = new Set(["active", "disassembling", "frozen"]);

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeId(value, label) {
	if (typeof value !== "string" || !/^[A-Za-z0-9:._|/-]{1,256}$/.test(value))
		throw new TypeError(`Minecart contraption ${label} must be a short identifier`);
	return value;
}

function normalizeLocation(value, label) {
	if (![value?.x, value?.y, value?.z].every(Number.isInteger))
		throw new TypeError(`Minecart contraption ${label} must be an integer location`);
	return { x: value.x, y: value.y, z: value.z };
}

function normalizePassenger(value) {
	const playerId = normalizeId(value?.playerId, "passenger player id");
	const seatId = normalizeId(value?.seatId, "passenger seat id");
	return { playerId, seatId };
}

export function normalizeMinecartContraptionRecord(value) {
	const cartId = normalizeId(value?.cartId, "cart id");
	const assemblyId = normalizeId(value?.assemblyId, "assembly id");
	const dimensionId = normalizeId(value?.dimensionId, "dimension id");
	if (!CART_KINDS.has(value?.cartKind))
		throw new TypeError("Minecart contraptions require a supported cart kind");
	const phase = value?.phase ?? "active";
	if (!PHASES.has(phase))
		throw new TypeError("Minecart contraptions require an active, frozen, or disassembling phase");
	const passengers = (value.passengers ?? []).map(normalizePassenger);
	const passengerIds = new Set(passengers.map(passenger => passenger.playerId));
	const seatIds = new Set(passengers.map(passenger => passenger.seatId));
	if (passengerIds.size !== passengers.length || seatIds.size !== passengers.length)
		throw new Error("Minecart contraption passengers cannot occupy duplicate seats");
	const route = value.route === undefined ? undefined : {
		key: normalizeId(value.route?.key, "route key"),
		location: normalizeLocation(value.route?.location, "route location")
	};
	const coupling = value.coupling === undefined ? undefined : {
		counterpartId: normalizeId(value.coupling?.counterpartId, "coupling counterpart"),
		id: normalizeId(value.coupling?.id, "coupling id")
	};
	if (coupling?.counterpartId === cartId)
		throw new Error("Minecart contraptions cannot couple to themselves");
	return {
		anchorLocation: normalizeLocation(value?.anchorLocation, "anchor location"),
		assemblerLocation: normalizeLocation(value?.assemblerLocation, "assembler location"),
		assemblyId,
		cartId,
		cartKind: value.cartKind,
		dimensionId,
		...(coupling ? { coupling } : {}),
		...(value.minecartAnchorLocation ? { minecartAnchorLocation: normalizeLocation(value.minecartAnchorLocation, "minecart anchor location") } : {}),
		passengers: passengers.sort((left, right) => left.seatId.localeCompare(right.seatId)),
		phase,
		...(route ? { route } : {})
	};
}

export function createMinecartContraptionRecord({ anchorLocation, assemblerLocation, assemblyId, cartId, cartKind, dimensionId, minecartAnchorLocation, route } = {}) {
	return normalizeMinecartContraptionRecord({
		anchorLocation,
		assemblerLocation,
		assemblyId,
		cartId,
		cartKind,
		dimensionId,
		...(minecartAnchorLocation ? { minecartAnchorLocation } : {}),
		passengers: [],
		phase: "active",
		...(route ? { route } : {})
	});
}

/**
 * Pure ownership registry for P4.5. DynamicAssemblyController remains the
 * source of truth for blocks; this class only guards cart, route, seat, and
 * coupling metadata before it is persisted in the assembly host record.
 */
export class MinecartContraptionRegistry {
	#byAssembly = new Map();
	#byCart = new Map();
	#byRoute = new Map();

	assertCanRegister(record) {
		record = normalizeMinecartContraptionRecord(record);
		if (this.#byCart.has(record.cartId) || this.#byAssembly.has(record.assemblyId))
			throw new Error("Minecart contraption identity is already active");
		if (record.route && this.#byRoute.has(record.route.key))
			throw new Error(`Minecart route ${record.route.key} is already reserved`);
		return clone(record);
	}

	register(record) {
		record = this.assertCanRegister(record);
		this.#store(record);
		return clone(record);
	}

	/** Restore may arrive one assembly root at a time, so paired endpoints are
	 * verified by restore(); owner restorer insertion intentionally permits the
	 * counterpart to appear later in the same sharded-state restore pass. */
	upsertRestored(record) {
		record = normalizeMinecartContraptionRecord(record);
		const existing = this.#byCart.get(record.cartId);
		if (existing && existing.assemblyId !== record.assemblyId)
			throw new Error("Restored minecart cart identity belongs to another assembly");
		if (existing)
			this.#remove(record.cartId);
		if (this.#byAssembly.has(record.assemblyId))
			throw new Error("Restored minecart assembly identity is duplicated");
		const routeOwner = record.route && this.#byRoute.get(record.route.key);
		if (routeOwner && routeOwner !== record.cartId)
			throw new Error(`Restored minecart route ${record.route.key} is duplicated`);
		this.#store(record);
		return clone(record);
	}

	get(cartId) {
		cartId = normalizeId(cartId, "cart id");
		const record = this.#byCart.get(cartId);
		return record && clone(record);
	}

	getByAssembly(assemblyId) {
		assemblyId = normalizeId(assemblyId, "assembly id");
		const cartId = this.#byAssembly.get(assemblyId);
		return cartId === undefined ? undefined : this.get(cartId);
	}

	update(cartId, updater) {
		const current = this.#require(cartId);
		if (typeof updater !== "function")
			throw new TypeError("Minecart contraption updates require an updater");
		const next = normalizeMinecartContraptionRecord(updater(clone(current)));
		if (next.cartId !== current.cartId || next.assemblyId !== current.assemblyId)
			throw new Error("Minecart contraption updates cannot replace ownership identities");
		if (next.route?.key !== current.route?.key) {
			const owner = next.route && this.#byRoute.get(next.route.key);
			if (owner && owner !== current.cartId)
				throw new Error(`Minecart route ${next.route.key} is already reserved`);
			if (current.route)
				this.#byRoute.delete(current.route.key);
			if (next.route)
				this.#byRoute.set(next.route.key, next.cartId);
		}
		this.#byCart.set(next.cartId, next);
		return clone(next);
	}

	seat(cartId, { playerId, seatId } = {}) {
		const current = this.#require(cartId);
		if (current.phase !== "active")
			throw new Error("Passengers can only board active minecart contraptions");
		const passenger = normalizePassenger({ playerId, seatId });
		const occupied = this.findPassenger(passenger.playerId);
		if (occupied && (occupied.cartId !== cartId || occupied.seatId !== passenger.seatId))
			throw new Error("Passenger is already assigned to a minecart seat");
		if (current.passengers.some(entry => entry.seatId === passenger.seatId && entry.playerId === passenger.playerId))
			return clone(current);
		return this.update(cartId, record => ({ ...record, passengers: [...record.passengers, passenger] }));
	}

	unseat(cartId, playerId) {
		playerId = normalizeId(playerId, "passenger player id");
		return this.update(cartId, record => ({ ...record, passengers: record.passengers.filter(passenger => passenger.playerId !== playerId) }));
	}

	findPassenger(playerId) {
		playerId = normalizeId(playerId, "passenger player id");
		for (const record of this.#byCart.values()) {
			const passenger = record.passengers.find(entry => entry.playerId === playerId);
			if (passenger)
				return { cartId: record.cartId, seatId: passenger.seatId };
		}
		return undefined;
	}

	couple(leftCartId, rightCartId) {
		const left = this.#require(leftCartId);
		const right = this.#require(rightCartId);
		if (left.cartId === right.cartId)
			throw new Error("Minecart contraptions cannot couple to themselves");
		if (left.coupling?.counterpartId === right.cartId && right.coupling?.counterpartId === left.cartId)
			return { couplingId: left.coupling.id, left: clone(left), right: clone(right) };
		if (left.coupling || right.coupling)
			throw new Error("Minecart contraptions must be uncoupled before creating another coupling");
		const couplingId = `coupling:${[left.cartId, right.cartId].sort().join("|")}`;
		const updatedLeft = this.update(left.cartId, record => ({ ...record, coupling: { counterpartId: right.cartId, id: couplingId } }));
		const updatedRight = this.update(right.cartId, record => ({ ...record, coupling: { counterpartId: left.cartId, id: couplingId } }));
		return { couplingId, left: updatedLeft, right: updatedRight };
	}

	uncouple(cartId) {
		const record = this.#require(cartId);
		if (!record.coupling)
			return { record: clone(record) };
		const counterpartId = record.coupling.counterpartId;
		const updated = this.update(record.cartId, value => ({ ...value, coupling: undefined }));
		const counterpart = this.#byCart.has(counterpartId)
			? this.update(counterpartId, value => ({ ...value, coupling: undefined }))
			: undefined;
		return { counterpart, record: updated };
	}

	beginDisassembly(cartId) {
		return this.update(cartId, record => ({ ...record, phase: "disassembling" }));
	}

	reopen(cartId) {
		return this.update(cartId, record => ({ ...record, phase: "active" }));
	}

	completeDisassembly(cartId) {
		const record = this.#require(cartId);
		if (record.phase !== "disassembling")
			throw new Error("Minecart contraption must enter disassembly before completion");
		this.#remove(record.cartId);
		let counterpart;
		if (record.coupling && this.#byCart.has(record.coupling.counterpartId))
			counterpart = this.update(record.coupling.counterpartId, other => ({ ...other, coupling: undefined }));
		return { counterpart, record: clone(record) };
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Minecart contraption restore requires an array");
		const restored = new MinecartContraptionRegistry();
		for (const record of records)
			restored.register(record);
		for (const record of restored.#byCart.values()) {
			if (!record.coupling)
				continue;
			const counterpart = restored.#byCart.get(record.coupling.counterpartId);
			if (!counterpart || counterpart.coupling?.counterpartId !== record.cartId || counterpart.coupling.id !== record.coupling.id)
				throw new Error("Minecart contraption coupling endpoints must be symmetric");
		}
		this.#byAssembly = restored.#byAssembly;
		this.#byCart = restored.#byCart;
		this.#byRoute = restored.#byRoute;
		return this.snapshot();
	}

	snapshot() {
		return [...this.#byCart.values()].map(clone).sort((left, right) => left.cartId.localeCompare(right.cartId));
	}

	#store(record) {
		this.#byCart.set(record.cartId, record);
		this.#byAssembly.set(record.assemblyId, record.cartId);
		if (record.route)
			this.#byRoute.set(record.route.key, record.cartId);
	}

	#remove(cartId) {
		const record = this.#require(cartId);
		this.#byCart.delete(record.cartId);
		this.#byAssembly.delete(record.assemblyId);
		if (record.route)
			this.#byRoute.delete(record.route.key);
		return record;
	}

	#require(cartId) {
		cartId = normalizeId(cartId, "cart id");
		const record = this.#byCart.get(cartId);
		if (!record)
			throw new Error(`Unknown minecart contraption ${cartId}`);
		return record;
	}
}
