export var THERMAL_CONSTANTS = { TV: 2.0, TF: 2.0, TC: 2.0 };

export function createThermalState(opts) {
  if (!opts) opts = {};
  var pf = opts.powerFrac || 1, cf = opts.coolantFlow || 1;
  return {
    voidFraction: 0.27 * pf,
    fuelTempAvg: 700 + 500 * pf,
    coolantTempAvg: 270 + 15 * pf / cf,
    pressure: opts.pressure || 6.5e6,
    waterLevel: 1.5,
    coolantFlowFrac: cf,
    fuelExitTemp: 285 + 10 * pf / cf,
  };
}

export function stepThermal(st, dt, inp) {
  var pf = Math.max(inp.powerFrac, 0), cf = Math.max(inp.coolantFlowFrac || 1, 0.01);
  st.voidFraction += (Math.min(0.27 * pf, 0.85) - st.voidFraction) * (1 - Math.exp(-dt / 2.0));
  st.fuelTempAvg += (700 + 500 * pf - st.fuelTempAvg) * (1 - Math.exp(-dt / 2.0));
  st.coolantTempAvg += (270 + 15 * pf / cf - st.coolantTempAvg) * (1 - Math.exp(-dt / 2.0));
}

export function getThermalSummary(st) {
  return { voidFraction: st.voidFraction, fuelTempAvg: st.fuelTempAvg, coolantTempAvg: st.coolantTempAvg, coolantFlowFrac: st.coolantFlowFrac, pressure: st.pressure, waterLevel: st.waterLevel, fuelExitTemp: st.fuelExitTemp };
}
