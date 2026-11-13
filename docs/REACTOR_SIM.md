# 反应堆物理模型 — Модель Реактора

## 文档信息

- **文档编号**：GDD-REACTOR-SIM
- **版本**：2.0.0
- **状态**：草案
- **变更记录**：
  - v1.0（2026-07-30）：初版。点堆 PRKE、氙动力学、空泡效应、温度反馈、控制棒、末端效应、热工水力、泵、保护、OBR。
  - v2.0（2026-08-02）：升级版。新增汽水分离器模型、给水温度动态、热冲击、控制棒驱动限制、中子探测器量程、仪表动态响应、衰变热、反应堆周期、空间效应（四象限模型）、燃料包壳完整性、辐射模型。**升级原则：不修改 v1.0 方程与参数，只增不改，新模型通过读写 ReactorState 已有字段与 v1.0 模型耦合，所有新增状态量带默认值保证向后兼容。**

## 设计哲学

这不是"像反应堆"。这是"是反应堆"。

- 所有方程都是真实的核工程方程。
- 所有参数都是 RBMK-1000 的真实参数（或从公开文献推导）。
- 玩家看到的每一个数字，都是方程的解。
- 没有"如果功率太低就自动恢复"。没有。
- 没有"安全网"。物理就是物理。
- 如果玩家犯了真实操作员犯的错误，结果就是真实的结果。

### 精度目标

- **中子动力学**：点堆方程，6 组缓发中子。精确。
- **氙动力学**：碘-135 → 氙-135 微分方程。精确。
- **空泡效应**：正空泡系数，与功率/流量耦合。简化但物理正确。
- **温度反馈**：多普勒 + 慢化剂温度。简化但方向正确。
- **控制棒**：棒位-反应性曲线 + 末端效应（正插入效应）。关键。
- **热工水力**：集总参数（不做 CFD）。简化但守恒。
- **燃料通道**：不逐个建模。用"等效通道"。

### 不做的

- 空间动力学（不做三维中子通量分布）— v2.0 起用四象限模型近似局部功率分布（§9），仍非三维通量
- 燃料燃耗（场景时间太短，忽略）
- 裂变产物除氙/碘外（忽略）— v2.0 新增辐射模型追踪冷却剂活度与包壳完整性泄漏，但 Sm-149 等慢毒物仍忽略
- 结构材料活化（忽略）

## 状态变量

```ts
interface ReactorState {
  // === 中子动力学 ===
  n: number;              // 中子通量（归一化，1.0 = 额定功率 3200 MW）
  C: number[];            // 缓发中子先驱核浓度，6 组
  rho: number;            // 总反应性（单位：β）
  period: number;         // 反应堆周期（秒）。∞ = 稳态

  // === 氙/碘动力学 ===
  I: number;              // 碘-135 浓度（归一化）
  Xe: number;             // 氙-135 浓度（归一化）
  rho_xe: number;         // 氙反应性（单位：β）

  // === 热工水力 ===
  T_fuel: number;         // 燃料平均温度（°C）
  T_coolant_in: number;   // 冷却剂入口温度（°C）
  T_coolant_out: number;  // 冷却剂出口温度（°C）
  T_moderator: number;    // 石墨慢化剂温度（°C）
  void_fraction: number;  // 空泡份额（0–1）
  void_actual: number;    // 实际空泡份额（含延迟）
  pressure: number;       // 一回路压力（MPa）

  // === 控制棒 ===
  rod_positions: number[];  // 211 根棒的位置（0=全提出，1=全插入）
  rho_rods: number;         // 棒总反应性（单位：β）
  rho_tip: number;          // 末端效应反应性（单位：β）

  // === 冷却系统 ===
  pumps: PumpState[];       // 8 台 ГЦН
  flow_rate: number;        // 总冷却剂流量（m³/h）

  // === 功率 ===
  P_thermal: number;        // 热功率（MW）
  P_electric: number;       // 电功率（MW）
  P_percent: number;        // 功率百分比（%）

  // === 时间 ===
  simTime: number;          // 模拟时间（秒）

  // ================= v2.0 新增状态量 =================
  // === 汽水分离器 ===
  separator_level: number;        // 汽水分离器水位，m。正常 0.8-1.2
  separator_pressure: number;     // 分离器压力，MPa。正常 6.9
  feedwater_flow: number;         // 给水总流量，m³/h。正常 ~5000
  feedwater_temp: number;         // 给水温度，°C。正常 265-275
  steam_flow: number;             // 蒸汽总流量，t/h。随功率变化

  // === 燃料包壳 ===
  clad_integrity: number;         // 包壳完整性，0.0-1.0。1.0=完好
  clad_temp_max: number;          // 最热通道包壳温度，°C。正常 ~350

  // === 控制棒驱动 ===
  active_rod_drives: number;      // 当前正在运动的棒数
  rod_drive_temp: number;         // 驱动机构温度，°C。正常 20
  rod_drive_overheat: boolean;    // 过热闭锁标志
  rod_command_queue: RodCommand[];// 排队中的棒指令

  // === 衰变热 ===
  scram_time: number | null;      // 停堆时刻（null=未停堆）
  pre_scram_power: number;        // 停堆前稳态功率，MW
  decay_heat_power: number;       // 当前衰变热功率，MW

  // === 反应堆周期 ===
  reactor_period: number;         // 反应堆周期，s。∞=功率不变
  dP_dt: number;                  // 功率变化率，MW/s

  // === 空间效应（象限模型）===
  quadrant_power: [number, number, number, number]; // 四象限功率，MW
  quadrant_xenon: [number, number, number, number]; // 四象限氙浓度
  quadrant_rods: [number, number, number, number];  // 四象限棒插入深度

  // === 辐射 ===
  coolant_activity: number;       // 冷却剂放射性活度，Bq/m³
  containment_dose_rate: number;  // 主控室剂量率，mR/h
}

// v2.0 默认值（全部新增状态量带默认值，保证 v1.0 逻辑在默认值时行为不变）
const DEFAULT_V2: Partial<ReactorState> = {
  separator_level: 1.0,
  separator_pressure: 6.9,
  feedwater_flow: 5000,
  feedwater_temp: 270,
  steam_flow: 1470,
  clad_integrity: 1.0,
  clad_temp_max: 350,
  active_rod_drives: 0,
  rod_drive_temp: 20,
  rod_drive_overheat: false,
  rod_command_queue: [],
  scram_time: null,
  pre_scram_power: 0,
  decay_heat_power: 0,
  reactor_period: Infinity,
  dP_dt: 0,
  quadrant_power: [800, 800, 800, 800],
  quadrant_xenon: [0, 0, 0, 0],
  quadrant_rods: [0.5, 0.5, 0.5, 0.5],
  coolant_activity: 1e3,
  containment_dose_rate: 0.1,
};

interface PumpState {
  id: number;               // 1–8
  loop: 1 | 2;             // 北环路 / 南环路
  running: boolean;
  flow: number;             // 该泵流量（m³/h）
  current: number;          // 电流（A）
  coastdown: number;        // 惰转进度（0–1，1=完全停止）
}
```

## 中子动力学（点堆方程）

### 方程

点堆动力学方程（Point Reactor Kinetics Equations, PRKE）：

```
dn/dt = (ρ - β) / Λ · n + Σᵢ λᵢ · Cᵢ

dCᵢ/dt = βᵢ / Λ · n - λᵢ · Cᵢ      (i = 1..6)
```

其中：
- n = 中子通量（归一化到额定功率）
- ρ = 总反应性（无量纲，以 Δk/k 表示）
- β = 有效缓发中子份额
- Λ = 瞬发中子代时间
- Cᵢ = 第 i 组先驱核浓度
- λᵢ = 第 i 组先驱核衰变常数
- βᵢ = 第 i 组缓发中子份额

### RBMK-1000 参数

```js
const NEUTRON_KINETICS = {
  Lambda: 1.0e-4,  // 0.1 ms
  beta_eff: 0.0060,

  delayed_groups: [
    { beta_i: 0.000215, lambda_i: 0.0124 },   // 组 1
    { beta_i: 0.001424, lambda_i: 0.0305 },   // 组 2
    { beta_i: 0.001274, lambda_i: 0.111  },   // 组 3
    { beta_i: 0.002568, lambda_i: 0.301  },   // 组 4
    { beta_i: 0.000748, lambda_i: 1.14   },   // 组 5
    { beta_i: 0.000273, lambda_i: 3.01   },   // 组 6
  ],
};
```

### 反应堆周期

周期 T 定义：`n(t) = n₀ · exp(t/T)`

稳态时 T = ∞。正反应性 → T > 0（功率上升）。负反应性 → T < 0（功率下降）。

计算：如果 `|dn/dt| / n < 1e-6` → T = ∞（稳态）；否则 T = n / (dn/dt)

面板上的周期表量程：0.5s – ∞；红区：< 20s（报警）；危险区：< 5s（自动保护动作）

### 数值积分

```js
function integratePRKE(state, rho, dt) {
  const { Lambda, beta_eff, delayed_groups } = NEUTRON_KINETICS;
  const n_sub = Math.ceil(dt / 1e-5);
  const h = dt / n_sub;

  let n = state.n;
  let C = [...state.C];

  for (let step = 0; step < n_sub; step++) {
    for (let i = 0; i < 6; i++) {
      const { beta_i, lambda_i } = delayed_groups[i];
      C[i] += h * (beta_i / Lambda * n - lambda_i * C[i]);
    }

    let sum_lambda_C = 0;
    for (let i = 0; i < 6; i++) {
      sum_lambda_C += delayed_groups[i].lambda_i * C[i];
    }

    const denom = 1 - h * (rho - beta_eff) / Lambda;
    if (denom <= 0) {
      n *= Math.exp((rho - beta_eff) / Lambda * h);
    } else {
      n = (n + h * sum_lambda_C) / denom;
    }

    n = Math.max(n, 1e-8);
    n = Math.min(n, 50);
  }

  state.n = n;
  state.C = C;

  const dn_dt = (rho - beta_eff) / Lambda * n +
    delayed_groups.reduce((sum, g, i) => sum + g.lambda_i * C[i], 0);
  state.period = Math.abs(dn_dt / n) < 1e-6 ? Infinity : n / dn_dt;
}
```

## 氙-135 动力学

### 物理

裂变 → 碘-135 (T½ = 6.57 h) → β衰变 → 氙-135 (T½ = 9.14 h) → β衰变 → 铯-135（稳定）

氙-135 是已知最大的中子吸收体（σ_a = 2.65×10⁶ barn）。它的浓度决定了反应堆的"中毒"程度。

关键现象：
- 功率降低 → 氙产生不变（来自碘衰变）但燃烧减少 → 氙积累 → "碘坑"
- 功率升高 → 氙燃烧增加 → 氙减少 → 正反应性 → 功率进一步升高
- 这就是为什么降功率后不能立即再升功率（需要等氙衰变，~30h）

### 方程

```
dI/dt = γ_I · Σ_f · φ - λ_I · I
dXe/dt = γ_Xe · Σ_f · φ + λ_I · I - λ_Xe · Xe - σ_Xe · φ · Xe
```

### 归一化处理

```js
const XENON_PARAMS = {
  gamma_I: 0.0639,
  gamma_Xe: 0.00237,
  lambda_I: 2.92e-5,    // s⁻¹
  lambda_Xe: 2.10e-5,   // s⁻¹
  alpha: 3.0,            // 燃烧/衰变比
  rho_xe_max: -3.5,     // β
};

function integrateXenon(state, dt) {
  const { lambda_I, lambda_Xe, alpha } = XENON_PARAMS;
  const n = state.n;

  const dI = lambda_I * (n - state.I);
  state.I += dI * dt;

  const production = lambda_I * state.I + lambda_Xe * (1 + alpha) * n;
  const removal = lambda_Xe * state.Xe + lambda_Xe * alpha * n * state.Xe;
  const dXe = production - removal;
  state.Xe += dXe * dt;

  state.rho_xe = XENON_PARAMS.rho_xe_max * state.Xe;
}
```

### 氙振荡（空间效应简化）

将堆芯分为 2 个区域（上半部 / 下半部），每个区域有独立的 I, Xe。控制棒主要影响上半部。这导致：提棒 → 上半部功率升 → 上半部氙燃烧 → 上半部正反应性 → 功率向上半部倾斜 → 进一步提棒需求 → 恶性循环。这是场景 3 的关键机制之一。

```js
// 两个区域
state.xenon_zones = [
  { I: 1.0, Xe: 1.0, power_share: 0.5 },  // 上半
  { I: 1.0, Xe: 1.0, power_share: 0.5 },  // 下半
];

function computePowerTilt(rod_positions) {
  const avg_pos = average(rod_positions);
  return 0.35 + 0.30 * avg_pos;
}
```

## 反应性模型

### 总反应性

```
ρ_total = ρ_rods + ρ_xe + ρ_void + ρ_temp + ρ_external
```

- ρ_rods = 控制棒反应性（负，插入越多越负）
- ρ_xe = 氙反应性（负，氙越多越负）
- ρ_void = 空泡反应性（正！RBMK 的致命特性）
- ρ_temp = 温度反馈（负，多普勒 + 慢化剂）
- ρ_external = 外部引入（场景脚本用，如"实验开始"）

### 控制棒反应性

211 根控制棒：181 根主控制棒（碳化硼吸收体）+ 24 根短棒 + 6 根手动紧急棒。

每根棒有位置 pos ∈ [0, 1]：0 = 完全提出，1 = 完全插入。

```js
const ROD_PARAMS = {
  count: 211,
  speed: 0.4,             // m/s
  core_height: 7.0,       // m
  travel_time: 17.5,      // s
  max_worth_per_rod: 0.057, // β 单位
};

function rodWorthIntegral(pos) {
  const p = Math.max(0, Math.min(1, pos));
  return ROD_PARAMS.max_worth_per_rod * (3 * p * p - 2 * p * p * p);
}

function computeRodReactivity(rod_positions) {
  let total = 0;
  for (const pos of rod_positions) {
    total -= rodWorthIntegral(pos);
  }
  return total;
}
```

### 末端效应（正插入效应）— 关键！

这是切尔诺贝利事故的核心物理。

RBMK 控制棒结构（从下到上）：
```
┌─────────┐
│ 吸收体   │  ← 碳化硼（B₄C），5.12m
├─────────┤
│ 水柱    │  ← 1.25m
├─────────┤
│ 置换体   │  ← 石墨，4.5m（正反应性！）
├─────────┤
│ 水柱    │  ← 1.25m
└─────────┘
```

当棒完全提出时：置换体（石墨）在堆芯下部。当棒开始插入时（从全提位置）：
- 棒全提时，置换体不在堆芯内，堆芯通道内是水
- 棒开始插入 → 置换体（石墨）进入堆芯底部
- 石墨替代水 → 局部正反应性！
- 这就是"正插入效应"或"末端效应"

简化模型：
- 当棒从全提位置开始插入的前 ~1m（归一化 ~0.14）：引入正反应性（石墨替代水）
- 之后：吸收体进入，引入负反应性
- 净效果：先正后负
- 如果大量棒同时插入（AZ-5）：初始正反应性脉冲 ≈ +1β

```js
function tipEffect(pos, was_fully_withdrawn) {
  if (!was_fully_withdrawn) return 0;

  const tip_zone = 0.14;

  if (pos > tip_zone) return 0;

  const peak = ROD_PARAMS.max_worth_per_rod * 0.3;
  const t = pos / tip_zone;

  if (t < 0.5) {
    return peak * (t / 0.5);
  } else {
    return peak * ((1 - t) / 0.5);
  }
}

function computeTipReactivity(rod_positions, prev_rod_positions) {
  let total = 0;
  for (let i = 0; i < rod_positions.length; i++) {
    const was_withdrawn = prev_rod_positions[i] < 0.01;
    if (was_withdrawn && rod_positions[i] > 0 && rod_positions[i] < 0.14) {
      total += tipEffect(rod_positions[i], true);
    }
  }
  return total;
}
```

### 空泡反应性（正空泡系数）

RBMK 的致命设计缺陷：正空泡系数。

物理原因：RBMK 用石墨慢化、水冷却。水在 RBMK 中主要是吸收体（不是慢化剂——石墨已经慢化了）。水变成蒸汽（空泡）→ 吸收减少 → 反应性增加。空泡越多 → 反应性越正 → 功率越高 → 温度越高 → 空泡越多。正反馈！

数值：空泡系数 ≈ +4.7β / 100% 空泡（1986 年值）。现代改进后降至 +1β 到 +2β。

```js
const VOID_PARAMS = {
  coefficient: 4.7,          // β（void_fraction = 1.0 时的总正反应性）
  void_nominal: 0.14,        // 额定工况下 14%
  tau_void: 7.0,             // s（一阶延迟时间常数）
};

function computeVoidEquilibrium(P_thermal, flow_rate, pressure) {
  const P_ratio = P_thermal / 3200;
  const flow_ratio = flow_rate / 48000;
  const pressure_ratio = pressure / 6.5;

  let void_eq = VOID_PARAMS.void_nominal *
    (P_ratio / Math.max(flow_ratio, 0.1)) *
    Math.pow(1 / Math.max(pressure_ratio, 0.5), 0.5);

  void_eq = Math.max(0, Math.min(1, void_eq));
  return void_eq;
}

function updateVoidFraction(state, dt) {
  const void_eq = computeVoidEquilibrium(state.P_thermal, state.flow_rate, state.pressure);
  state.void_fraction = void_eq;

  state.void_actual += (void_eq - state.void_actual) * dt / VOID_PARAMS.tau_void;
  state.void_actual = Math.max(0, Math.min(1, state.void_actual));
}

function computeVoidReactivity(void_actual) {
  const delta_void = void_actual - VOID_PARAMS.void_nominal;
  return VOID_PARAMS.coefficient * delta_void;
}
```

### 温度反馈

```js
const TEMP_PARAMS = {
  alpha_doppler: -0.0015,     // β/°C
  alpha_moderator: -0.0008,   // β/°C
  T_fuel_ref: 350,            // °C
  T_mod_ref: 270,             // °C
};

function computeTempReactivity(T_fuel, T_moderator) {
  const rho_doppler = TEMP_PARAMS.alpha_doppler * (T_fuel - TEMP_PARAMS.T_fuel_ref);
  const rho_mod = TEMP_PARAMS.alpha_moderator * (T_moderator - TEMP_PARAMS.T_mod_ref);
  return rho_doppler + rho_mod;
}
```

### 总反应性汇总

```js
function computeTotalReactivity(state, prev_rod_positions) {
  const rho_rods = computeRodReactivity(state.rod_positions);
  const rho_tip = computeTipReactivity(state.rod_positions, prev_rod_positions);
  const rho_xe = state.rho_xe;
  const rho_void = computeVoidReactivity(state.void_actual);
  const rho_temp = computeTempReactivity(state.T_fuel, state.T_moderator);

  state.rho = rho_rods + rho_tip + rho_xe + rho_void + rho_temp;
  state.rho_rods = rho_rods;
  state.rho_tip = rho_tip;

  return state.rho;
}
```

## 热工水力（集总参数）

### 模型

不做 CFD。用集总参数：

- 燃料：一个温度节点
- 冷却剂：入口/出口两个温度节点
- 石墨慢化剂：一个温度节点（变化极慢）

能量守恒：
```
燃料：   m_f · c_f · dT_f/dt = P_thermal - h_fg · A_fg · (T_f - T_coolant_avg)
冷却剂： m_c · c_c · dT_c/dt = h_fg · A_fg · (T_f - T_coolant_avg) - ṁ · c_c · (T_out - T_in)
石墨：   m_g · c_g · dT_g/dt = P_gamma - h_gc · A_gc · (T_g - T_coolant_avg)
```

### 参数与实现

```js
const THERMAL_PARAMS = {
  fuel_mass: 190000,             // kg
  fuel_cp: 300,                  // J/(kg·°C)
  fuel_to_coolant_hA: 2.5e7,     // W/°C
  coolant_mass: 16000,           // kg
  coolant_cp: 5200,              // J/(kg·°C)
  coolant_inlet_temp: 270,       // °C
  graphite_mass: 1700000,        // kg（1700 吨）
  graphite_cp: 710,              // J/(kg·°C)
  graphite_to_coolant_hA: 5e6,   // W/°C
  gamma_fraction: 0.055,
  nominal_pressure: 6.5,         // MPa
  saturation_temp_at_6_5: 280,   // °C
};

function integrateThermal(state, dt) {
  const P = state.P_thermal * 1e6;
  const P_fuel = P * (1 - THERMAL_PARAMS.gamma_fraction);
  const P_gamma = P * THERMAL_PARAMS.gamma_fraction;
  const T_coolant_avg = (state.T_coolant_in + state.T_coolant_out) / 2;

  const Q_fuel_to_coolant = THERMAL_PARAMS.fuel_to_coolant_hA * (state.T_fuel - T_coolant_avg);
  const dT_fuel = (P_fuel - Q_fuel_to_coolant) / (THERMAL_PARAMS.fuel_mass * THERMAL_PARAMS.fuel_cp);
  state.T_fuel += dT_fuel * dt;

  const flow_kg_s = state.flow_rate * 1000 / 3600;
  const Q_coolant_out = flow_kg_s * THERMAL_PARAMS.coolant_cp * (state.T_coolant_out - state.T_coolant_in);
  const dT_coolant = (Q_fuel_to_coolant - Q_coolant_out) / (THERMAL_PARAMS.coolant_mass * THERMAL_PARAMS.coolant_cp);
  state.T_coolant_out += dT_coolant * dt;

  state.T_coolant_in = THERMAL_PARAMS.coolant_inlet_temp;

  const Q_graphite_to_coolant = THERMAL_PARAMS.graphite_to_coolant_hA * (state.T_moderator - T_coolant_avg);
  const dT_graphite = (P_gamma - Q_graphite_to_coolant) / (THERMAL_PARAMS.graphite_mass * THERMAL_PARAMS.graphite_cp);
  state.T_moderator += dT_graphite * dt;

  if (state.flow_rate < 1000) {
    state.pressure = Math.max(0.1, state.pressure - 0.01 * dt);
  } else {
    state.pressure = THERMAL_PARAMS.nominal_pressure;
  }
}
```

## 冷却系统（ГЦН 泵）

### 配置

RBMK-1000 有 2 个环路（北/南），每环路 4 台 ГЦН。额定工况：每环路 3 台运行 + 1 台备用，总流量 48000 m³/h。

事故工况（场景 3）：操作员额外启动了 2 台泵（每环路 4 台全开），总流量增加到 ~56000 m³/h。这降低了空泡份额 → 负反应性 → 操作员提棒补偿 → OBR 降低。

### 泵模型

```js
const PUMP_PARAMS = {
  count: 8,
  nominal_flow_per_pump: 8000,   // m³/h
  nominal_current: 350,          // A
  coastdown_time: 35,            // s
  startup_time: 15,              // s
};

function integratePumps(state, dt) {
  let total_flow = 0;

  for (const pump of state.pumps) {
    if (pump.running) {
      if (pump.flow < PUMP_PARAMS.nominal_flow_per_pump) {
        pump.flow += (PUMP_PARAMS.nominal_flow_per_pump / PUMP_PARAMS.startup_time) * dt;
        pump.flow = Math.min(pump.flow, PUMP_PARAMS.nominal_flow_per_pump);
      }
      pump.current = PUMP_PARAMS.nominal_current * (pump.flow / PUMP_PARAMS.nominal_flow_per_pump);
    } else {
      if (pump.flow > 0) {
        pump.coastdown += dt / PUMP_PARAMS.coastdown_time;
        pump.flow = PUMP_PARAMS.nominal_flow_per_pump * Math.exp(-3 * pump.coastdown);
        if (pump.flow < 10) pump.flow = 0;
        pump.current = PUMP_PARAMS.nominal_current * (pump.flow / PUMP_PARAMS.nominal_flow_per_pump) * 0.3;
      }
    }
    total_flow += pump.flow;
  }

  state.flow_rate = total_flow;
}
```

## 功率计算

```js
function computePower(state) {
  state.P_thermal = state.n * 3200;
  const P_gross = state.P_thermal * 0.315;
  const P_aux = 20;
  state.P_electric = Math.max(0, P_gross - P_aux);
  state.P_percent = state.n * 100;
}
```

## 主循环（时间步进）

### 架构

```js
class ReactorSimulator {
  constructor() {
    this.state = createInitialState();
    this.prev_rod_positions = [...this.state.rod_positions];
    this.rodTargets = [...this.state.rod_positions];
    this.timeScale = 1;
    this.accidentMode = false;
  }

  update(realDt) {
    const simDt = this.accidentMode ? realDt : realDt * this.timeScale;

    this.moveRods(simDt);
    integratePumps(this.state, simDt);
    updateVoidFraction(this.state, simDt);
    const rho = computeTotalReactivity(this.state, this.prev_rod_positions);
    integratePRKE(this.state, rho, simDt);
    integrateXenon(this.state, simDt);
    integrateThermal(this.state, simDt);
    computePower(this.state);
    this.checkAccidentConditions();
    this.prev_rod_positions = [...this.state.rod_positions];
    this.state.simTime += simDt;
  }

  // ================ v2.0 主循环增量 ================
  // v1.0 函数顺序保持：computeReactivity → solvePRKE → updateXenon →
  //   computeVoidFraction → computeThermalHydraulics → moveRods → checkAccidentConditions
  // v2.0 增量（不修改 v1.0 逻辑）：
  //   computeThermalHydraulics 热源项加衰变热（§7.3）
  //   moveRodsV2() 替代 moveRods()（§4.2，仅包装，AZ-5 例外）
  //   新增：updateSeparator / updateFeedwater / updateCladIntegrity /
  //         updateDecayHeat / updatePeriod / updateQuadrants（条件启用）/
  //         updateRadiation / updateRodDrives
  //   checkAccidentConditions 追加 v2 事故条件（§11.3）：包壳破裂、分离器干烧、无棒临界

  updateV2(realDt) {
    const simDt = this.accidentMode ? realDt : realDt * this.timeScale;

    this.moveRodsV2(simDt);              // v2 替代 moveRods
    integratePumps(this.state, simDt);
    updateVoidFraction(this.state, simDt);
    updateSeparator(this.state, simDt);  // v2 新增
    updateFeedwater(this.state, simDt);  // v2 新增
    updateCladIntegrity(this.state, simDt); // v2 新增
    const rho = computeTotalReactivity(this.state, this.prev_rod_positions);
    integratePRKE(this.state, rho, simDt);
    integrateXenon(this.state, simDt);
    integrateThermal(this.state, simDt); // 热源项改 Q_total = P_fission + decay_heat（§7.3）
    computePower(this.state);
    updateDecayHeat(this.state, simDt);  // v2 新增
    updatePeriod(this.state, simDt);     // v2 新增
    updateQuadrants(this.state, simDt);  // v2 新增（条件启用 §9.8）
    updateRadiation(this.state, simDt);  // v2 新增
    updateRodDrives(this.state, simDt);  // v2 新增
    this.checkAccidentConditionsV2();    // v1 + v2 事故条件
    this.prev_rod_positions = [...this.state.rod_positions];
    this.state.simTime += simDt;
  }

  checkAccidentConditions() {
    if (this.state.P_thermal > 3840) {
      this.triggerAccident('power_excursion');
    }
    if (this.state.period > 0 && this.state.period < 1) {
      this.triggerAccident('short_period');
    }
    if (this.state.T_fuel > 1200) {
      this.triggerAccident('fuel_melt');
    }
  }

  triggerAccident(type) {
    if (this.accidentMode) return;
    this.accidentMode = true;
    this.timeScale = 1;
    this.onAccident?.(type);
  }

  setRodTarget(index, targetPos) {
    this.rodTargets[index] = Math.max(0, Math.min(1, targetPos));
  }

  moveRods(dt) {
    const speed = ROD_PARAMS.speed / ROD_PARAMS.core_height;
    for (let i = 0; i < this.state.rod_positions.length; i++) {
      const target = this.rodTargets[i];
      const current = this.state.rod_positions[i];
      if (Math.abs(target - current) < speed * dt) {
        this.state.rod_positions[i] = target;
      } else {
        this.state.rod_positions[i] += Math.sign(target - current) * speed * dt;
      }
    }
  }

  scramAZ5() {
    for (let i = 0; i < this.state.rod_positions.length; i++) {
      this.rodTargets[i] = 1.0;
    }
  }

  startPump(id) {
    this.state.pumps[id].running = true;
    this.state.pumps[id].coastdown = 0;
  }

  stopPump(id) {
    this.state.pumps[id].running = false;
    this.state.pumps[id].coastdown = 0;
  }
}
```

### 时间倍率与子步

外部帧率：60 fps → 每帧 realDt ≈ 16.7 ms。模拟频率：100 Hz → 每 10 ms 调用一次 update()。

| 倍率 | 每帧 update 次数 | 每帧 PRKE 子步 |
|------|-----------------|----------------|
| ×1   | 1               | 1,000          |
| ×5   | 5               | 5,000          |
| ×10  | 10              | 10,000         |
| ×30  | 30              | 30,000         |

事故模式强制 ×1，保证事故序列时间精度。

## 初始条件（各场景）

### 场景 1（降功率）

```js
function scenario1InitialState() {
  return {
    n: 1.0, T_fuel: 350, T_coolant_in: 270, T_coolant_out: 284,
    T_moderator: 270, void_fraction: 0.14, void_actual: 0.14, pressure: 6.5,
    I: 1.0, Xe: 1.0,
    rod_positions: equilibriumRodPositions(1.0),
    pumps: /* 北环路 3 运行 1 备用，南环路 3 运行 1 备用 */,
    flow_rate: 48000,
    P_thermal: 3200, P_electric: 988, P_percent: 100,
    simTime: 0,
  };
}
```

### 场景 3（事故前状态）

```js
function scenario3InitialState() {
  // 1986-04-26 01:03:00 的状态
  return {
    n: 0.0625,           // 6.25% (200 MW)
    I: 1.2,              // 碘高于平衡
    Xe: 1.5,             // 氙正在积累
    T_fuel: 290, T_coolant_out: 272, T_moderator: 268,
    void_fraction: 0.02, void_actual: 0.02,
    rod_positions: lowOBRPositions(),  // ~190 根提出，~21 根插入
    pumps: /* 所有 8 台运行 */,
    flow_rate: 56000,
    P_thermal: 200, P_electric: 43, P_percent: 6.25,
    simTime: 0,
  };
}
```

## 保护系统（自动动作）

```js
const PROTECTION_SYSTEM = {
  scram_conditions: [
    { param: 'period', threshold: 5, unit: 's', direction: 'below' },
    { param: 'P_thermal', threshold: 3840, unit: 'MW', direction: 'above' },
    { param: 'P_percent', threshold: 120, unit: '%', direction: 'above' },
  ],
  low_power_threshold: 0.05,  // 归一化
};

function checkProtection(state, protection_enabled) {
  if (state.n < PROTECTION_SYSTEM.low_power_threshold) {
    return null;  // 低功率下部分保护不工作
  }

  for (const cond of PROTECTION_SYSTEM.scram_conditions) {
    if (!protection_enabled[cond.param]) continue;

    const value = state[cond.param];
    if (cond.direction === 'above' && value > cond.threshold) {
      return { type: 'auto_scram', reason: cond.param };
    }
    if (cond.direction === 'below' && value < cond.threshold) {
      return { type: 'auto_scram', reason: cond.param };
    }
  }
  return null;
}
```

## OBR（操作反应性裕度）

OBR = 等效全插入棒数（Operational Reactivity Margin）。定义：如果将所有提出状态的棒插入，能引入多少负反应性，用"等效全插入棒数"表示。

RBMK 安全规程要求：OBR ≥ 26 根（等效）。1986 年 4 月 26 日凌晨：OBR ≈ 6-8 根（严重违规）。

```js
function computeOBR(rod_positions) {
  let remaining_worth = 0;
  for (const pos of rod_positions) {
    remaining_worth += rodWorthIntegral(1.0) - rodWorthIntegral(pos);
  }
  return remaining_worth / rodWorthIntegral(1.0);
}
// OBR < 26 → 黄色报警；OBR < 15 → 红色报警；OBR < 10 → 极度危险
```

## 验证场景

### 稳态验证

测试：初始条件设为额定功率平衡态，不做任何操作。
预期：功率保持 3200 MW ± 0.1%（10 分钟内），氙浓度保持平衡 ± 0.1%，温度稳定，周期 = ∞。

### 氙瞬态验证

测试：从 100% 功率瞬间降到 50%（通过插棒）。
预期：功率先降后升，氙浓度先升后降，氙峰值出现在 ~10h 后。

### 事故序列验证

测试：复现 1986-04-26 01:23:04 – 01:23:47 的事故序列。

**预期时间线：**

| 时间 | 事件 | 功率 |
|------|------|------|
| t=0s | 实验开始（关闭涡轮进气阀） | 200 MW |
| t=5s | 流量下降 → 空泡增加，操作员提棒补偿 | 200 MW |
| t=30s | 不可控上升开始 | 500 MW |
| t=36s | 操作员按 AZ-5 (01:23:40) | 800 MW |
| t=38s | 末端效应 → 正反应性脉冲 (~+1β) | 2,000 MW |
| t=39s | 超瞬发临界 | 10,000 MW |
| t=43s | 峰值功率 | ~33,000 MW |
| t=44s | 燃料碎裂 | — |
| t=47s | 第一次蒸汽爆炸 (01:23:47) | — |

与 INSAG-7 报告时间线一致（±2s）。

### 正确操作验证

测试：同样的初始条件，但玩家正确操作（不启动额外泵、不切除保护、在功率降到 700 MW 时稳定、不继续降、等待氙平衡、OBR 始终 > 26）。
预期：无事故。

## 性能预算

每帧计算量（×30 时间倍率）：

| 模块 | 运算次数 |
|------|----------|
| PRKE | 180,000 |
| 氙 | 120 |
| 热工 | 90 |
| 泵 | 240 |
| 反应性 | 6,330 |
| 空泡 | 30 |
| **总计** | **~187,000 flops** |

现代 CPU ~10⁹ flops → 0.19 ms/帧。完全不是瓶颈。

---

# ==================== v2.0 增量章节（只增不改）====================

> 以下章节为 v2.0 新增。v1.0 的所有方程、参数、验证用例保持有效。新增内容不覆盖、不修改、不替代 v1.0 的任何定义。新模型通过读写 `ReactorState` 已有字段（`P_thermal`、`pump_flow`、`pressure`、`void_fraction` 等）与 v1.0 模型耦合；所有新增状态量有默认值（见"状态变量"章节 `DEFAULT_V2`），在默认值时 v1.0 逻辑行为不变。

## 2 汽水分离器模型

### 2.1 物理背景

RBMK-1000 有 4 台卧式汽水分离器（ДС），每台对应 2 个主循环泵回路。蒸汽从堆芯上升管进入分离器，水从底部经下降管回堆芯。

### 2.2 水位动力学

```
d(separator_level)/dt = (feedwater_flow - steam_flow) / (ρ_w × A_sep)
```

- `A_sep = 12.0 m²` — 分离器水侧截面积（简化常数）
- `ρ_w = 740 kg/m³` — 饱和水密度（6.9 MPa）

单位换算：
- `feedwater_flow`: m³/h → kg/s: × ρ_w / 3600
- `steam_flow`: t/h → kg/s: × 1000 / 3600

### 2.3 蒸汽流量与功率耦合

```
steam_flow = P_thermal / h_fg × 3.6      // t/h
h_fg = 1500 kJ/kg    // 汽化潜热（6.9 MPa）
P_thermal: MW → kJ/s: × 1000
```

即：`steam_flow = P_thermal × 1000 / 1500 × 3.6 = P_thermal × 2.4 t/h`

验证：P = 3200 MW → steam_flow = 7680 t/h（4 台分离器总计，每台 ~1920 t/h，合理）。

### 2.4 分离器压力

```
d(separator_pressure)/dt = (steam_flow - turbine_steam_flow) / V_sep × K_p
```

- `V_sep = 30 m³` — 分离器蒸汽侧容积
- `K_p = 0.002 MPa/(t/h)` — 压力增益系数（标定值）
- `turbine_steam_flow = steam_flow × valve_opening` — 汽轮机进汽量
- `valve_opening: 0.0-1.0` — 汽轮机调节阀开度（玩家可控或自动）

### 2.5 水位对泵的约束

```js
if (separator_level < 0.5) {
  pump_flow_max = pump_flow_nominal * (separator_level / 0.5);
  // 水位低 → 泵吸入口露出 → 气蚀 → 流量上限降低
}
if (separator_level < 0.3) {
  pump_cavitation = true;
  // 泵气蚀：流量剧烈波动，±30% 随机
}
```

### 2.6 与 v1.0 的耦合

| v1.0 字段 | 耦合方式 |
|-----------|----------|
| `P_thermal` | 决定 steam_flow（§2.3） |
| `pump_flow`（热工水力章节） | 受 separator_level 约束（§2.5） |
| `void_fraction`（空泡效应章节） | 受 separator_pressure 影响：压力低 → 饱和温度低 → 同温度下空泡多 |

```js
void_correction = (P_nominal_pressure - separator_pressure) × 0.02;
void_fraction_effective = void_fraction + void_correction;
// 压力每降 1 MPa，空泡份额增加 ~2%
```

## 3 给水温度动态

### 3.1 模型

```
d(feedwater_temp)/dt = (T_target - feedwater_temp) / τ_feed
τ_feed = 120 s    // 给水系统热惯性时间常数
```

### 3.2 目标温度

| 工况 | T_target | 触发条件 |
|------|----------|----------|
| 正常 | 270°C | 默认 |
| 除氧器失压 | 100°C | 除氧器压力 < 0.1 MPa |
| САОР 投入 | 40°C | САОР 阀门开启 |
| 给水加热器切除 | 160°C | 加热器旁路 |

### 3.3 热冲击模型

当给水温度骤变时，燃料包壳承受热应力：

```js
thermal_shock_index = Math.abs(feedwater_temp - clad_temp_max) * (pump_flow / pump_flow_nominal);

if (thermal_shock_index > 150) {
  d(clad_integrity)/dt -= (thermal_shock_index - 150) * 0.0001;  // 包壳逐渐损伤
}
if (thermal_shock_index > 300) {
  d(clad_integrity)/dt -= (thermal_shock_index - 300) * 0.001;   // 严重热冲击，快速损伤
}
```

### 3.4 包壳完整性后果

```js
if (clad_integrity < 0.8) {
  coolant_activity += (1.0 - clad_integrity) * 1e8;  // Bq/m³，裂变产物泄漏到冷却剂
}
if (clad_integrity < 0.5) {
  containment_dose_rate += (0.5 - clad_integrity) * 20;  // mR/h，主控室剂量率上升
}
if (clad_integrity < 0.1) {
  triggerAccident("FUEL_DAMAGE");  // 包壳大面积破裂 → 燃料损坏事故
}
```

## 4 控制棒驱动机构限制

### 4.1 约束

```js
MAX_SIMULTANEOUS_RODS = 40;   // 同时运动上限
ROD_DRIVE_HEAT_RATE = 0.5;    // °C/s per active rod
ROD_DRIVE_COOL_RATE = 1/300;  // 冷却时间常数，s⁻¹
ROD_DRIVE_OVERHEAT_TEMP = 80; // 过热阈值，°C
ROD_DRIVE_RECOVER_TEMP = 50;  // 恢复阈值，°C
```

### 4.2 修改 moveRods()（v1.0 函数的包装）

```js
function moveRodsV2(commands, dt) {
  // 1. 处理排队
  const allCommands = [...rod_command_queue, ...commands];
  rod_command_queue = [];

  // 2. 过热检查
  if (rod_drive_overheat) {
    rod_command_queue = allCommands; // 全部排队
    log("驱动机构过热闭锁");
    return;
  }

  // 3. 容量检查
  const executing = allCommands.slice(0, MAX_SIMULTANEOUS_RODS - active_rod_drives);
  const queued = allCommands.slice(MAX_SIMULTANEOUS_RODS - active_rod_drives);
  rod_command_queue = queued;
  if (queued.length > 0) log(`驱动机构满负荷，${queued.length} 根棒排队`);

  // 4. 调用 v1.0 的 moveRods
  moveRods(executing, dt);
  active_rod_drives = executing.length;
}
```

### 4.3 驱动机构温度

```js
d(rod_drive_temp)/dt = active_rod_drives × ROD_DRIVE_HEAT_RATE
                       - (rod_drive_temp - 20) × ROD_DRIVE_COOL_RATE;

if (rod_drive_temp > ROD_DRIVE_OVERHEAT_TEMP) {
  rod_drive_overheat = true;
  active_rod_drives = 0;  // 所有运动中的棒停止，棒停在当前位置
}
if (rod_drive_overheat && rod_drive_temp < ROD_DRIVE_RECOVER_TEMP) {
  rod_drive_overheat = false; // 恢复，排队指令继续执行
}
```

### 4.4 例外

`scramAZ5()` 不受此限制。АЗ-5 是重力落棒 + 电磁释放，不依赖驱动电机，所有 211 根棒同时释放。

## 5 中子探测器量程模型

### 5.1 量程定义

```js
const DETECTOR_RANGES = [
  { id: 0, name: "源量程",    min: 1e-6, max: 1e-3 },
  { id: 1, name: "中间量程",  min: 1e-3, max: 0.01 },
  { id: 2, name: "功率量程1", min: 0.001, max: 0.10 },
  { id: 3, name: "功率量程2", min: 0.01, max: 1.20 },
  { id: 4, name: "功率量程3", min: 0.10, max: 1.20 },
];
```

### 5.2 读数逻辑

```js
function readPower(currentRange, truePowerFraction) {
  const range = DETECTOR_RANGES[currentRange];
  if (truePowerFraction < range.min) return 0;      // 低于量程下限，读数为零
  if (truePowerFraction > range.max) return range.max;  // 打表
  return truePowerFraction;
}
```

### 5.3 量程切换瞬态

```js
function switchRange(newRange) {
  currentRange = newRange;
  displayedPower = 0;   // 指针归零
  switchTimer = 0.8;    // 0.8 秒后恢复正常读数；切换期间功率表读数为 0
}
```

### 5.4 游戏性影响

| 场景 | 影响 |
|------|------|
| 第一幕降功率到 30 MW（~1%） | 功率量程 3（10%-120%）指针在底部，读数精度极差，需切到量程 2 |
| 功率飙升到 >120% | 所有功率量程打表，玩家看不到具体值 |
| 切换量程的 0.8 秒 | 功率表读数为零；若此时功率飙升，玩家会误判 |

## 6 仪表动态响应模型

### 6.1 一阶滞后 + 噪声

```js
interface InstrumentDynamics {
  tau: number;              // 时间常数，s
  noiseAmplitude: number;   // 噪声幅度，%FS
  noiseFreq: number;        // 噪声主频率，Hz
  noisePhase: number;       // 随机初始相位
}

function updateInstrument(inst, trueValue, displayed, dt, simTime) {
  // 一阶滞后
  displayed += (trueValue - displayed) * dt / inst.tau;
  // 周期性噪声
  const periodic = inst.noiseAmplitude * Math.sin(2 * Math.PI * inst.noiseFreq * simTime + inst.noisePhase);
  // 随机噪声
  const random = inst.noiseAmplitude * 0.3 * gaussRandom();
  return displayed + periodic + random;
}
```

### 6.2 各仪表参数

| 仪表 | τ (s) | 噪声 (%FS) | 频率 (Hz) | 备注 |
|------|-------|-----------|-----------|------|
| 热功率表 | 0.5 | 0.3 | 0.8 | 快响应 |
| 周期表 | 1.0 | 0.5 | 0.5 | |
| 出口水温 | 3.0 | 0.2 | 0.3 | 热惯性大 |
| 分离器压力 | 2.0 | 0.3 | 0.4 | |
| 分离器水位 | 1.5 | 0.4 | 0.6 | 波动明显 |
| 给水流量 | 1.0 | 0.5 | 1.0 | 泵脉动 |
| ORM 指示 | 0.2 | 0.1 | 0.2 | 几乎实时 |
| 棒位指示 | 0.3 | 0.0 | 0.0 | 编码器，无噪声 |
| 辐射剂量仪 | 5.0 | 2.0 | 0.1 | 统计涨落大 |

### 6.3 仪表故障模式

```js
type FaultMode = 'STUCK' | 'DRIFT' | 'PEGGED' | 'JITTER' | 'REVERSE' | 'DEAD';

function applyFault(fault, trueValue, displayed, simTime) {
  switch (fault.mode) {
    case 'STUCK':   return displayed;                                    // 冻结在故障时刻的值
    case 'DRIFT':   const elapsed = (simTime - fault.startTime) / 60;    // min
                    return trueValue + elapsed * fault.driftRate;
    case 'PEGGED':  return RANGE_MAX;                                    // 满刻度
    case 'JITTER':  return trueValue + fault.jitterAmplitude * (Math.random() * 2 - 1);
    case 'REVERSE': return RANGE_MAX - trueValue;
    case 'DEAD':    return 0;
  }
}
```

### 6.4 故障触发条件

| 故障 | 触发条件 | 受影响仪表 | 持续时间 |
|------|----------|-----------|----------|
| STUCK | 超压 > 8 MPa 持续 10s | 压力变送器 | 永久（直到修复） |
| DRIFT | 温度 > 350°C | 温度仪表 | 30-120s |
| PEGGED | 真实值 > 量程上限 | 任何 | 直到真实值回量程 |
| JITTER | 功率变化 > 50%/min | 功率表、周期表 | 5-30s |
| REVERSE | 难度 4 专属，随机 | 随机一个 | 60s |
| DEAD | 厂用电丧失 | 所有电子仪表 | 直到恢复供电 |

### 6.5 冗余

| 参数 | 仪表数 | 位置 |
|------|--------|------|
| 热功率 | 3（主 + 备用 + 自记笔） | 区域 1 + 区域 3 |
| 分离器压力 | 2 | 区域 1 |
| 给水流量 | 4（每泵 1 个） | 区域 2 |
| ORM | 1（无冗余） | 区域 1 |

## 7 衰变热模型

### 7.1 Way-Wigner 近似

```
P_decay(t) = P_pre_scram × [0.066 × t^(-0.2) + 0.007 × t^(-0.8)]
t = simTime - scram_time      // 停堆后经过时间，s
P_pre_scram = pre_scram_power // 停堆前稳态功率，MW
上限：P_decay ≤ 0.07 × P_pre_scram（停堆瞬间最大 7%）
```

### 7.2 实现

```js
function updateDecayHeat(state, dt) {
  if (state.scram_time === null) { state.decay_heat_power = 0; return; }
  const t = state.simTime - state.scram_time;
  if (t <= 0) { state.decay_heat_power = state.pre_scram_power * 0.07; return; }
  const fraction = 0.066 * Math.pow(t, -0.2) + 0.007 * Math.pow(t, -0.8);
  state.decay_heat_power = state.pre_scram_power * Math.min(fraction, 0.07);
}
```

### 7.3 与 v1.0 热工水力的耦合

在 v1.0 的 `computeThermalHydraulics()` 中，热源项修改为：

```js
Q_total = P_fission + decay_heat_power;   // P_fission 来自 PRKE（v1.0 不变），decay_heat_power 是新增项
```

即：停堆后 P_fission → 0，但 Q_total ≠ 0。冷却系统仍需带走衰变热。

### 7.4 典型数值

| 停堆后 | 占比 | 3200 MW 对应 |
|--------|------|--------------|
| 1 s | 7.0% | 224 MW |
| 10 s | 5.5% | 176 MW |
| 1 min | 4.2% | 134 MW |
| 5 min | 3.0% | 96 MW |
| 30 min | 1.8% | 58 MW |
| 1 h | 1.4% | 45 MW |
| 24 h | 0.4% | 13 MW |

### 7.5 停堆触发

```js
function triggerScram(state) {
  state.scram_time = state.simTime;
  state.pre_scram_power = state.P_thermal;
  scramAZ5(state);  // v1.0 的 scramAZ5() 照常执行（棒全插）
}
```

## 8 反应堆周期

### 8.1 定义

```
T = P_thermal / (dP_thermal/dt)
T > 0：功率在升；T < 0：功率在降；T = ∞：功率不变；|T| 越小：变化越快
```

### 8.2 计算

```js
function updatePeriod(state, dt) {
  const dP = state.P_thermal - state.prev_P_thermal;
  state.dP_dt = dP / dt;
  if (Math.abs(state.dP_dt) < 1e-6) {
    state.reactor_period = Infinity;
  } else {
    state.reactor_period = state.P_thermal / state.dP_dt;
  }
  state.prev_P_thermal = state.P_thermal;
}
```

### 8.3 保护逻辑

| 周期 | 状态 | 动作 |
|------|------|------|
| T > 80s | 正常 | 无 |
| 20s < T ≤ 80s | 警告 | 报警灯亮（П2），铃响 |
| 5s < T ≤ 20s | 危险 | 自动保护应触发（如果未旁路） |
| T ≤ 5s | 紧急 | 强制 AZ-5（除非所有保护被旁路） |
| T < 0 且 |T| < 10s | 快速降功率 | 报警 |

### 8.4 与 v1.0 保护系统的关系

v1.0 的 `checkAccidentConditions()` 中已有周期保护（П2）。本章节不修改该逻辑，只增加：周期作为仪表读数（周期表显示）、周期作为报警触发源（报警灯状态机）、周期作为玩家决策参考（"我还有多少时间"）。

> 注：v1.0 已有字段 `period`（PRKE 计算）。v2.0 新增的 `reactor_period` 为同一物理量的独立读数/报警来源，二者同源但用途不同（v1 `period` 用于 PRKE 稳态判断，v2 `reactor_period` 用于仪表显示与报警状态机）。

## 9 空间效应——四象限模型

### 9.1 物理背景

RBMK 堆芯直径 12m，高 7m。氙中毒不是均匀的：局部功率高的区域氙消耗快，局部功率低的区域氙积累。这导致"空间氙振荡"——左半堆中毒了，右半堆还在跑。

### 9.2 象限划分

```
    ┌───────┬───────┐
    │  Q1   │  Q2   │
    │(左前) │(右前) │
    ├───────┼───────┤
    │  Q3   │  Q4   │
    │(左后) │(右后) │
    └───────┴───────┘
```

每个象限包含 ~53 根燃料通道和 ~53 根控制棒通道。

### 9.3 象限动力学

```js
interface QuadrantState {
  power: number;          // 象限功率，MW（四象限之和 = P_thermal）
  xenon: number;          // 象限氙浓度（相对平衡值）
  rod_insertion: number;  // 象限平均棒插入深度，0-1
  void_fraction: number;  // 象限空泡份额
}

// 加权分配：w[i] = exp(local_reactivity[i] / β_eff) / Σⱼ exp(local_reactivity[j] / β_eff)
local_reactivity[i] = -xenon[i] × xenon_worth
                      + rod_insertion[i] × rod_worth_per_quadrant
                      + void_fraction[i] × void_worth_per_quadrant;
P_quadrant[i] = P_thermal × w[i];
```

### 9.4 象限氙动力学

每个象限独立跑 v1.0 的氙方程（用象限功率代替总功率）：

```
d(Xe[i])/dt = γ_Xe × Σ_f × P_quadrant[i] / P_nominal
              + λ_I × I[i] - λ_Xe × Xe[i] - σ_a_Xe × φ[i] × Xe[i]
```

### 9.5 象限仪表

玩家只能看到 4 个象限的局部功率读数（区域 1 的 4 个小表），各 ±5% 精度。不显示象限氙浓度、象限空泡份额、象限棒效。

### 9.6 空间振荡场景

- 初始：四象限功率均匀，各 800 MW
- 玩家拔 Q1 的棒 → Q1 功率升 → Q1 氙消耗加快 → Q1 反应性进一步升
- 同时：Q3 功率相对降 → Q3 氙积累 → Q3 反应性降
- 结果：Q1 = 1000 MW, Q3 = 600 MW（不对称）
- 如果玩家继续拔 Q1 → 可能触发局部功率超限

### 9.7 与 v1.0 的耦合

| v1.0 模型 | 耦合方式 |
|-----------|----------|
| PRKE（§2） | 总功率仍由 PRKE 计算。象限模型只分配功率，不改变总功率 |
| 氙动力学（§3） | 总氙仍由 v1.0 计算。象限氙是附加的局部分布 |
| 空泡效应（§4） | 总空泡仍由 v1.0 计算。象限空泡是附加的局部分布 |
| 棒价值（§5） | 每根棒的价值不变。但拔某象限的棒只影响该象限权重 |

### 9.8 启用条件

```js
if (simTime > 3600 && P_thermal < 0.5 * P_nominal) {
  enableQuadrantModel = true;  // 低功率运行 > 1 小时后，空间效应开始显著
}
```

## 10 辐射模型

### 10.1 冷却剂活度

```
d(coolant_activity)/dt = source - decay - removal
source  = (1.0 - clad_integrity) × 1e8 × (P_thermal / P_nominal)  // Bq/(m³·s)
decay   = coolant_activity × λ_N16                                  // N-16 衰变，λ = 0.097 s⁻¹
removal = coolant_activity × (cleanup_flow / total_flow)            // 净化系统
```

### 10.2 主控室剂量率

```
containment_dose_rate = base_dose
                        + coolant_activity × leak_factor
                        + (1.0 - clad_integrity) × fuel_release_factor
base_dose = 0.1 mR/h        // 本底
leak_factor = 1e-9          // 冷却剂泄漏到主控室的系数
fuel_release_factor = 50    // 燃料破损时的释放系数
```

### 10.3 典型数值

| 工况 | coolant_activity | containment_dose_rate |
|------|-----------------|----------------------|
| 正常运行 | 1e3 Bq/m³ | 0.1 mR/h |
| 包壳微损（integrity=0.9） | 1e5 | 0.5 mR/h |
| 包壳严重损（integrity=0.5） | 1e7 | 5 mR/h |
| 堆芯熔毁（integrity=0） | 1e10 | >100 mR/h（打表） |
| 爆炸后 | 1e12 | >1000 mR/h |

### 10.4 与剂量仪的耦合

剂量仪（ДП-5В）的读数 = `containment_dose_rate` 经过 §6 的仪表动态响应处理。

## 11 主循环升级

### 11.1 主循环增量

v2.0 主循环见"主循环"章节的 `updateV2()`。增量函数调用顺序与 v1.0 的关系见主循环章节注释。

### 11.2 新增事故条件

在 v1.0 的 `checkAccidentConditions()` 中追加（即 `checkAccidentConditionsV2()`）：

```js
// 包壳大面积破裂
if (state.clad_integrity < 0.1) {
  triggerAccident("FUEL_DAMAGE");
}
// 汽水分离器干烧
if (state.separator_level < 0.2 && state.P_thermal > 0.1 * P_nominal) {
  triggerAccident("SEPARATOR_DRYOUT");
}
// 驱动机构过热时功率仍在升
if (state.rod_drive_overheat && state.reactor_period < 20) {
  triggerAlarm("CRITICAL_NO_RODS");  // 不能插棒 + 功率在升 = 极度危险
}
```

## 12 参数汇总表（v2.0 新增参数）

| 参数 | 符号 | 值 | 单位 | 来源 |
|------|------|----|------|------|
| 分离器截面积 | A_sep | 12.0 | m² | 设计文件 |
| 分离器蒸汽容积 | V_sep | 30 | m³ | 设计文件 |
| 汽化潜热 | h_fg | 1500 | kJ/kg | 热力学表（6.9 MPa） |
| 给水时间常数 | τ_feed | 120 | s | 标定 |
| 热冲击阈值 | — | 150 | — | 标定 |
| 严重热冲击阈值 | — | 300 | — | 标定 |
| 同时运动棒上限 | — | 40 | 根 | 设计文件 |
| 驱动过热阈值 | — | 80 | °C | 设计文件 |
| 驱动恢复阈值 | — | 50 | °C | 设计文件 |
| 驱动加热率 | — | 0.5 | °C/(s·rod) | 标定 |
| 驱动冷却时间常数 | — | 300 | s | 标定 |
| 衰变热系数 1 | — | 0.066 | — | Way-Wigner |
| 衰变热系数 2 | — | 0.007 | — | Way-Wigner |
| 衰变热指数 1 | — | -0.2 | — | Way-Wigner |
| 衰变热指数 2 | — | -0.8 | — | Way-Wigner |
| N-16 衰变常数 | λ_N16 | 0.097 | s⁻¹ | 核数据 |
| 本底剂量率 | — | 0.1 | mR/h | 测量 |
| 象限启用条件 | — | t>3600s 且 P<50% | — | 标定 |

## 13 验证用例（v2.0 新增）

### 13.1 汽水分离器

| 场景 | 输入 | 预期 |
|------|------|------|
| 稳态 | P=3200MW, feedwater=steam | 水位不变 |
| 给水突降 50% | feedwater_flow × 0.5 | 水位以 ~0.02 m/s 下降 |
| 功率突降 | P: 3200→1600 | steam_flow 减半，水位上升 |
| 水位 < 0.5 | — | 泵流量上限降低 |
| 水位 < 0.3 | — | 泵气蚀，流量波动 ±30% |

### 13.2 衰变热

| 场景 | 输入 | 预期 |
|------|------|------|
| 满功率停堆 | P=3200, scram | 停堆后 1s: P_decay=224MW |
| 停堆后 5min | — | P_decay=96MW |
| 停堆后泵全停 | pump_flow=0 | 温度持续上升（衰变热无法带走） |

### 13.3 控制棒限制

| 场景 | 输入 | 预期 |
|------|------|------|
| 同时命令 50 根棒 | 50 commands | 40 根执行，10 根排队 |
| 连续操作 5 分钟 | 持续动棒 | 驱动温度升到 80°C，闭锁 |
| AZ-5 | scram | 不受限制，211 根同时落 |

### 13.4 量程

| 场景 | 输入 | 预期 |
|------|------|------|
| P=1%，量程 3（10-120%） | — | 读数 = 0（低于下限） |
| P=50%，量程 3 | — | 读数 = 50%（正常） |
| P=130%，量程 3 | — | 读数 = 120%（打表） |
| 切换量程 | — | 0.8s 内读数 = 0 |

### 13.5 空间效应

| 场景 | 输入 | 预期 |
|------|------|------|
| 均匀初始 | 四象限相同 | 功率均匀分配 |
| 拔 Q1 棒 | Q1 rod_insertion -0.1 | Q1 功率升，Q3 功率降 |
| 持续 30min | — | Q1 氙消耗，Q3 氙积累 |
| 总功率 | — | 不变（PRKE 控制总量） |

## 14 性能预算（v2.0 增量）

| 新增计算 | 每步开销 | 备注 |
|----------|----------|------|
| 汽水分离器 | ~10 FLOPs | 一阶 ODE |
| 给水温度 | ~5 FLOPs | 一阶 ODE |
| 热冲击 | ~10 FLOPs | 条件判断 |
| 驱动机构 | ~15 FLOPs | 计数 + 温度 |
| 量程 | ~5 FLOPs | 查表 |
| 仪表动态 | ~20 FLOPs × 10 仪表 | 一阶滤波 + 噪声 |
| 衰变热 | ~5 FLOPs | 幂函数 |
| 周期 | ~5 FLOPs | 除法 |
| 象限模型 | ~100 FLOPs × 4 象限 | 条件启用 |
| 辐射 | ~10 FLOPs | 一阶 ODE |

总计：~500 FLOPs/步。在 60fps 下（dt=16ms）完全可忽略（叠加到 v1.0 的 ~187k flops 上，仍非瓶颈）。

## 15 与现有文档的接口（v2.0）

| 现有文档 | 接口 |
|----------|------|
| UI.md | 新增仪表（周期表、象限功率表、水位表）加入 InstrumentData |
| UI_INTERACTION.md | 新增控件（量程旋钮、КВИТ 按钮）加入区域定义 |
| GDD.md §11 | 仪表清单扩展 |
| GDD.md §12 | 保护逻辑扩展（周期保护、水位保护） |
| GDD.md §16 | 难度等级 4 的仪表故障引用 §6.3 |
| MENU.md | 沙盒模式新增"象限模型"开关 |

---

## 与其他系统的接口

### → 音频系统

```js
interface AudioParams {
  power_level: number;
  void_fraction: number;
  pump_states: boolean[];
  rod_moving: boolean;
  alarm_active: boolean;
  period: number;
  accident: boolean;
}
```

### → 评分系统

```js
interface SimSnapshot {
  min_OBR: number;
  max_power: number;
  xenon_peak: number;
  rod_violations: number;
  pump_violations: number;
  protection_disabled: string[];
  accident: boolean;
  accident_type: string | null;
}
```

### → UI 系统

```js
interface InstrumentData {
  P_thermal: number;
  P_percent: number;
  period: number;
  void_fraction: number;
  void_actual: number;
  T_fuel: number;
  T_coolant_out: number;
  flow_rate: number;
  OBR: number;
  Xe_concentration: number;
  rod_positions: number[];
  pump_states: PumpState[];
  alarms: AlarmState[];
}
```

## 验收标准

| # | 测试 | 通过条件 |
|---|------|----------|
| 1 | 稳态保持 | 100% 功率，10min 内漂移 < 0.1% |
| 2 | 氙平衡 | 平衡浓度误差 < 1%（对比解析解） |
| 3 | 碘坑 | 降功率后氙峰值时间 = 10±1h |
| 4 | 空泡正反馈 | 减流量 → 功率上升（不是下降） |
| 5 | 空泡延迟 | 流量阶跃后，空泡 7s 时间常数趋近新平衡 |
| 6 | 温度负反馈 | 功率上升 → 温度上升 → 自稳定 |
| 7 | AZ-5 正常工况 | 高 OBR 时 AZ-5 → 功率平稳下降 |
| 8 | AZ-5 低 OBR | 低 OBR 时 AZ-5 → 功率先升后爆 |
| 9 | 末端效应 | 全提棒插入前 1m 有正反应性脉冲 |
| 10 | 事故时间线 | AZ-5 后 3-4s 功率不可控，7s 爆炸（±2s） |
| 11 | 事故峰值功率 | ~33,000 MW（~10× 额定），不是 100× |
| 12 | 泵惰转 | 停泵后流量指数衰减，35s 内降到 ~0 |
| 13 | 周期表 | 稳态=∞，正反应性=正值，负=负值 |
| 14 | OBR 计算 | 与手动计算一致 |
| 15 | 性能 | ×30 倍率下 < 1ms/帧 |
| 16 | 数值稳定 | 超瞬发临界时不 NaN、不 Infinity |
| 17 | 低功率保护失效 | < 5% 功率（160 MW）时自动保护不动作 |

## 不做的事

- 不做空间动力学（三维通量分布）。用 2 区氙模型代替。
- 不做燃料燃耗。场景时间 < 24h，燃耗可忽略。
- 不做裂变产物毒物（除 Xe/I 外）。Sm-149 等变化太慢。
- 不做蒸汽发生器动态。RBMK 是沸水堆，没有蒸汽发生器。
- 不做安全阀/泄压阀。简化为"压力恒定"或"泵停→压力降"。
- 不做 1660 个通道逐个计算。用集总参数。
- 不做中子探测器噪声。仪表读数 = 真实值 + 小随机噪声（UI 层加）。
- 不做控制棒卡涩。所有棒都能动。（真实中有可能卡，但太复杂。）
- 不做燃料碎裂后的物理。点堆方程在几何破坏后不适用。事故后果用脚本演出。

## 参考文献

[1] INSAG-7, "The Chernobyl Accident: Updating of INSAG-1", IAEA, 1992
[2] Lamarsh, J.R., "Introduction to Nuclear Reactor Theory", 2nd ed., 1983
[3] Keepin, G.R., "Physics of Nuclear Kinetics", 1965
[4] Karpan, N.V., "Chernobyl: Vengeance of the Peaceful Atom", 2006
[5] Adamov, E.O. et al., "RBMK Reactor Physics", Energoatomizdat, 1990
[6] 苏联国家原子能监督局, "RBMK-1000 技术规程", 1984
[7] Dyatlov, A.S., "Chernobyl: How It Happened", 2006

## 修正记录

| 版本 | 日期 | 修正内容 |
|------|------|----------|
| v1 | 2026-07-30 | 初版 |
| v2 | 2026-07-30 | Λ: 1ms→0.1ms; 峰值功率: 100×→10×; 吸收体: 4.5m→5.12m; 通道数: 1661→1660; 事故时间线修正; 空泡模型加一阶延迟; 功率倾斜范围调整; 温度系数微调; 泵惰转改为指数衰减; PRKE子步改为10μs |
| v2.0 | 2026-08-02 | 升级版：新增汽水分离器模型(§2)、给水温度动态(§3)、热冲击(§3.3)、控制棒驱动限制(§4)、中子探测器量程(§5)、仪表动态响应(§6)、衰变热(§7)、反应堆周期(§8)、空间四象限模型(§9)、辐射模型(§10)、主循环升级(§11)、新增参数汇总(§12)、新增验证用例(§13)、性能预算(§14)、与现有文档接口(§15)。升级原则：不修改 v1.0 方程与参数，只增不改；新增状态量带默认值保证向后兼容。
