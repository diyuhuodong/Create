# Create Bedrock 阶段 5 主执行计划

## 目标、范围与完成定义

阶段 5 迁移 Create 的列车调度与包裹物流。迁移矩阵中有 25 条 `phase: 5` 记录：列车域 13 条、物流域 12 条。P5.0–P5.4 的静态实现、资源、配方、语言、持久化边界与 Node 证据现已完成，25 条均为 `static_verified`。Windows 本地世界、Realm 和 PS 的真实运行证据仍须单独记录；静态通过不等于可在主机发布。

本阶段不重做阶段 4 的动态结构，也不重新实现阶段 3 的物品事务。它将二者接入统一的列车权威和包裹事务：P4.5 的矿车结构成为列车参与者，阶段 3 的 Depot、belt、funnel、chute、Stock Ticker 与 escrow 成为包裹端点。

## 已核对的来源与边界

Java 侧的关键语义已定位到 `content/trains/{signal,observer,schedule,bogey,track}` 与 `content/logistics/{box,packager,packagePort,packagerLink,factoryBoard}`：信号具有 `RED/YELLOW/GREEN/INVALID` 状态；观察轨可按筛选条件给出经过列车的红石边沿；Schedule 由目的地、等待条件和循环进度组成；Package 是最多 9 槽、可带地址与订单上下文的容器。

现有 Bedrock 代码可复用，但尚不足以声明阶段 5 完成：`train-runtime.js`/`TrainController` 是单体 `DeferredPersistence` 的基础路线原型，`minecart-contraption-runtime.js` 有独立装配路线逻辑；物流已拥有 `ShardedStateStore`、Depot 网络和耐久 item/escrow 事务，却没有包裹信封与端点网络。

## 先决架构：P5.0

P5.0 不提升任何矩阵条目，先建立 `stage5-work-queue.json`、资源/配方契约和以下权威边界：

1. `TrainAuthority` 成为唯一的图、区段占位、路线、速度状态和信号判定所有者；从旧 `createbedrock:trains_v1` 迁移到分片、版本化记录。损坏、未加载或冲突数据一律使相关列车冻结，不猜测恢复。
2. P4.5 的 Carriage Contraption 只向 `TrainAuthority` 注册/撤销行驶权；不得再独占同一轨段或保有第二套 reservation。
3. `PackageLedger` 为每个包裹分配稳定 `packageId`、revision、地址、9 槽内容、订单上下文、位置与 receipt。包裹实体只是投影，不能作为唯一库存来源。
4. 两套状态都使用 `ShardedStateStore` 与提交后清理的 journal。操作顺序固定为“持久化 intent → reserve/escrow → 权属提交 → 投影/交付 → receipt 清理”。

每 tick 的默认保护预算为：最多 4 次列车重新寻径、16 次包裹状态转换、32 个物品栈转移；超过预算延后而非丢失。具体数值须由静态压力测试固定，并写入诊断输出。

## 交付包与 25 条矩阵归属

| 包 | 条目 | 交付内容与退出条件 |
|---|---:|---|
| P5.0 | 0 | 权威状态迁移、工作队列、资源契约、迁移/冻结/预算测试。 |
| P5.1 | 6 | `controller_rail`、`track_signal`（方块/BE）、`track_observer`（方块/BE）、`schedule`。实现区段化 interlocking、信号状态、原生红石输出、观察器过滤/边沿、可编辑且有界的日程；重启后同一列车不得重复获得通行权。 |
| P5.2 | 7 | `bogey` BE、`small_bogey`、`large_bogey`、`fake_track`（方块/BE）、`train_door`、`train_trapdoor`。实现编组、车辆长度/占用、站台停靠、门的到站联锁与安全拆解；与 P4.5 共享路线所有权。 |
| P5.3 | 6 | `package` 实体、`package_filter`、`packager`（方块/BE）、`repackager`（方块/BE）。实现装箱、拆包/重组、地址/订单保留、红石触发、满端重试和唯一库存权属。 |
| P5.4 | 6 | `package_frogport`（方块/BE）、`package_postbox` BE、`packager_link` BE、`factory_gauge`、`factory_panel` BE。实现寻址路由、站点/离线缓冲、Stock Link 请求、Factory Gauge 的多面板请求/补货状态。 |
| P5.5 | 0 | 全链路收口：矩阵、资源、配方、语言、构建产物与三层平台验收账本。 |

P5.1–P5.5 已依次完成静态交付。P5.3 的纯状态模块在 P5.0 的 Ledger 边界后接入；列车和包裹的真实协同仍由 P5.5 的平台验收确认。

## 必须保留的功能不变量

列车方面，一个区段同一时刻只可有一个有效 passage token；释放、反向、拆解和重启均须幂等。信号的 `INVALID` 或无法读取的图必须 fail-closed 为红灯。观察器只报告由权威通过事件确认的列车；它不能用临时实体或玩家接近替代。

物流方面，一个 `packageId` 在任意时刻只能被 ledger、端点库存或 escrow 中的一个位置拥有。Packager、Repackager、Frogport 和 Postbox 必须在各自的持久化 receipt 后再播放动画或生成投影。端点失载、目标满、区块卸载、重启和两个端点竞争时，包裹保留并等待或冻结，绝不能复制、吞没或重新装箱。

矩阵没有完整列出 Java 的动态家族，P5.0 的人工覆盖清单必须补上：16 色 Postbox 的方块、物品、配方、掉落、语言和资源；Bogey 样式/尺寸族；以及 Train Door 的变体。只有清单与对应资源契约通过，相关 acceptance ID 才能提升状态。

## 每包验证与平台验收

每个包必须新增纯 Node 单元、恢复、并发和资源契约测试，并运行：

```sh
cd bedrock
npm test
npm run validate
npm run matrix
npm run build
npm run pack
```

静态收口已运行 `npm test`、`npm run validate`、`npm run build` 和 `npm run pack`，并将 25 条矩阵记录提升为 `static_verified`。接下来进行真实三层验收：Windows 本地世界验证双列车交汇、信号断图、日程重启、门联锁与包裹满端/断连恢复；两人 Realm 验证并发装箱、端点竞争、跨重启配送和 30 分钟压力；PS 从 Realm 加入并完成放置、交互、红石、乘坐和重连。没有这些记录时，结论只能是“阶段 5 静态完成待平台验收”。
