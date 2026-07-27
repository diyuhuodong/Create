import { createHash } from "node:crypto";
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { P77_PLATFORM_IDS, validateP77ScenarioCatalog } from "./p7-7-acceptance-schema.mjs";
import { validateP77CandidateDocument } from "./p7-7-candidate-schema.mjs";

export const P77_EVIDENCE_ROOT = "work/evidence/p7-7";
const SAFE_RUN_ID = /^[a-z][a-z0-9-]{2,63}$/;
const SAFE_PATH_PART = /^[A-Za-z0-9._-]+$/;
const SENSITIVE_PATH_PART = /(?:account|credential|cookie|email|home|password|profile|secret|session|token|user)/i;
const SCRIPT_BOOT_MARKER = "[Create Bedrock] Kernel started";

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function writeJsonAtomically(file, value) {
	const temporary = `${file}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
	await rename(temporary, file);
}

function normalizedRelative(repositoryRoot, file) {
	return relative(repositoryRoot, resolve(file)).split(sep).join("/");
}

function expectedPrefix(candidateId, platformId, runId) {
	return `${P77_EVIDENCE_ROOT}/${candidateId}/${platformId}/${runId}/`;
}

export function assertP77EvidencePath(path, { candidateId, platformId, runId }) {
	if (typeof path !== "string" || path.startsWith("/") || path.includes("\\"))
		throw new Error("P7.7 evidence path must be a normalized repository-relative path");
	const prefix = expectedPrefix(candidateId, platformId, runId);
	if (!path.startsWith(prefix) || path.includes(".."))
		throw new Error(`P7.7 evidence path must remain below ${prefix}`);
	for (const part of path.slice(prefix.length).split("/"))
		if (!SAFE_PATH_PART.test(part) || SENSITIVE_PATH_PART.test(part))
			throw new Error(`P7.7 evidence path is not redacted: ${path}`);
	return path;
}

function assertRunId(runId) {
	if (typeof runId !== "string" || !SAFE_RUN_ID.test(runId))
		throw new Error("P7.7 run ID must be lowercase, stable, and safe for an evidence path");
}

export function buildP77ReportTemplate({ candidate, catalog, platformId, scenarioId, runId, createdAt = new Date().toISOString() }) {
	validateP77CandidateDocument(candidate);
	validateP77ScenarioCatalog(catalog);
	if (candidate.state !== "frozen")
		throw new Error("P7.7 reports require a frozen candidate");
	if (!P77_PLATFORM_IDS.includes(platformId))
		throw new Error(`P7.7 unknown platform ${platformId}`);
	assertRunId(runId);
	const scenario = catalog.scenarios.find(entry => entry.id === scenarioId);
	if (!scenario || scenario.applicability[platformId] === "not_applicable")
		throw new Error(`P7.7 scenario ${scenarioId} is unavailable on ${platformId}`);
	return {
		runId,
		candidateId: candidate.candidateId,
		platformId,
		scenarioId,
		state: "pending",
		createdAt,
		startedAt: null,
		endedAt: null,
		bedrockVersion: null,
		device: null,
		inputMode: null,
		accountAliases: [],
		worldSeed: null,
		realmSlot: platformId === "windows_bedrock" ? null : "replace-with-sanitized-slot-alias",
		playerCount: scenario.minimumPlayers ?? 1,
		durationMinutes: scenario.minimumDurationMinutes ?? 0,
		steps: [...scenario.assertions],
		expected: scenario.assertions.join(" "),
		observed: null,
		reportPath: `${expectedPrefix(candidate.candidateId, platformId, runId)}report.json`,
		evidence: [],
		diagnostics: { before: null, after: null },
		metrics: {},
		issue: null
	};
}

async function evidenceFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await evidenceFiles(file));
		else if (entry.isFile() && entry.name !== "report.json" && entry.name !== "files.sha256")
			files.push(file);
	}
	return files.sort((left, right) => left.localeCompare(right));
}

export async function sha256File(file) {
	return createHash("sha256").update(await readFile(file)).digest("hex");
}

/** Hash every non-report artifact below a sanitized report directory and refresh files.sha256. */
export async function collectP77Evidence({ reportFile, repositoryRoot }) {
	const report = await json(reportFile);
	assertRunId(report.runId);
	const reportPath = normalizedRelative(repositoryRoot, reportFile);
	const prefix = expectedPrefix(report.candidateId, report.platformId, report.runId);
	if (report.reportPath !== reportPath || reportPath !== `${prefix}report.json`)
		throw new Error(`P7.7 report must live at ${prefix}report.json`);
	const directory = dirname(reportFile);
	const files = await evidenceFiles(directory);
	if (files.length === 0)
		throw new Error("P7.7 evidence collection requires at least one observation file");
	const evidence = [];
	for (const file of files) {
		const path = normalizedRelative(repositoryRoot, file);
		assertP77EvidencePath(path, report);
		evidence.push({ path, sha256: await sha256File(file) });
	}
	const next = { ...report, evidence };
	await writeJsonAtomically(reportFile, next);
	const index = evidence.map(entry => `${entry.sha256}  ${entry.path}`).join("\n");
	await writeFile(resolve(directory, "files.sha256"), `${index}\n`);
	return { files: evidence.length, evidence, report: next };
}

export function parseP77ContentLog(contents, { warningAllowlist = [] } = {}) {
	if (!Array.isArray(warningAllowlist) || warningAllowlist.some(entry => typeof entry !== "string" || entry.length === 0))
		throw new Error("P7.7 Content Log warning allowlist must be an array of non-empty fragments");
	const lines = contents.split(/\r?\n/).filter(Boolean);
	const errors = lines.filter(line => /(?:^|\b)(?:error|exception|stack trace)(?:\b|:)/i.test(line));
	const warnings = lines.filter(line => /(?:^|\b)(?:warn|warning)(?:\b|:)/i.test(line));
	const unallowlistedWarnings = warnings.filter(line => !warningAllowlist.some(fragment => line.includes(fragment)));
	return {
		scriptBootMarkerCount: lines.filter(line => line.includes(SCRIPT_BOOT_MARKER)).length,
		contentLogErrorCount: errors.length,
		contentLogWarningCount: warnings.length,
		warningsAllowlisted: warnings.length === 0 || unallowlistedWarnings.length === 0,
		unallowlistedWarnings
	};
}

/** Parse a copied Content Log that is itself stored in the run's evidence directory. */
export async function applyP77ContentLog({ reportFile, logFile, repositoryRoot, warningAllowlist = [] }) {
	const report = await json(reportFile);
	const logPath = normalizedRelative(repositoryRoot, logFile);
	assertP77EvidencePath(logPath, report);
	if (!(await stat(logFile)).isFile())
		throw new Error(`P7.7 Content Log is not a file: ${logPath}`);
	const metrics = parseP77ContentLog(await readFile(logFile, "utf8"), { warningAllowlist });
	const next = {
		...report,
		metrics: { ...report.metrics, ...metrics },
		diagnostics: {
			...report.diagnostics,
			after: `Content Log ${logPath}: ${metrics.contentLogErrorCount} errors, ${metrics.contentLogWarningCount} warnings, ${metrics.scriptBootMarkerCount} boot markers.`
		}
	};
	await writeJsonAtomically(reportFile, next);
	return { ...metrics, report: next };
}
