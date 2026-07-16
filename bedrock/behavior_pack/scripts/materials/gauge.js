export const GAUGE_BLOCKS = Object.freeze({
	"createbedrock:speedometer": "speed",
	"createbedrock:stressometer": "stress"
});

export const GAUGE_CONFIG = Object.freeze({
	fastSpeed: 100,
	maxSpeed: 256,
	mediumSpeed: 30,
	maximumDialTarget: 1.125
});

export const GAUGE_COLOR = Object.freeze({
	IDLE: 0,
	GREEN: 1,
	YELLOW: 2,
	RED: 3
});

function clamp(value, minimum, maximum) {
	return Math.min(maximum, Math.max(minimum, value));
}

function finiteNonNegative(value, name) {
	if (!Number.isFinite(value) || value < 0)
		throw new TypeError(`${name} must be a finite non-negative number`);
	return value;
}

function lerp(progress, minimum, maximum) {
	return minimum + (maximum - minimum) * progress;
}

/** Mirrors SpeedGaugeBlockEntity#getDialTarget with Create's default kinetics configuration. */
export function speedGaugeDialTarget(speed, configuration = GAUGE_CONFIG) {
	const absoluteSpeed = finiteNonNegative(Math.abs(speed), "Gauge speed");
	const { mediumSpeed, fastSpeed, maxSpeed } = configuration;
	if (!Number.isFinite(mediumSpeed) || !Number.isFinite(fastSpeed) || !Number.isFinite(maxSpeed)
		|| mediumSpeed <= 0 || fastSpeed <= mediumSpeed || maxSpeed <= fastSpeed)
		throw new RangeError("Gauge speed thresholds must be increasing positive values");
	if (absoluteSpeed === 0)
		return 0;
	if (absoluteSpeed < mediumSpeed)
		return lerp(absoluteSpeed / mediumSpeed, 0, 0.45);
	if (absoluteSpeed < fastSpeed)
		return lerp((absoluteSpeed - mediumSpeed) / (fastSpeed - mediumSpeed), 0.45, 0.75);
	return lerp((absoluteSpeed - fastSpeed) / (maxSpeed - fastSpeed), 0.75, GAUGE_CONFIG.maximumDialTarget);
}

/** Mirrors StressGaugeBlockEntity#updateFromNetwork for the resolved Bedrock kinetic network. */
export function stressGaugeDialTarget({ overloaded = false, speed = 0, stressCapacity = 0, stressImpact = 0 } = {}) {
	finiteNonNegative(Math.abs(speed), "Gauge speed");
	finiteNonNegative(stressCapacity, "Stress capacity");
	finiteNonNegative(stressImpact, "Stress impact");
	if (speed === 0 || stressCapacity === 0)
		return 0;
	if (overloaded)
		return GAUGE_CONFIG.maximumDialTarget;
	return stressImpact / stressCapacity;
}

export function gaugeComparatorSignal(target) {
	finiteNonNegative(target, "Gauge target");
	return Math.ceil(clamp(target * 14, 0, 15));
}

/** Quantizes the smoothly animated Java dial into the 16 Bedrock block-model variants. */
export function gaugeDisplayLevel(target) {
	finiteNonNegative(target, "Gauge target");
	return Math.round(clamp(target / GAUGE_CONFIG.maximumDialTarget, 0, 1) * 15);
}

export function speedGaugeColor(speed, configuration = GAUGE_CONFIG) {
	const absoluteSpeed = finiteNonNegative(Math.abs(speed), "Gauge speed");
	if (absoluteSpeed === 0)
		return GAUGE_COLOR.IDLE;
	if (absoluteSpeed < configuration.mediumSpeed)
		return GAUGE_COLOR.GREEN;
	if (absoluteSpeed < configuration.fastSpeed)
		return GAUGE_COLOR.YELLOW;
	return GAUGE_COLOR.RED;
}

export function stressGaugeColor(target) {
	finiteNonNegative(target, "Gauge target");
	if (target === 0)
		return GAUGE_COLOR.IDLE;
	if (target < 0.5)
		return GAUGE_COLOR.GREEN;
	if (target < 1)
		return GAUGE_COLOR.YELLOW;
	return GAUGE_COLOR.RED;
}

export function gaugeReading(kind, network = {}) {
	if (kind !== "speed" && kind !== "stress")
		throw new TypeError("Gauge kind must be speed or stress");
	const speed = Number.isFinite(network.speed) ? network.speed : 0;
	const target = kind === "speed"
		? speedGaugeDialTarget(speed)
		: stressGaugeDialTarget({ ...network, speed });
	return {
		color: kind === "speed" ? speedGaugeColor(speed) : stressGaugeColor(target),
		displayLevel: gaugeDisplayLevel(target),
		signal: gaugeComparatorSignal(target),
		target
	};
}
