/**
 * physics/thermal.js
 * RBMK-1000 热工水力学模型
 * 7 层轴向节点 × (3 燃料节点 + 1 冷却剂节点) + 压力动力学 + 泵模型
   共 28 个温度 ODE + 1 个压力 ODE + 1 个流量 ODE = 30 个状态变量
 * 参考:
   - IAEA-TECDOC-1049 "Analysis of Severe Accidents in RBMK"
   - Todreas & Kazimi, "Nuclear Systems I" (1990)
   - Collier & Thome, "Convective Boiling and Condensation" (1994)
   - RELAP5/MOD3 Code Manual (NUREG/CR-5535)
 */

// ============================================================
// 几何与物性常量
// ============================================================

const GEO = {
  N_AXIAL: 7,
  CORE_HEIGHT: 7.0,
  LAYER_HEIGHT: 1.0,

  FUEL_RADIUS: 0.00575,
  CLAD_INNER_R: 0.00675,
  CLAD_OUTER_R: 0.00800,
  RODS_PER_CHANNEL: 18,
  CHANNELS: 1661,

  CHANNEL_HYDRAULIC_D: 0.012,
  CHANNEL_FLOW_AREA: 1.2e-4,

  SEPARATOR_VOLUME: 30.0,
  SEPARATOR_WATER_MASS: 20000,
};

const MAT = {
  FUEL_DENSITY: 10400,
  FUEL_CP: 320,
  FUEL_K: 3.5,

  GAP_H: 5000,

  CLAD_DENSITY: 6560,
  CLAD_CP: 330,
  CLAD_K: 18,

  WATER_CP: 5200,
  WATER_DENSITY: 750,
};

const OPERATING = {
  NOMINAL_POWER: 3200e6,
  NOMINAL_PRESSURE: 7.0e6,
  NOMINAL_FLOW: 8000,
  INLET_TEMP: 270,
  PUMP_INERTIA: 5000,
};

// ============================================================
// 饱和水物性 (压力相关)
// ============================================================

export function saturationTemp(P) {
  const p = P / 1e6;
  // 立方拟合 (1-16 MPa, 基于蒸汽表数据)
  return 151.48 + 30.32 * p - 1.948 * p * p + 0.05111 * p * p * p;
}

export function latentHeat(P) {
  const p = P / 1e6;
  return 2.257e6 * Math.pow(1 - p / 22.064, 0.38);
}

export function satLiquidDensity(P) {
  const p = P / 1e6;
  return 1000 - 35 * p;
}

export function satVaporDensity(P) {
  const p = P / 1e6;
  return 5.15 * Math.pow(p, 0.95);
}

export function satLiquidEnthalpy(P) {
  const T_sat = saturationTemp(P);
  return MAT.WATER_CP * T_sat;
}

// ============================================================
// 换热关联式
// ============================================================

function singlePhaseHTC(G, D_h, T_bulk) {
  const mu = 1.0e-4;
  const k = 0.58;
  const cp = MAT.WATER_CP;
  const Pr = cp * mu / k;
  const Re = G * D_h / mu;
  const Nu = 0.023 * Math.pow(Re, 0.8) * Math.pow(Pr, 0.4);
  return Nu * k / D_h;
}

function nucleateBoilingHTC(q, P) {
  const P_MPa = P / 1e6;
  const q_MW = q / 1e6;
  const dT = 22.5 * Math.sqrt(Math.max(q_MW, 0.001)) * Math.exp(-P_MPa / 8.7);
  return q / Math.max(dT, 1);
}

function filmBoilingHTC(T_wall, T_sat, P) {
  const dT = T_wall - T_sat;
  if (dT <= 0) return 1e6;
  return 500 + 2.0 * dT;
}

export function selectHTC(T_clad, T_coolant, q, G, P) {
  const T_sat = saturationTemp(P);
  const D_h = GEO.CHANNEL_HYDRAULIC_D;

  if (T_coolant < T_sat - 5) {
    return { h: singlePhaseHTC(G, D_h, T_coolant), regime: 'single_phase' };
  }

  if (T_clad < T_sat + 30) {
    return { h: nucleateBoilingHTC(q, P), regime: 'nucleate_boiling' };
  }

  if (T_clad < T_sat + 200) {
    const h_nb = nucleateBoilingHTC(q, P);
    const h_fb = filmBoilingHTC(T_clad, T_sat, P);
    const frac = (T_clad - T_sat - 30) / 170;
    return { h: h_nb * (1 - frac) + h_fb * frac, regime: 'transition' };
  }

  return { h: filmBoilingHTC(T_clad, T_sat, P), regime: 'film_boiling' };
}

// ============================================================
// 状态定义
// ============================================================

/**
 * @typedef {Object} ThermalState
 * @property {number[]} T_fuel_center  - 各层燃料中心温度 (°C) [N]
 * @property {number[]} T_fuel_surface - 各层燃料表面温度 (°C) [N]
 * @property {number[]} T_clad         - 各层包壳温度 (°C) [N]
 * @property {number[]} T_coolant      - 各层冷却剂温度 (°C) [N]
 * @property {number[]} voidFraction   - 各层空泡份额 [N]
 * @property {number} pressure         - 系统压力 (Pa)
 * @property {number} flowRate         - 总冷却剂流量 (kg/s)
 * @property {number} outletTemp       - 出口温度 (°C)
 * @property {number} avgFuelTemp      - 平均燃料温度 (°C)
 * @property {number} avgVoid          - 平均空泡份额
 * @property {number} maxFuelTemp      - 最高燃料温度 (°C)
 * @property {string} boilingRegime    - 主要沸腾状态
 * @property {boolean} fuelMelting     - 燃料是否熔化
 * @property {boolean} cladFailure     - 包壳是否失效
 */

export function createThermalState() {
  const N = GEO.N_AXIAL;
  const P = OPERATING.NOMINAL_PRESSURE;
  const T_sat = saturationTemp(P);

  const powerShape = axialPowerShape();

  const T_fuel_center = [];
  const T_fuel_surface = [];
  const T_clad = [];
  const T_coolant = [];
  const voidFraction = [];

  const totalFlow = OPERATING.NOMINAL_FLOW;
  const channelFlow = totalFlow / GEO.CHANNELS;
  const G = channelFlow / GEO.CHANNEL_FLOW_AREA;

  let T_c = OPERATING.INLET_TEMP;

  for (let i = 0; i < N; i++) {
    const q_frac = powerShape[i];
    const q_layer = OPERATING.NOMINAL_POWER * q_frac / N;
    const rodSurface = 2 * Math.PI * GEO.CLAD_OUTER_R * GEO.LAYER_HEIGHT
                     * GEO.RODS_PER_CHANNEL;
    const q = q_layer / GEO.CHANNELS / rodSurface;

    const dT_c = q_layer / GEO.CHANNELS / (channelFlow * MAT.WATER_CP);
    T_coolant.push(Math.min(T_c + dT_c / 2, T_sat));
    T_c += dT_c;

    const { h } = selectHTC(T_c + 20, Math.min(T_c, T_sat), q, G, P);
    const T_clad_i = T_coolant[i] + q / h;
    T_clad.push(T_clad_i);

    const T_surf = T_clad_i + q / MAT.GAP_H;
    T_fuel_surface.push(T_surf);

    const dT_fuel = q * GEO.FUEL_RADIUS / (2 * MAT.FUEL_K);
    T_fuel_center.push(T_surf + dT_fuel);

    if (T_coolant[i] >= T_sat - 0.5) {
      const h_fg = latentHeat(P);
      const h_excess = MAT.WATER_CP * (T_c - T_sat);
      const x = Math.min(Math.max(h_excess / h_fg, 0), 0.99);
      const rho_f = satLiquidDensity(P);
      const rho_g = satVaporDensity(P);
      const alpha = 1 / (1 + (1 - x) / Math.max(x, 0.001) * rho_g / rho_f);
      voidFraction.push(Math.min(alpha, 0.95));
    } else {
      voidFraction.push(0);
    }
  }

  return {
    T_fuel_center,
    T_fuel_surface,
    T_clad,
    T_coolant,
    voidFraction,
    pressure: P,
    flowRate: totalFlow,
    outletTemp: T_c,
    avgFuelTemp: T_fuel_center.reduce(function(a, b) { return a + b; }, 0) / N,
    avgVoid: voidFraction.reduce(function(a, b) { return a + b; }, 0) / N,
    maxFuelTemp: Math.max.apply(null, T_fuel_center),
    boilingRegime: 'nucleate_boiling',
    fuelMelting: false,
    cladFailure: false,
  };
}

// ============================================================
// 轴向功率分布
// ============================================================

export function axialPowerShape() {
  const N = GEO.N_AXIAL;
  const shape = [];
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const z = (i + 0.5) / N;
    const val = Math.cos(Math.PI * (z - 0.5));
    shape.push(val);
    sum += val;
  }
  return shape.map(function(v) { return v * N / sum; });
}

// ============================================================
// 时间推进 (核心)
// ============================================================

export function stepThermal(state, dt, inputs) {
  const { powerFrac, pumpSpeed } = inputs;
  const pressureSetpoint = inputs.pressureSetpoint || OPERATING.NOMINAL_PRESSURE;
  const N = GEO.N_AXIAL;

  const totalPower = OPERATING.NOMINAL_POWER * powerFrac;
  const powerShape = axialPowerShape();

  updateFlow(state, dt, pumpSpeed);

  const totalFlow = state.flowRate;
  const channelFlow = totalFlow / GEO.CHANNELS;
  const G = channelFlow / GEO.CHANNEL_FLOW_AREA;

  updatePressure(state, dt, powerFrac, pressureSetpoint);
  const P_new = state.pressure;
  const T_sat = saturationTemp(P_new);

  let T_c_in = OPERATING.INLET_TEMP;

  for (let i = 0; i < N; i++) {
    const q_layer = totalPower * powerShape[i] / N;
    const q_channel = q_layer / GEO.CHANNELS;

    const rodSurface = 2 * Math.PI * GEO.CLAD_OUTER_R * GEO.LAYER_HEIGHT
                     * GEO.RODS_PER_CHANNEL;
    const q_flux = q_channel / rodSurface;

    // --- a. 燃料中心 → 燃料表面 ---
    const R_fuel = GEO.FUEL_RADIUS / (2 * MAT.FUEL_K);

    const m_fuel = MAT.FUEL_DENSITY * Math.PI * GEO.FUEL_RADIUS * GEO.FUEL_RADIUS
                 * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    const C_fuel = m_fuel * MAT.FUEL_CP;

    const Q_fuel_to_surf = (state.T_fuel_center[i] - state.T_fuel_surface[i])
                         / R_fuel * rodSurface;

    const dT_center = dt / C_fuel * (q_channel - Q_fuel_to_surf);
    state.T_fuel_center[i] += dT_center;

    // --- b. 燃料表面 → 包壳 (气隙) ---
    const R_gap = 1 / MAT.GAP_H;
    const Q_gap = (state.T_fuel_surface[i] - state.T_clad[i])
                / R_gap * rodSurface;

    const r_surf_outer = GEO.FUEL_RADIUS;
    const r_surf_inner = GEO.FUEL_RADIUS * 0.8;
    const m_surf = MAT.FUEL_DENSITY * Math.PI
                 * (r_surf_outer * r_surf_outer - r_surf_inner * r_surf_inner)
                 * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    const C_surf = m_surf * MAT.FUEL_CP;

    const dT_surf = dt / C_surf * (Q_fuel_to_surf - Q_gap);
    state.T_fuel_surface[i] += dT_surf;

    // --- c. 包壳 → 冷却剂 ---
    const { h, regime } = selectHTC(
      state.T_clad[i], T_c_in, q_flux, G, P_new
    );

    const Q_clad_to_cool = h * rodSurface * (state.T_clad[i] - T_c_in);

    const m_clad = MAT.CLAD_DENSITY * Math.PI
                 * (GEO.CLAD_OUTER_R * GEO.CLAD_OUTER_R
                  - GEO.CLAD_INNER_R * GEO.CLAD_INNER_R)
                 * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    const C_clad = m_clad * MAT.CLAD_CP;

    const denom = 1 + dt * h * rodSurface / C_clad;
    state.T_clad[i] = (state.T_clad[i] + dt / C_clad * (Q_gap + h * rodSurface * T_c_in)) / denom;

    // --- d. 冷却剂 (焓平衡, 准稳态) ---
    const m_dot_ch = channelFlow;
    const h_in = MAT.WATER_CP * T_c_in;
    const h_fg = latentHeat(P_new);
    const h_f = MAT.WATER_CP * T_sat;

    const q_per_kg = Q_clad_to_cool / Math.max(m_dot_ch, 1e-6);
    const h_out = h_in + q_per_kg;

    if (h_out <= h_f) {
      state.T_coolant[i] = h_out / MAT.WATER_CP;
      state.voidFraction[i] = 0;
    } else {
      state.T_coolant[i] = T_sat;
      const x = Math.min(Math.max((h_out - h_f) / Math.max(h_fg, 1), 0), 0.99);
      const rho_f = satLiquidDensity(P_new);
      const rho_g = satVaporDensity(P_new);
      const alpha = 1 / (1 + (1 - x) / Math.max(x, 0.001) * rho_g / rho_f);
      state.voidFraction[i] = Math.max(0, Math.min(alpha, 0.95));
    }

    T_c_in = state.T_coolant[i];
  }

  state.outletTemp = T_c_in;
  state.avgFuelTemp = state.T_fuel_center.reduce(function(a, b) { return a + b; }, 0) / N;
  state.avgVoid = state.voidFraction.reduce(function(a, b) { return a + b; }, 0) / N;
  state.maxFuelTemp = Math.max.apply(null, state.T_fuel_center);

  state.fuelMelting = state.maxFuelTemp > 2800;
  state.cladFailure = Math.max.apply(null, state.T_clad) > 1200;

  const maxVoid = Math.max.apply(null, state.voidFraction);
  if (maxVoid < 0.01) state.boilingRegime = 'single_phase';
  else if (maxVoid < 0.5) state.boilingRegime = 'nucleate_boiling';
  else if (maxVoid < 0.9) state.boilingRegime = 'transition';
  else state.boilingRegime = 'film_boiling';

  return state;
}

// ============================================================
// 泵/流量模型
// ============================================================

function updateFlow(state, dt, pumpSpeed) {
  const nominalFlow = OPERATING.NOMINAL_FLOW;
  const targetFlow = nominalFlow * pumpSpeed;
  const tau_pump = 5.0;
  const alpha = 1 - Math.exp(-dt / tau_pump);
  state.flowRate += (targetFlow - state.flowRate) * alpha;

  if (pumpSpeed < 0.01) {
    const naturalFlow = nominalFlow * 0.05 * Math.sqrt(
      Math.max(state.avgVoid || 0.01, 0.01)
    );
    state.flowRate = Math.max(state.flowRate, naturalFlow);
  }

  state.flowRate = Math.max(state.flowRate, nominalFlow * 0.01);
}

// ============================================================
// 压力模型
// ============================================================

function updatePressure(state, dt, powerFrac, setpoint) {
  const P_set = setpoint || OPERATING.NOMINAL_PRESSURE;
  const totalPower = OPERATING.NOMINAL_POWER * powerFrac;
  const h_fg = latentHeat(state.pressure);
  const avgVoid = state.avgVoid || 0;

  const steamGen = totalPower * avgVoid / h_fg;

  const steamOut = steamGen + (state.pressure - P_set) / P_set * steamGen * 2;

  const V_steam = GEO.SEPARATOR_VOLUME;
  const T_steam = saturationTemp(state.pressure) + 273.15;
  const R_steam = 461.5;

  const dP = (steamGen - steamOut) * R_steam * T_steam / V_steam * dt;
  state.pressure += dP;

  state.pressure = Math.max(1e5, Math.min(state.pressure, 16e6));
}

// ============================================================
// 辅助/诊断
// ============================================================

export function getLayerDiagnostics(state) {
  const N = GEO.N_AXIAL;
  const layers = [];
  for (let i = 0; i < N; i++) {
    layers.push({
      index: i,
      z: (i + 0.5) * GEO.LAYER_HEIGHT,
      T_fuel_center: state.T_fuel_center[i],
      T_fuel_surface: state.T_fuel_surface[i],
      T_clad: state.T_clad[i],
      T_coolant: state.T_coolant[i],
      voidFraction: state.voidFraction[i],
      dT_fuel: state.T_fuel_center[i] - state.T_fuel_surface[i],
    });
  }
  return layers;
}

export function calcDNBR(state) {
  const P = state.pressure;
  const T_sat = saturationTemp(P);
  const G = state.flowRate / GEO.CHANNELS / GEO.CHANNEL_FLOW_AREA;

  let minDNBR = Infinity;
  const powerShape = axialPowerShape();

  for (let i = 0; i < GEO.N_AXIAL; i++) {
    if (state.T_coolant[i] < T_sat - 10) continue;

    const rho_f = satLiquidDensity(P);
    const rho_g = satVaporDensity(P);
    const voidFrac = state.voidFraction[i];
    const x = voidFrac * rho_g
            / (voidFrac * rho_g + (1 - voidFrac) * rho_f);

    const q_CHF = 2.0e6 * Math.pow(G / 1000, 0.5) * Math.pow(Math.max(1 - x, 0.01), 2);

    const rodSurface = 2 * Math.PI * GEO.CLAD_OUTER_R * GEO.LAYER_HEIGHT
                     * GEO.RODS_PER_CHANNEL;
    const q_actual = OPERATING.NOMINAL_POWER * powerShape[i] / GEO.N_AXIAL
                   / GEO.CHANNELS / rodSurface;

    const dnbr = q_CHF / Math.max(q_actual, 1);
    if (isFinite(dnbr)) {
      minDNBR = Math.min(minDNBR, dnbr);
    }
  }

  return minDNBR === Infinity ? 999 : minDNBR;
}

export function assessThermalSafety(state) {
  const messages = [];
  let level = 'normal';

  if (state.fuelMelting) {
    level = 'catastrophic';
    messages.push('燃料熔化! T_max = ' + state.maxFuelTemp.toFixed(0) + '°C');
  }

  if (state.cladFailure) {
    if (level !== 'catastrophic') level = 'critical';
    messages.push('包壳失效! T_clad_max = ' + Math.max.apply(null, state.T_clad).toFixed(0) + '°C');
  }

  const dnbr = calcDNBR(state);
  if (dnbr < 1.0) {
    if (level === 'normal') level = 'warning';
    messages.push('DNBR = ' + dnbr.toFixed(2) + ' < 1.0: 偏离核态沸腾');
  } else if (dnbr < 1.3) {
    if (level === 'normal') level = 'caution';
    messages.push('DNBR = ' + dnbr.toFixed(2) + ': 接近 DNB 限值');
  }

  if (state.avgVoid > 0.7) {
    if (level === 'normal') level = 'warning';
    messages.push('平均空泡 ' + state.avgVoid.toFixed(2) + ': 正反馈风险');
  }

  if (state.flowRate < OPERATING.NOMINAL_FLOW * 0.3) {
    if (level === 'normal') level = 'warning';
    messages.push('流量过低: ' + (state.flowRate / OPERATING.NOMINAL_FLOW * 100).toFixed(0) + '%');
  }

  if (messages.length === 0) messages.push('所有参数正常');

  return { level: level, messages: messages };
}

// ============================================================
// 导出
// ============================================================

export const THERMAL_CONFIG = { GEO: GEO, MAT: MAT, OPERATING: OPERATING };
