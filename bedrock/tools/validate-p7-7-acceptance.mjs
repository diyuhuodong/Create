import { validateP77StaticContract } from "./p7-7-static-contract.mjs";

const report = await validateP77StaticContract();
console.log(`P7.7 contract valid: ${report.scenarios} scenarios, ${report.applicableChecks} applicable platform checks, ${report.runs} recorded runs, outcome ${report.outcome}.`);
