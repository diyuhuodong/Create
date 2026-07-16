# Create Bedrock 阶段 4 主执行计划

## 目标与边界

阶段 4 将阶段 3 已静态验证的固定世界系统扩展为可恢复的动态结构和蓝图系统。权威范围是迁移矩阵的 54 条 `phase: 4` 记录：42 条 `contraptions`、12 条 `schematics`。完成定义是每条记录都有可用行为、持久化/恢复规则、配方与资源、Node 静态证据；Windows、Realm、PS 的真实运行证据仍由平台验收账本单独记录。

不把现有 16 方块 Bearing 原型当作目标实现。动态结构必须使用 [`S4 动态机械 v2 设计`](create-bedrock-s4-dynamic-mechanics-design.md) 的 `dynamic_assembly` 权威记录、分片快照、固定点 transform、所有权锁、journal 回滚和冻结优先碰撞规则。实体只是可重建投影，不能保存唯一状态。

## 现有基线与 P4.0

代码已有 `DynamicAssemblyController`、`AssemblyTransform`、`MovingBlockDataAdapter`、碰撞/恢复测试、`MotionContactTracker` 和 Elevator Contact 状态。P4.0 的工作不是重新实现它们，而是：

1. 为 54 条记录建立阶段 4 工作队列和静态契约；每条绑定行为路径、资源、存档 schema、Java 来源和测试。
2. 审核旧 Bearing 记录的只读迁移、16 方块限制和恢复路径；新 assembly 一律走分片快照，限制提升到设计中的默认 512 方块。
3. 将动态装配诊断纳入统一预算，默认每 tick 32 blocks、全局 64 个运行组；超预算、未加载区、碰撞、投影失败均 `frozen`，不能继续猜测运动。

P4.0 通过后才允许将各功能从 `specification_pending` 提升为 `implementation_in_progress`。

## 开发包与矩阵归属

| 包 | 条目 | 内容 | 前置与退出条件 |
|---|---:|---|---|
| P4.1 | 4 | `contraption`、`stationary_contraption` 实体；Contraption Controls 方块/方块实体 | 将 Bearing/Windmill 接到权威 assembly；组装、重启、投影丢失、拆解回滚通过。 |
| P4.2 | 15 | 机械活塞/头/黏性活塞；绳索滑轮、绳索、磁铁、软管滑轮；龙门轴、销、小车、结构 | 只允许连续 transform 和 swept occupancy；伸缩、反向、满载、冲突冻结、重启与拆解准确恢复。 |
| P4.3 | 4 | Elevator Contact、Elevator Pulley 的方块与方块实体 | 持久化 X/Z 列、楼层、请求和到站；跨层只触发一次，移动接触器使用边沿输出。 |
| P4.4 | 8 | Deployer、Drill、Harvester、Mechanical Drill、Mechanical Harvester、Mechanical Arm | actor 只能在动态快照坐标执行；物品/流体/加工经适配器和事务内核转移，禁止掉落物复制。 |
| P4.5 | 9 | Cart Assembler、Minecart Anchor、Coupling、三类矿车结构物品、Carriage Contraption、Seat | 装配、座位、路线所有权和拆解同属一个事务；先复用现有轨道/列车持久化，不宣称完整列车调度。 |
| P4.6 | 2 | Sticker 方块与方块实体 | 黏附图遍历与 Super Glue 统一；无效黏附、循环、跨 assembly 所有权冲突必须拒绝。 |
| P4.7 | 12 | Clipboard、Crafting Blueprint、Schematic、Schematic Table、Schematicannon、Wand of Symmetry | 蓝图采用受限、版本化快照；放置前逐格预检/事务化写入，禁止任意文件读写或部分复制。 |

P4.1–P4.6 共 42 条动态机械记录，P4.7 为 12 条蓝图记录，合计 54 条。每包必须一次交付 BP/RP 定义、服务器行为、存档迁移、配方/掉落/创造入口、EN/ZH 文本和资源来源；不能用空壳注册或替代工作台配方伪造可用性。

## 关键设计约束

### 动态结构

一个 source block、destination cell、库存/物流 escrow 在同一时刻只能被一个 assembly 所有。捕获顺序固定为 `collect → snapshot 落盘 → detach adapters → remove blocks → projection`；拆解按 `reserve destination → place → restore adapters → verify → release` 执行。任一步失败只能回滚本次写入或冻结，绝不删除权威快照。

`MovingBlockDataAdapter` 继续负责动力、加工、红石、库存和物流端点的 capture/detach/restore/validate。含进行中 journal、escrow、传送带、漏斗、溜槽或待处理请求的端点默认拒绝移动；先实现明确的拒绝语义，再扩展为可迁移事务。

### Actor、矿车与蓝图

Actor 的目标选择、冷却、输入和输出必须持久化并由服务器执行；视觉实体不参与判定。矿车结构与动态 assembly 共享快照和锁，但不提前实现阶段 5 的信号调度、货运网络或完整车站行为。

蓝图数据仅保存 Add-On 自己的版本化方块快照、允许的方块类型与必要的 adapter payload；Schematicannon 分批预检、占位、写入和回滚。Clipboard 文本和对称放置同样走长度、面积和每 tick 预算，避免 Realm Dynamic Property 或 tick 预算失控。

## 开发顺序与静态门槛

严格顺序为 `P4.0 → P4.1 → P4.2 → P4.3 → P4.4 → P4.5 → P4.6 → P4.7`。P4.3 可在 P4.2 的 transform/恢复契约稳定后并行准备资源，但不得提前提升矩阵状态；P4.5 只能复用已验证的装配事务。每个包完成后：

1. 新增该包的 Node 单元/契约测试：事务排序、幂等恢复、并发占位、预算、资源定义和所有 acceptance ID 覆盖。
2. 运行 `npm test`、`npm run validate`、`npm run build`、`npm run pack`；构建产物必须包含 BP/RP，且无 Content Log 预期之外的静态定义错误。
3. 仅在队列、矩阵、实现和测试一致时，提升为 `static_verified`；平台状态保持 `pending`，不得从 Node 结果推断 Realm 或 PS 可运行。

## 平台验收与发布门槛

静态收口后按 [S3-15 平台验收计划](create-bedrock-s3-15-platform-acceptance.md) 使用同一 `.mcaddon` 执行 Windows 本地世界、两人测试 Realm、PS 加入 Realm 三层验证。阶段 4 额外必须记录：256 方块 assembly 的组装/重启/投影丢失、活塞与滑轮反向、跨层电梯、actor 的物品守恒、矿车乘坐/拆解、蓝图冲突回滚，以及双人 30 分钟压力。

只有 54 条均 `static_verified` 且三平台证据完整，才能声明阶段 4 已验收；在此之前只可称为“静态完成”或“平台验证待执行”。
