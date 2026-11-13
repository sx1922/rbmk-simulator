# love/tests/

- `v2_tests.lua` — 全部用例（引擎 / 场景 / 无尽 / 挑战 / 仪表 / 日志 / 评分）
- `headless.lua` — 无 LÖVE 跑法：`lua love/tests/headless.lua`（注入 love.* stub，期望值由 `equiv_check.lua` 基准生成）
- `run2.lua` — LÖVE 端入口：`love . test`（同一套用例，真实 love.filesystem）
- `equiv_check.lua` — 种子化轨迹对照工具（与 web 端引擎同随机序列核对）
- `gm.lua` — 金标准检查点输出
- `run.lua` / `smoke_font.lua` — Phase-2 旧套件与字体冒烟
