window.Physics = window.Physics || {};

Physics.Xenon = {};

Physics.Xenon.step = function(dt, state) {
  var P = state.r.power;
  var I = state.r.iodine;
  var Xe = state.r.xenon;

  var Phi = (P / CONFIG.RATED_T) * CONFIG.FLUX_FACTOR;

  var dI = (CONFIG.YIELD_I * Phi - CONFIG.LAMBDA_I * I) * dt;
  var dXe = (CONFIG.YIELD_XE * Phi + CONFIG.LAMBDA_I * I - CONFIG.LAMBDA_XE * Xe - CONFIG.SIGMA_XE * Phi * Xe) * dt;

  state.r.iodine += dI;
  state.r.xenon += dXe;

  if (state.r.iodine < 0) {
    state.r.iodine = 0;
  }
  if (state.r.xenon < 0) {
    state.r.xenon = 0;
  }
};
