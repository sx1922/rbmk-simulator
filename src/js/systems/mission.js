// mission.js — 安全试验任务链（14 阶段）

window.Systems = window.Systems || {};

(function() {
  var Mission = {};

  Mission.checkTrigger = function(state) {
    var powerPct = state.r.power / CONFIG.RATED_T * 100;
    return state.daysOp >= 1 && powerPct >= 80 && state.politics >= 30;
  };

  Mission.start = function(state) {
    state.mission.active = true;
    state.mission.phase = 'order_received';
    state.mission.hoursInPhase = 0;
    state.mission.completed = false;
    state.mission.failed = false;
    state.logs.push('【任务】收到安全试验指令，要求降低功率进行测试');
  };

  Mission.handleDecision = function(state, choice) {
    if (state.mission.phase === 'decision') {
      if (choice === 'continue') {
        state.mission.phase = 'rod_withdraw';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】决定继续试验，开始逐步提升控制棒');
      } else {
        state.mission.phase = 'aborted';
        state.mission.failed = true;
        state.mission.active = false;
        state.logs.push('【任务】试验中止，未完成');
      }
    } else if (state.mission.phase === 'final_choice') {
      if (choice === 'continue') {
        state.mission.phase = 'completed';
        state.mission.completed = true;
        state.mission.active = false;
        state.money += 1000000;
        state.politics += 20;
        state.logs.push('【任务】安全试验圆满完成！获得奖金 100 万 ₽，政治信任 +20');
      } else {
        state.mission.phase = 'aborted';
        state.mission.failed = true;
        state.mission.active = false;
        state.logs.push('【任务】试验在最后阶段中止');
      }
    }
  };

  function avgRods(state) {
    var rods = state.r.rods;
    var sum = 0;
    for (var i = 0; i < rods.length; i++) {
      sum += rods[i];
    }
    return sum / rods.length;
  }

  Mission.checkProgress = function(state) {
    if (!state.mission.active) return;

    state.mission.hoursInPhase = state.mission.hoursInPhase || 0;
    state.mission.hoursInPhase++;

    var phase = state.mission.phase;
    var h = state.mission.hoursInPhase;

    if (phase === 'order_received') {
      if (h >= 24) {
        state.mission.phase = 'power_reduction';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】收到指令已 24 小时，开始降低功率');
      }
    } else if (phase === 'power_reduction') {
      if (state.r.power < 700) {
        state.mission.phase = 'dispatch_call';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】功率已降至 700 MWt 以下，调度中心要求等待');
      }
    } else if (phase === 'dispatch_call') {
      if (h >= 24) {
        state.mission.phase = 'low_power_wait';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】等待 24 小时，准备进一步降功率');
      }
    } else if (phase === 'low_power_wait') {
      if (state.r.power < 500 || h >= 48) {
        state.mission.phase = 'power_drop';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】功率已降至 500 MWt 以下，进入准备阶段');
      }
    } else if (phase === 'power_drop') {
      if (h >= 24) {
        state.mission.phase = 'decision';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】降功率完成，请决定是否继续试验');
      }
    } else if (phase === 'rod_withdraw') {
      if (avgRods(state) > 50) {
        state.mission.phase = 'experiment_prep';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】控制棒已抽出超过 50%，准备试验');
      }
    } else if (phase === 'experiment_prep') {
      if (h >= 2) {
        state.mission.phase = 'turbine_trip';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】准备就绪，等待汽轮机脱扣');
      }
    } else if (phase === 'turbine_trip') {
      if (state.turbine.tripped) {
        state.mission.phase = 'power_rise';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】汽轮机已脱扣，监测功率变化');
      }
    } else if (phase === 'power_rise') {
      if (h >= 24) {
        state.mission.phase = 'final_choice';
        state.mission.hoursInPhase = 0;
        state.logs.push('【任务】功率变化监测完成，请做出最终决定');
      }
    }
  };

  window.Systems.Mission = Mission;
})();
