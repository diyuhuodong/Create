# Create Bedrock P7.7 平台验收计划

## 唯一候选

仅测试由 P7.6G 生成的 `bedrock/dist/createbedrock-0.1.0.mcaddon`。每次修复后必须重新执行 `npm test && npm run validate && npm run build && npm run pack`，并废弃旧候选。

## Windows 本地世界

1. 导入 `.mcaddon`，创建启用行为包与资源包的新世界。
2. 检查 Content Log 无 JSON、脚本、资源、Molang 或动态属性错误。
3. 依次验证材料获取、动力、物流、加工、流体、装配、列车和 P7.6 装备/Guide。
4. 覆盖键鼠、手柄；保存退出后重进，复核库存、journal、网络、列车和 Toolbox 绑定。

## Realm 双人

上传已通过本地验收的世界。两名账号并发操作同一物流端点、Toolbox、机器、流体网络、装配和列车；验证断线重连、Realm 重启、区块卸载及 inventory/fluid 守恒。

## PlayStation

由已拥有 Bedrock 的 PS 客户端加入该 Realm。验证资源包下载、手柄交互、Guide 表单、模型/动画、声音/粒子、帧率和重连恢复。PS 不直接旁加载 Add-On，Realm 是本项目的发布路径。

## 通过条件

三层证据均保存 Content Log、版本、步骤、截图/视频与结果；Windows、Realm、PS 状态全部由 `pending` 更新为 `passed` 后，才可宣称平台验收完成。
