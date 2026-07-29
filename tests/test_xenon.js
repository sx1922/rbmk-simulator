// Xenon dynamics tests
// Run: node tests/test_xenon.js

var PASS = 0, FAIL = 0;

function assert(cond, msg) {
  if (cond) { console.log('[PASS] ' + msg); PASS++; }
  else { console.log('[FAIL] ' + msg); FAIL++; }
}

var CONFIG = {
  RATED_T: 3200,
  YIELD_XE: 0.003,
  YIELD_I: 0.061,
  LAMBDA_I: 2.87e-5,
  LAMBDA_XE: 2.09e-5,
  SIGMA_XE: 2.7e-18,
  FLUX_FACTOR: 1e13,
};

function xenonStep(dt, state) {
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
}

function makeState(power, iodine, xenon) {
  return { r: { power: power, iodine: iodine || 0, xenon: xenon || 0 } };
}

// Test 1: xenon builds up after power operation
(function testXenonBuildUp() {
  var state = makeState(3200);
  var dt = 3600; // 1 hour per step
  for (var i = 0; i < 24; i++) xenonStep(dt, state);
  assert(state.r.xenon > 0.01, 'Xenon builds up after 24h at full power (xe=' + state.r.xenon.toFixed(4) + ')');
})();

// Test 2: xenon decays after shutdown
(function testXenonDecay() {
  var state = makeState(3200);
  var dt = 3600;
  for (var i = 0; i < 48; i++) xenonStep(dt, state);
  var peakXe = state.r.xenon;
  // Shutdown
  state.r.power = 0;
  for (var i = 0; i < 48; i++) xenonStep(dt, state);
  assert(state.r.xenon < peakXe * 0.9, 'Xenon decays after shutdown (peak=' + peakXe.toFixed(4) + ' now=' + state.r.xenon.toFixed(4) + ')');
})();

// Test 3: xenon peaks then drops
(function testXenonPeakThenDrop() {
  var state = makeState(3200);
  var dt = 3600;
  var xenonHistory = [];
  for (var i = 0; i < 120; i++) xenonStep(dt, state);
  var plateau = state.r.xenon;
  // Shutdown and track
  state.r.power = 0;
  for (var i = 0; i < 200; i++) {
    xenonStep(dt, state);
    xenonHistory.push(state.r.xenon);
  }
  // Find peak index after shutdown
  var peakIdx = 0;
  for (var i = 1; i < xenonHistory.length; i++) {
    if (xenonHistory[i] > xenonHistory[peakIdx]) peakIdx = i;
  }
  var afterPeak = false;
  for (var i = peakIdx + 1; i < xenonHistory.length; i++) {
    if (xenonHistory[i] < xenonHistory[peakIdx]) { afterPeak = true; break; }
  }
  assert(afterPeak, 'Xenon peaks then drops after shutdown');
})();

console.log('\nResults: ' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL > 0 ? 1 : 0);
