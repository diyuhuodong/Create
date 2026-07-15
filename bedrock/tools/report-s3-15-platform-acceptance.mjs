import { validateStage3PlatformAcceptance } from "./s3-15-platform-acceptance-schema.mjs";

const report = await validateStage3PlatformAcceptance();
console.log(`S3-15 platform acceptance: ${report.acceptedPlatforms}/${report.platforms} accepted, ${report.pendingPlatforms} pending, ${report.failedPlatforms} failed; two-player ${report.stressMinutes}-minute pressure evidence is required.`);
