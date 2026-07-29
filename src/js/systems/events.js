// events.js — 随机事件系统

window.Systems = window.Systems || {};

(function() {
  var Events = {};

  var EVENTS = [
    {
      title: '设备故障',
      desc: '一台主冷却泵出现异常振动，可能随时失效。',
      choices: [
        { label: '立即停泵检修', fx: function(state) { state.money -= 20000; state.logs.push('停泵检修，支出 2 万 ₽'); } },
        { label: '降低功率运行', fx: function(state) { state.r.power *= 0.7; } },
        { label: '忽略继续运行', fx: function(state) { state.r.power *= 0.95; state.turbine.health -= 5; } },
      ],
    },
    {
      title: '管道泄漏',
      desc: '二回路管道发现微小裂缝，冷却水缓慢泄漏。',
      choices: [
        { label: '隔离泄漏段', fx: function(state) { state.money -= 15000; state.logs.push('隔离管道，支出 1.5 万 ₽'); } },
        { label: '带压堵漏', fx: function(state) { state.money -= 8000; state.turbine.steamPressure *= 0.9; } },
        { label: '不做处理', fx: function(state) { state.turbine.steamPressure -= 0.5; state.rad += 0.02; } },
      ],
    },
    {
      title: '电网扰动',
      desc: '外部电网发生频率波动，对发电机组造成冲击。',
      choices: [
        { label: '降低出力稳定电网', fx: function(state) { state.r.power *= 0.8; } },
        { label: '保持当前出力', fx: function(state) { state.turbine.health -= 3; } },
        { label: '切离电网孤岛运行', fx: function(state) { state.turbine.online = false; state.turbine.speed *= 0.9; } },
      ],
    },
    {
      title: '仪表故障',
      desc: '控制室多个仪表读数异常，无法确定真实参数。',
      choices: [
        { label: '手动校验仪表', fx: function(state) { state.money -= 5000; state.logs.push('校验仪表，支出 5000 ₽'); } },
        { label: '参考备品仪表', fx: function(state) { /* no direct penalty */ } },
        { label: '凭经验继续运行', fx: function(state) { state.r.power *= 1.05; state.incidents++; } },
      ],
    },
    {
      title: '火警误报',
      desc: '汽轮机厂房火警系统报警，但未发现明火。',
      choices: [
        { label: '全面排查', fx: function(state) { state.money -= 10000; state.logs.push('消防排查，支出 1 万 ₽'); } },
        { label: '复位报警系统', fx: function(state) { state.logs.push('复位火警系统'); } },
        { label: '疏散人员', fx: function(state) { for (var i = 0; i < state.staff.length; i++) state.staff[i].morale -= 5; } },
      ],
    },
    {
      title: '冷却剂化学异常',
      desc: '一回路冷却剂 pH 值偏离正常范围，腐蚀风险增加。',
      choices: [
        { label: '启动化学加药', fx: function(state) { state.money -= 12000; state.logs.push('化学加药处理，支出 1.2 万 ₽'); } },
        { label: '部分换水稀释', fx: function(state) { state.money -= 6000; state.rad *= 0.95; } },
        { label: '暂不处理', fx: function(state) { state.safety[0].status -= 10; } },
      ],
    },
    {
      title: '汽轮机振动',
      desc: '汽轮机轴系振动值升高，轴承温度上升。',
      choices: [
        { label: '降低负荷检查', fx: function(state) { state.r.power *= 0.85; state.turbine.vibration = 0; } },
        { label: '提升润滑油压', fx: function(state) { state.money -= 3000; state.turbine.vibration *= 0.7; } },
        { label: '继续满负荷运行', fx: function(state) { state.turbine.health -= 8; state.turbine.vibration += 10; } },
      ],
    },
    {
      title: '控制棒卡涩',
      desc: '部分控制棒驱动机构出现卡涩，移动不灵敏。',
      choices: [
        { label: '手动往复活动', fx: function(state) { state.money -= 8000; state.logs.push('活动控制棒，支出 8000 ₽'); } },
        { label: '停堆检修', fx: function(state) { state.r.state = 'SCRAM'; state.scrams++; } },
        { label: '增大驱动力', fx: function(state) { state.r.reactivity += 0.001; } },
      ],
    },
    {
      title: '柴油发电机测试失败',
      desc: '应急柴油发电机例行测试中无法启动。',
      choices: [
        { label: '立即维修', fx: function(state) { state.money -= 25000; state.safety[1].status = 100; } },
        { label: '安排计划维修', fx: function(state) { state.safety[1].status -= 5; } },
        { label: '推迟测试', fx: function(state) { state.safety[1].status -= 10; } },
      ],
    },
    {
      title: '辐射监测报警',
      desc: '厂区边界辐射监测站读数轻微升高。',
      choices: [
        { label: '全面排查泄漏点', fx: function(state) { state.money -= 20000; state.logs.push('辐射排查，支出 2 万 ₽'); } },
        { label: '加强通风过滤', fx: function(state) { state.money -= 5000; state.safety[4].status += 5; } },
        { label: '认为是仪表误差', fx: function(state) { state.rad += 0.05; } },
      ],
    },
  ];

  function calcORM(state) {
    var rods = state.r.rods;
    var sum = 0;
    for (var i = 0; i < rods.length; i++) {
      sum += rods[i] / 100;
    }
    return sum;
  }

  function avgSafety(state) {
    var sum = 0;
    for (var i = 0; i < state.safety.length; i++) {
      sum += state.safety[i].status;
    }
    return sum / state.safety.length;
  }

  Events.trigger = function(state, rngFunc) {
    var rng = rngFunc || Math.random;
    var diff = state.diff;
    var diffMul = CONFIG.DIFFICULTIES[diff].eventMul;

    var prob = 0.10 * diffMul;

    var powerPct = state.r.power / CONFIG.RATED_T * 100;
    if (powerPct > 100) prob += 0.15;
    else if (powerPct > 80) prob += 0.05;

    var orm = calcORM(state);
    if (orm < CONFIG.ORM_CRIT) prob += 0.20;
    else if (orm < CONFIG.ORM_MIN) prob += 0.08;

    if (avgSafety(state) < 50) prob += 0.12;

    if (rng() < prob) {
      var idx = Math.floor(rng() * EVENTS.length);
      var evt = EVENTS[idx];
      state.pendingEvent = {
        title: evt.title,
        desc: evt.desc,
        choices: evt.choices,
      };
      state.lastEventDay = state.daysOp;
      state.daysSinceEvent = 0;
    }
  };

  window.Systems.Events = { EVENTS: EVENTS, trigger: Events.trigger };
})();
