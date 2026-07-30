# RBMK-1000 核电站模拟器 �?设计文档

## 概述

RBMK-1000 控制室模拟器。原为单文件 HTML5 游戏（prototype），移植�?LÖVE2D (Lua) 以实现：
- 模块化架构（模组系统�?- 可预测的确定性物理（锁步多人前瞻�?- 移动端触控兼容（LÖVE2D 原生�?- 轻量化单二进制分�?
## 引擎选型

| 方案 | 结论 |
|------|------|
| Unity / Godot / Unreal | 过重；模组生态不透明；不符合「单文件可玩」目�?|
| Web (Tauri / Electron) | 原生 HTML 已存在；移植无增�?|
| **LÖVE2D (Lua)** | 选定。~300KB 运行时，Lua 5.1，纯脚本热加载，文件即模�?|

## 目录结构

```
rbmk-love/
├── conf.lua              # LÖVE 配置 (identity, window, version)
├── main.lua              # 入口：test/game/gm 模式分派 + 主循�?├── DESIGN.md
├── mods_examples/        # 示例模组 (不自动加�?
├── assets/fonts/
�?  └── simhei.ttf        # 中文字体 (9.5MB, GUI 依赖)
├── src/
�?  ├── sim/              # �?Lua 仿真�?(�?love 依赖)
�?  �?  ├── constants.lua # 物理常数、难度表、季节表
�?  �?  ├── rng.lua       # LCG 确定性随机数生成�?�?  �?  └── reactor.lua   # 堆芯物理：点堆功方程、I-Xe、空�?温度反馈
�?  ├── game/             # 游戏状态、存档、事件、成就、模�?�?  �?  ├── state.lua     # 主状态机 (G)，全部操作函�?�?  �?  ├── save.lua      # Lua 序列化存�?(v1)
�?  �?  ├── mods.lua      # 沙盒模组加载�?�?  �?  ├── data_events.lua      # 9 个随机事�?(�?fx 回调)
�?  �?  └── data_achievements.lua # 12 个成�?�?  ├── ui/               # 渲染与交�?�?  �?  ├── theme.lua     # 配色、字体管�?�?  �?  ├── layout.lua    # 响应式缩�?(1600×900 设计基准)
�?  �?  ├── widgets.lua   # 按钮、面板、滚动区、进度条等原子控�?�?  �?  └── screens.lua   # 场景：intro / game / over / modal
�?  └── sfx.lua           # 波形合成音效 (click, alarm, boom �?
└── tests/
    ├── run.lua           # 8 个单元测�?(确定性、氙毒、AZ-5、熔毁、存档、模�?
    └── gm.lua            # 黄金对照生成�?```

## 仿真引擎 (`src/sim/`)

### 反应堆物�?(`reactor.lua`)

点堆�?+ 集中参数模型，~170 行�?
- **中子动力�?*: 三步反应性判�?(`>β` �?周期公式; `>0` �?倍增�? `<0` �?衰减)
- **�?135 / �?135**: 一�?ODE，Euler 推进；生产项与功率相关，消失项含燃烧
- **空泡反馈**: `void = f(coolOut - SAT_T)`，正系数 0.002/β
- **温度反馈**: 燃料 + 石墨，负系数 (Doppler + 石墨温度效应)
- **控制�?*: 211 根统一位置，分段正/负贡献（>99 �? 80�?9 石墨排水平台�? <80 吸收入段负）
- **AZ-5**: 三阶段插�?(2s�?s�?8s)，高空泡时正尖峰模型
- **LOWPOW**: <20% 功率时不稳定摆动 `power × (1 + rng(-1,1) × 0.12 × (1-skill))`

### 确定�?RNG (`rng.lua`)

LCG 参数 `x_{n+1} = (1664525·x_n + 1013904223) mod 2³²`。保证锁步多人：
- 仿真使用独立 RNG 实例 (`seed + 1`)，与 UI 随机解�?- `Reactor:new(rngFn)` 接受函数而非 RNG 对象，支持任意分�?
## 游戏状�?(`src/game/state.lua`)

`G` 表即状态对象，所有修改通过 `G:cmd*()` 方法�?
### 关键方法

| 方法 | 作用 |
|------|------|
| `init(seed)` | 重置全局 + Reactor + RNG + 人员/安全/燃料 |
| `begin()` | 进入游戏画面；设置棒位至 89 (ORM=211，修复原版启动死�? |
| `cmdMoveRods(d)` | 动棒 + 记录 ORM + 微步物理 |
| `cmdStartup()` | ORM�?6 检�?�?设功�?50MWt / POWER �?|
| `cmdAz5Fire()` | 触发 AZ-5 + 尖峰检�?|
| `tick(hours)` | 主推进：step 循环 + 趋势 + 退�?+ 事件 + 结算 |
| `randomEvent()` | 概率事件触发，条件：功率、ORM、安全、涡�?|
| `checkEnd()` | 熔毁/信任/资金 Game Over 判定 |
| `checkAchievements()` | 成就条件扫描 |

### 启动流程

1. `love.load` �?`G:init(os.time())` �?停堆态，棒位 100
2. Intro 选难�?�?`G:begin()` �?`moveRods(-11)` �?棒位 89, ORM=211
3. 点击「启动」→ `cmdStartup` �?`moveRods(10)` �?棒位 99, 功率 50, POWER �?4. 温度低于 300°C 时正温度反馈 �?功率缓慢上升 �?需手动插棒越过 80% 阈值转为负反馈

## 存档 (`src/game/save.lua`)

- **格式**: `return {v=1, money=..., r={power=..., rods=..., ...}}` �?�?Lua 序列�?- **位置**: `love.filesystem` 沙盒 (`save1` 文件)
- **迁移**: 版本�?`save.v`，当�?v1，未来扩�?`migrate()` �?- **恢复**: `loadstring` + `setfenv({})` 安全求�?
## 模组系统 (`src/game/mods.lua`)

四级沙盒设计，当前实�?L1�?
### L1 (数据�? 已实�?

- 扫描 `love.filesystem.getDirectoryItems('mods')`（源目录 + 存档目录合并�?- 每文�?`setfenv(chunk, sandboxEnv())` 执行
- 返回�?`{name, events?, achievements?, constants?}`
- events / achievements 追加�?`G.EVENTS` / `G.ACH`
- `constants?` 可覆�?`G.C[k]` 运行时参�?
### L2 / L3 (未来)

- L2: 沙盒 API 子集 ── `G:log(), G:toast(), G:fmt(), G.r.*`
- L3: 完全 Lua 钩子 ── 自定�?tick 回调、HUD 覆盖

## 保存/读档回环

序列化器支持递归表，数组优先 `{val1,val2}` 而非 `{[1]=val1}`�?reactor 子表�?`if data.r then for k,v in pairs(data.r) do G.r[k]=v end end` 合并恢复，不破坏 Reactor 元方法�?
## 已知原版 HTML Bug 修复

1. **事件 fx `this` 指向** �?HTML 用箭头函�?`()=>{this.r.power*=0.7}` �?DOM 回调�?`this` 指向 window；Lua 版显式传 `G`，回调签名为 `function(G)`�?2. **启动死锁** �?初始棒位 100 �?ORM=0 无法启动；`begin()` 中预插至 89�?3. **正空泡系�?* �?模型故意保留�?RBMK 特色，非 Bug�?
## 多人 / 锁步 (路线�?

- 仿真�?(`src/sim/`) �?love 依赖，可�?CLI 独立验证
- 黄金对照生成�?`tests/gm.lua --gm` 输出 JSON 轨迹
- Node.js 对弈器可 replay 同一 seed 验证完全一�?- 未来：websocket 同步 seed + 输入序列，每帧验�?checksum

## 版本号系�?
项目名称统一�?**«ЩИТ»**，Web �?LÖVE 版本使用相同的版本号系统�?
```
v{major}.{minor}.{patch} · сб.{YYYY.MM.DD} · РЭ-{YY}/{NN}
```

三层结构：语义版本（技术层）、构建日期（时间层）、修订代号（叙事层）�?
详见 `docs/design.md` �?`设定文档_v3.0.md §21`�?
## 测试

```bash
lovec rbmk-love --test
# 期望: 8 passed, 0 failed
```

测试覆盖�?
| 测试 | 验证 |
|------|------|
| 确定性与重放 | 2 次相�?seed 产生相同轨迹 |
| 氙毒积累 | 降功率后氙浓度上升，随后回落 |
| AZ-5 正尖�?| 高空泡时 AZ-5 导致功率飙升 |
| AZ-5 正常停堆 | 低空泡时 AZ-5 成功停堆 |
| 熔毁阈�?| 功率 >3840MW 触发 MELTDOWN |
| ORM 计数 | 棒位 <90 根数精确 |
| 存档/读档回环 | 保存 �?恢复 �?全字段一�?|
| 模组加载 | 临时 mod 追加 event �?EVENTS |
