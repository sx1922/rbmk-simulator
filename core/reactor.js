import { createNeutronState, stepNeutron, calcReactorPeriod } from '../physics/neutron.js';
import { totalReactivity, getReactivityBreakdown, REACTIVITY_CONSTANTS } from '../physics/reactivity.js';
import { createThermalState, stepThermal, getThermalSummary } from '../physics/thermal.js';
import { createXenonState, stepXenon, calcOPR, getXenonSummary, assessXenonSafety } from '../physics/xenon.js';
import { createControlState, stepControl, getControlSummary, assessControlSafety, controlRodReactivity, integralRodWorth, tipEffect } from '../systems/control.js';
import { createAZ5State, stepAZ5, triggerAZ5 } from '../systems/az5.js';
import { createProtectionState, stepProtection, getProtectionReport, assessProtectionSafety, bypassSignal, restoreSignal, resetAZ5Latch, setProtectionDisabled } from '../systems/protection.js';

export var REACTOR_CONFIG = {
  RATED_THERMAL_POWER: 3200e6,
  RATED_ELECTRIC_POWER: 1000e6,
  THERMAL_EFFICIENCY: 0.3125,
  DT_NEUTRON: 0.01,
  DT_THERMAL: 0.1,
  DT_XENON: 1.0,
  DT_PROTECTION: 0.1,
  TOTAL_ROD_WORTH: 0.10,
  SCENARIOS: {
    FULL_POWER: { name:'Full power', powerFrac:1, rodPosition:0.5, hoursAtPower:100, coolantFlow:1, pressure:6.5e6 },
    CHERNOBYL_PRE: { name:'Pre-Chernobyl', powerFrac:0.063, rodPosition:0.04, hoursAtPower:0, coolantFlow:1.5, pressure:6e6 },
  },
};

function findCritRod(cfg, sc) {
  var th = createThermalState({ powerFrac:sc.powerFrac, coolantFlow:sc.coolantFlow, pressure:sc.pressure });
  var xe = createXenonState({ powerFrac:sc.powerFrac, hoursAtPower:sc.hoursAtPower });
  var lo = 0, hi = 1;
  for (var i = 0; i < 30; i++) {
    var mid = (lo + hi) / 2;
    var r = totalReactivity({ rodPosition:mid, voidFraction:th.voidFraction, fuelTemp:th.fuelTempAvg, coolantTemp:th.coolantTempAvg, xenonReactivity:xe.rhoXenon, powerFrac:sc.powerFrac, dopplerRefTemp:th.fuelTempAvg }) + tipEffect(mid);
    if (Math.abs(r) < 1e-10) return mid;
    if (r > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function createReactor(config, scenarioName) {
  if (config === undefined) config = {};
  if (scenarioName === undefined) scenarioName = 'FULL_POWER';
  var cfg = Object.assign({}, REACTOR_CONFIG, config);
  var sc = cfg.SCENARIOS[scenarioName] || cfg.SCENARIOS.FULL_POWER;
  var pos = scenarioName === 'CHERNOBYL_PRE' ? sc.rodPosition : findCritRod(cfg, sc);
  var neutron = createNeutronState({ n0: sc.powerFrac, equilibrium: true });
  var thermal = createThermalState({ powerFrac: sc.powerFrac, coolantFlow: sc.coolantFlow, pressure: sc.pressure });
  var xenon = createXenonState({ powerFrac: sc.powerFrac, hoursAtPower: sc.hoursAtPower });
  var control = createControlState({ position: pos, mode: 'manual' });
  var az5 = createAZ5State();
  var protection = createProtectionState();
  var rho0 = totalReactivity({ rodPosition:pos, voidFraction:thermal.voidFraction, fuelTemp:thermal.fuelTempAvg, coolantTemp:thermal.coolantTempAvg, xenonReactivity:xenon.rhoXenon, powerFrac:sc.powerFrac, dopplerRefTemp:thermal.fuelTempAvg }) + control.tipEffect;
  return {
    neutron: neutron, thermal: thermal, xenon: xenon, control: control, az5: az5, protection: protection,
    time: 0, stepCount: 0,
    powerMWth: sc.powerFrac * cfg.RATED_THERMAL_POWER / 1e6,
    powerMWe: sc.powerFrac * cfg.RATED_ELECTRIC_POWER / 1e6,
    rhoTotal: rho0, period: Infinity,
    dopplerRefTemp: thermal.fuelTempAvg,
    reactivityBreakdown: getReactivityBreakdown({ rodPosition:pos, voidFraction:thermal.voidFraction, fuelTemp:thermal.fuelTempAvg, coolantTemp:thermal.coolantTempAvg, xenonReactivity:xenon.rhoXenon, powerFrac:sc.powerFrac, dopplerRefTemp:thermal.fuelTempAvg }),
    running: true, eventLog: [{ time:0, type:'init', msg:'Init' }],
    config: cfg,
    _fPH: false, _fPL: false, _fAD: false, _fXH: false,
  };
}

function logE(r, t, ty, m) { r.eventLog.push({ time:t, type:ty, msg:m }); if (r.eventLog.length > 1000) r.eventLog = r.eventLog.slice(-500); }

export function stepReactor(r, dt, inputs) {
  if (!inputs) inputs = {};
  var cfg = r.config;
  var rt = inputs.rodTarget, az5b = inputs.az5Button || false, cm = inputs.controlMode || 'manual', ps = inputs.powerSetpoint || 1, pl = inputs.powerLoss || false, sg = inputs.seismicG || 0;
  if (!r.running) return r;
  var t = r.time, end = t + dt;
  while (t < end - 1e-12) {
    var sdt = Math.min(cfg.DT_NEUTRON, end - t);
    if (r.stepCount % Math.round(cfg.DT_PROTECTION / cfg.DT_NEUTRON) === 0) {
      var period = calcReactorPeriod(r.neutron), opr = calcOPR(r.xenon, r.control.position, cfg.TOTAL_ROD_WORTH);
      stepProtection(r.protection, cfg.DT_PROTECTION, t, { powerFrac:r.neutron.n, period:period, pressure:r.thermal.pressure, waterLevel:r.thermal.waterLevel||1.5, coolantFlow:r.thermal.coolantFlowFrac||1, fuelExitTemp:r.thermal.fuelExitTemp||285, oprRods:opr.oprRods, manualAZ5:az5b, powerLoss:pl, seismicG:sg });
      if (r.protection.az5Demand && !r.az5.active) { triggerAZ5(r.az5, t); logE(r, t, 'protection', 'AZ-5:' + r.protection.az5Cause); }
    }
    var crt = rt !== undefined ? rt : r.control.target;
    var ci = { targetPosition: crt, az5Signal: r.az5.active, autoInputs: { powerError: r.neutron.n - ps } };
    r.control.mode = r.az5.active ? 'az5' : cm;
    stepControl(r.control, sdt, ci);
    var rho = totalReactivity({ rodPosition:r.control.position, voidFraction:r.thermal.voidFraction, fuelTemp:r.thermal.fuelTempAvg, coolantTemp:r.thermal.coolantTempAvg, xenonReactivity:r.xenon.rhoXenon, powerFrac:r.neutron.n, dopplerRefTemp:r.dopplerRefTemp });
    r.rhoTotal = rho + r.control.tipEffect;
    stepNeutron(r.neutron, sdt, { rho: r.rhoTotal }); if (r.neutron.n < 1e-10) r.neutron.n = 1e-10;
    if (r.stepCount % Math.round(cfg.DT_THERMAL / cfg.DT_NEUTRON) === 0) stepThermal(r.thermal, cfg.DT_THERMAL, { powerFrac:r.neutron.n, coolantFlowFrac:r.thermal.coolantFlowFrac||1 });
    if (r.stepCount % Math.round(cfg.DT_XENON / cfg.DT_NEUTRON) === 0) stepXenon(r.xenon, cfg.DT_XENON, { powerFrac:r.neutron.n });
    t += sdt; r.time = t; r.stepCount++;
  }
  r.powerMWth = r.neutron.n * cfg.RATED_THERMAL_POWER / 1e6;
  r.powerMWe = r.neutron.n * cfg.RATED_ELECTRIC_POWER / 1e6;
  r.period = calcReactorPeriod(r.neutron);
  r.reactivityBreakdown = getReactivityBreakdown({ rodPosition:r.control.position, voidFraction:r.thermal.voidFraction, fuelTemp:r.thermal.fuelTempAvg, coolantTemp:r.thermal.coolantTempAvg, xenonReactivity:r.xenon.rhoXenon, powerFrac:r.neutron.n, dopplerRefTemp:r.dopplerRefTemp });
  return r;
}

export function runReactor(r, dur, dt, inputs) {
  if (!inputs) inputs = {};
  var n = Math.ceil(dur / dt);
  for (var i = 0; i < n; i++) { stepReactor(r, dt, inputs); if (r.az5.active && r.neutron.n < 1e-6 && r.control.position >= 1) break; }
  return r;
}

export function getReactorSnapshot(r) {
  return {
    time: r.time, timeFormatted: formatTime(r.time), stepCount: r.stepCount,
    powerMWth: r.powerMWth, powerMWe: r.powerMWe, powerFrac: r.neutron.n, powerPercent: (r.neutron.n * 100).toFixed(2) + '%',
    rhoTotal: r.rhoTotal, rhoTotalPCM: r.rhoTotal * 1e5, period: r.period, periodFormatted: r.period > 1e6 ? 'inf' : r.period.toFixed(1) + 's',
    reactivityBreakdown: r.reactivityBreakdown,
    neutron: getNeutronSummarySimple(r.neutron), thermal: getThermalSummary(r.thermal), xenon: getXenonSummary(r.xenon), control: getControlSummary(r.control),
    az5: { active: r.az5.active, triggerTime: r.az5.triggerTime },
    protection: getProtectionReport(r.protection),
    safety: { protection: assessProtectionSafety(r.protection), xenon: assessXenonSafety(r.xenon, r.control.position, r.config.TOTAL_ROD_WORTH), control: assessControlSafety(r.control, calcOPR(r.xenon, r.control.position, r.config.TOTAL_ROD_WORTH).oprRods) },
    opr: calcOPR(r.xenon, r.control.position, r.config.TOTAL_ROD_WORTH),
    recentEvents: r.eventLog.slice(-20), running: r.running,
  };
}

function getNeutronSummarySimple(st) { return { n: st.n, prevRho: st.prevRho }; }

export function setRodTarget(r, t) { r.control.target = Math.max(0, Math.min(1, t)); logE(r, r.time, 'operator', 'Rod target: ' + (t * 100).toFixed(1) + '%'); }
export function setControlMode(r, m) { r.control.mode = m; logE(r, r.time, 'operator', 'Mode: ' + m); }
export function manualAZ5(r) { triggerAZ5(r.az5, r.time); logE(r, r.time, 'az5', 'Manual AZ-5'); }
export function bypassProtection(r, id, reason) { var res = bypassSignal(r.protection, id, reason); logE(r, r.time, 'protection', res.message); return res; }
export function restoreProtection(r, id) { var res = restoreSignal(r.protection, id); logE(r, r.time, 'protection', res.message); return res; }
export function resetReactorAZ5(r) { var res = resetAZ5Latch(r.protection); if (res.success) { r.az5.active = false; r.az5.triggerTime = -1; logE(r, r.time, 'az5', 'AZ-5 reset'); } return res; }
export function setCoolantFlow(r, f) { r.thermal.coolantFlowFrac = Math.max(0, Math.min(2, f)); logE(r, r.time, 'operator', 'Flow: ' + (f * 100).toFixed(0) + '%'); }
export function resetReactor(r, sn) { if (!sn) sn = 'FULL_POWER'; return createReactor(r.config, sn); }
export function getReactorPeriod(r) { return calcReactorPeriod(r.neutron); }
export function isSteadyState(r, tol) { if (tol === undefined) tol = 0.001; return Math.abs(r.rhoTotal) < tol * 1e-5 && Math.abs(r.period) > 1000; }

export function formatTime(s) {
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(1);
  if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}
