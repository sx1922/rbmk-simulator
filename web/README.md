# web/ — Web 版客户端（纯静态）

- `index.html` — 入口页面（控制室 + 主菜单 + 各浮层 DOM）
- `style.css` — 全部样式（控制室、菜单、道具、演出动画）
- `version.json` — Web 端版本号（菜单页脚 / 关于浮层读取）
- `js/` — 客户端模块，见 `js/README.md`
- `lib/` — 浏览器端评分与存档模块

本地运行：`bash tools/serve.sh`（或任意静态服务器指向仓库根，访问 `web/index.html`）
