# Create Bedrock 阶段 2 静态收口

## 范围与结论

阶段 2 的 22 条迁移矩阵记录现已全部标记为 `static_verified`。它们是有意受限的机械基础，而不是阶段 4 动态结构或阶段 5 完整列车的替代：16 方块上限仍是安全边界，不能因此宣称完整 Create 机械可发布。

## 已收口的功能组

- 5 个结构材料：Andesite/Brass/Copper Casing、Industrial Iron、Zinc Block；均可获取、掉落，并可安全纳入受限轴承快照。
- 11 个动力记录：手摇曲柄、水车、轴、大小齿轮、Gearbox、Encased Chain Drive 与 Belt Connector；经持久化动力网络恢复。
- 2 个轴承记录：Mechanical Bearing 方块和服务器状态，使用受限动态快照、碰撞保护及恢复逻辑。
- 4 个轨道记录：Track 与 Track Station 的方块和服务器状态，使用图、路线预留和列车状态恢复。
- 2 个 Water Wheel 方块/状态记录，共同使用受限动力来源。

## 静态证明与后续验收

`stage2-foundation-contract` 强制 22 条状态、运行时语义锚点、15 个方块的资源/掉落/语言、11 个直接配方、Belt Connector，以及 5 个结构材料的可移动/可视部件映射。全量 Node 测试同时覆盖动力恢复、受限快照和轨道路线。

仍需使用同一 `.mcaddon` 在 Windows Bedrock、Realm 和 PS 实测：手摇曲柄与水车动力、皮带连接/重载恢复、轴承拆装/碰撞、轨道/车站交互与重启。此前不得将阶段 2 视为平台验收或主机发布完成。
