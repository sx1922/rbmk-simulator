export var BETA_TOTAL = 0.0065;
export var BETA_I = [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273];
export var LAMBDA_D = [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01];
export var LAMBDA_PROMPT = 1e-4;
var NEUTRON_SOURCE = 1e-8;

export var NEUTRON_CONSTANTS = {
  BETA_TOTAL: BETA_TOTAL,
  BETA_I: BETA_I,
  LAMBDA_D: LAMBDA_D,
  LAMBDA_PROMPT: LAMBDA_PROMPT,
  SOURCE: NEUTRON_SOURCE,
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function derivs(n, C, rho) {
  var ns = Math.max(n, 0);
  var dn = ((rho - BETA_TOTAL) / LAMBDA_PROMPT) * ns + NEUTRON_SOURCE;
  for (var i = 0; i < 6; i++) dn += LAMBDA_D[i] * C[i];
  var dC = [];
  for (var j = 0; j < 6; j++) dC[j] = (BETA_I[j] / LAMBDA_PROMPT) * ns - LAMBDA_D[j] * C[j];
  return { dn: dn, dC: dC };
}

function stepRK4(n, C, rho, dt) {
  var k1 = derivs(n, C, rho);
  var n2 = n + 0.5 * dt * k1.dn, C2 = [];
  for (var i = 0; i < 6; i++) C2[i] = C[i] + 0.5 * dt * k1.dC[i];
  var k2 = derivs(n2, C2, rho);
  var n3 = n + 0.5 * dt * k2.dn, C3 = [];
  for (var j = 0; j < 6; j++) C3[j] = C[j] + 0.5 * dt * k2.dC[j];
  var k3 = derivs(n3, C3, rho);
  var n4 = n + dt * k3.dn, C4 = [];
  for (var k = 0; k < 6; k++) C4[k] = C[k] + dt * k3.dC[k];
  var k4 = derivs(n4, C4, rho);
  var nNew = n + (dt / 6) * (k1.dn + 2 * k2.dn + 2 * k3.dn + k4.dn);
  var CNew = [];
  for (var m = 0; m < 6; m++) { CNew[m] = C[m] + (dt / 6) * (k1.dC[m] + 2 * k2.dC[m] + 2 * k3.dC[m] + k4.dC[m]); CNew[m] = Math.max(CNew[m], 0); }
  nNew = Math.max(nNew, 0);
  return { n: nNew, C: CNew };
}

export function createNeutronState(opts) {
  if (!opts) opts = {};
  var n0 = opts.n0 || 1;
  var eq = opts.equilibrium || false;
  var C = [];
  for (var i = 0; i < 6; i++) C[i] = eq ? BETA_I[i] / (LAMBDA_D[i] * LAMBDA_PROMPT) * n0 : 0;
  return { n: n0, C: C, prevN: n0, prevRho: 0 };
}

export function stepNeutron(st, dt, inp) {
  var n = st.n, C = st.C.slice(), rho = inp.rho;
  var res = stepRK4(n, C, rho, dt);
  st.n = clamp(res.n, 0, 1e100);
  for (var i = 0; i < 6; i++) st.C[i] = Math.max(res.C[i], 0);
  st.prevRho = rho;
}

export function inhourPeriod(rho) {
  if (Math.abs(rho) < 1e-12) return 1e9;
  if (rho >= BETA_TOTAL) return LAMBDA_PROMPT / (rho - BETA_TOTAL);
  var T = rho > 0 ? Math.max(1 / rho, 1) : 1e9;
  for (var i = 0; i < 50; i++) {
    var f = -rho, fp = 0;
    for (var j = 0; j < 6; j++) { var d = 1 + LAMBDA_D[j] * T; f += BETA_I[j] / d; fp -= BETA_I[j] * LAMBDA_D[j] / (d * d); }
    if (Math.abs(f) < 1e-10) break;
    var dT = Math.abs(fp) > 1e-20 ? f / fp : 0;
    if (dT > T / 2) dT = T / 2; if (dT < -T / 2) dT = -T / 2;
    T -= dT; if (T <= 0) T = 1;
  }
  return T;
}

export function calcReactorPeriod(st) {
  return inhourPeriod(st.prevRho);
}

export function getNeutronSummary(st) {
  return { n: st.n, prevRho: st.prevRho };
}
