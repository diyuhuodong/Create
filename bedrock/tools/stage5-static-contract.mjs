import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function exists(path) { try { return (await stat(path)).isFile(); } catch { return false; } }

export async function validateStage5StaticContract({ root = bedrockRoot } = {}) {
	const matrix = JSON.parse(await readFile(resolve(root, "data", "migration-matrix.json"), "utf8"));
	const entries = matrix.entries.filter(entry => entry.phase === 5);
	if (entries.length !== 25 || entries.some(entry => entry.status !== "static_verified"))
		throw new Error("Stage 5 requires exactly 25 static-verified matrix records");
	const required = [
		"behavior_pack/scripts/trains/train-authority-state.js",
		"behavior_pack/scripts/trains/railway-control-runtime.js",
		"behavior_pack/scripts/trains/rolling-stock-runtime.js",
		"behavior_pack/scripts/logistics/package-ledger.js",
		"behavior_pack/scripts/logistics/package-runtime.js",
		"behavior_pack/blocks/controller_rail.json",
		"behavior_pack/blocks/track_signal.json",
		"behavior_pack/blocks/track_observer.json",
		"behavior_pack/blocks/small_bogey.json",
		"behavior_pack/blocks/large_bogey.json",
		"behavior_pack/blocks/fake_track.json",
		"behavior_pack/blocks/train_door.json",
		"behavior_pack/blocks/train_trapdoor.json",
		"behavior_pack/items/schedule.json",
		"behavior_pack/entities/package.json",
		"behavior_pack/items/package_filter.json",
		"behavior_pack/blocks/packager.json",
		"behavior_pack/blocks/repackager.json",
		"behavior_pack/blocks/package_frogport.json",
		"behavior_pack/blocks/package_postbox.json",
		"behavior_pack/blocks/packager_link.json",
		"behavior_pack/blocks/factory_gauge.json",
		"data/stage5-manual-coverage.json"
	];
	for (const relative of required)
		if (!await exists(resolve(root, relative)))
			throw new Error(`Stage 5 is missing ${relative}`);
	const manual = JSON.parse(await readFile(resolve(root, "data", "stage5-manual-coverage.json"), "utf8"));
	if (manual.schemaVersion !== 1 || manual.postboxFamily?.colors?.length !== 16 || manual.factoryPanel?.hostBlock !== "createbedrock:factory_gauge" || manual.bogeyFamily?.sizes?.length < 2)
		throw new Error("Stage 5 manual family coverage is incomplete");
	return { entries: entries.length, postboxColors: manual.postboxFamily.colors.length };
}
