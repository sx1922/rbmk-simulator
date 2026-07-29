window.Physics = window.Physics || {};

Physics.Protection = {};

Physics.Protection.check = function(state) {
  var alarms = [];
  var r = state.r;
  var t = state.turbine;
  var rated = CONFIG.RATED_T;

  // Overpower (>110%)
  var powerPct = r.power / rated * 100;
  if (powerPct > 110) {
    alarms.push('超功率停堆 (>110%)');
  } else if (powerPct > 88) {
    alarms.push('警告: 功率接近限值 (>88%)');
  }

  // Low ORM (<15 critical, <26 warning)
  var orm = 0;
  for (var i = 0; i < CONFIG.NUM_RODS; i++) {
    orm += r.rods[i] / 100;
  }
  if (orm < CONFIG.ORM_CRIT) {
    alarms.push('ORM 过低 (<15 根)');
  } else if (orm < CONFIG.ORM_MIN) {
    alarms.push('ORM 偏低 (<26 根)');
  } else if (orm < 32) {
    alarms.push('警告: ORM 接近下限 (<32 根)');
  }

  // High fuel temperature (>1600)
  if (r.fuelT > 1600) {
    alarms.push('燃料温度过高 (>1600°C)');
  } else if (r.fuelT > 1280) {
    alarms.push('警告: 燃料温度接近限值 (>1280°C)');
  }

  // High void (>0.5)
  if (r.void > 0.5) {
    alarms.push('空泡份额过高 (>50%)');
  } else if (r.void > 0.4) {
    alarms.push('警告: 空泡份额接近限值 (>40%)');
  }

  // Low flow (<25% rated)
  var flowPct = state.thermal.coolantFlow / CONFIG.FLOW_RATED * 100;
  if (flowPct < 25) {
    alarms.push('冷却剂流量过低 (<25%)');
  } else if (flowPct < 50) {
    alarms.push('警告: 流量偏低');
  }

  // Pump count low
  var pumpsOn = state.thermal.pumpsOn || state.r.pumpsOn || 0;
  if (pumpsOn < 3) {
    alarms.push('主泵数量不足 (<3 台)');
  } else if (pumpsOn < 5) {
    alarms.push('警告: 主泵偏少');
  }

  // Turbine trip
  if (t.tripped) {
    alarms.push('汽轮机跳闸');
  }

  // High radiation
  if (state.rad > 0.1) {
    alarms.push('辐射水平过高 (>0.1 Sv/h)');
  } else if (state.rad > 0.05) {
    alarms.push('警告: 辐射水平偏高');
  }

  return alarms;
};
