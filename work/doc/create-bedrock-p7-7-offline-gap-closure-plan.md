# Create Bedrock P7.7：离线缺口收口计划

> 状态：设计就绪  
> 执行位置：P7.7.0 候选冻结之后、P7.7A Windows 验收之前  
> 目标环境：当前 macOS + Node.js；不伪造 Windows、Realm 或 PlayStation 结果

## 1. 目标与边界

本计划只处理在没有真实 Bedrock 环境时仍能完成的开发工作，并在修改后重新冻结候选。完成本计划代表 `static_verified_pending_platform`，不代表 Add-On 已在 Windows、Realm 或 PlayStation 通过。

权威基线为：

- 10 个功能域、362 条注册迁移记录均为 `static_verified`；
- 1,005 条原生配方中有 22 条 `blocked_platform_semantics`；
- P7.7 有 18 个场景、52 个平台检查尚未执行；
- `resourceStatus: partial` 是平台验收门禁，不能通过离线修改提前提升；
- Java 外部模组兼容和 Ponder 逐帧动画不计入 Create 核心语义完成度。

## 2. 严格前向依赖

```text
P7.7.1 基线门禁
  → P7.7.2 烹饪语义
  → P7.7.3 验收世界
  → P7.7.4 证据与缺陷工具
  → P7.7.5 静态收口与候选重冻
  → P7.7A Windows
  → P7.7B Windows 全领域
  → P7.7C Realm
  → P7.7D PlayStation
  → P7.7E 发布判定
```

后一个分包不得反向改变前一个分包的 schema；必须变更时，递增 schema 版本并增加迁移测试。

## 3. P7.7.1：缺口基线门禁

新增权威 gap ledger，自动汇总原生配方、交互配方、迁移矩阵、P7.6 资源台账和 P7.7 场景目录。分类只允许：

- `core_implementation_required`
- `static_verified_pending_platform`
- `platform_capability_blocked`
- `external_compat`
- `equivalent`
- `not_applicable`

门禁必须拒绝未说明原因的 `missing`、`partial_implementation` 和状态矛盾。362 条资源状态继续保持 `partial`，但每条必须能追溯到 P7.6 的资源关系或平台场景。

完成条件：缺口数量可重复生成；22 条核心配方单独列出；487 条外部兼容配方不混入核心缺口。

## 4. P7.7.2：22 条烹饪配方语义

22 条均为 `minecraft:recipe_furnace`：16 条需要保留非默认加工时间，12 条需要保留经验值，部分记录同时命中两类差异。

实现一个持久化 cooking parity adapter：

1. 生成每条配方的输入、输出、工作站、时间和经验契约；
2. 以事务方式跟踪输入预留、加工进度、输出提交和经验领取；
3. 保存 schema、revision 和 receipt，支持退出、区块卸载及重启恢复；
4. 防止原生配方与脚本适配器同时产出；
5. 多玩家同时取出输出时只允许一次经验结算。

如果稳定版 Script API 无法安全接管原生炉子，代码必须保留能力探针和 fail-closed 路径，记录为 `platform_capability_blocked`，不得用固定时间或静默忽略经验冒充精确实现。

静态测试覆盖 22 条契约、16 条时间差异、12 条经验差异、取消、满载、重启、双玩家竞争和重复回调。

## 5. P7.7.3：版本化验收世界

新增可重复生成的验收布局，而不是只保留人工 Markdown：

- 固定 10 个区域：诊断、内容、动力、红石、加工、物流、流体、动态机械、列车、装备/资源；
- 将 18 个 P7.7 场景映射到区域、坐标、夹具和断言；
- 提供 `/scriptevent createbedrock:acceptance setup|reset|checkpoint|status`；
- 保存 W0 干净、W1 已配置、W2 运行中、W3 恢复后四类检查点；
- 输出库存、流体、动力、包裹、装配体和列车的确定性摘要。

macOS 上验证生成数据、坐标冲突、场景覆盖和检查点状态机；真正放置、保存和重载仍由 Windows 验收。

## 6. P7.7.4：证据与缺陷生命周期

补齐当前只能导入手写 `report.json` 的工具链：

- `acceptance:p7-7:new-report`：按候选、平台和场景生成报告模板；
- `acceptance:p7-7:evidence`：计算 SHA-256、生成 `files.sha256`，并检查路径脱敏；
- Content Log 解析器：统计 error、warning、脚本启动标记和允许清单；
- `acceptance:p7-7:defect`：关闭缺陷或接受 P3，记录 resolution、时间和修复候选；
- 新候选生成时自动使旧候选下游通过结果失效。

测试覆盖篡改证据、跨候选报告、重复 run ID、P0–P2 错误接受、缺失关闭原因和旧候选污染。

## 7. P7.7.5：静态收口与重冻

依次执行：

```bash
cd bedrock
npm run p7:compile
npm test
npm run validate
npm run matrix
npm run build
npm run pack
npm run acceptance:p7-7:validate
```

最终门禁：

1. 核心 gap ledger 不存在未分类或静默降级；
2. 22 条配方均有可执行适配器或明确的平台能力阻断；
3. 18 个场景全部绑定验收区域和报告模板；
4. 证据及缺陷工具拥有失败路径测试；
5. 全量静态测试通过；
6. 提交代码后生成新候选，旧候选仅保留历史证据。

## 8. 平台环境到位后的剩余工作

离线收口完成后仍必须执行 Windows 17 项、Realm 18 项、PlayStation 17 项。重点验证炉子 API 能力、脚本启动、模型和动画、表单/手柄、存档恢复、多人守恒、Realm 分发及 30 分钟压力。真实平台发现的缺陷按“修复 → 全量静态门禁 → 新候选 → Windows 回归 → Realm/PS 重验”闭环处理。
