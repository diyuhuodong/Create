export const TRACK_GEOMETRY_SCHEMA_VERSION = 2;
export const DEFAULT_BEZIER_SAMPLES = 64;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function vector(value, label) {
	if (![value?.x, value?.y, value?.z].every(Number.isFinite))
		throw new TypeError(`${label} requires finite x, y, and z coordinates`);
	return { x: value.x, y: value.y, z: value.z };
}

function distance(left, right) {
	return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function subtract(left, right) {
	return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function normalize(value, fallback = { x: 1, y: 0, z: 0 }) {
	const magnitude = Math.hypot(value.x, value.y, value.z);
	return magnitude < 1e-12 ? { ...fallback } : { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude };
}

function linePoint(start, end, t) {
	return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t };
}

function bezierPoint(start, control1, control2, end, t) {
	const inverse = 1 - t;
	return {
		x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
		y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y,
		z: inverse ** 3 * start.z + 3 * inverse ** 2 * t * control1.z + 3 * inverse * t ** 2 * control2.z + t ** 3 * end.z
	};
}

function bezierTangent(start, control1, control2, end, t) {
	const inverse = 1 - t;
	return normalize({
		x: 3 * inverse ** 2 * (control1.x - start.x) + 6 * inverse * t * (control2.x - control1.x) + 3 * t ** 2 * (end.x - control2.x),
		y: 3 * inverse ** 2 * (control1.y - start.y) + 6 * inverse * t * (control2.y - control1.y) + 3 * t ** 2 * (end.y - control2.y),
		z: 3 * inverse ** 2 * (control1.z - start.z) + 6 * inverse * t * (control2.z - control1.z) + 3 * t ** 2 * (end.z - control2.z)
	});
}

function createLut(pointAt, samples) {
	const lut = [{ s: 0, t: 0 }];
	let previous = pointAt(0);
	let length = 0;
	for (let index = 1; index <= samples; index++) {
		const t = index / samples;
		const point = pointAt(t);
		length += distance(previous, point);
		lut.push({ s: length, t });
		previous = point;
	}
	return { length, lut };
}

function tForDistance(lut, length, s) {
	if (length === 0)
		return 0;
	s = Math.max(0, Math.min(length, s));
	let low = 0;
	let high = lut.length - 1;
	while (low + 1 < high) {
		const middle = Math.floor((low + high) / 2);
		if (lut[middle].s < s)
			low = middle;
		else
			high = middle;
	}
	const left = lut[low];
	const right = lut[high];
	const ratio = right.s === left.s ? 0 : (s - left.s) / (right.s - left.s);
	return left.t + (right.t - left.t) * ratio;
}

function normalFor(tangent, requested) {
	if (requested) {
		const candidate = normalize(requested, { x: 0, y: 1, z: 0 });
		const dot = tangent.x * candidate.x + tangent.y * candidate.y + tangent.z * candidate.z;
		return normalize({ x: candidate.x - tangent.x * dot, y: candidate.y - tangent.y * dot, z: candidate.z - tangent.z * dot }, { x: 0, y: 1, z: 0 });
	}
	const up = Math.abs(tangent.y) > .99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
	const dot = tangent.x * up.x + tangent.y * up.y + tangent.z * up.z;
	return normalize({ x: up.x - tangent.x * dot, y: up.y - tangent.y * dot, z: up.z - tangent.z * dot });
}

export function createLineTrackGeometry(startValue, endValue, { length, normal } = {}) {
	const start = vector(startValue, "Line track start");
	const end = vector(endValue, "Line track end");
	const geometricLength = distance(start, end);
	const resolvedLength = length ?? geometricLength;
	if (!Number.isFinite(resolvedLength) || resolvedLength <= 0)
		throw new RangeError("Line tracks require a positive length");
	return { end, kind: "line", length: resolvedLength, normal: normal && vector(normal, "Line track normal"), schemaVersion: TRACK_GEOMETRY_SCHEMA_VERSION, start };
}

export function createBezierTrackGeometry({ control1: control1Value, control2: control2Value, end: endValue, normal, samples = DEFAULT_BEZIER_SAMPLES, start: startValue }) {
	const start = vector(startValue, "Bezier track start");
	const control1 = vector(control1Value, "Bezier track first control");
	const control2 = vector(control2Value, "Bezier track second control");
	const end = vector(endValue, "Bezier track end");
	if (!Number.isInteger(samples) || samples < 8 || samples > 256)
		throw new RangeError("Bezier arc-length tables require 8 to 256 samples");
	const measured = createLut(t => bezierPoint(start, control1, control2, end, t), samples);
	if (measured.length <= 0)
		throw new RangeError("Bezier tracks require a positive length");
	return { control1, control2, end, kind: "cubic_bezier", length: measured.length, lut: measured.lut, normal: normal && vector(normal, "Bezier track normal"), samples, schemaVersion: TRACK_GEOMETRY_SCHEMA_VERSION, start };
}

export function createLegacyPolylineTrackGeometry(pointsValue, { length } = {}) {
	if (!Array.isArray(pointsValue) || pointsValue.length < 2)
		throw new TypeError("Legacy polyline tracks require at least two points");
	const points = pointsValue.map((point, index) => vector(point, `Legacy track point ${index}`));
	const measured = createLut(t => {
		const scaled = t * (points.length - 1);
		const index = Math.min(points.length - 2, Math.floor(scaled));
		return linePoint(points[index], points[index + 1], scaled - index);
	}, Math.max(8, (points.length - 1) * 8));
	return { kind: "legacy_polyline", length: length ?? measured.length, points, schemaVersion: TRACK_GEOMETRY_SCHEMA_VERSION };
}

export function createPortalTrackGeometry({ destinationDimensionId, destinationNodeId, end: endValue, portalId, start: startValue, transitionCost = 1 }) {
	if (![destinationDimensionId, destinationNodeId, portalId].every(value => typeof value === "string" && value.length > 0))
		throw new TypeError("Portal tracks require destination dimension, node, and portal ids");
	if (!Number.isFinite(transitionCost) || transitionCost <= 0)
		throw new RangeError("Portal track transition costs must be positive");
	return {
		destinationDimensionId,
		destinationNodeId,
		end: vector(endValue, "Portal track destination"),
		kind: "portal",
		length: transitionCost,
		portalId,
		schemaVersion: TRACK_GEOMETRY_SCHEMA_VERSION,
		start: vector(startValue, "Portal track entrance")
	};
}

export function normalizeTrackGeometry(value, { end, legacyLength, start } = {}) {
	if (Array.isArray(value))
		return createLegacyPolylineTrackGeometry(value, { length: legacyLength });
	if (value === undefined)
		return createLineTrackGeometry(start, end, { length: legacyLength });
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Track geometry must be an object");
	switch (value.kind) {
		case "line": return createLineTrackGeometry(value.start ?? start, value.end ?? end, { length: value.length, normal: value.normal });
		case "cubic_bezier": return createBezierTrackGeometry(value);
		case "legacy_polyline": return createLegacyPolylineTrackGeometry(value.points, { length: value.length });
		case "portal": return createPortalTrackGeometry(value);
		default: throw new TypeError(`Unknown track geometry kind ${value.kind}`);
	}
}

export function sampleTrackGeometry(value, s) {
	const geometry = normalizeTrackGeometry(value, { end: value?.end, legacyLength: value?.length, start: value?.start });
	if (!Number.isFinite(s) || s < 0 || s > geometry.length)
		throw new RangeError("Track geometry samples must be inside the edge length");
	let location;
	let tangent;
	if (geometry.kind === "cubic_bezier") {
		const t = tForDistance(geometry.lut, geometry.length, s);
		location = bezierPoint(geometry.start, geometry.control1, geometry.control2, geometry.end, t);
		tangent = bezierTangent(geometry.start, geometry.control1, geometry.control2, geometry.end, t);
	} else if (geometry.kind === "legacy_polyline") {
		let remaining = s;
		for (let index = 1; index < geometry.points.length; index++) {
			const segmentLength = distance(geometry.points[index - 1], geometry.points[index]);
			if (remaining <= segmentLength || index === geometry.points.length - 1) {
				const ratio = segmentLength === 0 ? 0 : Math.min(1, remaining / segmentLength);
				location = linePoint(geometry.points[index - 1], geometry.points[index], ratio);
				tangent = normalize(subtract(geometry.points[index], geometry.points[index - 1]));
				break;
			}
			remaining -= segmentLength;
		}
	} else {
		const ratio = geometry.length === 0 ? 0 : s / geometry.length;
		location = linePoint(geometry.start, geometry.end, ratio);
		tangent = normalize(subtract(geometry.end, geometry.start));
	}
	return { location, normal: normalFor(tangent, geometry.normal), tangent };
}

export function persistedTrackGeometry(value) {
	const geometry = normalizeTrackGeometry(value, { end: value?.end, legacyLength: value?.length, start: value?.start });
	const persisted = clone(geometry);
	delete persisted.lut;
	return persisted;
}
