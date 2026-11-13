# web/lib/ — 浏览器端共享模块

- `scoring.js` — 评级 / 值班报告 / 结算评分
- `save.js` — 值班日志持久化（localStorage，键 `rbmk_journal`）

由 `web/js/bridge.js` 以 ESM 引入，挂到 `window.Core`。
