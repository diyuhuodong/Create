# S3-14 原生红石目标版本决策

## 决策

生产包基线已升级到 `min_engine_version: 1.26.0`、行为包 JSON `format_version: 1.26.0` 与稳定 `@minecraft/server` `2.5.0`。不启用 Upcoming Creator Features。这个基线同时覆盖 `minecraft:redstone_producer` 的最低 1.21.120 格式要求，以及自 1.26.0 起无需实验开关的 `minecraft:redstone_consumer`。

现有 Andesite Funnel、Clutch、Gearshift、Sequenced Gearshift、Adjustable Chain Gearshift 与 Mechanical Pump 暂时继续使用低预算、fail-closed 的 `Block.getRedstonePower()` 轮询。原生 consumer 事件会按设备逐项接入，不能因升级版本而改变已有存档或控制语义。

## 29 项红石工作

Analog Lever、Content Observer、Pulse 元件、Redstone Link/Requester、Rotation Speed Controller、Display/Stock Link 与 Nixie Tube 的 29 条矩阵记录已从 `blocked` 转为 `specification_pending`，统一归属 S3-14。它们仍未生成空壳方块、物品或伪输出；每条 acceptance ID 都必须在 BP/RP、状态、配方、持久化与正向/失败/重启/并发测试齐备后才可升级状态。

## 验收

S3-14 契约检查两份 manifest、脚本 API、方块格式、非实验目标、矩阵、工作队列、现有导电输入方块及所有待实现 acceptance ID。Windows、测试 Realm 与 PS 的加载和红石回归仍由 S3-15 记录；未记录前不得声明 Realm/主机可发布。

参考：[redstone producer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_producer?view=minecraft-bedrock-stable)、[redstone consumer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer?view=minecraft-bedrock-stable)、[1.26.0 更新说明](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.0?view=minecraft-bedrock-stable)。
