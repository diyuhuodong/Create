# S3-14 红石语义完成计划

## 目标与状态规则

本计划将 29 条 S3-14 红石记录从“已有方块、状态与原生 I/O”收敛到可对照 Java Create 的可用语义。它不是把 29 个 identifier 逐个标完成：调速器、Requester、接触器和显示设备分别依赖动力、物流、动态机械及客户端呈现能力。

记录只有同时满足 Java 行为对照、持久化/重启测试、错误与并发测试、资源契约及 Windows、Realm、PS 证据时才能从 `implementation_in_progress` 提升。没有实机证据前，S3-15 一律保持待验收。

**当前状态：** R0–R5 的功能代码已完成，使用 `implementation_complete_pending_static_validation` 标记。当前没有测试环境，因此本次不执行新的静态回归；正式矩阵仍保持 `implementation_in_progress`。剩余的不是功能编码，而是静态回归以及 R6 的 Windows、Realm、PS 证据。

## 工作包与顺序

| 包 | 范围 | 依赖 | 静态退出条件 |
|---|---|---|---|
| R0 | 语义台账、测试清单、状态门槛 | 无 | 每条记录映射 Java 来源、当前边界、所属包、自动与实机验收；校验器拒绝遗漏或越级完成。 |
| R1 | 设备配置与交互基础 | R0 | 配置 schema、迁移、多人冲突规则和可用 Bedrock 交互全部有测试；Controller、Link、Display、Nixie、Lectern 的配置不再依赖临时循环点击。 |
| R2 | 动力网络 v2 与调速器 | R0 | 图中支持受约束传动、方向、应力和目标转速；调速器不再作为无条件动力源近似。 |
| R3 | 物流网络 v2 | R0、R1 | Requester/Stock Link 支持过滤、总库存、多个来源、在途状态、失败恢复和网络寻址；不能复制或吞没物品。 |
| R4 | 动态机械 v2 | R0、R2 | 移动方块有权威变换、持久化、碰撞与红石接触；电梯接触器基于实际移动状态。此包扩展到 S4 架构。 |
| R5 | 显示与粉碎轮收敛 | R1、R2、R4 | Nixie/Display 有动态可见内容；粉碎控制器覆盖双轮、物品、实体及皮带接口。 |
| R6 | 分层实机验收 | R1–R5 | Windows 本地、测试 Realm、PS 的烟雾、双人、重启和压力证据完整。 |

### R1 实现约束

R1 的方块配置使用世界持久化的 `configuration` envelope（revision、最后编辑者、预留 settings）；提交必须携带打开表单时的 revision，发生冲突时拒绝覆盖。Linked Controller 的六个双物品频率保存于非堆叠 ItemStack 的动态属性；旧版按玩家保存的数据只在首次安全使用时迁移。Lectern Controller 单独保存安装的 Controller、单用户短会话及超时，重启后释放无法恢复的 UI 会话。Display Link 的源/目标偏移和 Nixie 的文本先持久化，具体显示渲染仍由 R5 实现。

R1、R2、R3 与 R4/R5 的静态代码均已交付；R4 已采用独立的动态机械设计，而非把电梯逻辑塞入旧 Bearing 原型。下一步是统一执行静态回归，再按 R6 顺序做 Windows 冒烟、Realm、PS。

### R2 调速器语义

R2 将 Rotation Speed Controller 从无条件动力源替换为双端口调节器：水平轴相邻连接为输入，只有其正上方、轴线垂直的 Large Cogwheel 才是输出。解析器先分离两侧网络，确认其中恰有一侧存在未冲突、未过载的动力，再把该侧的**剩余**应力容量按持久化目标转速注入另一侧；两个方向均适用。目标为零、缺少动力、没有有效大齿轮、输入过载或两侧已各自有动力时均不传递，避免凭空供能或静默选择方向。调速器不是原生红石消费者；红石只能通过其他 Create 元件影响其上游传动。

R3 的细化设计位于 `work/doc/create-bedrock-s3-14-r3-logistics-design.md`；地址化 Depot 网络、可恢复 request order、在途摘要、Requester/Stock Link 和 Depot 配置 UI 均已完成代码交付。

静态与平台证据顺序见 `work/doc/create-bedrock-s3-14-remaining-execution-plan.md`；执行顺序为静态回归、Windows、Realm、PS。

## 29 项归属

| Java/Create 设备组 | acceptance ID 数 | 当前已具备 | 收敛包 |
|---|---:|---|---|
| Analog Lever、Content Observer、Latch、Pulse 元件 | 12 | 原生 I/O、确定性状态、计时/边沿逻辑 | R0 基准验证；R6 实机确认 |
| Redstone Link、Linked Controller、Lectern Controller | 5 | 双频、范围、ItemStack 六频道、Lectern 会话 | R1，随后 R6 |
| Display Link、Nixie Tube | 4 | 持久化值、文本、亮度、可恢复显示实体 | R1、R5 |
| Rotation Speed Controller | 2 | 受约束动力端口、目标转速与应力移交 | R2 |
| Redstone Requester、Stock Link | 3 | 地址化 Depot journal、网络库存与配置 | R3 |
| Redstone Contact | 1 | 静态相对面、移动 transform 与电梯回调 | R4 |
| Crushing Wheel Controller | 2 | 双轮反向、持久化加工、受管端点和皮带交接 | R4、R5 |

总数为 29。R0 的机器可读台账已完成，并以运行时符号证据防止用“有方块定义”替代语义完成。

## R0 子任务

1. 从 Java 源码登记每一组的权威类、关键状态和用户可见规则。
2. 为每条 acceptance ID 写明当前实现、缺失依赖、目标包和不允许的近似实现。
3. 新增 schema 与测试，验证 29 项覆盖唯一、包依赖无环、完成门槛完整。
4. 将现有 Node 测试映射到台账；标出必须在 Windows/Realm/PS 执行的场景。每条记录必须列出静态测试文件，校验器会拒绝缺失文件。
5. 评审后才启动 R1；R1 起每完成一个包都先运行静态套件、构建和打包，再进行相应实机验证。

## 完成定义

每个设备均需同时满足以下条件：

1. Java 行为规则存在可追溯对照，Bedrock 实现不使用未记录的降级。
2. 状态、配置和在途事务在重启、区块卸载与多人并发后保持一致。
3. 原生红石输入/输出的 0–15 强度、边沿与时序经过自动测试和 Windows 实机确认。
4. 所需 BP/RP、语言、配方、掉落、模型和动态视觉在目标平台正确加载。
5. 对应 Realm 与 PS 用例拥有真实记录；没有记录只能停留在实现中。
