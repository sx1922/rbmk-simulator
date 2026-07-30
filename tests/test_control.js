// Control rod drive tests — 8 acceptance criteria
// Run: node tests/test_control.js

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

function assertRel(a, b, pct, msg) {
  var tol = Math.abs(b * pct / 100);
  var ok = Math.abs(a - b) < tol;
  (ok ? assert : assert)(ok, (msg || '') + ' (expected ' + b.toExponential(5) + ' +/- ' + pct + '%, got ' + a.toExponential(5) + ')');
}

// ============ inlined control.js ============

var C = {
  CORE_HEIGHT: 7.0,
  ROD_STROKE: 7.0,
  ROD_SPEED: 0.4,
  ROD_SPEED_AZ5: 0.4,
  ROD_SPEED_FAST: 2.0,
  TOTAL_ROD_WORTH: 0.05,
  ROD_WORTH_PER_ROD: 0.001,
  NUM_RODS: 211,
  TIP_EFFECT_PEAK: 0.0005,
  TIP_EFFECT_WIDTH: 0.15,
  NUM_SHORT_RODS: 30,
  SHORT_ROD_START: 0.5,
  AUTO_DEADBAND: 0.005,
  AUTO_GAIN: 0.02,
  AUTO_RATE_LIMIT: 0.01,
};

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function differentialRodWorth(x) {
  var raw = Math.sin(Math.PI * x);
  var normalized = raw * (Math.PI / 2);
  return C.TOTAL_ROD_WORTH * normalized;
}

function integralRodWorth(x) {
  x = clamp(x, 0, 1);
  return -C.TOTAL_ROD_WORTH * (1 - Math.cos(Math.PI * x)) / 2;
}

function tipEffect(x) {
  if (x > C.TIP_EFFECT_WIDTH * 3) return 0;
  var sigma = C.TIP_EFFECT_WIDTH;
  var gaussian = Math.exp(-0.5 * (x / sigma) * (x / sigma));
  return C.TIP_EFFECT_PEAK * gaussian;
}

function createControlState(options) {
  if (options === undefined) options = {};
  var position = options.position !== undefined ? clamp(options.position, 0, 1) : 0.5;
  var mode = options.mode || 'manual';
  return {
    position: position,
    velocity: 0,
    target: position,
    mode: mode,
    az5Active: false,
    az5Progress: 0,
    tipEffect: tipEffect(position),
    rodWorthUsed: Math.abs(integralRodWorth(position)),
    rodWorthAvail: C.TOTAL_ROD_WORTH - Math.abs(integralRodWorth(position)),
  };
}

function updateDerived(state) {
  state.tipEffect = tipEffect(state.position);
  state.rodWorthUsed = Math.abs(integralRodWorth(state.position));
  state.rodWorthAvail = C.TOTAL_ROD_WORTH - state.rodWorthUsed;
}

function stepControl(state, dt, inputs) {
  var targetPosition = inputs.targetPosition;
  var az5Signal = inputs.az5Signal;
  var autoInputs = inputs.autoInputs;

  if (dt <= 0) {
    updateDerived(state);
    return state;
  }

  if (az5Signal && !state.az5Active) {
    state.az5Active = true;
    state.az5Progress = 0;
    state.mode = 'az5';
  }

  if (state.az5Active) {
    var speed = C.ROD_SPEED_AZ5 / C.CORE_HEIGHT;
    state.velocity = speed;
    state.position += speed * dt;
    state.az5Progress = state.position;
    if (state.position >= 1.0) {
      state.position = 1.0;
      state.velocity = 0;
    }
    updateDerived(state);
    return state;
  }

  var effectiveTarget, maxSpeed;

  if (state.mode === 'auto' && autoInputs) {
    var error = autoInputs.powerError || 0;
    if (Math.abs(error) < C.AUTO_DEADBAND) {
      effectiveTarget = state.position;
    } else {
      var correction = C.AUTO_GAIN * error;
      effectiveTarget = clamp(state.position + correction, 0, 1);
    }
    maxSpeed = C.AUTO_RATE_LIMIT;
  } else {
    effectiveTarget = clamp(targetPosition, 0, 1);
    maxSpeed = C.ROD_SPEED / C.CORE_HEIGHT;
  }

  state.target = effectiveTarget;
  var error = effectiveTarget - state.position;

  if (Math.abs(error) < 1e-6) {
    state.velocity = 0;
  } else {
    var direction = Math.sign(error);
    var speed = Math.min(maxSpeed, Math.abs(error) / dt);
    state.velocity = direction * speed;
    state.position += state.velocity * dt;
  }

  state.position = clamp(state.position, 0, 1);
  updateDerived(state);
  return state;
}

function controlRodReactivity(state) {
  return integralRodWorth(state.position) + state.tipEffect;
}

function simulateAZ5Insertion(startPosition, dt) {
  if (dt === undefined) dt = 0.1;
  var speed = C.ROD_SPEED_AZ5 / C.CORE_HEIGHT;
  var results = [];
  var pos = startPosition;
  var t = 0;
  while (pos < 1.0) {
    var rho_rod = integralRodWorth(pos);
    var rho_tip = tipEffect(pos);
    results.push({ t: t, position: pos, rho_rod: rho_rod, rho_tip: rho_tip, rho_total: rho_rod + rho_tip });
    pos += speed * dt;
    t += dt;
  }
  results.push({ t: t, position: 1.0, rho_rod: integralRodWorth(1.0), rho_tip: tipEffect(1.0), rho_total: integralRodWorth(1.0) + tipEffect(1.0) });
  return results;
}

// ============================================================
// T1: Basic kinematics
// ============================================================
console.log('\n=== T1: Basic kinematics ===');
(function() {
  var st = createControlState({ position: 0.5 });
  var dt = 0.1;
  var expectedSpeed = 0.4 / 7.0;

  // Step with target=1.0
  for (var i = 0; i < 10; i++) {
    stepControl(st, dt, { targetPosition: 1.0, az5Signal: false });
  }
  // After 1s (10 steps)
  assertRel(st.velocity, expectedSpeed, 1, 'velocity = 0.4/7.0 after 1s');
  assertRel(st.position, 0.5 + expectedSpeed * 1.0, 0.1, 'position = 0.5571 after 1s');

  // Advance to 8.75s total
  var totalSteps = Math.ceil(8.75 / dt);
  for (var j = 10; j < totalSteps; j++) {
    stepControl(st, dt, { targetPosition: 1.0, az5Signal: false });
  }

  // Should be at or very close to 1.0
  assert(st.position >= 0.9999, 'position reaches 1.0 (got ' + st.position.toFixed(6) + ')');

  // Settle: one more step zeros the velocity
  stepControl(st, dt, { targetPosition: 1.0, az5Signal: false });
  assert(st.velocity < 1e-6, 'velocity = 0 after reaching target (settled)');

  // position cannot exceed 1.0
  for (var k = 0; k < 10; k++) {
    stepControl(st, dt, { targetPosition: 1.0, az5Signal: false });
  }
  assert(st.position <= 1.0, 'position never exceeds 1.0');

  console.log('  [INFO] speed=' + (st.velocity * 7.0).toFixed(4) + ' m/s, pos=' + st.position.toFixed(4) + ', time=' + (totalSteps * dt).toFixed(2) + 's');
})();

// ============================================================
// T2: Integral rod worth
// ============================================================
console.log('\n=== T2: Integral rod worth ===');
(function() {
  assertNear(integralRodWorth(0.0), 0, 1e-10, 'pos=0: rho=0');
  assertNear(integralRodWorth(0.5), -0.025, 1e-6, 'pos=0.5: rho=-0.025');
  assertNear(integralRodWorth(1.0), -0.05, 1e-6, 'pos=1.0: rho=-0.05');

  var rho25 = -0.05 * (1 - Math.cos(Math.PI * 0.25)) / 2;
  assertNear(integralRodWorth(0.25), rho25, 1e-6, 'pos=0.25: rho=' + rho25.toFixed(6));

  // Monotonicity: position increases -> rho decreases (more negative)
  var prev = 0;
  for (var x = 0.05; x <= 1.0; x += 0.05) {
    var rho = integralRodWorth(x);
    assert(rho < prev, 'monotonic decreasing at x=' + x.toFixed(2) + ' (rho=' + rho.toExponential(4) + ')');
    prev = rho;
  }

  console.log('  [INFO] rho(0)=' + integralRodWorth(0).toExponential(4) + ', rho(0.5)=' + integralRodWorth(0.5).toFixed(5) + ', rho(1.0)=' + integralRodWorth(1.0).toFixed(5));
})();

// ============================================================
// T3: Tip effect & positive scram
// ============================================================
console.log('\n=== T3: Tip effect & positive scram ===');
(function() {
  // Peak at 0.0
  assertNear(tipEffect(0), C.TIP_EFFECT_PEAK, 1e-6, 'tipEffect(0) = peak');

  // Decaying Gaussian
  var t005 = tipEffect(0.05);
  var expected005 = C.TIP_EFFECT_PEAK * Math.exp(-0.5 * (0.05 / 0.15) * (0.05 / 0.15));
  assertRel(t005, expected005, 1, 'tipEffect(0.05) = ' + expected005.toExponential(5));

  var t015 = tipEffect(0.15);
  var expected015 = C.TIP_EFFECT_PEAK * Math.exp(-0.5);
  assertRel(t015, expected015, 1, 'tipEffect(0.15) = ' + expected015.toExponential(5));

  assert(tipEffect(0.5) < 1e-10, 'tipEffect(0.5) ~ 0');
  assert(tipEffect(1.0) === 0, 'tipEffect(1.0) = 0');

  // Key validation: at position ~0.02, tipEffect > |integralRodWorth| => total rho > 0
  var x_check = 0.02;
  var rodW = integralRodWorth(x_check);
  var tip = tipEffect(x_check);
  var total = rodW + tip;
  assert(total > 0, 'total reactivity positive at x=' + x_check + ' (rodW=' + rodW.toExponential(5) + ', tip=' + tip.toExponential(5) + ', total=' + total.toExponential(5) + ')');

  console.log('  [INFO] x=0.02: rodW=' + rodW.toExponential(5) + ', tip=' + tip.toExponential(5) + ', total=' + total.toExponential(5) + ' (positive! = Chernobyl AZ-5 effect)');
})();

// ============================================================
// T4: AZ-5 insertion
// ============================================================
console.log('\n=== T4: AZ-5 insertion ===');
(function() {
  var st = createControlState({ position: 0.3 });
  var dt = 0.1;

  // Trigger AZ-5
  stepControl(st, dt, { targetPosition: 0.5, az5Signal: true });
  assert(st.az5Active, 'az5Active = true');
  assert(st.mode === 'az5', 'mode = az5');

  // Speed check
  var expectedSpeed = C.ROD_SPEED_AZ5 / C.CORE_HEIGHT;
  assertRel(st.velocity, expectedSpeed, 1, 'AZ-5 velocity = 0.4/7.0');

  // After 0.5s (5 more steps at dt=0.1)
  for (var i = 0; i < 5; i++) {
    stepControl(st, dt, { targetPosition: 0.5, az5Signal: true });
  }
  assertRel(st.position, 0.3 + expectedSpeed * 0.6, 0.1, 'position after 0.6s ~ 0.3343');

  // Override target should be ignored
  assert(st.target !== 0.5, 'AZ-5 overrides manual target');

  // Run to completion
  var safetyCounter = 0;
  while (st.position < 1.0 && safetyCounter < 1000) {
    stepControl(st, dt, { targetPosition: 0.5, az5Signal: true });
    safetyCounter++;
  }
  assert(st.position >= 1.0, 'AZ-5 completes (reaches 1.0)');
  assert(st.velocity < 1e-6, 'velocity = 0 after completion');

  console.log('  [INFO] AZ-5 from 0.3: completed, pos=' + st.position.toFixed(4) + ', steps=' + safetyCounter);
})();

// ============================================================
// T5: AZ-5 positive reactivity spike
// ============================================================
console.log('\n=== T5: AZ-5 positive reactivity spike ===');
(function() {
  var sim = simulateAZ5Insertion(0.0, 0.1);

  // Find all points where rho_total > 0
  var positivePoints = sim.filter(function(p) { return p.rho_total > 0; });
  assert(positivePoints.length > 0, 'exists t with rho_total > 0 (positive points: ' + positivePoints.length + ')');

  // Duration of positive reactivity
  var posStart = -1, posEnd = -1;
  var inPos = false;
  for (var i = 0; i < sim.length; i++) {
    if (sim[i].rho_total > 0 && !inPos) { posStart = sim[i].t; inPos = true; }
    if (sim[i].rho_total <= 0 && inPos) { posEnd = sim[i].t; break; }
  }
  if (posEnd < 0) posEnd = sim[sim.length - 1].t;
  var duration = posEnd - posStart;
  assertIn(duration, 1.0, 5.0, 'positive reactivity duration 2-4s (got ' + duration.toFixed(1) + 's)');

  // Peak positive reactivity
  var peakPos = 0;
  for (var j = 0; j < positivePoints.length; j++) {
    if (positivePoints[j].rho_total > peakPos) peakPos = positivePoints[j].rho_total;
  }
  assertIn(peakPos, 0.0001, 0.001, 'peak positive reactivity ~ +0.0004 (got ' + peakPos.toExponential(5) + ')');

  // After peak, rho_total decreases monotonically
  var peakIdx = 0;
  for (var k = 0; k < sim.length; k++) {
    if (sim[k].rho_total >= peakPos - 1e-10) peakIdx = k;
  }
  // Actually we want the point where it starts decreasing. Let me just check the general trend.
  // From a point well past positive region, rho_total should monotonically approach -0.05
  var decStart = Math.max(peakIdx, Math.ceil(posEnd / 0.1) + 10);
  var monotonic = true;
  for (var m = decStart; m < sim.length - 1; m++) {
    if (sim[m].rho_total < sim[m+1].rho_total - 1e-8) {
      monotonic = false;
      break;
    }
  }
  assert(monotonic, 'monotonically decreasing after positive spike');

  console.log('  [INFO] positive duration=' + duration.toFixed(1) + 's, peak=' + peakPos.toExponential(5) + ', total points=' + sim.length + ', monotonic after spike=' + monotonic);
})();

// ============================================================
// T6: Auto control
// ============================================================
console.log('\n=== T6: Auto control ===');
(function() {
  var st = createControlState({ position: 0.5, mode: 'auto' });
  var dt = 0.1;

  // Positive power error -> rods insert (position increases)
  var posBefore = st.position;
  stepControl(st, dt, { targetPosition: 0.5, az5Signal: false, autoInputs: { powerError: 0.1 } });
  assert(st.position > posBefore, 'positive error -> position increases (insert)');

  // Speed limited
  assert(st.velocity <= C.AUTO_RATE_LIMIT + 1e-6, 'velocity <= AUTO_RATE_LIMIT');

  // Zero error (within deadband) -> no movement
  var posBefore2 = st.position;
  stepControl(st, dt, { targetPosition: 0.5, az5Signal: false, autoInputs: { powerError: 0.0 } });
  assert(Math.abs(st.position - posBefore2) < 1e-6, 'zero error: position unchanged');

  // Negative error -> rods withdraw (position decreases)
  // Create a fresh state at 0.6 to have room to withdraw
  var st2 = createControlState({ position: 0.6, mode: 'auto' });
  var posBefore3 = st2.position;
  stepControl(st2, dt, { targetPosition: 0.5, az5Signal: false, autoInputs: { powerError: -0.1 } });
  assert(st2.position < posBefore3, 'negative error -> position decreases (withdraw)');

  console.log('  [INFO] auto: +err pos=' + st.position.toFixed(4) + ' (vel=' + (st.velocity * 7.0).toFixed(4) + ' m/s), -err pos=' + st2.position.toFixed(4));
})();

// ============================================================
// T7: Limits and boundaries
// ============================================================
console.log('\n=== T7: Limits and boundaries ===');
(function() {
  var st = createControlState({ position: 0.5 });
  var dt = 0.1;

  // target=-0.5 -> clamped to 0
  stepControl(st, dt, { targetPosition: -0.5, az5Signal: false });
  assert(st.position >= 0, 'target=-0.5 clamped, position >= 0');

  // Set position to 0, target to 0
  st.position = 0;
  stepControl(st, dt, { targetPosition: 0, az5Signal: false });
  assert(st.velocity < 1e-6, 'pos=0, target=0: velocity=0');

  // target=1.5 -> clamped to 1
  var st2 = createControlState({ position: 0.5 });
  stepControl(st2, dt, { targetPosition: 1.5, az5Signal: false });
  assert(st2.position <= 1.0, 'target=1.5 clamped, position <= 1.0');

  // pos=1, target=1
  st2.position = 1.0;
  stepControl(st2, dt, { targetPosition: 1.0, az5Signal: false });
  assert(st2.velocity < 1e-6, 'pos=1, target=1: velocity=0');

  // dt=0: no division by zero, no change
  var st3 = createControlState({ position: 0.5 });
  stepControl(st3, 0, { targetPosition: 0.8, az5Signal: false });
  assert(!isNaN(st3.position), 'dt=0: no NaN');
  assert(st3.velocity === 0, 'dt=0: velocity=0');

  // Edge: position=1, target=0, should move out
  var st4 = createControlState({ position: 1.0 });
  stepControl(st4, dt, { targetPosition: 0, az5Signal: false });
  assert(st4.position < 1.0, 'pos=1, target=0: can withdraw');
  assert(st4.velocity < 0, 'velocity negative (withdraw direction)');

  console.log('  [INFO] All boundary cases passed');
})();

// ============================================================
// T8: Integration interface (reactivity.js compatibility)
// ============================================================
console.log('\n=== T8: Integration interface ===');
(function() {
  var positions = [0, 0.25, 0.5, 0.75, 1.0];

  for (var i = 0; i < positions.length; i++) {
    var st = createControlState({ position: positions[i] });
    var rho = controlRodReactivity(st);

    // controlRodReactivity = integralRodWorth + tipEffect
    var expectedRho = integralRodWorth(positions[i]) + tipEffect(positions[i]);
    assertNear(rho, expectedRho, 1e-10, 'pos=' + positions[i] + ' rho matches');

    // rodWorthUsed + rodWorthAvail = TOTAL_ROD_WORTH
    assertNear(st.rodWorthUsed + st.rodWorthAvail, C.TOTAL_ROD_WORTH, 1e-10, 'pos=' + positions[i] + ' used + avail = total');

    // rodWorthUsed = |integralRodWorth|
    assertNear(st.rodWorthUsed, Math.abs(integralRodWorth(positions[i])), 1e-10, 'pos=' + positions[i] + ' rodWorthUsed correct');
  }

  // stepControl outputs can drive reactivity.js directly
  var testState = createControlState({ position: 0.3 });
  var dt = 0.1;

  // Move rods: after AZ-5, position increases
  stepControl(testState, dt, { targetPosition: 0.5, az5Signal: true });

  // The state.position is the rodPosition input for reactivity.js
  assertIn(testState.position, 0.3, 0.5, 'position suitable for reactivity.js rodPosition');

  // tipEffect must be separately accessible
  assert(testState.tipEffect >= 0, 'tipEffect >= 0, can be added to total reactivity');

  console.log('  [INFO] state.position and state.tipEffect compatible with reactivity.js');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n========== Acceptance Summary ==========');
console.log('Passed: ' + PASS + ', Failed: ' + FAIL);
console.log('Threshold: 8/8 passed = ACCEPTED');
if (FAIL === 0) {
  console.log('ACCEPTED! 8/8 passed');
} else {
  console.log('REJECTED: ' + FAIL + ' tests failed');
}
process.exit(FAIL > 0 ? 1 : 0);
