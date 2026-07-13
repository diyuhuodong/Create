import { system, world } from "@minecraft/server";

import { registerDiagnosticsCommand } from "./kernel/diagnostics-runtime.js";
import { registerKernelDiagnosticProvider, startKernel } from "./kernel/index.js";
import { getContraptionDiagnostics, registerContraptions } from "./contraptions/contraption-runtime.js";
import { getKineticDiagnostics, getKineticWorldForTesting, registerKinetics } from "./kinetics/kinetic-runtime.js";
import { getLogisticsDiagnostics, registerLogistics } from "./logistics/logistics-runtime.js";
import { registerMillstones } from "./processing/millstone-runtime.js";
import { registerMechanicalPresses } from "./processing/mechanical-press-runtime.js";
import { registerCrushingWheels } from "./processing/crushing-wheel-runtime.js";
import { getTrainDiagnostics, registerTrains } from "./trains/train-runtime.js";

function storageDiagnostics() {
	return {
		dynamicPropertyBytes: typeof world.getDynamicPropertyTotalByteCount === "function"
			? world.getDynamicPropertyTotalByteCount()
			: undefined
	};
}

registerKinetics();
registerLogistics();
registerMillstones(getKineticWorldForTesting);
registerMechanicalPresses(getKineticWorldForTesting);
registerCrushingWheels(getKineticWorldForTesting);
registerContraptions(getKineticWorldForTesting);
registerTrains();
registerKernelDiagnosticProvider("kinetics", getKineticDiagnostics);
registerKernelDiagnosticProvider("logistics", getLogisticsDiagnostics);
registerKernelDiagnosticProvider("contraptions", getContraptionDiagnostics);
registerKernelDiagnosticProvider("trains", getTrainDiagnostics);
registerKernelDiagnosticProvider("storage", storageDiagnostics);
registerDiagnosticsCommand();
system.run(startKernel);
