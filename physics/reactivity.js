import { BETA_TOTAL } from './neutron.js';
import { TOTAL_W } from '../systems/control.js';

var ALPHA_VOID = 0.273;
var ALPHA_DOPPLER = -1.7e-4;
var ALPHA_MOD = 0.0002;
var INITIAL_EXCESS = 0.002;

export var REACTIVITY_CONSTANTS = { ALPHA_VOID: ALPHA_VOID, ALPHA_DOPPLER: ALPHA_DOPPLER, ALPHA_MOD: ALPHA_MOD, INITIAL_EXCESS: INITIAL_EXCESS, BETA_TOTAL: BETA_TOTAL };

export function totalReactivity(opts) {
  var rod = opts.rodPosition || 0;
  var v = opts.voidFraction || 0;
  var tf = opts.fuelTemp || 1200;
  var tc = opts.coolantTemp || 285;
  var xe = opts.xenonReactivity || 0;
  var pf = opts.powerFrac || 0;
  var tRef = opts.dopplerRefTemp !== undefined ? opts.dopplerRefTemp : 1200;
  return rhoR(rod) + rhoV(v) + rhoF(tf, tRef) + rhoC(tc) + xe + rhoB(pf);
}

function intW(x) { return -TOTAL_W * (1 - Math.cos(Math.PI * x)) / 2; }
function rhoR(v) { return intW(v); }
function rhoV(v) { return ALPHA_VOID * v; }
function rhoF(t, tRef) { return ALPHA_DOPPLER * (t - tRef); }
function rhoC(t) { return ALPHA_MOD * (t - 285); }
function rhoB(p) { return INITIAL_EXCESS; }

export function getReactivityBreakdown(opts) {
  var tRef = opts.dopplerRefTemp !== undefined ? opts.dopplerRefTemp : 1200;
  return { rods: rhoR(opts.rodPosition || 0), void: rhoV(opts.voidFraction || 0), doppler: rhoF(opts.fuelTemp || 1200, tRef), coolant: rhoC(opts.coolantTemp || 285), xenon: opts.xenonReactivity || 0, burnup: rhoB(opts.powerFrac || 0) };
}
