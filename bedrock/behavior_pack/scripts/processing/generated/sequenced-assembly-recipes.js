// Generated from Create sequenced-assembly recipe sources.
export const SEQUENCED_ASSEMBLY_RECIPES = [
	{
		"id": "create:sequenced_assembly/precision_mechanism",
		"input": {
			"count": 1,
			"kind": "tag",
			"tag": "c:plates/gold"
		},
		"loops": 5,
		"outputs": [
			{
				"chance": 120,
				"count": 1,
				"typeId": "createbedrock:precision_mechanism"
			},
			{
				"chance": 8,
				"count": 1,
				"typeId": "createbedrock:golden_sheet"
			},
			{
				"chance": 8,
				"count": 1,
				"typeId": "createbedrock:andesite_alloy"
			},
			{
				"chance": 5,
				"count": 1,
				"typeId": "createbedrock:cogwheel"
			},
			{
				"chance": 3,
				"count": 1,
				"typeId": "minecraft:gold_nugget"
			},
			{
				"chance": 2,
				"count": 1,
				"typeId": "createbedrock:shaft"
			},
			{
				"chance": 2,
				"count": 1,
				"typeId": "createbedrock:crushed_raw_gold"
			},
			{
				"chance": 1,
				"count": 1,
				"typeId": "minecraft:iron_ingot"
			},
			{
				"chance": 1,
				"count": 1,
				"typeId": "minecraft:clock"
			}
		],
		"source": "precision_mechanism",
		"steps": [
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:incomplete_precision_mechanism"
					},
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:cogwheel"
					}
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:incomplete_precision_mechanism"
					}
				],
				"type": "create:deploying"
			},
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:incomplete_precision_mechanism"
					},
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:large_cogwheel"
					}
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:incomplete_precision_mechanism"
					}
				],
				"type": "create:deploying"
			},
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:incomplete_precision_mechanism"
					},
					{
						"count": 1,
						"kind": "tag",
						"tag": "c:nuggets/iron"
					}
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:incomplete_precision_mechanism"
					}
				],
				"type": "create:deploying"
			}
		],
		"transitionalItem": "createbedrock:incomplete_precision_mechanism"
	},
	{
		"id": "create:sequenced_assembly/sturdy_sheet",
		"input": {
			"count": 1,
			"kind": "tag",
			"tag": "c:dusts/obsidian"
		},
		"loops": 1,
		"outputs": [
			{
				"chance": 1,
				"count": 1,
				"typeId": "createbedrock:sturdy_sheet"
			}
		],
		"source": "sturdy_sheet",
		"steps": [
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:unprocessed_obsidian_sheet"
					},
					{
						"amount": 500,
						"kind": "fluid",
						"typeId": "minecraft:lava"
					}
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:unprocessed_obsidian_sheet"
					}
				],
				"type": "create:filling"
			},
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:unprocessed_obsidian_sheet"
					}
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:unprocessed_obsidian_sheet"
					}
				],
				"type": "create:pressing"
			},
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:unprocessed_obsidian_sheet"
					}
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:unprocessed_obsidian_sheet"
					}
				],
				"type": "create:pressing"
			}
		],
		"transitionalItem": "createbedrock:unprocessed_obsidian_sheet"
	},
	{
		"id": "create:sequenced_assembly/track",
		"input": {
			"count": 1,
			"kind": "tag",
			"tag": "create:sleepers"
		},
		"loops": 1,
		"outputs": [
			{
				"chance": 1,
				"count": 1,
				"typeId": "createbedrock:track"
			}
		],
		"source": "track",
		"steps": [
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:incomplete_track"
					},
					[
						{
							"count": 1,
							"kind": "tag",
							"tag": "c:nuggets/iron"
						},
						{
							"count": 1,
							"kind": "tag",
							"tag": "c:nuggets/zinc"
						}
					]
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:incomplete_track"
					}
				],
				"type": "create:deploying"
			},
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:incomplete_track"
					},
					[
						{
							"count": 1,
							"kind": "tag",
							"tag": "c:nuggets/iron"
						},
						{
							"count": 1,
							"kind": "tag",
							"tag": "c:nuggets/zinc"
						}
					]
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:incomplete_track"
					}
				],
				"type": "create:deploying"
			},
			{
				"ingredients": [
					{
						"count": 1,
						"kind": "item",
						"typeId": "createbedrock:incomplete_track"
					}
				],
				"outputs": [
					{
						"chance": 1,
						"count": 1,
						"typeId": "createbedrock:incomplete_track"
					}
				],
				"type": "create:pressing"
			}
		],
		"transitionalItem": "createbedrock:incomplete_track"
	}
];
