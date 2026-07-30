/**
 * core/reactor.js
 * RBMK-1000 reactor simulation main loop
 *
 * Integrates all physics and systems modules,
 * providing unified API:
 *   - createReactor(config, scenario)
 *   - stepReactor(reactor, dt, inputs)
 *   - getReactorSnapshot(reactor)
 *   - resetReactor(reactor, scenario)
 *
 * References:
 *   - All sub-module references
 *   - IAEA-TECDOC-1049 (RBMK general design)
 *   - INSAG-7 (Chernobyl accident)
 */

import {
  NEUTRON_CONSTANTS,
  createNeutronState,
  stepNeutron,
  calcReactorPeriod,
  getNeutronSummary,
} from '../physics/neutron.js';

import {
  REACTIVITY_CONSTANTS,
  totalReactivity,
  getReactivityBreakdown,
} from '../physics/reactivity.js';

import {
  THERMAL_CONSTANTS,
  createThermalState,
  stepThermal,
  getThermalSummary,
} from '../physics/thermal.js';

import {
  createAZ5State,
  stepAZ5,
  triggerAZ5,
} from '../systems/az5.js';

import {
  XENON_CONSTANTS,
  createXenonState,
  stepXenon,
  calcOPR,
  getXenonSummary,
  assessXenonSafety,
} from '../physics/xenon.js';

import {
  CONTROL_CONSTANTS,
  createControlState,
  stepControl,
  getControlSummary,
  assessControlSafety,
} from '../systems/control.js';

import {
  PROTECTION_CONSTANTS,
  createProtectionState,
  stepProtection,
  getProtectionReport,
  assessProtectionSafety,
  bypassSignal,
  restoreSignal,
  resetAZ5Latch,
  setProtectionDisabled,
} from '../systems/protection.js';

// ============================================================
// Configuration
// ============================================================

export const REACTOR_CONFIG = {
  RATED_THERMAL_POWER: 3200e6,
  RATED_ELECTRIC_POWER: 1000e6,
  THERMAL_EFFICIENCY: 0.3125,

  DT_NEUTRON: 0.001,
  DT_THERMAL: 0.1,
  DT_XENON: 1.0,
  DT_PROTECTION: 0.1,

  TOTAL_ROD_WORTH: 0.05,

  SCENARIOS: {
    FULL_POWER: {
      name: 'Full power',
      powerFrac: 1.0,
      rodPosition: 0.55,
      hoursAtPower: 100,
      coolantFlow: 1.0,
      pressure: 6.5e6,
    },
    HOT_STANDBY: {
      name: 'Hot standby',
      powerFrac: 0.01,
      rodPosition: 0.85,
      hoursAtPower: 5,
      coolantFlow: 0.5,
      pressure: 6.5e6,
    },
    COLD_SHUTDOWN: {
      name: 'Cold shutdown',
      powerFrac: 0.0,
      rodPosition: 1.0,
      hoursAtPower: 0,
      coolantFlow: 0.0,
      pressure: 0.1e6,
    },
    XENON_TRANSIENT: {
      name: 'Xenon transient (post-cutback)',
      powerFrac: 0.06,
      rodPosition: 0.80,
      hoursAtPower: 10,
      coolantFlow: 0.6,
      pressure: 6.0e6,
    },
    CHERNOBYL_PRE: {
      name: 'Pre-Chernobyl',
      powerFrac: 0.063,
      rodPosition: 0.92,
      hoursAtPower: 10,
      coolantFlow: 1.5,
      pressure: 6.0e6,
    },
  },
};

// ============================================================
// Reactor creation
// ============================================================

export function createReactor(config, scenario) {
  if (config === undefined) config = {};
  if (scenario === undefined) scenario = 'FULL_POWER';
  var cfg = Object.assign({}, REACTOR_CONFIG, config);
  var scenarios = cfg.SCENARIOS;
  var sc = scenarios[scenario] || scenarios.FULL_POWER;

  var neutron = createNeutronState({ n0: sc.powerFrac, equilibrium: true });

  var thermal = createThermalState({
    powerFrac: sc.powerFrac,
    coolantFlow: sc.coolantFlow,
    pressure: sc.pressure,
    equilibrium: true,
  });

  var xenon = createXenonState({
    powerFrac: sc.powerFrac,
    hoursAtPower: sc.hoursAtPower,
  });

  var control = createControlState({
    position: sc.rodPosition,
    mode: 'manual',
  });

  var az5 = createAZ5State();

  var protection = createProtectionState();

  var rhoInit = totalReactivity({
    rodPosition: sc.rodPosition,
    voidFraction: thermal.voidFraction,
    fuelTemp: thermal.fuelTempAvg,
    coolantTemp: thermal.coolantTempAvg,
    xenonReactivity: xenon.rhoXenon,
    powerFrac: sc.powerFrac,
  });

  return {
    neutron: neutron,
    thermal: thermal,
    xenon: xenon,
    control: control,
    az5: az5,
    protection: protection,
    time: 0,
    stepCount: 0,
    powerMWth: sc.powerFrac * cfg.RATED_THERMAL_POWER / 1e6,
    powerMWe: sc.powerFrac * cfg.RATED_ELECTRIC_POWER / 1e6,
    rhoTotal: rhoInit,
    period: Infinity,
    reactivityBreakdown: getReactivityBreakdown({
      rodPosition: sc.rodPosition,
      voidFraction: thermal.voidFraction,
      fuelTemp: thermal.fuelTempAvg,
      coolantTemp: thermal.coolantTempAvg,
      xenonReactivity: xenon.rhoXenon,
    }),
    running: true,
    eventLog: [{
      time: 0,
      type: 'init',
      msg: 'Reactor initialized: ' + sc.name + ' (P=' + (sc.powerFrac * 100).toFixed(1) + '%)',
    }],
    config: cfg,
    _flagPowerHigh: false,
    _flagPowerLow: false,
    _flagAZ5Done: false,
    _flagXenonHigh: false,
  };
}

// ============================================================
// Main step function
// ============================================================

export function stepReactor(reactor, dt, inputs) {
  if (inputs === undefined) inputs = {};
  var cfg = reactor.config;
  var rodTarget = inputs.rodTarget;
  var az5Button = inputs.az5Button || false;
  var controlMode = inputs.controlMode || 'manual';
  var powerSetpoint = inputs.powerSetpoint || 1.0;
  var powerLoss = inputs.powerLoss || false;
  var seismicG = inputs.seismicG || 0;

  if (!reactor.running) return reactor;

  var t_start = reactor.time;
  var t_end = t_start + dt;

  var t = t_start;

  while (t < t_end - 1e-12) {
    var subDt = Math.min(cfg.DT_NEUTRON, t_end - t);

    // Step 1: Protection system evaluation
    var protSteps = Math.round(cfg.DT_PROTECTION / cfg.DT_NEUTRON);
    if (reactor.stepCount % protSteps === 0) {
      var period = calcReactorPeriod(reactor.neutron);
      var opr = calcOPR(reactor.xenon, reactor.control.position, cfg.TOTAL_ROD_WORTH);

      var protInputs = {
        powerFrac: reactor.neutron.n,
        period: period,
        pressure: reactor.thermal.pressure,
        waterLevel: reactor.thermal.waterLevel || 1.5,
        coolantFlow: reactor.thermal.coolantFlowFrac || 1.0,
        fuelExitTemp: reactor.thermal.fuelExitTemp || 285,
        oprRods: opr.oprRods,
        manualAZ5: az5Button,
        powerLoss: powerLoss,
        seismicG: seismicG,
      };

      stepProtection(reactor.protection, cfg.DT_PROTECTION, t, protInputs);

      if (reactor.protection.az5Demand && !reactor.az5.active) {
        triggerAZ5(reactor.az5, t);
        logEvent(reactor, t, 'protection',
          'Protection triggered AZ-5: ' + reactor.protection.az5Cause);
      }
    }

    // Step 2: AZ-5 update
    stepAZ5(reactor.az5, subDt);

    // Step 3: Control rod movement
    var ctrlRodTarget = rodTarget !== undefined ? rodTarget : reactor.control.target;
    var controlInputs = {
      targetPosition: ctrlRodTarget,
      az5Signal: reactor.az5.active,
    };
    if (controlMode === 'auto') {
      controlInputs.autoInputs = { powerError: reactor.neutron.n - powerSetpoint };
      controlInputs.targetPosition = reactor.control.target;
    }
    reactor.control.mode = reactor.az5.active ? 'az5' : controlMode;
    stepControl(reactor.control, subDt, controlInputs);

    // Step 4: Total reactivity
    var rho = totalReactivity({
      rodPosition: reactor.control.position,
      voidFraction: reactor.thermal.voidFraction,
      fuelTemp: reactor.thermal.fuelTempAvg,
      coolantTemp: reactor.thermal.coolantTempAvg,
      xenonReactivity: reactor.xenon.rhoXenon,
      powerFrac: reactor.neutron.n,
    });
    var rhoTotal = rho + reactor.control.tipEffect;
    reactor.rhoTotal = rhoTotal;

    // Step 5: Neutron kinetics
    stepNeutron(reactor.neutron, subDt, { rho: rhoTotal });
    if (reactor.neutron.n < 1e-10) reactor.neutron.n = 1e-10;

    // Step 6: Thermal hydraulics
    var thermalSteps = Math.round(cfg.DT_THERMAL / cfg.DT_NEUTRON);
    if (reactor.stepCount % thermalSteps === 0) {
      stepThermal(reactor.thermal, cfg.DT_THERMAL, {
        powerFrac: reactor.neutron.n,
        coolantFlowFrac: reactor.thermal.coolantFlowFrac || 1.0,
      });
    }

    // Step 7: Xenon
    var xenonSteps = Math.round(cfg.DT_XENON / cfg.DT_NEUTRON);
    if (reactor.stepCount % xenonSteps === 0) {
      stepXenon(reactor.xenon, cfg.DT_XENON, { powerFrac: reactor.neutron.n });
    }

    t += subDt;
    reactor.time = t;
    reactor.stepCount++;
  }

  // Post-step derived quantities
  reactor.powerMWth = reactor.neutron.n * cfg.RATED_THERMAL_POWER / 1e6;
  reactor.powerMWe = reactor.neutron.n * cfg.RATED_ELECTRIC_POWER / 1e6;
  reactor.period = calcReactorPeriod(reactor.neutron);

  reactor.reactivityBreakdown = getReactivityBreakdown({
    rodPosition: reactor.control.position,
    voidFraction: reactor.thermal.voidFraction,
    fuelTemp: reactor.thermal.fuelTempAvg,
    coolantTemp: reactor.thermal.coolantTempAvg,
    xenonReactivity: reactor.xenon.rhoXenon,
  });

  checkEvents(reactor);

  return reactor;
}

// ============================================================
// Event detection
// ============================================================

function checkEvents(reactor) {
  var t = reactor.time;
  var n = reactor.neutron.n;

  if (n > 1.2 && !reactor._flagPowerHigh) {
    reactor._flagPowerHigh = true;
    logEvent(reactor, t, 'alarm', 'Power overpower: ' + (n * 100).toFixed(1) + '%');
  } else if (n <= 1.15) {
    reactor._flagPowerHigh = false;
  }

  if (n < 0.001 && !reactor._flagPowerLow) {
    reactor._flagPowerLow = true;
    logEvent(reactor, t, 'info', 'Reactor near shutdown: P=' + (n * 100).toFixed(4) + '%');
  } else if (n >= 0.005) {
    reactor._flagPowerLow = false;
  }

  if (reactor.az5.active && reactor.control.position >= 1.0 && !reactor._flagAZ5Done) {
    reactor._flagAZ5Done = true;
    logEvent(reactor, t, 'az5', 'AZ-5 complete: all rods fully inserted');
  }
  if (!reactor.az5.active) {
    reactor._flagAZ5Done = false;
  }

  if (reactor.xenon.XeRelative > 2.0 && !reactor._flagXenonHigh) {
    reactor._flagXenonHigh = true;
    logEvent(reactor, t, 'xenon',
      'Xenon overpower: ' + reactor.xenon.XeRelative.toFixed(2) + 'x equilibrium');
  } else if (reactor.xenon.XeRelative <= 1.8) {
    reactor._flagXenonHigh = false;
  }
}

function logEvent(reactor, time, type, msg) {
  reactor.eventLog.push({ time: time, type: type, msg: msg });
  if (reactor.eventLog.length > 1000) {
    reactor.eventLog = reactor.eventLog.slice(-500);
  }
}

// ============================================================
// State snapshot (for UI)
// ============================================================

export function getReactorSnapshot(reactor) {
  var cfg = reactor.config;

  return {
    time: reactor.time,
    timeFormatted: formatTime(reactor.time),
    stepCount: reactor.stepCount,

    powerMWth: reactor.powerMWth,
    powerMWe: reactor.powerMWe,
    powerFrac: reactor.neutron.n,
    powerPercent: (reactor.neutron.n * 100).toFixed(2) + '%',

    rhoTotal: reactor.rhoTotal,
    rhoTotalPCM: reactor.rhoTotal * 1e5,
    period: reactor.period,
    periodFormatted: reactor.period > 1e6 ? 'inf' : reactor.period.toFixed(1) + 's',
    reactivityBreakdown: reactor.reactivityBreakdown,

    neutron: getNeutronSummary(reactor.neutron),
    thermal: getThermalSummary(reactor.thermal),
    xenon: getXenonSummary(reactor.xenon),
    control: getControlSummary(reactor.control),

    protection: getProtectionReport(reactor.protection),

    safety: {
      protection: assessProtectionSafety(reactor.protection),
    },

    opr: calcOPR(reactor.xenon, reactor.control.position, cfg.TOTAL_ROD_WORTH),

    recentEvents: reactor.eventLog.slice(-20),

    running: reactor.running,
  };
}

// ============================================================
// Operator interface
// ============================================================

export function setRodTarget(reactor, target) {
  reactor.control.target = Math.max(0, Math.min(1, target));
  logEvent(reactor, reactor.time, 'operator',
    'Operator sets rod target: ' + (target * 100).toFixed(1) + '%');
}

export function setControlMode(reactor, mode) {
  reactor.control.mode = mode;
  logEvent(reactor, reactor.time, 'operator', 'Control mode: ' + mode);
}

export function manualAZ5(reactor) {
  triggerAZ5(reactor.az5, reactor.time);
  logEvent(reactor, reactor.time, 'az5', 'Operator manually triggered AZ-5');
}

export function bypassProtection(reactor, signalId, reason) {
  var result = bypassSignal(reactor.protection, signalId, reason);
  logEvent(reactor, reactor.time, 'protection',
    'Protection bypass: ' + result.message);
  return result;
}

export function restoreProtection(reactor, signalId) {
  var result = restoreSignal(reactor.protection, signalId);
  logEvent(reactor, reactor.time, 'protection',
    'Protection restored: ' + result.message);
  return result;
}

export function resetReactorAZ5(reactor) {
  var protResult = resetAZ5Latch(reactor.protection);
  if (protResult.success) {
    reactor.az5.active = false;
    reactor.az5.triggerTime = -1;
    logEvent(reactor, reactor.time, 'az5', 'AZ-5 reset');
  }
  return protResult;
}

export function setCoolantFlow(reactor, flowFrac) {
  reactor.thermal.coolantFlowFrac = Math.max(0, Math.min(2, flowFrac));
  logEvent(reactor, reactor.time, 'operator',
    'Coolant flow set: ' + (flowFrac * 100).toFixed(0) + '%');
}

// ============================================================
// Reset
// ============================================================

export function resetReactor(reactor, scenario) {
  if (scenario === undefined) scenario = 'FULL_POWER';
  return createReactor(reactor.config, scenario);
}

// ============================================================
// Batch stepping
// ============================================================

export function runReactor(reactor, duration, dt, inputs, onStep, onStepInterval) {
  if (inputs === undefined) inputs = {};
  if (onStepInterval === undefined) onStepInterval = 10;
  var nSteps = Math.ceil(duration / dt);

  for (var i = 0; i < nSteps; i++) {
    stepReactor(reactor, dt, inputs);

    if (onStep && i % onStepInterval === 0) {
      onStep(getReactorSnapshot(reactor), i, nSteps);
    }

    if (reactor.az5.active && reactor.neutron.n < 1e-6 && reactor.control.position >= 1.0) {
      logEvent(reactor, reactor.time, 'info', 'Reactor safely shutdown');
      break;
    }
  }

  return reactor;
}

// ============================================================
// Utilities
// ============================================================

export function formatTime(seconds) {
  var h = Math.floor(seconds / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var s = (seconds % 60).toFixed(1);
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

export function getReactorPeriod(reactor) {
  return calcReactorPeriod(reactor.neutron);
}

export function isSteadyState(reactor, tolerance) {
  if (tolerance === undefined) tolerance = 0.001;
  return Math.abs(reactor.rhoTotal) < tolerance * 1e-5 && Math.abs(reactor.period) > 1000;
}
