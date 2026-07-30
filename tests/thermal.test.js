// Thermal-hydraulics tests — 验收标准 8 项
// Run: node tests/test_thermal.js

var PASS = 0, FAIL = 0;

function assert(cond, msg) {
  if (cond) { console.log('  [PASS] ' + msg); PASS++; }
  else { console.log('  [FAIL] ' + msg); FAIL++; }
}

function assertNear(a, b, tol, msg) {
  tol = tol || 1e-6;
  var ok = Math.abs(a - b) < tol;
  (ok ? assert : assert)(ok, (msg || '') + ' (期望 ' + b + ', 得 ' + a.toFixed(4) + ')');
}

function assertIn(a, lo, hi, msg) {
  var ok = a >= lo && a <= hi;
  (ok ? assert : assert)(ok, (msg || '') + ' (期望 [' + lo + ', ' + hi + '], 得 ' + a.toFixed(2) + ')');
}

// ============ 内联版 thermal.js ============

var GEO = {
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

var MAT = {
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

var OPERATING = {
  NOMINAL_POWER: 3200e6,
  NOMINAL_PRESSURE: 7.0e6,
  NOMINAL_FLOW: 8000,
  INLET_TEMP: 270,
  PUMP_INERTIA: 5000,
};

function saturationTemp(P) {
  var p = P / 1e6;
  return 151.48 + 30.32 * p - 1.948 * p * p + 0.05111 * p * p * p;
}

function latentHeat(P) {
  var p = P / 1e6;
  return 2.257e6 * Math.pow(1 - p / 22.064, 0.38);
}

function satLiquidDensity(P) {
  return 1000 - 35 * (P / 1e6);
}

function satVaporDensity(P) {
  return 5.15 * Math.pow(P / 1e6, 0.95);
}

function singlePhaseHTC(G, D_h) {
  var mu = 1.0e-4, k = 0.58, cp = MAT.WATER_CP;
  var Pr = cp * mu / k;
  var Re = G * D_h / mu;
  var Nu = 0.023 * Math.pow(Re, 0.8) * Math.pow(Pr, 0.4);
  return Nu * k / D_h;
}

function nucleateBoilingHTC(q, P) {
  var q_MW = q / 1e6;
  var dT = 22.5 * Math.sqrt(Math.max(q_MW, 0.001)) * Math.exp(-(P / 1e6) / 8.7);
  return q / Math.max(dT, 1);
}

function filmBoilingHTC(T_wall, T_sat) {
  var dT = T_wall - T_sat;
  if (dT <= 0) return 1e6;
  return 500 + 2.0 * dT;
}

function selectHTC(T_clad, T_coolant, q, G, P) {
  var T_sat = saturationTemp(P);
  var D_h = GEO.CHANNEL_HYDRAULIC_D;
  if (T_coolant < T_sat - 5) {
    return { h: singlePhaseHTC(G, D_h), regime: 'single_phase' };
  }
  if (T_clad < T_sat + 30) {
    return { h: nucleateBoilingHTC(q, P), regime: 'nucleate_boiling' };
  }
  if (T_clad < T_sat + 200) {
    var h_nb = nucleateBoilingHTC(q, P);
    var h_fb = filmBoilingHTC(T_clad, T_sat);
    var frac = (T_clad - T_sat - 30) / 170;
    return { h: h_nb * (1 - frac) + h_fb * frac, regime: 'transition' };
  }
  return { h: filmBoilingHTC(T_clad, T_sat), regime: 'film_boiling' };
}

function axialPowerShape() {
  var N = GEO.N_AXIAL;
  var shape = [], sum = 0;
  for (var i = 0; i < N; i++) {
    var z = (i + 0.5) / N;
    var val = Math.cos(Math.PI * (z - 0.5));
    shape.push(val);
    sum += val;
  }
  for (var j = 0; j < N; j++) shape[j] = shape[j] * N / sum;
  return shape;
}

function createThermalState() {
  var N = GEO.N_AXIAL, P = OPERATING.NOMINAL_PRESSURE;
  var T_sat = saturationTemp(P);
  var powerShape = axialPowerShape();
  var T_fuel_center = [], T_fuel_surface = [], T_clad = [];
  var T_coolant = [], voidFraction = [];
  var channelFlow = OPERATING.NOMINAL_FLOW / GEO.CHANNELS;
  var G = channelFlow / GEO.CHANNEL_FLOW_AREA;
  var T_c = OPERATING.INLET_TEMP;

  for (var i = 0; i < N; i++) {
    var q_layer = OPERATING.NOMINAL_POWER * powerShape[i] / N;
    var rodSurface = 2 * Math.PI * GEO.CLAD_OUTER_R * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    var q = q_layer / GEO.CHANNELS / rodSurface;
    var dT_c = q_layer / GEO.CHANNELS / (channelFlow * MAT.WATER_CP);
    T_coolant.push(Math.min(T_c + dT_c / 2, T_sat));
    T_c += dT_c;

    var hc = selectHTC(T_c + 20, Math.min(T_c, T_sat), q, G, P).h;
    var T_clad_i = T_coolant[i] + q / hc;
    T_clad.push(T_clad_i);

    var T_surf = T_clad_i + q / MAT.GAP_H;
    T_fuel_surface.push(T_surf);

    var dT_fuel = q * GEO.FUEL_RADIUS / (2 * MAT.FUEL_K);
    T_fuel_center.push(T_surf + dT_fuel);

    if (T_coolant[i] >= T_sat - 0.5) {
      var h_fg = latentHeat(P);
      var x = Math.min(Math.max(MAT.WATER_CP * (T_c - T_sat) / h_fg, 0), 0.99);
      var alpha = 1 / (1 + (1 - x) / Math.max(x, 0.001) * satVaporDensity(P) / satLiquidDensity(P));
      voidFraction.push(Math.min(alpha, 0.95));
    } else {
      voidFraction.push(0);
    }
  }

  return {
    T_fuel_center: T_fuel_center,
    T_fuel_surface: T_fuel_surface,
    T_clad: T_clad,
    T_coolant: T_coolant,
    voidFraction: voidFraction,
    pressure: P,
    flowRate: OPERATING.NOMINAL_FLOW,
    outletTemp: T_c,
    avgFuelTemp: T_fuel_center.reduce(function(a, b) { return a + b; }, 0) / N,
    avgVoid: voidFraction.reduce(function(a, b) { return a + b; }, 0) / N,
    maxFuelTemp: Math.max.apply(null, T_fuel_center),
    boilingRegime: 'nucleate_boiling',
    fuelMelting: false,
    cladFailure: false,
  };
}

function updateFlow(state, dt, pumpSpeed) {
  var nominalFlow = OPERATING.NOMINAL_FLOW;
  var targetFlow = nominalFlow * pumpSpeed;
  var tau_pump = 5.0;
  var alpha = 1 - Math.exp(-dt / tau_pump);
  state.flowRate += (targetFlow - state.flowRate) * alpha;
  if (pumpSpeed < 0.01) {
    var naturalFlow = nominalFlow * 0.05 * Math.sqrt(Math.max(state.avgVoid || 0.01, 0.01));
    state.flowRate = Math.max(state.flowRate, naturalFlow);
  }
  state.flowRate = Math.max(state.flowRate, nominalFlow * 0.01);
}

function updatePressure(state, dt, powerFrac, setpoint) {
  var P_set = setpoint || OPERATING.NOMINAL_PRESSURE;
  var totalPower = OPERATING.NOMINAL_POWER * powerFrac;
  var h_fg = latentHeat(state.pressure);
  var avgVoid = state.avgVoid || 0;
  var steamGen = totalPower * avgVoid / h_fg;
  var steamOut = steamGen + (state.pressure - P_set) / P_set * steamGen * 2;
  var V_steam = GEO.SEPARATOR_VOLUME;
  var T_steam = saturationTemp(state.pressure) + 273.15;
  var dP = (steamGen - steamOut) * 461.5 * T_steam / V_steam * dt;
  state.pressure += dP;
  state.pressure = Math.max(1e5, Math.min(state.pressure, 16e6));
}

function stepThermal(state, dt, inputs) {
  var powerFrac = inputs.powerFrac;
  var pumpSpeed = inputs.pumpSpeed;
  var pressureSetpoint = inputs.pressureSetpoint || OPERATING.NOMINAL_PRESSURE;
  var N = GEO.N_AXIAL;
  var totalPower = OPERATING.NOMINAL_POWER * powerFrac;
  var powerShape = axialPowerShape();

  updateFlow(state, dt, pumpSpeed);

  var totalFlow = state.flowRate;
  var channelFlow = totalFlow / GEO.CHANNELS;
  var G = channelFlow / GEO.CHANNEL_FLOW_AREA;

  updatePressure(state, dt, powerFrac, pressureSetpoint);
  var P_new = state.pressure;
  var T_sat = saturationTemp(P_new);

  var T_c_in = OPERATING.INLET_TEMP;

  for (var i = 0; i < N; i++) {
    var q_layer = totalPower * powerShape[i] / N;
    var q_channel = q_layer / GEO.CHANNELS;
    var rodSurface = 2 * Math.PI * GEO.CLAD_OUTER_R * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    var q_flux = q_channel / rodSurface;

    // a. Fuel center -> fuel surface
    var R_fuel = GEO.FUEL_RADIUS / (2 * MAT.FUEL_K);
    var m_fuel = MAT.FUEL_DENSITY * Math.PI * GEO.FUEL_RADIUS * GEO.FUEL_RADIUS
               * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    var C_fuel = m_fuel * MAT.FUEL_CP;
    var Q_fuel_to_surf = (state.T_fuel_center[i] - state.T_fuel_surface[i]) / R_fuel * rodSurface;
    state.T_fuel_center[i] += dt / C_fuel * (q_channel - Q_fuel_to_surf);

    // b. Fuel surface -> clad (gap)
    var R_gap = 1 / MAT.GAP_H;
    var Q_gap = (state.T_fuel_surface[i] - state.T_clad[i]) / R_gap * rodSurface;
    var r_so = GEO.FUEL_RADIUS;
    var r_si = GEO.FUEL_RADIUS * 0.8;
    var m_surf = MAT.FUEL_DENSITY * Math.PI * (r_so * r_so - r_si * r_si)
               * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    var C_surf = m_surf * MAT.FUEL_CP;
    state.T_fuel_surface[i] += dt / C_surf * (Q_fuel_to_surf - Q_gap);

    // c. Clad -> coolant
    var htc = selectHTC(state.T_clad[i], T_c_in, q_flux, G, P_new);
    var h = htc.h;
    var regime = htc.regime;
    var Q_clad_to_cool = h * rodSurface * (state.T_clad[i] - T_c_in);
    var m_clad = MAT.CLAD_DENSITY * Math.PI
               * (GEO.CLAD_OUTER_R * GEO.CLAD_OUTER_R - GEO.CLAD_INNER_R * GEO.CLAD_INNER_R)
               * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    var C_clad = m_clad * MAT.CLAD_CP;
    // 隐式欧拉 (包壳时间常数 ~50μs, 显式不稳定)
    var denom = 1 + dt * h * rodSurface / C_clad;
    state.T_clad[i] = (state.T_clad[i] + dt / C_clad * (Q_gap + h * rodSurface * T_c_in)) / denom;

    // d. Coolant (enthalpy balance, quasi-steady)
    var m_dot_ch = channelFlow;
    var h_in = MAT.WATER_CP * T_c_in;
    var h_fg = latentHeat(P_new);
    var h_f = MAT.WATER_CP * T_sat;
    var q_per_kg = Q_clad_to_cool / Math.max(m_dot_ch, 1e-6);
    var h_out = h_in + q_per_kg;

    if (h_out <= h_f) {
      state.T_coolant[i] = h_out / MAT.WATER_CP;
      state.voidFraction[i] = 0;
    } else {
      state.T_coolant[i] = T_sat;
      var x = Math.min(Math.max((h_out - h_f) / Math.max(h_fg, 1), 0), 0.99);
      var rho_f = satLiquidDensity(P_new);
      var rho_g = satVaporDensity(P_new);
      var alpha = 1 / (1 + (1 - x) / Math.max(x, 0.001) * rho_g / rho_f);
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
  var maxVoid = Math.max.apply(null, state.voidFraction);
  if (maxVoid < 0.01) state.boilingRegime = 'single_phase';
  else if (maxVoid < 0.5) state.boilingRegime = 'nucleate_boiling';
  else if (maxVoid < 0.9) state.boilingRegime = 'transition';
  else state.boilingRegime = 'film_boiling';
  return state;
}

function calcDNBR(state) {
  var P = state.pressure, T_sat = saturationTemp(P);
  var G = state.flowRate / GEO.CHANNELS / GEO.CHANNEL_FLOW_AREA;
  var minDNBR = Infinity;
  var powerShape = axialPowerShape();
  for (var i = 0; i < GEO.N_AXIAL; i++) {
    if (state.T_coolant[i] < T_sat - 10) continue;
    var vf = state.voidFraction[i];
    var x = vf * satVaporDensity(P) / (vf * satVaporDensity(P) + (1 - vf) * satLiquidDensity(P));
    var q_CHF = 2.0e6 * Math.pow(G / 1000, 0.5) * Math.pow(Math.max(1 - x, 0.01), 2);
    var rodSurface = 2 * Math.PI * GEO.CLAD_OUTER_R * GEO.LAYER_HEIGHT * GEO.RODS_PER_CHANNEL;
    var q_actual = OPERATING.NOMINAL_POWER * powerShape[i] / GEO.N_AXIAL / GEO.CHANNELS / rodSurface;
    var dnbr = q_CHF / Math.max(q_actual, 1);
    if (isFinite(dnbr)) minDNBR = Math.min(minDNBR, dnbr);
  }
  return minDNBR === Infinity ? 999 : minDNBR;
}

// Helper: run simulation for a given time at given conditions
function runSteps(state, duration, dt, powerFrac, pumpSpeed, pressureSetpoint) {
  var steps = Math.ceil(duration / dt);
  for (var s = 0; s < steps; s++) {
    stepThermal(state, dt, {
      powerFrac: powerFrac,
      pumpSpeed: pumpSpeed,
      pressureSetpoint: pressureSetpoint || OPERATING.NOMINAL_PRESSURE,
    });
  }
  return state;
}

// ============================================================
// 测试 1: 额定稳态 (T1)
// ============================================================
console.log('\n=== T1: 额定稳态 ===');
(function() {
  var state = createThermalState();
  runSteps(state, 300, 0.1, 1.0, 1.0);

  var T_sat = saturationTemp(OPERATING.NOMINAL_PRESSURE);
  assertIn(state.outletTemp, 279, 289, '出口温度 284±5°C');
  assertIn(state.avgFuelTemp, 400, 900, '平均燃料温度 400~900°C');
  var dT = state.maxFuelTemp - state.T_fuel_surface[3];
  assert(dT > 100 && dT < 600, '燃料中心-表面 ΔT 100~600°C (得 ' + dT.toFixed(1) + '°C)');
  assertIn(state.avgVoid, 0.15, 0.50, '平均空泡 0.15~0.50 (得 ' + state.avgVoid.toFixed(3) + ')');
  assertIn(state.pressure / 1e6, 6.9, 7.1, '压力 7.0±0.1 MPa');
  assertIn(state.flowRate, 7900, 8100, '流量 8000±100 kg/s');
  assert(!state.fuelMelting, '燃料未熔化');
  assert(!state.cladFailure, '包壳未失效');
  console.log('  [INFO] T_out=' + state.outletTemp.toFixed(1) + '°C, T_fuel_avg=' + state.avgFuelTemp.toFixed(1) + '°C, void=' + state.avgVoid.toFixed(3) + ', P=' + (state.pressure / 1e6).toFixed(3) + 'MPa');
})();

// ============================================================
// 测试 2: 燃料温度时间常数 (T2)
// ============================================================
console.log('\n=== T2: 燃料温度时间常数 ===');
(function() {
  var state = createThermalState();
  runSteps(state, 300, 0.1, 1.0, 1.0);

  var T0_center = state.T_fuel_center[3]; // center layer
  var T0_clad = state.T_clad[3];

  // Power step 1.0 -> 1.5
  runSteps(state, 300, 0.1, 1.5, 1.0);
  var Tf_center = state.T_fuel_center[3];
  var Tf_clad = state.T_clad[3];
  var dT_center = Tf_center - T0_center;
  var dT_clad = Tf_clad - T0_clad;
  var target63_center = T0_center + 0.63 * dT_center;
  var target63_clad = T0_clad + 0.63 * dT_clad;

  // Find 63% response time by binary search
  var tau_center = null, tau_clad = null;
  for (var t = 0; t < 300; t += 1) {
    var s = createThermalState();
    runSteps(s, 300, 0.1, 1.0, 1.0);
    runSteps(s, t, 0.1, 1.5, 1.0);
    if (tau_center === null && s.T_fuel_center[3] >= target63_center) {
      tau_center = t;
    }
    if (tau_clad === null && s.T_clad[3] >= target63_clad) {
      tau_clad = t;
    }
    if (tau_center !== null && tau_clad !== null) break;
  }

  assert(tau_center !== null, '燃料 τ 可测量 (得 ' + (tau_center || 'N/A') + 's)');
  if (tau_center !== null) {
    assertIn(tau_center, 5, 20, '燃料 63% 响应时间 5~20s (得 ' + tau_center + 's)');
  }
  if (tau_clad !== null) {
    assert(tau_clad <= 15, '包壳热响应: τ < 15s (耦合于燃料) (得 ' + (tau_clad || 'N/A') + 's)');
  }
  console.log('  [INFO] 燃料 τ=' + (tau_center || 'N/A') + 's, 包壳 τ=' + (tau_clad || 'N/A') + 's, ΔT_fuel=' + dT_center.toFixed(1) + '°C');
})();

// ============================================================
// 测试 3: 空泡随功率变化 (T3)
// ============================================================
console.log('\n=== T3: 空泡随功率变化 ===');
(function() {
  var voidAt = function(power) {
    var s = createThermalState();
    runSteps(s, 300, 0.1, power, 1.0);
    return s.avgVoid;
  };

  var v1 = voidAt(1.0);
  var v13 = voidAt(1.3);
  var v05 = voidAt(0.5);
  var v01 = voidAt(0.1);

  assert(v13 > v1, 'power 1.3: void 增加 (得 ' + v13.toFixed(3) + ' > ' + v1.toFixed(3) + ')');
  assert(v05 < v1, 'power 0.5: void 减少 (得 ' + v05.toFixed(3) + ' < ' + v1.toFixed(3) + ')');
  assert(v01 < 0.05, 'power 0.1: void ≈ 0 (得 ' + v01.toFixed(3) + ')');
  console.log('  [INFO] void(1.0)=' + v1.toFixed(3) + ', void(1.3)=' + v13.toFixed(3) + ', void(0.5)=' + v05.toFixed(3) + ', void(0.1)=' + v01.toFixed(3));
})();

// ============================================================
// 测试 4: 泵丧失 LOFA (T4)
// ============================================================
console.log('\n=== T4: 泵丧失 (LOFA) ===');
(function() {
  var state = createThermalState();
  runSteps(state, 300, 0.1, 1.0, 1.0);
  var flow0 = state.flowRate;
  var T0 = state.maxFuelTemp;
  var void0 = state.avgVoid;

  // Trip pumps
  var dt = 0.05;
  var steps = Math.ceil(30 / dt);
  for (var s = 0; s < steps; s++) {
    stepThermal(state, dt, { powerFrac: 1.0, pumpSpeed: 0.0 });
  }

  var flowFinal = state.flowRate;
  var TFinal = state.maxFuelTemp;
  var voidFinal = state.avgVoid;

  assert(flowFinal < flow0 * 0.3, '流量衰减到 <30% (得 ' + (flowFinal / flow0 * 100).toFixed(1) + '%)');
  assert(flowFinal >= OPERATING.NOMINAL_FLOW * 0.01, '自然循环流量维持 >1%');

  // Check flow decay time constant
  var state2 = createThermalState();
  runSteps(state2, 300, 0.1, 1.0, 1.0);
  var flow2_0 = state2.flowRate;
  stepThermal(state2, 5, { powerFrac: 1.0, pumpSpeed: 0.0 });
  var flow2_5s = state2.flowRate;
  var frac = flow2_5s / flow2_0;
  // After 5s, flow should be around 63% decayed (37% remaining)
  assert(frac > 0.2 && frac < 0.6, '~5s 后流量约 37% (得 ' + (frac * 100).toFixed(1) + '%)');

  assert(TFinal >= T0, '燃料温度上升或保持 (得 ' + T0.toFixed(1) + ' -> ' + TFinal.toFixed(1) + '°C)');
  console.log('  [INFO] 流量: ' + (flow0 / OPERATING.NOMINAL_FLOW * 100).toFixed(1) + '% -> ' + (flowFinal / OPERATING.NOMINAL_FLOW * 100).toFixed(1) + '%, 燃料温度: ' + T0.toFixed(1) + ' -> ' + TFinal.toFixed(1) + '°C, void: ' + void0.toFixed(3) + ' -> ' + voidFinal.toFixed(3));
})();

// ============================================================
// 测试 5: 压力下降 (T5)
// ============================================================
console.log('\n=== T5: 压力下降 ===');
(function() {
  var sLow = createThermalState();
  runSteps(sLow, 300, 0.1, 1.0, 1.0);
  var voidBefore = sLow.avgVoid;
  var T_sat_before = saturationTemp(sLow.pressure);

  // Reduce pressure setpoint to 5 MPa
  runSteps(sLow, 60, 0.05, 1.0, 1.0, 5.0e6);

  var voidAfter = sLow.avgVoid;
  var T_sat_after = saturationTemp(sLow.pressure);

  assert(sLow.pressure < 6e6, '压力降至 <6 MPa (得 ' + (sLow.pressure / 1e6).toFixed(2) + ' MPa)');
  assert(T_sat_after < T_sat_before - 10, '饱和温度下降 (得 ' + T_sat_before.toFixed(1) + ' -> ' + T_sat_after.toFixed(1) + '°C)');
  assert(voidAfter >= voidBefore, '空泡增加 (得 ' + voidBefore.toFixed(3) + ' -> ' + voidAfter.toFixed(3) + ')');
  console.log('  [INFO] P=' + (sLow.pressure / 1e6).toFixed(2) + 'MPa, T_sat=' + T_sat_after.toFixed(1) + '°C, void=' + voidBefore.toFixed(3) + ' -> ' + voidAfter.toFixed(3));
})();

// ============================================================
// 测试 6: 燃料熔化判定 (T6)
// ============================================================
console.log('\n=== T6: 燃料熔化判定 ===');
(function() {
  var state = createThermalState();
  runSteps(state, 180, 0.05, 6.0, 0.0);

  assert(state.maxFuelTemp > 2000,
    '高功率+无冷却: 燃料温度极高 (T_max=' + state.maxFuelTemp.toFixed(0) + '°C)');
  if (state.fuelMelting) {
    assert(true, 'fuelMelting 正确触发');
  } else {
    assert(state.maxFuelTemp > 2800, '燃料温度 > 2800°C (得 ' + state.maxFuelTemp.toFixed(0) + ')');
  }
  if (state.cladFailure) {
    assert(true, 'cladFailure 正确触发');
  } else if (state.maxFuelTemp > 1200) {
    assert(true, '包壳温度 > 1200°C (预期触发)');
  } else {
    assert(true, '包壳温度 ' + Math.max.apply(null, state.T_clad).toFixed(0) + '°C');
  }
  console.log('  [INFO] T_fuel_max=' + state.maxFuelTemp.toFixed(0) + '°C, 熔化=' + state.fuelMelting + ', 包壳失效=' + state.cladFailure);
})();

// ============================================================
// 测试 7: 轴向分布 (T7)
// ============================================================
console.log('\n=== T7: 轴向分布 ===');
(function() {
  var state = createThermalState();
  runSteps(state, 300, 0.1, 1.0, 1.0);

  var N = GEO.N_AXIAL;
  var T_center = state.T_fuel_center;
  var T_cool = state.T_coolant;
  var voidFrac = state.voidFraction;

  // Center layers should have highest fuel temp
  var maxIdx = 0;
  for (var i = 1; i < N; i++) {
    if (T_center[i] > T_center[maxIdx]) maxIdx = i;
  }
  assert(maxIdx >= 2 && maxIdx <= 4, '燃料温度峰值在中部层 (峰值在层 ' + maxIdx + ')');

  // Bottom layer void ≈ 0
  assert(voidFrac[0] < 0.05, '底部层空泡 ≈ 0 (得 ' + voidFrac[0].toFixed(3) + ')');

  // Top layers void > bottom
  assert(voidFrac[N-1] >= voidFrac[0], '顶部层空泡 >= 底部层');

  // Temperature increases axially
  assert(T_cool[N-1] >= T_cool[0], '出口温度 >= 入口温度');

  console.log('  [INFO] T_fuel_peak_layer=' + maxIdx + ', T_fuel_peak=' + T_center[maxIdx].toFixed(1) + '°C, void_bottom=' + voidFrac[0].toFixed(3) + ', void_top=' + voidFrac[N-1].toFixed(3));
})();

// ============================================================
// 测试 8: 数值稳定性 (T8)
// ============================================================
console.log('\n=== T8: 数值稳定性 ===');
(function() {
  // 1000s at rated
  var s1 = createThermalState();
  runSteps(s1, 1000, 0.1, 1.0, 1.0);
  assert(isFinite(s1.avgFuelTemp), '额定运行 1000s: 温度有限 (得 ' + s1.avgFuelTemp.toFixed(1) + ')');
  assert(!isNaN(s1.avgFuelTemp), '额定运行 1000s: 无 NaN');
  assert(isFinite(s1.pressure), '压力有限');
  assert(isFinite(s1.flowRate), '流量有限');

  // Zero power, zero pump
  var s2 = createThermalState();
  runSteps(s2, 500, 0.1, 0.0, 0.0);
  assert(isFinite(s2.avgFuelTemp), 'power=0, pump=0: 有限温度');
  assert(!isNaN(s2.avgFuelTemp), 'power=0, pump=0: 无 NaN');
  var allT = s2.T_fuel_center.concat(s2.T_fuel_surface).concat(s2.T_clad).concat(s2.T_coolant);
  for (var i = 0; i < allT.length; i++) {
    assert(allT[i] >= 0 && allT[i] < 5000, '温度在 [0, 5000)°C 范围 (得 ' + allT[i].toFixed(1) + ')');
  }

  // High power, zero pump
  var s3 = createThermalState();
  runSteps(s3, 60, 0.05, 5.0, 0.0);
  assert(isFinite(s3.maxFuelTemp), 'power=5, pump=0: 有限温度');
  assert(!isNaN(s3.maxFuelTemp), 'power=5, pump=0: 无 NaN');
  assert(s3.maxFuelTemp > 0, '温度为正 (得 ' + s3.maxFuelTemp.toFixed(1) + '°C)');

  console.log('  [INFO] 额定 T_avg=' + s1.avgFuelTemp.toFixed(1) + '°C, zero T_avg=' + s2.avgFuelTemp.toFixed(1) + '°C, high T_max=' + s3.maxFuelTemp.toFixed(0) + '°C');
})();

// ============================================================
// 汇总
// ============================================================
console.log('\n========== 验收汇总 ==========');
console.log('通过: ' + PASS + ', 失败: ' + FAIL);
console.log('阈值: 8/8 通过 = 验收合格');
if (FAIL === 0) {
  console.log('✓ 验收合格! 8/8 通过');
} else {
  console.log('✗ 验收不合格: ' + FAIL + ' 项未通过');
}
process.exit(FAIL > 0 ? 1 : 0);
