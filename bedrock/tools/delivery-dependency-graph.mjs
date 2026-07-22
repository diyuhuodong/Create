export const DELIVERY_DEPENDENCY_GRAPH_SCHEMA_VERSION = 1;

const PACKAGE_DEFINITIONS = [
	["S3.15", "Stage 3 static closure and platform-acceptance ledger", 3.15, []],
	["P4.0", "Dynamic-mechanical foundation", 4.0, ["S3.15"]],
	["P4.1", "Assembly and bearing integration", 4.1, ["P4.0"]],
	["P4.2", "Linear actuators", 4.2, ["P4.1"]],
	["P4.3", "Elevators and moving contacts", 4.3, ["P4.2"]],
	["P4.4", "Dynamic mechanical actors", 4.4, ["P4.3"]],
	["P4.5", "Minecart contraptions", 4.5, ["P4.4"]],
	["P4.6", "Sticker and glue attachments", 4.6, ["P4.5"]],
	["P4.7", "Schematics and symmetry", 4.7, ["P4.6"]],
	["P5.0", "Train and package authority foundation", 5.0, ["P4.5", "S3.15"]],
	["P5.1", "Track signaling and schedules", 5.1, ["P5.0"]],
	["P5.2", "Rolling stock and carriage integration", 5.2, ["P4.5", "P5.1"]],
	["P5.3", "Packages and packagers", 5.3, ["P5.0"]],
	["P5.4", "Package routing and factory requests", 5.4, ["P5.3"]],
	["P5.5", "Train and logistics closure", 5.5, ["P5.2", "P5.4"]],
	["P6.0", "Equipment and interaction foundation", 6.0, ["S3.15"]],
	["P6.1", "Backtank and diving equipment", 6.1, ["P6.0"]],
	["P6.2", "Goggles, wrench, and Extendo Grip", 6.2, ["P6.1"]],
	["P6.3", "Potato Cannon", 6.3, ["P6.2"]],
	["P6.4", "Toolbox", 6.4, ["P6.1"]],
	["P6.5", "Equipment closure", 6.5, ["P6.2", "P6.3", "P6.4"]],
	["P7.0", "Authoritative inventory and migration gate", 7.0, []],
	["P7.1", "Content, materials, and acquisition", 7.1, ["P7.0"]],
	["P7.2", "Recipe compilation and processing closure", 7.2, ["P7.1"]],
	["P7.3", "Fluid, heat, and container semantics", 7.3, ["P7.2"]],
	["P7.4D.0", "Shared configuration and form protocol", 7.40, ["P7.2"]],
	["P7.4A", "Displays and redstone", 7.41, ["P7.2", "P7.4D.0"]],
	["P7.4B", "Logistics and packages", 7.42, ["P7.2", "P7.4D.0"]],
	["P7.4C", "Kinetics, stress, and boilers", 7.43, ["P7.3"]],
	["P7.4D", "Controls and menus", 7.44, ["P7.4D.0"]],
	["P7.5", "Dynamic mechanics, trains, and projections", 7.5, ["P4.6", "P7.4B", "P7.4C", "P7.4D"]],
	["P7.6", "Equipment, resources, and guidance", 7.6, ["P7.1", "P7.5"]],
	["P7.7", "Static closure and platform acceptance", 7.7, ["P5.5", "P6.5", "P7.4A", "P7.5", "P7.6"]]
];

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertPackageId(id, label) {
	if (typeof id !== "string" || !/^(?:S3\.15|P[4-7](?:\.[0-9]+)?(?:[A-D](?:\.0)?)?)$/.test(id))
		throw new TypeError(`${label} must be a recognized delivery package id`);
	return id;
}

/** Return the only supported dependency order for the post-Stage-3 packages. */
export function buildDeliveryDependencyGraph() {
	return {
		schemaVersion: DELIVERY_DEPENDENCY_GRAPH_SCHEMA_VERSION,
		packages: PACKAGE_DEFINITIONS.map(([id, name, order, dependencies]) => ({ dependencies, id, name, order }))
	};
}

/** Validate the graph data and reject unknown, cyclic, same-stage-backward, or
 * otherwise non-forward edges before a delivery package can be scheduled. */
export function validateDeliveryDependencyGraph(document) {
	if (document?.schemaVersion !== DELIVERY_DEPENDENCY_GRAPH_SCHEMA_VERSION)
		throw new Error("Unsupported delivery dependency graph schema version");
	if (!Array.isArray(document.packages) || document.packages.length === 0)
		throw new TypeError("Delivery dependency graph requires packages");
	const packages = new Map();
	for (const entry of document.packages) {
		const id = assertPackageId(entry?.id, "Delivery package id");
		if (packages.has(id))
			throw new Error(`Delivery dependency graph duplicates ${id}`);
		if (typeof entry.name !== "string" || entry.name.trim().length === 0)
			throw new TypeError(`${id} requires a descriptive name`);
		if (!Number.isFinite(entry.order) || entry.order <= 0)
			throw new TypeError(`${id} requires a positive dependency order`);
		if (!Array.isArray(entry.dependencies))
			throw new TypeError(`${id} requires a dependency array`);
		const dependencies = entry.dependencies.map(dependency => assertPackageId(dependency, `${id} dependency`));
		if (new Set(dependencies).size !== dependencies.length)
			throw new Error(`${id} repeats a dependency`);
		if (dependencies.includes(id))
			throw new Error(`${id} cannot depend on itself`);
		packages.set(id, { ...entry, dependencies });
	}
	for (const entry of packages.values()) {
		for (const dependencyId of entry.dependencies) {
			const dependency = packages.get(dependencyId);
			if (!dependency)
				throw new Error(`${entry.id} depends on unknown package ${dependencyId}`);
			if (dependency.order >= entry.order)
				throw new Error(`${entry.id} has a non-forward dependency on ${dependencyId}`);
		}
	}
	return { edges: [...packages.values()].reduce((count, entry) => count + entry.dependencies.length, 0), packages: packages.size };
}

export function canonicalDeliveryDependencyGraph() {
	return clone(buildDeliveryDependencyGraph());
}
