window.Physics = window.Physics || {};

Physics.Thermal = {};

Physics.Thermal.step = function(dt, state) {
  var zones = state.thermal.zones;
  var P_total = state.r.power;
  var flow_m3h = state.thermal.coolantFlow;
  var flow_per_zone_kg_s = (flow_m3h / 5) * 1000 / 3600;

  if (flow_m3h <= 0) {
    flow_per_zone_kg_s = 0;
  }

  var totalVoid = 0;

  for (var i = 0; i < 5; i++) {
    var zone = zones[i];
    var P_zone = CONFIG.ZONE_POWER_FRAC[i] * P_total;
    var P_zone_watts = P_zone * 1e6;
    var mass = CONFIG.ZONE_MASS[i];
    var cp = CONFIG.CP_COOLANT;

    zone.power = P_zone;

    // Coolant outlet temperature
    var dT_out = (P_zone_watts - cp * flow_per_zone_kg_s * (zone.tOut - zone.tIn)) / (mass * cp) * dt;
    zone.tOut += dT_out;

    if (zone.tOut < zone.tIn) {
      zone.tOut = zone.tIn;
    }
    if (zone.tOut > 2000) {
      zone.tOut = 2000;
    }

    // Cladding temperature follows coolant
    zone.tClad = zone.tOut;

    // Fuel temperature
    var h_coeff = 5000;
    var m_fuel = 500;
    var cp_fuel = CONFIG.CP_FUEL;

    var dT_fuel = (P_zone_watts - h_coeff * (zone.tFuel - zone.tClad)) / (m_fuel * cp_fuel) * dt;
    zone.tFuel += dT_fuel;

    if (zone.tFuel < zone.tClad) {
      zone.tFuel = zone.tClad;
    }
    if (zone.tFuel > 5000) {
      zone.tFuel = 5000;
    }

    // Void fraction
    if (zone.tOut > CONFIG.TSAT_4MPA) {
      var deltaT = zone.tOut - zone.tIn;
      if (deltaT > 1) {
        zone.void = (zone.tOut - CONFIG.TSAT_4MPA) / deltaT * 0.8;
      } else {
        zone.void = 0.8;
      }
      if (zone.void > 1.0) {
        zone.void = 1.0;
      }
    } else {
      zone.void = 0;
    }

    // DNBR: departure from nucleate boiling ratio
    var powerFrac = CONFIG.ZONE_POWER_FRAC[i];
    zone.dnbr = 5.0 - powerFrac * 3.5;
    if (zone.dnbr < 0.5) {
      zone.dnbr = 0.5;
    }

    // Boiling flag
    zone.boiling = zone.void > 0.05;

    totalVoid += zone.void;
  }

  var avgVoid = totalVoid / 5;
  state.thermal.totalVoid = avgVoid;
  state.r.void = avgVoid;

  // Average fuel temperature across zones
  var avgFuelT = 0;
  for (var k = 0; k < 5; k++) {
    avgFuelT += zones[k].tFuel;
  }
  state.r.fuelT = avgFuelT / 5;
};
