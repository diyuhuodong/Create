# Create Bedrock P8：完整性差异收口计划

## 目标与边界

P8 的目标是把“能够构建并通过现有静态测试”提升为“Java Create 本体的每项能力都有可追溯结论”。基线为 881 个 Java 注册项、9,067 个领域项和 634 个通过的 Node 测试。外部 Java 模组兼容不计入 Create 本体完成度，但必须保留明确分类。

完成分为两层：

- **离线开发完成**：没有 `missing`、`partial` 或未解释的核心差异，所有实现都有 Java 来源、Bedrock 投影和静态测试证据。
- **发布验收完成**：Windows Bedrock、Realm 和 PS 的适用场景均有真实运行证据。

## 实施状态

P8.0 已完成：`java-behavior-inventory.json` 记录 1,319 个 Java 行为来源，`p8-parity-evidence-ledger.json` 将注册、领域与行为统一为 11,267 条证据记录，P7.7 gap ledger 已强制纳入这些记录。执行 `cd bedrock && npm run ledger && npm run gap:p7-7` 可确定性重建三份台账。

P8.1 已完成：78 个彩色功能方块均通过共享颜色族目录接入对应运行时、生成资源、获取配方和移动投影；迁移台账已确定性标为 `implemented`，并由 `p8-functional-color-families.test.mjs` 覆盖资源、获取、状态、运行时和台账结论。

## 前向依赖

`P8.0 审计门禁 → P8.1 已知缺口 → P8.2 注册收敛 → P8.3 行为核对 → P8.4 领域收敛 → P8.5 静态候选 → P8.6 平台验收`

后续包不得反向提供前置包运行所需的接口。平台失败应回到对应责任包修复，再重新生成候选。

## P8.0：重建完整性门禁

1. 让 P7.7 gap ledger 强制读取 `migration-ledger.json`；`partial`/`missing` 默认属于开发缺口，除非有 `equivalent`、`not_applicable`、`external_compat` 或 `platform_capability_blocked` 结论。
2. 新增 Java 行为目录，扫描 `content/**` 及 Movement、Interaction、Display、Processing、Train 等注册入口，不能只统计方块和资源。
3. 建立统一证据记录：Java 源码、Bedrock runtime、资源、Node 测试、平台场景。
4. 添加缺项注入测试，证明删除映射、运行时或测试时门禁会失败。

**退出条件：** 881 个注册项和 9,067 个领域项全部进入同一差异报告；“0 核心缺口”不能绕过 `partial`。

## P8.1：补齐 78 个已确认功能变体

- 15 个彩色 Nixie Tube：复用显示、分组、持久化和移动数据语义。
- 16 个彩色 Postbox：接入地址、包裹端点、容量、断线恢复。
- 15 个彩色 Sail：计入风车结构并支持动态装配。
- 16 个彩色 Table Cloth：接入商店、Shopping List 和 Depot 结算。
- 16 个彩色 Valve Handle：接入流体阀门交互、状态和恢复。

先建立颜色族目录和共享谓词，再接入各运行时，避免复制五套逻辑。每个族必须覆盖至少一个非默认颜色的行为、存档恢复和资源契约测试。

**退出条件：** 78 项从 `partial` 升为 `implemented/verified`，且所有颜色走同一权威状态机。

## P8.2：收敛 457 个注册项

按 `block → item → fluid → block_entity → entity` 分队列核对。目前 349 项与旧矩阵的 `static_verified` 结论冲突，另有 108 项不在旧矩阵内。先用现有运行时和测试自动补证，不能仅因存在同名 JSON 就升级。

每项只能得出以下结论之一：

- 等价实现并有测试；
- Bedrock 等效设计并记录语义差异；
- 确认缺失并进入 P8.3；
- 平台能力阻断；
- 外部兼容或不适用。

**退出条件：** 注册台账中 `partial=0`、`missing=0`，所有映射目标均实际存在并有责任测试。

## P8.3：Java 行为级核对与补开发

逐域核对动力、加工、物流/包裹、流体/热量、动态机械、列车、红石/显示、蓝图工具、装备和世界生成。重点检查注册目录无法发现的状态机、事件钩子、配置、并发事务、重启恢复、边界条件和移动 Block Entity 数据。

每个确认缺口拆成独立纵向切片：`Java 语义 → Bedrock 状态模型 → 世界适配器 → 持久化 → 测试 → 验收场景`。

**退出条件：** Java 行为目录不存在无结论项；每个等效实现均说明 Bedrock 限制，没有以“文件存在”代替行为证据。

## P8.4：收敛 9,067 个领域项

复用已有配方、获取、资源、指导和阶段测试台账，把 8,953 个保守 `partial` 与真实证据逐项关联。重点重新核对 1,884 个配方、5,016 个资源，以及 advancement、loot、tag、Ponder 和 GameTest 投影。

487 个外部模组兼容项单独保留，不计为 Create 本体缺失；`not_applicable` 和等效项必须保留原因。

**退出条件：** 领域台账 `partial=0`；汇总数字可由源目录确定性重建，旧矩阵与新台账无冲突。

## P8.5：离线静态候选

依次执行：

```bash
cd bedrock
npm test
npm run validate
npm run build
git diff --check
```

生成不可变 `.mcaddon` 候选和差异摘要。候选要求核心缺口、`partial`、`missing` 均为零；仅允许外部兼容、不适用、明确等效和待平台验证项。

## P8.6：Windows、Realm 与 PS 验收

先在 Windows Bedrock 完成内容日志、单机、重启恢复、双人并发、压力和 22 项烹饪能力探测；再上传 Realm 验证服务端持久化和多人行为；最后用 PS 加入 Realm 验证控制器、界面、渲染、性能和断线重连。

**最终完成条件：** 52 项平台检查全部有证据；严重缺陷为零；Realm 与 PS 使用同一候选包通过验收。
