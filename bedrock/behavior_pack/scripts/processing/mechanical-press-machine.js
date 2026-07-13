import { ProcessingMachine } from "./processing-machine.js";

export class MechanicalPressMachine extends ProcessingMachine {
	constructor(recipes, options) {
		super(recipes, options);
	}

	tick(speed) {
		return super.tick({
			powered: speed !== 0,
			workUnits: Math.max(1, Math.floor(Math.abs(speed) / 16))
		});
	}
}
