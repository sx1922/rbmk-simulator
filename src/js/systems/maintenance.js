// maintenance.js — 安全系统退化与维修

window.Systems = window.Systems || {};

(function() {
  var Maintenance = {};

  Maintenance.degrade = function(state) {
    for (var i = 0; i < state.safety.length; i++) {
      var pct = 0.3 + Math.random() * 1.2;
      state.safety[i].status -= pct;
      if (state.safety[i].status < 0) state.safety[i].status = 0;
    }
  };

  Maintenance.repair = function(state, index, cost) {
    if (index < 0 || index >= state.safety.length) return false;
    if (state.money < cost) return false;
    state.money -= cost;
    state.safety[index].status = 100;
    return true;
  };

  window.Systems.Maintenance = Maintenance;
})();
