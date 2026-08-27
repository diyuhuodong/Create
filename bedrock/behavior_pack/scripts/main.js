import { system, world } from "@minecraft/server";

import { registerDiagnosticsCommand } from "./kernel/diagnostics-runtime.js";
import { getKernelDiagnostics, registerKernelDiagnosticProvider, startKernel } from "./kernel/index.js";
import { getAcceptanceWorldDiagnostics, registerAcceptanceWorld } from "./acceptance/acceptance-world-runtime.js";
import { getContraptionDiagnostics, registerContraptions } from "./contraptions/contraption-runtime.js";
import { getLinearActuatorDiagnostics, registerLinearActuators } from "./contraptions/linear-actuator-runtime.js";
import { getContraptionActorDiagnostics, registerContraptionActors } from "./contraptions/contraption-actors-runtime.js";
import { getChassisDiagnostics, registerChassis } from "./contraptions/chassis-runtime.js";
import { getSuperGlueDiagnostics, registerSuperGlue } from "./contraptions/super-glue-runtime.js";
import { getStickerDiagnostics, registerStickers } from "./contraptions/sticker-runtime.js";
import { getClipboardDiagnostics, registerClipboards } from "./schematics/clipboard-runtime.js";
import { getSchematicDiagnostics, registerSchematics } from "./schematics/schematic-runtime.js";
import { getSymmetryDiagnostics, registerSymmetryWand } from "./schematics/symmetry-runtime.js";
import { getElevatorContactDiagnostics, registerElevatorContacts } from "./contraptions/elevator-contact-runtime.js";
import { getKineticDiagnostics, getKineticWorldForTesting, registerKinetics } from "./kinetics/kinetic-runtime.js";
import { getKineticVisualDiagnostics, registerKineticVisuals } from "./kinetics/kinetic-visual-runtime.js";
import { getEquipmentDiagnostics, registerEquipment } from "./equipment/equipment-runtime.js";
import { getLogisticsDiagnostics, registerLogistics } from "./logistics/logistics-runtime.js";
import { getExternalEscrowDiagnostics, registerExternalEscrowTransfers } from "./logistics/external-escrow-runtime.js";
import { getDepotDiagnostics, registerDepots } from "./logistics/depot-runtime.js";
import { getPackageDiagnostics, registerPackages } from "./logistics/package-runtime.js";
import { getFluidDiagnostics, registerFluids } from "./fluids/fluid-runtime.js";
import { getRedstoneDiagnostics, registerRedstone } from "./redstone/redstone-runtime.js";
import { getRedstoneDeviceDiagnostics, registerRedstoneDevices } from "./redstone/redstone-device-runtime.js";
import { registerMillstones } from "./processing/millstone-runtime.js";
import { registerMechanicalPresses } from "./processing/mechanical-press-runtime.js";
import { registerCrushingWheels } from "./processing/crushing-wheel-runtime.js";
import { getMechanicalCrafterDiagnostics, registerMechanicalCrafters } from "./processing/mechanical-crafter-runtime.js";
import { getStage3ProcessingDiagnostics, registerStage3Processing } from "./processing/stage3-processing-runtime.js";
import { getInteractionProcessingDiagnostics, registerInteractionProcessing } from "./processing/interaction-processing-runtime.js";
import { getCookingParityDiagnostics, registerCookingParity } from "./processing/cooking-parity-runtime.js";
import { getSequencedAssemblyDiagnostics, registerSequencedAssembly } from "./processing/sequenced-assembly-runtime.js";
import { getTrainDiagnostics, registerTrains } from "./trains/train-runtime.js";
import { getRailwayControlDiagnostics, registerRailwayControls } from "./trains/railway-control-runtime.js";
import { getRollingStockDiagnostics, registerRollingStock } from "./trains/rolling-stock-runtime.js";
import { getMinecartContraptionDiagnostics, registerMinecartContraptions } from "./trains/minecart-contraption-runtime.js";
import { getBoundCardboardDiagnostics, registerBoundCardboard } from "./materials/bound-cardboard-runtime.js";
import { getBuildersTeaDiagnostics, registerBuildersTea } from "./materials/builders-tea-runtime.js";
import { getCasingApplicationDiagnostics, registerCasingApplications } from "./materials/casing-application-runtime.js";
import { getGuidanceDiagnostics, registerGuidance } from "./guidance/guidance-runtime.js";

import { getBlazeBurnerDiagnostics, registerBlazeBurners } from "./materials/blaze-burner-runtime.js";

import { getCardboardEquipmentDiagnostics, registerCardboardEquipment } from "./materials/cardboard-equipment-runtime.js";
import { getCopycatDiagnostics, registerCopycats } from "./materials/copycat-runtime.js";
import { getBellDiagnostics, registerBells } from "./materials/bell-runtime.js";
import { getCuckooClockDiagnostics, registerCuckooClocks } from "./materials/cuckoo-clock-runtime.js";
import { getDeskBellDiagnostics, registerDeskBell } from "./materials/desk-bell-runtime.js";
import { getDisplayBoardDiagnostics, registerDisplayBoards } from "./materials/display-board-runtime.js";
import { getExperienceBlockParticleDiagnostics, registerExperienceBlockParticles } from "./materials/experience-block-particle-runtime.js";
import { getExperienceNuggetDiagnostics, registerExperienceNugget } from "./materials/experience-nugget-runtime.js";
import { getFramedGlassTrapdoorDiagnostics, registerFramedGlassTrapdoor } from "./materials/framed-glass-trapdoor-runtime.js";
import { getGirderDiagnostics, registerGirders } from "./materials/girder-runtime.js";
import { getGaugeDiagnostics, registerGauges } from "./materials/gauge-runtime.js";
import { getLegacyMaterialsDiagnostics, registerLegacyMaterials } from "./materials/legacy-materials-runtime.js";
import { getNozzleDiagnostics, registerNozzles } from "./materials/nozzle-runtime.js";
import { getPlacardDiagnostics, registerPlacards } from "./materials/placard-runtime.js";
import { getPotatoProjectileDiagnostics, registerPotatoProjectiles } from "./materials/potato-projectile-runtime.js";
import { getRoseQuartzLampDiagnostics, registerRoseQuartzLamp } from "./materials/rose-quartz-lamp-runtime.js";
import { getSandpaperDiagnostics, registerSandpaper } from "./materials/sandpaper-runtime.js";
import { getSlidingDoorDiagnostics, registerSlidingDoors } from "./materials/sliding-door-runtime.js";
import { getStockpileSwitchDiagnostics, registerStockpileSwitch } from "./materials/stockpile-switch-runtime.js";
import { getStockTickerDiagnostics, registerStockTickers } from "./materials/stock-ticker-runtime.js";
import { getSteamWhistleDiagnostics, registerSteamWhistles } from "./materials/steam-whistle-runtime.js";
import { getTurntableDiagnostics, registerTurntable } from "./materials/turntable-runtime.js";
import { getTableClothDiagnostics, registerTableCloths } from "./materials/table-cloth-runtime.js";
import { getTreeFertilizerDiagnostics, registerTreeFertilizer } from "./materials/tree-fertilizer-runtime.js";
import { getVerticalMobilityDiagnostics, registerVerticalMobility } from "./materials/vertical-mobility-runtime.js";
import { getWorldshaperDiagnostics, registerWorldshaper } from "./materials/worldshaper-runtime.js";

function storageDiagnostics() {
	return {
		dynamicPropertyBytes: typeof world.getDynamicPropertyTotalByteCount === "function"
			? world.getDynamicPropertyTotalByteCount()
			: undefined
	};
}

registerKinetics();
registerKineticVisuals(getKineticWorldForTesting());
registerEquipment();
registerLogistics();
registerExternalEscrowTransfers();
registerDepots();
registerPackages();
registerFluids(getKineticWorldForTesting);
registerMillstones(getKineticWorldForTesting);
registerMechanicalPresses(getKineticWorldForTesting);
registerCrushingWheels(getKineticWorldForTesting);
registerMechanicalCrafters(getKineticWorldForTesting);
registerStage3Processing(getKineticWorldForTesting);
registerInteractionProcessing(getKineticWorldForTesting);
registerCookingParity();
registerSequencedAssembly();
registerRedstone();
registerRedstoneDevices();
registerElevatorContacts();
registerContraptionActors();
registerContraptions(getKineticWorldForTesting);
registerMinecartContraptions();
registerLinearActuators(getKineticWorldForTesting);
registerChassis();
registerStickers();
registerSuperGlue();
registerClipboards();
registerSchematics();
registerSymmetryWand();
registerTrains();
registerRailwayControls();
registerRollingStock();
registerBoundCardboard();
registerBuildersTea();
registerCasingApplications();
registerGuidance();
registerAcceptanceWorld({
	providers: {
		contraptions: getContraptionDiagnostics,
		fluids: getFluidDiagnostics,
		kernel: getKernelDiagnostics,
		kinetics: () => ({ ...getKineticDiagnostics(), visuals: getKineticVisualDiagnostics() }),
		logistics: () => ({ packages: getPackageDiagnostics(), runtime: getLogisticsDiagnostics() }),
		processing: () => ({ ...getStage3ProcessingDiagnostics(), sequencedAssembly: getSequencedAssemblyDiagnostics() }),
		trains: getTrainDiagnostics
	}
});
registerBlazeBurners();
registerCardboardEquipment();
registerCopycats();
registerBells();
registerCuckooClocks(getKineticWorldForTesting());
registerDeskBell();
registerDisplayBoards(getKineticWorldForTesting());
registerExperienceBlockParticles();
registerExperienceNugget();
registerFramedGlassTrapdoor();
registerGirders();
registerGauges(getKineticWorldForTesting());
registerLegacyMaterials();
registerNozzles();
registerPlacards();
registerPotatoProjectiles();
registerRoseQuartzLamp();
registerSandpaper();
registerSlidingDoors();
registerStockpileSwitch();
registerStockTickers();
registerSteamWhistles();
registerTurntable();
registerTableCloths();
registerTreeFertilizer();
registerVerticalMobility();
registerWorldshaper();
registerKernelDiagnosticProvider("kinetics", getKineticDiagnostics);
registerKernelDiagnosticProvider("kineticVisuals", getKineticVisualDiagnostics);
registerKernelDiagnosticProvider("equipment", getEquipmentDiagnostics);
registerKernelDiagnosticProvider("logistics", getLogisticsDiagnostics);
registerKernelDiagnosticProvider("externalEscrow", getExternalEscrowDiagnostics);
registerKernelDiagnosticProvider("depots", getDepotDiagnostics);
registerKernelDiagnosticProvider("packages", getPackageDiagnostics);
registerKernelDiagnosticProvider("fluids", getFluidDiagnostics);
registerKernelDiagnosticProvider("processing", getStage3ProcessingDiagnostics);
registerKernelDiagnosticProvider("interactionProcessing", getInteractionProcessingDiagnostics);
registerKernelDiagnosticProvider("cookingParity", getCookingParityDiagnostics);
registerKernelDiagnosticProvider("mechanicalCrafters", getMechanicalCrafterDiagnostics);
registerKernelDiagnosticProvider("redstone", getRedstoneDiagnostics);
registerKernelDiagnosticProvider("redstoneDevices", getRedstoneDeviceDiagnostics);
registerKernelDiagnosticProvider("contraptions", getContraptionDiagnostics);
registerKernelDiagnosticProvider("linearActuators", getLinearActuatorDiagnostics);
registerKernelDiagnosticProvider("contraptionActors", getContraptionActorDiagnostics);
registerKernelDiagnosticProvider("chassis", getChassisDiagnostics);
registerKernelDiagnosticProvider("superGlue", getSuperGlueDiagnostics);
registerKernelDiagnosticProvider("stickers", getStickerDiagnostics);
registerKernelDiagnosticProvider("clipboard", getClipboardDiagnostics);
registerKernelDiagnosticProvider("schematics", getSchematicDiagnostics);
registerKernelDiagnosticProvider("symmetry", getSymmetryDiagnostics);
registerKernelDiagnosticProvider("elevatorContacts", getElevatorContactDiagnostics);
registerKernelDiagnosticProvider("trains", getTrainDiagnostics);
registerKernelDiagnosticProvider("railwayControls", getRailwayControlDiagnostics);
registerKernelDiagnosticProvider("rollingStock", getRollingStockDiagnostics);
registerKernelDiagnosticProvider("minecartContraptions", getMinecartContraptionDiagnostics);
registerKernelDiagnosticProvider("boundCardboard", getBoundCardboardDiagnostics);
registerKernelDiagnosticProvider("buildersTea", getBuildersTeaDiagnostics);
registerKernelDiagnosticProvider("casingApplications", getCasingApplicationDiagnostics);
registerKernelDiagnosticProvider("guidance", getGuidanceDiagnostics);
registerKernelDiagnosticProvider("blazeBurner", getBlazeBurnerDiagnostics);
registerKernelDiagnosticProvider("cardboardEquipment", getCardboardEquipmentDiagnostics);
registerKernelDiagnosticProvider("copycats", getCopycatDiagnostics);
registerKernelDiagnosticProvider("bells", getBellDiagnostics);
registerKernelDiagnosticProvider("cuckooClocks", getCuckooClockDiagnostics);
registerKernelDiagnosticProvider("deskBell", getDeskBellDiagnostics);
registerKernelDiagnosticProvider("displayBoards", getDisplayBoardDiagnostics);
registerKernelDiagnosticProvider("experienceBlockParticles", getExperienceBlockParticleDiagnostics);
registerKernelDiagnosticProvider("experienceNugget", getExperienceNuggetDiagnostics);
registerKernelDiagnosticProvider("framedGlassTrapdoor", getFramedGlassTrapdoorDiagnostics);
registerKernelDiagnosticProvider("girders", getGirderDiagnostics);
registerKernelDiagnosticProvider("gauges", getGaugeDiagnostics);
registerKernelDiagnosticProvider("legacyMaterials", getLegacyMaterialsDiagnostics);
registerKernelDiagnosticProvider("nozzles", getNozzleDiagnostics);
registerKernelDiagnosticProvider("placards", getPlacardDiagnostics);
registerKernelDiagnosticProvider("potatoProjectiles", getPotatoProjectileDiagnostics);
registerKernelDiagnosticProvider("roseQuartzLamp", getRoseQuartzLampDiagnostics);
registerKernelDiagnosticProvider("sandpaper", getSandpaperDiagnostics);
registerKernelDiagnosticProvider("slidingDoors", getSlidingDoorDiagnostics);
registerKernelDiagnosticProvider("stockpileSwitch", getStockpileSwitchDiagnostics);
registerKernelDiagnosticProvider("stockTicker", getStockTickerDiagnostics);
registerKernelDiagnosticProvider("steamWhistles", getSteamWhistleDiagnostics);
registerKernelDiagnosticProvider("turntable", getTurntableDiagnostics);
registerKernelDiagnosticProvider("tableCloth", getTableClothDiagnostics);
registerKernelDiagnosticProvider("treeFertilizer", getTreeFertilizerDiagnostics);
registerKernelDiagnosticProvider("verticalMobility", getVerticalMobilityDiagnostics);
registerKernelDiagnosticProvider("worldshaper", getWorldshaperDiagnostics);
registerKernelDiagnosticProvider("storage", storageDiagnostics);
registerKernelDiagnosticProvider("acceptanceWorld", getAcceptanceWorldDiagnostics);
registerDiagnosticsCommand();
system.run(startKernel);
