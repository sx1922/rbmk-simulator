window.Physics = window.Physics || {};

Physics.Turbine = {};

Physics.Turbine.step = function(dt, state) {
  var t = state.turbine;

  // Steam pressure proportional to reactor power
  t.steamPressure = (state.r.power / CONFIG.RATED_T) * CONFIG.STEAM_PRES_RATED;

  // Bypass: 0-100%, open bypasses turbine
  var bypassFrac = t.bypassValve / 100;
  var bypassFactor = 1.0 - bypassFrac;
  if (bypassFactor < 0.01) {
    bypassFactor = 0.01;
  }

  // Steam flow proportional to pressure * sqrt(bypass factor)
  t.steamFlow = t.steamPressure * 200 * Math.sqrt(bypassFactor);

  if (!t.tripped) {
    // Speed coupled to steam flow, nominal 3000 rpm
    var targetSpeed = (t.steamFlow / (CONFIG.STEAM_PRES_RATED * 200)) * CONFIG.TURBINE_VNOM;
    t.speed += (targetSpeed - t.speed) * dt * 0.2;

    if (t.speed < 0) {
      t.speed = 0;
    }

    // Electric power: steam_flow * enthalpy_drop * efficiency
    var enthalpyDrop = 2500e3;
    var efficiency = 0.35;
    t.electricPower = t.steamFlow * enthalpyDrop * efficiency / 1e6;

    // Steam temperature (saturation approximation)
    t.steamTemp = 180 + t.steamPressure * 15;

    // Feedwater flow tracks steam flow
    t.fwFlow = t.steamFlow;

    // Health degradation - random vibration increase per step
    t.vibration += (Math.random() - 0.5) * 0.002 * dt;
    if (t.vibration < 0) {
      t.vibration = 0;
    }

    t.axialShift += (Math.random() - 0.5) * 0.0005 * dt;
    if (t.axialShift < 0) {
      t.axialShift = 0;
    }

    t.health -= t.vibration * 0.005 * dt + Math.random() * 0.001 * dt;
    if (t.health < 0) {
      t.health = 0;
    }

    // Condenser vacuum degrades with health
    t.condenserVacuum = 0.005 + (100 - t.health) * 0.0001;

    // Trip conditions
    if (t.speed > CONFIG.TURBINE_VMAX) {
      t.tripped = true;
    }
    if (t.condenserVacuum < 0.003) {
      t.tripped = true;
    }
    if (t.vibration > 1.0) {
      t.tripped = true;
    }
    if (t.axialShift > 0.8) {
      t.tripped = true;
    }
  } else {
    // Turbine tripped - spin down
    t.speed *= Math.exp(-dt * 0.5);
    if (t.speed < 1) {
      t.speed = 0;
    }
    t.electricPower = 0;
    t.steamFlow = t.steamPressure * 200 * Math.sqrt(bypassFactor) * 0.3;

    if (t.health < 0) {
      t.health = 0;
    }
  }

  if (t.health > 100) {
    t.health = 100;
  }
};
