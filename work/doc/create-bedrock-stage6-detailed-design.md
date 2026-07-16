# Create Bedrock 阶段 6 详细设计：装备与玩家交互

## 目标、范围与完成定义

阶段 6 迁移玩家穿戴、手持工具和随身库存。迁移矩阵的 16 条 `phase: 6` 记录均为 `specification_pending`：11 条 Backtank/潜水装备、3 条工程工具、1 条 Potato Cannon、1 条 Toolbox 方块实体。完成静态开发的定义是：每条记录拥有服务器行为、版本化持久化、资源/语言/获取路径、Node 行为测试和静态契约。Windows、Realm、PS 的实机结果仍是独立发布门槛。

本阶段还必须人工覆盖矩阵无法枚举的家族：16 色 Toolbox、Copper/Netherite Backtank 的“穿戴与放置”双形态、Capacity 空气容量，以及 Potato Cannon 的弹药种类与回收语义。不得把这些家族藏在单一 `toolbox` 或 `backtank` acceptance ID 后面。

## 平台基线与不可突破的边界

行为包继续以 `min_engine_version: 1.26.0` 和 `@minecraft/server: 2.5.0` 为基线，不因阶段 6 单独提高最低版本。`minecraft:wearable` 能把非堆叠自定义物品放入头、胸、脚或副手槽；`EntityEquippableComponent` 可由脚本读取/写入这些槽。[可穿戴物品参考](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_wearable?view=minecraft-bedrock-stable) 与 [装备槽 API](https://learn.microsoft.com/en-us/minecraft/creator/priorscriptapi/minecraft/server-1xx/entityequippablecomponent?view=minecraft-bedrock-stable) 是静态契约依据。

所有可变装备均必须 `max_stack_size: 1`。`ItemStack.setDynamicProperty` 仅对非堆叠物品可用，因此空气、冷却、Toolbox UUID 和一次性操作 receipt 都保存在物品上；方块库存与并发 journal 保存在 `ShardedStateStore`。不得把大型 Toolbox 库存压缩到物品属性中，也不得把物品 metadata 丢弃后重新创建。

Bedrock 没有可移植的“修改原生玩家交互距离”承诺。Extendo Grip 只能对本 Add-On 已注册的 Create 方块/实体操作执行服务器射线判定；它不能假装提升所有原版方块的客户端挖掘/放置距离。P6.0 必须在 Windows、触摸与手柄输入下确认这一边界；若原生 API 不提供稳定的 reach 属性，文档与验收须明确记录为 Create-交互范围实现，而非全局原版 reach 修改。

## 交付包与矩阵归属

| 包 | 矩阵条目 | 交付与退出条件 |
|---|---:|---|
| P6.0 | 0 | 建立 `stage6-work-queue.json`、人工家族清单、装备状态 schema、平台能力探针和静态契约。 |
| P6.1 | 11 | Backtank BE、Copper/Netherite Backtank 方块/物品/放置语义、两套 Diving Helmet/Boots。空气生成、穿戴、放置/拾取、重启和水/岩浆安全恢复。 |
| P6.2 | 3 | Goggles、Wrench、Extendo Grip。装备槽、诊断信息、Wrench handler 注册表、受限远距操作和耐久/空气消耗。 |
| P6.3 | 1 | Potato Cannon。确定性找弹、持久化射击 receipt、冷却、Backtank 优先消耗与现有 Potato Projectile 投影。 |
| P6.4 | 1 | Toolbox BE。16 色方块族、8 个隔间、玩家热栏关联、距离补给、并发事务、拾取/放置/重启。 |
| P6.5 | 0 | 矩阵、资源、配方、语言、构建/打包和三层平台验收账本收口。 |

P6.1 是 P6.2/P6.3 的前置，因为 Extendo Grip 与 Potato Cannon 可优先消耗 Backtank 空气。P6.4 可在 P6.1 后独立开发，但必须复用阶段 3 的事务语义，不能绕过 item journal。

## 权威状态与事务模型

新增纯状态模块 `scripts/equipment/equipment-state.js`，只处理规范化、版本升级和不变量；世界接入代码放在 `equipment-runtime.js`。状态分三层：

1. 非堆叠装备项保存短状态。Backtank 项保存 `{schemaVersion, air, capacityLevel}`；Potato Cannon 保存 `{schemaVersion, cooldownUntil, revision}`；携带中的 Toolbox 仅保存 `{schemaVersion, toolboxId}`。每个 JSON 均有长度和数值上限。
2. 世界方块使用 `ShardedStateStore("createbedrock:equipment_v1")`。Backtank 按维度/chunk 分片；Toolbox 按稳定 UUID 分片；每条记录带 revision、host（方块坐标或携带物品）和未完成 journal。
3. 玩家关联只保存在玩家动态属性：最多 9 个热栏 link，分别是 `{toolboxId, compartment, hotbarSlot, revision}`。不得以玩家名称作为主键；实体 `id` 只用于在线操作，不作为可伪造存档键。

所有跨库存操作固定为“持久化 intent → 预留/escrow → 物品或方块变更 → 持久化完成 receipt → 清理”。重启时未完成 intent 依据物理库存和投射实体恢复或退款；无法判定时冻结记录并在 diagnostics 报告，绝不猜测并复制物品。

现有 `bedrock-container-item-port.js` 会拒绝带 metadata 的物品。P6.4 先实现版本化 `BedrockItemCodec`：保存 type、数量、耐久、名称、lore、附魔和已知动态属性；无法无损编解码的物品必须被 Toolbox 拒绝，而不能静默剥离数据。Toolbox 通过 UUID 持有其世界库存，打掉后生成同 UUID 的非堆叠物品，重新放置后再领取该记录，避免将 32 格库存塞进 ItemStack 属性。

## P6.1：Backtank 与潜水套装

`copper_backtank` 与 `netherite_backtank` 是胸甲槽非堆叠物品，同时以 `itemUseOn` 走放置路径。`*_placeable` 两条 Java 注册是内部放置别名：Bedrock 不增加可复制的第二个创造物品，而是用同一物品的 host 转换满足 acceptance ID。空胸甲槽交互 Backtank 方块时原子穿戴并移除方块；放置、破坏、爆炸处理和移动都保持空气及 UUID/receipt。

Backtank 方块从 `KineticWorld` 读取其轴向速度，沿用 Java 默认配置：容量 `900 + 300 × Capacity 等级`，转速非零且非水中时按 `clamp(floor((abs(speed)-100)/20), 1, 5)` 补气，并以 `clamp(floor(128-abs(speed)/5)-108, 0, 20)` 控制间隔。红石比较器状态仅反映 `air/capacity`；状态损坏或动力网络不可读时停止补气，不生成空气。

Helmet 在水下每 20 tick 从空气最少的可用 Backtank 消耗 1 点，并用短时 Water Breathing 效果维持原生呼吸条。Netherite Helmet 加 Netherite Backtank 才能在头部处于岩浆时给予短时 Fire Resistance；Copper 组合在岩浆中必须失效。Boots 读取 `inputInfo` 的移动/跳跃状态与当前速度，在水中、非游泳、非飞行时施加受限下沉和水平冲量；每 tick 的冲量上限固定，异常 API 调用只跳过该 tick。`Entity.getHeadLocation`、`getVelocity`、`applyImpulse` 与 `InputInfo` 是该实现的能力依据，详见 [Entity API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable) 和 [InputButton API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/inputbutton?view=minecraft-bedrock-stable)。

Capacity 与 Potato Recovery 不是当前 16 条注册的一部分，仍列入 P6 人工覆盖：先实现 `capacityLevel: 0` 的完整状态路径；只有现有 Bedrock 附魔 API 可无损保存/恢复时才开放等级 1–3。否则不能把未实现的附魔容量计入静态完成。

## P6.2：Goggles、Wrench 与 Extendo Grip

Goggles 是头盔槽物品。佩戴时每 10 tick 对玩家视线内的 Create 方块生成本地化 actionbar 诊断：动力网络显示速度/应力，流体显示容量，库存显示端口摘要；信息必须来自各 runtime 的权威 snapshot，不能直接窥探客户端模型。

Wrench 建立 `Wrenchable` 注册表。每个注册 handler 显式声明 `rotate`、`sneakRemove`、`move` 或 `reject`：动力方块旋转 permutation，受管库存/活动 assembly 在 journal 未清空时拒绝拆除，矿车/列车与阶段 4 动态结构调用各自的权威 API。潜行拾取仅在 handler 明确许可时才生成掉落；不能使用泛型“删除方块后给物品”破坏库存。

Extendo Grip 在主手或副手提供 3 格、双持提供 5 格额外 Create 操作距离。它用 `getBlockFromViewDirection`/实体射线和 Wrenchable/Equipment 操作注册表处理远端目标，成功的放置、拆除、实体命中才记录一次空气或耐久消耗。没有 Backtank 时使用物品耐久，优先消耗 Backtank 时不同时损伤物品。不得通过传送玩家、取消原生破坏事件或伪造普通交互来扩大原版交互范围。

## P6.3：Potato Cannon

保留现有 `potato-projectile.js` 的 Java 弹药 profile 与 `potato-projectile-runtime.js` 的服务器投影；新增 Cannon item runtime 完成发射入口。不要采用原生 `minecraft:shooter`：该组件要求每种弹药都具备 `minecraft:projectile`，而本阶段需要从原版 Potato、Carrot、鱼类、蛋糕等普通库存物品选择弹药。[Shooter 组件要求](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_shooter?view=minecraft-bedrock-stable) 明确了该限制。

发射顺序为：读取持有 Cannon 状态 → 检查 cooldown → 以固定槽顺序寻找 profile 支持的弹药 → 写入 fire intent → 生成带 receipt/owner 的投射实体 → 消耗一发弹药 → 写入完成 receipt 与 cooldown。投射实体落块、命中实体、分裂、种植/放置、黏附和超时都由现有 runtime 承担。重启时 intent 与实体 receipt 对账：已存在投射物不退款；未生成投射物的弹药必须保留或退款。Cannon 优先消耗 Backtank 空气，否则才损伤耐久；无需掉落物或客户端动画来决定命中。

## P6.4：Toolbox

Toolbox 需要人工创建白、橙、品红、淡蓝、黄、黄绿、粉、灰、淡灰、青、紫、蓝、棕、绿、红、黑 16 个方块/物品/掉落/配方/语言/资源映射。每个 Toolbox 有 8 个隔间，每隔间最多 4 个同类堆栈；首个无损物品成为 filter。染料改变颜色但不改变 `toolboxId`、隔间或 receipt。

普通交互打开分页表单：选择隔间、存入/取出、设定 filter、关联或解除一个热栏槽。表单提交携带 record revision，过期提交返回冲突提示。关联玩家每 10 tick 在同维度 10 格内向目标热栏补到 `(maxStack+1)/2`，多余部分回存；离开范围、目标物品不匹配、Toolbox 被破坏或 filter 清空时立即解除。两个玩家竞争同一隔间时按 revision 和 receipt 串行，满隔间保留源物品并重试，不吞没或复制。

## 资源、测试与验收

P6.1–P6.4 每包均须添加 BP/RP 物品/方块/实体、掉落、配方、EN/ZH 文本、Java 资源来源与 `stage6-manual-coverage.json`。优先复用已存在的 Java资源：Backtank 方块与盔甲贴图、Goggles、Wrench、Extendo Grip、Potato Cannon、16 色 Toolbox，以及现有 Potato Projectile。Potato Cannon 与 Extendo Grip 的 Java Mechanical Crafting 配方须映射到已经实现的 Mechanical Crafter；其余可表示配方进入普通工作台。原生项目格式及 `minecraft:projectile`/`minecraft:shooter` 的可用组件清单以 [1.26 item reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_item_v1_26_0?view=minecraft-bedrock-stable) 为准。

新增纯 Node 测试覆盖：空气上限/补气/消耗、物品与方块 host 转换、潜水/岩浆判定、Wrench handler 拒绝规则、Extendo 单/双持与耐久、Cannon intent 恢复、Toolbox codec/关联/竞争/断连/重启，以及 16 色资源契约。每包运行：

```sh
cd bedrock
npm test
npm run validate
npm run matrix
npm run build
npm run pack
```

平台验收按同一 `.mcaddon` 三层执行：Windows 本地世界验证装备槽、触摸/键鼠/手柄、潜水/岩浆、远距操作、射击和 Toolbox 拾取；两人 Realm 验证同隔间竞争、断连与重启；PS 从 Realm 加入验证穿戴、表单可用性、投射物、工具操作和重连。只有 16 条均静态验证、人工家族清单完整、三层证据通过后，阶段 6 才能声明已验收。
