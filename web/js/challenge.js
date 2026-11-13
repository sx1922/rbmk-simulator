/* Challenge — ВЫЗОВ · 挑战模式 (15 分钟限时排障)
   目标：在突发故障中保持功率稳定；得分按「存活时间 × 精度 × 处置」计 */

const Challenge = (() => {

  const DURATION_S = 900;          // 15 分钟（现实时间）
  const BEST_KEY = 'rbmk_challenge_best';

  let C = null;

  function create() {
    return {
      timeLeft: DURATION_S,
      score: 0,
      eventsTotal: 0,
      eventsOk: 0,
      scrams: 0,
      alarms: 0,
      melted: false,
      nextEventAt: 12 + Math.random() * 20,
      event: null,
      eventTimeout: 0,
      repairing: false,
      repairUntil: 0,
      _scramLogged: false,
      targetNow: 62,
      targetUntil: 0,
      listeners: {},
      finished: false,
    };
  }

  function log(type, msg) {
    if (window.App && App.log) App.log(type, msg);
  }

  function emit(name, payload) {
    if (!C || !C.listeners[name]) return;
    C.listeners[name].forEach(fn => {
      try { fn(payload || {}); } catch (e) { console.error('[challenge:' + name + ']', e); }
    });
  }

  function on(name, fn) {
    if (!C) return;
    (C.listeners[name] = C.listeners[name] || []).push(fn);
  }

  function setHud() {
    const t = Math.max(0, Math.ceil(C.timeLeft));
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    const tv = document.getElementById('challenge-time-val');
    if (tv) tv.textContent = mm + ':' + ss;
    const sv = document.getElementById('challenge-score-val');
    if (sv) sv.textContent = Math.round(C.score);
    const mv = document.getElementById('challenge-msg-cn');
    if (mv) mv.textContent = C.event
      ? '故障处理中…'
      : (C.targetNow !== 62 && C.timeLeft < C.targetUntil
        ? '调度要求：目标功率 ' + C.targetNow + ' %'
        : '保持功率在目标附近 · 应对突发故障');
  }

  function spawnEvent() {
    const pool = [
      'pump_trip', 'steam_leak', 'dispatch', 'period_warn', 'orm_drain', 'phone',
    ];
    const kind = pool[Math.floor(Math.random() * pool.length)];
    C.eventsTotal++;
    if (kind === 'pump_trip') {
      const onPumps = [];
      for (let i = 0; i < 8; i++) if (window.RBMK.S.pumps[i]) onPumps.push(i);
      const idx = onPumps.length ? onPumps[Math.floor(Math.random() * onPumps.length)] : 0;
      window.RBMK.S.pumps[idx] = false;
      log('warn', 'ГЦН-' + (idx + 1) + ' 跳闸：主循环泵 ' + (idx + 1) + ' 停转。请恢复或降低功率。');
      C.event = { kind: 'pump_trip', idx: idx, timeout: 40 };
      C.eventTimeout = 40;
    } else if (kind === 'steam_leak') {
      C.event = { kind: 'steam_leak', timeout: 30 };
      C.eventTimeout = 30;
      showPanel({
        title: '蒸汽阀泄漏 · ПАРОПРОВОД',
        desc: '主蒸汽管道阀门泄漏，压力波动。立即抢修（停机 2 分钟）或维持运行（有爆管风险）。',
        options: [
          { id: 'fix', label: '立即抢修 (停机 2 分钟 · +150 分)' },
          { id: 'hold', label: '维持运行 (风险 30%)' },
        ],
      });
    } else if (kind === 'dispatch') {
      const want = [30, 40, 50, 70, 80][Math.floor(Math.random() * 5)];
      C.targetNow = want;
      C.targetUntil = C.timeLeft + 45;
      C.event = { kind: 'dispatch', want: want, timeout: 45 };
      C.eventTimeout = 45;
      log('warn', '调度指令：将功率调整至 ' + want + ' %（45 秒内响应）。');
    } else if (kind === 'period_warn') {
      C.event = { kind: 'period_warn', timeout: 30 };
      C.eventTimeout = 30;
      log('warn', 'П2 周期报警预触发：功率波动加剧。30 秒内压低功率或稳定功率。');
    } else if (kind === 'orm_drain') {
      C.event = { kind: 'orm_drain', timeout: 25 };
      C.eventTimeout = 25;
      log('warn', '反应性异常：ОЗР 持续下降。25 秒内提棒恢复裕度。');
    } else {
      C.event = { kind: 'phone', timeout: 12 };
      C.eventTimeout = 12;
      log('info', '调度来电：要求报告功率。值班日志已自动记录。');
    }
  }

  function showPanel(evt) {
    if (!window.App || !App.showPanel) return;
    let html = '<div class="ep-event-title">' + evt.title + '</div>'
      + '<div class="ep-event-desc">' + evt.desc + '</div>'
      + '<div class="ep-actions">';
    evt.options.forEach(function(o) {
      html += '<button class="ep-btn" data-opt="' + o.id + '">' + o.label + '</button>';
    });
    html += '</div><div class="ep-hint">延迟不响应将按默认方式处理</div>';
    App.showPanel(html, null);
    const panel = document.getElementById('endless-panel');
    if (panel) {
      panel.querySelectorAll('button[data-opt]').forEach(function(b) {
        b.addEventListener('click', function() { choose(b.dataset.opt); });
      });
    }
  }

  function choose(actionId) {
    if (!C || !C.event) return;
    const evt = C.event;
    C.event = null;
    C.eventsOk++;
    if (evt.kind === 'steam_leak') {
      if (actionId === 'fix') {
        C.repairUntil = Math.max(0, C.timeLeft - 60);
        C.repairing = true;
        window.RBMK.setTargetPower(3);
        C.score += 150;
        log('info', '抢修开始：功率降至 3%，2 分钟后恢复。+150 分');
      } else {
        if (Math.random() < 0.3) {
          C.alarms++;
          if (window.RBMK && !RBMK.S.azFired) RBMK.fireAZ('蒸汽管爆裂');
          C.scrams++;
          C.score -= 500;
          log('warn', '蒸汽管爆裂！АЗ-5 触发：-500 分。');
        } else {
          log('info', '阀门撑住了——暂时压得住。');
        }
      }
    } else if (evt.kind === 'dispatch') {
      if (actionId === 'obey') {
        window.RBMK.setTargetPower(evt.want);
        C.targetNow = 0;
        C.score += 200;
        log('info', '已响应调度：目标功率 ' + evt.want + ' %。+200 分');
      } else {
        C.score -= 300;
        log('warn', '拒绝调度：-300 分。');
      }
    }
    if (window.App && App.closePanel) App.closePanel();
  }

  function tickEvent(dt) {
    if (!C.event) return;
    C.eventTimeout -= dt;
    if (C.eventTimeout <= 0) {
      const evt = C.event;
      C.event = null;
      C.eventsOk++;
      if (evt.kind === 'steam_leak') {
        log('warn', '泄漏无人处理：按默认抢修（停机 2 分钟）。');
        C.repairing = true;
        C.repairUntil = Math.max(0, C.timeLeft - 60);
        window.RBMK.setTargetPower(3);
      } else if (evt.kind === 'dispatch') {
        window.RBMK.setTargetPower(evt.want);
        C.targetNow = 0;
        log('info', '调度超时：已自动调整至 ' + evt.want + ' %。');
      } else if (evt.kind === 'period_warn' || evt.kind === 'orm_drain') {
        C.alarms++;
        C.score -= 100;
        log('warn', '未及时处置：记录报警一次，-100 分。');
      }
    }
  }

  function update(dt, S) {
    if (!C || C.finished || S.meltdown) return;
    C.timeLeft -= dt;
    if (C.repairing) {
      if (C.timeLeft <= C.repairUntil) {
        C.repairing = false;
        if (S.targetPower < 30) window.RBMK.setTargetPower(62);
        log('info', '检修完成：功率恢复中。');
      }
    }
    const targetPct = S.targetPower;
    const err = Math.abs(S.n * 100 - targetPct);
    if (err < 5) C.score += 1.5 * dt;
    else if (err < 12) C.score += 0.4 * dt;
    if (S.azFired && !C._scramLogged) {
      C._scramLogged = true;
      C.scrams++;
      C.score -= 500;
      log('warn', 'АЗ-5 触发：-500 分。');
    }
    if (C.timeLeft <= 0) {
      C.finished = true;
      emit('complete');
      return;
    }
    C.nextEventAt -= dt;
    if (!C.event && C.nextEventAt <= 0) {
      C.nextEventAt = 35 + Math.random() * 35;
      spawnEvent();
    }
    tickEvent(dt);
    setHud();
  }

  function getStats() {
    if (!C) return null;
    const score = Math.max(0, Math.round(C.score));
    return {
      survived: Math.max(0, Math.round(DURATION_S - C.timeLeft)),
      events: C.eventsTotal,
      eventsOk: C.eventsOk,
      scrams: C.scrams,
      alarms: C.alarms,
      score: score,
      best: 0,
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

  function init() {
    C = create();
    if (window.RBMK) {
      RBMK.initFullPower();
      RBMK.S.timeScale = 10;
    }
  }

  function reset() {
    C = null;
  }

  return {
    init, update, reset, choose, on,
    getStats, saveBest, loadBest,
    DURATION_S,
  };
})();

window.Challenge = Challenge;
