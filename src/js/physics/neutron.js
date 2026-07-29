window.Physics = window.Physics || {};

Physics.Neutron = {};

Physics.Neutron.step = function(dt, state) {
  var P = state.r.power;
  var rho = state.r.reactivity;
  var beta = CONFIG.BETA_EFF;
  var Lambda = CONFIG.LAMBDA;

  if (!state.r.precursors) {
    state.r.precursors = [0, 0, 0, 0, 0, 0];
  }
  var C = state.r.precursors;

  var substeps = 10;
  var h = dt / substeps;

  for (var s = 0; s < substeps; s++) {
    var sumLambdaC = 0;
    for (var i = 0; i < 6; i++) {
      sumLambdaC += CONFIG.LAMBDA_D[i] * C[i];
    }

    var dP = ((rho - beta) / Lambda * P + sumLambdaC) * h;

    for (var j = 0; j < 6; j++) {
      var dC = (CONFIG.BETA_I[j] / Lambda * P - CONFIG.LAMBDA_D[j] * C[j]) * h;
      C[j] += dC;
    }

    P += dP;

    if (P < 0) {
      P = 0;
    }
  }

  state.r.power = P;
};
