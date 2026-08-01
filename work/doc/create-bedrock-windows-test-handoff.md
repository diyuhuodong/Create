# Create Bedrock Windows 测试交接

## 目的与边界

本仓库原项目是 Java Create；`bedrock/` 是将其能力投影为 **Minecraft
Bedrock Add-On** 的独立包（行为包、资源包和 Script API 运行时），不是可在
Windows 上加载的 Java/NeoForge 模组。当前任务是先在 Minecraft for Windows
中验收该 Add-On，再依次验收 Realm 和 PlayStation。

静态迁移已收口，但这不等于游戏内已经验收：881 个注册项、9,067 个领域资源和
1,319 个 Java 行为来源均已建立静态映射与证据；仍有 52 项真实平台检查待做。另有
22 项原生烹饪桥接依赖 Bedrock API 能力探测，必须记录结果，不能凭静态测试宣称通过。
Java 第三方模组兼容也不属于本包验收范围。

## 冻结候选

只测试下列不可变候选；任何 BP、RP、脚本、资源或 manifest 改动都会使结果失效：

| 项目 | 值 |
| --- | --- |
| Git 分支 | `codex/create-bedrock-port` |
| 源提交 | `b97ab93324eae71dd95e3d9bd592e74b7b65701f` |
| 候选 ID | `0.1.0-1da420a04cd8` |
| Add-On | `bedrock/dist/createbedrock-0.1.0-1da420a04cd8.mcaddon` |
| SHA-256 | `1da420a04cd88d4405bd4430c28ed05c995d1728fa7dc332f6a92cd4e7bd6419` |
| 静态状态 | `static_verified`；平台状态为 `pending_p8_6` |

若 `dist/` 未随工作副本传送，在该提交上使用 Node.js 22 或更新版本重建：

```powershell
cd Create\bedrock
npm test
npm run validate
npm run build
npm run candidate:p8-5
```

将生成报告 `bedrock/dist/p8-5-0.1.0-1da420a04cd8.json` 中的提交、候选 ID 和
SHA-256 与上表逐项比对；不一致时停止，不要把结果写入本候选。

## Windows 首轮验收

使用当前非 Preview 的 Minecraft for Windows 导入 `.mcaddon`，新建或打开版本化验收
世界，启用两个包及 Creator Content Log（文件和 GUI），并记录准确游戏版本、实验选项
和设备信息。先在世界中执行：

```text
/scriptevent createbedrock:acceptance setup
/scriptevent createbedrock:acceptance checkpoint W1
/scriptevent createbedrock:acceptance checkpoint W2
/scriptevent createbedrock:acceptance checkpoint W3
/scriptevent createbedrock:acceptance status
```

W1/W2/W3 必须按顺序进行；任何 checkpoint 不完整都不是通过证据。完整情景、夹具和
判定标准以 [smoke-test.md](../../bedrock/tests/world/smoke-test.md) 为唯一准则。Windows
必须完成其中 17 项：候选身份、导入依赖、脚本启动、内容/语言/配方、流体、动力、红石、
物流、动态机械、火车、装备、视听效果、重启与区块恢复、双人并发以及 30 分钟压力运行。
双人项目须使用第二个 Bedrock 账号。

## 证据与缺陷闭环

每次观察先创建候选绑定报告，并保留脱敏后的 Content Log、截图或视频：

```powershell
npm run acceptance:p7-7:new-report -- --platform windows_bedrock --scenario candidate_identity --run windows-001
npm run acceptance:p7-7:content-log -- --report work/evidence/p7-7/<candidate>/windows_bedrock/windows-001/report.json --log <redacted-content-log.txt>
npm run acceptance:p7-7:evidence -- --report work/evidence/p7-7/<candidate>/windows_bedrock/windows-001/report.json
npm run acceptance:p7-7:record -- --report work/evidence/p7-7/<candidate>/windows_bedrock/windows-001/report.json
```

报告路径、字段和哈希规则均由工具校验；不得记录账号、令牌、绝对路径或未脱敏个人信息。
失败项需写明候选、游戏版本、世界/夹具、精确复现步骤、预期与实际结果、日志片段和
严重级别。修复后必须冻结**新**候选并从 Windows 回归，不能覆盖旧报告。

## 接手 Codex 的执行原则

先核验候选身份，再运行 Windows 全套情景；不要改迁移实现、扩大范围或把
`static_verified` 写成 `platform_verified`。Windows 全部通过后，才将同一世界和同一候选
上传 Realm；Realm 通过后，再以 Windows 观察端配合 PS 通过 Realm 加入验收。最终只有
同一候选的全部适用情景通过、证据哈希有效且没有 P0–P2 未关闭缺陷，才能标记
`platform_verified`。

相关的静态收口背景和已知语义限制见
[create-bedrock-p8-integrity-remediation-plan.md](create-bedrock-p8-integrity-remediation-plan.md)。
