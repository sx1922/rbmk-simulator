window.Physics = window.Physics || {};

Physics.AZ5 = {};

Physics.AZ5.fire = function(state, rngFunc) {
  if (state.r.az5Phase !== 0) {
    return 'OK';
  }

  // Phase 0 -> 1: start scram, insert all rods, set timer to 18s
  state.r.az5Phase = 1;
  state.r.az5Timer = 18;

  // Insert all control rods
  for (var i = 0; i < CONFIG.NUM_RODS; i++) {
    state.r.rods[i] = 100;
  }

  // Check for positive scram spike
  var voidFrac = state.r.void;
  var power = state.r.power;

  if (voidFrac > 0.3 && power > 1500) {
    var spikePower = power * (1 + voidFrac * 0.5);

    if (spikePower > CONFIG.P_MELTDOWN) {
      state.r.state = 'EXPLOSION';
      return 'SPIKE';
    }

    state.r.power = spikePower;
    return 'SPIKE';
  }

  return 'OK';
};
