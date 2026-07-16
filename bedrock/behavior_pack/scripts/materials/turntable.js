export const TURNTABLE = "createbedrock:turntable";

export function turntableRotationDelta(speed) {
	if (!Number.isFinite(speed))
		throw new TypeError("Turntable speed must be finite");
	return speed === 0 ? 0 : -(speed * 2 / 3);
}
