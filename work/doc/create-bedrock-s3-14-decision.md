# S3-14 原生红石目标版本决策

## 决策

生产包基线已升级到 `min_engine_version: 1.26.0`、行为包 JSON `format_version: 1.26.0` 与稳定 `@minecraft/server` `2.5.0`。不启用 Upcoming Creator Features。这个基线同时覆盖 `minecraft:redstone_producer` 的最低 1.21.120 格式要求，以及自 1.26.0 起无需实验开关的 `minecraft:redstone_consumer`。

Andesite Funnel、Clutch、Gearshift、Sequenced Gearshift、Adjustable Chain Gearshift 与 Mechanical Pump 已声明 `minecraft:redstone_consumer` 和 `createbedrock:redstone_input`。稳定 `onRedstoneUpdate` 事件立即进入 `RedstoneSignalBus`；低预算、fail-closed 的 `Block.getRedstonePower()` 轮询仅在事件不可用、读取失败或区块不可用时恢复安全状态。迁移不会改变既有控制 ID 或持久化定位。

## 29 项红石工作

Analog Lever、Content Observer、Crushing Wheel Controller、Lectern/Linked Controller、Pulse 元件、Redstone Link/Requester、Rotation Speed Controller、Display/Stock Link 与 Nixie Tube 的 29 条矩阵记录统一归属 S3-14。R0–R5 的代码现为 `implementation_complete_pending_static_validation`：16 个方块和 1 个物品均具有 BP/RP、原生 consumer/producer、持久化状态、配方、掉落、双语文本、转换资源和确定性测试入口。Linked Controller 的六频道状态保存在非堆叠 ItemStack，Lectern 使用服务端会话；Requester/Stock Link 已接入地址化 Depot 网络和可恢复 journal；调速器接入约束化的动力/应力端口；Contact 已接入移动 transform 与电梯回调；Display/Nixie 使用可恢复显示实体；Crusher 已使用受管 Depot 端点与物理皮带交接。

这不是平台通过声明：当前没有执行本轮静态回归，矩阵仍是 `implementation_in_progress`，Windows、Realm 与 PS 账本均为 pending。静态契约将每台设备连接到实际运行时符号和测试路径，详见 [S3-14 静态完成设计](create-bedrock-s3-14-static-completion-design.md)。

## 验收

S3-14 契约检查两份 manifest、脚本 API、方块格式、非实验目标、矩阵、工作队列、所有输入与输出方块、配方、掉落、语言、状态运行时和构建后几何。Windows、测试 Realm 与 PS 的加载和红石回归仍由 S3-15 记录；未记录前不得声明 Realm/主机可发布。

参考：[redstone producer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_producer?view=minecraft-bedrock-stable)、[redstone consumer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer?view=minecraft-bedrock-stable)、[1.26.0 更新说明](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.0?view=minecraft-bedrock-stable)。
