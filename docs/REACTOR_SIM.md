# 反应堆物理模型 — Модель Реактора

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

- 空间动力学（不做三维中子通量分布）
- 燃料燃耗（场景时间太短，忽略）
- 裂变产物除氙/碘外（忽略）
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
}

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
