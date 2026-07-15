import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { allRedstoneAcceptanceIds } from "../behavior_pack/scripts/redstone/redstone-device-catalog.js";

const PACKAGE_IDS = ["R0", "R1", "R2", "R3", "R4", "R5", "R6"];
const DEVELOPMENT_STATUS = "implementation_complete_pending_static_validation";

function assertArray(value, label) {
	if (!Array.isArray(value) || value.length === 0)
		throw new TypeError(`S3-14 capability plan ${label} must be a non-empty array`);
	return value;
}

function assertString(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`S3-14 capability plan ${label} must be a non-empty string`);
	return value;
}

async function mustExist(path, label) {
	try {
		await access(path);
	} catch {
		throw new Error(`S3-14 capability plan ${label} is missing: ${path}`);
	}
}

export async function validateS314CapabilityPlan({ dataPath, repositoryRoot = resolve(import.meta.dirname, "..", "..") } = {}) {
	if (!dataPath)
		throw new TypeError("S3-14 capability plan validation requires a data path");
	const plan = JSON.parse(await readFile(dataPath, "utf8"));
	if (plan.schemaVersion !== 1 || plan.planId !== "s3-14-create-semantic-completion")
		throw new Error("S3-14 capability plan must use the semantic-completion schema");
	if (plan.developmentStatus !== DEVELOPMENT_STATUS)
		throw new Error("S3-14 capability plan must distinguish completed code from pending validation");
	const completionGate = assertArray(plan.completionGate, "completion gate");
	if (new Set(completionGate).size !== completionGate.length)
		throw new Error("S3-14 capability plan completion gates must be unique");
	if (!Array.isArray(plan.packages) || plan.packages.length !== PACKAGE_IDS.length)
		throw new Error("S3-14 capability plan must declare R0 through R6 exactly once");
	const packages = new Map();
	for (const entry of plan.packages) {
		assertString(entry?.id, "package id");
		assertString(entry?.objective, `package ${entry.id} objective`);
		if (!PACKAGE_IDS.includes(entry.id) || packages.has(entry.id))
			throw new Error(`S3-14 capability plan has an invalid package ${entry.id}`);
		const dependencies = entry.dependsOn ?? [];
		if (!Array.isArray(dependencies) || dependencies.some(dependency => !packages.has(dependency)))
			throw new Error(`S3-14 package ${entry.id} must depend only on earlier packages`);
		packages.set(entry.id, entry);
	}
	const expectedAcceptanceIds = new Set(allRedstoneAcceptanceIds());
	const plannedAcceptanceIds = new Set();
	const deviceIds = new Set();
	for (const device of assertArray(plan.devices, "devices")) {
		const id = assertString(device?.id, "device id");
		if (deviceIds.has(id))
			throw new Error(`S3-14 capability plan duplicates device ${id}`);
		deviceIds.add(id);
		assertString(device.currentBoundary, `device ${id} current boundary`);
		if (device.developmentStatus !== DEVELOPMENT_STATUS)
			throw new Error(`S3-14 device ${id} must distinguish completed code from pending validation`);
		for (const packageId of assertArray(device.targetPackages, `device ${id} packages`))
			if (!packages.has(packageId))
				throw new Error(`S3-14 device ${id} references unknown package ${packageId}`);
		if (device.targetPackages[0] !== "R0" || device.targetPackages.at(-1) !== "R6")
			throw new Error(`S3-14 device ${id} must start at R0 and finish with R6 evidence`);
		assertArray(device.staticGates, `device ${id} static gates`);
		assertArray(device.platformScenarios, `device ${id} platform scenarios`);
		for (const evidence of assertArray(device.semanticEvidence, `device ${id} semantic evidence`)) {
			assertString(evidence?.path, `device ${id} semantic evidence path`);
			for (const symbol of assertArray(evidence.symbols, `device ${id} semantic evidence symbols`))
				assertString(symbol, `device ${id} semantic evidence symbol`);
		}
		const remainingVerification = assertArray(device.remainingVerification, `device ${id} remaining verification`);
		if (!remainingVerification.includes("static_regression") || !remainingVerification.includes("windows")
			|| !remainingVerification.includes("realm") || !remainingVerification.includes("ps"))
			throw new Error(`S3-14 device ${id} must retain static and platform verification boundaries`);
		for (const testPath of assertArray(device.staticTestPaths, `device ${id} static tests`)) {
			assertString(testPath, `device ${id} static test path`);
			await mustExist(resolve(repositoryRoot, testPath), `device ${id} static test`);
		}
		for (const evidencePath of assertArray(device.javaEvidencePaths, `device ${id} Java evidence`)) {
			assertString(evidencePath, `device ${id} Java evidence path`);
			await mustExist(resolve(repositoryRoot, evidencePath), `device ${id} Java evidence`);
		}
		for (const acceptanceId of assertArray(device.acceptanceIds, `device ${id} acceptance ids`)) {
			if (!expectedAcceptanceIds.has(acceptanceId) || plannedAcceptanceIds.has(acceptanceId))
				throw new Error(`S3-14 capability plan has an unknown or duplicate acceptance ID ${acceptanceId}`);
			plannedAcceptanceIds.add(acceptanceId);
		}
	}
	if (plannedAcceptanceIds.size !== expectedAcceptanceIds.size)
		throw new Error("S3-14 capability plan does not cover every redstone acceptance ID");
	return { devices: deviceIds.size, acceptanceIds: plannedAcceptanceIds.size, packages: packages.size };
}
