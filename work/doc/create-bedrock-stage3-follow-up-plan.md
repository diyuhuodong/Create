# Create Bedrock 阶段 3 后续开发计划

**状态：** S3-14 已升级到 1.26.0 非实验原生红石基线；29 项红石条目均已进入有资源、持久化状态和原生 I/O 的 `implementation_in_progress`，尚未达到 Create 语义完整或 `static_verified`。S3-15 已完成平台验收账本、性能基线和静态防伪校验，但 Windows、测试 Realm 与 PS 的物理验收仍全部待执行

**基线：** S3-7 已提交为 `378853863`。阶段 3 共有 245 条矩阵记录：15 条 `static_verified`、113 条 `implementation_in_progress`、117 条 `specification_pending`、0 条 `blocked`。本计划只处理 `phase: 3`；移动机械、蓝图和机械 actor 仍属于阶段 4，列车调度和高级物流属于阶段 5。

## 目标与总规则

每个开发包只接收一组明确的 Java identifier。开始编码前必须为该组补齐 Bedrock identifier、依赖、配方结论、持久化 schema、资源清单和验收项；完成后才可从 `specification_pending` 变为 `implementation_in_progress` 或 `static_verified`。不得用注册空壳、临时立方体或未分类配方扩大“完成”统计。

每包必须包含正向、失败、重启和并发 Node 测试，并执行 `npm test`、`npm run validate`、`npm run matrix`、`npm run build` 和 `npm run pack`。Windows、Realm、PS 结果始终另行记录。

## 队列与顺序

| 包 | 范围与交付物 | 前置条件 | 静态退出条件 |
|---|---|---|---|
| S3-8 | 规格锁定与基础材料。先为 201 项建立按依赖分组的工作清单；首批只实现不依赖未迁移机器的材料、装饰/结构方块与其获取路径。 | 无 | 每条首批记录有规格、资源、配方结论和测试归属。 |
| S3-9 | 固定动力扩展：机壳轴/齿轮、gearshift、可调链传动、creative motor、大水车、飞轮、金属桁架轴、链式输送机、蒸汽引擎/动力轴、顺序变速器、风车轴承。 | S3-8 的材料与配方依赖已落地。 | 27 条直接实现与 6 条共享运行时吸收；33 条规格锁定且无移交。网络传动比、方向、过载、快速控制更新、流体断供、在途物品保护、动态结构持久化和重启均有静态测试；资源契约覆盖新增方块。 |
| S3-10 | 基础物流闭环：可放置/可见 belt、物品渲染、depot/chute/funnel 变体、filter、tunnel、item vault。 | S3-9 提供稳定动力输入。 | 端到端转移、过滤、满端、反向、断带、重启和并发不复制/吞没物品。 |
| S3-11 | 固定加工扩展：basin、mechanical mixer、mechanical saw、encased fan；扩展源配方分类报告。 | S3-8 材料、S3-9 动力、S3-10 端口可用。 | 每个支持配方均为 migrated 或显式 blocked；机器状态和随机结果可重启恢复。 |
| S3-12 | 流体扩展：glass/encased/smart pipe、valve、drain、spout、portable interface。 | S3-8 材料、现有 Tank/Pump 事务内核。 | 容量守恒、分支竞争、阀门、外部端点异常和重启恢复测试通过。 |
| S3-13 | 资源等价性收敛：Crushing Wheel 的 OBJ 派生可移植几何、belt 几何/物品可视化、Tank 液面与多方块视觉。 | 相应行为已稳定。 | 不再用 full-block fallback 宣称模型完成；构建产物契约验证模型、贴图、语言和掉落/获取路径。 |
| S3-14 | 1.26.0 原生红石基线与 29 项设备实现。使用 non-experimental consumer/producer、事件输入和安全轮询回退。 | S3-6 的稳定输入总线。 | manifest、方块格式、脚本 API、矩阵、队列、资源、状态运行时和每个 acceptance ID 由契约一致校验。 |
| S3-15 | 平台验收与性能收敛。 | S3-8 至 S3-14 的代码范围完成。 | 已交付可校验账本和性能基线；Windows 本地世界、测试 Realm、PS 仍需分别完成烟雾测试、双人并发和 30 分钟压力记录。 |

## 工作量边界

当前未达到 `static_verified` 的条目按域分布为：内容 116、动力 33、物流 26、流体 18、加工 8、红石 29。S3-8 只负责将它们按实际依赖分批和交付第一批基础内容，不尝试一次性实现全部条目。S3-14 已为全部红石条目交付基础实现；升级版本或静态文件存在均不等同于 Create 语义完成。

## 已完成开发包

1. 已完成：从迁移矩阵生成按域、kind、依赖的 245 条工作清单，并校验每项都有配方、资源、掉落、测试和 blocker 字段。
2. 已完成：以“原版材料可表达、无移动机械依赖、无实验 API”为筛选条件，交付 `andesite_alloy_block`、`zinc_ore`、`deepslate_zinc_ore`、`raw_zinc_block`、`rose_quartz_block`、`weathered_iron_block` 与支撑物品的 BP、RP、语言、创造获取、掉落和基础配方。
3. 已完成：资源契约从 8 个静态方块扩展到 14 个已交付内容方块。矿石自然生成、Silk Touch、Fortune、未转换 OBJ/动画和多方块外观仍为 partial。
4. 已完成：110 条 S3-8B 内容记录已逐项固化 Java 配方/掉落/资产来源、行为边界、后续实现包和测试策略。后续按该规格由 S3-9 至 S3-14、S4、S6 实现；Windows、Realm、PS 实机验证仍保留到 S3-15。
5. 已完成：S3-9 以 `stage3-kinetic-specifications.json` 锁定并实现全部 33 条动力记录：27 条直接实现、6 条共享运行时吸收。链式输送机复用持久化 DepotNetwork，蒸汽引擎驱动动力轴，顺序变速器持久化程序，风车轴承复用动态结构控制器；不存在以空壳方块替代的移交项。
6. 已完成：S3-13 以标准 Bedrock cuboid 几何替换 Crushing Wheel 的 full-block fallback，并在构建时保留 Java OBJ 作为来源证据；不使用已弃用的 `poly_mesh`。belt 根据相邻同向段持久化 start/middle/end 视觉状态；Tank 根据内容物和上下相邻 Tank 持久化液面、液体类型及单体/顶端/中段/底端视觉。构建会生成最小水/岩浆液面贴图并验证生成资源；Windows、Realm 与 PS 的实际渲染仍由 S3-15 记录。
7. 已完成：S3-14 将 manifest、行为包格式与 Script API 升至 1.26.0 / 2.5.0 非实验原生红石基线。六类既有输入接入 native consumer 事件并保留 fail-closed 轮询回退；29 条输出/显示/计时记录均具有 producer/consumer 声明、资源、状态运行时和契约测试，并在矩阵与队列中标为 `implementation_in_progress`。后续增量已加入六频道 Linked Controller、跨 Depot 来源的 Requester intent、网络化可配置调速器和双粉碎轮控制器的持久化物品加工。Create 专属 UI/文本、物品栈配置、完整物流/传动语义和移动机械/电梯联动仍是后续实现，详见 [S3-14 决策](create-bedrock-s3-14-decision.md)。
8. 已完成：S3-15 交付 `s3-15-platform-acceptance.json`、性能基线和校验器，固定 Windows、测试 Realm、PS 各九项场景、双人和 30 分钟门槛。当前所有记录均为 `pending`；只有每项写入真实证据后才能声明平台通过。执行步骤见 [S3-15 平台验收](create-bedrock-s3-15-platform-acceptance.md)。

## 风险控制

- 不把 `specification_pending` 改为完成来改善数字；矩阵状态必须由行为、资源和测试共同证明。
- 先交付固定方块与服务端权威逻辑，再处理客户端高复杂度资源；资源缺失时维持 `partial`。
- 1.26.0 生产包允许稳定的 `minecraft:redstone_consumer` 与 `minecraft:redstone_producer`，但每个声明都必须保持 1.26.0 格式、无实验开关，并有对应的行为、资源和测试；不得因解除版本 blocker 而提前标记完成。
- 每包完成后自动回归当前测试、源包校验和生成包检查；平台测试失败会阻止下一阶段的发布声明。
