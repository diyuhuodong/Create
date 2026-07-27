# Create Bedrock R0：全量迁移台账重建

## 目标

R0 用 Java 注册目录和领域资产目录建立唯一的静态事实来源。它不提升任何功能状态，也不把现有 Bedrock 定义自动视为等价实现。

## 输入与输出

- 输入：881 条 Java 注册、9,067 个配方/资源/战利品/标签/测试等领域资产、旧 362 条迁移矩阵和人工注册映射。
- 输出：schema v2 `bedrock/data/migration-ledger.json`。它包含 `registrationEntries` 和 `domainEntries`，后者逐项保存稳定 `sourceKey`、领域、来源路径、占位 owner、状态和关联注册列表。

领域 `sourceKey` 格式为 `domain:<domain>:<source>[#<test>]`。GameTest 使用实际方法名，避免旧扫描器把 `static void` 错记成 `void` 而产生重复键。

## 状态边界

R0 中所有尚未人工审查的领域资产均为 `unclassified`，owner 为 `R0/unassigned`。这不是缺陷隐藏：它使后续 R1 必须为每项补充实现、等价、兼容豁免、平台阻断或真实缺失结论。

## 门禁

`validateMigrationLedger()` 现在要求：

- 每个 Java 注册恰好一个注册台账项；
- 每个领域资产恰好一个领域台账项；
- 台账项的 key、来源、GameTest 方法和注册引用均能追溯到生成目录；
- 不允许重复、孤立或缺失的领域资产。

执行 `cd bedrock && npm run ledger && npm run validate`。R1 才负责消除 `unclassified`；R0 完成只表示范围完整、可审计。
