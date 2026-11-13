# love/src/ — 游戏源码

| 模块 | 职责 |
|------|------|
| `engine.lua` | 物理引擎（点堆动力学、氙/空泡/ОЗР、保护、汽水分离器、衰变热等） |
| `app.lua` | 生命周期状态机（菜单/值班/终局/结算）、统计、输入路由 |
| `scenario.lua` | 场景事件运行时（历史重演模式剧本数据内置） |
| `endless.lua` | 无尽运营（逐月结算 / 事件 / 班组 / 成就 / 存档） |
| `challenge.lua` | 挑战模式 |
| `tutorial.lua` | 教学引导 |
| `props.lua` | 桌面道具（手册 / 电话 / 茶炉 / 计算器 / 剂量计 / 号码簿 / 日历涂画） |
| `menu.lua` | 主菜单与整定设置 |
| `pause.lua` | 暂停菜单 |
| `debrief.lua` | 结算画面 |
| `instrument.lua` | 仪表中间层（量程 / 滞后 / 噪声 / 故障）+ 报警灯状态机 |
| `journal.lua` | 值班日志持久化（`rbmk_journal`） |
| `kvstore.lua` | 通用键值持久化（无尽存档 / 成就 / 最高分） |
| `scoring.lua` | 评级 / 值班报告 / 历史匹配度 |
| `audio/synth.lua` | 程序化音效合成（无外部素材） |
| `ui/` | HUD 与控件，见 `ui/README.md` |
| `physics/`、`systems/`、`save/`、`state.lua`、`config.lua` | 回合制原型（Phase-2）遗留，未接入当前运行时 |
