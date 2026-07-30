var CORE_H = 7, ROD_SPEED = 0.4, TIP_PEAK = 0.0010, TIP_W = 0.50, AUTO_DB = 0.005, AUTO_G = 0.02, AUTO_RL = 0.01;
var TOTAL_W = 0.10;
export { TOTAL_W };

export var CONTROL_CONSTANTS = { CORE_HEIGHT: CORE_H, ROD_SPEED: ROD_SPEED, TOTAL_ROD_WORTH: TOTAL_W, TIP_EFFECT_PEAK: TIP_PEAK, TIP_EFFECT_WIDTH: TIP_W, AUTO_DEADBAND: AUTO_DB, AUTO_GAIN: AUTO_G, AUTO_RATE_LIMIT: AUTO_RL, NUM_RODS: 211, ROD_SPEED_AZ5: 0.4 };

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

export function integralRodWorth(x) {
  return -TOTAL_W * (1 - Math.cos(Math.PI * x)) / 2;
}

export function differentialRodWorth(x) {
  return TOTAL_W * (Math.PI / 2) * Math.sin(Math.PI * x);
}

export function tipEffect(x) {
  return TIP_PEAK * Math.exp(-0.5 * (x / TIP_W) * (x / TIP_W));
}

export function createControlState(opts) {
  if (!opts) opts = {};
  var p = opts.position !== undefined ? clamp(opts.position, 0, 1) : 0.5;
  return { position: p, velocity: 0, target: p, mode: opts.mode || 'manual', az5Active: false, az5Progress: 0, tipEffect: tipEffect(p), rodWorthUsed: Math.abs(integralRodWorth(p)), rodWorthAvail: TOTAL_W - Math.abs(integralRodWorth(p)) };
}

function updateDerived(st) { st.tipEffect = tipEffect(st.position); st.rodWorthUsed = Math.abs(integralRodWorth(st.position)); st.rodWorthAvail = TOTAL_W - st.rodWorthUsed; }

export function stepControl(st, dt, inp) {
  if (dt <= 0) { updateDerived(st); return st; }
  if (inp.az5Signal && !st.az5Active) { st.az5Active = true; st.az5Progress = 0; st.mode = 'az5'; }
  if (st.az5Active) {
    var spd = ROD_SPEED / CORE_H; st.velocity = spd; st.position += spd * dt; st.az5Progress = st.position;
    if (st.position >= 1) { st.position = 1; st.velocity = 0; }
    updateDerived(st); return st;
  }
  var et, ms;
  if (st.mode === 'auto' && inp.autoInputs) {
    var err = inp.autoInputs.powerError || 0;
    et = Math.abs(err) < AUTO_DB ? st.position : clamp(st.position + AUTO_G * err, 0, 1);
    ms = AUTO_RL;
  } else {
    et = clamp(inp.targetPosition, 0, 1);
    ms = ROD_SPEED / CORE_H;
    if (inp.autoInputs && st.mode === 'manual') {
      var err = inp.autoInputs.powerError || 0;
      st.integral = (st.integral || 0) + err * dt;
      st.integral = Math.max(-50, Math.min(50, st.integral));
      var adj = 3e-5 * st.integral;
      et = clamp(et + adj, 0, 1);
    }
  }
  st.target = et;
  var err2 = et - st.position;
  if (Math.abs(err2) < 1e-6) st.velocity = 0;
  else { var d = Math.sign(err2); var s = Math.min(ms, Math.abs(err2) / dt); st.velocity = d * s; st.position += st.velocity * dt; }
  st.position = clamp(st.position, 0, 1);
  updateDerived(st);
}

export function simulateAZ5Insertion(startPos, dt) {
  if (dt === undefined) dt = 0.1;
  var speed = ROD_SPEED / CORE_H, results = [], pos = startPos, t = 0;
  while (pos < 1) {
    results.push({ t: t, position: pos, rho_rod: integralRodWorth(pos), rho_tip: tipEffect(pos), rho_total: integralRodWorth(pos) + tipEffect(pos) });
    pos += speed * dt; t += dt;
  }
  results.push({ t: t, position: 1, rho_rod: integralRodWorth(1), rho_tip: tipEffect(1), rho_total: integralRodWorth(1) + tipEffect(1) });
  return results;
}

export function controlRodReactivity(st) { return integralRodWorth(st.position) + st.tipEffect; }

export function getControlSummary(st) {
  return { position: st.position, positionPercent: (st.position * 100).toFixed(1) + '%', insertionMeters: (st.position * CORE_H).toFixed(2) + ' m', velocity: (st.velocity * CORE_H).toFixed(3) + ' m/s', mode: st.mode, az5Active: st.az5Active, az5Progress: st.az5Active ? (st.az5Progress * 100).toFixed(1) + '%' : null, rodWorthUsed: st.rodWorthUsed.toFixed(5), rodWorthAvail: st.rodWorthAvail.toFixed(5), tipEffect: st.tipEffect.toFixed(6), timeToFullInsert: st.az5Active ? ((1 - st.position) * CORE_H / ROD_SPEED).toFixed(1) + 's' : null };
}

export function assessControlSafety(st, oprRods) {
  var messages = [], level = 'normal';
  if (st.az5Active) { level = 'az5'; messages.push('AZ-5 emergency scram in progress'); }
  if (oprRods < 15) { if (level === 'normal') level = 'critical'; messages.push('OPR=' + oprRods.toFixed(1) + ' rods < 15!'); }
  if (messages.length === 0) messages.push('Control rod system normal');
  return { level: level, messages: messages };
}

export function resetAZ5(st, newPos) {
  if (newPos === undefined) newPos = 0.5;
  st.az5Active = false; st.az5Progress = 0; st.mode = 'manual'; st.position = clamp(newPos, 0, 1); st.target = st.position; st.velocity = 0;
  updateDerived(st);
}
