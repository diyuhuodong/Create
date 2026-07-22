# Create Bedrock P7.6：装备、资源与引导详细设计

## 目标与完成口径

P7.6 是进入最终平台验收前的最后一个实现阶段。它以提交 `ac7a4b587` 为基线，复用 P7.1 的内容/获取链、P7.5 的移动投影，以及阶段 6 已有的装备框架，补齐装备语义、客户端资源、声音/粒子、语言和 Ponder 引导。

本阶段不重新设计 Create 美术。第一版继续复用 Java PNG、OGG、模型和文本来源，只做 Bedrock 可加载的格式转换、几何拆分、动画控制器和必要的技术性适配。Java Flywheel/GLSL 等无法直接运行的客户端实现必须映射为 Bedrock 几何、动画或粒子，或以有理由的 `not_applicable` 进入台账，不能静默遗漏。

“P7.6 开发完成”只表示 `static_verified`：八个子包的代码、台账、测试、校验、构建和 `.mcaddon` 打包全部通过。Windows、Realm、PlayStation 实测仍属于 P7.7。

## 当前基线与差距

- 阶段 6 的 16 条装备记录已静态交付，但新 `migration-ledger.json` 中 Goggles、Wrench、Extendo Grip、Potato Cannon、Backtank 和 16 色 Toolbox 仍是 `unclassified`。
- Backtank 状态已有 `capacityLevel`，但没有可生存获得、应用和迁移的 Capacity 升级流程；Potato Recovery 尚未进入 Cannon/Projectile 权威事务。
- Potato Cannon 已有约 28 种弹药 profile，但当前流程缺少完整的持久化发射 journal，弹药回收、随机决定和崩溃恢复还未闭环。
- Goggles 只显示动力信息；Wrench 仍有通用删除路径；Extendo 只支持远距 wrench 且缺少完整耐久回退；Toolbox 仅保存进程内单一连接，没有九个热栏槽的持久化绑定/CAS。
- Java 资源域现有 2,449 个源资源、2,567 个生成资源、79 个声音事件、13 类粒子和 52 个 Ponder 场景源文件。当前 Bedrock 仅定义 7 个自定义声音、没有专用粒子目录，也没有 Ponder 等价引导系统。

## 平台决策与不可突破边界

当前稳定 Creator API 提供现有附魔类型的枚举/读取以及物品的原版附魔槽，但没有稳定的 Add-On 自定义附魔注册面。P7.6 因此采用“版本化装备升级”作为 Capacity/Potato Recovery 的 Bedrock 等价实现：升级等级写入非堆叠物品状态，升级材料有生存获取路径、显示文本和应用 receipt；不伪装成 Minecraft 原生附魔。该判断需要在 P7.7 Windows 能力探针中复核。[EnchantmentTypes](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/enchantmenttypes?view=minecraft-bedrock-stable)、[minecraft:enchantable](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_enchantable?view=minecraft-bedrock-stable)

资源包可以承载自定义模型、纹理和声音；粒子使用 `resource_pack/particles` 下的 Bedrock JSON。引导 UI 继续使用当前稳定的 `@minecraft/server-ui` 表单，不为 P7.6 引入实验性 DDUI 或平台专属 UI。[自定义声音](https://learn.microsoft.com/en-us/minecraft/creator/documents/addcustomsounds?view=minecraft-bedrock-stable)、[粒子文档](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/particlesreference/examples/particlecomponents/particle_document?view=minecraft-bedrock-stable)、[Script UI](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/?view=minecraft-bedrock-stable)

Extendo Grip 仍只能扩展 Create 自有的脚本交互，不能修改原版客户端采掘/放置距离。所有说明、台账和平台验收必须明确这一受限边界。

## 权威数据与模块边界

新增三个事实来源：

1. `data/p7-6-work-queue.json`：八个子包、Java 证据、实现路径、测试和状态。
2. `data/p7-6-resource-ledger.json`：每个 Java 源/生成资源的 `direct_copy`、`converted`、`runtime_equivalent`、`vanilla_equivalent` 或 `not_applicable` 关系；最后三类必须有理由和目标。
3. `data/p7-6-guidance-ledger.json`：Ponder 场景族、实际 storyboard ID、目标功能、教程页、触发入口和验证状态。

装备状态升级到 schema 2，并保留 schema 1 reader：

```json
{
  "schemaVersion": 2,
  "revision": 4,
  "upgrades": { "capacity": 2, "potatoRecovery": 0 },
  "air": 1500,
  "journal": null
}
```

所有消耗升级材料、Cannon 弹药、Backtank 空气、工具耐久和 Toolbox 物品的操作统一为 `intent → escrow/decision → world effect → receipt → cleanup`。随机回收结果在生成投射物前固定并持久化，重启不得重新抽样。

客户端资源不能成为权威状态。动画、声音、粒子和教程只读取 runtime 的只读事件/snapshot；资源丢失不得改变库存、列车、装配或加工结果。

## 八个交付子包

| 子包 | 交付范围 | 静态退出条件 |
|---|---|---|
| P7.6.0 基线与门禁 | 生成工作队列、资源/引导台账、schema 1 fixtures、平台能力决策、禁止未分类资源进入发布包 | 全部 P7.6 输入可追踪；未知 schema fail-closed；门禁接入测试/校验/构建 |
| P7.6A 装备升级与空气 | Equipment state v2、Capacity 0–3、升级材料及应用协议、Backtank/穿戴/放置状态迁移、空气 HUD 文本 | 容量公式、升级守恒、host 转换、拒绝/重启/CAS 测试通过 |
| P7.6B Potato Cannon | Java 弹药目录生成器、每类速度/冷却/命中效果、发射 journal、Potato Recovery 确定性回收、投射物恢复 | 弹药目录无漏项；每个崩溃点不复制/吞没；回收只结算一次 |
| P7.6C 玩家工具与 Toolbox | Goggles 诊断适配器注册表；安全 Wrench handler；Extendo 单/双持、空气/耐久与 Create-only 射线；九热栏 Toolbox 持久绑定、CAS、并发事务 | 不再通用删块；诊断覆盖动力/加工/流体/物流/红石/装配/列车；多人库存守恒 |
| P7.6D 核心视觉资源 | 移动结构、皮带、机器工作态、液面、列车和装备优先；Java 模型转换、专用 geometry、animation controller、投影 LOD/预算 | 核心玩法无通用占位或 missing texture；静止/工作/移动/恢复状态均有确定视觉 |
| P7.6E 声音、粒子、语言与全资源分类 | 79 个 Java 声音映射为 OGG 或原版等价；13 类粒子；EN/ZH；分类 2,449+2,567 资源，包括 Java-only shader/OBJ/GUI | 每项有映射或理由；引用文件存在；大小写、atlas、音频和粒子 schema 门禁通过 |
| P7.6F Ponder 与引导 | 提取 52 个场景源文件中的 storyboard；按动力、加工、物流、流体、装配、列车、装备生成分页教程/上下文帮助；分类 Java advancement 引导语义 | 每个场景族和 storyboard 均有教程目标或明确豁免；功能 ID 不可悬空；EN/ZH 完整 |
| P7.6G 集成与静态收口 | P7.6 Java 对照台账、全量门禁、预算/恢复测试、构建、打包和 P7.7 验收清单 | P7.6 无 `unclassified/missing/partial`；全部命令通过；产出唯一待验收 `.mcaddon` |

执行顺序固定为 `P7.6.0 → A → B → C → D → E → F → G`。依赖只向前：资源层只监听领域事件，不反向导入装备或列车 runtime；引导层读取静态 capability catalog，不被业务模块调用；G 只做汇总和门禁。

## 关键实现设计

### 装备与升级

新增 `equipment-upgrade-state.js` 负责升级定义、目标限制、等级上限、schema 迁移和 receipt。应用升级时必须验证选中装备 UUID/revision、预留一件升级材料、写入新状态后再提交扣除。Capacity 每级增加 300 空气，最高 3；降级、重复应用和不兼容目标均无消耗拒绝。

Potato Recovery 等级在发射 intent 中生成固定 `recoveryRoll` 和 `recover` 结果。命中、落地或超时时仅由同一 projectile receipt 生成一次回收物；无法放入库存时生成带 receipt 的掉落实体。恢复扫描以 receipt 对账，不按实体是否可见猜测退款。

### Cannon、Goggles、Wrench 与 Extendo

Cannon 的弹药目录从 Java `AllPotatoProjectileTypes` 和命中 action 注册生成，手工覆盖仅保存 Bedrock ID 映射。每个 profile 明确伤害、速度、重力、击退、分裂、燃烧、效果、种植/放置、黏附、返回容器和不适用理由。

Goggles 建立按 block family 注册的只读适配器，输出统一 `{title, lines, severity, revision}`。不得只显示全局 diagnostics 计数，也不得直接修改目标。Wrench 只能调用已注册 `rotate/remove/configure` handler；活动 journal、库存、流体、列车占用和移动装配必须由各领域权威 API 决定是否允许拆除。

Extendo 的远距操作使用同一 handler registry。单持增加 3 格，双持增加 5 格；成功操作才消耗空气，空气不足时按设计消耗耐久，二者都不可用则拒绝。原版方块、原版实体和普通挖掘/放置不进入该路径。

Toolbox 保存最多九条 `{hotbarSlot, toolboxId, compartment, revision}` 玩家绑定；补给只处理热栏 0–8。绑定超距、跨维、Toolbox 搬移或 filter 改变时解除。每次补给/回存通过稳定 receipt 串行化，同一隔间的两人竞争由 revision 决定，失败方不丢物品。

### 模型、动画与资源分类

资源转换分为四条流水线：PNG/OGG 原样复制；Java block/item model 转 Bedrock geometry/atlas；OBJ/动画/多层渲染拆为 geometry、render controller 和 Molang；Flywheel shader、开发源、Java GUI 等不可运行项分类为 `not_applicable`，并指向实际 Bedrock 等价视觉。

视觉优先级固定为：移动装配/投影 → 皮带和传输物 → 加工机器工作态 → Tank/管道液面 → 列车/bogey/门 → 装备穿戴/手持 → 装饰内容。资源生成必须确定性；重复运行不得修改未变化文件。P7.5 的 84 类投影继续使用专用实体，不退回通用齿轮模型。

声音事件分为 `custom_ogg`、`vanilla_mix`、`composite` 和 `silent_not_applicable`。Java 已引用原版声音的条目优先映射原版事件；38 个源 OGG 仅在实际事件需要时复制。粒子以 Java 可观察效果为准重建尺寸、寿命、颜色、速度和发射位置，不移植 Java renderer 类。

### Ponder 等价引导

新增非权威 `guidance-runtime.js` 和 Guide Book/帮助入口。教程以短分页表单表达“目标、所需方块、搭建步骤、预期结果、常见失败”，并可从玩家正在观察的 Create 方块打开对应页。Ponder 世界动画不能在 Bedrock 原样播放，因此不承诺逐帧复刻；但每个 storyboard 的教学结论必须保留。

recipe unlock 类 advancement 映射为 Bedrock 已有获取链或 `not_applicable`；具有真实玩法目标的 advancement 映射为本地持久化里程碑及教程索引。里程碑不解锁权威机器状态，不影响多人事务。

## 测试与完成门禁

专项测试至少覆盖：schema 1→2 双读单写、Capacity 应用竞争、空气上下限、Cannon 每一步崩溃、Recovery 固定随机、全部弹药 effect、Goggles adapter、Wrench 拒绝、Extendo 单/双持和耐久回退、九热栏 Toolbox 双人竞争/断连/重启；模型/atlas/动画引用、79 声音、13 粒子、EN/ZH、全部资源关系和 52 个 Ponder 场景族。

每个子包完成后执行相关 Node 测试；P7.6G 执行全量命令：

```bash
cd bedrock
npm test
npm run validate
npm run matrix
npm run build
npm run pack
```

最终门禁要求：P7.6 工作队列全部 `static_verified`；资源与引导台账不存在 `unclassified`、`missing` 或 `partial`；任何 `not_applicable` 都有 Java 证据、Bedrock 边界、替代方案和复核日期；生成包中不存在通用占位、悬空资源 ID、缺失语言或未引用文件。

## 工作量与 P7.7 交接

P7.6A–C 为高风险状态/事务开发；D–F 的单项逻辑风险较低，但资源数量最大，必须依靠生成器和门禁批量收口；G 为中等规模集成。建议严格按八包提交，每包完成编码和静态测试后再进入下一包，避免资源生成器与业务 schema 同时变化。

P7.6G 产出的 `.mcaddon` 是 P7.7 唯一验收候选。P7.7 依次执行 Windows 本地世界、两人 Realm、PlayStation 加入 Realm，补齐 Content Log、控制器/触摸交互、视觉、音频、粒子、教程、并发、重启和性能证据；在此之前项目仍表述为“静态完成待平台验收”。
