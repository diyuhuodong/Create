# S3-14 原生红石目标版本决策

## 决策

生产包基线已升级到 `min_engine_version: 1.26.0`、行为包 JSON `format_version: 1.26.0` 与稳定 `@minecraft/server` `2.5.0`。不启用 Upcoming Creator Features。这个基线同时覆盖 `minecraft:redstone_producer` 的最低 1.21.120 格式要求，以及自 1.26.0 起无需实验开关的 `minecraft:redstone_consumer`。

Andesite Funnel、Clutch、Gearshift、Sequenced Gearshift、Adjustable Chain Gearshift 与 Mechanical Pump 已声明 `minecraft:redstone_consumer` 和 `createbedrock:redstone_input`。稳定 `onRedstoneUpdate` 事件立即进入 `RedstoneSignalBus`；低预算、fail-closed 的 `Block.getRedstonePower()` 轮询仅在事件不可用、读取失败或区块不可用时恢复安全状态。迁移不会改变既有控制 ID 或持久化定位。

## 29 项红石工作

Analog Lever、Content Observer、Crushing Wheel Controller、Lectern/Linked Controller、Pulse 元件、Redstone Link/Requester、Rotation Speed Controller、Display/Stock Link 与 Nixie Tube 的 29 条矩阵记录统一归属 S3-14，现为 `implementation_in_progress`。17 个设备记录对应 16 个方块和 1 个物品；它们具有 BP/RP、原生 consumer/producer、持久化状态、配方、掉落、双语文本、Java 资产转换和确定性单元/契约测试。Link 现使用双物品频率、0–15 模拟强度、256 格范围，以及按玩家热栏位选择的六个持久化 Controller 频道；Requester 会把一笔订单拆成多个 Depot 的崩溃可恢复 journal intent，Stock Link 读取相邻 Depot 阈值。调速器作为持久化的可配置动力节点驱动已连接的 Bedrock 动力网络；接触器自动匹配相对面；显示强度映射到原生亮度。Crushing Wheel Controller 仅在中间两格、同轴且反向旋转的一对轮子存在时激活，并持久化其物品加工状态。仍不等同于 Create 完整功能：Controller/Display/Nixie 的 GUI 与文本渲染、按物品栈保存的 Controller 配置、完整物流网络/包裹、Java 调速器的逐齿轮传动语义、移动机械/电梯接触，以及控制器的实体吸入和皮带直接输入仍待实现和实机验证。

## 验收

S3-14 契约检查两份 manifest、脚本 API、方块格式、非实验目标、矩阵、工作队列、所有输入与输出方块、配方、掉落、语言、状态运行时和构建后几何。Windows、测试 Realm 与 PS 的加载和红石回归仍由 S3-15 记录；未记录前不得声明 Realm/主机可发布。

参考：[redstone producer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_producer?view=minecraft-bedrock-stable)、[redstone consumer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer?view=minecraft-bedrock-stable)、[1.26.0 更新说明](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.0?view=minecraft-bedrock-stable)。
