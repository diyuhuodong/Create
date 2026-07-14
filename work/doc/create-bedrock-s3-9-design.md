# S3-9 固定动力扩展设计

## 目标与边界

S3-9 为 Bedrock Add-On 提供可放置的固定动力扩展。`bedrock/data/stage3-kinetic-specifications.json` 覆盖队列中的全部 33 条记录：27 条由本阶段直接实现，6 条由共享动力节点运行时吸收；不再存在跨阶段移交记录。

本阶段实现的方块为：两种机壳轴、四种机壳齿轮、齿轮换向器、可调链传动、创造马达、大水车、飞轮、金属桁架轴、链式输送机、动力轴、顺序变速器、蒸汽引擎和风车轴承。除自动生成的大水车结构环外，均有创造栏入口、双语名称、显式自掉落表和运行时注册。

## 动力设计

`KineticWorld` 在保留现有轴、齿轮、齿轮箱和传送带图算法的前提下新增固定动力节点语义：

- `gearshift` 使用内部正/负两个端口。红石通电时两端之间的传动比为 `-1`，只反转穿过方块的输出侧，避免单节点图模型的双重反转错误。
- `chain_gearshift` 沿链传动边应用 Java 等价的模拟信号倍率：0 为 `1`，1–15 为 `1 + (signal + 1) / 16`。信号和网络状态均会持久化。
- `creative_motor` 是默认 `16 RPM`、范围 `-256..256`、容量 `16384` 的可配置源；空手交互循环正、负档位。`large_water_wheel` 以 `4 RPM / 128` 容量运行，并按两格水轮轮廓检查水源。
- `sequenced_gearshift` 使用独立的双端口和持久化、受限的指令数组（1–16 步，每步 1–1200 tick，倍率绝对值不超过 256）。红石上升沿启动、断电停止；空手交互循环三组内置程序（20 tick ±1、10 tick ±1、20 tick ±2）。
- `powered_shaft` 是可持久化的外部动力源端口。`steam_engine` 从相邻流体罐消耗 `50` 单位水/tick，向朝向侧动力轴输出 `16 RPM / 64` 容量；带 `heated` 标签的水提高到 `32 RPM / 128`。
- `windmill_bearing` 复用持久化动态结构控制器：组装相连的可移动方块并作为叶片计数后，每 8 块提高 1 RPM（1–16），解体后清零。`large_water_wheel` 放置及周期检查时自动维护八块结构环。
- `chain_conveyor` 将朝向两侧的 Depot 连接为持久化的 `DepotNetwork` 运输带，速度由自身动力节点读取；反向、重启重扫和有在途物品时的破坏保护均复用既有事务逻辑。

快照继续使用 kinetic schema v2；新增字段仅在需要时写入：换向器 `reversed`、链变速器 `chainSignal`、源 `generatedSpeed`/`sourceCapacity`、顺序器 `sequence`。旧快照仍可恢复。

## 资源边界

当前资源复用已转换的轴、齿轮、水车和机械轴承几何，以及 Java 来源贴图；这满足可放置和可识别，但不是 Java 模型视觉等价。后续资源收敛只改进视觉，不再承接本阶段的行为缺口。

`encased_*`、`motor`、`simple_kinetic` 与 `vertical_gearbox` 的抽象 Java 注册由具体节点或现有齿轮箱方向吸收，不增加虚假的 Bedrock 方块标识符。

## 本地验证

在 `bedrock/` 执行：

```sh
npm run kinetics:specs
npm test
npm run validate
npm run build
npm run pack
```

重点测试包括传动比、过载、故障源、红石快速更新、重启恢复、资源/掉落/翻译契约和构建后包校验。Windows Bedrock、Realm 与 PS 实机验证仍需在 S3-15 的三层 smoke test 中完成。
