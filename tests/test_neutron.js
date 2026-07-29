// Neutron kinetics tests — inline mock for CONFIG and STATE
// Run: node tests/test_neutron.js

var PASS = 0, FAIL = 0;

function assert(cond, msg) {
  if (cond) { console.log('[PASS] ' + msg); PASS++; }
  else { console.log('[FAIL] ' + msg); FAIL++; }
}

var CONFIG = {
  RATED_T: 3200,
  MELT_T: 2800,
  NUM_RODS: 211,
  LAMBDA: 1e-4,
  BETA_EFF: 0.0065,
  LAMBDA_D: [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01],
  BETA_I: [0.00021, 0.00141, 0.00127, 0.00255, 0.00074, 0.00027],
};

function neutronStep(dt, state) {
  var P = state.r.power;
  var rho = state.r.reactivity;
  var beta = CONFIG.BETA_EFF;
  var Lambda = CONFIG.LAMBDA;
  if (!state.r.precursors) state.r.precursors = [0, 0, 0, 0, 0, 0];
  var C = state.r.precursors;
  var substeps = 10;
  var h = dt / substeps;
  for (var s = 0; s < substeps; s++) {
    var sumLambdaC = 0;
    for (var i = 0; i < 6; i++) sumLambdaC += CONFIG.LAMBDA_D[i] * C[i];
    var dP = ((rho - beta) / Lambda * P + sumLambdaC) * h;
    for (var j = 0; j < 6; j++) {
      C[j] += (CONFIG.BETA_I[j] / Lambda * P - CONFIG.LAMBDA_D[j] * C[j]) * h;
    }
    P += dP;
    if (P < 0) P = 0;
  }
  state.r.power = P;
}

function makeState(power, reactivity) {
  return { r: { power: power, reactivity: reactivity, precursors: [0, 0, 0, 0, 0, 0] } };
}

// Test 1: positive reactivity (super-prompt-critical) causes power increase
(function testPositiveReactivity() {
  var state = makeState(100, 0.01);
  for (var i = 0; i < 50; i++) neutronStep(0.5, state);
  assert(state.r.power > 500, 'Positive reactivity (rho > beta): power increases significantly (power=' + state.r.power.toFixed(1) + ')');
})();

// Test 2: negative reactivity causes initial power drop
(function testNegativeReactivity() {
  var state = makeState(3200, -0.002);
  neutronStep(0.5, state);
  assert(state.r.power < 3200, 'Negative reactivity: power drops from initial (from 3200 to ' + state.r.power.toFixed(1) + ')');
})();

// Test 3: zero-reactivity power stays finite (no instant divergence/collapse)
(function testZeroReactivity() {
  var state = makeState(3200, 0);
  for (var i = 0; i < 6; i++) {
    state.r.precursors[i] = (CONFIG.BETA_I[i] * 3200) / (CONFIG.LAMBDA_D[i] * CONFIG.LAMBDA);
  }
  for (var i = 0; i < 20; i++) neutronStep(0.5, state);
  assert(state.r.power > 0 && isFinite(state.r.power), 'Zero reactivity: power stays finite and positive (power=' + state.r.power.toFixed(1) + ')');
})();

console.log('\nResults: ' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL > 0 ? 1 : 0);
