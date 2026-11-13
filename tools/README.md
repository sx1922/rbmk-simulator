# tools/

- `serve.sh` — 本地静态服务（Web 版）
- `build.sh` — 打包脚本
- `validate.js` — 场景 JSON 校验（注意：包为 `"type": "module"`，本文件是 CommonJS，暂不可直接运行；可用 `node --experimental-require-module` 之外的方式改造或改后缀 `.cjs`）
