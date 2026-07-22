import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DISPLAY_SOURCE_KINDS, DISPLAY_TARGET_KINDS } from "../behavior_pack/scripts/redstone/display-source.js";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relative) {
	const path = resolve(bedrockRoot, relative);
	if (!(await stat(path)).isFile())
		throw new Error(`P7.4 is missing ${relative}`);
	return readFile(path, "utf8");
}

function requires(contents, tokens, label) {
	for (const token of tokens)
		if (!contents.includes(token))
			throw new Error(`P7.4 ${label} is missing ${token}`);
}

export async function validateP74StaticContract() {
	if (DISPLAY_SOURCE_KINDS.length !== 26 || new Set(DISPLAY_SOURCE_KINDS).size !== 26 || DISPLAY_TARGET_KINDS.length !== 4)
		throw new Error("P7.4A requires 26 unique sources and four targets");
	const [sources, redstone, filters, packageLedger, packages, boiler, fluid, configuration] = await Promise.all([
		source("behavior_pack/scripts/redstone/display-world-sources.js"),
		source("behavior_pack/scripts/redstone/redstone-device-runtime.js"),
		source("behavior_pack/scripts/logistics/filter-expression.js"),
		source("behavior_pack/scripts/logistics/package-ledger.js"),
		source("behavior_pack/scripts/logistics/package-runtime.js"),
		source("behavior_pack/scripts/kinetics/boiler-controller.js"),
		source("behavior_pack/scripts/fluids/fluid-runtime.js"),
		source("behavior_pack/scripts/kernel/configuration-protocol.js")
	]);
	requires(sources, ["for (const kind of DISPLAY_SOURCE_KINDS)", "registerDisplaySourceProvider(kind", "getBoiler", "getPackage", "getTrain"], "Display Source adapters");
	requires(redstone, ["writeDisplayBoardLine", "writeWorldDisplayTarget", '"minecraft:sign"', '"minecraft:lectern"', "worldDisplayTargets"], "Display Targets");
	requires(filters, ["packages", "tags", "typeIds", "filterExpressionMatches"], "filter expressions");
	requires(packageLedger, ["beginTransfer", "completeTransfer", "abortTransfer", "receiptId"], "package ownership ledger");
	requires(packages, ["packageEndpointAccepts", "endpointOccupancy", "submitVersionedConfigurationForm", "commitReady = packageRecords.some"], "package runtime");
	requires(boiler, ["gatheredSupply", "memberWater", "waterSamples", "BOILER_SAMPLE_INTERVAL_TICKS"], "Boiler controller");
	requires(fluid, ["collectBoilerMembers", "boilerWaterSnapshot", "receiptId: `boiler:", "setExternalSource", "boilerStore"], "Boiler runtime");
	requires(configuration, ["openConfigurationFormSession", "submitVersionedConfigurationForm", "applyVersionedConfiguration"], "configuration protocol");
	return { boilerSchemas: 1, configurationSchemas: 1, displaySources: 26, displayTargets: 4, packages: 1 };
}
