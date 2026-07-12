import { system } from "@minecraft/server";

import { startKernel } from "./kernel/index.js";
import { registerKinetics } from "./kinetics/kinetic-runtime.js";
import { getKineticWorldForTesting } from "./kinetics/kinetic-runtime.js";
import { registerMillstones } from "./processing/millstone-runtime.js";

registerKinetics();
registerMillstones(getKineticWorldForTesting);
system.run(startKernel);
