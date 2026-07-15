const DEVICE_DEFINITIONS = [
	{
		id: "analog_lever",
		blockId: "createbedrock:analog_lever",
		acceptanceIds: ["REDSTONE-ANALOG-LEVER-BLOCK", "REDSTONE-ANALOG-LEVER-BLOCK_ENTITY"],
		input: false,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "content_observer",
		blockId: "createbedrock:content_observer",
		acceptanceIds: ["REDSTONE-CONTENT-OBSERVER-BLOCK", "REDSTONE-CONTENT-OBSERVER-BLOCK_ENTITY"],
		input: false,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "crushing_wheel_controller",
		blockId: "createbedrock:crushing_wheel_controller",
		acceptanceIds: ["REDSTONE-CRUSHING-WHEEL-CONTROLLER-BLOCK", "REDSTONE-CRUSHING-WHEEL-CONTROLLER-BLOCK_ENTITY"],
		input: false,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "display_link",
		blockId: "createbedrock:display_link",
		acceptanceIds: ["REDSTONE-DISPLAY-LINK-BLOCK", "REDSTONE-DISPLAY-LINK-BLOCK_ENTITY"],
		input: true,
		output: false,
		persistenceSchema: 1
	},
	{
		id: "lectern_controller",
		blockId: "createbedrock:lectern_controller",
		acceptanceIds: ["REDSTONE-LECTERN-CONTROLLER-BLOCK", "REDSTONE-LECTERN-CONTROLLER-BLOCK_ENTITY"],
		input: false,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "linked_controller",
		itemId: "createbedrock:linked_controller",
		acceptanceIds: ["REDSTONE-LINKED-CONTROLLER-ITEM"],
		input: false,
		output: false,
		persistenceSchema: 1
	},
	{
		id: "nixie_tube",
		blockId: "createbedrock:nixie_tube",
		acceptanceIds: ["REDSTONE-NIXIE-TUBE-BLOCK", "REDSTONE-NIXIE-TUBE-BLOCK_ENTITY"],
		input: true,
		output: false,
		persistenceSchema: 1
	},
	{
		id: "powered_latch",
		blockId: "createbedrock:powered_latch",
		acceptanceIds: ["REDSTONE-POWERED-LATCH-BLOCK"],
		input: true,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "powered_toggle_latch",
		blockId: "createbedrock:powered_toggle_latch",
		acceptanceIds: ["REDSTONE-POWERED-TOGGLE-LATCH-BLOCK"],
		input: true,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "pulse_extender",
		blockId: "createbedrock:pulse_extender",
		acceptanceIds: ["REDSTONE-PULSE-EXTENDER-BLOCK", "REDSTONE-PULSE-EXTENDER-BLOCK_ENTITY"],
		input: true,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "pulse_repeater",
		blockId: "createbedrock:pulse_repeater",
		acceptanceIds: ["REDSTONE-PULSE-REPEATER-BLOCK", "REDSTONE-PULSE-REPEATER-BLOCK_ENTITY"],
		input: true,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "pulse_timer",
		blockId: "createbedrock:pulse_timer",
		acceptanceIds: ["REDSTONE-PULSE-TIMER-BLOCK", "REDSTONE-PULSE-TIMER-BLOCK_ENTITY"],
		input: true,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "redstone_contact",
		blockId: "createbedrock:redstone_contact",
		acceptanceIds: ["REDSTONE-REDSTONE-CONTACT-BLOCK"],
		input: false,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "redstone_link",
		blockId: "createbedrock:redstone_link",
		acceptanceIds: ["REDSTONE-REDSTONE-LINK-BLOCK", "REDSTONE-REDSTONE-LINK-BLOCK_ENTITY"],
		input: true,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "redstone_requester",
		blockId: "createbedrock:redstone_requester",
		acceptanceIds: ["REDSTONE-REDSTONE-REQUESTER-BLOCK", "REDSTONE-REDSTONE-REQUESTER-BLOCK_ENTITY"],
		input: true,
		output: true,
		persistenceSchema: 1
	},
	{
		id: "rotation_speed_controller",
		blockId: "createbedrock:rotation_speed_controller",
		acceptanceIds: ["REDSTONE-ROTATION-SPEED-CONTROLLER-BLOCK", "REDSTONE-ROTATION-SPEED-CONTROLLER-BLOCK_ENTITY"],
		input: true,
		output: false,
		persistenceSchema: 1
	},
	{
		id: "stock_link",
		blockId: "createbedrock:stock_link",
		acceptanceIds: ["REDSTONE-STOCK-LINK-BLOCK"],
		input: false,
		output: true,
		persistenceSchema: 1
	}
];

function freezeDevice(device) {
	return Object.freeze({ ...device, acceptanceIds: Object.freeze([...device.acceptanceIds]) });
}

export const REDSTONE_DEVICE_CATALOG = Object.freeze(DEVICE_DEFINITIONS.map(freezeDevice));
export const REDSTONE_BLOCK_DEVICES = Object.freeze(REDSTONE_DEVICE_CATALOG.filter(device => device.blockId));
export const REDSTONE_ITEM_DEVICES = Object.freeze(REDSTONE_DEVICE_CATALOG.filter(device => device.itemId));

const byBlockId = new Map(REDSTONE_BLOCK_DEVICES.map(device => [device.blockId, device]));
const byId = new Map(REDSTONE_DEVICE_CATALOG.map(device => [device.id, device]));

export function redstoneDeviceForBlock(blockTypeId) {
	return byBlockId.get(blockTypeId);
}

export function redstoneDeviceForId(id) {
	return byId.get(id);
}

export function allRedstoneAcceptanceIds() {
	return REDSTONE_DEVICE_CATALOG.flatMap(device => device.acceptanceIds);
}
