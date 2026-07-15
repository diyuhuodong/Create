# Create Bedrock 剩余执行计划

## 执行规则

R0–R5 的功能代码均已完成，不再新增阶段 2/3 红石编码。当前先不测试；恢复验证时，先执行 `npm test`、`npm run validate`、`npm run build` 和 `npm run pack`，再将矩阵提升为 `static_verified`。获得 Windows 环境后，依次完成 Windows、Realm、PS 的 R6 证据；它们必须使用同一已验证构建。

## R3 物流网络 v2（已完成代码）

R3.1–R3.4 已完成静态交付：端点网络/地址、库存摘要、Router 配置、Depot 表单、持久化 request order、设备回写与边界测试。Windows 物流冒烟仍在 R6 待执行。

1. R3.2 request order：将多个 `ItemTransferJournal` 记录收敛为一个持久化订单，保存 transfer ID、预留量、在途量和终态；重启后恢复，重复边沿幂等，源/目标失败可报告且不丢物。
2. R3.3 设备回写：Requester 展示 pending/fulfilled/failed 与原生输出；Stock Link 依据同一摘要仅在阈值跨越时变化；Content Observer 实施过滤后的库存指纹。
3. R3.4 交付门槛：多来源、地址隔离、满目标、源变更、重启和双配置冲突测试；Windows 物流冒烟。

## R4 动态机械 v2（已完成代码）

详细架构见 [S4 动态机械 v2 设计](create-bedrock-s4-dynamic-mechanics-design.md)。R4.0–R4.4 已完成静态交付；后续实现必须遵守其中的 snapshot、transform、事务和适配器边界。

R4.0 先编写独立设计：解除现有 16 方块 bearing 原型限制，定义权威 assembly snapshot、连续变换、碰撞、实体/方块所有权及回滚边界。

1. R4.1 实现可恢复移动实体和分块化 assembly 状态，包含组装/拆解原子事务、加载恢复、碰撞冻结和多人互斥。
2. R4.2 已建立版本化移动方块数据适配层：动力、加工、红石和 Depot/Item Hatch/Item Vault/Creative Crate 状态随 assembly 捕获/恢复；物流端口按新坐标重键库存、配置和回执，存在 journal、escrow、传送带、漏斗或溜槽引用时拒绝移动，禁止双写。
3. R4.3 已实现 Redstone Contact 的运动面接触、边沿输出和 Elevator Contact 的列/楼层状态：`MotionContactTracker` 只从 assembly snapshot/transform 采样并发出 rise/fall，固定世界触点才写原生红石；Elevator Contact 持久化 X/Z/朝向列、楼层 ID/显示名和请求/到站状态。新增方块暂复用 Redstone Contact 的投影资源，独立模型属于视觉改进而非逻辑阻塞项。
4. R4.4 已完成静态交付：粉碎轮的处理中批次和自动化输入端口会随 assembly 在目标位置重键恢复；物理 belt 只允许“整条空闲路径 + 两端端口”同时纳入同一 assembly，拆离/失败回滚后才重建路径，避免活动运输或半条皮带双写。Node 回归覆盖恢复和事务顺序；Windows 冒烟仍由 R6 执行。

## R5 显示与粉碎控制器收敛（已完成代码）

1. R5.1 已完成静态交付：`Display Target` 使用版本化多行文本/样式协议；Display Link 按持久化 source/target 偏移解析原生红石强度，并写入实际 Nixie 目标，目标状态随 Redstone moving-data 适配器迁移。
2. R5.2 已完成静态交付：同朝向连续 Nixie Tube 组合为确定性显示组，拼接持久化文本、颜色和亮度，并由可恢复的无碰撞显示实体渲染；文本不再只映射 light-emission。实体命名牌显示效果仍待 Windows 冒烟确认。
3. R5.3 已完成静态交付：粉碎控制器把处理机的配方过滤输入缓冲与输出缓冲注册为两类受管 Depot 端点；定向物理 belt 只能从输出端口取物、向输入端口交付。网络持久化端点身份与在途 belt 记录，机器快照仍是端口库存的唯一所有者；每次 belt 端口变更都会请求所有者检查点，重启后重新挂载端口即可恢复运输。掉落物仅保留为有效反向双轮下的手动输入路径，不再用于伪造 belt 输出。
4. R5.4 已完成静态回归：显示、粉碎、重启和端口恢复测试通过，`npm test`、`npm run validate`、`npm run build` 与 `npm run pack` 均须作为提交门槛。Windows 的视觉/加工冒烟仍属于 R6 实机证据，尚未执行。

## R6 分层实机验收

1. Windows：对每个完成包运行 `bedrock/tests/world/smoke-test.md` 的相关场景，保存 Content Log、诊断、版本和截图/视频路径。
2. 测试 Realm：上传同一 `.mcaddon`，两人验证并发、重启、物流满载和 30 分钟压力。
3. PS：从 PlayStation 加入同一测试 Realm，复跑完整九项场景。
4. 仅在三平台的 27 项账本记录均附真实证据并全部通过后，才能将 `s3-15-platform-acceptance.json` 标记为 `realm_console_accepted`。

## 剩余顺序

`静态回归 → Windows 本地世界 → 测试 Realm → PS`。
