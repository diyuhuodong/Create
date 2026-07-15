import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { REDSTONE_DEVICE_CATALOG } from "../behavior_pack/scripts/redstone/redstone-device-catalog.js";

const CONTRACT_STATUS = "implementation_complete_pending_static_validation";

function assertArray(value, label) {
	if (!Array.isArray(value) || value.length === 0)
		throw new TypeError(`S3-14 semantic contract ${label} must be a non-empty array`);
	return value;
}

function assertString(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`S3-14 semantic contract ${label} must be a non-empty string`);
	return value;
}

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

/**
 * Verifies the source-level semantic evidence for R0–R5 without treating it
 * as a substitute for Windows, Realm, or PS acceptance. Each evidence entry
 * deliberately points at stable runtime symbols rather than prose claims.
 */
export async function validateStage3RedstoneSemanticContract({ bedrockRoot, dataRoot = bedrockRoot } = {}) {
	if (!bedrockRoot)
		throw new TypeError("S3-14 semantic contract requires a Bedrock root");
	const plan = await readJson(resolve(dataRoot, "data", "s3-14-capability-plan.json"));
	if (plan.schemaVersion !== 1 || plan.planId !== "s3-14-create-semantic-completion")
		throw new Error("S3-14 semantic contract requires the semantic-completion plan");
	if (plan.developmentStatus !== CONTRACT_STATUS)
		throw new Error("S3-14 semantic contract must retain code-complete, static-validation-pending status");
	const expected = new Map(REDSTONE_DEVICE_CATALOG.map(device => [device.id, device]));
	const observed = new Set();
	let evidenceFiles = 0;
	for (const device of assertArray(plan.devices, "devices")) {
		const id = assertString(device?.id, "device id");
		const catalogDevice = expected.get(id);
		if (!catalogDevice || observed.has(id))
			throw new Error(`S3-14 semantic contract has an unknown or duplicate device ${id}`);
		observed.add(id);
		if (device.developmentStatus !== CONTRACT_STATUS)
			throw new Error(`S3-14 device ${id} must retain code-complete, static-validation-pending status`);
		if (JSON.stringify(device.acceptanceIds) !== JSON.stringify(catalogDevice.acceptanceIds))
			throw new Error(`S3-14 device ${id} does not match the redstone catalog acceptance IDs`);
		for (const evidence of assertArray(device.semanticEvidence, `device ${id} semantic evidence`)) {
			const path = assertString(evidence?.path, `device ${id} evidence path`);
			if (!path.startsWith("behavior_pack/scripts/") || path.includes(".."))
				throw new Error(`S3-14 device ${id} evidence must remain inside behavior_pack/scripts`);
			const source = await readFile(resolve(bedrockRoot, path), "utf8");
			for (const symbol of assertArray(evidence.symbols, `device ${id} evidence symbols`)) {
				assertString(symbol, `device ${id} evidence symbol`);
				if (!source.includes(symbol))
					throw new Error(`S3-14 device ${id} evidence ${path} is missing ${symbol}`);
			}
			evidenceFiles++;
		}
		const verificationBoundaries = new Set(assertArray(device.remainingVerification, `device ${id} remaining verification`));
		if (verificationBoundaries.size !== 4 || ["static_regression", "windows", "realm", "ps"].some(boundary => !verificationBoundaries.has(boundary)))
			throw new Error(`S3-14 device ${id} must retain each static and platform verification boundary`);
		for (const verification of verificationBoundaries)
			if (!["static_regression", "windows", "realm", "ps"].includes(verification))
				throw new Error(`S3-14 device ${id} has an unknown verification boundary ${verification}`);
	}
	if (observed.size !== expected.size)
		throw new Error("S3-14 semantic contract does not cover every redstone device");
	return { devices: observed.size, evidenceFiles, status: CONTRACT_STATUS };
}
