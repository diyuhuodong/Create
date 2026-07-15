# S3-15 平台验收与性能记录

## 当前结论

S3-15 的验收工具链已完成，但不是平台验收通过。`bedrock/data/s3-15-platform-acceptance.json` 的 Windows Bedrock、测试 Realm 和 PlayStation 记录均为 `pending`；没有 Windows、Realm 或 PS 真机运行证据时，任何阶段都不能声明 Realm/主机可发布。

## 已交付的防伪门槛

验收账本为每个平台固定九项场景：加载与 Content Log、诊断、资源视觉、动力/加工重启、红石、物流/流体事务、移动结构/列车恢复、双人并发与双人 30 分钟压力。`s3-15-performance-baseline.json` 固定运行时的 32 默认组预算与 64 全局 tick 预算，并要求记录错误/警告、内核 pending/failed、调度 executed/deferred 和 Dynamic Property 字节数。

`npm run acceptance:status`、`npm run validate` 和 `npm run build` 都会拒绝伪造的平台状态：完成或失败的场景必须有证据路径；只有九项全部通过，平台才可以是 `passed`；只有三个平台全部通过，账本才可以是 `realm_console_accepted`。

## 执行步骤

1. 在 `bedrock/` 运行 `npm run build && npm run pack`。Windows 本地测试时配置 `BEDROCK_DEV_ROOT` 后运行 `npm run deploy:win`，在新世界启用两个包。
2. 按 [`bedrock/tests/world/smoke-test.md`](../../bedrock/tests/world/smoke-test.md) 运行九项场景，保存 Content Log、诊断摘要、游戏/版本号、世界或 Realm 标识（不含玩家隐私数据）和结果。
3. 上传同一构建到测试 Realm，用两名玩家完成并发与 30 分钟压力；再从 PS 加入同一 Realm，重复完整场景。
4. 每项生成独立证据报告，例如 `work/evidence/s3-15/test_realm-stress_30_minutes.md`。通过或失败时填入该路径；未执行则保持 `state: "pending"` 和 `evidence: null`。
5. 运行 `npm run acceptance:status`、`npm test`、`npm run validate`、`npm run build` 与 `npm run pack`。发生失败时保持平台 `failed`，修复后重新执行并保存新证据。

这个流程记录真实结果，不替代 Windows、Realm 或 PS 内的实际测试。
