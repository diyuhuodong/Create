import { MachineProcessor } from "./machine-processor.js";

export class CrushingWheelMachine {
	#processor;

	constructor(recipes) {
		this.#processor = new MachineProcessor(recipes);
	}

	tryInsert(input) {
		return this.#processor.start(input);
	}

	tick(speed, random) {
		return this.#processor.tick({
			powered: speed !== 0,
			workUnits: Math.max(1, Math.floor(Math.abs(speed) / 16)),
			random
		});
	}

	snapshot() {
		return this.#processor.snapshot();
	}

	restore(snapshot) {
		this.#processor.restore(snapshot);
	}
}
