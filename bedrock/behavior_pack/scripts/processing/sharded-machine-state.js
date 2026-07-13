import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";

function sectionKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

export function createShardedMachineState({ keyPrefix, legacyKey, name, world }) {
	let legacyStatePendingMigration = false;
	const store = new ShardedStateStore({
		keyPrefix,
		onCommit() {
			if (!legacyStatePendingMigration)
				return;
			world.setDynamicProperty(legacyKey, undefined);
			legacyStatePendingMigration = false;
		},
		onError(error) {
			console.warn(`[Create Bedrock] Could not write sharded ${name} state: ${error}`);
		},
		partitionFor(record) {
			if (!record?.dimensionId || !record.location)
				throw new TypeError(`${name} persistent records require a dimension and location`);
			return sectionKey(record.dimensionId, record.location);
		},
		storage: createWorldDynamicPropertyStorage(world)
	});

	return {
		diagnostics() {
			return store.diagnostics();
		},
		markLegacyForMigration() {
			legacyStatePendingMigration = true;
		},
		read() {
			return store.read();
		},
		request(records) {
			store.request(records);
		},
		tick() {
			return store.tick();
		}
	};
}
