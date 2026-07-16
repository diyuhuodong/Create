export const EXPERIENCE_NUGGET = "createbedrock:experience_nugget";
export const EXPERIENCE_PER_NUGGET = 3;

export function experienceNuggetUsePlan({ count, isSneaking = false } = {}) {
	if (!Number.isInteger(count) || count < 1 || count > 64)
		throw new RangeError("Experience nugget use requires a stack count from 1 through 64");
	const consumed = isSneaking ? 1 : count;
	return {
		consumed,
		experience: EXPERIENCE_PER_NUGGET * consumed,
		remaining: count - consumed
	};
}
