import { system } from "@minecraft/server";

import { startKernel } from "./kernel/index.js";
import { registerContraptions } from "./contraptions/contraption-runtime.js";
import { registerKinetics } from "./kinetics/kinetic-runtime.js";
import { getKineticWorldForTesting } from "./kinetics/kinetic-runtime.js";
import { registerMillstones } from "./processing/millstone-runtime.js";
import { registerMechanicalPresses } from "./processing/mechanical-press-runtime.js";
import { registerTrains } from "./trains/train-runtime.js";

registerKinetics();
registerMillstones(getKineticWorldForTesting);
registerMechanicalPresses(getKineticWorldForTesting);
registerContraptions(getKineticWorldForTesting);
registerTrains();
system.run(startKernel);
