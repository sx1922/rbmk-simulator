# Technical Document — RBMK Simulator

## Architecture

The simulator is organized around a single global `STATE` object that holds all mutable state. Three layers interact in a strict loop:

- **Physics** — pure functions that read `STATE` and return deltas
- **Systems** — game logic (economy, trust, personnel, maintenance, random events, safety-trial chains)
- **UI** — reads `STATE` and renders the DOM; no side effects on physics

## Data Flow

```
Player Input → main.js → STATE mutation
                         → physics step (sub-stepped)
                         → systems step
                         → UI render (requestAnimationFrame)
```

Each tick advances `STATE.time` by 0.5 s of simulation time. Stiff equations (neutronics, xenon) use sub-stepping inside the physics step.

## Physical Equations

### Point Kinetics (6 delayed-neutron groups)

```
dP/dt  = (rho - beta) / Lambda * P  +  sum(lambda_i * C_i)
dC_i/dt  = beta_i / Lambda * P  -  lambda_i * C_i
```

- `P` — reactor power (fraction of rated)
- `rho` — total reactivity (pcm)
- `beta` — effective delayed-neutron fraction
- `Lambda` — prompt-neutron lifetime (s)
- `lambda_i`, `beta_i` — decay constant and fraction for group i
- `C_i` — precursor concentration for group i

### Reactivity Synthesis

```
rho_total = rho_rods + rho_void + rho_fuel + rho_xenon + rho_external
```

- `rho_rods` — from control-rod insertion depth (with AZ-5 override)
- `rho_void` — void-reactivity feedback (positive in RBMK)
- `rho_fuel` — Doppler (negative) feedback
- `rho_xenon` — xenon-poisoning reactivity
- `rho_external` — operator-injected or event-driven worth

### Thermal Hydraulics (5 axial zones)

```
dT_zone/dt = (P_zone - h * A * (T_zone - T_coolant)) / (m * c_p)
```

- `P_zone` — fraction of core power deposited in zone i
- `h` — heat-transfer coefficient
- `A` — surface area of zone
- `T_zone`, `T_coolant` — zone and coolant temperatures (°C)
- `m` — mass of fuel / graphite in zone
- `c_p` — specific heat capacity

### Xenon Poisoning

```
dXe/dt  = gamma_xe * Sigma_f * Phi + lambda_I * I - lambda_xe * Xe - sigma_xe * Phi * Xe
dI/dt   = gamma_I  * Sigma_f * Phi - lambda_I * I
```

- `Xe`, `I` — xenon / iodine concentrations
- `Phi` — neutron flux (proportional to power)
- `Sigma_f` — macroscopic fission cross-section
- `gamma_xe`, `gamma_I` — fission yields
- `lambda_xe`, `lambda_I` — decay constants
- `sigma_xe` — microscopic absorption cross-section of Xe-135

### AZ-5 (Emergency Protection)

Three-phase rod insertion:
1. **Phase 1** — rod tips enter core (possible positive scram spike if graphite displacer enters water)
2. **Phase 2** — main absorber section follows
3. **Phase 3** — rods fully inserted, full shutdown

The positive scram spike is optional (controlled by config parameter) and requires sub-stepping to capture.

## Key Parameters

| Constant | Value | Description |
|---|---|---|
| `RATED_T` | 700 °C | Rated fuel temperature |
| `MELT_T` | 2800 °C | Fuel melting threshold |
| `NUM_RODS` | 211 | Total control rods |
| `ORM_MIN` | 15 | Minimum operable rod count |
| `ORM_CRIT` | 1.0 | ORM safety threshold |
| `FLOW_RATED` | 8000 m³/h | Rated coolant flow |
| `AXIAL_ZONES` | 5 | Number of thermal zones |

## STATE Schema

The complete `STATE` object (initialized in `src/state.js`):

```
STATE
├── time              (float, seconds)
├── running           (bool)
├── speed             (float, multiplier)
├── scenario          (string)
│
├── reactor
│   ├── power         (float, fraction 0..1)
│   ├── power_target  (float)
│   ├── scram         (bool)
│   ├── az5_phase     (0|1|2|3)
│   ├── rods          (array[NUM_RODS])
│   ├── orm           (float)
│   ├── period        (float, seconds)
│   ├── rho_total     (float, pcm)
│   ├── rho_rods      (float)
│   ├── rho_void      (float)
│   ├── rho_fuel      (float)
│   ├── rho_xenon     (float)
│   ├── flux          (float)
│   └── precursors    (array[6])
│
├── core
│   ├── zones         (array[5]: temp, power_frac, coolant_temp)
│   ├── avg_temp      (float)
│   ├── peak_temp     (float)
│   └── damage        (float, cumulative)
│
├── coolant
│   ├── flow          (float)
│   ├── pressure      (float)
│   ├── inlet_temp    (float)
│   └── outlet_temp   (float)
│
├── xenon
│   ├── concentration (float)
│   ├── iodine        (float)
│   └── reactivity    (float)
│
├── turbine
│   ├── speed         (float, rpm)
│   ├── power         (float, MW)
│   ├── steam_pressure (float)
│   ├── steam_flow    (float)
│   └── valve_pos     (float, 0..1)
│
├── building
│   ├── pressure      (float)
│   ├── radiation     (float)
│   ├── containment   (bool)
│   └── alarms        (array)
│
├── economy
│   ├── balance       (float)
│   ├── power_price   (float)
│   ├── penalty       (float)
│   └── maintenance   (float)
│
├── trust
│   ├── public        (float, 0..1)
│   ├── government    (float, 0..1)
│   └── staff         (float, 0..1)
│
├── personnel
│   ├── chief         (object)
│   ├── operators     (array)
│   └── morale        (float)
│
├── events
│   ├── queue         (array)
│   └── active        (object|null)
│
├── ui
│   ├── active_panel  (string)
│   ├── modal         (object|null)
│   ├── trend_buffer  (array)
│   └── alerts        (array)
│
└── test_chain
    ├── active        (bool)
    ├── current_step  (int)
    ├── safety_margin (float)
    └── history       (array)
```

## Stepping Strategy

One physics tick = 0.5 s of simulation time. Within each tick:

1. Compute sub-step size `dt_sub` (adaptive, clamped to 1 ms - 50 ms).
2. Loop over sub-steps:
   - Solve neutronics (RK4 for point kinetics + precursors)
   - Solve xenon/iodine (RK4)
   - Solve thermal zones (Euler or RK4)
   - Update coolant properties
   - Update turbine
3. After full tick: update game systems, generate events, compute UI deltas.

## Verification Method

- **Golden-master checkpoints**: deterministic runs compare STATE snapshots at tick boundaries against stored JSON hashes.
- **Scenario replay**: each test scenario is played from fixed seed; output must match golden file exactly.
- CI runs `npm test` which invokes the deterministic runner and diffs checkpoints.

---

## File Structure

```
rbmk-simulator/
├── lib/                # ESM library
│   ├── reactor.js      # Main reactor module
│   ├── scoring.js      # Scoring system (5 dimensions, report generation)
│   ├── save.js         # Save/archive system (Vakhtennyy Zhurnal, localStorage)
│   ├── scenario.js     # Scenario engine (event triggers, dialogue, 3 scenarios)
│   ├── physics/        # Physics modules (neutron, reactivity, thermal, xenon)
│   └── systems/        # System modules (az5, control, protection)
├── web/                # Standalone web simulator
│   ├── index.html
│   ├── style.css
│   ├── js/ (engine.js, render.js, props.js, app.js, boot.js, menu.js, audio.js)
│   └── version.json
├── love/               # LOVE port
│   ├── main.lua / conf.lua
│   └── src/ (physics, systems, ui, audio, save)
├── legacy/             # Orphaned global-style modules
│   ├── physics/turbine.js
│   └── systems/ (economy, events, maintenance, mission, personnel, politics)
├── docs/               # Design & technical documentation
│   ├── README.md, GDD.md, TDD.md, MENU.md, VERSION.md, CHANGELOG.md
│   ├── SCORING.md, SAVE.md, SCENARIO.md, UI_INTERACTION.md
│   ├── REACTOR_SIM.md, LOG_TEMPLATE.md
│   └── dev/AUDIO_IMPL.md
├── tests/              # Test suites (*.test.js)
│   └── scenarios/      # Scenario JSON and JS files
├── tools/              # Build, serve, validate scripts
├── version.json        # Single source of truth for version info
├── package.json
└── README.md
```

---

## UI 层模块

### boot.js — 启动动画

- 3.5s 磷光文字面板通电序列
- 6 阶段（全黑 → 文字打出 → 背光渐入 → 指示灯 → 菜单开关 → 就绪）
- 首次完整播放，之后可跳过（任意按键/点击）
- 状态机：`[BOOT] → [MENU_MAIN]`

### menu.js — 主菜单

- 6 项菜单 + 子菜单（值班配置/场景选择/设置/退出确认）
- 键盘（↑↓EnterEsc）和鼠标（悬停/点击）双支持
- LED 指示灯反馈（可用/选中/不可用/危险）
- 底部状态栏（班次/功率/时钟）
- 完整规格见 `docs/MENU.md`

### audio.js — 音频引擎

- 零外部音频文件，全部 Web Audio API 合成
- 5 层 bus 树：环境/设备/事件/报警/叙事
- 合成单元：脉冲、噪声爆发、扫频、工频嗡鸣、泵声、盖革、继电器、报警音、电话铃
- ducking 逻辑：报警/叙事触发时压低环境/设备层
- 初始化时机：首次 pointerdown 创建 AudioContext，后续每次交互 resume()
- 完整实现规格见 `docs/dev/AUDIO_IMPL.md`

### props.js — 桌面道具

- 运行规程手册：11 页，俄中双语，交互链接高亮仪表，黑框遮蔽段落，手写批注
- 值班日志：12 行表单，钢笔/铅笔切换，导出剪贴板
- 计算器：МК-61 风格，四则运算，OPR/Xe 实时读取
- 剂量仪：ДП-5В 模拟表盘，5 档量程，盖革咔嗒
- 电话：ВЧ 调度话机，摘机显示调度对话
- 茶杯：冷茶氛围，交班倒计时

### lib/scoring.js — 评分系统

- 5 独立维度：规程遵守/安全裕度/响应速度/设备状态/记录完整性
- 评分映射到苏联式评级（отлично→аварийная）
- 报告生成（Сменный рапорт），带具体评语
- 战役总结报告
- 完整规格见 `docs/SCORING.md`

### lib/save.js — 存档系统

- Diegetic 存档：Вахтенный журнал（值班日志）
- 存储：localStorage（Web）或文件系统（Love2D），通过 adapter 解耦
- 导入/导出/校验/损坏恢复（含备份）
- 统计追踪（总班次/事故/最佳成绩）
- 战役状态管理
- 完整规格见 `docs/SAVE.md`

### lib/scenario.js — 场景引擎

- ScenarioEngine：事件驱动引擎，支持 5 种触发条件（time/state/player_action/event_fired/compound）
- 事件动作：dialogue/alarm/phone_call/sim_override/end 等
- 3 场景注册（scenario_1/2/3）：降功率/涡轮惰转/事故
- 场景配置默认值（操作顺序/日志字段/安全参数包络）
- 场景状态管理器（状态继承/连续游玩）
- 完整规格见 `docs/SCENARIO.md`

### app.js — 应用入口

- 集成交互流程：boot → menu → game
- AudioContext 初始化管理
- 状态机流转

## Development Guide

### Environment

- A modern browser (Chrome, Firefox, Edge) with ES6+ support.
- No build tools required for development.
- For serving locally you need Python 3 or Node.js (for `serve.sh`).

### How to Run

```bash
cd tools
bash serve.sh
```

Then open **http://localhost:8000** in your browser.

### Build

```bash
bash tools/build.sh
```

Output is written to **dist/index.html** (single self-contained file).

### Coding Conventions

- **Language**: ES6+ (no transpilation step in dev)
- **Indentation**: 2 spaces (no tabs)
- **Naming**:
  - Constants: `UPPER_SNAKE_CASE`
  - Functions: `camelCase`
  - Namespaces/objects: `PascalCase`
- **State**: all mutable state lives in global `STATE`; no stray globals
- **Physics functions**: pure, accept `STATE` and `dt`, return deltas object
- **Systems**: may mutate `STATE` directly; should be idempotent within a tick
- **UI code**: read-only on `STATE`; DOM updates only

### Parameter Tuning

All tunable numbers live in `src/config.js`. Never hardcode magic numbers in physics or UI modules. Change values in config to adjust gameplay.
