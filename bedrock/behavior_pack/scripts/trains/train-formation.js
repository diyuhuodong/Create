export const TRAIN_FORMATION_SCHEMA_VERSION = 2;
export const MAX_TRAIN_CARRIAGES = 32;

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function normalizeSeat(value, index) {
	if (!value || typeof value.id !== "string" || ![value.offset?.x, value.offset?.y, value.offset?.z].every(Number.isFinite))
		throw new TypeError(`Train seat ${index} requires an id and finite offset`);
	return { id: value.id, offset: { ...value.offset }, passengerId: typeof value.passengerId === "string" ? value.passengerId : undefined };
}

function normalizeDoor(value, index) {
	if (!value || typeof value.id !== "string" || !["left", "right"].includes(value.side))
		throw new TypeError(`Train door ${index} requires an id and platform side`);
	return { id: value.id, open: !!value.open, side: value.side };
}

function normalizeCarriage(value, index) {
	const length = value?.length ?? 2;
	if (!Number.isFinite(length) || length <= 0 || length > 64)
		throw new RangeError(`Train carriage ${index} requires a practical positive length`);
	const bogeyOffsets = value?.bogeyOffsets ?? [length * .25, length * .75];
	if (!Array.isArray(bogeyOffsets) || bogeyOffsets.length !== 2 || bogeyOffsets.some(offset => !Number.isFinite(offset) || offset < 0 || offset > length) || bogeyOffsets[0] >= bogeyOffsets[1])
		throw new TypeError(`Train carriage ${index} requires ordered front/rear bogey offsets`);
	return {
		bogeyOffsets: [...bogeyOffsets],
		doors: (value?.doors ?? []).map(normalizeDoor),
		id: typeof value?.id === "string" && value.id.length > 0 ? value.id : `carriage:${index}`,
		length,
		payload: clone(value?.payload),
		seats: (value?.seats ?? []).map(normalizeSeat)
	};
}

export function createTrainFormation({ carriages, carriageCount = 1, carriageSpacing = 2, couplerGap = 0 } = {}) {
	if (carriages === undefined) {
		if (!Number.isInteger(carriageCount) || carriageCount < 1 || carriageCount > MAX_TRAIN_CARRIAGES || !Number.isFinite(carriageSpacing) || carriageSpacing <= 0)
			throw new RangeError("Legacy train formations require bounded carriage count and positive spacing");
		carriages = Array.from({ length: carriageCount }, (_, index) => ({ id: `carriage:${index}`, length: carriageSpacing }));
	}
	if (!Array.isArray(carriages) || carriages.length < 1 || carriages.length > MAX_TRAIN_CARRIAGES)
		throw new RangeError(`Train formations require 1 to ${MAX_TRAIN_CARRIAGES} carriages`);
	if (!Number.isFinite(couplerGap) || couplerGap < 0 || couplerGap > 8)
		throw new RangeError("Train coupler gaps must be between zero and eight blocks");
	const normalized = carriages.map(normalizeCarriage);
	const ids = normalized.map(carriage => carriage.id);
	if (new Set(ids).size !== ids.length)
		throw new TypeError("Train carriage ids must be unique within a formation");
	return { carriages: normalized, couplerGap, schemaVersion: TRAIN_FORMATION_SCHEMA_VERSION };
}

export function normalizeTrainFormation(value) {
	if (value?.schemaVersion !== TRAIN_FORMATION_SCHEMA_VERSION)
		throw new TypeError(`Train formations must use schema ${TRAIN_FORMATION_SCHEMA_VERSION}`);
	return createTrainFormation(value);
}

export function trainFormationLength(value) {
	const formation = normalizeTrainFormation(value);
	return formation.carriages.reduce((total, carriage) => total + carriage.length, 0) + formation.couplerGap * (formation.carriages.length - 1);
}

export function trainCarriageLeadOffsets(value) {
	const formation = normalizeTrainFormation(value);
	let offset = 0;
	return formation.carriages.map(carriage => {
		const current = { carriageId: carriage.id, leadOffset: offset, length: carriage.length };
		offset += carriage.length + formation.couplerGap;
		return current;
	});
}

export function setFormationDoors(value, { alignedSide, speed }) {
	const formation = normalizeTrainFormation(value);
	if (alignedSide !== undefined && !["left", "right"].includes(alignedSide))
		throw new RangeError("Platform alignment sides must be left or right");
	if (!Number.isFinite(speed) || speed < 0)
		throw new RangeError("Door interlocks require a non-negative train speed");
	return createTrainFormation({
		...formation,
		carriages: formation.carriages.map(carriage => ({
			...carriage,
			doors: carriage.doors.map(door => ({ ...door, open: speed === 0 && door.side === alignedSide }))
		}))
	});
}

export function bindFormationPassenger(value, { carriageId, passengerId, seatId }) {
	if (typeof passengerId !== "string" || passengerId.length === 0)
		throw new TypeError("Train passengers require a stable id");
	const formation = normalizeTrainFormation(value);
	let found = false;
	const occupied = formation.carriages.flatMap(carriage => carriage.seats).find(seat => seat.passengerId === passengerId && !(carriage.id === carriageId && seat.id === seatId));
	if (occupied)
		throw new Error(`Passenger ${passengerId} already owns seat ${occupied.id}`);
	const carriages = formation.carriages.map(carriage => ({
		...carriage,
		seats: carriage.seats.map(seat => {
			if (carriage.id !== carriageId || seat.id !== seatId)
				return seat;
			if (seat.passengerId && seat.passengerId !== passengerId)
				throw new Error(`Train seat ${seatId} is already occupied`);
			found = true;
			return { ...seat, passengerId };
		})
	}));
	if (!found)
		throw new Error(`Unknown train seat ${carriageId}/${seatId}`);
	return createTrainFormation({ ...formation, carriages });
}

export function releaseFormationPassenger(value, passengerId) {
	if (typeof passengerId !== "string" || passengerId.length === 0)
		throw new TypeError("Train passengers require a stable id");
	const formation = normalizeTrainFormation(value);
	let changed = false;
	const carriages = formation.carriages.map(carriage => ({
		...carriage,
		seats: carriage.seats.map(seat => {
			if (seat.passengerId !== passengerId)
				return seat;
			changed = true;
			return { ...seat, passengerId: undefined };
		})
	}));
	return { changed, formation: changed ? createTrainFormation({ ...formation, carriages }) : formation };
}
