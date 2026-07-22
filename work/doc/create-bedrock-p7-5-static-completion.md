# Create Bedrock P7.5 静态收口记录

## 结论

P7.5 的八个子包已完成代码实现与静态门禁。结论只表示 `static_verified`：当前没有 Windows Bedrock 环境，因此 Windows 本地世界、Realm 与 PlayStation 仍为 `pending`，不得据此声明平台验收通过。

## 已完成范围

- `P7.5.0`：schema 双读单写、旧记录 fixtures、未知版本 fail-closed。
- `P7.5A–B`：三轴固定点 pose、装配 journal/claims、payload 生命周期、84 类专用移动投影。
- `P7.5C–D`：Bezier/斜坡弧长采样、编组与 bogey、区间占用、按需信号区段、座位/门、跨维 Portal journal。
- `P7.5E`：5 类指令、9 类条件、OR/顺序 AND、暂停/预测/恢复、Schedule Item schema 1 迁移与表单 revision CAS。
- `P7.5F`：站点名称/模式解析、包裹 escrow/receipt、Display Link 列车状态、实体/占用/拓扑/Portal 故障恢复。
- `P7.5G`：Java 对照台账、投影资源门禁、全量 Node 测试、包校验、构建与 `.mcaddon` 打包。

## 可复现验证

从仓库根目录运行：

```bash
cd bedrock
npm test
npm run validate
npm run matrix
npm run build
npm run pack
```

P7.5 专用门禁同时校验八个台账包、84 个唯一 BP/RP 投影实体、Schedule 5/9 注册表、迁移 fixtures、乘坐组件及恢复接口。打包产物位于 `bedrock/dist/createbedrock-0.1.0.mcaddon`（构建目录和产物不提交 Git）。

本次收口结果：`npm test` 通过 578/578 项；`npm run validate`、362 项迁移矩阵生成、构建和打包均通过。

## 待平台验收

使用同一个 `.mcaddon` 依次执行 Windows 本地世界、两人 Realm、PlayStation 加入 Realm 测试。重点记录 Content Log、重启恢复、曲线/坡道、长编组冲突、座位与门、Portal 中断、双人 Schedule CAS、包裹满端重试和 30 分钟压力数据；证据齐全后才能升级为 `platform_verified`。
