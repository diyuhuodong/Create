# R3 物流网络 v2 设计

## 目标与边界

R3 让 Redstone Requester 与 Stock Link 基于持久化的物流网络和地址工作，而不是扫描同维度全部 Depot。物品继续只通过既有 `ItemTransferJournal`、escrow 和分片持久化移动；地址路由不得创建第二套物品账本。

## 数据模型

每个 Depot 端点持久化 `networkId`、`address`、`acceptsRequests` 与 `revision`。旧记录迁移为 `default` 网络、空地址、可接收请求。Requester 与 Stock Link 的公开配置增加同一网络 ID 和可选目标地址；空地址表示该网络中的全部可接收端点。

`networkId` 使用短、规范化标识符；地址是短文本且按规范化值精确匹配。网络只能在同一维度内解析，跨维度请求明确失败而非静默混合库存。

## 请求与库存

R3.1 先完成端点选择和网络库存摘要：可用库存排除已预留数量，摘要同时报告物理库存、已预留和 escrow 中的在途物品。Requester 仅从匹配网络/地址的端点预留，沿用一个来源一个 journal record 的原子语义。

R3.2 增加持久化 request order：它保存请求 ID、目标、所有 transfer ID、预留数量和终态。任一 source/destination 失败会保留可恢复记录并向 Requester 报告失败；所有交付完成才报告成功。重复红石边沿以相同订单 ID 幂等处理。

R3.3 让 Stock Link 查询同一摘要，并只在跨越阈值时改变原生输出。Requester 与 Stock Link 的设置使用 R1 的 revision/CAS 表单；Depot 端点使用独立的有 revision 配置表单。

## 验收顺序

1. 端点迁移、地址隔离、默认网络兼容。
2. 多来源路由、保留量、地址/网络拒绝和 restart 恢复。
3. 请求订单的 pending/fulfilled/failed 状态与 Redstone 输出边沿。
4. Stock Link 阈值、端点 UI、完整静态测试、构建与打包。

Windows、Realm 和 PS 的多玩家、重启及满库存场景仍属于 R6，不能由 Node 静态测试替代。
