# Create Bedrock R1 分类与缺口队列设计

## 目标

R0 已证明台账覆盖全部 Java 来源，但 `unclassified` 不能作为开发状态。R1 将每条记录归入责任包与保守迁移结论：已有 Bedrock 定义或运行时投影的记录为 `partial`，没有可证实投影的记录为 `missing`。这不是完成功能的声明。

## 注册项规则

保留 `migration-overrides.json` 中 503 条人工审查结论。其余 378 条采用确定性基线：

- 同名 BP 方块、物品或实体定义：`one_to_one`、`partial`；
- 方块实体：映射到同名方块投影，关系为 `virtualized`、`partial`；
- 四种流体：映射到对应 Create 方块/容器投影，关系为 `virtualized`、`partial`；
- 没有投影目标的注册项：`unmapped`、`missing`。

这些记录分别交给 P7.1 内容/获取、P7.3 流体热量、P7.4 固定系统语义与 P7.5 动态机械/列车包。`partial` 必须在后续补齐行为、资源和获取链证据后才能升级。

## 全域规则

`bedrock/data/migration-domain-overrides.json` 对十个 R0 域各设唯一规则，规定 owner、family、strategy、rationale 和 status。新增 Java 域若未添规则，校验会失败；因此不会重新出现未归属资产。

策略仅表示下一步：`data_compilation`、`asset_projection`、`runtime_contract`、`test_port` 或 `external_compat`。兼容类保持 `deferred_compat`，直到逐项决定原生替代、可选包或不适用。

## 退出条件

执行 `cd bedrock && npm run ledger && npm run validate` 后：881 个注册项与 9,067 个域项均不得是 `unclassified`；任何未知/重复域、失效策略或缺失责任规则均应使验证失败。R1 的输出是 R2–R6 的精确缺口队列，不是平台验收结论。
