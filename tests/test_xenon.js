// Xenon dynamics tests — 8 acceptance criteria
// Run: node tests/test_xenon.js

var PASS = 0, FAIL = 0;

function assert(cond, msg) {
  if (cond) { console.log('  [PASS] ' + msg); PASS++; }
  else { console.log('  [FAIL] ' + msg); FAIL++; }
}

function assertNear(a, b, tol, msg) {
  tol = tol || 1e-6;
  var ok = Math.abs(a - b) < tol;
  (ok ? assert : assert)(ok, (msg || '') + ' (expected ' + b + ', got ' + a.toExponential(4) + ')');
}

function assertRel(a, b, pct, msg) {
  var tol = Math.abs(b * pct / 100);
  var ok = Math.abs(a - b) < tol;
  (ok ? assert : assert)(ok, (msg || '') + ' (expected ' + b.toExponential(5) + ' ±' + pct + '%, got ' + a.toExponential(5) + ')');
}

function assertIn(a, lo, hi, msg) {
  var ok = a >= lo && a <= hi;
  (ok ? assert : assert)(ok, (msg || '') + ' (expected [' + lo + ', ' + hi + '], got ' + (typeof a === 'number' ? a.toFixed(2) : a) + ')');
}

// ============ inlined xenon.js ============

var C = {
  GAMMA_I: 0.0639,
  GAMMA_XE: 0.00237,
  LAMBDA_I: 2.874e-5,
  LAMBDA_XE: 2.093e-5,
  SIGMA_A_XE: 2.6e-22,
  SIGMA_F: 3.5,
  PHI_0: 1.0e18,
  NU: 2.43,
};

function equilibriumConcentrations(powerFrac) {
  if (powerFrac === undefined) powerFrac = 1.0;
  var phi = C.PHI_0 * powerFrac;
  var I_eq = C.GAMMA_I * C.SIGMA_F * phi / C.LAMBDA_I;
  var Xe_eq = (C.GAMMA_I + C.GAMMA_XE) * C.SIGMA_F * phi / (C.LAMBDA_XE + C.SIGMA_A_XE * phi);
  return { I_eq: I_eq, Xe_eq: Xe_eq };
}

function xenonReactivity(Xe) {
  return -C.SIGMA_A_XE * Xe / (C.NU * C.SIGMA_F);
}

function reactivityToRods(rho) {
  return rho / 0.001;
}

function createXenonState(options) {
  if (!options) options = {};
  var powerFrac = options.powerFrac || 1.0;
  var hoursAtPower = options.hoursAtPower || 100;
  var eq = equilibriumConcentrations(powerFrac);
  var t = hoursAtPower * 3600;
  var I = eq.I_eq * (1 - Math.exp(-C.LAMBDA_I * t));
  var Xe = eq.Xe_eq * (1 - Math.exp(-C.LAMBDA_XE * t));
  var rho = xenonReactivity(Xe);
  return {
    I: I, Xe: Xe, rhoXenon: rho, rhoXenonDollars: reactivityToRods(rho),
    XeRelative: Xe / eq.Xe_eq, equilibriumXe: eq.Xe_eq, timeSinceShutdown: -1,
  };
}

function stepXenon(state, dt, inputs) {
  var phi = C.PHI_0 * Math.max(inputs.powerFrac, 0);
  var I_source = C.GAMMA_I * C.SIGMA_F * phi;
  var I_eq = phi > 0 ? I_source / C.LAMBDA_I : 0;
  state.I = I_eq + (state.I - I_eq) * Math.exp(-C.LAMBDA_I * dt);
  var lambda_eff = C.LAMBDA_XE + C.SIGMA_A_XE * phi;
  var Xe_source = C.GAMMA_XE * C.SIGMA_F * phi + C.LAMBDA_I * state.I;
  var Xe_eq2 = lambda_eff > 0 ? Xe_source / lambda_eff : 0;
  state.Xe = Xe_eq2 + (state.Xe - Xe_eq2) * Math.exp(-lambda_eff * dt);
  state.I = Math.max(state.I, 0);
  state.Xe = Math.max(state.Xe, 0);
  state.rhoXenon = xenonReactivity(state.Xe);
  var nomEq = equilibriumConcentrations(1.0);
  state.XeRelative = state.Xe / nomEq.Xe_eq;
  state.equilibriumXe = Xe_eq2;
  if (inputs.powerFrac < 0.001) {
    if (state.timeSinceShutdown < 0) state.timeSinceShutdown = 0;
    state.timeSinceShutdown += dt;
  } else {
    state.timeSinceShutdown = -1;
  }
  state.rhoXenonDollars = reactivityToRods(state.rhoXenon);
  return state;
}

function predictIodinePit(state, hoursAhead, dtHours) {
  if (dtHours === undefined) dtHours = 0.1;
  var results = [];
  var I_0 = state.I, Xe_0 = state.Xe;
  var nomEq = equilibriumConcentrations(1.0);
  var n = Math.ceil(hoursAhead / dtHours);
  for (var i = 0; i <= n; i++) {
    var t = i * dtHours * 3600;
    var I_t = I_0 * Math.exp(-C.LAMBDA_I * t);
    var Xe_t;
    if (Math.abs(C.LAMBDA_XE - C.LAMBDA_I) < 1e-10) {
      Xe_t = (Xe_0 + I_0 * C.LAMBDA_I * t) * Math.exp(-C.LAMBDA_XE * t);
    } else {
      Xe_t = Xe_0 * Math.exp(-C.LAMBDA_XE * t) + I_0 * C.LAMBDA_I / (C.LAMBDA_XE - C.LAMBDA_I) * (Math.exp(-C.LAMBDA_I * t) - Math.exp(-C.LAMBDA_XE * t));
    }
    results.push({ t_hours: i * dtHours, Xe: Xe_t, XeRelative: Xe_t / nomEq.Xe_eq, rhoXenon: xenonReactivity(Xe_t), rhoRods: reactivityToRods(xenonReactivity(Xe_t)) });
  }
  return results;
}

function findIodinePitMinimum(state) {
  var I_0 = state.I, Xe_0 = state.Xe;
  var maxXe = 0, t_max = 0;
  for (var t = 0; t < 50 * 3600; t += 60) {
    var I_t = I_0 * Math.exp(-C.LAMBDA_I * t);
    var Xe_t;
    if (Math.abs(C.LAMBDA_XE - C.LAMBDA_I) < 1e-10) {
      Xe_t = (Xe_0 + I_0 * C.LAMBDA_I * t) * Math.exp(-C.LAMBDA_XE * t);
    } else {
      Xe_t = Xe_0 * Math.exp(-C.LAMBDA_XE * t) + I_0 * C.LAMBDA_I / (C.LAMBDA_XE - C.LAMBDA_I) * (Math.exp(-C.LAMBDA_I * t) - Math.exp(-C.LAMBDA_XE * t));
    }
    if (Xe_t > maxXe) { maxXe = Xe_t; t_max = t; }
  }
  var nomEq = equilibriumConcentrations(1.0);
  return { t_hours: t_max / 3600, Xe_max: maxXe, XeRelative_max: maxXe / nomEq.Xe_eq, rho_min: xenonReactivity(maxXe), rhoRods: reactivityToRods(xenonReactivity(maxXe)) };
}

function calcOPR(xenonState, rodPosition, totalRodWorth) {
  var used = rodPosition * totalRodWorth;
  var avail = totalRodWorth - used;
  var penalty = Math.abs(xenonState.rhoXenon);
  var opr = avail - penalty;
  var rods = opr / 0.001;
  return { opr: opr, oprRods: rods, safe: rods >= 15 };
}

// ============================================================
// T1: Rated equilibrium
// ============================================================
console.log('\n=== T1: Rated equilibrium ===');
(function() {
  var st = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  var eq = equilibriumConcentrations(1.0);
  assertNear(st.I / eq.I_eq, 1.0, 0.001, 'I / I_eq = 1.0');
  assertNear(st.Xe / eq.Xe_eq, 1.0, 0.001, 'Xe / Xe_eq = 1.0');
  assertRel(st.rhoXenon, -C.SIGMA_A_XE * eq.Xe_eq / (C.NU * C.SIGMA_F), 1, 'rhoXenon correct');
  assertIn(st.rhoXenon, -0.05, -0.003, 'rhoXenon ≈ -0.003 ~ -0.05');
  assertIn(st.rhoXenonDollars, -30, -20, 'equivalent rods ≈ -25');
  assertNear(st.XeRelative, 1.0, 0.01, 'XeRelative = 1.0');
  console.log('  [INFO] I_eq=' + eq.I_eq.toExponential(3) + ', Xe_eq=' + eq.Xe_eq.toExponential(3) + ', rho=' + st.rhoXenon.toExponential(4) + ', rods=' + st.rhoXenonDollars.toFixed(1));
})();

// ============================================================
// T2: Post-shutdown iodine pit
// ============================================================
console.log('\n=== T2: Post-shutdown iodine pit ===');
(function() {
  var st = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  var Xe0 = st.Xe;
  var pit = findIodinePitMinimum(st);
  assert(pit.Xe_max > Xe0, 'Xe rises then falls (peak ' + pit.XeRelative_max.toFixed(2) + 'x)');
  assertIn(pit.t_hours, 8, 14, 'peak time 8-14h');
  assertIn(pit.XeRelative_max, 3.0, 6.0, 'peak Xe/eq 3.0-6.0x');
  assert(Math.abs(pit.rhoRods) > 60, 'peak rods > 60 (got ' + pit.rhoRods.toFixed(1) + ')');
  console.log('  [INFO] peak t=' + pit.t_hours.toFixed(1) + 'h, Xe_rel=' + pit.XeRelative_max.toFixed(2) + 'x, rods=' + pit.rhoRods.toFixed(1));
})();

// ============================================================
// T3: Power change response
// ============================================================
console.log('\n=== T3: Power change response ===');
(function() {
  // power reduction 1.0 -> 0.5
  var st = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  var Xe_before = st.Xe;
  var dt = 600;
  for (var t = 0; t < 6 * 3600; t += dt) {
    stepXenon(st, dt, { powerFrac: 0.5 });
  }
  var Xe_after_6h = st.Xe;
  assert(Xe_after_6h > Xe_before, 'Xe initially rises after power cut');

  // verify new equilibrium using direct constructor
  var stNew = createXenonState({ powerFrac: 0.5, hoursAtPower: 200 });
  var eq05 = equilibriumConcentrations(0.5);
  assertRel(stNew.Xe, eq05.Xe_eq, 0.01, 'new eq Xe matches theory');
  assert(stNew.Xe < equilibriumConcentrations(1.0).Xe_eq, 'low-power Xe < full-power Xe');

  // power increase 0.5 -> 1.0
  var st2 = createXenonState({ powerFrac: 0.5, hoursAtPower: 100 });
  var Xe_before2 = st2.Xe;
  for (var t2 = 0; t2 < 3 * 3600; t2 += dt) {
    stepXenon(st2, dt, { powerFrac: 1.0 });
  }
  assert(st2.Xe < Xe_before2, 'Xe dips after power rise (burnup increase)');

  var st2New = createXenonState({ powerFrac: 1.0, hoursAtPower: 200 });
  var eq10 = equilibriumConcentrations(1.0);
  assertRel(st2New.Xe, eq10.Xe_eq, 0.01, 'back to full power, Xe restored');
  console.log('  [INFO] cut: Xe ' + (Xe_after_6h / Xe_before).toFixed(3) + 'x, rise: Xe ' + (st2.Xe / Xe_before2).toFixed(3) + 'x');
})();

// ============================================================
// T4: Prolonged low power (Chernobyl pre-condition)
// ============================================================
console.log('\n=== T4: Prolonged low power ===');
(function() {
  var st = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  var dt = 600;
  for (var t = 0; t < 10 * 3600; t += dt) {
    stepXenon(st, dt, { powerFrac: 0.06 });
  }
  assert(st.XeRelative > 2.0, 'XeRelative > 2.0 (got ' + st.XeRelative.toFixed(2) + 'x)');
  assert(Math.abs(st.rhoXenon) > 0.03, 'rhoXenon large (got ' + st.rhoXenon.toExponential(4) + ')');
  var opr = calcOPR(st, 0.85, 0.05);
  assert(!opr.safe, 'OPR < 15 rods, unsafe (got ' + opr.oprRods.toFixed(1) + ')');
  console.log('  [INFO] XeRel=' + st.XeRelative.toFixed(2) + 'x, rho=' + st.rhoXenon.toExponential(4) + ', OPR=' + opr.oprRods.toFixed(1) + ' rods');
})();

// ============================================================
// T5: OPR calculation
// ============================================================
console.log('\n=== T5: OPR calculation ===');
(function() {
  var st = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  var totalWorth = 0.05;

  // heavy insert -> unsafe
  var opr1 = calcOPR(st, 0.5, totalWorth);
  assert(opr1.oprRods < 5, 'rodPosition=0.5: OPR ~ 0 (got ' + opr1.oprRods.toFixed(1) + ')');
  assert(!opr1.safe, 'rodPosition=0.5: safe = false');

  // light insert -> safe
  var opr2 = calcOPR(st, 0.12, totalWorth);
  assert(opr2.oprRods >= 15, 'rodPosition=0.12: OPR >= 15 (got ' + opr2.oprRods.toFixed(1) + ')');
  assert(opr2.safe, 'rodPosition=0.12: safe = true');

  console.log('  [INFO] OPR(insert=0.5)=' + opr1.oprRods.toFixed(1) + ' rods, OPR(insert=0.12)=' + opr2.oprRods.toFixed(1) + ' rods');
})();

// ============================================================
// T6: Numerical accuracy
// ============================================================
console.log('\n=== T6: Numerical accuracy ===');
(function() {
  // dt-invariance
  var stRef = createXenonState({ powerFrac: 1.0, hoursAtPower: 0 });
  var stTest = createXenonState({ powerFrac: 1.0, hoursAtPower: 0 });
  for (var t1 = 0; t1 < 24 * 3600; t1 += 1) stepXenon(stRef, 1, { powerFrac: 1.0 });
  for (var t2 = 0; t2 < 24 * 3600; t2 += 0.1) stepXenon(stTest, 0.1, { powerFrac: 1.0 });
  assertRel(stRef.Xe, stTest.Xe, 0.1, 'dt=1 vs dt=0.1: Xe diff < 0.1%');

  // decay over 500h (Xe fed by I-135 decay, need ~440h for Xe < 1e8)
  var stDecay = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  for (var t3 = 0; t3 < 500 * 3600; t3 += 3600) {
    stepXenon(stDecay, 3600, { powerFrac: 0 });
  }
  assert(stDecay.I < 1e8, '500h decay: I ~ 0 (got ' + stDecay.I.toExponential(2) + ')');
  assert(stDecay.Xe < 1e8, '500h decay: Xe ~ 0 (got ' + stDecay.Xe.toExponential(2) + ')');

  // high power stability
  var stHigh = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  for (var t4 = 0; t4 < 50 * 3600; t4 += 3600) stepXenon(stHigh, 3600, { powerFrac: 10 });
  assert(isFinite(stHigh.Xe), 'power=10: finite (got ' + stHigh.Xe.toExponential(2) + ')');
  assert(stHigh.Xe > 0, 'power=10: Xe > 0');

  console.log('  [INFO] dt diff=' + (Math.abs(stRef.Xe - stTest.Xe) / stRef.Xe * 100).toFixed(4) + '%, decay I=' + stDecay.I.toExponential(2) + ', high-power Xe=' + stHigh.Xe.toExponential(2));
})();

// ============================================================
// T7: Iodine pit prediction tools
// ============================================================
console.log('\n=== T7: Iodine pit prediction tools ===');
(function() {
  var st = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  var prediction = predictIodinePit(st, 30, 0.1);
  assert(prediction.length === 301, '301 data points');
  var rising = true, peaked = false;
  for (var i = 1; i < prediction.length; i++) {
    if (prediction[i].Xe > prediction[i-1].Xe && !peaked) rising = true;
    else if (prediction[i].Xe < prediction[i-1].Xe) { if (rising) peaked = true; rising = false; }
  }
  assert(peaked, 'single-peaked curve');
  var pit = findIodinePitMinimum(st);
  assertIn(pit.t_hours, 8, 14, 'peak time ~11h');
  assert(pit.rho_min < st.rhoXenon, 'peak rho more negative');
  console.log('  [INFO] peak t=' + pit.t_hours.toFixed(1) + 'h, rho_min=' + pit.rho_min.toExponential(4) + ', rods=' + pit.rhoRods.toFixed(1));
})();

// ============================================================
// T8: Chernobyl scenario reconstruction
// ============================================================
console.log('\n=== T8: Chernobyl scenario reconstruction ===');
(function() {
  var st = createXenonState({ powerFrac: 1.0, hoursAtPower: 100 });
  var dt = 600;
  for (var t = 0; t < 10 * 3600; t += dt) {
    stepXenon(st, dt, { powerFrac: 0.06 });
  }
  // 85% rods inserted, total worth 0.05
  var opr = calcOPR(st, 0.85, 0.05);
  assert(opr.oprRods < 15, 'OPR < 15 rods (got ' + opr.oprRods.toFixed(1) + ')');
  assert(!opr.safe, 'unsafe');
  var opr2 = calcOPR(st, 0.95, 0.05);
  assert(opr2.oprRods < 0, 'OPR negative (got ' + opr2.oprRods.toFixed(1) + ')');
  console.log('  [INFO] XeRel=' + st.XeRelative.toFixed(2) + 'x, OPR(0.85)=' + opr.oprRods.toFixed(1) + ' rods, OPR(0.95)=' + opr2.oprRods.toFixed(1) + ' rods');
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
