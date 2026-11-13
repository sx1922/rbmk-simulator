/* Endless — БЕСКОНЕЧНЫЙ РЕЖИМ · 无尽模式
   功能：逐月结算 / 事件系统 / 燃耗换料 / 机组大修 / 员工班组 / 经营目标 / 成就 / 存档继续 */

const Endless = (() => {

  const SHIFT_S = 8 * 3600;
  const DAY_S = 3 * SHIFT_S;
  const MONTH_S = 30 * DAY_S;

  const BASE_PRICE = 0.02;
  const START_MONEY = 8000000;
  const MAINT_MONTH = 300000;
  const AGING_PER_MONTH = 15000;
  const REFUEL_COST = 12000000;
  const REFUEL_OUTAGE_S = 5 * DAY_S;
  const OVERHAUL_OUTAGE_S = 14 * DAY_S;
  const FINE_AZ = 500000;
  const FINE_ALARM = 100000;
  const FINE_REFUSE_DISPATCH = 300000;
  const SUBSIDY_DISPATCH = 150000;
  const FINE_INSPECT = 500000;
  const PUMP_FAST_COST = 500000;
  const PUMP_FAST_S = 1800;
  const PUMP_SLOW_COST = 250000;
  const PUMP_SLOW_S = 3 * 3600;
  const LOSS_LIMIT = 6;
  const BURN_FULL_MONTH = 3.1;
  const BURN_REMIND = 34;
  const BURN_FORCE = 40;
  const START_YEAR = 1986;
  const START_MONTH_IDX = 4;

  const BEST_KEY = 'rbmk_endless_best';
  const SAVE_KEY = 'rbmk_endless_save';
  const ACH_KEY = 'rbmk_endless_achievements';

  const CREW_ROLES = ['值长', '资深操作员', '操作员', '机械师', '电气师', '仪表工', '化学师', '安全员'];
  const CREW_NAMES = ['伊万诺夫 Иванов', '彼得罗夫 Петров', '西多罗夫 Сидоров', '斯米尔诺夫 Смирнов', '库兹涅佐夫 Кузнецов', '波波夫 Попов', '索科洛夫 Соколов', '列别杰夫 Лебедев',
    '科兹洛夫 Козлов', '诺维科夫 Новиков', '莫罗佐夫 Морозов', '沃罗比约夫 Воробьёв', '费奥多罗夫 Фёдоров', '米哈伊洛夫 Михайлов', '别利亚耶夫 Беляев', '古谢夫 Гусев'];
  const HIRE_COST = 120000;
  const FIRE_COST = 60000;
  const BONUS_COST = 50000;

  const GOAL_DEFS = [
    { id: 'g_profit_first', text: '首次实现单月盈利', reward: 300000,
      test: function(E) { return E.monthProfit > 0; } },
    { id: 'g_profit_2m', text: '单月利润突破 200 万', reward: 500000,
      test: function(E) { return E.monthProfit > 2000000; } },
    { id: 'g_safe_90', text: '连续 90 天无报警', reward: 1000000,
      test: function(E) { return E.noAlarmDays >= 90; } },
    { id: 'g_refuel_3', text: '完成 3 次换料', reward: 1500000,
      test: function(E) { return E.refuels >= 3; } },
    { id: 'g_year', text: '安全运行满一年（无熔毁）', reward: 3000000,
      test: function(E, S) { return E.monthIdx >= 11 && !S.meltdown; } },
    { id: 'g_cash_50m', text: '现金储备突破 5000 万', reward: 2000000,
      test: function(E) { return E.money >= 50000000; } },
    { id: 'g_crew_strong', text: '班组平均能力达到 0.85', reward: 800000,
      test: function(E) { return avgCompetence(E) >= 0.85; } },
  ];

  const ACH_DEFS = [
    { id: 'a_first_month', text: '完成首次月结算' },
    { id: 'a_first_refuel', text: '首次完成换料' },
    { id: 'a_first_overhaul', text: '首次完成机组大修' },
    { id: 'a_pumps_5', text: '维修 5 台主循环泵' },
    { id: 'a_scram_10', text: '触发 10 次 АЗ-5' },
    { id: 'a_profit_10m', text: '累计盈利突破 1000 万' },
    { id: 'a_year_1', text: '安全运行满一年' },
    { id: 'a_meltdown', text: '堆芯熔毁（一次）' },
    { id: 'a_bankrupt', text: '宣告破产' },
    { id: 'a_best_5000', text: '单局得分达到 5000' },
  ];

  function seasonFactor(m) {
    if (m === 11 || m <= 1) return 1.2;
    if (m >= 5 && m <= 7) return 1.1;
    return 1.0;
  }

  function rnd(min, max) { return min + Math.random() * (max - min); }

  function genMember(i) {
    return {
      id: 'c' + i,
      name: CREW_NAMES[i % CREW_NAMES.length],
      role: CREW_ROLES[i % CREW_ROLES.length],
      competence: Math.round(rnd(0.55, 0.98) * 100) / 100,
      morale: Math.round(rnd(0.6, 1.0) * 100) / 100,
    };
  }

  function genCrew() {
    const crew = [];
    for (let i = 0; i < 8; i++) crew.push(genMember(i));
    return crew;
  }

  function wagesTotal(E) {
    return E.crew.reduce(function(s, m) { return s + 85000 * (0.7 + 0.6 * m.competence); }, 0);
  }

  function avgCompetence(E) {
    if (!E.crew.length) return 0;
    return E.crew.reduce(function(s, m) { return s + m.competence; }, 0) / E.crew.length;
  }

  function avgMorale(E) {
    if (!E.crew.length) return 0;
    return E.crew.reduce(function(s, m) { return s + m.morale; }, 0) / E.crew.length;
  }

  function create() {
    const E = {
      simTime: 0,
      money: START_MONEY,
      price: BASE_PRICE,
      priceNoise: 0,
      monthIdx: 0,
      monthIncome: 0,
      monthFines: 0,
      monthEvents: 0,
      monthProfit: 0,
      monthHistory: [],
      energyMWh: 0,
      burnup: 0,
      outageS: 0,
      outage: null,
      lossStreak: 0,
      daysRun: 0,
      scramCount: 0,
      alarmCount: 0,
      refuels: 0,
      pumpRepairs: 0,
      profitTotal: 0,
      speed: 10,
      nextEventAt: 20 * 3600 + Math.random() * 50 * 3600,
      event: null,
      eventTimeout: 0,
      dispatch: null,
      inspection: null,
      pendingPumps: [],
      refuelArmed: false,
      refuelCostMul: 1,
      burnupBoostUntil: 0,
      overhaulDueAt: 12 * MONTH_S,
      overhaulArmed: false,
      overhaulCount: 0,
      overhaulDelayCount: 0,
      crew: genCrew(),
      goals: GOAL_DEFS.map(function(g) { return { id: g.id, text: g.text, reward: g.reward, done: false }; }),
      achEmitted: {},
      modifiers: [],
      noAlarmDays: 0,
      lastCrewTick: 0,
      powerSum: 0,
      powerTime: 0,
      bankrupt: false,
      finished: false,
      listeners: {},
    };
    return E;
  }

  const active = { E: null };

  function emit(name, payload) {
    const E = active.E;
    if (!E || !E.listeners[name]) return;
    E.listeners[name].forEach(fn => {
      try { fn(payload || {}); } catch (e) { console.error('[endless:' + name + ']', e); }
    });
  }

  function on(name, fn) {
    const E = active.E;
    if (!E) return;
    (E.listeners[name] = E.listeners[name] || []).push(fn);
  }

  function setSpeed(x) {
    const E = active.E;
    if (!E) return;
    E.speed = x;
    if (window.RBMK) RBMK.setTimeScale(x);
    emit('speed', { value: x });
  }

  function getDate(E) {
    const month = Math.floor(E.simTime / MONTH_S);
    const day = Math.floor(E.simTime / DAY_S) % 30 + 1;
    const shift = Math.floor(E.simTime / SHIFT_S) % 3 + 1;
    const m = START_MONTH_IDX + month;
    const year = START_YEAR + Math.floor(m / 12);
    const monthOfYear = m % 12 + 1;
    const pad = n => String(n).padStart(2, '0');
    return {
      month: month + 1,
      day: day,
      shift: shift,
      dateStr: pad(day) + '.' + pad(monthOfYear) + '.' + year,
      monthName: pad(monthOfYear) + '.' + year,
    };
  }

  function priceUpdate(E, dtS) {
    const wave = 0.3 * Math.sin(2 * Math.PI * E.simTime / (7 * DAY_S) + 1.3);
    E.priceNoise += (Math.random() - 0.5) * 0.0015;
    E.priceNoise = Math.max(-0.008, Math.min(0.008, E.priceNoise));
    const m = (START_MONTH_IDX + Math.floor(E.simTime / MONTH_S)) % 12;
    const hour = Math.floor((E.simTime % DAY_S) / SHIFT_S) + 1;
    const loadFactor = 0.94 + 0.14 * (hour === 2 ? 1 : 0) + 0.05 * (hour === 1 ? 1 : 0);
    let extra = 0;
    for (let i = E.modifiers.length - 1; i >= 0; i--) {
      if (E.simTime >= E.modifiers[i].until) E.modifiers.splice(i, 1);
      else extra += E.modifiers[i].priceAdd;
    }
    const p = BASE_PRICE * (1 + wave + E.priceNoise) * seasonFactor(m) * loadFactor + extra;
    E.price = Math.max(0.012, Math.min(0.032, p));
  }

  function log(E, msg) {
    emit('log', { text: msg });
  }

  function startEvent(E, evt, urgent) {
    E.event = evt;
    E.eventTimeout = evt.timeoutS;
    E.monthEvents++;
    if (urgent && RBMK.S.timeScale > 1) {
      setSpeed(1);
      log(E, '紧急事件：时间流速已降至 ×1。');
    }
    emit('event', { id: evt.id, title: evt.title, desc: evt.desc, options: evt.options });
  }

  function pumpEvent(E) {
    const running = [];
    for (let i = 0; i < 8; i++) if (RBMK.S.pumps[i]) running.push(i);
    if (running.length === 0) return;
    const idx = running[Math.floor(Math.random() * running.length)];
    RBMK.S.pumps[idx] = false;
    const left = RBMK.S.pumps.filter(Boolean).length;
    startEvent(E, {
      id: 'pump_fail_' + idx,
      title: 'ГЦН 故障 · 主循环泵',
      desc: '泵 ' + (idx + 1) + ' 改变位置。流量下降。需要维修。',
      options: [
        { id: 'fast', label: '立即维修 (₽0.5M · 30 分钟)' },
        { id: 'slow', label: '等维修班 (₽0.25M · 3 小时)' },
      ],
      timeoutS: 7200,
      data: { idx: idx, left: left },
    }, left < 5);
  }

  function steamEvent(E) {
    const cost = Math.round(300000 + avgCompetence(E) * 100000);
    startEvent(E, {
      id: 'steam_leak',
      title: '蒸汽阀泄漏 · ПАРОПРОВОД',
      desc: '主蒸汽管道阀门泄漏。压力波动。',
      options: [
        { id: 'fix', label: '立即抢修 (₽' + (cost / 1000).toFixed(0) + 'K · 停机 2 小时)' },
        { id: 'hold', label: '维持运行 (有爆管风险)' },
      ],
      timeoutS: 6 * 3600,
    }, true);
  }

  function dieselEvent(E) {
    startEvent(E, {
      id: 'diesel_test',
      title: '柴油机月度试验 · ДИЗЕЛЬ',
      desc: '备用柴油发电机月度启动试验（班组能力影响通过率）。',
      options: [
        { id: 'test', label: '执行试验 (₽40K)' },
        { id: 'skip', label: '跳过 (罚款 ₽100K)' },
      ],
      timeoutS: 6 * 3600,
    }, false);
  }

  function fuelLeakEvent(E) {
    startEvent(E, {
      id: 'fuel_leak',
      title: '燃料棒破损检测 · ТВЭЛ',
      desc: '回路活性检测提示可能存在燃料棒破损。',
      options: [
        { id: 'repair', label: '停机检测 (₽200K · 停机 2 小时)' },
        { id: 'run', label: '继续运行 (燃耗加速)' },
      ],
      timeoutS: 6 * 3600,
    }, false);
  }

  function supplierEvent(E) {
    startEvent(E, {
      id: 'supplier_strike',
      title: '供货商罢工 · ПОСТАВЩИК',
      desc: '燃料供应商工人罢工，下次换料成本将上涨 20%。',
      options: [
        { id: 'pay', label: '支付加班费 (₽100K，取消涨价)' },
        { id: 'accept', label: '接受涨价' },
      ],
      timeoutS: 6 * 3600,
    }, false);
  }

  function workerEvent(E) {
    startEvent(E, {
      id: 'worker_accident',
      title: '工人事故 · ТРАВМА',
      desc: '检修时一名工人轻伤（班组士气影响后续风险）。',
      options: [
        { id: 'treat', label: '妥善处理 (₽120K · 士气回升)' },
        { id: 'minimize', label: '低调处理 (有被检查风险)' },
      ],
      timeoutS: 6 * 3600,
    }, false);
  }

  function stormEvent(E) {
    startEvent(E, {
      id: 'storm',
      title: '暴风雨 · ГРОЗА',
      desc: '强雷暴天气，电网不稳定，电价将下跌 10%（2 天）。',
      options: [
        { id: 'grid', label: '接入备用线路 (₽250K)' },
        { id: 'accept', label: '接受电价波动' },
      ],
      timeoutS: 6 * 3600,
    }, false);
  }

  function moraleEvent(E) {
    startEvent(E, {
      id: 'morale_issue',
      title: '班组士气低落 · МОРАЛЬ',
      desc: '连续高强度值班后班组疲劳，有误操作风险。',
      options: [
        { id: 'walk', label: '安排轮休 (₽50K · 士气回升)' },
        { id: 'ignore', label: '继续运转 (有误停堆风险)' },
      ],
      timeoutS: 6 * 3600,
    }, false);
  }

  function dispatchEvent(E) {
    if (E.dispatch) return;
    startEvent(E, {
      id: 'grid_dispatch',
      title: '调度命令 · 调峰',
      desc: '电网要求 2 小时内降到 60% 功率。',
      options: [
        { id: 'obey', label: '响应调度 (补贴 ₽0.15M · 水平降到 60%)' },
        { id: 'refuse', label: '拒绝 (罚款 ₽0.3M)' },
      ],
      timeoutS: 7200,
    }, false);
  }

  function inspectionEvent(E) {
    if (E.inspection) return;
    E.inspection = { until: E.simTime + DAY_S, alarms: 0 };
    log(E, '监管检查：未来 24 小时内正常运行。此间触发报警将受处罚。');
    emit('event', {
      id: 'inspection',
      title: '监管检查 · ИНСПЕКЦИЯ',
      desc: '国家核安全监管机构已到站。24 小时内触发任何报警会被记录。',
      options: [
        { id: 'ok', label: '了解，召开检查' },
      ],
      timeoutS: DAY_S,
    });
  }

  function refuelEvent(E, forced) {
    const cost = Math.round(REFUEL_COST * E.refuelCostMul / 1000) + 'K';
    startEvent(E, {
      id: 'refuel',
      title: '换料大修 · ПЕРЕГРУЗКА',
      desc: 'SBMK 燃耗 ' + E.burnup.toFixed(1) + ' MWd/kg'
        + (forced ? ' — 超过限值，必须换料！' : ' — 建议换料。'),
      options: [
        { id: 'do', label: '换料 (₽' + cost + ' · 停机 5 天 · 燃耗归零)' },
        { id: 'wait', label: forced ? '延期 (罚款 ₽1M)' : '继续运行' },
      ],
      timeoutS: 6 * 3600,
      data: { forced: forced },
    }, forced);
  }

  function overhaulEvent(E, forced) {
    const cost = Math.round((2000000 + 150000 * E.monthIdx) / 1000) + 'K';
    const opts = [{ id: 'do', label: '立即大修 (₽' + cost + ' · 停机 14 天)' }];
    if (!forced) opts.push({ id: 'delay', label: '延期 1 个月 (罚款 ₽0.8M)' });
    startEvent(E, {
      id: 'overhaul',
      title: '机组大修 · КАПРЕМОНТ',
      desc: forced ? '大修已逾期两次，必须执行！' : '机组已连续运行满一年，按规程需要大修。',
      options: opts,
      timeoutS: 6 * 3600,
      data: { forced: forced, cost: cost },
    }, forced);
  }

  function rollEvent(E) {
    const m = (START_MONTH_IDX + Math.floor(E.simTime / MONTH_S)) % 12;
    if (E.burnup >= BURN_REMIND && !E.refuelArmed) {
      E.refuelArmed = true;
      refuelEvent(E, E.burnup >= BURN_FORCE);
      return;
    }
    if (E.overhaulDueAt && E.simTime >= E.overhaulDueAt && !E.overhaulArmed && E.outageS <= 0) {
      E.overhaulArmed = true;
      overhaulEvent(E, E.overhaulDelayCount >= 2);
      return;
    }
    if (avgMorale(E) < 0.55 && Math.random() < 0.18) { moraleEvent(E); return; }

    const months = Math.floor(E.simTime / MONTH_S);
    const aging = Math.min(1, months / 24);
    const fatigue = RBMK.S.timeScale >= 60 ? 0.04 : 0;
    const pool = [
      { w: 0.24 + aging * 0.10 + fatigue, fn: pumpEvent },
      { w: 0.11 + aging * 0.05, fn: steamEvent },
      { w: 0.09, fn: dieselEvent },
      { w: 0.08 + aging * 0.04, fn: fuelLeakEvent },
      { w: 0.08, fn: workerEvent },
      { w: 0.07, fn: stormEvent },
      { w: 0.07, fn: supplierEvent },
      { w: 0.08, fn: dispatchEvent },
      { w: 0.07 + aging * 0.03, fn: inspectionEvent },
      { w: 0.06, fn: null },
    ];
    let total = 0;
    pool.forEach(p => total += p.w);
    if (m >= 4 && m <= 6 && Math.random() < 0.1) {
      log(E, '热浪：电网需求上升，电价上行（约一周）。');
      E.modifiers.push({ until: E.simTime + 7 * DAY_S, priceAdd: 0.0025 });
      return;
    }
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        if (pool[i].fn) pool[i].fn(E);
        else log(E, '仪表失真：周期表短暂偏差（影响约 2 小时）。');
        return;
      }
    }
    log(E, '仪表失真：周期表短暂偏差（影响约 2 小时）。');
  }

  function monthChange(E) {
    E.monthIdx++;
    const aging = AGING_PER_MONTH * E.monthIdx;
    const maint = MAINT_MONTH + aging;
    const wages = wagesTotal(E);
    const profit = E.monthIncome - maint - wages - E.monthFines;
    E.money += profit;
    E.profitTotal += profit;
    if (profit < 0) {
      E.lossStreak++;
      if (E.lossStreak >= LOSS_LIMIT) {
        E.bankrupt = true;
        E.monthProfit = profit;
        unlockAch(E, 'a_bankrupt');
        emit('settle', {
          month: E.monthIdx + 1,
          income: E.monthIncome,
          maint: maint,
          wages: wages,
          fines: E.monthFines,
          profit: profit,
          money: E.money,
          lossStreak: E.lossStreak,
          bankrupt: true,
          price: E.price,
          burnup: E.burnup,
          avgPower: E.powerTime > 0 ? Math.round((E.powerSum / E.powerTime) * 100) : 0,
          monthEvents: E.monthEvents,
          overhaulDueDays: E.overhaulDueAt ? Math.max(0, Math.ceil((E.overhaulDueAt - E.simTime) / DAY_S)) : -1,
        });
        E.finished = true;
        emit('gameover', { reason: 'bankrupt' });
        return;
      }
    } else {
      E.lossStreak = 0;
    }
    E.monthHistory.push({
      month: E.monthIdx,
      income: Math.round(E.monthIncome),
      profit: Math.round(profit),
    });
    E.monthProfit = profit;
    const income = E.monthIncome;
    const fines = E.monthFines;
    const avgP = E.powerTime > 0 ? Math.round((E.powerSum / E.powerTime) * 100) : 0;
    const lastMonthEvents = E.monthEvents;
    E.monthIncome = 0;
    E.monthFines = 0;
    E.monthEvents = 0;
    unlockAch(E, 'a_first_month');
    emit('settle', {
      month: E.monthIdx + 1,
      income: income,
      maint: maint,
      wages: wages,
      fines: fines,
      profit: profit,
      money: E.money,
      lossStreak: E.lossStreak,
      bankrupt: false,
      price: E.price,
      burnup: E.burnup,
      avgPower: avgP,
      monthEvents: lastMonthEvents,
      overhaulDueDays: E.overhaulDueAt ? Math.max(0, Math.ceil((E.overhaulDueAt - E.simTime) / DAY_S)) : -1,
    });
  }

  function checkGoals(E, S) {
    for (let i = 0; i < E.goals.length; i++) {
      const g = E.goals[i];
      if (g.done) continue;
      const def = GOAL_DEFS[i];
      if (def.test(E, S)) {
        g.done = true;
        E.money += g.reward;
        E.monthIncome += g.reward;
        log(E, '经营目标达成：「' + g.text + '」奖金 ₽' + g.reward.toLocaleString('en') + '。');
        emit('goal_done', { id: g.id, text: g.text });
      }
    }
  }

  function achPersisted() {
    try { return JSON.parse(localStorage.getItem(ACH_KEY) || '[]'); } catch (e) { return []; }
  }

  function achSavePersist(ids) {
    try { localStorage.setItem(ACH_KEY, JSON.stringify(ids)); } catch (e) { /* ignore */ }
  }

  function unlockAch(E, id) {
    if (!E || E.achEmitted[id]) return;
    E.achEmitted[id] = true;
    const def = ACH_DEFS.filter(a => a.id === id)[0];
    if (!def) return;
    const ids = achPersisted();
    if (ids.indexOf(id) < 0) {
      ids.push(id);
      achSavePersist(ids);
    }
    emit('achievement', { id: id, text: def.text });
  }

  function choose(actionId) {
    const E = active.E;
    if (!E || !E.event) return;
    const evt = E.event;
    const opt = evt.options.filter(o => o.id === actionId)[0];
    E.event = null;
    if (!opt) return;
    const kind = evt.id.split('_')[0];
    switch (kind) {
      case 'pump': {
        const idx = evt.data.idx;
        const comp = avgCompetence(E);
        if (actionId === 'fast') {
          E.money -= PUMP_FAST_COST;
          E.monthFines += PUMP_FAST_COST;
          E.pendingPumps.push({ idx: idx, at: E.simTime + PUMP_FAST_S });
          log(E, '立即维修：泵 ' + (idx + 1) + ' 将在 30 分钟后恢复。');
        } else {
          E.money -= PUMP_SLOW_COST;
          E.monthFines += PUMP_SLOW_COST;
          const dur = PUMP_SLOW_S * (1.8 - comp);
          E.pendingPumps.push({ idx: idx, at: E.simTime + dur });
          log(E, '维修班召集：泵 ' + (idx + 1) + ' 将在约 ' + Math.round(dur / 360) / 10 + ' 小时后恢复。');
        }
        E.pumpRepairs++;
        if (E.pumpRepairs >= 5) unlockAch(E, 'a_pumps_5');
        break;
      }
      case 'grid':
        if (actionId === 'obey') {
          E.money += SUBSIDY_DISPATCH;
          E.monthIncome += SUBSIDY_DISPATCH;
          E.dispatch = { until: E.simTime + 7200, restoreTo: 100 };
          RBMK.setTargetPower(60);
          log(E, '已响应调度：功率降至 60%，2 小时后恢复。补贴 ' + SUBSIDY_DISPATCH.toLocaleString('en') + ' ₽。');
        } else {
          E.money -= FINE_REFUSE_DISPATCH;
          E.monthFines += FINE_REFUSE_DISPATCH;
          log(E, '拒绝调度：罚款 ' + FINE_REFUSE_DISPATCH.toLocaleString('en') + ' ₽。');
        }
        break;
      case 'inspection': {
        const passed = E.inspection ? E.inspection.alarms === 0 : true;
        if (!passed) {
          E.money -= FINE_INSPECT;
          E.monthFines += FINE_INSPECT;
          log(E, '检查发现报警记录：处罚 ' + FINE_INSPECT.toLocaleString('en') + ' ₽。');
        } else {
          log(E, '检查合格：无可外记备注。');
        }
        E.inspection = null;
        break;
      }
      case 'refuel': {
        const forced = evt.data.forced;
        if (actionId === 'do') {
          const cost = Math.round(REFUEL_COST * E.refuelCostMul);
          E.money -= cost;
          E.monthFines += cost;
          E.burnup = 0;
          E.refuels++;
          E.refuelCostMul = 1;
          E.outage = { until: E.simTime + REFUEL_OUTAGE_S, reason: 'refuel' };
          E.outageS = REFUEL_OUTAGE_S;
          E.refuelArmed = false;
          log(E, '换料开始：停机 5 天，花费 ' + cost.toLocaleString('en') + ' ₽。');
          unlockAch(E, 'a_first_refuel');
        } else if (forced) {
          E.money -= 1000000;
          E.monthFines += 1000000;
          E.refuelArmed = false;
          log(E, '延期换料：罚款 1,000,000 ₽。必须近期做换料。');
        } else {
          E.refuelArmed = false;
          log(E, '决定继续运行。当燃耗达 40 MWd/kg 时将强制换料。');
        }
        break;
      }
      case 'overhaul': {
        const forced = evt.data.forced;
        if (actionId === 'do') {
          const cost = 2000000 + 150000 * E.monthIdx;
          E.money -= cost;
          E.monthFines += cost;
          E.outage = { until: E.simTime + OVERHAUL_OUTAGE_S, reason: 'overhaul' };
          E.outageS = OVERHAUL_OUTAGE_S;
          E.overhaulCount++;
          E.overhaulDelayCount = 0;
          E.overhaulDueAt = E.simTime + 12 * MONTH_S;
          E.overhaulArmed = false;
          log(E, '大修开始：停机 14 天，花费 ' + cost.toLocaleString('en') + ' ₽。');
          unlockAch(E, 'a_first_overhaul');
        } else {
          E.money -= 800000;
          E.monthFines += 800000;
          E.overhaulDelayCount++;
          E.overhaulDueAt = E.simTime + MONTH_S;
          E.overhaulArmed = false;
          log(E, '大修延期 1 个月：罚款 800,000 ₽（累计 ' + E.overhaulDelayCount + ' 次）。');
          void forced;
        }
        break;
      }
      case 'steam': {
        if (actionId === 'fix') {
          const cost = Math.round(300000 + avgCompetence(E) * 100000);
          E.money -= cost;
          E.monthFines += cost;
          E.outage = { until: E.simTime + 2 * 3600, reason: 'repair' };
          E.outageS = 2 * 3600;
          log(E, '抢修开始：停机 2 小时，花费 ' + cost.toLocaleString('en') + ' ₽。');
        } else {
          if (Math.random() < 0.3) {
            E.money -= FINE_AZ;
            E.monthFines += FINE_AZ;
            E.scramCount++;
            if (window.RBMK && !RBMK.S.azFired) RBMK.fireAZ('蒸汽管爆裂');
            log(E, '蒸汽管爆裂！П5 触发停堆，罚款 ' + FINE_AZ.toLocaleString('en') + ' ₽。');
          } else {
            log(E, '阀门撑住了——暂时压得住。');
          }
        }
        break;
      }
      case 'diesel': {
        if (actionId === 'test') {
          E.money -= 40000;
          E.monthFines += 40000;
          const pass = avgCompetence(E) >= rnd(0.3, 0.95);
          if (pass) log(E, '柴油机试验通过。备用电源可用。');
          else {
            E.alarmCount++;
            E.noAlarmDays = 0;
            E.money -= FINE_ALARM;
            E.monthFines += FINE_ALARM;
            log(E, '柴油机启动失败：记录报警一次，罚款 ' + FINE_ALARM.toLocaleString('en') + ' ₽。');
          }
        } else {
          E.money -= 100000;
          E.monthFines += 100000;
          log(E, '跳过柴油机试验：罚款 100,000 ₽。');
        }
        break;
      }
      case 'fuel': {
        if (actionId === 'repair') {
          E.money -= 200000;
          E.monthFines += 200000;
          E.outage = { until: E.simTime + 2 * 3600, reason: 'repair' };
          E.outageS = 2 * 3600;
          log(E, '停机检测：2 小时后恢复。未发现破损棒（或已隔离）。');
        } else {
          E.burnupBoostUntil = E.simTime + 10 * DAY_S;
          if (Math.random() < 0.35) {
            E.money -= 300000;
            E.monthFines += 300000;
            log(E, '继续运行：活性持续上升，监管部门罚款 300,000 ₽。燃耗加速。');
          } else {
            log(E, '继续运行：未发现明显恶化。燃耗加速。');
          }
        }
        break;
      }
      case 'supplier': {
        if (actionId === 'pay') {
          E.money -= 100000;
          E.monthFines += 100000;
          E.refuelCostMul = 1;
          log(E, '已支付加班费：换料成本恢复正常。');
        } else {
          E.refuelCostMul = 1.2;
          log(E, '接受涨价：下次换料成本 +20%。');
        }
        break;
      }
      case 'worker': {
        if (actionId === 'treat') {
          E.money -= 120000;
          E.monthFines += 120000;
          E.crew.forEach(function(m) { m.morale = Math.min(1, m.morale + 0.05); });
          log(E, '妥善处理：工人康复，班组士气回升。');
        } else {
          if (Math.random() < 0.4) {
            E.money -= 200000;
            E.monthFines += 200000;
            log(E, '低调处理被举报：罚款 200,000 ₽。');
          } else {
            log(E, '工人带伤离岗，事情压下来了。');
          }
        }
        break;
      }
      case 'storm': {
        if (actionId === 'grid') {
          E.money -= 250000;
          E.monthFines += 250000;
          log(E, '已接入备用线路：电价不受影响。');
        } else {
          E.modifiers.push({ until: E.simTime + 2 * DAY_S, priceAdd: -0.002 });
          log(E, '接受电价波动：未来 2 天电价下降。');
        }
        break;
      }
      case 'morale': {
        if (actionId === 'walk') {
          E.money -= 50000;
          E.monthFines += 50000;
          E.crew.forEach(function(m) { m.morale = Math.min(1, m.morale + 0.06); });
          log(E, '安排轮休：士气回升。');
        } else {
          if (Math.random() < 0.3) {
            E.alarmCount++;
            E.noAlarmDays = 0;
            E.money -= FINE_AZ;
            E.monthFines += FINE_AZ;
            E.scramCount++;
            if (window.RBMK && !RBMK.S.azFired) RBMK.fireAZ('误操作：值班员按错');
            log(E, '疲劳误操作：误触停堆，罚款 ' + FINE_AZ.toLocaleString('en') + ' ₽。');
          } else {
            log(E, '没有出事——但班组脸色很难看。');
          }
        }
        break;
      }
    }
  }

  function update(dtSim, S) {
    const E = active.E;
    if (!E || E.finished || E.bankrupt) return;
    if (dtSim <= 0) return;
    const prevMonth = Math.floor(E.simTime / MONTH_S);
    E.simTime += dtSim;
    const month = Math.floor(E.simTime / MONTH_S);
    E.daysRun = Math.floor(E.simTime / DAY_S);
    E.noAlarmDays += dtSim / DAY_S;
    priceUpdate(E, dtSim);

    if (E.outageS > 0) {
      E.outageS -= dtSim;
      if (E.outageS <= 0) {
        E.outageS = 0;
        const reason = E.outage ? E.outage.reason : 'refuel';
        E.outage = null;
        if (reason === 'overhaul') log(E, '大修完成：机组重新启动，设备状态恢复。');
        else if (reason === 'repair') log(E, '检修完成：机组恢复正常运行。');
        else log(E, '换料完成：反应堆重新启动。燃耗已归零。');
      }
    } else if (!S.meltdown) {
      const mw = S.n * 3200;
      const h = dtSim / 3600;
      const kwh = mw * h * 1000;
      E.energyMWh += mw * h;
      E.powerSum += S.n * dtSim;
      E.powerTime += dtSim;
      const rev = kwh * E.price;
      E.money += rev;
      E.monthIncome += rev;
      const burnMul = E.simTime < E.burnupBoostUntil ? 1.2 : 1;
      E.burnup += S.n * (BURN_FULL_MONTH / MONTH_S) * dtSim * burnMul;
      if (E.burnup > BURN_FORCE + 5) E.burnup = BURN_FORCE + 5;
    }

    for (let i = E.pendingPumps.length - 1; i >= 0; i--) {
      if (E.simTime >= E.pendingPumps[i].at) {
        const p = E.pendingPumps[i];
        if (!S.pumps[p.idx]) {
          S.pumps[p.idx] = true;
          log(E, '泵 ' + (p.idx + 1) + ' 维修完成，恢复运行。');
        }
        E.pendingPumps.splice(i, 1);
      }
    }

    if (E.dispatch && E.simTime >= E.dispatch.until) {
      RBMK.setTargetPower(E.dispatch.restoreTo);
      log(E, '调度结束：功率恢复至 ' + E.dispatch.restoreTo + '%。');
      E.dispatch = null;
    }
    if (E.inspection && E.simTime >= E.inspection.until) {
      const passed = E.inspection.alarms === 0;
      E.inspection = null;
      if (!passed) {
        E.money -= FINE_INSPECT;
        E.monthFines += FINE_INSPECT;
        log(E, '检查结束：记录不良，处罚 ' + FINE_INSPECT.toLocaleString('en') + ' ₽。');
      } else {
        log(E, '检查结束：合格。');
      }
    }

    if (E.event) {
      E.eventTimeout -= dtSim;
      if (E.eventTimeout <= 0) {
        const id = E.event.id;
        let fallback = 'slow';
        if (id === 'grid_dispatch') fallback = 'refuse';
        else if (id === 'refuel') fallback = E.event.data.forced ? 'do' : 'wait';
        else if (id === 'inspection') fallback = 'ok';
        else if (id === 'overhaul') fallback = E.event.data.forced ? 'do' : 'delay';
        else if (id.indexOf('steam') === 0) fallback = 'fix';
        else if (id.indexOf('diesel') === 0) fallback = 'test';
        else if (id.indexOf('fuel_leak') === 0) fallback = 'repair';
        else if (id.indexOf('supplier') === 0) fallback = 'pay';
        else if (id.indexOf('worker') === 0) fallback = 'treat';
        else if (id.indexOf('storm') === 0) fallback = 'grid';
        else if (id.indexOf('morale') === 0) fallback = 'walk';
        choose(fallback);
        log(E, '事件超时，按默认方式处理。');
      }
    } else if (E.simTime >= E.nextEventAt) {
      const months = Math.floor(E.simTime / MONTH_S);
      const aging = Math.min(1, months / 24);
      const interval = (24 + Math.random() * 40) * 3600 / (1 + aging * 0.6);
      E.nextEventAt = E.simTime + interval;
      rollEvent(E);
    }

    if (E.simTime - E.lastCrewTick > 4 * 3600) {
      E.lastCrewTick = E.simTime;
      const fatigue = RBMK.S.timeScale >= 60 ? 0.012 : 0.01;
      E.crew.forEach(function(m) {
        m.morale = Math.max(0.3, m.morale - fatigue);
      });
    }

    checkGoals(E, S);
    if (E.profitTotal >= 10000000) unlockAch(E, 'a_profit_10m');
    if (E.monthIdx >= 11 && !S.meltdown) unlockAch(E, 'a_year_1');

    if (month > prevMonth) monthChange(E);
  }

  function getHud() {
    const E = active.E;
    if (!E) return null;
    const d = getDate(E);
    return {
      month: d.month,
      day: d.day,
      shift: d.shift,
      dateStr: d.dateStr,
      money: Math.round(E.money),
      price: E.price,
      burnup: E.burnup,
      speed: E.speed,
      outageS: E.outageS,
      lossStreak: E.lossStreak,
      crewMorale: Math.round(avgMorale(E) * 100),
    };
  }

  function alarmHook(on) {
    const E = active.E;
    if (!E) return;
    if (on) {
      E.alarmCount++;
      E.noAlarmDays = 0;
      if (E.inspection) E.inspection.alarms++;
    }
  }

  function scramHook() {
    const E = active.E;
    if (!E) return;
    E.scramCount++;
    if (E.scramCount >= 10) unlockAch(E, 'a_scram_10');
  }

  function getStats(azPresses) {
    const E = active.E;
    if (!E) return null;
    const days = E.daysRun;
    const gwh = E.energyMWh / 1000;
    const scrams = azPresses !== undefined ? azPresses : E.scramCount;
    const avgPower = E.powerTime > 0 ? (E.powerSum / E.powerTime) * 100 : 0;

    const sGeneration = Math.round(gwh * 5);
    const sSurvival = Math.round(days * 10);
    const sSafety = Math.max(0, Math.round(days * 2 - scrams * 50 - E.alarmCount * 15));
    const sProfit = Math.round(E.profitTotal / 1000);
    const sEfficiency = Math.round(avgPower * 8);
    const score = Math.max(0, Math.round(
      sGeneration + sSurvival + sSafety + sProfit + sEfficiency
    ));
    const letter = score >= 8000 ? 'S' : score >= 5000 ? 'A' : score >= 3000 ? 'B' : score >= 1500 ? 'C' : 'D';
    return {
      days: days,
      months: Math.floor(E.simTime / MONTH_S) + 1,
      gwh: gwh,
      energyMWh: E.energyMWh,
      avgPower: avgPower,
      scrams: scrams,
      alarms: E.alarmCount,
      refuels: E.refuels,
      overhauls: E.overhaulCount,
      profitTotal: E.profitTotal,
      burnup: E.burnup,
      crewComp: avgCompetence(E),
      money: Math.round(E.money),
      score: score,
      letter: letter,
      breakdown: { generation: sGeneration, survival: sSurvival, safety: sSafety, profit: sProfit, efficiency: sEfficiency },
      bankrupt: E.bankrupt,
    };
  }

  function saveBest(score) {
    try {
      const prev = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
      if (score > prev) localStorage.setItem(BEST_KEY, String(score));
      return Math.max(prev, score);
    } catch (e) {
      return score;
    }
  }

  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10); } catch (e) { return 0; }
  }

  /* ================= 存档 / 继续 ================= */

  function saveGame() {
    const E = active.E;
    if (!E || E.finished || E.bankrupt) return false;
    try {
      const data = {
        v: 1,
        savedAt: Date.now(),
        E: JSON.parse(JSON.stringify(E)),
        engine: window.RBMK ? RBMK.exportState() : null,
      };
      delete data.E.listeners;
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[endless:save]', e);
      return false;
    }
  }

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.E) return null;
      const base = create();
      delete data.E.listeners;
      Object.assign(base, data.E);
      base.listeners = {};
      base.event = null;
      base.eventTimeout = 0;
      return { E: base, engine: data.engine || null };
    } catch (e) {
      console.error('[endless:load]', e);
      return null;
    }
  }

  function removeSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function resumeGame() {
    const data = loadSave();
    if (!data) return null;
    const base = create();
    delete data.E.listeners;
    Object.assign(base, data.E);
    base.listeners = {};
    base.event = null;
    base.eventTimeout = 0;
    active.E = base;
    if (data.engine && window.RBMK) RBMK.importState(data.engine);
    return base;
  }

  function saveInfo() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.E) return null;
      return {
        month: Math.floor(d.E.simTime / MONTH_S) + 1,
        money: Math.round(d.E.money),
        savedAt: d.savedAt || 0,
      };
    } catch (e) { return null; }
  }

  /* ================= 班组管理 ================= */

  function getCrew() {
    const E = active.E;
    return E ? E.crew.slice() : [];
  }

  function crewHire() {
    const E = active.E;
    if (!E || E.finished || E.bankrupt) return false;
    if (E.crew.length >= 12) { log(E, '班组满员（12 人）。'); return false; }
    if (E.money < HIRE_COST) { log(E, '资金不足：招聘需要 ₽' + HIRE_COST.toLocaleString('en') + '。'); return false; }
    E.money -= HIRE_COST;
    E.monthFines += HIRE_COST;
    const id = 'c' + Date.now().toString(36);
    const m = genMember(0);
    m.id = id;
    m.name = CREW_NAMES[Math.floor(Math.random() * CREW_NAMES.length)];
    m.role = CREW_ROLES[Math.floor(Math.random() * CREW_ROLES.length)];
    E.crew.push(m);
    log(E, '招聘完成：' + m.name + '（' + m.role + '）入职，花费 ₽' + HIRE_COST.toLocaleString('en') + '。');
    return true;
  }

  function crewFire(id) {
    const E = active.E;
    if (!E || E.finished || E.bankrupt) return false;
    if (E.crew.length <= 6) { log(E, '班组最少 6 人，不能继续解雇。'); return false; }
    const idx = E.crew.findIndex(m => m.id === id);
    if (idx < 0) return false;
    const m = E.crew[idx];
    E.money -= FIRE_COST;
    E.monthFines += FIRE_COST;
    E.crew.splice(idx, 1);
    log(E, '解雇 ' + m.name + '：支付补偿 ₽' + FIRE_COST.toLocaleString('en') + '。');
    return true;
  }

  function crewBonus(id) {
    const E = active.E;
    if (!E || E.finished || E.bankrupt) return false;
    const m = E.crew.filter(c => c.id === id)[0];
    if (!m) return false;
    if (E.money < BONUS_COST) { log(E, '资金不足：奖金需要 ₽' + BONUS_COST.toLocaleString('en') + '。'); return false; }
    E.money -= BONUS_COST;
    E.monthFines += BONUS_COST;
    m.morale = Math.min(1, m.morale + 0.15);
    log(E, m.name + ' 获得奖金，士气 +0.15。');
    return true;
  }

  function getGoals() {
    const E = active.E;
    return E ? E.goals.slice() : [];
  }

  function getAchList() {
    const ids = achPersisted();
    return ACH_DEFS.map(function(a) {
      return { id: a.id, text: a.text, unlocked: ids.indexOf(a.id) >= 0 };
    });
  }

  function getOverview() {
    const E = active.E;
    if (!E) return null;
    return {
      overhaulDue: E.overhaulDueAt ? Math.max(0, Math.ceil((E.overhaulDueAt - E.simTime) / DAY_S)) : -1,
      overhaulDelayCount: E.overhaulDelayCount,
      overhaulCount: E.overhaulCount,
      refuelCostMul: E.refuelCostMul,
      avgComp: avgCompetence(E),
      avgMorale: avgMorale(E),
    };
  }

  function createGame() {
    var E = create();
    E.listeners = {};
    active.E = E;
    return E;
  }

  function reset() {
    active.E = null;
  }

  function _seek(simS) {
    const E = active.E;
    if (!E) return false;
    E.simTime = simS;
    E.nextEventAt = simS + 60;
    return true;
  }

  return {
    createGame, reset,
    update, choose, on, setSpeed,
    getHud, getStats, alarmHook, scramHook,
    saveBest, loadBest,
    saveGame, hasSave, loadSave, removeSave, resumeGame, saveInfo,
    getCrew, crewHire, crewFire, crewBonus,
    getGoals, getAchList, unlockAch, getOverview,
    _seek,
    MONTH_S, DAY_S, SHIFT_S,
    REFUEL_COST,
  };
})();

window.Endless = Endless;
