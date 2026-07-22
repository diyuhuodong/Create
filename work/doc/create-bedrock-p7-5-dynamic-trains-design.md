# Create Bedrock P7.5：动态机械、列车与高风险投影设计

## 1. 目标与完成边界

P7.5 将阶段 4、5 已有的可运行框架升级为接近 Java Create 的权威语义，范围包括动态结构、移动行为、轨道几何、列车编组与占用、Portal Track、Schedule AST、站台/包裹联动及投影恢复。基线为提交 `0bb26790f`；P7.4B、P7.4C、P7.4D 的库存事务、动力状态和 CAS 配置协议直接复用。

本阶段的“开发完成”要求全部 P7.5 子包通过 Node 静态测试、包校验、构建和打包。由于当前没有 Windows Bedrock 环境，完成后只能标记为 `static_verified`，不能声明 Windows、Realm 或 PlayStation 已验收。

## 2. Java 语义基线与当前差距

Java 对照以 `Contraption`、`AbstractContraptionEntity`、`StructureTransform`、`MovementBehaviour/MovementContext`、`TrackGraph/BezierConnection`、`TravellingPoint/Carriage/TrainNavigation` 和 `Schedule/ScheduleRuntime` 为准。

| 领域 | 当前 Bedrock 实现 | P7.5 必须替换的近似 |
|---|---|---|
| 动态姿态 | `assembly-transform.js` 只有 Y 轴角度和位移 | 支持 X/Y/Z 轴旋转、完整朝向基、可逆坐标变换和各方向方块状态变换 |
| 移动快照 | schema 1 保存方块、states、通用 `data` | 明确保存方块状态、可移动 BE 数据、库存、流体、加工、动力、红石、物流和粘附关系 |
| 投影 | marker 加逐块实体，未覆盖时回退通用实体 | 发布路径不得使用通用齿轮替代；每个家族有投影描述或明确的无可视投影限制 |
| 轨道 | 节点间直线/折线点，按线段采样 | 直线、三次 Bezier、斜坡、弧长 LUT、切线/法线、跨维 Portal 边 |
| 路权 | 整条 route 的整边独占锁 | 编组长度对应的边区间占用，加信号区段和前视预留，冲突 fail-closed |
| 编组 | `carriageCount + carriageSpacing` | carriage、前后 bogey、车厢长度、方向、座位/乘客、门和站台联锁 |
| Schedule | schema 1：站点数组和固定 dwell | 5 类指令、9 类条件、OR 分支/顺序 AND、三态执行器和完整重启上下文 |

Bedrock Script API 不能读取任意 Java BlockEntity NBT。未注册捕获/恢复适配器的有状态方块必须在组装时拒绝移动，不能静默丢弃数据。

## 3. 权威状态架构

### 3.1 DynamicAssemblyAuthority v2

动态结构仍以持久化记录为唯一事实源，实体只是可重建投影。目标记录包含：

```text
assemblyId, owner, epoch, phase, motionKind
sourceClaims[], destinationClaims[], pose, motionState
snapshotRef, actorState[], projectionEpoch, journal, frozenReason
```

`pose` 使用固定点平移（每格 4096 单位）及规范化朝向基。姿态由 `originPose + motion progress` 直接计算，不进行逐 tick 浮点累加。轴承可绕 X/Y/Z 轴旋转；活塞、滑轮、龙门和电梯沿自身局部轴位移。只有朝向基为精确的有符号置换矩阵且平移整格时才允许拆解。

状态机统一为：

```text
capturing -> detached -> active -> disassembling -> retired
                         |              |
                         +--> frozen <--+
```

组装事务固定为 `collect/validate → write snapshot → claim sources → detach adapters → remove blocks → commit authority → build projection`。拆解固定为 `materialize/transform states → claim destinations → place blocks → restore adapters → validate receipts → retire source claims → remove projection`。崩溃恢复只重放幂等 journal；任何不确定状态都冻结并保留快照。

### 3.2 MovingBlockPayload v2

`dynamic-assembly-snapshot.js` 升至 schema 2。每个方块记录 `relative`、`typeId`、完整 states、适配器版本及分类 payload：

- `blockEntity/config`：筛选器、模式、数值配置和 Create 自有方块状态；
- `inventory/fluid`：内容、容量、所有权 token 和 P7.4B 事务 receipt；
- `kinetic/processing/redstone/logistics`：网络脱离所需的可恢复状态；
- `attachments`：胶水体积、chassis/sticker 边、物理 belt、座位和 actor 关系。

适配器必须实现 `validate → capture → quiesce → detach → restore → verify`，并声明是否支持移动中执行。含未提交库存/流体 journal 的端点先 quiesce；超时则拒绝组装。快照按 assembly 分片并带稳定 checksum，单条动态属性不承载大结构。

### 3.3 ProjectionRegistry

新增投影注册表，将 `typeId + states + motionKind` 映射到资源实体、几何、材质、旋转适配和动画。静态方块家族可共享生成的 projection family；轴承、活塞/滑轮、actor、belt、bogey、车门和列车必须有专用描述。缺失描述时 authority 继续存在但结构进入 `frozen:projection_unsupported`，发布构建的门禁直接失败。

投影实体 ID 由 `assemblyId/epoch/relative` 确定，可在实体丢失、区块重载或 Realm 重连后重建。投影生成和更新进入预算队列；碰撞、库存和运动不能依赖实体是否已生成。

## 4. 轨道与列车设计

### 4.1 TrackGraph v2

节点含稳定 UUID、维度、位置、方向和 normals。边的 geometry 为 `line`、`cubic_bezier` 或 `portal`：Bezier 保存端点和两个控制柄，生成固定精度弧长 LUT；按弧长 `s` 反查参数 `t`，再计算位置、切线、坡度和车厢姿态。旧 `points[]` 边迁移为 `legacy_polyline`，只用于保留旧世界；新铺设轨道不得产生固定九点近似。

图按维度/区块分片，meta 记录 graph UUID、revision、checksum 和跨维 portal 对。拓扑编辑采用 revision CAS；删除节点、边或 portal 前必须确认没有 occupancy、route token 或驻留列车。

### 4.2 路权、编组与 Portal

`TrainAuthority v3` 是轨道图、列车、占用、路线、信号和 Schedule runtime 的唯一写入者。占用以 `[edgeId, s0, s1]` 区间表示，覆盖整列首尾及安全余量；信号按 section 预留，不再锁定整条行程。每 tick 先投影 swept occupancy，再原子提交位移；区块未加载、图 revision 改变或 token 冲突均停车。

编组记录 carriage 长度、两个 bogey 的弧长间距、正反方向、座位、门、乘客 token 和可移动货物 payload。各 bogey 独立采样轨道，车厢姿态由两 bogey 连线与轨道法线计算。门仅在速度为零、站台侧匹配且站台联锁有效时开启。

Portal 过渡采用 `reserve entrance → reserve destination edge/chunk → freeze passengers and payload → switch dimension authority → rebuild projections → release entrance`。中途失败保留单一 transfer journal，列车只能在入口或出口一侧恢复，禁止双份投影/库存。

## 5. Schedule AST v2

Schedule item 与列车运行时均升级到版本化 AST：

```text
Schedule { cyclic, entries[], savedProgress, revision }
Entry { instruction, conditionBranches[][] }
Runtime { PRE_TRANSIT | IN_TRANSIT | POST_TRANSIT,
          currentEntry, branchProgress[], branchContext[], paused,
          completed, ticksInTransit, predictionTicks[] }
```

外层 condition branch 为 OR；每个分支内部按顺序执行，等价于顺序 AND。任意一个分支全部完成即进入下一 entry。与 Java 当前注册表一致，必须实现：

- 指令：`destination`、`package_delivery`、`package_retrieval`、`rename`、`throttle`；
- 条件：`delay`、`time_of_day`、`fluid_threshold`、`item_threshold`、`redstone_link`、`player_count`、`idle`、`unloaded`、`powered`。

目的地支持站名/模式匹配并由 TrainAuthority 解析；物品/流体条件读取编组权威 storage；包裹取送复用 P7.4B ledger/receipt；红石条件复用频率对；`unloaded` 指货物为空而非区块卸载。无条件的非停站指令执行后立即前进。运行上下文、条件进度、暂停/完成状态和预测时间均持久化。

编辑交互使用 P7.4D 的 server-issued form token、base revision 和 CAS。表单只提交意图；服务端验证类型、边界、站点、过滤器和权限后生成新 AST。冲突返回最新 revision，不覆盖另一玩家编辑。

旧 schedule schema 1 按每个 stop 迁移为 `destination(exact stop id) + [[delay(dwellTicks)]]`，保持原顺序和 cyclic；旧 train 的 `carriageCount/spacing` 迁移为等长编组。迁移采用双读单写：先校验旧记录，再写新记录/checksum，成功后才标记旧记录 retired。

## 6. 子包与严格依赖顺序

| 子包 | 交付内容 | 完成门槛 |
|---|---|---|
| P7.5.0 基线与迁移门禁 | Java 对照台账、schema 常量、旧记录 fixtures、发布时禁止 generic fallback | 所有旧记录可读；未知版本 fail-closed |
| P7.5A 姿态与权威装配 | 3D pose、X/Y/Z state transform、快照 v2、journal/claims、碰撞 | 三轴往返/拆解无坐标漂移；每个崩溃点可恢复 |
| P7.5B Payload、actor 与投影 | 适配器生命周期、库存/流体 receipts、MovementBehaviour 映射、ProjectionRegistry | 组装/移动/拆解无复制丢失；投影删除后可重建 |
| P7.5C 轨道几何 | graph v2、Bezier/斜坡/LUT、分片和旧折线迁移 | 正反采样一致；长度误差和端点误差在约定阈值内 |
| P7.5D 编组与路权 | formation、bogey、区间 occupancy、信号、Portal、乘客/门 | 两列冲突 fail-closed；长编组尾部清轨正确；跨维只有一个权威副本 |
| P7.5E Schedule AST | AST/registry/runtime、全部指令条件、表单 CAS、schema 1 迁移 | OR/顺序 AND、暂停、重启和并发编辑测试齐全 |
| P7.5F 集成与恢复 | station/package/display 联动、区块卸载、实体丢失、拓扑变化恢复 | 故障注入后 authority、库存、占用和投影重新一致 |
| P7.5G 静态收口 | 台账/matrix、资源门禁、全量测试、构建、`.mcaddon` | 全部命令通过且 P7.5 项为 `static_verified` |

执行顺序固定为 `P7.5.0 → A → B → C → D → E → F → G`。只允许向前依赖：A/B 不导入列车模块；C 只提供几何；D 使用 A/B/C；E 使用 D 与 P7.4B/D；F 只做上层编排。发现后向依赖时先下沉接口，不跨层直接调用 runtime 单例。

## 7. 代码落点

优先演进已有 `bedrock/behavior_pack/scripts/contraptions/` 与 `trains/`，并新增小型职责模块：

- `pose-transform.js`、`dynamic-assembly-authority-state.js`、`moving-payload-registry.js`、`projection-registry.js`；
- `track-geometry.js`、`track-graph-state.js`、`train-formation.js`、`train-occupancy.js`、`portal-track-transfer.js`；
- `schedule-ast.js`、`schedule-runtime.js`、`schedule-condition-registry.js`、`schedule-form-runtime.js`。

现有 `contraption-controller.js`、schema 1 schedule 路径和整边 reservation 在迁移期仅作为 reader/compatibility adapter，P7.5G 前必须没有生产调用。资源实体、animation controller 和 projection family 放在对应 behavior/resource pack 目录；最终视觉精修属于 P7.6，但 P7.5 不允许不可识别的通用齿轮占位进入发布包。

## 8. 测试、性能与验收

每个子包先增加纯 Node 确定性测试，再运行：

```bash
cd bedrock
npm test
npm run validate
npm run matrix
npm run build
npm run pack
```

专项测试至少覆盖：三轴 transform 往返、方块 states 旋转、512 方块快照、事务每一步崩溃、actor 物品/流体守恒、投影全删重建；Bezier/斜坡正反弧长、分叉、图编辑和 chunk unload；长短编组对向冲突、尾部释放、信号、Portal 中断；全部 5/9 Schedule 类型、OR/顺序 AND、非循环完成、存档中断恢复、双人 CAS 冲突和包裹满端重试。

保留阶段 4 的 512 方块上限与预算调度，但性能门禁新增实体/assembly、graph 查询、列车/维度、Schedule 条件检查四类配额。超预算应延迟投影或更新，不能跳过权威事务或推进列车穿越未确认占用。

静态收口后按同一 `.mcaddon` 依次进行 Windows 本地世界、两人 Realm、PlayStation 加入 Realm 验收。Windows 重点验证内容日志、投影/碰撞/乘坐和重启；Realm 验证并发、断连、Portal 和 30 分钟压力；PS 验证控制器交互、表单、乘坐、重连和视觉。只有三层证据齐全，P7.5 才能从 `static_verified` 升为 `platform_verified`。
