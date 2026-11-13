[**中文**](#) | [**English**](#english) | [**Русский**](#russian)

---

# ЩИТ · РБМК-1000 控制室模拟器

模块化的 RBMK-1000 反应堆控制室模拟器，纯 JavaScript ESM + Web Audio API。重现已确认的切尔诺贝利正停堆效应。

**核心体验**：你不是在"玩游戏"。你在值一班。从 1986 年 4 月 25 日 08:00 到 4 月 26 日 01:23:47。

---

## 快速开始

```bash
# 启动 Web 版本
cd tools
bash serve.sh
# 浏览器打开 http://localhost:8000

# 运行测试
npm test
node tests/scoring.test.js
```

## 项目结构

```
rbmk-simulator/
├── lib/                   # ESM 核心库
│   ├── reactor.js         # 反应堆主循环，统一 API
│   ├── scoring.js         # 评分系统（5 维度 / 报告生成）
│   ├── save.js            # 存档系统（Вахтенный журнал）
│   ├── scenario.js        # 场景引擎（3 场景事件驱动）
│   ├── physics/           # 物理模型
│   │   ├── neutron.js     # 点堆中子动力学（6 组缓发中子）
│   │   ├── reactivity.js  # 反应性反馈（空泡/多普勒/氙/棒/燃耗）
│   │   ├── thermal.js     # 热工水力（燃料/冷却剂/空泡）
│   │   └── xenon.js       # I-135/Xe-135 氙毒动力学
│   └── systems/           # 系统模块
│       ├── az5.js         # AZ-5 紧急停堆
│       ├── control.js     # 控制棒驱动机构
│       └── protection.js  # 自动保护系统（СУЗ）
├── web/                   # 独立浏览器版本
│   ├── index.html         # 主页面（含 БЩУ 面板布局）
│   ├── style.css          # 全套 UI 样式
│   └── js/
│       ├── engine.js      # 游戏状态循环（简易物理实现）
│       ├── render.js      # Canvas 仪表/堆芯/棒位/纸带渲染
│       ├── props.js       # 桌面道具（手册/日志/计算器/剂量仪/电话/茶）
│       ├── audio.js       # 全合成音频引擎（8 模块/5 层 bus）
│       ├── boot.js        # 3.5s 启动动画
│       ├── menu.js        # 主菜单系统
│       └── app.js         # 应用入口（boot → menu → game）
├── love/                  # LÖVE 端口（Lua）
├── legacy/                # 废弃全局风格模块
├── docs/                  # 设计文档
│   ├── GDD.md             # 游戏设计文档（21 节）
│   ├── TDD.md             # 技术设计文档
│   ├── CHANGELOG.md       # 变更日志
│   ├── MENU.md            # 主菜单设计规格
│   ├── SCENARIO.md        # 场景脚本结构（3 场景）
│   ├── SCORING.md         # 评分系统设计
│   ├── SAVE.md            # 存档系统设计
│   ├── UI_INTERACTION.md  # 交互设计（БЩУ 6 区）
│   ├── REACTOR_SIM.md     # 物理模型 v2
│   ├── ENDLESS_MODE.md    # 无尽模式设计（运营模拟）
│   ├── LOG_TEMPLATE.md    # 值班日志模板
│   └── dev/AUDIO_IMPL.md  # 音频引擎实现
├── tests/                 # 测试套件
│   ├── *.test.js          # 各模块测试（共 ~270 项）
│   └── scenarios/         # 场景测试数据
├── tools/                 # 构建/服务脚本
└── version.json           # 单一版本来源
```

## 物理模型

### 中子动力学（6 组缓发中子点堆）

```
dn/dt = ((rho - beta)/Lambda) * n + sum(lambda_i * C_i)
dC_i/dt = (beta_i/Lambda) * n - lambda_i * C_i
```

| 参数 | 值 | 说明 |
|------|-----|------|
| Lambda | 1e-4 s | 瞬发中子代时间 |
| beta | 0.0065 | 总缓发中子份额 |
| 分组 | 6 | U-235 热裂变标准数据 |

### 反应性反馈

| 反馈 | 公式 |
|------|------|
| 空泡（RBMK 正反馈！） | rho_v = 0.273 * voidFraction |
| 多普勒（负反馈） | rho_d = -1.7e-4 * (T_fuel - T_ref) |
| 慢化剂 | rho_m = 2e-4 * (T_coolant - 285) |
| 氙-135 | I-135 → Xe-135 衰变链动态计算 |
| 控制棒 | 余弦平方积分 + 石墨端部效应（正停堆效应） |

### 事故再现

在初始条件 `CHERNOBYL_PRE`（功率 6.3%，棒位 0.04，САОР 已切）下按 AZ-5，石墨端部效应引入正反应性，堆芯在一秒内达到瞬发临界——完全复现真实事故序列。

## 当前状态

| 系统 | 状态 | 说明 |
|------|------|------|
| 物理仿真 | ✅ 完成 | 6 组缓发中子 + 热工 + 氙 + 保护系统，~270 测试全通过 |
| 音频引擎 | ✅ 完成 | 全合成，5 层 bus，П1-П10+AZ5 报警音，泵/盖革/电话/混合器 |
| 启动动画 | ✅ 完成 | 3.5s 磷光文字面板通电，可跳过 |
| 主菜单 | ✅ 完成 | 6 项菜单，子菜单，LED 指示灯，键盘/鼠标 |
| 控制面板 | ✅ 完成 | 功率/周期/堆芯/棒位/反应性/纸带/AZ-5 按钮，Canvas 渲染 |
| 桌面道具 | ✅ 完成 | 手册 11 页/日志/МК-61/ДП-5В/电话/茶 |
| 场景引擎 | ✅ 完成 | 3 场景注册，事件驱动触发系统 |
| 评分系统 | ✅ 完成 | 5 维度，苏联评级，报告生成 |
| 存档系统 | ✅ 完成 | Вахтенный журнал，导入/导出/校验/恢复 |
| 场景内容 | ❌ 未接入 | 场景脚本已定义但未接入游戏循环 |
| LÖVE 端口 | ⏳ 规划中 | |

## 测试

```bash
# 运行全部测试
node tests/reactor.test.js
node tests/scoring.test.js
# 场景测试
node tests/scenarios/demo.js
node tests/scenarios/chernobyl-scenario.js
```

当前共 **~270** 项测试，0 失败。

## 许可

MIT

---

<a name="english"></a>

[**中文**](#) | [**English**](#english) | [**Русский**](#russian)

# SHIELD · RBMK-1000 Control Room Simulator

Modular RBMK-1000 reactor control room simulator in pure JavaScript ESM + Web Audio API. Reproduces the confirmed Chernobyl positive scram effect.

**Core experience**: You're not "playing a game." You're working a shift. From 1986-04-25 08:00 to 1986-04-26 01:23:47.

## Quick Start

```bash
cd tools
bash serve.sh
# Open http://localhost:8000
```

## Project Structure

```
lib/           — ESM core library (reactor, scoring, save, scenario, physics, systems)
web/           — Standalone browser version (panel UI, audio, boot, menu)
love/          — LÖVE port (Lua)
legacy/        — Orphaned global-style modules
docs/          — Design docs (GDD, TDD, SCENARIO, SCORING, SAVE, etc.)
tests/         — Test suites (~270 assertions, 0 failures)
tools/         — Build/serve scripts
version.json   — Single source of truth
```

## Physics Model

6-group delayed neutron point kinetics with full reactivity feedback (void/Doppler/Xe/rods) and AZ-5 graphite tip effect.

## Status

| System | Status | Notes |
|--------|--------|-------|
| Physics | ✅ Done | 6-group PK + thermal + xenon + protection, ~270 tests pass |
| Audio | ✅ Done | Full Web Audio API synthesis, 5-layer bus, alarm specs |
| Boot | ✅ Done | 3.5s phosphor text sequence |
| Menu | ✅ Done | 6-item main menu with sub-menus |
| Panel UI | ✅ Done | Canvas gauges, rod display, chart recorder, AZ-5 button |
| Desk Props | ✅ Done | Manual, logbook, calculator, dosimeter, phone, coffee |
| Scenario Engine | ✅ Done | 3 scenarios registered, event-driven trigger system |
| Scoring | ✅ Done | 5 dimensions, Soviet ratings, report generation |
| Save | ✅ Done | Vakhtennyy Zhurnal, import/export/backup |
| Scenario Content | ❌ Not integrated | Scripts defined but not wired into game loop |
| LÖVE Port | ⏳ Planned | |

---

<a name="russian"></a>

[**中文**](#) | [**English**](#english) | [**Русский**](#russian)

# ЩИТ · Тренажёр блочного щита управления РБМК-1000

Модульный симулятор реактора РБМК-1000 на чистом JavaScript ESM + Web Audio API. Воспроизводит подтверждённый положительный эффект при АЗ-5.

**Основной опыт**: Вы не «играете в игру». Вы несёте смену. С 08:00 25 апреля 1986 года до 01:23:47 26 апреля.

## Быстрый старт

```bash
cd tools
bash serve.sh
# Открыть http://localhost:8000
```

## Состояние

| Система | Статус | Примечание |
|---------|--------|------------|
| Физика | ✅ Готово | 6-групповая точечная кинетика + теплогидравлика + ксенон + защита |
| Аудио | ✅ Готово | Полный синтез Web Audio API, 5 шин, сигналы П1-П10+АЗ-5 |
| Загрузка | ✅ Готово | 3.5s фосфорная текстовая последовательность |
| Меню | ✅ Готово | 6 пунктов с подменю |
| Панель БЩУ | ✅ Готово | Canvas-приборы, стержни, регистратор, кнопка АЗ-5 |
| Пропсы | ✅ Готово | Регламент, журнал, МК-61, ДП-5В, телефон, чай |
| Движок сценариев | ✅ Готово | 3 сценария, событийная система |
| Оценка | ✅ Готово | 5 измерений, советские рейтинги, рапорт |
| Сохранение | ✅ Готово | Вахтенный журнал, экспорт/импорт/бэкап |
| Контент сценариев | ❌ Не интегрирован | Сценарии описаны, но не подключены |
| LÖVE | ⏳ Планируется | |

## Сценарии

1. **Снижение мощности** — Дневная смена: 3200 → 1600 МВт, обучение основам
2. **Испытание выбега** — Ночная смена: отключение САОР → выбег → дизель
3. **Авария** — 01:03-01:23:47, 4 концовки, призматический эффект Концевика

## Тесты

```bash
node tests/scoring.test.js   # 50 тестов
node tests/reactor.test.js   # ~220 тестов
```

**~270 тестов, 0 ошибок.**
