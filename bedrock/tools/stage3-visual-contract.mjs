import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { convertCrushingWheelObj, plannedGeometryIdentifiers } from "./convert-java-models.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

const TANK_SEGMENTS = ["fluid_tank", "fluid_tank_bottom", "fluid_tank_middle", "fluid_tank_top"];
const FLUID_TEXTURES = ["fluid_water.png", "fluid_lava.png"];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function assertFile(file, label) {
	try {
		await stat(file);
	} catch {
		throw new Error(`S3-13 ${label} is missing: ${file}`);
	}
}

function block(definition, name) {
	const value = definition["minecraft:block"];
	if (!value)
		throw new Error(`S3-13 ${name} is not a Bedrock block definition`);
	return value;
}

function geometryReferences(definition) {
	return JSON.stringify(definition).match(/geometry\.createbedrock\.[a-z0-9_]+/g) ?? [];
}

export async function validateStage3VisualSourceContract({ bedrockRoot = defaultBedrockRoot } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const repositoryRoot = resolve(defaultBedrockRoot, "..");
	const [crusherDefinition, beltDefinition, tankDefinition, terrain, crusherObj, converter, depotRuntime, fluidRuntime, textureGenerator] = await Promise.all([
		readJson(resolve(behaviorRoot, "blocks", "crushing_wheel.json")),
		readJson(resolve(behaviorRoot, "blocks", "belt.json")),
		readJson(resolve(behaviorRoot, "blocks", "fluid_tank.json")),
		readJson(resolve(resourceRoot, "textures", "terrain_texture.json")),
		readFile(resolve(repositoryRoot, "src/main/resources/assets/create/models/block/crushing_wheel/crushing_wheel.obj"), "utf8"),
		readFile(resolve(bedrockRoot, "tools", "convert-java-models.mjs"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "logistics", "depot-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "fluids", "fluid-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "tools", "generate-stage3-visual-textures.mjs"), "utf8")
	]);

	const crusher = block(crusherDefinition, "Crushing Wheel");
	if (crusher.components?.["minecraft:geometry"] !== "geometry.createbedrock.crushing_wheel"
		|| crusher.components?.["minecraft:item_visual"]?.geometry?.identifier !== "geometry.createbedrock.crushing_wheel")
		throw new Error("S3-13 Crushing Wheel must use its generated portable geometry for block and item visuals");
	if (JSON.stringify(crusher).includes("minecraft:geometry.full_block"))
		throw new Error("S3-13 Crushing Wheel must not retain a full-block visual fallback");
	if (typeof crusher.components?.["minecraft:loot"] !== "string")
		throw new Error("S3-13 Crushing Wheel must keep an explicit acquisition path");
	await assertFile(resolve(behaviorRoot, crusher.components["minecraft:loot"]), "Crushing Wheel loot table");
	const proxy = convertCrushingWheelObj({ identifier: "geometry.createbedrock.fixture", source: crusherObj });
	const cubes = proxy["minecraft:geometry"][0].bones[0].cubes;
	if (cubes.length < 10 || JSON.stringify(proxy).includes("poly_mesh"))
		throw new Error("S3-13 Crushing Wheel converter must emit portable cuboid geometry, not poly_mesh");
	for (const material of ["axis", "axis_top", "crushing_wheel_insert", "crushing_wheel_plates"])
		if (!JSON.stringify(crusher.components?.["minecraft:material_instances"] ?? {}).includes(`\"${material}\"`))
			throw new Error(`S3-13 Crushing Wheel is missing the ${material} material mapping`);
	if (!converter.includes("convertCrushingWheelObj") || !converter.includes("crushing_wheel/crushing_wheel.obj"))
		throw new Error("S3-13 Crushing Wheel is not sourced from the Java OBJ during build");

	const belt = block(beltDefinition, "belt");
	if (JSON.stringify((belt.description?.states ?? belt.description?.properties)?.["createbedrock:belt_segment"]) !== JSON.stringify(["single", "start", "middle", "end"]))
		throw new Error("S3-13 belt is missing durable segment visual states");
	for (const geometry of ["geometry.createbedrock.belt_start", "geometry.createbedrock.belt_end"])
		if (!geometryReferences(belt).includes(geometry))
			throw new Error(`S3-13 belt is missing ${geometry}`);
	if (!depotRuntime.includes("syncBeltSegmentsAround") || !depotRuntime.includes("beltSegmentForNeighbors"))
		throw new Error("S3-13 belt runtime does not synchronize segment visuals");

	const tank = block(tankDefinition, "Fluid Tank");
	for (const [property, values] of Object.entries({
		"createbedrock:tank_segment": ["single", "bottom", "middle", "top"],
		"createbedrock:fluid_level": [0, 1, 2, 3, 4]
	})) {
		if (JSON.stringify((tank.description?.states ?? tank.description?.properties)?.[property]) !== JSON.stringify(values))
			throw new Error(`S3-13 Fluid Tank is missing ${property}`);
	}
	const fluidKinds = (tank.description?.states ?? tank.description?.properties)?.["createbedrock:fluid_kind"];
	if (!Array.isArray(fluidKinds) || !["empty", "water", "lava"].every(kind => fluidKinds.includes(kind)))
		throw new Error("S3-13 Fluid Tank is missing its baseline fluid kinds");
	for (const geometry of ["geometry.createbedrock.fluid_tank_bottom", "geometry.createbedrock.fluid_tank_middle", "geometry.createbedrock.fluid_tank_top", "geometry.createbedrock.fluid_tank_level_4"])
		if (!geometryReferences(tank).includes(geometry))
			throw new Error(`S3-13 Fluid Tank is missing ${geometry}`);
	if (!fluidRuntime.includes("syncFluidTankVisuals") || !fluidRuntime.includes("fluidFillLevel") || !fluidRuntime.includes("tankSegmentForNeighbors"))
		throw new Error("S3-13 Fluid Tank runtime does not synchronize fill and stack visuals");
	if (!textureGenerator.includes("createFluidTile") || !textureGenerator.includes("encodePng"))
		throw new Error("S3-13 fluid texture generator is incomplete");
	for (const key of ["createbedrock_fluid_water", "createbedrock_fluid_lava", "createbedrock_crushing_wheel_insert", "createbedrock_fluid_tank_window"])
		if (typeof terrain.texture_data?.[key]?.textures !== "string")
			throw new Error(`S3-13 terrain atlas is missing ${key}`);

	return { crusherCubes: cubes.length, tankSegments: TANK_SEGMENTS.length };
}

export async function validateStage3BuiltVisualContract({ buildRoot = resolve(defaultBedrockRoot, "build") } = {}) {
	const resourceRoot = resolve(buildRoot, "resource_pack");
	for (const geometry of plannedGeometryIdentifiers()) {
		if (!geometry.startsWith("geometry.createbedrock.fluid_tank") && geometry !== "geometry.createbedrock.crushing_wheel" && !geometry.startsWith("geometry.createbedrock.belt_"))
			continue;
		const name = geometry.replace("geometry.createbedrock.", "");
		await assertFile(resolve(resourceRoot, "models", "blocks", `${name}.geo.json`), `generated geometry ${geometry}`);
	}
	for (const texture of FLUID_TEXTURES)
		await assertFile(resolve(resourceRoot, "textures", "createbedrock", "generated", texture), `generated texture ${texture}`);
	return { generatedTextures: FLUID_TEXTURES.length, tankSegments: TANK_SEGMENTS.length };
}
