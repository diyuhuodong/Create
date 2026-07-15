# S4 动态机械 v2 设计

## 目标

以可恢复的动态 assembly 取代当前 Bearing 原型：原型只支持 16 个白名单方块、绕 Y 轴旋转和仅用于显示的 part 实体。S4 使 Mechanical/Windmill Bearing、移动接触器和 Elevator Contact 共享同一权威状态，同时保持 Realm 和 PS 可承受的确定性预算。

## 不变量

1. 持久化 assembly record 是唯一真相；marker/part 实体仅是可重建的呈现投影。
2. 一次 assembly 只能处于 `assembling`、`active`、`disassembling`、`frozen` 之一；同一 source block 或 destination cell 不可被两个事务拥有。
3. 方块、方块状态、附件状态和 transform 在同一 root-pointer 写入后才允许移除世界方块；任一失败按 journal 反向回滚。
4. 库存、物流 escrow、动力、加工和红石只能通过移动方块数据适配器捕获/恢复，禁止独立复制账本。
5. 碰撞使用 transform 的 swept occupancy；未加载区、实体生成失败或冲突一律冻结，不猜测继续移动。

## 权威数据与存储

`dynamic_assembly` 根记录存 `id`、`dimensionId`、owner（bearing/elevator）、`phase`、`epoch`、`transform`、`snapshotRoot`、`blockCount`、`frozenReason`。`transform` 采用固定点整数（位置 1/4096 格、角度 1/1000 度），运行时才转换为 Bedrock 浮点 API。

snapshot 按原 source chunk 分片，含 block relative location、permutation、data-adapter payload、attachment reference 与 checksum。使用现有 `ShardedStateStore` 的 generation/root-pointer 切换；根记录只在全部 chunk snapshot 已落盘后提交。默认预算为每 tick 处理 32 blocks、每 assembly 512 blocks，运行时配置可提高但须在 Windows/Realm 压测证明安全，不能回退为 16 方块限制。

## 生命周期

```text
collect → persist snapshot → remove world blocks → spawn projection → active
active → swept collision / contact sample → update transform → persist projection
active → reserve destination → place blocks → restore adapters → remove projection → complete
任一步失败 → rollback 或 frozen（保留权威 snapshot，等待恢复）
```

恢复时先读取并校验所有 snapshot shard，再寻找或重建 projection；不得因实体缺失丢失 assembly。拆解先逐格预检 destination ownership，再写入并验证，写入失败仅回滚本次已写格；成功后才释放 source ownership 和删除实体。

## 接口边界

`DynamicAssemblyController` 负责事务、phase、锁和恢复；`DynamicAssemblyWorldPort` 仅访问 Bedrock 方块、实体和碰撞查询。`AssemblyTransform` 提供旋转/平移、离散占位、swept path 与 world/local 坐标转换。`MovingBlockDataAdapter` 扩为带 `schemaVersion`、`capture`、`detach`、`restore`、`validate` 的异步安全契约；R4.2 已为动力、传送、物流、加工和红石注册适配器。Depot/Item Hatch/Item Vault/Creative Crate 会把位置派生 ID、库存、地址配置及历史幂等回执重键到拆解坐标；含 journal、escrow、belt/funnel/chute 或 pending order 引用时拒绝组装。

投影使用一个 marker 加批量 part entities。part entity 均携带 assembly ID、relative position、adapter kind 与 epoch；过期 epoch 的实体在恢复/每次投影刷新时清理，避免双投影。实体碰撞由 world port 扫描并按“冻结优先”处理；玩家/生物不写入 assembly state。

## 接触器与电梯

Redstone Contact 计算两个 assembly/world contact face 在同一 transform tick 的面重叠及相对朝向，只在 false→true / true→false 边沿写入原生红石输出。实现使用 `MotionContactTracker`：动态触点之间只保留权威边沿，命中固定世界触点时才更新其 Bedrock block state，因此 marker 位置不参与逻辑。Elevator Contact 是 column registry 的持久化端点：以 X/Z 列、楼层 ID、显示名和朝向注册；移动 cabin 的底部 transform 穿越楼层平面时触发一次，停靠后写入当前楼层。两者都不从 marker 位置推断逻辑。

## 迁移与验收

保留 v1 contraption record 的只读恢复路径：它升级为单 shard、Y-rotation transform、`active` phase；新 assembly 不再写 v1。R4.1 覆盖 64/256 block、重启、实体丢失、并发组装和碰撞冻结；R4.2 覆盖每类 adapter 的一次捕获/恢复；R4.3 覆盖运动接触边沿与电梯跨楼层；R4.4 已静态覆盖粉碎轮的处理中批次/端口重键，以及完整空闲 belt 路径的捕获、回滚和重建。Windows 冒烟后再进入 R6 Realm/PS 证据，不以 Node 测试替代平台结论。
