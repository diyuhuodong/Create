import { DISPLAY_SOURCE_KINDS, registerDisplaySourceProvider } from "./display-source.js";

function blockAt(world, dimensionId, location) {
	try { return world.getDimension(dimensionId).getBlock(location); } catch { return undefined; }
}

function nonEmpty(lines, fallback = "") {
	return Array.isArray(lines) && lines.length > 0 ? lines : [fallback];
}

function inventoryStacks(block) {
	const container = block?.getComponent?.("minecraft:inventory")?.container;
	if (!container)
		return [];
	const stacks = [];
	for (let slot = 0; slot < container.size; slot++) {
		const stack = container.getItem(slot);
		if (stack)
			stacks.push({ amount: stack.amount, name: stack.nameTag || stack.typeId, typeId: stack.typeId });
	}
	return stacks;
}

function itemCounts(stacks) {
	const counts = new Map();
	for (const stack of stacks)
		counts.set(stack.name, (counts.get(stack.name) ?? 0) + stack.amount);
	return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function blockState(block, names, fallback = 0) {
	const states = block?.permutation?.getAllStates?.() ?? {};
	for (const name of names)
		if (states[name] !== undefined)
			return states[name];
	return fallback;
}

function scoreboardLines(world, objectiveName) {
	try {
		const objective = world.scoreboard?.getObjective(objectiveName);
		return objective?.getScores?.().sort((left, right) => right.score - left.score)
			.slice(0, 16).map(entry => `${entry.participant.displayName}: ${entry.score}`) ?? [];
	} catch { return []; }
}

/** Register every Java Display Source kind against a server-authoritative
 * Bedrock reader. Domain callbacks expose only stable snapshots, preserving
 * ownership of boiler, package, train, fluid, and kinetic state. */
export function registerWorldDisplaySourceProviders({ getBoiler, getFluid, getPackage, getTrain, kineticNetwork, kineticSpeed, readNixie, world }) {
	if (!world)
		throw new TypeError("Display Source adapters require a world");
	const provider = {
		death_count: () => nonEmpty(scoreboardLines(world, "deathCount").length ? scoreboardLines(world, "deathCount") : scoreboardLines(world, "deaths"), "0"),
		scoreboard: ({ context }) => nonEmpty(scoreboardLines(world, context.record.configuration.settings.scoreboardObjective ?? "create")),
		enchant_power: ({ context, location }) => {
			const dimension = world.getDimension(context.record.dimensionId); let count = 0;
			for (let x = -2; x <= 2; x++) for (let y = -1; y <= 2; y++) for (let z = -2; z <= 2; z++)
				if (Math.max(Math.abs(x), Math.abs(z)) === 2 && dimension.getBlock({ x: location.x + x, y: location.y + y, z: location.z + z })?.typeId === "minecraft:bookshelf") count++;
			return [String(Math.min(15, count))];
		},
		redstone_power: ({ context, location }) => [String(blockState(blockAt(world, context.record.dimensionId, location), ["createbedrock:signal", "createbedrock:powered", "minecraft:redstone_signal"]))],
		nixie_tube: ({ context, location }) => nonEmpty(readNixie?.(context.record.dimensionId, location)),
		item_names: ({ context, location }) => [inventoryStacks(blockAt(world, context.record.dimensionId, location)).map(stack => stack.name).join(" ")],
		boiler: ({ context, location }) => {
			const state = getBoiler?.(context.record.dimensionId, location); return state ? [`Level ${state.heatLevel}`, `Water ${state.waterSupply}`, `Engines ${state.engineCount}`] : ["Idle"];
		},
		current_floor: ({ context, location }) => [String(blockState(blockAt(world, context.record.dimensionId, location), ["createbedrock:floor", "createbedrock:level"]))],
		fill_level: ({ context, location }) => {
			const fluid = getFluid?.(context.record.dimensionId, location); if (fluid) return [`${fluid.amount} / ${fluid.capacity}`];
			const block = blockAt(world, context.record.dimensionId, location); const container = block?.getComponent?.("minecraft:inventory")?.container;
			return [container ? `${inventoryStacks(block).length} / ${container.size}` : "0 / 0"];
		},
		gauge_status: ({ context, location }) => [String(blockState(blockAt(world, context.record.dimensionId, location), ["createbedrock:dial_level", "createbedrock:signal"]))],
		entity_name: ({ context, location }) => {
			try { const entity = world.getDimension(context.record.dimensionId).getEntities({ location, maxDistance: 1 })[0]; return [entity?.nameTag || entity?.typeId || ""]; } catch { return [""]; }
		},
		time_of_day: () => {
			const ticks = Math.floor(Number(world.getTimeOfDay?.() ?? 0)); const minutes = ((ticks % 24_000 + 24_000) % 24_000) * 6 / 100; const hours = Math.floor((minutes / 60 + 6) % 24);
			return [`${String(hours).padStart(2, "0")}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`];
		},
		stopwatch: () => [String(Math.floor(Number(world.getAbsoluteTime?.() ?? 0) / 20))],
		kinetic_speed: ({ context, location }) => [String(kineticSpeed?.(context.record.dimensionId, location) ?? 0)],
		kinetic_stress: ({ context, location }) => {
			const network = kineticNetwork?.(context.record.dimensionId, location); return [`${network?.stressImpact ?? 0} / ${network?.stressCapacity ?? 0}`];
		},
		station_summary: ({ context }) => nonEmpty(getTrain?.(context.record.dimensionId)?.trains.map(train => `${train.name}: ${train.station || "between stations"}`), "No trains"),
		train_status: ({ context }) => nonEmpty(getTrain?.(context.record.dimensionId)?.trains.map(train => {
			const status = train.blockedReason || (train.stopped ? "stopped" : train.scheduleState === "POST_TRANSIT" ? `departs ${train.nextDepartureTicks >= 0 ? `~${train.nextDepartureTicks}t` : "on condition"}` : train.destination ? `to ${train.destination}` : "idle");
			return `${train.name}: ${status}`;
		}), "No trains"),
		observed_train_name: ({ context }) => [getTrain?.(context.record.dimensionId)?.trains[0]?.name ?? ""],
		accumulate_items: ({ context, location }) => [String(inventoryStacks(blockAt(world, context.record.dimensionId, location)).reduce((total, stack) => total + stack.amount, 0))],
		item_throughput: ({ context, location }) => [String(blockState(blockAt(world, context.record.dimensionId, location), ["createbedrock:throughput", "createbedrock:signal"]))],
		count_items: ({ context, location }) => nonEmpty(itemCounts(inventoryStacks(blockAt(world, context.record.dimensionId, location))).map(([name, count]) => `${count} ${name}`), "0"),
		list_items: ({ context, location }) => nonEmpty(itemCounts(inventoryStacks(blockAt(world, context.record.dimensionId, location))).map(([name, count]) => `${name}: ${count}`), "Empty"),
		count_fluids: ({ context, location }) => {
			const fluid = getFluid?.(context.record.dimensionId, location); return [fluid ? String(fluid.amount) : "0"];
		},
		list_fluids: ({ context, location }) => {
			const fluid = getFluid?.(context.record.dimensionId, location); return [fluid?.typeId ? `${fluid.typeId}: ${fluid.amount}` : "Empty"];
		},
		read_package_address: ({ context, location }) => [getPackage?.(context.record.dimensionId, location)?.address ?? ""],
		computer: ({ context }) => String(context.record.configuration.settings.computerText ?? "").split("|").slice(0, 16)
	};
	for (const kind of DISPLAY_SOURCE_KINDS)
		registerDisplaySourceProvider(kind, provider[kind]);
}
