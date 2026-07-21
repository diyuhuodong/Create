import { cloneFluidStack } from "./fluid-stack.js";
import { fluidMatchesRequirement } from "./fluid-registry.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertPort(port, name) {
	if (!port || typeof port.id !== "string" || typeof port.reserve !== "function" || typeof port.extract !== "function" || typeof port.insert !== "function")
		throw new TypeError(`Fluid ledger ${name} ports require stable transactional fluid-port methods`);
	return port;
}

function normalizeInput(input) {
	if (!input || !Number.isSafeInteger(input.amount) || input.amount < 1)
		throw new TypeError("Fluid ledger inputs require a positive amount");
	return { amount: input.amount, requirement: input.requirement ?? input.typeId ?? input.tag };
}

function normalizeOutput(output) {
	if (!output?.fluid)
		throw new TypeError("Fluid ledger outputs require a fluid stack");
	return { fluid: cloneFluidStack(output.fluid) };
}

function portFrom(ports, id) {
	const port = typeof ports === "function" ? ports(id) : ports?.get?.(id) ?? ports?.[id];
	return assertPort(port, "restored");
}

/**
 * Persistent, receipt-based fluid consumption and output settlement. Input is
 * moved to ledger escrow once; output is retried after a full destination or a
 * restart without consuming the ingredients again. It is deliberately small
 * enough to be shared by Basin, Spout, Drain and scripted interactions.
 */
export class FluidLedger {
	#operations = new Map();

	begin({ id, inputs, outputs }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Fluid ledger operations require stable identifiers");
		const existing = this.#operations.get(id);
		if (existing)
			return clone(existing);
		if (!Array.isArray(inputs) || !Array.isArray(outputs))
			throw new TypeError("Fluid ledger operations require input and output arrays");
		if (inputs.length === 0 && outputs.length === 0)
			throw new TypeError("Fluid ledger operations require an input or output");

		const plannedInputs = inputs.map(input => ({ ...normalizeInput(input), port: assertPort(input.port, "input") }));
		const plannedOutputs = outputs.map(output => ({ ...normalizeOutput(output), port: assertPort(output.port, "output") }));
		const reservations = plannedInputs.map(input => {
			const reservation = input.port.reserve({
				maxAmount: input.amount,
				predicate: fluid => fluidMatchesRequirement(fluid, input.requirement)
			});
			if (!reservation || reservation.fluid.amount < input.amount)
				return undefined;
			return { input, reservation };
		});
		if (reservations.some(reservation => !reservation))
			return { id, ok: false, reason: "input_unavailable" };

		const escrow = [];
		try {
			for (let index = 0; index < reservations.length; index++) {
				const { input, reservation } = reservations[index];
				const fluid = input.port.extract(reservation, { receiptId: `${id}:input:${index}` });
				if (fluid.amount !== input.amount || !fluidMatchesRequirement(fluid, input.requirement))
					throw new Error("Fluid ledger extraction differs from its input plan");
				escrow.push({ fluid: cloneFluidStack(fluid), portId: input.port.id });
			}
		} catch (error) {
			for (const entry of escrow.reverse()) {
				const source = plannedInputs.find(input => input.port.id === entry.portId)?.port;
				if (source)
					source.insert(entry.fluid, { receiptId: `${id}:rollback:${entry.portId}` });
			}
			return { error, id, ok: false, reason: "input_changed" };
		}

		const operation = {
			escrow,
			id,
			outputs: plannedOutputs.map(output => ({ acceptedAmount: 0, fluid: output.fluid, nextAttempt: 0, portId: output.port.id })),
			state: "escrowed"
		};
		this.#operations.set(id, operation);
		return { id, ok: true, state: operation.state };
	}

	inspect(id) {
		const operation = this.#operations.get(id);
		return operation && clone(operation);
	}

	settle(id, ports) {
		const operation = this.#operations.get(id);
		if (!operation)
			return { id, ok: false, reason: "unknown_operation" };
		if (operation.state === "committed")
			return { id, ok: true, state: "committed" };
		for (let index = 0; index < operation.outputs.length; index++) {
			const output = operation.outputs[index];
			const remaining = output.fluid.amount - output.acceptedAmount;
			if (remaining === 0)
				continue;
			const port = portFrom(ports, output.portId);
			const requested = { ...output.fluid, amount: remaining };
			const result = port.insert(requested, { receiptId: `${id}:output:${index}:${output.nextAttempt}` });
			const accepted = result.accepted?.amount ?? 0;
			if (accepted > 0)
				output.acceptedAmount += accepted;
			output.nextAttempt++;
			if (accepted !== remaining || result.remainder !== undefined)
				return { id, ok: false, reason: "output_blocked", state: "escrowed" };
		}
		operation.state = "committed";
		return { id, ok: true, state: operation.state };
	}

	restore(snapshot) {
		if (!Array.isArray(snapshot))
			throw new TypeError("Fluid ledger snapshots require operation arrays");
		this.#operations = new Map();
		for (const record of snapshot) {
			if (!record || typeof record.id !== "string" || !["escrowed", "committed"].includes(record.state) || !Array.isArray(record.escrow) || !Array.isArray(record.outputs))
				throw new TypeError("Fluid ledger snapshot contains an invalid operation");
			this.#operations.set(record.id, {
				escrow: record.escrow.map(entry => ({ fluid: cloneFluidStack(entry.fluid), portId: entry.portId })),
				id: record.id,
			outputs: record.outputs.map(entry => ({
				acceptedAmount: entry.acceptedAmount ?? 0,
				fluid: cloneFluidStack(entry.fluid),
				nextAttempt: entry.nextAttempt ?? 0,
				portId: entry.portId
			})),
				state: record.state
			});
		}
	}

	snapshot() {
		return [...this.#operations.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id));
	}
}
