export const PACKAGE_RARE_CHANCE = 7500;

export const STANDARD_PACKAGE_ITEMS = Object.freeze([
	"createbedrock:cardboard_package_12x12",
	"createbedrock:cardboard_package_10x12",
	"createbedrock:cardboard_package_10x8",
	"createbedrock:cardboard_package_12x10"
]);

export const RARE_PACKAGE_ITEMS = Object.freeze([
	"createbedrock:rare_creeper_package",
	"createbedrock:rare_darcy_package",
	"createbedrock:rare_evan_package",
	"createbedrock:rare_jinx_package",
	"createbedrock:rare_kryppers_package",
	"createbedrock:rare_simi_package",
	"createbedrock:rare_starlotte_package",
	"createbedrock:rare_thunder_package",
	"createbedrock:rare_up_package",
	"createbedrock:rare_vector_package"
]);

function numericPackageId(value) {
	if (typeof value !== "string")
		throw new TypeError("Package style selection requires a package id");
	const match = /^package:(\d+)$/.exec(value);
	if (!match)
		throw new TypeError("Package style selection requires a canonical package id");
	const id = Number(match[1]);
	if (!Number.isSafeInteger(id) || id < 1)
		throw new RangeError("Package style selection requires a positive safe package id");
	return id;
}

/**
 * Java chooses a rare package with a 1/7500 chance. The Bedrock projection
 * derives that choice from the durable package id so reconnects and retries
 * cannot change the visible package item.
 */
export function packageItemForId(value) {
	const id = numericPackageId(value);
	const rare = id % PACKAGE_RARE_CHANCE === 0;
	const pool = rare ? RARE_PACKAGE_ITEMS : STANDARD_PACKAGE_ITEMS;
	return pool[(id - 1) % pool.length];
}
