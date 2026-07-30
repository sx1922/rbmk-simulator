/**
 * systems/control.js
 * RBMK-1000 control rod drive mechanism
 *
 * Models:
 *   - Rod drive kinematics (constant speed, optional accel/decel)
 *   - Rod worth curve (S-shaped, non-uniform)
 *   - Tip effect (graphite displacer positive reactivity)
 *   - AZ-5 emergency scram
 *   - Automatic regulation mode
 *
 * References:
 *   - IAEA-TECDOC-1049 "RBMK Reactors: General Characteristics"
 *   - INSAG-7 "The Chernobyl Accident" (1992)
 *   - Adamov et al., "RBMK Nuclear Power Reactors", 1997
 */

// ============================================================
// Constants
// ============================================================

export const CONTROL_CONSTANTS = {
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

// ============================================================
// Rod worth curve
// ============================================================

export function differentialRodWorth(x) {
  const C = CONTROL_CONSTANTS;
  const raw = Math.sin(Math.PI * x);
  const normalized = raw * (Math.PI / 2);
  return C.TOTAL_ROD_WORTH * normalized;
}

export function integralRodWorth(x) {
  const C = CONTROL_CONSTANTS;
  x = clamp(x, 0, 1);
  return -C.TOTAL_ROD_WORTH * (1 - Math.cos(Math.PI * x)) / 2;
}

// ============================================================
// Tip effect (end effect / positive scram)
// ============================================================

export function tipEffect(x) {
  const C = CONTROL_CONSTANTS;
  if (x > C.TIP_EFFECT_WIDTH * 3) return 0;
  const sigma = C.TIP_EFFECT_WIDTH;
  const gaussian = Math.exp(-0.5 * (x / sigma) * (x / sigma));
  return C.TIP_EFFECT_PEAK * gaussian;
}

// ============================================================
// State creation
// ============================================================

export function createControlState(options) {
  if (options === undefined) options = {};
  const position = options.position !== undefined ? clamp(options.position, 0, 1) : 0.5;
  const mode = options.mode || 'manual';

  return {
    position: position,
    velocity: 0,
    target: position,
    mode: mode,
    az5Active: false,
    az5Progress: 0,
    tipEffect: tipEffect(position),
    rodWorthUsed: Math.abs(integralRodWorth(position)),
    rodWorthAvail: CONTROL_CONSTANTS.TOTAL_ROD_WORTH - Math.abs(integralRodWorth(position)),
  };
}

// ============================================================
// Time advancement
// ============================================================

export function stepControl(state, dt, inputs) {
  const C = CONTROL_CONSTANTS;
  const targetPosition = inputs.targetPosition;
  const az5Signal = inputs.az5Signal;
  const autoInputs = inputs.autoInputs;

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
    const speed = C.ROD_SPEED_AZ5 / C.CORE_HEIGHT;
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

  var effectiveTarget;
  var maxSpeed;

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

function updateDerived(state) {
  state.tipEffect = tipEffect(state.position);
  state.rodWorthUsed = Math.abs(integralRodWorth(state.position));
  state.rodWorthAvail = CONTROL_CONSTANTS.TOTAL_ROD_WORTH - state.rodWorthUsed;
}

// ============================================================
// Reactivity contribution
// ============================================================

export function controlRodReactivity(state) {
  const rodWorth = integralRodWorth(state.position);
  const tip = state.tipEffect;
  return rodWorth + tip;
}

export function simulateAZ5Insertion(startPosition, dt) {
  if (dt === undefined) dt = 0.1;
  const C = CONTROL_CONSTANTS;
  const speed = C.ROD_SPEED_AZ5 / C.CORE_HEIGHT;
  const results = [];

  var pos = startPosition;
  var t = 0;

  while (pos < 1.0) {
    const rho_rod = integralRodWorth(pos);
    const rho_tip = tipEffect(pos);

    results.push({
      t: t,
      position: pos,
      rho_rod: rho_rod,
      rho_tip: rho_tip,
      rho_total: rho_rod + rho_tip,
    });

    pos += speed * dt;
    t += dt;
  }

  results.push({
    t: t,
    position: 1.0,
    rho_rod: integralRodWorth(1.0),
    rho_tip: tipEffect(1.0),
    rho_total: integralRodWorth(1.0) + tipEffect(1.0),
  });

  return results;
}

// ============================================================
// Utilities
// ============================================================

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

export function getControlSummary(state) {
  const C = CONTROL_CONSTANTS;
  const insertionMeters = state.position * C.CORE_HEIGHT;

  return {
    positionPercent: (state.position * 100).toFixed(1) + '%',
    insertionMeters: insertionMeters.toFixed(2) + ' m',
    velocity: (state.velocity * C.CORE_HEIGHT).toFixed(3) + ' m/s',
    mode: state.mode,
    az5Active: state.az5Active,
    az5Progress: state.az5Active ? (state.az5Progress * 100).toFixed(1) + '%' : null,
    rodWorthUsed: state.rodWorthUsed.toFixed(5),
    rodWorthAvail: state.rodWorthAvail.toFixed(5),
    tipEffect: state.tipEffect.toFixed(6),
    timeToFullInsert: state.az5Active
      ? ((1 - state.position) * C.CORE_HEIGHT / C.ROD_SPEED_AZ5).toFixed(1) + 's'
      : null,
  };
}

export function assessControlSafety(state, oprRods) {
  const messages = [];
  var level = 'normal';

  if (state.az5Active) {
    level = 'az5';
    messages.push('AZ-5 emergency scram in progress');
    if (state.position < 1.0) {
      const remaining = (1 - state.position) * CONTROL_CONSTANTS.CORE_HEIGHT;
      const timeLeft = remaining / CONTROL_CONSTANTS.ROD_SPEED_AZ5;
      messages.push('Remaining insertion time: ' + timeLeft.toFixed(1) + 's');
    }
  }

  if (oprRods < 15) {
    if (level === 'normal') level = 'critical';
    messages.push('OPR = ' + oprRods.toFixed(1) + ' rods < 15 rods! Violation!');
  } else if (oprRods < 20) {
    if (level === 'normal') level = 'warning';
    messages.push('OPR = ' + oprRods.toFixed(1) + ' rods, approaching limit');
  }

  if (state.position < 0.1 && !state.az5Active) {
    if (level === 'normal') level = 'caution';
    messages.push('Control rods almost fully withdrawn, insufficient scram margin');
  }

  if (messages.length === 0) messages.push('Control rod system normal');

  return { level: level, messages: messages };
}

export function resetAZ5(state, newPosition) {
  if (newPosition === undefined) newPosition = 0.5;
  state.az5Active = false;
  state.az5Progress = 0;
  state.mode = 'manual';
  state.position = clamp(newPosition, 0, 1);
  state.target = state.position;
  state.velocity = 0;
  updateDerived(state);
}
