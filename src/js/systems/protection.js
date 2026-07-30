/**
 * systems/protection.js
 * RBMK-1000 automatic protection system (СУЗ)
 *
 * Models:
 *   - Multi-channel protection logic (2/3 voting)
 *   - Threshold-based trip for each protection signal
 *   - Bypass management (Chernobyl critical factor)
 *   - Alarm classification
 *   - Protection action output
 *
 * Design principles:
 *   - Independence: protection system independent from control system
 *   - Redundancy: 2/3 voting logic
 *   - Fail-safe: signal loss = protection trigger
 *   - Non-bypassable: critical protections (P1, P2) cannot be removed
 *
 * References:
 *   - IAEA-TECDOC-1049, Section 5 "Reactor Protection System"
 *   - INSAG-7, Section 2.3 "Protection System Deficiencies"
 *   - NUREG/CR-6365 (RBMK safety analysis)
 */

// ============================================================
// Constants
// ============================================================

export const PROTECTION_CONSTANTS = {
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

// ============================================================
// State creation
// ============================================================

export function createProtectionState() {
  const C = PROTECTION_CONSTANTS;

  var signalDefs = [
    { id: 'P1',  name: 'Power overpower',       threshold: C.POWER_TRIP,      bypassable: false },
    { id: 'P2',  name: 'Short period',          threshold: C.PERIOD_TRIP,     bypassable: false },
    { id: 'P3',  name: 'High steam pressure',    threshold: C.PRESSURE_TRIP,   bypassable: true },
    { id: 'P4',  name: 'Low steam drum level',   threshold: C.LEVEL_TRIP,      bypassable: true },
    { id: 'P5',  name: 'Low coolant flow',       threshold: C.FLOW_TRIP,       bypassable: true },
    { id: 'P6',  name: 'High fuel exit temp',    threshold: C.TEMP_TRIP,       bypassable: true },
    { id: 'P7',  name: 'Manual AZ-5',           threshold: 1,                 bypassable: false },
    { id: 'P8',  name: 'Power loss',            threshold: 1,                 bypassable: false },
    { id: 'P9',  name: 'Seismic',               threshold: 0.5,               bypassable: false },
    { id: 'P10', name: 'OPR insufficient',       threshold: C.OPR_TRIP,        bypassable: true },
  ];

  var signals = {};
  for (var si = 0; si < signalDefs.length; si++) {
    var def = signalDefs[si];
    signals[def.id] = {
      id: def.id,
      name: def.name,
      tripped: false,
      warning: false,
      bypassed: false,
      bypassable: def.bypassable,
      value: 0,
      threshold: def.threshold,
      tripTime: -1,
      channelValues: [0, 0, 0],
      channelTrips: [false, false, false],
    };
  }

  return {
    signals: signals,
    az5Demand: false,
    az5DemandLatched: false,
    az5Cause: '',
    alarms: [],
    bypassCount: 0,
    protectionDisabled: false,
  };
}

// ============================================================
// Core evaluation
// ============================================================

export function stepProtection(state, dt, time, inputs) {
  const C = PROTECTION_CONSTANTS;

  if (state.protectionDisabled) {
    state.az5Demand = false;
    return state;
  }

  var alarms = [];

  // --- P1: Power overpower ---
  evaluateSignal(state.signals.P1, inputs.powerFrac, {
    tripThreshold: C.POWER_TRIP,
    warnThreshold: C.POWER_WARNING,
    direction: 'high',
    time: time, dt: dt,
  });
  if (state.signals.P1.warning) {
    alarms.push({ level: 'warning', id: 'P1',
      msg: 'Power ' + (inputs.powerFrac * 100).toFixed(1) + '% approaching limit' });
  }

  // --- P2: Short period ---
  if (inputs.powerFrac > C.PERIOD_MIN_POWER) {
    evaluateSignal(state.signals.P2, inputs.period, {
      tripThreshold: C.PERIOD_TRIP,
      warnThreshold: C.PERIOD_WARNING,
      direction: 'low',
      time: time, dt: dt,
    });
  } else {
    state.signals.P2.tripped = false;
    state.signals.P2.warning = false;
  }
  if (state.signals.P2.warning) {
    alarms.push({ level: 'warning', id: 'P2',
      msg: 'Period ' + inputs.period.toFixed(1) + 's approaching limit' });
  }

  // --- P3: High steam pressure ---
  evaluateSignal(state.signals.P3, inputs.pressure, {
    tripThreshold: C.PRESSURE_TRIP,
    warnThreshold: C.PRESSURE_WARNING,
    direction: 'high',
    time: time, dt: dt,
  });
  if (state.signals.P3.warning) {
    alarms.push({ level: 'warning', id: 'P3',
      msg: 'Steam pressure ' + (inputs.pressure / 1e6).toFixed(2) + ' MPa high' });
  }

  // --- P4: Low steam drum level ---
  evaluateSignal(state.signals.P4, inputs.waterLevel, {
    tripThreshold: C.LEVEL_TRIP,
    warnThreshold: C.LEVEL_WARNING,
    direction: 'low',
    time: time, dt: dt,
  });
  if (state.signals.P4.warning) {
    alarms.push({ level: 'warning', id: 'P4',
      msg: 'Steam drum level ' + inputs.waterLevel.toFixed(2) + ' m low' });
  }

  // --- P5: Low coolant flow ---
  evaluateSignal(state.signals.P5, inputs.coolantFlow, {
    tripThreshold: C.FLOW_TRIP,
    warnThreshold: C.FLOW_WARNING,
    direction: 'low',
    time: time, dt: dt,
  });
  if (state.signals.P5.warning) {
    alarms.push({ level: 'warning', id: 'P5',
      msg: 'Coolant flow ' + (inputs.coolantFlow * 100).toFixed(1) + '% low' });
  }

  // --- P6: High fuel exit temp ---
  evaluateSignal(state.signals.P6, inputs.fuelExitTemp, {
    tripThreshold: C.TEMP_TRIP,
    warnThreshold: C.TEMP_WARNING,
    direction: 'high',
    time: time, dt: dt,
  });
  if (state.signals.P6.warning) {
    alarms.push({ level: 'warning', id: 'P6',
      msg: 'Fuel exit temp ' + inputs.fuelExitTemp.toFixed(1) + ' C high' });
  }

  // --- P7: Manual AZ-5 ---
  if (inputs.manualAZ5) {
    state.signals.P7.tripped = true;
    state.signals.P7.tripTime = time;
    state.signals.P7.value = 1;
  }

  // --- P8: Power loss ---
  if (inputs.powerLoss) {
    state.signals.P8.tripped = true;
    state.signals.P8.tripTime = time;
    state.signals.P8.value = 1;
  }

  // --- P9: Seismic ---
  evaluateSignal(state.signals.P9, inputs.seismicG || 0, {
    tripThreshold: 0.5,
    warnThreshold: 0.3,
    direction: 'high',
    time: time, dt: dt,
  });

  // --- P10: OPR insufficient ---
  evaluateSignal(state.signals.P10, inputs.oprRods, {
    tripThreshold: C.OPR_TRIP,
    warnThreshold: C.OPR_WARNING,
    direction: 'low',
    time: time, dt: dt,
  });
  if (state.signals.P10.warning) {
    alarms.push({ level: 'warning', id: 'P10',
      msg: 'OPR = ' + inputs.oprRods.toFixed(1) + ' rods, approaching limit' });
  }
  if (state.signals.P10.tripped) {
    alarms.push({ level: 'critical', id: 'P10',
      msg: 'OPR = ' + inputs.oprRods.toFixed(1) + ' rods < 15 rods! Violation!' });
  }

  // --- Voting: decide AZ-5 ---
  state.az5Demand = false;
  state.az5Cause = '';

  var tripSignals = [];
  var sigKeys = Object.keys(state.signals);
  for (var si = 0; si < sigKeys.length; si++) {
    var id = sigKeys[si];
    var sig = state.signals[id];
    if (sig.tripped && !sig.bypassed) {
      tripSignals.push(id);
    }
  }

  if (tripSignals.length > 0) {
    state.az5Demand = true;
    state.az5DemandLatched = true;
    state.az5Cause = tripSignals.map(function(id) {
      return id + '(' + state.signals[id].name + ')';
    }).join(' + ');
  }

  state.alarms = alarms;

  state.bypassCount = 0;
  for (var si2 = 0; si2 < sigKeys.length; si2++) {
    if (state.signals[sigKeys[si2]].bypassed) state.bypassCount++;
  }

  return state;
}

// ============================================================
// Signal evaluation (with 2/3 voting)
// ============================================================

function evaluateSignal(signal, value, config) {
  var tripThreshold = config.tripThreshold;
  var warnThreshold = config.warnThreshold;
  var direction = config.direction;
  var time = config.time;
  var dt = config.dt;

  signal.value = value;

  var noise = function() { return (Math.random() - 0.5) * 0.001 * Math.abs(value || 1); };
  signal.channelValues = [value + noise(), value + noise(), value + noise()];

  for (var i = 0; i < 3; i++) {
    var v = signal.channelValues[i];
    if (direction === 'high') {
      signal.channelTrips[i] = v >= tripThreshold;
    } else {
      signal.channelTrips[i] = v <= tripThreshold;
    }
  }

  var tripCount = 0;
  for (var ci = 0; ci < 3; ci++) {
    if (signal.channelTrips[ci]) tripCount++;
  }
  var wasTripped = signal.tripped;
  signal.tripped = tripCount >= PROTECTION_CONSTANTS.VOTING_THRESHOLD;

  if (signal.tripped && !wasTripped) {
    signal.tripTime = time;
  }

  if (direction === 'high') {
    signal.warning = value >= warnThreshold && !signal.tripped;
  } else {
    signal.warning = value <= warnThreshold && !signal.tripped;
  }
}

// ============================================================
// Bypass management
// ============================================================

export function bypassSignal(state, signalId, reason) {
  if (reason === undefined) reason = '';
  var signal = state.signals[signalId];

  if (!signal) {
    return { success: false, message: 'Unknown signal: ' + signalId };
  }
  if (!signal.bypassable) {
    return {
      success: false,
      message: signalId + ' (' + signal.name + ') not bypassable (safety critical)',
    };
  }

  signal.bypassed = true;
  updateBypassCount(state);
  return {
    success: true,
    message: signalId + ' (' + signal.name + ') bypassed. Reason: ' + (reason || 'not specified'),
  };
}

function updateBypassCount(state) {
  state.bypassCount = 0;
  var keys = Object.keys(state.signals);
  for (var si = 0; si < keys.length; si++) {
    if (state.signals[keys[si]].bypassed) state.bypassCount++;
  }
}

export function restoreSignal(state, signalId) {
  var signal = state.signals[signalId];
  if (!signal) {
    return { success: false, message: 'Unknown signal: ' + signalId };
  }
  signal.bypassed = false;
  updateBypassCount(state);
  return {
    success: true,
    message: signalId + ' (' + signal.name + ') restored',
  };
}

export function setProtectionDisabled(state, disabled) {
  state.protectionDisabled = disabled;
  return {
    success: true,
    message: disabled
      ? 'Protection system fully disabled! Extreme danger!'
      : 'Protection system restored',
  };
}

// ============================================================
// Reset
// ============================================================

export function resetAZ5Latch(state) {
  var activeTrips = [];
  var sigKeys = Object.keys(state.signals);
  for (var si = 0; si < sigKeys.length; si++) {
    var sig = state.signals[sigKeys[si]];
    if (sig.tripped && !sig.bypassed) {
      activeTrips.push(sig.id);
    }
  }

  if (activeTrips.length > 0) {
    return {
      success: false,
      message: 'Cannot reset: ' + activeTrips.length + ' protection(s) still active: ' + activeTrips.join(', '),
    };
  }

  state.az5DemandLatched = false;
  state.az5Cause = '';

  for (var si2 = 0; si2 < sigKeys.length; si2++) {
    var sig2 = state.signals[sigKeys[si2]];
    sig2.tripped = false;
    sig2.tripTime = -1;
  }

  return { success: true, message: 'AZ-5 latch reset' };
}

// ============================================================
// Diagnostics
// ============================================================

export function getProtectionReport(state) {
  var signals = {};
  var sigKeys = Object.keys(state.signals);
  for (var si = 0; si < sigKeys.length; si++) {
    var id = sigKeys[si];
    var sig = state.signals[id];
    signals[id] = {
      name: sig.name,
      status: sig.tripped ? 'TRIPPED'
            : sig.warning ? 'WARNING'
            : sig.bypassed ? 'BYPASSED'
            : 'NORMAL',
      value: sig.value,
      threshold: sig.threshold,
      bypassed: sig.bypassed,
      bypassable: sig.bypassable,
      tripTime: sig.tripTime,
    };
  }

  return {
    az5Demand: state.az5Demand,
    az5DemandLatched: state.az5DemandLatched,
    az5Cause: state.az5Cause,
    protectionDisabled: state.protectionDisabled,
    bypassCount: state.bypassCount,
    activeAlarms: state.alarms.length,
    signals: signals,
  };
}

export function assessProtectionSafety(state) {
  var messages = [];
  var score = 100;

  if (state.protectionDisabled) {
    score -= 50;
    messages.push('Protection system fully disabled! (-50)');
  }

  if (state.bypassCount > 0) {
    var penalty = state.bypassCount * 10;
    score -= penalty;
    messages.push(state.bypassCount + ' protections bypassed (-' + penalty + ')');
  }

  var criticalAlarms = 0;
  var warningAlarms = 0;
  for (var ai = 0; ai < state.alarms.length; ai++) {
    if (state.alarms[ai].level === 'critical') criticalAlarms++;
    if (state.alarms[ai].level === 'warning') warningAlarms++;
  }

  if (criticalAlarms > 0) {
    score -= criticalAlarms * 15;
    messages.push(criticalAlarms + ' critical alarm(s)');
  }
  if (warningAlarms > 0) {
    score -= warningAlarms * 5;
    messages.push(warningAlarms + ' warning(s)');
  }

  if (state.az5DemandLatched) {
    score -= 20;
    messages.push('AZ-5 triggered (' + state.az5Cause + ')');
  }

  if (score < 0) score = 0;

  var level;
  if (score >= 80) level = 'normal';
  else if (score >= 60) level = 'caution';
  else if (score >= 40) level = 'warning';
  else if (score >= 20) level = 'critical';
  else level = 'catastrophic';

  if (messages.length === 0) messages.push('Protection system normal');

  return { level: level, score: score, messages: messages };
}

// ============================================================
// Chernobyl bypass sequence
// ============================================================

export function simulateChernobylBypassSequence(state) {
  var log = [];
  log.push(bypassSignal(state, 'P4', 'Turbine coast-down test requires'));
  log.push(bypassSignal(state, 'P3', 'Turbine coast-down test requires'));

  // P7 (manual AZ-5) was physically disabled via electromagnetic clutch
  state.signals.P7.bypassed = true;
  updateBypassCount(state);
  log.push({
    success: true,
    message: 'P7 (Manual AZ-5) physically bypassed via clutch disconnect',
  });

  return log;
}
