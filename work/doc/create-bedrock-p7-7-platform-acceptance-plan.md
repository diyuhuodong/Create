# Create Bedrock P7.7：平台验收与发布判定详细设计

> 状态：P7.7.0 已完成；P7.7A–E 尚未执行真实平台验收
>
> 验收链：Windows Bedrock → Bedrock Realm → PlayStation
>
> 输入基线：P7.1–P7.6 已通过静态验证的 Bedrock Add-On

P7.7.0 完成记录见 [P7.7.0 验收基础设施与候选冻结完成记录](create-bedrock-p7-7-static-completion.md)。

## 1. 目标与完成定义

P7.7 负责证明迁移结果能够在真实 Bedrock 平台运行，不再增加新的 Create 功能。验收必须使用同一个不可变 `.mcaddon` 候选包，覆盖本地导入、单人完整能力、多人并发、存档恢复、Realm 分发以及 PlayStation 控制器体验。

只有同时满足以下条件，P7.7 才能标记为完成：

1. Windows、Realm、PlayStation 的必测场景全部通过；
2. 三个平台记录的是同一候选包摘要、BP/RP UUID 与版本；
3. Content Log 无错误，警告为空或全部进入有负责人和期限的允许清单；
4. 无崩溃、存档损坏、复制漏洞、资源丢失或无法恢复的事务；
5. P0–P2 缺陷清零，P3 缺陷经过明确接受并写入发布说明；
6. 验收台账、日志摘要、截图/视频摘要和最终发布判定均可追溯。

P7.6 的 `static_verified` 只能证明资源和代码契约成立，不能替代本阶段的 `platform_verified`。

## 2. 当前基线与缺口

现有 `s3-15-platform-acceptance.json` 只有 9 个宽泛场景，无法逐项追溯 P7.1–P7.6；`tests/world/smoke-test.md` 仍以阶段 3 为中心；`deploy-win.mjs` 只复制开发包；`pack.mjs` 使用固定文件名且没有候选摘要。P7.7 将保留 S3-15 台账作为兼容汇总，但不再直接人工编辑它。

## 3. 分包与前向依赖

P7.7 按以下顺序实施，后一个分包只依赖前一个分包：

| 分包 | 目的 | 完成出口 |
| --- | --- | --- |
| P7.7.0 | 验收基础设施与候选冻结 | 生成候选、场景目录、证据台账并通过契约测试 |
| P7.7A | Windows 导入与能力探针 | 包加载、依赖、脚本、Content Log 和 API 能力通过 |
| P7.7B | Windows 全领域验收 | P7.1–P7.6 单人、恢复及本地多人场景通过 |
| P7.7C | Realm 验收 | 上传、自动分发、双人并发、重连和 30 分钟压力通过 |
| P7.7D | PlayStation 验收 | 主机加入同一 Realm，控制器、视觉与核心玩法通过 |
| P7.7E | 统一收口 | 三平台同包证据完整，缺陷关闭并形成发布判定 |

若某分包发现实现缺陷，修复后必须重新生成候选；旧候选的失败证据保留，所有下游通过状态失效。

## 4. 候选包身份设计

P7.7.0 新增以下权威数据与工具：

- `bedrock/data/p7-7-candidate.json`：Git 提交、目标版本、BP/RP UUID/版本、文件树摘要、归档摘要和大小；
- `bedrock/data/p7-7-scenario-catalog.json`：场景、所属 P7 子阶段、适用平台、前置夹具与断言；
- `bedrock/data/p7-7-acceptance.json`：平台运行、结果、指标、证据和缺陷引用；
- `bedrock/tools/p7-7-candidate-schema.mjs`：候选与台账契约；
- `bedrock/tools/create-p7-7-candidate.mjs`：从干净提交生成候选；
- `bedrock/tools/record-p7-7-result.mjs`：只追加地记录一次运行；
- `bedrock/tools/p7-7-static-contract.mjs`：检查场景覆盖、证据完整性和平台门禁。

候选 ID 采用 `<packVersion>-<gitShortSha>-<treeSha256前12位>`。文件树摘要按归一化路径和文件内容计算，不依赖 ZIP 时间戳；同时保存最终 `.mcaddon` 的 SHA-256。归档名称改为 `createbedrock-<version>-<digest>.mcaddon`。每次候选都递增 BP/RP 版本，避免 Realm 或主机客户端命中旧缓存。

工作树有未提交修改时禁止创建正式候选。`.codegraph/`、构建目录和证据原文件不参与候选内容。

## 5. 证据模型

证据目录约定为：

```text
work/evidence/p7-7/<candidateId>/<platform>/<runId>/
├── report.json
├── content-log.txt
├── diagnostics-before.json
├── diagnostics-after.json
└── files.sha256
```

大型截图和视频可放在外部存储，但 `report.json` 必须记录文件名、SHA-256 和受控位置。仓库只提交脱敏后的文本报告；不得提交 Realm 邀请码、微软/PSN 账号、令牌或真实玩家标识。

每次运行至少记录：`candidateId`、平台与设备、Bedrock 精确版本、输入方式、账号别名、世界种子、Realm 槽位别名、UTC 起止时间、步骤、预期、观察结果、前后诊断、指标、证据文件及缺陷 ID。`passed` 或 `failed` 必须有证据；`pending` 不得伪造证据。

## 6. 场景覆盖矩阵

`required` 表示发布门禁，`sampled` 表示在该平台抽取代表性能力，`n/a` 表示平台无此职责。

| 场景 ID | 来源 | Windows | Realm | PS | 关键断言 |
| --- | --- | --- | --- | --- | --- |
| `candidate_identity` | 全局 | required | required | required | 摘要、UUID、版本完全一致 |
| `pack_import_dependencies` | 全局 | required | required | sampled | BP/RP 相互依赖且同时激活 |
| `content_log_script_boot` | 全局 | required | sampled | n/a | 脚本启动，无错误和未批准警告 |
| `content_acquisition` | P7.1 | required | sampled | sampled | 方块、物品及生存获取路径有效 |
| `language_guide` | P7.1/P7.6 | required | sampled | required | 名称、提示、指南和本地化可用 |
| `recipes_processing` | P7.2 | required | sampled | sampled | 配方匹配、随机产出和恢复正确 |
| `fluids_heat` | P7.3 | required | required | sampled | 容量守恒、阀门、锅炉与热源正确 |
| `kinetics_network` | P7.4 | required | required | required | 转速、方向、应力、过载和恢复正确 |
| `redstone_controls` | P7.4 | required | required | required | 原生红石、Link、Controller 和显示正确 |
| `logistics_packages` | P7.4 | required | required | sampled | 过滤、满载、反向、包裹与并发事务守恒 |
| `contraptions_schematics` | P7.5 | required | required | required | 装配、移动接触、粘贴及重载恢复正确 |
| `trains_schedules` | P7.5 | required | required | required | 轨道、信号、时刻表、乘坐与重连正确 |
| `equipment_tools` | P7.6 | required | sampled | required | 扳手、工具箱、装备、Extendo 与耐久正确 |
| `visual_audio_particles` | P7.6 | required | sampled | required | 无缺失纹理，核心音效和粒子正常 |
| `restart_chunk_recovery` | P7.2–P7.5 | required | required | sampled | 重启、区块卸载和重进不丢状态 |
| `two_player_concurrency` | 跨域 | required | required | required | 两玩家并发不复制、不丢失、不死锁 |
| `realm_distribution_reconnect` | 平台 | n/a | required | required | 自动下载、断线重连和版本一致 |
| `stress_30_minutes` | 跨域 | required | required | required | 30 分钟无崩溃、看门狗或无界积压 |

Windows 必须完成全部领域的完整验证。Realm 重点证明服务器权威、多玩家、状态恢复和分发；PlayStation 重点证明主机终端、控制器、视觉表现以及核心玩法，但不能代替 Windows 的 Content Log。

## 7. 验收世界与检查点

建立一个版本化验收世界，固定种子和区域坐标。世界至少包含：出生/诊断区、内容陈列区、动力/锅炉区、红石控制区、加工区、物流/包裹区、流体区、动态机械/蓝图区、列车区、装备与资源画廊。

保存四类检查点：

- W0：仅激活候选包的干净世界；
- W1：所有机器已配置但尚未运行；
- W2：传输、加工或列车任务进行中；
- W3：重启/重连后的稳定结果。

验收必须比较 W1/W2/W3 的库存、流体、包裹托管、动力网络、列车和动态机械状态。Realm 替换世界前先下载备份，验收后再下载一次用于离线复核。

## 8. 平台执行设计

### P7.7A：Windows 导入与能力探针

正式验收通过双击不可变 `.mcaddon` 导入；`npm run deploy:win` 只用于开发诊断，不能作为候选通过证据。记录 Bedrock 正式版精确构建号，启用 Creator Content Log 文件和界面输出，确认 BP/RP 均激活且客户端没有回退到缓存版本。

探针覆盖 Script API 2.5.0、UI API 2.0.0、动态属性、脚本事件、表单、原生红石、粒子和声音。Preview/Beta 可用于定位问题，但不能代替正式版验收。

### P7.7B：Windows 全领域验收

按矩阵逐区执行 P7.1–P7.6 场景，包含生存获取、精确数量守恒、反向和满载、移动中断、区块卸载、保存退出及重新进入。邀请第二个 Bedrock 账号进入本地世界完成并发用例，并执行一次两玩家 30 分钟压力运行。

### P7.7C：Realm 验收

备份当前 Realm 后，用候选验收世界执行 Replace World。由 Windows 与第二台 Bedrock 设备同时加入，确认 Add-On 自动下载、候选身份一致、服务器权威事务、断线重连、所有玩家离开后重新加入、区块恢复以及 30 分钟持续运行。结束后下载世界并在 Windows 离线复核持久化状态。

### P7.7D：PlayStation 验收

PlayStation 使用已关联的 Microsoft 账号加入同一 Realm，不设计本地侧载路径。确认 Add-On 自动下载、世界正常进入、手柄焦点和表单可操作，并验证指南、扳手、工具箱、Extendo、红石控制、动态机械、列车装配/乘坐/重连及核心视觉音效。

PlayStation 运行时保留一名 Windows 测试者在线，通过 Windows Content Log 和 `createbedrock:diagnostics` 捕获服务器诊断；主机侧以截图/视频记录控制器和画面结果。最后执行 PS + Windows 双玩家 30 分钟压力场景。

### P7.7E：统一收口

验收工具确认所有 `required` 结果来自同一候选且均为 `passed`，再生成 S3-15 兼容汇总、最终报告、已知问题和发布判定。Realm 中保留已验收世界备份，最终报告记录发布包 SHA-256。

## 9. 指标与门禁

- Content Log：错误为 0；警告为 0，或匹配含原因、负责人和到期日的允许清单；
- 内核：`kernel.failed = 0`，测试结束后 pending 在 60 秒内回落到稳定基线；
- 调度：`scheduler.deferred` 不得持续单调增长，不能出现看门狗终止；
- 守恒：物品、流体、包裹托管和随机产出符合场景期望；
- 动态属性：相邻两个稳定 10 分钟窗口的使用量不得无原因增长超过 25%；
- 稳定性：无崩溃、存档损坏、强制断线或无法恢复的机器/列车；
- 表现：无缺失纹理、紫黑方块、错误模型、不可操作表单或阻断玩法的音画问题。

不同平台没有可靠一致的 FPS 采集接口，因此不设置伪精确 FPS 门槛；改为记录设备、视频、明显卡顿、看门狗、断线和诊断增长。性能回归需在相同设备与候选世界上对比。

## 10. 缺陷回流与重验

缺陷分级如下：P0 为崩溃、存档损坏、复制或安全问题；P1 为核心系统不可用或死锁；P2 为 Create 语义、多人一致性或重要视觉交互错误；P3 为不阻断玩法的小型体验问题。P0–P2 阻止发布，P3 必须有明确接受结论。

失败报告只追加、不覆盖。修复流程为：保留失败证据 → 建立缺陷 → 修改实现 → 重跑全部静态门禁 → 递增包版本并生成新候选 → Windows 回归 → Realm/PS 下游重验。任何 BP、RP、脚本或资源变化都会使旧候选的下游通过结论失效。

## 11. 命令与自动化接口

进入平台验收前执行现有静态门禁：

```bash
cd bedrock
npm test
npm run validate
npm run matrix
npm run build
npm run pack
```

P7.7.0 计划提供：

```bash
npm run acceptance:p7-7:candidate
npm run acceptance:p7-7:status
npm run acceptance:p7-7:record -- --report work/evidence/p7-7/<candidateId>/<platform>/<runId>/report.json
npm run acceptance:p7-7:validate
```

`candidate` 只负责冻结包；`record` 记录人工观察和证据；`validate` 只在证据结构和门禁真实满足时给出 `platform_verified`，不得通过修改汇总字段绕过结果。

## 12. 官方平台依据

设计以 Microsoft/Minecraft 官方文档为准：

- [Content Error Log](https://learn.microsoft.com/en-us/minecraft/creator/documents/contenterrorlog?view=minecraft-bedrock-stable)
- [Debugging Scripts](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/debugging-scripts?view=minecraft-bedrock-stable)
- [Developer Tools and GDK development pack paths](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/developer-tools?view=minecraft-bedrock-stable)
- [Getting Started with Minecraft Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/gettingstarted?view=minecraft-bedrock-stable)
- [How to activate Add-Ons](https://help.minecraft.net/hc/en-us/articles/24120525083533-How-to-activate-Minecraft-Add-Ons)
- [Upload a World to a Bedrock Realm](https://help.minecraft.net/hc/en-us/articles/20686744908429-Upload-a-World-to-a-Minecraft-Realm)
- [Manage a Bedrock Realm](https://help.minecraft.net/hc/en-us/articles/20686901046669-How-to-Manage-Your-Minecraft-Bedrock-Edition-Realm)
- [PlayStation Microsoft account sign-in](https://help.minecraft.net/hc/en-us/articles/29198935918477)

## 13. 阶段边界

本文完成代表 P7.7 **设计就绪**。P7.7.0 可以在当前 macOS 环境开发和静态测试；P7.7A–E 必须等待 Windows Bedrock、Realm 和 PlayStation 环境产生真实证据。没有这些证据时，项目可以继续保持 `static_verified`，但不得宣称迁移已经完成或平台验收通过。
