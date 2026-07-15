# S3-14 红石目标版本决策

## 决策

第一版继续采用 `min_engine_version: 1.21.80` 的 Realm/PS 兼容基线，不开启 Upcoming Creator Features，也不声明 `minecraft:redstone_producer` 或 `minecraft:redstone_consumer`。两份 manifest、运行时目标模块与 `s3-14-redstone-decision.json` 必须保持一致。

已实现的输入控制维持低预算、已注册方块的 `Block.getRedstonePower()` 轮询：Andesite Funnel、Clutch、Gearshift、Sequenced Gearshift、Adjustable Chain Gearshift 和 Mechanical Pump。读取失败、区块不可用或 API 不可用时一律失效关闭；恢复到可读取的零功率后才恢复工作。控制点、轮转游标和持久化边界继续由 `RedstoneSignalBus` 管理。

## 输出范围

29 条输出/显示/定时相关矩阵条目保留为 `blocked`，包括 Analog Lever、Content Observer、各 Pulse 元件、Redstone Link/Requester、Rotation Speed Controller、Display/Stock Link 与 Nixie Tube。它们不生成空壳 BP 方块、物品或伪输出；每个 acceptance ID 都在 `bedrock/data/s3-14-redstone-decision.json` 中显式列出，并与迁移矩阵和工作队列逐一校验。

## 升级门槛

官方文档要求 producer 至少使用 1.21.120 block format；consumer 至少 1.21.130，且在 1.26.0 前仍要求实验开关。因此改变本决策必须同时：提高 Bedrock/Realm 最低目标到稳定组件版本、保持生产包无实验功能、在 Windows、测试 Realm 和 PS 记录成功加载与红石回归。平台记录属于 S3-15，未完成前不能改变这 29 条的矩阵状态。

参考：[redstone producer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_producer?view=minecraft-bedrock-stable)、[redstone consumer](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_redstone_consumer?view=minecraft-bedrock-stable)。
