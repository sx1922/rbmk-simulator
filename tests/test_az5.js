// AZ-5 emergency scram tests
// Run: node tests/test_az5.js

var PASS = 0, FAIL = 0;

function assert(cond, msg) {
  if (cond) { console.log('[PASS] ' + msg); PASS++; }
  else { console.log('[FAIL] ' + msg); FAIL++; }
}

var CONFIG = {
  NUM_RODS: 211,
  MELT_T: 2800,
};

function az5Fire(state) {
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
}

function makeState(voidFrac, power, stateName) {
  return {
    r: {
      rods: new Array(CONFIG.NUM_RODS).fill(0),
      void: voidFrac || 0,
      power: power || 0,
      az5Phase: 0,
      az5Timer: 0,
      state: stateName || 'POWER',
    }
  };
}

// Test 1: normal scram (low void, low power) -> OK
(function testNormalScram() {
  var state = makeState(0.1, 1000);
  var result = az5Fire(state);
  assert(result === 'OK', 'Normal scram: returns OK (result=' + result + ')');
  assert(state.r.rods[0] === 100, 'Normal scram: all rods inserted');
  assert(state.r.az5Phase === 1, 'Normal scram: phase set to 1');
})();

// Test 2: scram with high void and power -> SPIKE
(function testHighVoidSpike() {
  var state = makeState(0.5, 2500);
  var result = az5Fire(state);
  assert(result === 'SPIKE', 'High void scram: returns SPIKE (result=' + result + ')');
})();

// Test 3: scram from shutdown -> no effect (already at phase !== 0)
(function testScramFromShutdown() {
  var state = makeState(0, 0, 'SHUTDOWN');
  state.r.az5Phase = 1; // already scrammed
  var result = az5Fire(state);
  assert(result === 'OK', 'Scram from shutdown: returns OK (result=' + result + ')');
})();

// Test 3b: extreme void+power causes explosion
(function testExtremeSpikeExplosion() {
  var state = makeState(0.6, 3000);
  var result = az5Fire(state);
  assert(result === 'SPIKE' && state.r.state === 'EXPLOSION', 'Extreme spike: results in EXPLOSION (state=' + state.r.state + ')');
})();

console.log('\nResults: ' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL > 0 ? 1 : 0);
