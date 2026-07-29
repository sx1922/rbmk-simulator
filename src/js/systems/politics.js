// politics.js — 月度政治/配额结算

window.Systems = window.Systems || {};

(function() {
  var Politics = {};

  Politics.monthly = function(state) {
    var met = false;
    var message = '';

    if (state.quotaDone >= state.quota) {
      state.money += 500000;
      state.politics += 10;
      met = true;
      message = '发电指标完成，获得奖金 50 万 ₽，政治信任 +10';
    } else {
      var diff = state.diff;
      var decay = CONFIG.DIFFICULTIES[diff].politicsDecay;
      state.politics -= decay;
      message = '未完成发电指标，政治信任 -' + decay;
    }

    state.quotaDone = 0;

    return { met: met, message: message };
  };

  window.Systems.Politics = Politics;
})();
