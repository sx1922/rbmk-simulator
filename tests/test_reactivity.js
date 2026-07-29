// Reactivity balance tests
// Run: node tests/test_reactivity.js

var PASS = 0, FAIL = 0;

function assert(cond, msg) {
  if (cond) { console.log('[PASS] ' + msg); PASS++; }
  else { console.log('[FAIL] ' + msg); FAIL++; }
}

var CONFIG = {
  NUM_RODS: 211,
  ALPHA_FUEL: -2.4e-5,
  ALPHA_VOID: 2.8e-4,
};

function computeReactivity(state) {
  var rho = 0;
  for (var i = 0; i < CONFIG.NUM_RODS; i++) {
    rho += -(state.r.rods[i] / 100) * 0.0004;
  }
  rho += CONFIG.ALPHA_VOID * state.r.void * 100;
  rho += CONFIG.ALPHA_FUEL * (state.r.fuelT - 300);
  rho += -0.001 * state.r.xenon / (1 + state.r.xenon);
  rho += state.r.refuelBonus || 0;
  return rho;
}

function makeState(rodsPct, voidFrac, fuelT, xenon) {
  return {
    r: {
      rods: new Array(CONFIG.NUM_RODS).fill(rodsPct),
      void: voidFrac || 0,
      fuelT: fuelT || 300,
      xenon: xenon || 0,
      refuelBonus: 0,
    }
  };
}

// Test 1: all rods inserted gives negative reactivity
(function testAllRodsNegative() {
  var state = makeState(100, 0, 300, 0);
  var rho = computeReactivity(state);
  assert(rho < 0, 'All rods inserted: reactivity is negative (rho=' + rho.toFixed(4) + ')');
})();

// Test 2: positive void coefficient (RBMK) gives positive reactivity with void
(function testPositiveVoid() {
  var state = makeState(0, 0.5, 300, 0);
  var rho = computeReactivity(state);
  assert(rho > 0.005, 'Positive void coefficient: reactivity is positive (rho=' + rho.toFixed(4) + ')');
})();

// Test 3: xenon gives negative reactivity
(function testXenonNegative() {
  var state = makeState(0, 0, 300, 0.5);
  var rho = computeReactivity(state);
  assert(rho < 0, 'Xenon poisoning: reactivity is negative (rho=' + rho.toFixed(4) + ')');
})();

console.log('\nResults: ' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL > 0 ? 1 : 0);
