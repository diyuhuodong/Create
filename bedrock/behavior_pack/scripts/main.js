import { system } from "@minecraft/server";

import { startKernel } from "./kernel/index.js";
import { registerContraptions } from "./contraptions/contraption-runtime.js";
import { registerKinetics } from "./kinetics/kinetic-runtime.js";
import { getKineticWorldForTesting } from "./kinetics/kinetic-runtime.js";
import { registerMillstones } from "./processing/millstone-runtime.js";
import { registerTrains } from "./trains/train-runtime.js";

registerKinetics();
registerMillstones(getKineticWorldForTesting);
registerContraptions();
registerTrains();
system.run(startKernel);
