# love/ — LÖVE 2D 端

- `conf.lua` — 窗口与存档目录配置（identity: rbmk-simulator）
- `main.lua` — 入口（实时循环、输入分发）
- `src/` — 游戏源码，见 `src/README.md`
- `tests/` — 测试，见 `tests/README.md`
- `mods_examples/` — 模组示例

运行（需 LÖVE 11.x）：`love .`
运行测试：`love . test`（窗口模式）或无 LÖVE 时 `lua tests/headless.lua`（见 tests/README.md）
