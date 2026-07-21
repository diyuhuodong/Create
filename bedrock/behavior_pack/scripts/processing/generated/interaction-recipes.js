// Generated from Create interactive recipe sources.
export const INTERACTION_RECIPES = [
	{
		"id": "create:crafting/curiosities/item_copying",
		"ingredients": [],
		"keepHeldItem": false,
		"results": [],
		"source": {
			"id": "create:crafting/curiosities/item_copying",
			"path": "src/generated/resources/data/create/recipe/crafting/curiosities/item_copying.json",
			"type": "create:item_copying"
		},
		"sourceRecipe": {
			"type": "create:item_copying",
			"category": "misc"
		},
		"strategy": "special_runtime"
	},
	{
		"id": "create:crafting/curiosities/toolbox_dyeing",
		"ingredients": [],
		"keepHeldItem": false,
		"results": [],
		"source": {
			"id": "create:crafting/curiosities/toolbox_dyeing",
			"path": "src/generated/resources/data/create/recipe/crafting/curiosities/toolbox_dyeing.json",
			"type": "create:toolbox_dyeing"
		},
		"sourceRecipe": {
			"type": "create:toolbox_dyeing",
			"category": "misc"
		},
		"strategy": "special_runtime"
	},
	{
		"id": "create:deploying/chiseled_copper_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_chiseled_copper",
				"typeId": "minecraft:exposed_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:chiseled_copper",
				"typeId": "minecraft:chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/chiseled_copper_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/chiseled_copper_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_chiseled_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/chiseled_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_chiseled_copper",
				"typeId": "minecraft:waxed_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:chiseled_copper",
				"typeId": "minecraft:chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/chiseled_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/chiseled_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_chiseled_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/cogwheel",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:shaft",
				"typeId": "createbedrock:shaft"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:planks"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:cogwheel",
				"typeId": "createbedrock:cogwheel"
			}
		],
		"source": {
			"id": "create:deploying/cogwheel",
			"path": "src/generated/resources/data/create/recipe/deploying/cogwheel.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:shaft"
				},
				{
					"tag": "minecraft:planks"
				}
			],
			"results": [
				{
					"id": "create:cogwheel"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_block_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper",
				"typeId": "minecraft:exposed_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_block",
				"typeId": "minecraft:copper_block"
			}
		],
		"source": {
			"id": "create:deploying/copper_block_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_block_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_block"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_block_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_block",
				"typeId": "minecraft:waxed_copper_block"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_block",
				"typeId": "minecraft:copper_block"
			}
		],
		"source": {
			"id": "create:deploying/copper_block_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_block_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_copper_block"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_block"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_bulb_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_bulb",
				"typeId": "minecraft:exposed_copper_bulb"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_bulb",
				"typeId": "minecraft:copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/copper_bulb_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_bulb_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper_bulb"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_bulb_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_bulb",
				"typeId": "minecraft:waxed_copper_bulb"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_bulb",
				"typeId": "minecraft:copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/copper_bulb_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_bulb_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_copper_bulb"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_door_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_door",
				"typeId": "minecraft:exposed_copper_door"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_door",
				"typeId": "minecraft:copper_door"
			}
		],
		"source": {
			"id": "create:deploying/copper_door_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_door_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper_door"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_door_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_door",
				"typeId": "minecraft:waxed_copper_door"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_door",
				"typeId": "minecraft:copper_door"
			}
		],
		"source": {
			"id": "create:deploying/copper_door_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_door_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_copper_door"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_grate_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_grate",
				"typeId": "minecraft:exposed_copper_grate"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_grate",
				"typeId": "minecraft:copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/copper_grate_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_grate_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper_grate"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_grate_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_grate",
				"typeId": "minecraft:waxed_copper_grate"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_grate",
				"typeId": "minecraft:copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/copper_grate_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_grate_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_copper_grate"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_shingle_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingle_slab",
				"typeId": "createbedrock:exposed_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingle_slab",
				"typeId": "createbedrock:copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/copper_shingle_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_shingle_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_shingle_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_shingle_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_shingle_slab",
				"typeId": "createbedrock:waxed_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingle_slab",
				"typeId": "createbedrock:copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/copper_shingle_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_shingle_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_copper_shingle_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_shingle_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingle_stairs",
				"typeId": "createbedrock:exposed_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingle_stairs",
				"typeId": "createbedrock:copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/copper_shingle_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_shingle_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_shingle_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_shingle_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_shingle_stairs",
				"typeId": "createbedrock:waxed_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingle_stairs",
				"typeId": "createbedrock:copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/copper_shingle_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_shingle_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_copper_shingle_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_shingles_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingles",
				"typeId": "createbedrock:exposed_copper_shingles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingles",
				"typeId": "createbedrock:copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/copper_shingles_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_shingles_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_shingles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_shingles_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_shingles",
				"typeId": "createbedrock:waxed_copper_shingles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingles",
				"typeId": "createbedrock:copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/copper_shingles_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_shingles_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_copper_shingles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_tile_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tile_slab",
				"typeId": "createbedrock:exposed_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tile_slab",
				"typeId": "createbedrock:copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/copper_tile_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_tile_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_tile_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_tile_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_tile_slab",
				"typeId": "createbedrock:waxed_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tile_slab",
				"typeId": "createbedrock:copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/copper_tile_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_tile_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_copper_tile_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_tile_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tile_stairs",
				"typeId": "createbedrock:exposed_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tile_stairs",
				"typeId": "createbedrock:copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/copper_tile_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_tile_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_tile_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_tile_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_tile_stairs",
				"typeId": "createbedrock:waxed_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tile_stairs",
				"typeId": "createbedrock:copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/copper_tile_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_tile_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_copper_tile_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_tiles_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tiles",
				"typeId": "createbedrock:exposed_copper_tiles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tiles",
				"typeId": "createbedrock:copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/copper_tiles_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_tiles_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_tiles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_tiles_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_tiles",
				"typeId": "createbedrock:waxed_copper_tiles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tiles",
				"typeId": "createbedrock:copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/copper_tiles_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_tiles_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_copper_tiles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_trapdoor_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_trapdoor",
				"typeId": "minecraft:exposed_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_trapdoor",
				"typeId": "minecraft:copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/copper_trapdoor_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_trapdoor_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper_trapdoor"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/copper_trapdoor_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_trapdoor",
				"typeId": "minecraft:waxed_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_trapdoor",
				"typeId": "minecraft:copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/copper_trapdoor_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/copper_trapdoor_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_copper_trapdoor"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/cut_copper_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper",
				"typeId": "minecraft:exposed_cut_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper",
				"typeId": "minecraft:cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/cut_copper_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/cut_copper_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_cut_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/cut_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_cut_copper",
				"typeId": "minecraft:waxed_cut_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper",
				"typeId": "minecraft:cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/cut_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/cut_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_cut_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/cut_copper_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper_slab",
				"typeId": "minecraft:exposed_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper_slab",
				"typeId": "minecraft:cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/cut_copper_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/cut_copper_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_cut_copper_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/cut_copper_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_cut_copper_slab",
				"typeId": "minecraft:waxed_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper_slab",
				"typeId": "minecraft:cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/cut_copper_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/cut_copper_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_cut_copper_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/cut_copper_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper_stairs",
				"typeId": "minecraft:exposed_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper_stairs",
				"typeId": "minecraft:cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/cut_copper_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/cut_copper_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_cut_copper_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/cut_copper_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_cut_copper_stairs",
				"typeId": "minecraft:waxed_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper_stairs",
				"typeId": "minecraft:cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/cut_copper_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/cut_copper_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_cut_copper_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_chiseled_copper_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_chiseled_copper",
				"typeId": "minecraft:weathered_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_chiseled_copper",
				"typeId": "minecraft:exposed_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/exposed_chiseled_copper_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_chiseled_copper_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_chiseled_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_chiseled_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_chiseled_copper",
				"typeId": "minecraft:waxed_exposed_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_chiseled_copper",
				"typeId": "minecraft:exposed_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/exposed_chiseled_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_chiseled_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_chiseled_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_bulb_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_bulb",
				"typeId": "minecraft:weathered_copper_bulb"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_bulb",
				"typeId": "minecraft:exposed_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_bulb_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_bulb_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper_bulb"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_bulb_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper_bulb",
				"typeId": "minecraft:waxed_exposed_copper_bulb"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_bulb",
				"typeId": "minecraft:exposed_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_bulb_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_bulb_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_copper_bulb"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_door_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_door",
				"typeId": "minecraft:weathered_copper_door"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_door",
				"typeId": "minecraft:exposed_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_door_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_door_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper_door"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_door_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper_door",
				"typeId": "minecraft:waxed_exposed_copper_door"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_door",
				"typeId": "minecraft:exposed_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_door_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_door_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_copper_door"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper",
				"typeId": "minecraft:weathered_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper",
				"typeId": "minecraft:exposed_copper"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper",
				"typeId": "minecraft:waxed_exposed_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper",
				"typeId": "minecraft:exposed_copper"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_grate_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_grate",
				"typeId": "minecraft:weathered_copper_grate"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_grate",
				"typeId": "minecraft:exposed_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_grate_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_grate_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper_grate"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_grate_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper_grate",
				"typeId": "minecraft:waxed_exposed_copper_grate"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_grate",
				"typeId": "minecraft:exposed_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_grate_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_grate_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_copper_grate"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_shingle_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingle_slab",
				"typeId": "createbedrock:weathered_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingle_slab",
				"typeId": "createbedrock:exposed_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_shingle_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_shingle_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_shingle_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_shingle_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_shingle_slab",
				"typeId": "createbedrock:waxed_exposed_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingle_slab",
				"typeId": "createbedrock:exposed_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_shingle_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_shingle_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_exposed_copper_shingle_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_shingle_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingle_stairs",
				"typeId": "createbedrock:weathered_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingle_stairs",
				"typeId": "createbedrock:exposed_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_shingle_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_shingle_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_shingle_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_shingle_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_shingle_stairs",
				"typeId": "createbedrock:waxed_exposed_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingle_stairs",
				"typeId": "createbedrock:exposed_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_shingle_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_shingle_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_exposed_copper_shingle_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_shingles_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingles",
				"typeId": "createbedrock:weathered_copper_shingles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingles",
				"typeId": "createbedrock:exposed_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_shingles_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_shingles_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_shingles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_shingles_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_shingles",
				"typeId": "createbedrock:waxed_exposed_copper_shingles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingles",
				"typeId": "createbedrock:exposed_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_shingles_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_shingles_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_exposed_copper_shingles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_tile_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tile_slab",
				"typeId": "createbedrock:weathered_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tile_slab",
				"typeId": "createbedrock:exposed_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_tile_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_tile_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_tile_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_tile_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_tile_slab",
				"typeId": "createbedrock:waxed_exposed_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tile_slab",
				"typeId": "createbedrock:exposed_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_tile_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_tile_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_exposed_copper_tile_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_tile_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tile_stairs",
				"typeId": "createbedrock:weathered_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tile_stairs",
				"typeId": "createbedrock:exposed_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_tile_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_tile_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_tile_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_tile_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_tile_stairs",
				"typeId": "createbedrock:waxed_exposed_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tile_stairs",
				"typeId": "createbedrock:exposed_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_tile_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_tile_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_exposed_copper_tile_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_tiles_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tiles",
				"typeId": "createbedrock:weathered_copper_tiles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tiles",
				"typeId": "createbedrock:exposed_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_tiles_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_tiles_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_tiles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_tiles_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_tiles",
				"typeId": "createbedrock:waxed_exposed_copper_tiles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tiles",
				"typeId": "createbedrock:exposed_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_tiles_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_tiles_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_exposed_copper_tiles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:exposed_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_trapdoor_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_trapdoor",
				"typeId": "minecraft:weathered_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_trapdoor",
				"typeId": "minecraft:exposed_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_trapdoor_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_trapdoor_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper_trapdoor"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_copper_trapdoor_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper_trapdoor",
				"typeId": "minecraft:waxed_exposed_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_trapdoor",
				"typeId": "minecraft:exposed_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/exposed_copper_trapdoor_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_copper_trapdoor_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_copper_trapdoor"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_cut_copper_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper",
				"typeId": "minecraft:weathered_cut_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper",
				"typeId": "minecraft:exposed_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/exposed_cut_copper_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_cut_copper_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_cut_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_cut_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_cut_copper",
				"typeId": "minecraft:waxed_exposed_cut_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper",
				"typeId": "minecraft:exposed_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/exposed_cut_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_cut_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_cut_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_cut_copper_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper_slab",
				"typeId": "minecraft:weathered_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper_slab",
				"typeId": "minecraft:exposed_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/exposed_cut_copper_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_cut_copper_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_cut_copper_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_cut_copper_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_cut_copper_slab",
				"typeId": "minecraft:waxed_exposed_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper_slab",
				"typeId": "minecraft:exposed_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/exposed_cut_copper_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_cut_copper_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_cut_copper_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_cut_copper_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper_stairs",
				"typeId": "minecraft:weathered_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper_stairs",
				"typeId": "minecraft:exposed_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/exposed_cut_copper_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_cut_copper_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_cut_copper_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/exposed_cut_copper_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_cut_copper_stairs",
				"typeId": "minecraft:waxed_exposed_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper_stairs",
				"typeId": "minecraft:exposed_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/exposed_cut_copper_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/exposed_cut_copper_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_exposed_cut_copper_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:exposed_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/large_cogwheel",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:cogwheel",
				"typeId": "createbedrock:cogwheel"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:planks"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:large_cogwheel",
				"typeId": "createbedrock:large_cogwheel"
			}
		],
		"source": {
			"id": "create:deploying/large_cogwheel",
			"path": "src/generated/resources/data/create/recipe/deploying/large_cogwheel.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:cogwheel"
				},
				{
					"tag": "minecraft:planks"
				}
			],
			"results": [
				{
					"id": "create:large_cogwheel"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_chiseled_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_chiseled_copper",
				"typeId": "minecraft:waxed_oxidized_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_chiseled_copper",
				"typeId": "minecraft:oxidized_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_chiseled_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_chiseled_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_chiseled_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_bulb_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper_bulb",
				"typeId": "minecraft:waxed_oxidized_copper_bulb"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_bulb",
				"typeId": "minecraft:oxidized_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_bulb_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_bulb_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_copper_bulb"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_door_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper_door",
				"typeId": "minecraft:waxed_oxidized_copper_door"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_door",
				"typeId": "minecraft:oxidized_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_door_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_door_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_copper_door"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper",
				"typeId": "minecraft:waxed_oxidized_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper",
				"typeId": "minecraft:oxidized_copper"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_grate_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper_grate",
				"typeId": "minecraft:waxed_oxidized_copper_grate"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_grate",
				"typeId": "minecraft:oxidized_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_grate_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_grate_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_copper_grate"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_shingle_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_shingle_slab",
				"typeId": "createbedrock:waxed_oxidized_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingle_slab",
				"typeId": "createbedrock:oxidized_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_shingle_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_shingle_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_oxidized_copper_shingle_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:oxidized_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_shingle_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_shingle_stairs",
				"typeId": "createbedrock:waxed_oxidized_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingle_stairs",
				"typeId": "createbedrock:oxidized_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_shingle_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_shingle_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_oxidized_copper_shingle_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:oxidized_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_shingles_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_shingles",
				"typeId": "createbedrock:waxed_oxidized_copper_shingles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingles",
				"typeId": "createbedrock:oxidized_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_shingles_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_shingles_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_oxidized_copper_shingles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:oxidized_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_tile_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_tile_slab",
				"typeId": "createbedrock:waxed_oxidized_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tile_slab",
				"typeId": "createbedrock:oxidized_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_tile_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_tile_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_oxidized_copper_tile_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:oxidized_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_tile_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_tile_stairs",
				"typeId": "createbedrock:waxed_oxidized_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tile_stairs",
				"typeId": "createbedrock:oxidized_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_tile_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_tile_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_oxidized_copper_tile_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:oxidized_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_tiles_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_tiles",
				"typeId": "createbedrock:waxed_oxidized_copper_tiles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tiles",
				"typeId": "createbedrock:oxidized_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_tiles_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_tiles_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_oxidized_copper_tiles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:oxidized_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_copper_trapdoor_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper_trapdoor",
				"typeId": "minecraft:waxed_oxidized_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_trapdoor",
				"typeId": "minecraft:oxidized_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_copper_trapdoor_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_copper_trapdoor_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_copper_trapdoor"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_cut_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_cut_copper",
				"typeId": "minecraft:waxed_oxidized_cut_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper",
				"typeId": "minecraft:oxidized_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_cut_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_cut_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_cut_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_cut_copper_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_cut_copper_slab",
				"typeId": "minecraft:waxed_oxidized_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper_slab",
				"typeId": "minecraft:oxidized_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_cut_copper_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_cut_copper_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_cut_copper_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/oxidized_cut_copper_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_cut_copper_stairs",
				"typeId": "minecraft:waxed_oxidized_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper_stairs",
				"typeId": "minecraft:oxidized_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/oxidized_cut_copper_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/oxidized_cut_copper_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_oxidized_cut_copper_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:oxidized_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_chiseled_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:chiseled_copper",
				"typeId": "minecraft:chiseled_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_chiseled_copper",
				"typeId": "minecraft:waxed_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_chiseled_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_chiseled_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:chiseled_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_block_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_block",
				"typeId": "minecraft:copper_block"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_block",
				"typeId": "minecraft:waxed_copper_block"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_block_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_block_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:copper_block"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_copper_block"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_bulb_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_bulb",
				"typeId": "minecraft:copper_bulb"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_bulb",
				"typeId": "minecraft:waxed_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_bulb_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_bulb_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:copper_bulb"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_door_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_door",
				"typeId": "minecraft:copper_door"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_door",
				"typeId": "minecraft:waxed_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_door_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_door_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:copper_door"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_grate_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_grate",
				"typeId": "minecraft:copper_grate"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_grate",
				"typeId": "minecraft:waxed_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_grate_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_grate_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:copper_grate"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_shingle_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingle_slab",
				"typeId": "createbedrock:copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_shingle_slab",
				"typeId": "createbedrock:waxed_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_shingle_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_shingle_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:copper_shingle_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_shingle_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingle_stairs",
				"typeId": "createbedrock:copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_shingle_stairs",
				"typeId": "createbedrock:waxed_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_shingle_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_shingle_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:copper_shingle_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_shingles_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_shingles",
				"typeId": "createbedrock:copper_shingles"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_shingles",
				"typeId": "createbedrock:waxed_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_shingles_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_shingles_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:copper_shingles"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_tile_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tile_slab",
				"typeId": "createbedrock:copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_tile_slab",
				"typeId": "createbedrock:waxed_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_tile_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_tile_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:copper_tile_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_tile_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tile_stairs",
				"typeId": "createbedrock:copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_tile_stairs",
				"typeId": "createbedrock:waxed_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_tile_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_tile_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:copper_tile_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_tiles_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_tiles",
				"typeId": "createbedrock:copper_tiles"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_copper_tiles",
				"typeId": "createbedrock:waxed_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_tiles_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_tiles_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:copper_tiles"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_copper_trapdoor_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:copper_trapdoor",
				"typeId": "minecraft:copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_copper_trapdoor",
				"typeId": "minecraft:waxed_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/waxed_copper_trapdoor_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_copper_trapdoor_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:copper_trapdoor"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_cut_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper",
				"typeId": "minecraft:cut_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_cut_copper",
				"typeId": "minecraft:waxed_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_cut_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_cut_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:cut_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_cut_copper_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper_slab",
				"typeId": "minecraft:cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_cut_copper_slab",
				"typeId": "minecraft:waxed_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_cut_copper_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_cut_copper_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:cut_copper_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_cut_copper_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:cut_copper_stairs",
				"typeId": "minecraft:cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_cut_copper_stairs",
				"typeId": "minecraft:waxed_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_cut_copper_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_cut_copper_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:cut_copper_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_chiseled_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_chiseled_copper",
				"typeId": "minecraft:exposed_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_chiseled_copper",
				"typeId": "minecraft:waxed_exposed_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_chiseled_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_chiseled_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_chiseled_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_bulb_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_bulb",
				"typeId": "minecraft:exposed_copper_bulb"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper_bulb",
				"typeId": "minecraft:waxed_exposed_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_bulb_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_bulb_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper_bulb"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_door_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_door",
				"typeId": "minecraft:exposed_copper_door"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper_door",
				"typeId": "minecraft:waxed_exposed_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_door_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_door_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper_door"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper",
				"typeId": "minecraft:exposed_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper",
				"typeId": "minecraft:waxed_exposed_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_grate_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_grate",
				"typeId": "minecraft:exposed_copper_grate"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper_grate",
				"typeId": "minecraft:waxed_exposed_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_grate_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_grate_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper_grate"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_shingle_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingle_slab",
				"typeId": "createbedrock:exposed_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_shingle_slab",
				"typeId": "createbedrock:waxed_exposed_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_shingle_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_shingle_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_shingle_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_exposed_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_shingle_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingle_stairs",
				"typeId": "createbedrock:exposed_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_shingle_stairs",
				"typeId": "createbedrock:waxed_exposed_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_shingle_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_shingle_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_shingle_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_exposed_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_shingles_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_shingles",
				"typeId": "createbedrock:exposed_copper_shingles"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_shingles",
				"typeId": "createbedrock:waxed_exposed_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_shingles_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_shingles_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_shingles"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_exposed_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_tile_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tile_slab",
				"typeId": "createbedrock:exposed_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_tile_slab",
				"typeId": "createbedrock:waxed_exposed_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_tile_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_tile_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_tile_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_exposed_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_tile_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tile_stairs",
				"typeId": "createbedrock:exposed_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_tile_stairs",
				"typeId": "createbedrock:waxed_exposed_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_tile_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_tile_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_tile_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_exposed_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_tiles_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:exposed_copper_tiles",
				"typeId": "createbedrock:exposed_copper_tiles"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_exposed_copper_tiles",
				"typeId": "createbedrock:waxed_exposed_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_tiles_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_tiles_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:exposed_copper_tiles"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_exposed_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_copper_trapdoor_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_copper_trapdoor",
				"typeId": "minecraft:exposed_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_copper_trapdoor",
				"typeId": "minecraft:waxed_exposed_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_copper_trapdoor_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_copper_trapdoor_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_copper_trapdoor"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_cut_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper",
				"typeId": "minecraft:exposed_cut_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_cut_copper",
				"typeId": "minecraft:waxed_exposed_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_cut_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_cut_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_cut_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_cut_copper_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper_slab",
				"typeId": "minecraft:exposed_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_cut_copper_slab",
				"typeId": "minecraft:waxed_exposed_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_cut_copper_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_cut_copper_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_cut_copper_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_exposed_cut_copper_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:exposed_cut_copper_stairs",
				"typeId": "minecraft:exposed_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_exposed_cut_copper_stairs",
				"typeId": "minecraft:waxed_exposed_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_exposed_cut_copper_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_exposed_cut_copper_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:exposed_cut_copper_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_exposed_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_chiseled_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_chiseled_copper",
				"typeId": "minecraft:oxidized_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_chiseled_copper",
				"typeId": "minecraft:waxed_oxidized_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_chiseled_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_chiseled_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_chiseled_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_bulb_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_bulb",
				"typeId": "minecraft:oxidized_copper_bulb"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper_bulb",
				"typeId": "minecraft:waxed_oxidized_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_bulb_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_bulb_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper_bulb"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_door_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_door",
				"typeId": "minecraft:oxidized_copper_door"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper_door",
				"typeId": "minecraft:waxed_oxidized_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_door_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_door_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper_door"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper",
				"typeId": "minecraft:oxidized_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper",
				"typeId": "minecraft:waxed_oxidized_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_grate_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_grate",
				"typeId": "minecraft:oxidized_copper_grate"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper_grate",
				"typeId": "minecraft:waxed_oxidized_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_grate_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_grate_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper_grate"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_shingle_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingle_slab",
				"typeId": "createbedrock:oxidized_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_shingle_slab",
				"typeId": "createbedrock:waxed_oxidized_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_shingle_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_shingle_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_shingle_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_oxidized_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_shingle_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingle_stairs",
				"typeId": "createbedrock:oxidized_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_shingle_stairs",
				"typeId": "createbedrock:waxed_oxidized_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_shingle_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_shingle_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_shingle_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_oxidized_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_shingles_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingles",
				"typeId": "createbedrock:oxidized_copper_shingles"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_shingles",
				"typeId": "createbedrock:waxed_oxidized_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_shingles_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_shingles_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_shingles"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_oxidized_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_tile_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tile_slab",
				"typeId": "createbedrock:oxidized_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_tile_slab",
				"typeId": "createbedrock:waxed_oxidized_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_tile_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_tile_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_tile_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_oxidized_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_tile_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tile_stairs",
				"typeId": "createbedrock:oxidized_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_tile_stairs",
				"typeId": "createbedrock:waxed_oxidized_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_tile_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_tile_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_tile_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_oxidized_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_tiles_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tiles",
				"typeId": "createbedrock:oxidized_copper_tiles"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_oxidized_copper_tiles",
				"typeId": "createbedrock:waxed_oxidized_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_tiles_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_tiles_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_tiles"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_oxidized_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_copper_trapdoor_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_trapdoor",
				"typeId": "minecraft:oxidized_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_copper_trapdoor",
				"typeId": "minecraft:waxed_oxidized_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_copper_trapdoor_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_copper_trapdoor_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper_trapdoor"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_cut_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper",
				"typeId": "minecraft:oxidized_cut_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_cut_copper",
				"typeId": "minecraft:waxed_oxidized_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_cut_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_cut_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_cut_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_cut_copper_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper_slab",
				"typeId": "minecraft:oxidized_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_cut_copper_slab",
				"typeId": "minecraft:waxed_oxidized_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_cut_copper_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_cut_copper_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_cut_copper_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_oxidized_cut_copper_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper_stairs",
				"typeId": "minecraft:oxidized_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_oxidized_cut_copper_stairs",
				"typeId": "minecraft:waxed_oxidized_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_oxidized_cut_copper_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_oxidized_cut_copper_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_cut_copper_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_oxidized_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_chiseled_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_chiseled_copper",
				"typeId": "minecraft:weathered_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_chiseled_copper",
				"typeId": "minecraft:waxed_weathered_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_chiseled_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_chiseled_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_chiseled_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_bulb_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_bulb",
				"typeId": "minecraft:weathered_copper_bulb"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper_bulb",
				"typeId": "minecraft:waxed_weathered_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_bulb_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_bulb_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper_bulb"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_door_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_door",
				"typeId": "minecraft:weathered_copper_door"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper_door",
				"typeId": "minecraft:waxed_weathered_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_door_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_door_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper_door"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper",
				"typeId": "minecraft:weathered_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper",
				"typeId": "minecraft:waxed_weathered_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_grate_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_grate",
				"typeId": "minecraft:weathered_copper_grate"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper_grate",
				"typeId": "minecraft:waxed_weathered_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_grate_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_grate_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper_grate"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_shingle_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingle_slab",
				"typeId": "createbedrock:weathered_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_shingle_slab",
				"typeId": "createbedrock:waxed_weathered_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_shingle_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_shingle_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_shingle_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_weathered_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_shingle_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingle_stairs",
				"typeId": "createbedrock:weathered_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_shingle_stairs",
				"typeId": "createbedrock:waxed_weathered_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_shingle_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_shingle_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_shingle_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_weathered_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_shingles_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingles",
				"typeId": "createbedrock:weathered_copper_shingles"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_shingles",
				"typeId": "createbedrock:waxed_weathered_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_shingles_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_shingles_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_shingles"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_weathered_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_tile_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tile_slab",
				"typeId": "createbedrock:weathered_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_tile_slab",
				"typeId": "createbedrock:waxed_weathered_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_tile_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_tile_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_tile_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_weathered_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_tile_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tile_stairs",
				"typeId": "createbedrock:weathered_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_tile_stairs",
				"typeId": "createbedrock:waxed_weathered_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_tile_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_tile_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_tile_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_weathered_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_tiles_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tiles",
				"typeId": "createbedrock:weathered_copper_tiles"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_tiles",
				"typeId": "createbedrock:waxed_weathered_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_tiles_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_tiles_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:weathered_copper_tiles"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:waxed_weathered_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_copper_trapdoor_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_trapdoor",
				"typeId": "minecraft:weathered_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper_trapdoor",
				"typeId": "minecraft:waxed_weathered_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_copper_trapdoor_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_copper_trapdoor_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_copper_trapdoor"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_cut_copper_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper",
				"typeId": "minecraft:weathered_cut_copper"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_cut_copper",
				"typeId": "minecraft:waxed_weathered_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_cut_copper_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_cut_copper_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_cut_copper"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_cut_copper_slab_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper_slab",
				"typeId": "minecraft:weathered_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_cut_copper_slab",
				"typeId": "minecraft:waxed_weathered_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_cut_copper_slab_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_cut_copper_slab_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_cut_copper_slab"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/waxed_weathered_cut_copper_stairs_from_adding_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper_stairs",
				"typeId": "minecraft:weathered_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honeycomb_block",
				"typeId": "minecraft:honeycomb_block"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_cut_copper_stairs",
				"typeId": "minecraft:waxed_weathered_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/waxed_weathered_cut_copper_stairs_from_adding_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/waxed_weathered_cut_copper_stairs_from_adding_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:weathered_cut_copper_stairs"
				},
				{
					"item": "minecraft:honeycomb_block"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:waxed_weathered_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_chiseled_copper_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_chiseled_copper",
				"typeId": "minecraft:oxidized_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_chiseled_copper",
				"typeId": "minecraft:weathered_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/weathered_chiseled_copper_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_chiseled_copper_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_chiseled_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_chiseled_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_chiseled_copper",
				"typeId": "minecraft:waxed_weathered_chiseled_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_chiseled_copper",
				"typeId": "minecraft:weathered_chiseled_copper"
			}
		],
		"source": {
			"id": "create:deploying/weathered_chiseled_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_chiseled_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_chiseled_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_chiseled_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_bulb_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_bulb",
				"typeId": "minecraft:oxidized_copper_bulb"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_bulb",
				"typeId": "minecraft:weathered_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_bulb_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_bulb_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper_bulb"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_bulb_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper_bulb",
				"typeId": "minecraft:waxed_weathered_copper_bulb"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_bulb",
				"typeId": "minecraft:weathered_copper_bulb"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_bulb_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_bulb_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_copper_bulb"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper_bulb"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_door_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_door",
				"typeId": "minecraft:oxidized_copper_door"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_door",
				"typeId": "minecraft:weathered_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_door_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_door_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper_door"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_door_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper_door",
				"typeId": "minecraft:waxed_weathered_copper_door"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_door",
				"typeId": "minecraft:weathered_copper_door"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_door_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_door_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_copper_door"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper_door"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper",
				"typeId": "minecraft:oxidized_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper",
				"typeId": "minecraft:weathered_copper"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper",
				"typeId": "minecraft:waxed_weathered_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper",
				"typeId": "minecraft:weathered_copper"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_grate_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_grate",
				"typeId": "minecraft:oxidized_copper_grate"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_grate",
				"typeId": "minecraft:weathered_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_grate_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_grate_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper_grate"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_grate_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper_grate",
				"typeId": "minecraft:waxed_weathered_copper_grate"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_grate",
				"typeId": "minecraft:weathered_copper_grate"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_grate_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_grate_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_copper_grate"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper_grate"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_shingle_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingle_slab",
				"typeId": "createbedrock:oxidized_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingle_slab",
				"typeId": "createbedrock:weathered_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_shingle_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_shingle_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_shingle_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_shingle_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_shingle_slab",
				"typeId": "createbedrock:waxed_weathered_copper_shingle_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingle_slab",
				"typeId": "createbedrock:weathered_copper_shingle_slab"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_shingle_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_shingle_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_weathered_copper_shingle_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_shingle_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_shingle_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingle_stairs",
				"typeId": "createbedrock:oxidized_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingle_stairs",
				"typeId": "createbedrock:weathered_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_shingle_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_shingle_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_shingle_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_shingle_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_shingle_stairs",
				"typeId": "createbedrock:waxed_weathered_copper_shingle_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingle_stairs",
				"typeId": "createbedrock:weathered_copper_shingle_stairs"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_shingle_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_shingle_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_weathered_copper_shingle_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_shingle_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_shingles_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_shingles",
				"typeId": "createbedrock:oxidized_copper_shingles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingles",
				"typeId": "createbedrock:weathered_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_shingles_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_shingles_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_shingles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_shingles_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_shingles",
				"typeId": "createbedrock:waxed_weathered_copper_shingles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_shingles",
				"typeId": "createbedrock:weathered_copper_shingles"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_shingles_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_shingles_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_weathered_copper_shingles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_shingles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_tile_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tile_slab",
				"typeId": "createbedrock:oxidized_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tile_slab",
				"typeId": "createbedrock:weathered_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_tile_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_tile_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_tile_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_tile_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_tile_slab",
				"typeId": "createbedrock:waxed_weathered_copper_tile_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tile_slab",
				"typeId": "createbedrock:weathered_copper_tile_slab"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_tile_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_tile_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_weathered_copper_tile_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_tile_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_tile_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tile_stairs",
				"typeId": "createbedrock:oxidized_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tile_stairs",
				"typeId": "createbedrock:weathered_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_tile_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_tile_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_tile_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_tile_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_tile_stairs",
				"typeId": "createbedrock:waxed_weathered_copper_tile_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tile_stairs",
				"typeId": "createbedrock:weathered_copper_tile_stairs"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_tile_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_tile_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_weathered_copper_tile_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_tile_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_tiles_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:oxidized_copper_tiles",
				"typeId": "createbedrock:oxidized_copper_tiles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tiles",
				"typeId": "createbedrock:weathered_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_tiles_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_tiles_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:oxidized_copper_tiles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_tiles_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:waxed_weathered_copper_tiles",
				"typeId": "createbedrock:waxed_weathered_copper_tiles"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:weathered_copper_tiles",
				"typeId": "createbedrock:weathered_copper_tiles"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_tiles_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_tiles_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "create:waxed_weathered_copper_tiles"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "create:weathered_copper_tiles"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_trapdoor_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_copper_trapdoor",
				"typeId": "minecraft:oxidized_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_trapdoor",
				"typeId": "minecraft:weathered_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_trapdoor_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_trapdoor_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_copper_trapdoor"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_copper_trapdoor_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_copper_trapdoor",
				"typeId": "minecraft:waxed_weathered_copper_trapdoor"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_copper_trapdoor",
				"typeId": "minecraft:weathered_copper_trapdoor"
			}
		],
		"source": {
			"id": "create:deploying/weathered_copper_trapdoor_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_copper_trapdoor_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_copper_trapdoor"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_copper_trapdoor"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_cut_copper_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper",
				"typeId": "minecraft:oxidized_cut_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper",
				"typeId": "minecraft:weathered_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/weathered_cut_copper_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_cut_copper_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_cut_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_cut_copper_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_cut_copper",
				"typeId": "minecraft:waxed_weathered_cut_copper"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper",
				"typeId": "minecraft:weathered_cut_copper"
			}
		],
		"source": {
			"id": "create:deploying/weathered_cut_copper_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_cut_copper_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_cut_copper"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_cut_copper"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_cut_copper_slab_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper_slab",
				"typeId": "minecraft:oxidized_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper_slab",
				"typeId": "minecraft:weathered_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/weathered_cut_copper_slab_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_cut_copper_slab_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_cut_copper_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_cut_copper_slab_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_cut_copper_slab",
				"typeId": "minecraft:waxed_weathered_cut_copper_slab"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper_slab",
				"typeId": "minecraft:weathered_cut_copper_slab"
			}
		],
		"source": {
			"id": "create:deploying/weathered_cut_copper_slab_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_cut_copper_slab_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_cut_copper_slab"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_cut_copper_slab"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_cut_copper_stairs_from_deoxidising",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:oxidized_cut_copper_stairs",
				"typeId": "minecraft:oxidized_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper_stairs",
				"typeId": "minecraft:weathered_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/weathered_cut_copper_stairs_from_deoxidising",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_cut_copper_stairs_from_deoxidising.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:oxidized_cut_copper_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:deploying/weathered_cut_copper_stairs_from_removing_wax",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:waxed_weathered_cut_copper_stairs",
				"typeId": "minecraft:waxed_weathered_cut_copper_stairs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "minecraft:axes"
			}
		],
		"keepHeldItem": true,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:weathered_cut_copper_stairs",
				"typeId": "minecraft:weathered_cut_copper_stairs"
			}
		],
		"source": {
			"id": "create:deploying/weathered_cut_copper_stairs_from_removing_wax",
			"path": "src/generated/resources/data/create/recipe/deploying/weathered_cut_copper_stairs_from_removing_wax.json",
			"type": "create:deploying"
		},
		"sourceRecipe": {
			"type": "create:deploying",
			"ingredients": [
				{
					"item": "minecraft:waxed_weathered_cut_copper_stairs"
				},
				{
					"tag": "minecraft:axes"
				}
			],
			"keep_held_item": true,
			"results": [
				{
					"id": "minecraft:weathered_cut_copper_stairs"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:emptying/builders_tea",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:builders_tea",
				"typeId": "createbedrock:builders_tea"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:glass_bottle",
				"typeId": "minecraft:glass_bottle"
			},
			{
				"amount": 250,
				"chance": 1,
				"kind": "fluid",
				"sourceId": "create:tea",
				"typeId": "createbedrock:tea"
			}
		],
		"source": {
			"id": "create:emptying/builders_tea",
			"path": "src/generated/resources/data/create/recipe/emptying/builders_tea.json",
			"type": "create:emptying"
		},
		"sourceRecipe": {
			"type": "create:emptying",
			"ingredients": [
				{
					"item": "create:builders_tea"
				}
			],
			"results": [
				{
					"id": "minecraft:glass_bottle"
				},
				{
					"amount": 250,
					"id": "create:tea"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:emptying/honey_bottle",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honey_bottle",
				"typeId": "minecraft:honey_bottle"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:glass_bottle",
				"typeId": "minecraft:glass_bottle"
			},
			{
				"amount": 250,
				"chance": 1,
				"kind": "fluid",
				"sourceId": "create:honey",
				"typeId": "createbedrock:honey"
			}
		],
		"source": {
			"id": "create:emptying/honey_bottle",
			"path": "src/generated/resources/data/create/recipe/emptying/honey_bottle.json",
			"type": "create:emptying"
		},
		"sourceRecipe": {
			"type": "create:emptying",
			"ingredients": [
				{
					"item": "minecraft:honey_bottle"
				}
			],
			"results": [
				{
					"id": "minecraft:glass_bottle"
				},
				{
					"amount": 250,
					"id": "create:honey"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/blaze_cake",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:blaze_cake_base",
				"typeId": "createbedrock:blaze_cake_base"
			},
			{
				"amount": 250,
				"kind": "fluid",
				"sourceId": "minecraft:lava",
				"typeId": "minecraft:lava"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:blaze_cake",
				"typeId": "createbedrock:blaze_cake"
			}
		],
		"source": {
			"id": "create:filling/blaze_cake",
			"path": "src/generated/resources/data/create/recipe/filling/blaze_cake.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "create:blaze_cake_base"
				},
				{
					"type": "neoforge:single",
					"amount": 250,
					"fluid": "minecraft:lava"
				}
			],
			"results": [
				{
					"id": "create:blaze_cake"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/builders_tea",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:glass_bottle",
				"typeId": "minecraft:glass_bottle"
			},
			{
				"amount": 250,
				"kind": "fluid",
				"sourceId": "create:tea",
				"typeId": "createbedrock:tea"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:builders_tea",
				"typeId": "createbedrock:builders_tea"
			}
		],
		"source": {
			"id": "create:filling/builders_tea",
			"path": "src/generated/resources/data/create/recipe/filling/builders_tea.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "minecraft:glass_bottle"
				},
				{
					"type": "neoforge:single",
					"amount": 250,
					"fluid": "create:tea"
				}
			],
			"results": [
				{
					"id": "create:builders_tea"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/chocolate_glazed_berries",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:sweet_berries",
				"typeId": "minecraft:sweet_berries"
			},
			{
				"amount": 250,
				"kind": "fluid",
				"sourceId": "create:chocolate",
				"typeId": "createbedrock:chocolate"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:chocolate_glazed_berries",
				"typeId": "createbedrock:chocolate_glazed_berries"
			}
		],
		"source": {
			"id": "create:filling/chocolate_glazed_berries",
			"path": "src/generated/resources/data/create/recipe/filling/chocolate_glazed_berries.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "minecraft:sweet_berries"
				},
				{
					"type": "neoforge:single",
					"amount": 250,
					"fluid": "create:chocolate"
				}
			],
			"results": [
				{
					"id": "create:chocolate_glazed_berries"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/glowstone",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:cinder_flour",
				"typeId": "createbedrock:cinder_flour"
			},
			{
				"amount": 25,
				"components": {
					"create:potion_fluid_bottle_type": "regular",
					"minecraft:potion_contents": {
						"potion": "minecraft:night_vision"
					}
				},
				"kind": "component_fluid",
				"sourceId": "create:potion",
				"typeId": "createbedrock:potion"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:glowstone_dust",
				"typeId": "minecraft:glowstone_dust"
			}
		],
		"source": {
			"id": "create:filling/glowstone",
			"path": "src/generated/resources/data/create/recipe/filling/glowstone.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "create:cinder_flour"
				},
				{
					"type": "neoforge:components",
					"amount": 25,
					"components": {
						"create:potion_fluid_bottle_type": "regular",
						"minecraft:potion_contents": {
							"potion": "minecraft:night_vision"
						}
					},
					"fluids": "create:potion"
				}
			],
			"results": [
				{
					"id": "minecraft:glowstone_dust"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/grass_block",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:dirt",
				"typeId": "minecraft:dirt"
			},
			{
				"amount": 500,
				"kind": "fluid",
				"sourceId": "minecraft:water",
				"typeId": "minecraft:water"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:grass_block",
				"typeId": "minecraft:grass_block"
			}
		],
		"source": {
			"id": "create:filling/grass_block",
			"path": "src/generated/resources/data/create/recipe/filling/grass_block.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "minecraft:dirt"
				},
				{
					"type": "neoforge:single",
					"amount": 500,
					"fluid": "minecraft:water"
				}
			],
			"results": [
				{
					"id": "minecraft:grass_block"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/gunpowder",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:cinder_flour",
				"typeId": "createbedrock:cinder_flour"
			},
			{
				"amount": 25,
				"components": {
					"create:potion_fluid_bottle_type": "regular",
					"minecraft:potion_contents": {
						"potion": "minecraft:harming"
					}
				},
				"kind": "component_fluid",
				"sourceId": "create:potion",
				"typeId": "createbedrock:potion"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:gunpowder",
				"typeId": "minecraft:gunpowder"
			}
		],
		"source": {
			"id": "create:filling/gunpowder",
			"path": "src/generated/resources/data/create/recipe/filling/gunpowder.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "create:cinder_flour"
				},
				{
					"type": "neoforge:components",
					"amount": 25,
					"components": {
						"create:potion_fluid_bottle_type": "regular",
						"minecraft:potion_contents": {
							"potion": "minecraft:harming"
						}
					},
					"fluids": "create:potion"
				}
			],
			"results": [
				{
					"id": "minecraft:gunpowder"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/honey_bottle",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:glass_bottle",
				"typeId": "minecraft:glass_bottle"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:honey"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:honey_bottle",
				"typeId": "minecraft:honey_bottle"
			}
		],
		"source": {
			"id": "create:filling/honey_bottle",
			"path": "src/generated/resources/data/create/recipe/filling/honey_bottle.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "minecraft:glass_bottle"
				},
				{
					"type": "neoforge:tag",
					"amount": 250,
					"tag": "c:honey"
				}
			],
			"results": [
				{
					"id": "minecraft:honey_bottle"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/honeyed_apple",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:apple",
				"typeId": "minecraft:apple"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:honey"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:honeyed_apple",
				"typeId": "createbedrock:honeyed_apple"
			}
		],
		"source": {
			"id": "create:filling/honeyed_apple",
			"path": "src/generated/resources/data/create/recipe/filling/honeyed_apple.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "minecraft:apple"
				},
				{
					"type": "neoforge:tag",
					"amount": 250,
					"tag": "c:honey"
				}
			],
			"results": [
				{
					"id": "create:honeyed_apple"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/redstone",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:cinder_flour",
				"typeId": "createbedrock:cinder_flour"
			},
			{
				"amount": 25,
				"components": {
					"create:potion_fluid_bottle_type": "regular",
					"minecraft:potion_contents": {
						"potion": "minecraft:strength"
					}
				},
				"kind": "component_fluid",
				"sourceId": "create:potion",
				"typeId": "createbedrock:potion"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:redstone",
				"typeId": "minecraft:redstone"
			}
		],
		"source": {
			"id": "create:filling/redstone",
			"path": "src/generated/resources/data/create/recipe/filling/redstone.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "create:cinder_flour"
				},
				{
					"type": "neoforge:components",
					"amount": 25,
					"components": {
						"create:potion_fluid_bottle_type": "regular",
						"minecraft:potion_contents": {
							"potion": "minecraft:strength"
						}
					},
					"fluids": "create:potion"
				}
			],
			"results": [
				{
					"id": "minecraft:redstone"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:filling/sweet_roll",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "minecraft:bread",
				"typeId": "minecraft:bread"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:milk"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:sweet_roll",
				"typeId": "createbedrock:sweet_roll"
			}
		],
		"source": {
			"id": "create:filling/sweet_roll",
			"path": "src/generated/resources/data/create/recipe/filling/sweet_roll.json",
			"type": "create:filling"
		},
		"sourceRecipe": {
			"type": "create:filling",
			"ingredients": [
				{
					"item": "minecraft:bread"
				},
				{
					"type": "neoforge:tag",
					"amount": 250,
					"tag": "c:milk"
				}
			],
			"results": [
				{
					"id": "create:sweet_roll"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:item_application/andesite_casing_from_log",
		"ingredients": [
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:stripped_logs"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:andesite_alloy",
				"typeId": "createbedrock:andesite_alloy"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:andesite_casing",
				"typeId": "createbedrock:andesite_casing"
			}
		],
		"source": {
			"id": "create:item_application/andesite_casing_from_log",
			"path": "src/generated/resources/data/create/recipe/item_application/andesite_casing_from_log.json",
			"type": "create:item_application"
		},
		"sourceRecipe": {
			"type": "create:item_application",
			"ingredients": [
				{
					"tag": "c:stripped_logs"
				},
				{
					"item": "create:andesite_alloy"
				}
			],
			"results": [
				{
					"id": "create:andesite_casing"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:item_application/andesite_casing_from_wood",
		"ingredients": [
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:stripped_woods"
			},
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:andesite_alloy",
				"typeId": "createbedrock:andesite_alloy"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:andesite_casing",
				"typeId": "createbedrock:andesite_casing"
			}
		],
		"source": {
			"id": "create:item_application/andesite_casing_from_wood",
			"path": "src/generated/resources/data/create/recipe/item_application/andesite_casing_from_wood.json",
			"type": "create:item_application"
		},
		"sourceRecipe": {
			"type": "create:item_application",
			"ingredients": [
				{
					"tag": "c:stripped_woods"
				},
				{
					"item": "create:andesite_alloy"
				}
			],
			"results": [
				{
					"id": "create:andesite_casing"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:item_application/bound_cardboard_inworld",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:cardboard_block",
				"typeId": "createbedrock:cardboard_block"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:strings"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:bound_cardboard_block",
				"typeId": "createbedrock:bound_cardboard_block"
			}
		],
		"source": {
			"id": "create:item_application/bound_cardboard_inworld",
			"path": "src/generated/resources/data/create/recipe/item_application/bound_cardboard_inworld.json",
			"type": "create:item_application"
		},
		"sourceRecipe": {
			"type": "create:item_application",
			"ingredients": [
				{
					"item": "create:cardboard_block"
				},
				{
					"tag": "c:strings"
				}
			],
			"results": [
				{
					"id": "create:bound_cardboard_block"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:item_application/brass_casing_from_log",
		"ingredients": [
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:stripped_logs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:ingots/brass"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:brass_casing",
				"typeId": "createbedrock:brass_casing"
			}
		],
		"source": {
			"id": "create:item_application/brass_casing_from_log",
			"path": "src/generated/resources/data/create/recipe/item_application/brass_casing_from_log.json",
			"type": "create:item_application"
		},
		"sourceRecipe": {
			"type": "create:item_application",
			"ingredients": [
				{
					"tag": "c:stripped_logs"
				},
				{
					"tag": "c:ingots/brass"
				}
			],
			"results": [
				{
					"id": "create:brass_casing"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:item_application/brass_casing_from_wood",
		"ingredients": [
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:stripped_woods"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:ingots/brass"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:brass_casing",
				"typeId": "createbedrock:brass_casing"
			}
		],
		"source": {
			"id": "create:item_application/brass_casing_from_wood",
			"path": "src/generated/resources/data/create/recipe/item_application/brass_casing_from_wood.json",
			"type": "create:item_application"
		},
		"sourceRecipe": {
			"type": "create:item_application",
			"ingredients": [
				{
					"tag": "c:stripped_woods"
				},
				{
					"tag": "c:ingots/brass"
				}
			],
			"results": [
				{
					"id": "create:brass_casing"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:item_application/copper_casing_from_log",
		"ingredients": [
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:stripped_logs"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:ingots/copper"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_casing",
				"typeId": "createbedrock:copper_casing"
			}
		],
		"source": {
			"id": "create:item_application/copper_casing_from_log",
			"path": "src/generated/resources/data/create/recipe/item_application/copper_casing_from_log.json",
			"type": "create:item_application"
		},
		"sourceRecipe": {
			"type": "create:item_application",
			"ingredients": [
				{
					"tag": "c:stripped_logs"
				},
				{
					"tag": "c:ingots/copper"
				}
			],
			"results": [
				{
					"id": "create:copper_casing"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:item_application/copper_casing_from_wood",
		"ingredients": [
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:stripped_woods"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:ingots/copper"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:copper_casing",
				"typeId": "createbedrock:copper_casing"
			}
		],
		"source": {
			"id": "create:item_application/copper_casing_from_wood",
			"path": "src/generated/resources/data/create/recipe/item_application/copper_casing_from_wood.json",
			"type": "create:item_application"
		},
		"sourceRecipe": {
			"type": "create:item_application",
			"ingredients": [
				{
					"tag": "c:stripped_woods"
				},
				{
					"tag": "c:ingots/copper"
				}
			],
			"results": [
				{
					"id": "create:copper_casing"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:item_application/railway_casing",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:brass_casing",
				"typeId": "createbedrock:brass_casing"
			},
			{
				"count": 1,
				"kind": "tag",
				"tag": "c:plates/obsidian"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:railway_casing",
				"typeId": "createbedrock:railway_casing"
			}
		],
		"source": {
			"id": "create:item_application/railway_casing",
			"path": "src/generated/resources/data/create/recipe/item_application/railway_casing.json",
			"type": "create:item_application"
		},
		"sourceRecipe": {
			"type": "create:item_application",
			"ingredients": [
				{
					"item": "create:brass_casing"
				},
				{
					"tag": "c:plates/obsidian"
				}
			],
			"results": [
				{
					"id": "create:railway_casing"
				}
			]
		},
		"strategy": "port_runtime"
	},
	{
		"id": "create:sandpaper_polishing/rose_quartz",
		"ingredients": [
			{
				"count": 1,
				"kind": "item",
				"sourceId": "create:rose_quartz",
				"typeId": "createbedrock:rose_quartz"
			}
		],
		"keepHeldItem": false,
		"results": [
			{
				"chance": 1,
				"count": 1,
				"kind": "item",
				"sourceId": "create:polished_rose_quartz",
				"typeId": "createbedrock:polished_rose_quartz"
			}
		],
		"source": {
			"id": "create:sandpaper_polishing/rose_quartz",
			"path": "src/generated/resources/data/create/recipe/sandpaper_polishing/rose_quartz.json",
			"type": "create:sandpaper_polishing"
		},
		"sourceRecipe": {
			"type": "create:sandpaper_polishing",
			"ingredients": [
				{
					"item": "create:rose_quartz"
				}
			],
			"results": [
				{
					"id": "create:polished_rose_quartz"
				}
			]
		},
		"strategy": "port_runtime"
	}
];
