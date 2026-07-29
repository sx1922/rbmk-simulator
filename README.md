# RBMK-1000 Simulator

核电站操作模拟游戏 — RBMK-1000 型反应堆模拟器。

## 快速开始

```bash
# 安装依赖 & 启动开发服务器
cd tools && bash serve.sh
```

浏览器打开 `http://localhost:8000`。

## 构建

```bash
bash tools/build.sh
```

输出 `dist/index.html`（单文件可发布）。

## 项目结构

```
rbmk-simulator/
├── docs/          # 文档
├── src/           # 源代码
│   ├── js/        # JavaScript 模块
│   │   ├── physics/   # 物理引擎
│   │   ├── systems/   # 游戏系统
│   │   ├── ui/        # 渲染层
│   │   ├── audio/     # 音效
│   │   └── utils/     # 工具函数
│   ├── css/       # 样式
│   └── assets/    # 资源文件
├── love/          # LÖVE 移植版 (Phase 2)
├── tools/         # 开发工具
└── tests/         # 测试
```

## 版本

当前版本：0.1.0
