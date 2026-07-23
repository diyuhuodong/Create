# Create Bedrock 阶段 7 全量迁移收口设计

## 目标与结论口径

阶段 3–6 已完成的是既有迁移矩阵中 362 条记录的静态交付，不代表 Java Create 的全量功能已经迁移。本阶段以 Java 6.0.11 / 1.21.1 为固定来源，补齐审计发现的内容、配方、资源和行为差异，并将“完整迁移”改为可审计、可复现的结论。

完成时必须同时满足：

1. 每一条 Java 注册、数据资产和测试均有唯一台账记录；不能再因动态注册而从统计中消失。
2. 每条记录有明确结果：`implemented`、`equivalent`、`deferred_compat`、`platform_blocked` 或 `not_applicable`。后三者必须有原因、替代边界和复核日期；`missing`、`partial` 不能进入完成结论。
3. 所有可生存获取的 Java 内容，在 Bedrock 中均存在可验证的获取链；没有悬空物品、悬空配方或只可创造模式取得的核心机器部件。
4. “静态完成”要求单元/恢复/资源/获取路径测试；“平台完成”还要求 Windows、Realm、PS 的实机证据。

Java 兼容模组功能（例如外部矿物、ComputerCraft、Curios）不应被悄悄忽略。每项必须被明确标为：Bedrock 原生替代、可选兼容包、或因 Java 外部模组不存在而 `not_applicable`。这类豁免不计入 Create 核心玩法的已实现数。

## 已知基线与问题

本阶段以审计出的以下基线作为输入：

| 范围 | Java 实际数 | 当前迁移矩阵 | 直接差额 |
|---|---:|---:|---:|
| 方块 | 643 | 185 | 458 未跟踪 |
| 物品（含蜂蜜/巧克力桶） | 111 | 54 | 58 未跟踪 |
| 方块实体 | 114 | 114 | 0 |
| 实体 | 9 | 9 | 0 |
| 基础注册总计 | 877 | 362 | 516 未跟踪 |

`migration-matrix.json` 现有 362 条记录均为 `static_verified`，但资源状态均为 `partial`。其生成器只正则提取 `AllBlocks`、`AllItems`、`AllBlockEntityTypes` 和 `AllEntityTypes` 的字面量；调色板、铜屋顶、包裹样式、兼容矿物及流体桶会漏掉，字符串拼接还曾生成不存在的 `create:crushed_raw_`。

补充域清单另有 9,067 条待处理记录：1,884 配方、1,150 进度、640 战利品表、79 标签、67 GameTest 结构、2,449 源资源、2,567 生成资源、52 Ponder 场景、114 兼容类和 65 个 Java GameTest。它们必须被纳入同一门禁，而不是只作为旁路报表。

## P7.0：权威清单与完成门禁

P7.0 先不声称新增玩法；它建立之后所有实现的唯一事实来源。

### 1. Java 权威目录

新增由 Java 数据生成任务产出的 `bedrock_migration_catalog.json`，而非继续依赖正则。它应在注册完成后枚举 Create 命名空间下的：

- `Block`、`Item`、`Fluid`、`BlockEntityType`、`EntityType`；
- 方块物品、流体桶和变体的实际 ID；
- 生成的调色板、铜块集、包裹样式与其它循环注册族；
- 注册类别、Java 资源 ID、来源家族和可选兼容标记。

目录同时以现有 `.wiki/block_info`、语言键和生成资源做交叉校验：任一来源新增 ID 而目录中没有记录时，`runData` 必须失败。无法仅从注册表推断的“Java 源文件/玩法家族”由一个小型人工 `ownership` 映射维护；该映射不能替代实际 ID 清单。

### 2. 统一迁移台账

以 `bedrock/data/migration-ledger.json` 取代“只有基础注册的矩阵”作为收口输入。每项使用稳定的 `sourceKey`，并至少包含：

```json
{
    "sourceKey": "block:create:brass_tunnel",
    "kind": "block",
    "family": "logistics",
    "java": { "id": "create:brass_tunnel", "catalogVersion": 1 },
    "bedrock": {
        "relation": "one_to_one",
        "targets": ["createbedrock:brass_tunnel"],
        "stateMapping": null
    },
    "status": "implemented",
    "behavior": "verified",
    "resources": "verified",
    "acquisition": "verified",
    "tests": ["bedrock/tests/logistics/..."],
    "platform": { "windows": "pending", "realm": "pending", "ps": "pending" }
}
```

`relation` 只允许 `one_to_one`、`many_to_one_stateful`、`one_to_many_composite`、`virtualized`、`external_compat` 和 `not_applicable`。非一对一映射必须说明状态转换、物品/库存保留和可见资源的对应关系，例如 16 色方块合并为一个方块状态、包裹样式合并为带样式数据的单一物品。

配方、战利品、标签、资源、Ponder、进度和 GameTest 以相同 `sourceKey` 进入域台账。基础注册项引用这些域项；域项不能只写“已扫描”。每个条目都要指定责任包、替代策略、测试和状态。

### 3. 新门禁

新增以下独立检查，并把它们接入 `npm test`、`npm run validate`、`npm run matrix`、`npm run build` 与 `npm run pack`：

| 检查 | 失败条件 |
|---|---|
| catalog parity | Java 目录、生成资源、语言或现有 Bedrock 定义有未入台账 ID。 |
| relation validity | 非一对一映射没有目标、状态转换、理由或资源计划。 |
| survival closure | 任何核心方块/物品无掉落、配方或机器产出路径；或引用未定义物品。 |
| recipe closure | Java 配方未分类；Bedrock 配方/脚本引用悬空 ID；热量、随机产出或流体条件丢失。 |
| resource closure | 已实现内容缺 BP/RP 定义、EN/ZH 文本、纹理/几何、声音或必要的动画投影。 |
| semantic contract | 近似实现未被标为 `partial`，或缺少正向、失败、重启和并发测试。 |
| platform ledger | `platform_verified` 没有对应实机日志、版本、世界种子和录像/截图证据。 |

旧 `migration-matrix.json` 可暂时保留供阶段 3–6 历史任务使用，但不得再作为全量完成判据。迁移完成报告只读取新台账的状态汇总。

## P7.1：内容、材料与获取链

P7.1 以依赖顺序补齐基础内容。审计发现的 442 个无同名 Bedrock 定义方块按家族实现，而不是逐文件复制：238 个调色板/切割变体、48 个铜屋顶、28 个窗/窗格、94 个带颜色的功能或装饰变体、13 个柱、8 个玻璃、7 个调色板基础方块、4 个金属装饰和蜂蜜/巧克力两个流体方块。每个家族使用 `content-family` 清单生成 BP 定义、状态、物品、语言、掉落、配方与资源契约。

物品先处理阻断生存链的 `brass_hand`、`brass_sheet`、`brass_nugget`、`electron_tube`、`precision_mechanism`、其未完成形态、`vertical_gearbox`、`propeller`、`whisk`、`cinder_flour`、`dough`、`pulp`、`sturdy_sheet` 等。随后处理包裹样式和九类兼容碎矿；后者依照 P7.0 的兼容决策映射为 Bedrock 自带材料、可选扩展，或显式不适用。

每个内容家族的退出条件为：可放置/使用定义、正确的状态与掉落、EN/ZH、资源映射、创造菜单入口、至少一条生存获取路径，以及内容/资源回归测试。仅有 BP JSON 或纹理不算交付。

## P7.2：配方编译与加工闭环

将 1,884 个 Java 配方导入规范化中间表示（IR），而不是为每类转换器维护互不一致的报告。IR 至少保留输入、输出、数量、概率、处理时间、热量、流体、序列步骤、标签和来源配方 ID。

每条配方只能归入以下一种策略：

1. `vanilla_recipe`：直接产生 Bedrock 原生配方。
2. `runtime_machine`：由相应机器运行时读取 IR，保留速度、热量、随机和持久化状态。
3. `scripted_interaction`：例如砂纸、灌装或部署器交互。
4. `external_compat` 或 `not_applicable`：必须引用 P7.0 的兼容决策。

实施顺序是：先修复所有悬空引用与黄铜加热条件；再完成制作台、熔炉、切石、锻造等原生配方；随后完成 milling、crushing、pressing、cutting、haunting、splashing、mixing、compacting；最后实现 deploying、filling、emptying、item application、sequenced assembly 与 mechanical crafting。每个输出都应可从原料一路追溯到矿石、战利品、交易或世界生成，形成可自动检查的有向获取图。

## P7.3：流体、热量与容器模型

建立 `FluidLedger`，统一表示容量、流体 ID、温度/热量要求、世界表示、容器转换和事务 receipt。世界端口不能继续只识别水/岩浆：

- 蜂蜜与巧克力需要自定义世界方块、桶、灌装/排空、管道、Tank、Spout、Drain、携带和重启恢复；
- 药水和 Builder's Tea 可采用“仅容器/储罐虚拟流体”实现，但必须保留 Java 的流体身份、数量与配方匹配，不可退化为普通物品；
- Blaze Burner、Basin、Boiler 与 Steam Engine 共享热量等级接口，配方 IR 的 `heat_requirement` 必须在执行前判定；
- 多端口竞争、目标满、区块卸载、崩溃恢复均沿用 escrow/receipt 顺序，确保容量守恒。

P7.3 完成条件包括：蜂蜜/巧克力完整循环、所有流体配方条件可判定、热量不再被忽略，以及容量守恒、竞争、重启和外部端口失败测试。

## P7.4：固定系统语义收口

本包按系统拆成可并行实现、按依赖合并验收的四个子包：

| 子包 | 设计重点 | 必须补齐的语义 |
|---|---|---|
| P7.4A Display/红石 | 数据源注册表和目标适配器 | Java 的 26 类 Display Source、Sign/Lectern/Display Board/Nixie 四类目标、格式化和更新策略。 |
| P7.4B 物流与包裹 | 可持久化筛选表达式与地址路由 | List/Attribute/Package Filter、标签/属性谓词、包裹地址、满端重试、断连与并发库存权属。 |
| P7.4C 动力与锅炉 | 网络参数与热量耦合 | 调速器、压力/应力、锅炉尺寸/热量、蒸汽引擎供给和过载恢复，不用固定数值近似替代。 |
| P7.4D 控制与菜单 | 表单/物品状态协议 | Java 菜单的关键可编辑状态、版本冲突、防止客户端猜测权威库存或设备状态。 |

所有子包均以“Java 行为契约 → Bedrock 状态 schema → 运行时适配器 → 恢复/并发测试”四步交付。Bedrock 无法原样实现的 UI 或渲染应明确记录替代交互；不允许因使用表单就隐去功能参数。

## P7.5：动态机械、列车与高风险投影

P7.5 复用阶段 4、5 的权威状态，但替换目前的近似边界。

- 动态结构使用完整朝向基（任意轴承旋转/线性位移），而非只存 Y 轴角度；移动快照保留方块状态、BE 数据、流体、物品和粘附关系。
- 每个可移动方块家族必须有专用 Bedrock 投影或声明的无可视投影限制；通用齿轮实体只能用于调试，不能作为发布视觉。
- 轨道图支持曲线、斜坡、跨维/Portal Track、编组长度和占用；列车运行使用弧长而非固定九点曲线。
- Schedule 使用指令与等待条件的版本化 AST，覆盖目的地、延迟、物品/流体阈值、乘客、红石链路、站台状态、时间条件及包裹取送；其执行状态可重启恢复。

该包的验收以行为结果为主：移动/拆解不复制或吞没内容，投影丢失可以恢复，路线冲突 fail-closed，日程条件不会被简化成单一固定停留时间。

## P7.6：装备、资源、客户端与引导内容

详细执行方案见 `work/doc/create-bedrock-p7-6-equipment-resources-guidance-design.md`，按 `P7.6.0 → A → B → C → D → E → F → G` 八个只向前依赖的子包推进。

静态完成记录见 `work/doc/create-bedrock-p7-6-static-completion.md`；平台验收入口见 `work/doc/create-bedrock-p7-7-platform-acceptance-plan.md`。

装备补齐 Backtank Capacity、Potato Recovery、不同土豆弹药的冷却/效果、护目镜完整诊断、Toolbox 热栏绑定，以及 Extendo Grip 的明确受限边界。若 Bedrock API 无法扩展原版触及距离，必须在物品说明、台账和平台验收中声明仅支持 Create 方块的射线操作。

资源收口按“玩法可见性优先”处理：先是移动结构、机器状态、液面、皮带和装备；再是其余方块/物品模型。79 个 Java 声音、13 类粒子、语言、动画和 52 个 Ponder 场景分别进入台账。Ponder 可以采用 Bedrock 教程/表单替代，但每个场景都要记录对应交互或明确的发布豁免；不能因非核心运行时而从范围中消失。

## P7.7：验证、平台验收与发布判定

详细执行设计见 [P7.7 平台验收与发布判定详细设计](create-bedrock-p7-7-platform-acceptance-plan.md)。P7.7 拆为 P7.7.0（验收基础设施与候选冻结）、P7.7A（Windows 导入与能力探针）、P7.7B（Windows 全领域）、P7.7C（Realm）、P7.7D（PlayStation）和 P7.7E（统一收口），严格按前向依赖推进。

每个实现包先运行静态门禁：

```sh
cd bedrock
npm test
npm run validate
npm run matrix
npm run build
npm run pack
```

随后按三层记录真实平台证据：

1. Windows Bedrock 本地世界：包加载/内容日志、配方获取、动力/加工/流体重启、红石、动态机械、列车和视觉资源。
2. 测试 Realm：两人并发库存与流体事务、包裹路由、列车冲突、断连/重连和 30 分钟压力。
3. PlayStation：从 Realm 加入，完成放置、交互、表单、原生红石、移动结构、乘坐和重连烟雾测试。

每条平台记录必须保存目标 Bedrock 版本、行为包/资源包 UUID 与版本、世界种子、复现步骤、日志位置和证据链接。只有所有核心项达到 `platform_verified`，才能将项目描述为“可在 PS/Realm 运行的完整 Bedrock 迁移”。

## 执行顺序与依赖

```text
P7.0 权威目录与门禁
 ├─ P7.1 内容/材料/获取链 ─┬─ P7.2 配方与加工闭环 ─┬─ P7.3 流体与热量
 │                         │                           └─ P7.4C 动力/锅炉
 │                         └─ P7.4A Display/红石、P7.4B 物流、P7.4D 菜单
 ├─ P7.5 动态机械与列车（依赖 P7.4B、P7.4D）
 └─ P7.6 装备、资源、引导（依赖 P7.1，视觉部分依赖 P7.5）
                         └─ P7.7 静态收口与 Windows → Realm → PS 验收
```

P7.0 是唯一的硬前置；没有权威目录和新门禁，不开始提升任何旧条目的完成状态。P7.1 的核心材料、P7.2 的悬空配方修复、P7.3 的热量判定构成第一个可生存测试里程碑。完成 P7.7 前，所有报告应使用“静态完成待平台验收”，不得使用“全量已迁移”。
