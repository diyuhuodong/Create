# S3-14 红石静态完成设计

## 目标

R0–R5 的 29 条红石 acceptance ID 已完成代码实现。由于当前没有 Windows Bedrock、测试 Realm 或 PS 环境，本轮不运行验证，也不把矩阵写成 `static_verified` 或 `realm_accepted`。统一状态为 `implementation_complete_pending_static_validation`。

## 状态边界

`bedrock/data/s3-14-capability-plan.json` 是逐设备账本。每个设备记录 Java 来源、Bedrock 静态测试、语义证据脚本和四项待验证边界：`static_regression`、`windows`、`realm`、`ps`。矩阵的 29 条记录暂保留 `implementation_in_progress`，表示正式静态回归尚未执行，而不是缺少功能代码。

`bedrock/tools/s3-14-redstone-semantic-contract.mjs` 会在后续 `npm run validate` 和构建中检查 13 个设备的 27 个脚本证据。它只验证源码连接关系：例如 Contact 的动态 transform、Requester 的持久化 Depot journal、调速器的 stress 端口、以及 Nixie 的显示实体同步；它不会把源码存在误当作游戏内通过。

## 已完成语义

- R1：版本化公共配置、CAS 防止旧 UI 覆盖、Linked Controller ItemStack、Lectern 会话和 Display/Nixie 配置。
- R2/R3：调速器约束与应力移交；地址化 Requester/Stock Link、预留与重启恢复。
- R4：移动 Contact 的 transform、动态装配持久化与电梯 Contact 回调。
- R5：Nixie 文本链、Display 写入，以及 Crusher 到物理皮带受管端点的可靠交接。

## 后续顺序

先执行 `cd bedrock && npm test && npm run validate && npm run build && npm run pack`。通过后才将矩阵升级为 `static_verified`。随后按 S3-15 账本依次执行 Windows 本地世界、测试 Realm、PS 的加载、红石、双人和重启场景；任何平台未记录真实证据前都不可声称可发布。
