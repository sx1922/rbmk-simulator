# lib/ — 物理与系统核心（Node.js）

反应堆物理模型与游戏系统，被 `tests/` 与 `tools/` 引用。

- `reactor.js` — 模型入口（点堆动力学、氙瞬态、正停堆效应）
- `physics/` — neutron / reactivity / thermal / xenon 分模块
- `systems/` — az5 / control / protection 操作系统
- `scenarios/` — 场景定义（JSON）与运行脚本

运行测试：仓库根目录 `npm test`
