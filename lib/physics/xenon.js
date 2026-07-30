import { integralRodWorth } from '../systems/control.js';

var GAMMA_I = 0.0639, GAMMA_XE = 0.00237;
var LAMBDA_I = 2.874e-5, LAMBDA_XE = 2.093e-5;
var SIGMA_A_XE = 2.6e-22, SIGMA_F = 3.5, PHI_0 = 1e18, NU = 2.43;

export var XENON_CONSTANTS = { GAMMA_I: GAMMA_I, GAMMA_XE: GAMMA_XE, LAMBDA_I: LAMBDA_I, LAMBDA_XE: LAMBDA_XE, SIGMA_A_XE: SIGMA_A_XE, SIGMA_F: SIGMA_F, PHI_0: PHI_0, NU: NU };

function equilibrium(pf) {
  var phi = PHI_0 * pf;
  return { Ie: GAMMA_I * SIGMA_F * phi / LAMBDA_I, Xe: (GAMMA_I + GAMMA_XE) * SIGMA_F * phi / (LAMBDA_XE + SIGMA_A_XE * phi) };
}

function xenonReactivity(x) { return -SIGMA_A_XE * x / (NU * SIGMA_F); }

export function createXenonState(opts) {
  if (!opts) opts = {};
  var pf = opts.powerFrac || 1, h = opts.hoursAtPower !== undefined ? opts.hoursAtPower : 100, eq = equilibrium(pf);
  var I, Xe;
  if (h >= 100) { I = eq.Ie; Xe = eq.Xe; }
  else { var t = h * 3600; I = eq.Ie * (1 - Math.exp(-LAMBDA_I * t)); Xe = eq.Xe * (1 - Math.exp(-LAMBDA_XE * t)); }
  var r = xenonReactivity(Xe);
  return { I: I, Xe: Xe, rhoXenon: r, rhoXenonDollars: r / 0.001, XeRelative: Xe / eq.Xe, equilibriumXe: eq.Xe, timeSinceShutdown: -1 };
}

export function stepXenon(st, dt, inp) {
  var phi = PHI_0 * Math.max(inp.powerFrac, 0);
  var ie = phi > 0 ? GAMMA_I * SIGMA_F * phi / LAMBDA_I : 0;
  st.I = ie + (st.I - ie) * Math.exp(-LAMBDA_I * dt);
  var le = LAMBDA_XE + SIGMA_A_XE * phi;
  var xs = GAMMA_XE * SIGMA_F * phi + LAMBDA_I * st.I;
  var xe2 = le > 0 ? xs / le : 0;
  st.Xe = xe2 + (st.Xe - xe2) * Math.exp(-le * dt);
  st.I = Math.max(st.I, 0); st.Xe = Math.max(st.Xe, 0);
  st.rhoXenon = xenonReactivity(st.Xe);
  var ne = equilibrium(1);
  st.XeRelative = st.Xe / ne.Xe;
  st.equilibriumXe = xe2;
  st.timeSinceShutdown = inp.powerFrac < 0.001 ? (st.timeSinceShutdown < 0 ? 0 : st.timeSinceShutdown + dt) : -1;
  st.rhoXenonDollars = st.rhoXenon / 0.001;
}

export function calcOPR(xenonState, rodPosition, totalRodWorth) {
  var rhoRodCurrent = Math.abs(integralRodWorth(rodPosition));
  var remainingWorth = totalRodWorth - rhoRodCurrent;
  var xenonPenalty = Math.abs(xenonState.rhoXenon);
  var netWorth = remainingWorth - xenonPenalty;
  var worthPerRod = totalRodWorth / 211;
  var oprRods = Math.max(0, netWorth / worthPerRod);
  return { opr: netWorth, oprRods: oprRods, safe: oprRods >= 15, remainingWorth: remainingWorth, xenonPenalty: xenonPenalty, netWorth: netWorth, worthPerRod: worthPerRod };
}

export function getXenonSummary(st) {
  return { XeRelative: st.XeRelative, rhoXenon: st.rhoXenon, rhoXenonDollars: st.rhoXenonDollars, isShutdown: st.timeSinceShutdown >= 0, equilibriumXe: st.equilibriumXe };
}

export function assessXenonSafety(st, rodPos, totalW) {
  var opr = calcOPR(st, rodPos, totalW);
  return { level: opr.safe ? 'normal' : 'critical', messages: [], opr: opr };
}
