import { validateP77StaticContract } from "./p7-7-static-contract.mjs";

const report = await validateP77StaticContract();
const candidate = report.candidateId ?? "not frozen";
const platforms = report.summary.platforms
	.map(platform => `${platform.id} ${platform.passed}/${platform.applicable} passed, ${platform.failed} failed`)
	.join("; ");
console.log(`P7.7 acceptance: candidate ${candidate}; ${report.outcome}; ${platforms}.`);
