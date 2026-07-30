// Neutron kinetics tests — inline mock of new Physics.Neutron
// Run: node tests/test_neutron.js

var PASS = 0, FAIL = 0;
function assert(cond, msg) {
  if (cond) { console.log('[PASS] ' + msg); PASS++; }
  else { console.log('[FAIL] ' + msg); FAIL++; }
}
function assertNear(a, b, tol, msg) {
  tol = tol || 1e-6;
  var ok = Math.abs(a - b) < tol;
  (ok ? assert : assert)(ok, (msg || '') + ' 期望 ' + b + ', 得 ' + a);
}

// === 内联版 Physics.Neutron (匹配新的 RK4 实现) ===
var CONFIG = {
  RATED_T: 3200,
  LAMBDA_PROMPT: 1e-3,
  BETA_EFF: 0.006502,
  BETA_I: [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273],
  LAMBDA_D: [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01],
  P_MAX_SAFE: 3840,
  P_MELTDOWN: 5000,
};
var SOURCE_TERM = 1e-8;

function derivatives(n, C, rho) {
  var nSafe = Math.max(n, 0);
  var dn = ((rho - CONFIG.BETA_EFF) / CONFIG.LAMBDA_PROMPT) * nSafe;
  for (var i = 0; i < 6; i++) dn += CONFIG.LAMBDA_D[i] * C[i];
  dn += SOURCE_TERM;
  var dC = [];
  for (var j = 0; j < 6; j++) dC[j] = (CONFIG.BETA_I[j] / CONFIG.LAMBDA_PROMPT) * nSafe - CONFIG.LAMBDA_D[j] * C[j];
  return { dn: dn, dC: dC };
}

function stepRK4(n, C, rho, dt) {
  var k1 = derivatives(n, C, rho);
  var n2 = n + 0.5 * dt * k1.dn, C2 = C.map(function(c, i) { return c + 0.5 * dt * k1.dC[i]; });
  var k2 = derivatives(n2, C2, rho);
  var n3 = n + 0.5 * dt * k2.dn, C3 = C.map(function(c, i) { return c + 0.5 * dt * k2.dC[i]; });
  var k3 = derivatives(n3, C3, rho);
  var n4 = n + dt * k3.dn, C4 = C.map(function(c, i) { return c + dt * k3.dC[i]; });
  var k4 = derivatives(n4, C4, rho);
  var nNew = n + (dt / 6) * (k1.dn + 2 * k2.dn + 2 * k3.dn + k4.dn);
  var CNew = C.map(function(c, i) { return Math.max(c + (dt / 6) * (k1.dC[i] + 2 * k2.dC[i] + 2 * k3.dC[i] + k4.dC[i]), 0); });
  nNew = Math.max(nNew, 0);
  return { n: nNew, C: CNew };
}

function neutronStep(dt, state) {
  var r = state.r;
  var n = r.power / CONFIG.RATED_T;
  var C = r.precursors || [0, 0, 0, 0, 0, 0];
  var rho = r.reactivity || 0;
  var beta = CONFIG.BETA_EFF;
  var minSubByLambda = Math.ceil(dt * Math.max.apply(null, CONFIG.LAMBDA_D) / 0.2);
  var rhoRatio = Math.abs(rho) / beta;
  var subByRho = rhoRatio < 0.5 ? 1 : rhoRatio < 0.9 ? 4 : rhoRatio < 1.0 ? 16 : 64;
  var subSteps = Math.max(minSubByLambda, subByRho);
  var dtSub = dt / subSteps;
  var actualSteps = subSteps;
  for (var s = 0; s < actualSteps; s++) {
    var res = stepRK4(n, C, rho, dtSub);
    n = res.n; C = res.C;
    if (n * CONFIG.RATED_T > CONFIG.P_MELTDOWN) { n = CONFIG.P_MELTDOWN / CONFIG.RATED_T; break; }
  }
  r.power = n * CONFIG.RATED_T;
  r.precursors = C;
}

function makeState(power, reactivity) {
  return { r: { power: power, reactivity: reactivity, precursors: [0, 0, 0, 0, 0, 0] } };
}

// ============ 测试用例 ============

// Test 1: ρ = 0 稳态 — 功率不变
(function testSteadyState() {
  var state = makeState(3200, 0);
  for (var i = 0; i < 6; i++) {
    state.r.precursors[i] = (CONFIG.BETA_I[i] / (CONFIG.LAMBDA_D[i] * CONFIG.LAMBDA_PROMPT));
  }
  for (var t = 0; t < 20; t++) neutronStep(0.5, state);
  assertNear(state.r.power, 3200, 0.5, 'ρ=0 稳态: 功率保持 3200 MWt');
})();

// Test 2: 小阶跃 ρ = 0.001 (0.154\$) — 功率缓慢上升
(function testSmallStep() {
  var state = makeState(3200, 0.001);
  for (var i = 0; i < 6; i++) {
    state.r.precursors[i] = (CONFIG.BETA_I[i] / (CONFIG.LAMBDA_D[i] * CONFIG.LAMBDA_PROMPT));
  }
  neutronStep(0.5, state);
  assert(state.r.power > 3200, 'ρ=0.001 小阶跃: 功率上升 (>' + state.r.power.toFixed(1) + 'MWt)');
})();

// Test 3: 大阶跃 ρ = 0.005 (0.77\$) — 功率快速上升
(function testLargeStep() {
  var state = makeState(3200, 0.005);
  for (var i = 0; i < 6; i++) {
    state.r.precursors[i] = (CONFIG.BETA_I[i] / (CONFIG.LAMBDA_D[i] * CONFIG.LAMBDA_PROMPT));
  }
  for (var t = 0; t < 10; t++) neutronStep(0.25, state);
  assert(state.r.power > 4000, 'ρ=0.005 大阶跃: 功率大幅上升 (>' + state.r.power.toFixed(1) + 'MWt)');
})();

// Test 4: 瞬发临界 ρ = 0.0065 (1.0\$) — 功率指数爆炸
(function testPromptCritical() {
  var state = makeState(3200, 0.0065);
  for (var i = 0; i < 6; i++) {
    state.r.precursors[i] = (CONFIG.BETA_I[i] / (CONFIG.LAMBDA_D[i] * CONFIG.LAMBDA_PROMPT));
  }
  // 几秒内功率应飙升
  for (var t = 0; t < 5; t++) neutronStep(0.1, state);
  assert(state.r.power >= CONFIG.P_MELTDOWN || state.r.power > 4500, 'ρ=β 瞬发临界: 功率快速飙升 (>' + state.r.power.toFixed(1) + 'MWt)');
})();

// Test 5: 紧急停堆 ρ = -0.02 — 功率快速下降
(function testScram() {
  var state = makeState(3200, -0.02);
  for (var i = 0; i < 6; i++) {
    state.r.precursors[i] = (CONFIG.BETA_I[i] / (CONFIG.LAMBDA_D[i] * CONFIG.LAMBDA_PROMPT));
  }
  neutronStep(0.5, state);
  assert(state.r.power < 3200, 'ρ=-0.02 紧急停堆: 功率下降 (<' + state.r.power.toFixed(1) + 'MWt)');
})();

// Test 6: n 不为负
(function testNonNegative() {
  var state = makeState(10, -0.1);
  for (var t = 0; t < 20; t++) neutronStep(0.5, state);
  assert(state.r.power >= 0, '深度次临界: n ≥ 0 (power=' + state.r.power.toFixed(6) + ')');
})();

console.log('\nResults: ' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL > 0 ? 1 : 0);
