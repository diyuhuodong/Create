# Create Bedrock P7.7.0 完成记录

## 完成范围

P7.7.0 已实现候选冻结、场景目录、只追加验收台账、证据摘要校验、状态报告和 S3-15 兼容汇总。P7.7A–E 仍需要 Windows Bedrock、Realm 和 PlayStation 真实环境，当前不得标记为 `platform_verified`。

权威场景目录包含 18 个场景、52 个适用平台检查：

- Windows Bedrock：17 项；
- 测试 Realm：18 项；
- PlayStation：17 项。

## 冻结候选

- Candidate ID：`0.1.0-789a350a3-8028fa7d7da2`
- Source commit：`789a350a3ce04babc699fb1bc0da35d4b6f81440`
- Pack tree SHA-256：`8028fa7d7da263197345f8d84a6ea778bbae8ee2810224ceb0bdfa4cf0e2a33b`
- Archive：`bedrock/dist/createbedrock-0.1.0-1ed1cf3461ef.mcaddon`
- Archive SHA-256：`1ed1cf3461efe91599b23a652f9ac8b8c3e5ed552009030a1cf4a64e5d7c8ecd`
- Archive size：7,337,659 bytes

`bedrock/dist/` 不进入 Git；平台测试必须使用上述归档和摘要，不得重新打包后继续沿用该候选 ID。

## 静态验证

冻结候选后重新执行：

```bash
cd bedrock
npm test
npm run validate
npm run matrix
npm run build
npm run acceptance:p7-7:validate
npm run acceptance:p7-7:status
```

结果为 606/606 Node 测试通过，Validate、Matrix、Build 和 P7.7 专用契约均通过。归档文件实测 SHA-256 与候选台账一致。

## 当前结论

`data/p7-7-acceptance.json` 已为冻结候选建立一个活动 campaign，所有检查仍为 `pending`，结果为 `pending_platform_validation`。下一步严格按 P7.7A → B → C → D → E 推进：Windows 导入与能力探针、Windows 全领域、Realm、PlayStation、统一收口。
