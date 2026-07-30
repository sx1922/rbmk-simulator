// Protection system tests — 10 acceptance criteria
// Run: node tests/test_protection.js

var PASS = 0, FAIL = 0;

function assert(cond, msg) {
  if (cond) { console.log('  [PASS] ' + msg); PASS++; }
  else { console.log('  [FAIL] ' + msg); FAIL++; }
}

function assertNear(a, b, tol, msg) {
  if (tol === undefined) tol = 1e-6;
  var ok = Math.abs(a - b) < tol;
  (ok ? assert : assert)(ok, (msg || '') + ' (expected ' + (typeof b === 'number' ? b.toExponential(5) : b) + ', got ' + (typeof a === 'number' ? a.toExponential(5) : a) + ')');
}

function assertIn(a, lo, hi, msg) {
  var ok = a >= lo && a <= hi;
  (ok ? assert : assert)(ok, (msg || '') + ' (expected [' + lo + ', ' + hi + '], got ' + a.toFixed(4) + ')');
}

// ============ inlined protection.js ============

var C = {
  POWER_TRIP: 1.20,
  POWER_WARNING: 1.05,
  PERIOD_TRIP: 10.0,
  PERIOD_WARNING: 20.0,
  PERIOD_MIN_POWER: 0.01,
  PRESSURE_TRIP: 7.5e6,
  PRESSURE_WARNING: 7.0e6,
  PRESSURE_NOMINAL: 6.5e6,
  LEVEL_TRIP: 0.5,
  LEVEL_WARNING: 0.8,
  LEVEL_NOMINAL: 1.5,
  FLOW_TRIP: 0.70,
  FLOW_WARNING: 0.80,
  TEMP_TRIP: 350.0,
  TEMP_WARNING: 320.0,
  OPR_TRIP: 15,
  OPR_WARNING: 20,
  VOTING_CHANNELS: 3,
  VOTING_THRESHOLD: 2,
  TRIP_DELAY: 0.1,
  WARNING_DELAY: 1.0,
};

function createProtectionState() {
  var signalDefs = [
    { id: 'P1',  name: 'Power overpower',       threshold: C.POWER_TRIP,    bypassable: false },
    { id: 'P2',  name: 'Short period',          threshold: C.PERIOD_TRIP,   bypassable: false },
    { id: 'P3',  name: 'High steam pressure',   threshold: C.PRESSURE_TRIP, bypassable: true },
    { id: 'P4',  name: 'Low steam drum level',  threshold: C.LEVEL_TRIP,    bypassable: true },
    { id: 'P5',  name: 'Low coolant flow',      threshold: C.FLOW_TRIP,     bypassable: true },
    { id: 'P6',  name: 'High fuel exit temp',   threshold: C.TEMP_TRIP,     bypassable: true },
    { id: 'P7',  name: 'Manual AZ-5',          threshold: 1,               bypassable: false },
    { id: 'P8',  name: 'Power loss',           threshold: 1,               bypassable: false },
    { id: 'P9',  name: 'Seismic',              threshold: 0.5,             bypassable: false },
    { id: 'P10', name: 'OPR insufficient',      threshold: C.OPR_TRIP,      bypassable: true },
  ];
  var signals = {};
  for (var si = 0; si < signalDefs.length; si++) {
    var def = signalDefs[si];
    signals[def.id] = {
      id: def.id, name: def.name, tripped: false, warning: false,
      bypassed: false, bypassable: def.bypassable, value: 0,
      threshold: def.threshold, tripTime: -1,
      channelValues: [0, 0, 0], channelTrips: [false, false, false],
    };
  }
  return {
    signals: signals, az5Demand: false, az5DemandLatched: false,
    az5Cause: '', alarms: [], bypassCount: 0, protectionDisabled: false,
  };
}

function evaluateSignal(signal, value, config) {
  var tripThreshold = config.tripThreshold;
  var warnThreshold = config.warnThreshold;
  var direction = config.direction;
  var time = config.time;

  signal.value = value;
  var noise = function() { return (Math.random() - 0.5) * 0.001 * Math.abs(value || 1); };
  signal.channelValues = [value + noise(), value + noise(), value + noise()];

  for (var i = 0; i < 3; i++) {
    signal.channelTrips[i] = direction === 'high'
      ? signal.channelValues[i] >= tripThreshold
      : signal.channelValues[i] <= tripThreshold;
  }

  var tripCount = 0;
  for (var ci = 0; ci < 3; ci++) { if (signal.channelTrips[ci]) tripCount++; }
  var wasTripped = signal.tripped;
  signal.tripped = tripCount >= C.VOTING_THRESHOLD;
  if (signal.tripped && !wasTripped) signal.tripTime = time;

  signal.warning = direction === 'high'
    ? (value >= warnThreshold && !signal.tripped)
    : (value <= warnThreshold && !signal.tripped);
}

function stepProtection(state, dt, time, inputs) {
  if (state.protectionDisabled) { state.az5Demand = false; return state; }
  var alarms = [];

  // P1
  evaluateSignal(state.signals.P1, inputs.powerFrac, { tripThreshold: C.POWER_TRIP, warnThreshold: C.POWER_WARNING, direction: 'high', time: time, dt: dt });
  if (state.signals.P1.warning) alarms.push({ level: 'warning', id: 'P1', msg: 'Power ' + (inputs.powerFrac * 100).toFixed(1) + '% approaching limit' });

  // P2
  if (inputs.powerFrac > C.PERIOD_MIN_POWER) {
    evaluateSignal(state.signals.P2, inputs.period, { tripThreshold: C.PERIOD_TRIP, warnThreshold: C.PERIOD_WARNING, direction: 'low', time: time, dt: dt });
  } else { state.signals.P2.tripped = false; state.signals.P2.warning = false; }
  if (state.signals.P2.warning) alarms.push({ level: 'warning', id: 'P2', msg: 'Period ' + inputs.period.toFixed(1) + 's approaching limit' });

  // P3
  evaluateSignal(state.signals.P3, inputs.pressure, { tripThreshold: C.PRESSURE_TRIP, warnThreshold: C.PRESSURE_WARNING, direction: 'high', time: time, dt: dt });
  if (state.signals.P3.warning) alarms.push({ level: 'warning', id: 'P3', msg: 'Steam pressure ' + (inputs.pressure / 1e6).toFixed(2) + ' MPa high' });

  // P4
  evaluateSignal(state.signals.P4, inputs.waterLevel, { tripThreshold: C.LEVEL_TRIP, warnThreshold: C.LEVEL_WARNING, direction: 'low', time: time, dt: dt });
  if (state.signals.P4.warning) alarms.push({ level: 'warning', id: 'P4', msg: 'Steam drum level ' + inputs.waterLevel.toFixed(2) + ' m low' });

  // P5
  evaluateSignal(state.signals.P5, inputs.coolantFlow, { tripThreshold: C.FLOW_TRIP, warnThreshold: C.FLOW_WARNING, direction: 'low', time: time, dt: dt });
  if (state.signals.P5.warning) alarms.push({ level: 'warning', id: 'P5', msg: 'Coolant flow ' + (inputs.coolantFlow * 100).toFixed(1) + '% low' });

  // P6
  evaluateSignal(state.signals.P6, inputs.fuelExitTemp, { tripThreshold: C.TEMP_TRIP, warnThreshold: C.TEMP_WARNING, direction: 'high', time: time, dt: dt });
  if (state.signals.P6.warning) alarms.push({ level: 'warning', id: 'P6', msg: 'Fuel exit temp ' + inputs.fuelExitTemp.toFixed(1) + ' C high' });

  // P7
  if (inputs.manualAZ5) { state.signals.P7.tripped = true; state.signals.P7.tripTime = time; state.signals.P7.value = 1; }

  // P8
  if (inputs.powerLoss) { state.signals.P8.tripped = true; state.signals.P8.tripTime = time; state.signals.P8.value = 1; }

  // P9
  evaluateSignal(state.signals.P9, inputs.seismicG || 0, { tripThreshold: 0.5, warnThreshold: 0.3, direction: 'high', time: time, dt: dt });

  // P10
  evaluateSignal(state.signals.P10, inputs.oprRods, { tripThreshold: C.OPR_TRIP, warnThreshold: C.OPR_WARNING, direction: 'low', time: time, dt: dt });
  if (state.signals.P10.warning) alarms.push({ level: 'warning', id: 'P10', msg: 'OPR = ' + inputs.oprRods.toFixed(1) + ' rods, approaching limit' });
  if (state.signals.P10.tripped) alarms.push({ level: 'critical', id: 'P10', msg: 'OPR = ' + inputs.oprRods.toFixed(1) + ' rods < 15 rods! Violation!' });

  // Voting
  state.az5Demand = false; state.az5Cause = '';
  var tripSignals = [];
  var sigKeys = Object.keys(state.signals);
  for (var si = 0; si < sigKeys.length; si++) {
    var sig = state.signals[sigKeys[si]];
    if (sig.tripped && !sig.bypassed) tripSignals.push(sigKeys[si]);
  }
  if (tripSignals.length > 0) {
    state.az5Demand = true;
    state.az5DemandLatched = true;
    state.az5Cause = tripSignals.map(function(id) { return id + '(' + state.signals[id].name + ')'; }).join(' + ');
  }

  state.alarms = alarms;
  state.bypassCount = 0;
  for (var si2 = 0; si2 < sigKeys.length; si2++) {
    if (state.signals[sigKeys[si2]].bypassed) state.bypassCount++;
  }
  return state;
}

function resetAZ5Latch(state) {
  var activeTrips = [];
  var sigKeys = Object.keys(state.signals);
  for (var si = 0; si < sigKeys.length; si++) {
    var sig = state.signals[sigKeys[si]];
    if (sig.tripped && !sig.bypassed) activeTrips.push(sig.id);
  }
  if (activeTrips.length > 0) {
    return { success: false, message: 'Cannot reset: ' + activeTrips.length + ' still active: ' + activeTrips.join(', ') };
  }
  state.az5DemandLatched = false; state.az5Cause = '';
  for (var si2 = 0; si2 < sigKeys.length; si2++) { state.signals[sigKeys[si2]].tripped = false; state.signals[sigKeys[si2]].tripTime = -1; }
  return { success: true, message: 'AZ-5 latch reset' };
}

function assessProtectionSafety(state) {
  var messages = []; var score = 100;
  if (state.protectionDisabled) { score -= 50; messages.push('Protection system fully disabled! (-50)'); }
  if (state.bypassCount > 0) { var p = state.bypassCount * 10; score -= p; messages.push(state.bypassCount + ' bypassed (-' + p + ')'); }
  var ca = 0, wa = 0;
  for (var ai = 0; ai < state.alarms.length; ai++) {
    if (state.alarms[ai].level === 'critical') ca++;
    if (state.alarms[ai].level === 'warning') wa++;
  }
  if (ca > 0) { score -= ca * 15; messages.push(ca + ' critical alarm(s)'); }
  if (wa > 0) { score -= wa * 5; messages.push(wa + ' warning(s)'); }
  if (state.az5DemandLatched) { score -= 20; messages.push('AZ-5 triggered (' + state.az5Cause + ')'); }
  if (score < 0) score = 0;
  var level = score >= 80 ? 'normal' : score >= 60 ? 'caution' : score >= 40 ? 'warning' : score >= 20 ? 'critical' : 'catastrophic';
  if (messages.length === 0) messages.push('Protection system normal');
  return { level: level, score: score, messages: messages };
}

function bypassSignal(state, signalId, reason) {
  if (reason === undefined) reason = '';
  var signal = state.signals[signalId];
  if (!signal) return { success: false, message: 'Unknown signal: ' + signalId };
  if (!signal.bypassable) return { success: false, message: signalId + ' (' + signal.name + ') not bypassable' };
  signal.bypassed = true;
  updateBypassCount(state);
  return { success: true, message: signalId + ' bypassed. ' + (reason || '') };
}

function updateBypassCount(state) {
  state.bypassCount = 0;
  var keys = Object.keys(state.signals);
  for (var si = 0; si < keys.length; si++) {
    if (state.signals[keys[si]].bypassed) state.bypassCount++;
  }
}

function restoreSignal(state, signalId) {
  var signal = state.signals[signalId];
  if (!signal) return { success: false, message: 'Unknown: ' + signalId };
  signal.bypassed = false;
  updateBypassCount(state);
  return { success: true, message: signalId + ' restored' };
}

function setProtectionDisabled(state, disabled) {
  state.protectionDisabled = disabled;
  return { success: true, message: disabled ? 'disabled' : 'restored' };
}

function simulateChernobylBypassSequence(state) {
  var log = [];
  log.push(bypassSignal(state, 'P4', 'Turbine test'));
  log.push(bypassSignal(state, 'P3', 'Turbine test'));
  state.signals.P7.bypassed = true;
  updateBypassCount(state);
  log.push({ success: true, message: 'P7 physically bypassed' });
  return log;
}

// ============================================================
// T1: Normal operation
// ============================================================
console.log('\n=== T1: Normal operation ===');
(function() {
  var ps = createProtectionState();
  var dt = 0.1, time = 0;
  var inputs = {
    powerFrac: 1.0, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  };
  stepProtection(ps, dt, time, inputs);

  assert(!ps.az5Demand, 'az5Demand = false');
  assert(!ps.az5DemandLatched, 'az5DemandLatched = false');

  var signalIds = ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10'];
  for (var si = 0; si < signalIds.length; si++) {
    var sig = ps.signals[signalIds[si]];
    assert(!sig.tripped, signalIds[si] + ' not tripped');
    assert(!sig.warning, signalIds[si] + ' not warning');
  }

  assert(ps.alarms.length === 0, 'no alarms');

  var safety = assessProtectionSafety(ps);
  assert(safety.level === 'normal', 'safety level = normal (got ' + safety.level + ')');
  assert(safety.score === 100, 'safety score = 100 (got ' + safety.score + ')');

  console.log('  [INFO] all signals NORMAL, score=' + safety.score + ', level=' + safety.level);
})();

// ============================================================
// T2: Power overpower trip
// ============================================================
console.log('\n=== T2: Power overpower trip ===');
(function() {
  var ps = createProtectionState();
  var dt = 0.1, time = 0;
  var inputs = {
    powerFrac: 1.0, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  };

  // Raise power above 120%
  inputs.powerFrac = 1.25;
  stepProtection(ps, dt, time, inputs);

  assert(ps.signals.P1.tripped, 'P1 tripped');
  assert(ps.az5Demand, 'az5Demand = true');
  assert(ps.az5DemandLatched, 'az5DemandLatched = true');
  assert(ps.az5Cause.indexOf('P1') >= 0, 'az5Cause contains P1');

  // Power back to normal
  inputs.powerFrac = 1.0;
  stepProtection(ps, dt, time + 1, inputs);
  assert(!ps.signals.P1.tripped, 'P1 reset after power normal');
  assert(ps.az5DemandLatched, 'az5DemandLatched still true (latched)');

  // Explicit reset
  var r = resetAZ5Latch(ps);
  assert(r.success, 'resetAZ5Latch succeeds');
  assert(!ps.az5DemandLatched, 'az5DemandLatched = false after reset');

  console.log('  [INFO] P1 trip -> az5Demand=true -> reset=' + r.success);
})();

// ============================================================
// T3: Short period trip
// ============================================================
console.log('\n=== T3: Short period trip ===');
(function() {
  var ps = createProtectionState();
  var dt = 0.1, time = 0;
  var inputs = {
    powerFrac: 0.5, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  };

  // Short period
  inputs.period = 8;
  stepProtection(ps, dt, time, inputs);
  assert(ps.signals.P2.tripped, 'P2 tripped (8 < 10)');
  assert(ps.az5Demand, 'az5Demand = true');

  // Low power: period not evaluated
  var ps2 = createProtectionState();
  inputs2 = {
    powerFrac: 0.005, period: 5, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  };
  stepProtection(ps2, dt, time, inputs2);
  assert(!ps2.signals.P2.tripped, 'P2 not evaluated at low power');

  console.log('  [INFO] P2 tripped at period=8s, not evaluated at power=0.005');
})();

// ============================================================
// T4: 2/3 voting
// ============================================================
console.log('\n=== T4: 2/3 voting ===');
(function() {
  // Test at value clearly above threshold (noise < 0.05% of value)
  var ps = createProtectionState();
  var dt = 0.1, time = 0;
  var inputs = {
    powerFrac: 1.30, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 40,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  };
  stepProtection(ps, dt, time, inputs);

  // With value=1.30, threshold=1.20, noise=±0.00065, all channels >= 1.19935
  // Min channel value: 1.30 - 0.00065 = 1.29935 > 1.20 → all 3 trip
  // 3 >= 2 → tripped
  assert(ps.signals.P1.tripped, 'P1 tripped at 1.30 (3/3 channels)');
  assert(ps.signals.P1.channelTrips[0], 'channel 0 trips');
  assert(ps.signals.P1.channelTrips[1], 'channel 1 trips');
  assert(ps.signals.P1.channelTrips[2], 'channel 2 trips');

  // Test at value clearly below threshold
  var ps2 = createProtectionState();
  inputs.powerFrac = 0.50;
  stepProtection(ps2, dt, time, inputs);

  // Max channel value: 0.50 + 0.00025 = 0.50025 < 1.20 → 0/3 trip
  assert(!ps2.signals.P1.tripped, 'P1 not tripped at 0.50 (0/3 channels)');

  // Test near threshold: with 3 independent samples at exact threshold,
  // each channel has ~50/50 chance. Run 20 iterations to see variation.
  var tripCount = 0;
  for (var iter = 0; iter < 20; iter++) {
    var pt = createProtectionState();
    evaluateSignal(pt.signals.P1, 1.20, { tripThreshold: 1.20, warnThreshold: 1.05, direction: 'high', time: 0, dt: 0.1 });
    if (pt.signals.P1.tripped) tripCount++;
  }
  // With 20 samples at exact threshold, we expect ~10 trips (range 3-17 likely)
  assertIn(tripCount, 2, 18, 'at threshold, trips ' + tripCount + '/20 (expected ~10)');

  console.log('  [INFO] voting: 3/3 at 1.30, 0/3 at 0.50, ' + tripCount + '/20 at threshold');
})();

// ============================================================
// T5: Bypass functionality
// ============================================================
console.log('\n=== T5: Bypass functionality ===');
(function() {
  var ps = createProtectionState();
  var dt = 0.1, time = 0;

  // Bypass P3
  var r1 = bypassSignal(ps, 'P3', 'test');
  assert(r1.success, 'bypass P3 succeeds');
  assert(ps.signals.P3.bypassed, 'P3.bypassed = true');

  // P3 triggered but bypassed -> no AZ-5 from P3
  var inputs = {
    powerFrac: 1.0, period: 100, pressure: 8.0e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  };
  stepProtection(ps, dt, time, inputs);
  assert(!ps.az5Demand, 'P3 bypassed -> no AZ-5 from P3 only');

  // Non-bypassable signals
  var r2 = bypassSignal(ps, 'P1', 'test');
  assert(!r2.success, 'P1 bypass fails (not bypassable)');
  assert(!ps.signals.P1.bypassed, 'P1 remains not bypassed');

  var r3 = bypassSignal(ps, 'P2', 'test');
  assert(!r3.success, 'P2 bypass fails (not bypassable)');
  assert(!ps.signals.P2.bypassed, 'P2 remains not bypassed');

  // Restore P3
  var r4 = restoreSignal(ps, 'P3');
  assert(r4.success, 'restore P3 succeeds');
  assert(!ps.signals.P3.bypassed, 'P3.bypassed = false');

  console.log('  [INFO] bypassable: P3=true (ok), P1=false (ok), P2=false (ok)');
})();

// ============================================================
// T6: Protection fully disabled
// ============================================================
console.log('\n=== T6: Protection fully disabled ===');
(function() {
  var ps = createProtectionState();
  var dt = 0.1, time = 0;

  setProtectionDisabled(ps, true);
  // Even with extreme overpower, no protection
  var inputs = {
    powerFrac: 2.0, period: 2, pressure: 12e6, waterLevel: 0.1,
    coolantFlow: 0.3, fuelExitTemp: 600, oprRods: 5,
    manualAZ5: false, powerLoss: false, seismicG: 0.8,
  };
  stepProtection(ps, dt, time, inputs);
  assert(!ps.az5Demand, 'disabled: no AZ-5 even at powerFrac=2.0');

  var safety = assessProtectionSafety(ps);
  assert(safety.score <= 50, 'safety score <= 50 (got ' + safety.score + ')');

  // Restore
  setProtectionDisabled(ps, false);
  stepProtection(ps, dt, time + 1, { powerFrac: 1.0, period: 100, pressure: 6.5e6, waterLevel: 1.5, coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30, manualAZ5: false, powerLoss: false, seismicG: 0 });
  assert(!ps.az5Demand, 'restored: no AZ-5 at normal conditions');

  console.log('  [INFO] disabled: az5Demand=' + ps.az5Demand + ', score=' + safety.score);
})();

// ============================================================
// T7: Multiple signals simultaneous
// ============================================================
console.log('\n=== T7: Multiple signals simultaneous ===');
(function() {
  var ps = createProtectionState();
  var dt = 0.1, time = 0;
  var inputs = {
    powerFrac: 1.3, period: 5, pressure: 8.0e6, waterLevel: 0.3,
    coolantFlow: 0.5, fuelExitTemp: 380, oprRods: 10,
    manualAZ5: false, powerLoss: false, seismicG: 0.6,
  };
  stepProtection(ps, dt, time, inputs);

  assert(ps.signals.P1.tripped, 'P1 tripped');
  assert(ps.signals.P2.tripped, 'P2 tripped');
  assert(ps.signals.P3.tripped, 'P3 tripped');
  assert(ps.signals.P4.tripped, 'P4 tripped');
  assert(ps.signals.P5.tripped, 'P5 tripped');
  assert(ps.signals.P6.tripped, 'P6 tripped');
  assert(ps.signals.P9.tripped, 'P9 tripped');
  assert(ps.signals.P10.tripped, 'P10 tripped');
  assert(ps.az5Demand, 'az5Demand = true');
  assert(ps.az5Cause.indexOf('P1') >= 0, 'az5Cause contains P1');
  assert(ps.az5Cause.indexOf('P3') >= 0, 'az5Cause contains P3');

  console.log('  [INFO] ' + ps.az5Cause.split(' + ').length + ' signals tripped: ' + ps.az5Cause);
})();

// ============================================================
// T8: Chernobyl scenario
// ============================================================
console.log('\n=== T8: Chernobyl scenario ===');
(function() {
  var ps = createProtectionState();
  var dt = 0.1, time = 0;

  // Normal: score = 100
  var s1 = assessProtectionSafety(ps);
  assert(s1.score === 100, 'initial score = 100');

  // Bypass sequence
  simulateChernobylBypassSequence(ps);
  assert(ps.signals.P3.bypassed, 'P3 bypassed');
  assert(ps.signals.P4.bypassed, 'P4 bypassed');
  assert(ps.signals.P7.bypassed, 'P7 bypassed');
  assert(ps.bypassCount === 3, 'bypassCount = 3 (got ' + ps.bypassCount + ')');

  var s2 = assessProtectionSafety(ps);
  // score = 100 - 30 (bypasses) = 70
  assert(s2.score === 70, 'score = 70 after bypasses (got ' + s2.score + ')');

  // P1 is non-bypassable: even in Chernobyl, overpower would still trip
  var inputs = {
    powerFrac: 1.5, period: 100, pressure: 8.0e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  };
  stepProtection(ps, dt, time, inputs);
  assert(ps.signals.P1.tripped, 'P1 still triggers (non-bypassable)');
  assert(ps.az5Demand, 'az5Demand = true from P1');

  // Key validation: P1 and P2 cannot be bypassed (safety floor)
  var rb1 = bypassSignal(ps, 'P1', '');
  assert(!rb1.success, 'P1 cannot be bypassed');
  var rb2 = bypassSignal(ps, 'P2', '');
  assert(!rb2.success, 'P2 cannot be bypassed');

  console.log('  [INFO] bypassed=' + ps.bypassCount + ', score=' + s2.score + ', P1-bypass=' + rb1.success + '(expected false)');
})();

// ============================================================
// T9: Reset logic
// ============================================================
console.log('\n=== T9: Reset logic ===');
(function() {
  var ps = createProtectionState();
  var dt = 0.1, time = 0;
  var inputs = {
    powerFrac: 1.25, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  };
  stepProtection(ps, dt, time, inputs);
  assert(ps.az5DemandLatched, 'latched after trip');

  // Try reset while still tripped
  var r1 = resetAZ5Latch(ps);
  assert(!r1.success, 'reset fails while P1 still tripped');

  // Clear the condition
  inputs.powerFrac = 1.0;
  stepProtection(ps, dt, time + 1, inputs);
  assert(!ps.signals.P1.tripped, 'P1 no longer tripped');

  var r2 = resetAZ5Latch(ps);
  assert(r2.success, 'reset succeeds after condition cleared');
  assert(!ps.az5DemandLatched, 'latched cleared');
  assert(ps.az5Cause === '', 'cause cleared');

  console.log('  [INFO] reset=' + r2.success + ' (expected: true)');
})();

// ============================================================
// T10: Alarm classification
// ============================================================
console.log('\n=== T10: Alarm classification ===');
(function() {
  // Warning: powerFrac between 1.05 and 1.20
  var ps1 = createProtectionState();
  stepProtection(ps1, 0.1, 0, {
    powerFrac: 1.06, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  });
  assert(ps1.signals.P1.warning, 'P1 warning at 106%');
  assert(!ps1.signals.P1.tripped, 'P1 not tripped at 106%');
  assert(ps1.alarms.length > 0, 'alarms generated');
  var hasP1Warning = false;
  for (var ai = 0; ai < ps1.alarms.length; ai++) {
    if (ps1.alarms[ai].id === 'P1') hasP1Warning = true;
  }
  assert(hasP1Warning, 'P1 warning in alarms');

  // Critical: powerFrac = 1.21 (> 1.20)
  var ps2 = createProtectionState();
  stepProtection(ps2, 0.1, 0, {
    powerFrac: 1.21, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  });
  assert(ps2.signals.P1.tripped, 'P1 tripped at 121%');
  assert(!ps2.signals.P1.warning, 'P1 no warning when tripped');

  // Period warning: 15s (between 10 and 20)
  var ps3 = createProtectionState();
  stepProtection(ps3, 0.1, 0, {
    powerFrac: 0.5, period: 15, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  });
  assert(ps3.signals.P2.warning, 'P2 warning at period=15s');
  assert(!ps3.signals.P2.tripped, 'P2 not tripped at period=15s');

  // Period critical: 8s (< 10)
  var ps4 = createProtectionState();
  stepProtection(ps4, 0.1, 0, {
    powerFrac: 0.5, period: 8, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 30,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  });
  assert(ps4.signals.P2.tripped, 'P2 tripped at period=8s');

  // OPR warning: 18 rods (between 15 and 20)
  var ps5 = createProtectionState();
  stepProtection(ps5, 0.1, 0, {
    powerFrac: 1.0, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 18,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  });
  assert(ps5.signals.P10.warning, 'P10 warning at OPR=18');
  assert(!ps5.signals.P10.tripped, 'P10 not tripped at OPR=18');

  // OPR critical: 12 rods (< 15)
  var ps6 = createProtectionState();
  stepProtection(ps6, 0.1, 0, {
    powerFrac: 1.0, period: 100, pressure: 6.5e6, waterLevel: 1.5,
    coolantFlow: 1.0, fuelExitTemp: 285, oprRods: 12,
    manualAZ5: false, powerLoss: false, seismicG: 0,
  });
  assert(ps6.signals.P10.tripped, 'P10 tripped at OPR=12');

  console.log('  [INFO] all alarm levels correct');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n========== Acceptance Summary ==========');
console.log('Passed: ' + PASS + ', Failed: ' + FAIL);
console.log('Threshold: 10/10 passed = ACCEPTED');
if (FAIL === 0) {
  console.log('ACCEPTED! 10/10 passed');
} else {
  console.log('REJECTED: ' + FAIL + ' tests failed');
}
process.exit(FAIL > 0 ? 1 : 0);
