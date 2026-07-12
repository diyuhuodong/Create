import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

// These files remain in the Java source tree.  The build only stages copies in
// the generated Bedrock pack, preserving their original provenance and license.
const TEXTURES = [
	"axis.png",
	"axis_top.png",
	"bearing_top.png",
	"cogwheel.png",
	"cogwheel_axis.png",
	"gearbox.png",
	"mechanical_bearing_side.png",
	"millstone.png",
	"standard_track.png"
];

export async function importJavaAssets(resourcePackRoot) {
	const sourceDirectory = resolve(repositoryRoot, "src/main/resources/assets/create/textures/block");
	const targetDirectory = resolve(resourcePackRoot, "textures/create_java/block");
	await mkdir(targetDirectory, { recursive: true });

	for (const texture of TEXTURES)
		await cp(resolve(sourceDirectory, texture), resolve(targetDirectory, texture));

	await writeFile(resolve(resourcePackRoot, "create-java-asset-provenance.json"), `${JSON.stringify({
		source: "src/main/resources/assets/create/textures/block",
		files: TEXTURES,
		note: "Build-time copies only. Java models require explicit Bedrock geometry conversion."
	}, null, 2)}\n`);
	return TEXTURES.length;
}
