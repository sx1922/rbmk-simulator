window.Physics = window.Physics || {};

Physics.Reactivity = {};

Physics.Reactivity.compute = function(state) {
  var rho = 0;

  // Rod reactivity
  var rho_rods = 0;
  for (var i = 0; i < CONFIG.NUM_RODS; i++) {
    rho_rods += -(state.r.rods[i] / 100) * 0.0004;
  }
  rho += rho_rods;

  // Void reactivity
  var rho_void = CONFIG.ALPHA_VOID * state.r.void * 100;
  rho += rho_void;

  // Fuel temperature reactivity
  var rho_fuel = CONFIG.ALPHA_FUEL * (state.r.fuelT - 300);
  rho += rho_fuel;

  // Xenon reactivity
  var rho_xenon = -0.001 * state.r.xenon / (1 + state.r.xenon);
  rho += rho_xenon;

  // Refuel bonus
  rho += state.r.refuelBonus;

  state.r.reactivity = rho;
};
