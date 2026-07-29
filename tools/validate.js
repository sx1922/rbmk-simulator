#!/usr/bin/env node

var fs = require('fs');

// ---- Inline physics modules (mirrors browser Physics namespace) ----
var CONFIG = {
  RATED_T: 3200,
  MELT_T: 2800,
  NUM_RODS: 211,
  ORM_MIN: 26,
  ORM_CRIT: 15,
  FLOW_RATED: 48000,
  FLOW_PER_PUMP: 6000,
  PUMP_TOTAL: 8,
  LAMBDA: 1e-4,
  BETA_EFF: 0.0065,
  LAMBDA_D: [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01],
  BETA_I: [0.00021, 0.00141, 0.00127, 0.00255, 0.00074, 0.00027],
  ALPHA_FUEL: -2.4e-5,
  ALPHA_VOID: 2.8e-4,
  ALPHA_GRAPHITE: 1.2e-6,
  YIELD_XE: 0.003,
  YIELD_I: 0.061,
  LAMBDA_I: 2.87e-5,
  LAMBDA_XE: 2.09e-5,
  SIGMA_XE: 2.7e-18,
  FLUX_FACTOR: 1e13,
  ZONE_POWER_FRAC: [0.12, 0.18, 0.40, 0.18, 0.12],
  ZONE_MASS: [8000, 10000, 12000, 10000, 8000],
  ZONE_VOL: [5.0, 6.5, 8.0, 6.5, 5.0],
  CP_COOLANT: 4200,
  CP_FUEL: 300,
  TSAT_4MPA: 280,
  H_FG: 1500e3,
  TURBINE_RATED: 500,
  TURBINE_VMAX: 3150,
  TURBINE_VNOM: 3000,
  STEAM_PRES_RATED: 6.0,
  QUOTA: 120000,
  ELECTRIC_PRICE: 0.02,
  STAFF_COST: 800,
  BASE_MAINT: 1000,
  START_MONEY: 5000000,
  POLITICS_DECAY: {1: 3, 2: 5, 3: 8},
  DIFFICULTIES: {
    1: { name: '简单', money: 8000000, eventMul: 0.5, politicsDecay: 3, staffBonus: 2 },
    2: { name: '普通', money: 5000000, eventMul: 1.0, politicsDecay: 5, staffBonus: 0 },
    3: { name: '困难', money: 3000000, eventMul: 1.8, politicsDecay: 8, staffBonus: -1 },
  },
  SEASON_TEMP: {1:255,2:255,3:265,4:265,5:265,6:280,7:280,8:280,9:270,10:270,11:255,12:255},
  STATE_NAMES: {SHUTDOWN:'停堆',POWER:'功率运行',SCRAM:'紧急停堆',LOWPOW:'低功率',EXPLOSION:'爆炸',MELTDOWN:'熔毁'},
  SEASONS: ['冬','冬','春','春','春','夏','夏','夏','秋','秋','冬','冬'],
};

var STATE = {};

STATE.init = function(seed) {
  seed = seed || Date.now();
  this._rng = { seed: seed, state: seed };
  this.money = CONFIG.START_MONEY;
  this.politics = 70;
  this.diff = 2;
  this.day = 25; this.hour = 8; this.month = 4; this.year = 1986;
  this.daysOp = 0; this.totalGen = 0; this.scrams = 0; this.incidents = 0;
  this.quota = CONFIG.QUOTA; this.quotaDone = 0; this.rad = 0.012;
  this.gameOver = false; this.started = false;
  this.shift = 0;
  this.shiftNames = ['白班 А','中班 Б','夜班 В'];
  this.trend = []; this.xenonTrend = [];
  this.logs = []; this.logUnread = 0;
  this.lastEventDay = 0; this.daysSinceEvent = 0;
  this.r = {
    power: 0,
    state: 'SHUTDOWN',
    rods: new Array(CONFIG.NUM_RODS).fill(100),
    void: 0,
    xenon: 0,
    iodine: 0,
    fuelT: 20,
    coolOut: 270,
    coolIn: 270,
    graphiteT: 20,
    flow: 0,
    pumpsOn: 0,
    hours: 0,
    reactivity: 0,
    az5Done: false,
    az5Phase: 0,
    az5Timer: 0,
    refuelBonus: 0,
  };
  this.thermal = {
    totalVoid: 0,
    coolantFlow: CONFIG.FLOW_RATED,
    pumpsOn: 8,
    zones: [],
  };
  for (var i = 0; i < 5; i++) {
    this.thermal.zones.push({power: 0, tIn: 265, tOut: 265, void: 0, tFuel: 300, tClad: 280, dnbr: 5.0, boiling: false});
  }
  this.turbine = {
    online: false, speed: 0, steamPressure: 0, steamTemp: 0,
    steamFlow: 0, fwFlow: 0, bypassValve: 0, condenserVacuum: 0.005,
    electricPower: 0, tripped: false, health: 95,
    vibration: 0, axialShift: 0,
  };
  this.instruments = { list: {} };
  this.mission = { active: false, phase: 'idle', completed: false, failed: false };
  this.staff = [];
  this.safety = [];
  this.fuelBurn = [];
  for (var j = 0; j < 100; j++) this.fuelBurn.push(5 + Math.random() * 13);
  this.achievements = [];
  this.totalCrits = 0; this.maxPowerPct = 0;
  this.survivedXenonPeak = false; this.az5Survived = false;
  this.survivedOverpower = false; this.winterQuotaDone = false;
  this.toastMsg = ''; this.toastTimer = 0; this.toastType = '';
  this.screen = 'intro';
  this.page = 0;
  this.shakeTime = 0; this.shakeX = 0; this.shakeY = 0;
  this.flashAlpha = 0;
};

STATE._rng = { seed: 0, state: 0 };

STATE._nextRng = function() {
  this._rng.state = (this._rng.state * 1664525 + 1013904223) >>> 0;
  return (this._rng.state & 0x7fffffff) / 0x80000000;
};

STATE._range = function(a, b) {
  return a + this._nextRng() * (b - a);
};

var Physics = {};

Physics.Reactivity = {};
Physics.Reactivity.compute = function(state) {
  var rho = 0;
  for (var i = 0; i < CONFIG.NUM_RODS; i++) {
    rho += -(state.r.rods[i] / 100) * 0.0004;
  }
  rho += CONFIG.ALPHA_VOID * state.r.void * 100;
  rho += CONFIG.ALPHA_FUEL * (state.r.fuelT - 300);
  rho += -0.001 * state.r.xenon / (1 + state.r.xenon);
  rho += state.r.refuelBonus;
  state.r.reactivity = rho;
};

Physics.Neutron = {};
Physics.Neutron.step = function(dt, state) {
  var P = state.r.power;
  var rho = state.r.reactivity;
  var beta = CONFIG.BETA_EFF;
  var Lambda = CONFIG.LAMBDA;
  if (!state.r.precursors) {
    state.r.precursors = [0, 0, 0, 0, 0, 0];
  }
  var C = state.r.precursors;
  var substeps = 10;
  var h = dt / substeps;
  for (var s = 0; s < substeps; s++) {
    var sumLambdaC = 0;
    for (var i = 0; i < 6; i++) {
      sumLambdaC += CONFIG.LAMBDA_D[i] * C[i];
    }
    var dP = ((rho - beta) / Lambda * P + sumLambdaC) * h;
    for (var j = 0; j < 6; j++) {
      var dC = (CONFIG.BETA_I[j] / Lambda * P - CONFIG.LAMBDA_D[j] * C[j]) * h;
      C[j] += dC;
    }
    P += dP;
    if (P < 0) P = 0;
  }
  state.r.power = P;
};

Physics.Xenon = {};
Physics.Xenon.step = function(dt, state) {
  var P = state.r.power;
  var I = state.r.iodine;
  var Xe = state.r.xenon;
  var Phi = (P / CONFIG.RATED_T) * CONFIG.FLUX_FACTOR;
  var dI = (CONFIG.YIELD_I * Phi - CONFIG.LAMBDA_I * I) * dt;
  var dXe = (CONFIG.YIELD_XE * Phi + CONFIG.LAMBDA_I * I - CONFIG.LAMBDA_XE * Xe - CONFIG.SIGMA_XE * Phi * Xe) * dt;
  state.r.iodine += dI;
  state.r.xenon += dXe;
  if (state.r.iodine < 0) state.r.iodine = 0;
  if (state.r.xenon < 0) state.r.xenon = 0;
};

Physics.Thermal = {};
Physics.Thermal.step = function(dt, state) {
  var zones = state.thermal.zones;
  var P_total = state.r.power;
  var flow_m3h = state.thermal.coolantFlow;
  var flow_per_zone_kg_s = (flow_m3h / 5) * 1000 / 3600;
  if (flow_m3h <= 0) flow_per_zone_kg_s = 0;
  var totalVoid = 0;
  for (var i = 0; i < 5; i++) {
    var zone = zones[i];
    var P_zone = CONFIG.ZONE_POWER_FRAC[i] * P_total;
    var P_zone_watts = P_zone * 1e6;
    var mass = CONFIG.ZONE_MASS[i];
    var cp = CONFIG.CP_COOLANT;
    zone.power = P_zone;
    var dT_out = (P_zone_watts - cp * flow_per_zone_kg_s * (zone.tOut - zone.tIn)) / (mass * cp) * dt;
    zone.tOut += dT_out;
    if (zone.tOut < zone.tIn) zone.tOut = zone.tIn;
    if (zone.tOut > 2000) zone.tOut = 2000;
    zone.tClad = zone.tOut;
    var h_coeff = 5000;
    var m_fuel = 500;
    var cp_fuel = CONFIG.CP_FUEL;
    var dT_fuel = (P_zone_watts - h_coeff * (zone.tFuel - zone.tClad)) / (m_fuel * cp_fuel) * dt;
    zone.tFuel += dT_fuel;
    if (zone.tFuel < zone.tClad) zone.tFuel = zone.tClad;
    if (zone.tFuel > 5000) zone.tFuel = 5000;
    if (zone.tOut > CONFIG.TSAT_4MPA) {
      var deltaT = zone.tOut - zone.tIn;
      if (deltaT > 1) {
        zone.void = (zone.tOut - CONFIG.TSAT_4MPA) / deltaT * 0.8;
      } else {
        zone.void = 0.8;
      }
      if (zone.void > 1.0) zone.void = 1.0;
    } else {
      zone.void = 0;
    }
    zone.dnbr = 5.0 - CONFIG.ZONE_POWER_FRAC[i] * 3.5;
    if (zone.dnbr < 0.5) zone.dnbr = 0.5;
    zone.boiling = zone.void > 0.05;
    totalVoid += zone.void;
  }
  var avgVoid = totalVoid / 5;
  state.thermal.totalVoid = avgVoid;
  state.r.void = avgVoid;
  var avgFuelT = 0;
  for (var k = 0; k < 5; k++) avgFuelT += zones[k].tFuel;
  state.r.fuelT = avgFuelT / 5;
};

Physics.AZ5 = {};
Physics.AZ5.fire = function(state, rngFunc) {
  if (state.r.az5Phase !== 0) return 'OK';
  state.r.az5Phase = 1;
  state.r.az5Timer = 18;
  for (var i = 0; i < CONFIG.NUM_RODS; i++) state.r.rods[i] = 100;
  var voidFrac = state.r.void;
  var power = state.r.power;
  if (voidFrac > 0.3 && power > 1500) {
    var spikePower = power * (1 + voidFrac * 0.5);
    if (spikePower > CONFIG.MELT_T) { state.r.state = 'EXPLOSION'; return 'SPIKE'; }
    state.r.power = spikePower;
    return 'SPIKE';
  }
  return 'OK';
};

Physics.Protection = {};
Physics.Protection.check = function(state) {
  var alarms = [];
  var r = state.r;
  var powerPct = r.power / CONFIG.RATED_T * 100;
  if (powerPct > 110) alarms.push('超功率停堆 (>110%)');
  else if (powerPct > 88) alarms.push('警告: 功率接近限值 (>88%)');
  var orm = 0;
  for (var i = 0; i < CONFIG.NUM_RODS; i++) orm += r.rods[i] / 100;
  if (orm < CONFIG.ORM_CRIT) alarms.push('ORM 过低 (<15 根)');
  else if (orm < CONFIG.ORM_MIN) alarms.push('ORM 偏低 (<26 根)');
  else if (orm < 32) alarms.push('警告: ORM 接近下限 (<32 根)');
  if (r.fuelT > 1600) alarms.push('燃料温度过高 (>1600°C)');
  else if (r.fuelT > 1280) alarms.push('警告: 燃料温度接近限值 (>1280°C)');
  if (r.void > 0.5) alarms.push('空泡份额过高 (>50%)');
  else if (r.void > 0.4) alarms.push('警告: 空泡份额接近限值 (>40%)');
  var flowPct = state.thermal.coolantFlow / CONFIG.FLOW_RATED * 100;
  if (flowPct < 25) alarms.push('冷却剂流量过低 (<25%)');
  else if (flowPct < 50) alarms.push('警告: 流量偏低');
  var pumpsOn = state.thermal.pumpsOn || state.r.pumpsOn || 0;
  if (pumpsOn < 3) alarms.push('主泵数量不足 (<3 台)');
  else if (pumpsOn < 5) alarms.push('警告: 主泵偏少');
  if (state.turbine.tripped) alarms.push('汽轮机跳闸');
  if (state.rad > 0.1) alarms.push('辐射水平过高 (>0.1 Sv/h)');
  else if (state.rad > 0.05) alarms.push('警告: 辐射水平偏高');
  return alarms;
};

// ---- Main validate logic ----

function loadScenario(path) {
  var raw = fs.readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

function applyAction(state, action) {
  var op = action.op;
  var args = action.args || [];
  switch (op) {
    case 'set_power':
      state.r.power = args[0];
      break;
    case 'set_rods':
      for (var i = 0; i < CONFIG.NUM_RODS; i++) state.r.rods[i] = args[0];
      break;
    case 'set_void':
      state.r.void = args[0];
      break;
    case 'raise_rods':
      for (var i = 0; i < CONFIG.NUM_RODS; i++) state.r.rods[i] = Math.max(0, state.r.rods[i] - args[0]);
      break;
    case 'lower_rods':
      for (var i = 0; i < CONFIG.NUM_RODS; i++) state.r.rods[i] = Math.min(100, state.r.rods[i] + args[0]);
      break;
    case 'startup':
      state.started = true;
      state.r.state = 'POWER';
      state.r.power = args[0] || 50;
      break;
    case 'shutdown':
      state.r.state = 'SHUTDOWN';
      state.r.power = 0;
      break;
    case 'set_state':
      state.r.state = args[0];
      break;
    case 'set_xenon':
      state.r.xenon = args[0];
      break;
    case 'set_iodine':
      state.r.iodine = args[0];
      break;
    case 'az5':
      Physics.AZ5.fire(state);
      break;
    case 'reduce_pumps':
      state.thermal.pumpsOn = Math.max(0, (state.thermal.pumpsOn || 8) - args[0]);
      state.thermal.coolantFlow = (state.thermal.pumpsOn || 0) * CONFIG.FLOW_PER_PUMP;
      break;
    case 'set_pumps':
      state.thermal.pumpsOn = args[0];
      state.thermal.coolantFlow = args[0] * CONFIG.FLOW_PER_PUMP;
      break;
    default:
      break;
  }
}

function matchesExpectation(state, exp) {
  var actual;
  var parts = exp.field.split('.');
  var obj = state;
  for (var i = 0; i < parts.length; i++) {
    if (obj && typeof obj === 'object') obj = obj[parts[i]];
    else { obj = undefined; break; }
  }
  actual = obj;
  if (actual === undefined) return { pass: false, actual: undefined };
  var tol = exp.tolerance !== undefined ? exp.tolerance : 0.001;
  if (typeof actual === 'string' || typeof exp.value === 'string') {
    return { pass: actual === exp.value, actual: actual };
  }
  return { pass: Math.abs(actual - exp.value) <= tol, actual: actual };
}

function runScenario(path) {
  var scenario = loadScenario(path);
  console.log('=== Scenario:', scenario.name || path, '===');
  STATE.init(scenario.seed || 12345);
  // Apply initial state overrides
  if (scenario.initial_state) {
    for (var key in scenario.initial_state.r) {
      if (key === 'rods' && typeof scenario.initial_state.r.rods === 'number') {
        STATE.r.rods = new Array(CONFIG.NUM_RODS).fill(scenario.initial_state.r.rods);
      } else {
        STATE.r[key] = scenario.initial_state.r[key];
      }
    }
    for (var key in scenario.initial_state.thermal) {
      if (key === 'zones') {
        for (var i = 0; i < scenario.initial_state.thermal.zones.length; i++) {
          for (var zk in scenario.initial_state.thermal.zones[i]) {
            STATE.thermal.zones[i][zk] = scenario.initial_state.thermal.zones[i][zk];
          }
        }
      } else {
        STATE.thermal[key] = scenario.initial_state.thermal[key];
      }
    }
  }
  if (scenario.initial_state && scenario.initial_state.turbine) {
    for (var key in scenario.initial_state.turbine) STATE.turbine[key] = scenario.initial_state.turbine[key];
  }
  STATE.started = true;

  // Sort actions by time
  var actions = (scenario.actions || []).slice().sort(function(a, b) { return a.time - b.time; });
  var expectations = scenario.expectations || [];
  var maxSteps = 1000;
  var actionIdx = 0;
  var step = 0;
  var dt = 0.5;

  for (step = 0; step < maxSteps; step++) {
    var t = step * dt;
    // Apply pending actions
    while (actionIdx < actions.length && actions[actionIdx].time <= t) {
      applyAction(STATE, actions[actionIdx]);
      actionIdx++;
    }
    // Physics step
    Physics.Reactivity.compute(STATE);
    Physics.Neutron.step(dt, STATE);
    Physics.Xenon.step(dt, STATE);
    Physics.Thermal.step(dt, STATE);

  }

  var allPass = true;
  for (var ei = 0; ei < expectations.length; ei++) {
    var exp = expectations[ei];
    var result = matchesExpectation(STATE, exp);
    var line = result.pass ? '[PASS]' : '[FAIL]';
    line += ' expectation ' + (ei + 1) + ': ' + exp.field;
    line += ' expected=' + exp.value + ' (tol=' + (exp.tolerance || 0.001) + ')';
    line += ' actual=' + (result.actual !== undefined ? result.actual : 'undefined');
    console.log(line);
    if (!result.pass) allPass = false;
  }

  if (expectations.length === 0) {
    console.log('(no expectations - final power=' + STATE.r.power.toFixed(2) + ' MWt)');
  }

  console.log(allPass ? 'All expectations met.' : 'Some expectations FAILED.');
  console.log('');
  return allPass ? 0 : 1;
}

// ---- CLI ----
var exitCode = 0;
if (process.argv.length < 3) {
  console.log('Usage: node tools/validate.js <scenario.json> [scenario2.json ...]');
  process.exit(1);
}
for (var a = 2; a < process.argv.length; a++) {
  var rc = runScenario(process.argv[a]);
  if (rc !== 0) exitCode = rc;
}
process.exit(exitCode);
