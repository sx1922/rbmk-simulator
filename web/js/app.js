(function() {
  const gt = id => document.getElementById(id);
  const S = RBMK.S;

  let VERSION = null;
  let lastTime = 0;
  let animId = null;

  /* ================= \u751f\u547d\u5468\u671f\u72b6\u6001\u673a ================= */

  let state = 'MENU';               // MENU | PLAYING | ENDING | DEBRIEF
  let mode = 'free';
  let scenario = null;              // ScenarioRuntime\uff08story \u6a21\u5f0f\uff09
  let endless = null;               // Endless \u8fd0\u884c\u65f6\uff08endless \u6a21\u5f0f\uff09
  let endlessRamped = false;
  let endlessStableT = 0;
  let endlessSaveAcc = 0;
  let paused = false;
  let endLock = false;
  let shiftStart = 0;               // \u73b0\u5b9e\u65f6\u95f4\u6233\uff08ms\uff09
  let stats = null;
  let lastRodTarget = 0;
  let floatTimer = null;

function newStats() {
    return {
      overPowerTime: 0,   // n > 110% 累计（游戏秒）
      lowOprTime: 0,      // OPR < 15 累计（游戏秒）
      alarmCount: 0,
      azPresses: 0,
      pumpsStopped: 0,
      rodMoves: 0,
      opCount: 0,
      meltdown: false,
    };
  }

  // ==================== 仪表中间层（InstrumentLayer）====================
  // 物理引擎输出 → 量程截断 → 一阶滞后 → 噪声叠加 → 故障注入 → DisplayValue

  var instLayer = {
    _state: {},  // 仪表内部状态（滞后值、噪声相位等）
    _faults: {}, // 仪表故障
    currentRange: 2,  // 默认功率量程 2 (0-120%)

    DETECTOR_RANGES: [
      { id: 0, name: 'С 源量程',    min: 1e-6, max: 1e-3 },
      { id: 1, name: 'П 中间量程',  min: 1e-3, max: 0.01 },
      { id: 2, name: '1 功率量程1', min: 0.001, max: 0.10 },
      { id: 3, name: '2 功率量程2', min: 0.01, max: 1.20 },
      { id: 4, name: '3 功率量程3', min: 0.10, max: 1.20 },
    ],

    // 仪表参数：tau(滞后时间常数s), noiseAmp(噪声幅度%FS), noiseFreq(Hz)
    INST_SPECS: {
      power:      { tau: 0.5, noiseAmp: 0.003, noiseFreq: 0.8 },
      period:     { tau: 1.0, noiseAmp: 0.005, noiseFreq: 0.5 },
      sep_level:  { tau: 1.5, noiseAmp: 0.004, noiseFreq: 0.6 },
      sep_press:  { tau: 2.0, noiseAmp: 0.003, noiseFreq: 0.4 },
      fw_flow:    { tau: 1.0, noiseAmp: 0.005, noiseFreq: 1.0 },
      fw_temp:    { tau: 0,   noiseAmp: 0.002, noiseFreq: 0.3 }, // 物理模型已有滞后
      steam_flow: { tau: 0.5, noiseAmp: 0.004, noiseFreq: 0.5 },
      dose:       { tau: 5.0, noiseAmp: 0.02,  noiseFreq: 0.1 },
      coolant:    { tau: 3.0, noiseAmp: 0.01,  noiseFreq: 0.2 },
    },

    // 初始化仪表状态
    init: function() {
      this._state = {};
      this._faults = {};
      for (var id in this.INST_SPECS) {
        this._state[id] = { displayed: 0, phase: Math.random() * Math.PI * 2 };
      }
    },

    // 量程截断：将功率分数转换为显示值（经过量程）
    truncatePower: function(n) {
      var range = this.DETECTOR_RANGES[this.currentRange];
      if (n < range.min) return 0;
      if (n > range.max) return range.max;
      return n;
    },

    // 一阶滞后 + 噪声
    updateInstrument: function(id, trueValue, dt) {
      var spec = this.INST_SPECS[id];
      if (!spec) return trueValue;
      var st = this._state[id];
      if (!st) { this._state[id] = { displayed: trueValue, phase: Math.random() * Math.PI * 2 }; st = this._state[id]; }
      // 一阶滞后
      if (spec.tau > 0 && dt > 0) {
        st.displayed += (trueValue - st.displayed) * Math.min(1, dt / spec.tau);
      } else {
        st.displayed = trueValue;
      }
      // 噪声
      this._simTime = this._simTime || 0;
      this._simTime += dt;
      var periodic = spec.noiseAmp * Math.sin(2 * Math.PI * spec.noiseFreq * this._simTime + st.phase);
      var random = spec.noiseAmp * 0.3 * (Math.random() * 2 - 1);
      // 故障
      var fault = this._faults[id];
      if (fault) {
        switch (fault.mode) {
          case 'STUCK':   return st.displayed;
          case 'DRIFT':   return trueValue + (this._simTime - fault.startTime) / 60 * fault.driftRate;
          case 'PEGGED':  return 1.2;
          case 'JITTER':  return trueValue + fault.jitterAmp * (Math.random() * 2 - 1);
          case 'REVERSE': return 1.2 - trueValue;
          case 'DEAD':    return 0;
        }
      }
      return st.displayed + periodic + random;
    },

    // 注入故障
    injectFault: function(id, mode, params) {
      this._faults[id] = { mode: mode, startTime: this._simTime || 0, driftRate: 0.5, jitterAmp: 0.2, duration: 30, ...(params || {}) };
    },

    // 清除故障
    clearFault: function(id) { delete this._faults[id]; },

    // 切换量程
    switchRange: function(newRange) {
      if (newRange === this.currentRange) return;
      this.currentRange = Math.max(0, Math.min(4, newRange));
      this._state.power = this._state.power || { displayed: 0, phase: 0 };
      this._state.power.displayed = 0;  // 指针归零
      this._switchTimer = 0.8;  // 0.8s 瞬态
      if (typeof Audio !== 'undefined' && Audio.click) Audio.click();
    },
  };
  instLayer.init();

  // ==================== 报警灯状态机（4 态升级）====================

  var alarmLamps = {
    _state: {},
    _kvitBound: false,

    init: function() {
      var lampIds = ['SEP_LO','SEP_HI','FW_COLD','THERMAL_SH','CLAD','PERIOD_W','PERIOD_C','DECAY','RAD'];
      for (var i = 0; i < lampIds.length; i++) {
        this._state[lampIds[i]] = 'OFF';
      }
      if (!this._kvitBound) {
        this._kvitBound = true;
        var btn = document.getElementById('btn-kvit');
        if (btn) btn.addEventListener('click', this.kvit.bind(this));
      }
    },

    set: function(id, condition) {
      var current = this._state[id] || 'OFF';
      if (condition) {
        if (current === 'OFF') this._state[id] = 'FAST_BLINK';
      } else {
        if (current === 'ON') this._state[id] = 'SLOW_BLINK';
        else if (current === 'FAST_BLINK') this._state[id] = 'OFF';
      }
    },

    get: function(id) { return this._state[id] || 'OFF'; },

    kvit: function() {
      for (var id in this._state) {
        if (this._state[id] === 'FAST_BLINK') this._state[id] = 'ON';
        else if (this._state[id] === 'SLOW_BLINK') this._state[id] = 'OFF';
      }
      if (typeof Audio !== 'undefined' && Audio.click) Audio.click();
    },

    update: function() {
      var S = RBMK.S;
      this.set('SEP_LO', S.separator_level < 0.5);
      this.set('SEP_HI', S.separator_level > 1.5);
      this.set('FW_COLD', S.feedwater_temp < 100);
      var shock = Math.abs(S.feedwater_temp - S.clad_temp_max) * (S.flow / 100);
      this.set('THERMAL_SH', shock > 150);
      this.set('CLAD', S.clad_integrity < 0.8);
      this.set('PERIOD_W', S.reactor_period > 0 && S.reactor_period < 80 && S.reactor_period > 20);
      this.set('PERIOD_C', S.reactor_period > 0 && S.reactor_period < 20);
      this.set('DECAY', S.decay_heat_power > 50 && S.flow < 50);
      this.set('RAD', S.containment_dose_rate > 1);
    },
  };

  function fmtVer(v) {
    return 'v' + v.version + ' (' + v.build + ', ' + v.revision + ')';
  }

  /* ================= \u5173\u4e8e\u6d6e\u5c42 ================= */

  function showAbout() {
    if (!VERSION) return;
    gt('about-version').textContent = 'v' + VERSION.version + ' \u00AB' + VERSION.codename + '\u00BB';
    gt('about-build').textContent = VERSION.build;
    gt('about-revision').textContent = VERSION.revision;
    gt('about-author').textContent = VERSION.author;
    gt('about-platform').textContent = VERSION.platform === 'web' ? 'Web (Canvas 2D)' : 'L\u00D6VE 2D';
    gt('about-notes').textContent = VERSION.notes;
    gt('about-overlay').classList.remove('hidden');
  }

  function closeAbout() {
    gt('about-overlay').classList.add('hidden');
  }

  /* ================= \u65e5\u5fd7 ================= */

  var logEntries = [];

  function logEvent(type, msg) {
    const strip = gt('log-strip');
    const hh = String(Math.floor((S.t / 3600) % 24)).padStart(2, '0');
    const mm = String(Math.floor((S.t / 60) % 60)).padStart(2, '0');
    const ss = String(Math.floor(S.t % 60)).padStart(2, '0');
    const line = '[' + hh + ':' + mm + ':' + ss + '] ' + msg;
    logEntries.push({ type: type, line: line, t: S.t });
    if (logEntries.length > 500) logEntries.shift();
    if (!strip) return;
    const div = document.createElement('div');
    div.className = 'log-line ' + type;
    div.textContent = line;
    strip.appendChild(div);
    while (strip.children.length > 50) strip.removeChild(strip.firstChild);
    strip.scrollTop = strip.scrollHeight;
  }

  function openLogZoom() {
    const body = gt('log-zoom-body');
    if (!body) return;
    let html = '';
    for (let i = 0; i < logEntries.length; i++) {
      const e = logEntries[i];
      html += '<div class="lz-line ' + (e.type || 'info') + '">' +
        '<span class="lz-time">' + e.line.slice(0, 9) + '</span>' +
        e.line.slice(9).replace(/&/g, '&amp;').replace(/</g, '&lt;') +
        '</div>';
    }
    if (!html) html = '<div style="color:#6a6e5c;">\u6682\u65E0\u8BB0\u5F55\u3002</div>';
    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
    gt('log-zoom').classList.remove('hidden');
    if (typeof Audio !== 'undefined' && Audio.zoom) Audio.zoom();
  }

  function closeLogZoom() {
    const el = gt('log-zoom');
    if (el) el.classList.add('hidden');
    if (typeof Audio !== 'undefined' && Audio.paper) Audio.paper();
  }

  /* ================= UI \u66f4\u65b0 ================= */

  function updateLamps() {
    document.querySelectorAll('.lamp-unit').forEach(function(el) {
      const key = el.dataset.lamp;
      const on = S.alarms[key];
      if (on) {
      el.classList.add('on-red');
      el.classList.toggle('blink', !el._acked);
    } else {
        el._acked = false;
        el.classList.remove('on-red', 'blink');
      }
    });
  }

  function updatePumps() {
    document.querySelectorAll('.pump-btn').forEach(function(el) {
      var i = parseInt(el.dataset.idx);
      if (!isNaN(i)) el.classList.toggle('running', !!S.pumps[i]);
    });
    gt('read-pumps').textContent = S.pumps.filter(Boolean).length;
    // 防抖：flow 变化 > 1 才更新，避免高频闪烁
    if (Math.abs(parseFloat(gt('read-flow').textContent) - S.flow) > 1) {
      gt('read-flow').textContent = Math.round(S.flow);
    }
  }

  function updateUI() {
    var tgt = gt('slider-target');
    if (tgt && document.activeElement !== gt('input-target')) tgt.value = Math.round(S.targetPower);
    var rt = gt('read-target');
    var inp = gt('input-target');
    if (rt) {
      rt.childNodes[0].nodeValue = S.targetPower + ' %';
    }
    if (inp && document.activeElement !== inp) inp.value = Math.round(S.targetPower);
    gt('read-mode').textContent = S.mode === 'auto' ? '\u81EA\u52A8' : '\u624B\u52A8';
    var modeRocker = gt('rocker-mode');
    if (modeRocker) {
      modeRocker.querySelectorAll('button').forEach(function(b) {
        b.classList.toggle('active', b.dataset.val === S.mode);
      });
    }
    updatePumps();
    updateLamps();
    if (S.meltdown) {
      document.getElementById('room').classList.add('meltdown');
    }
    if (mode === 'endless' && Endless.getHud) {
      var hud = Endless.getHud();
      if (hud) {
        var dr = gt('endless-date-ru');
        var dc = gt('endless-date-cn');
        if (dr) dr.textContent = '\u041C\u0415\u0421\u042F\u0426 ' + hud.month + ' \u00B7 ' + hud.dateStr;
        if (dc) dc.textContent = '\u7B2C ' + hud.month + ' \u6708 \u00B7 \u7B2C ' + hud.day + ' \u5929 \u00B7 \u73ED\u6B21 ' + hud.shift;
        var cash = gt('endless-cash');
        if (cash) cash.textContent = '\u20BD ' + fmtMoney(hud.money);
        var fuel = gt('endless-fuel');
        if (fuel) fuel.textContent = '\u71C3\u8017 ' + hud.burnup.toFixed(1) + ' / 40 MW\u00B7\u65E5/kg';
        var plate = gt('date-plate');
        if (plate) plate.textContent = hud.dateStr;
        document.querySelectorAll('#endless-speed button').forEach(function(b) {
          b.classList.toggle('active', parseFloat(b.dataset.ts) === hud.speed);
        });
      }
    }
    updateStoryCal();
    // v2.0 新增仪表读数
    var sepL = gt('read-sep-level');
    if (sepL) sepL.textContent = S.separator_level.toFixed(2);
    var sepP = gt('read-sep-press');
    if (sepP) sepP.textContent = S.separator_pressure.toFixed(1);
    var dh = gt('read-decay-heat');
    if (dh) {
      dh.textContent = S.decay_heat_power > 0 ? Math.round(S.decay_heat_power) + ' MW' : '0';
      dh.style.color = S.decay_heat_power > 200 ? '#c22410' : (S.decay_heat_power > 100 ? '#d4a020' : '#8a8474');
    }
    var dose = gt('read-dose');
    if (dose) {
      var dv = S.containment_dose_rate;
      dose.textContent = (dv >= 100 ? Math.round(dv) : (dv >= 1 ? dv.toFixed(1) : dv.toFixed(2))) + ' mR/h';
    }
    var clad = gt('read-clad');
    if (clad) {
      clad.textContent = Math.round(S.clad_integrity * 100) + '%';
      clad.style.color = S.clad_integrity < 0.5 ? '#c22410' : (S.clad_integrity < 0.8 ? '#d4a020' : '#8a8474');
    }
  }

  /* ================= \u573a\u666f\u6d6e\u5c42\uff08\u7535\u8bdd / \u5bf9\u8bdd\uff09 ================= */

  function hideFloat() {
    var el = gt('scn-float');
    if (el) el.classList.remove('show');
    if (floatTimer) { clearTimeout(floatTimer); floatTimer = null; }
    drainFloatQueue();
  }

  var floatQueue = [];
  var floatShowing = false;

  function showFloat(kind, data, autoHideMs) {
    if (document.body.getAttribute('data-subtitles') === 'off') return;
    floatQueue.push({
      kind: kind,
      data: data,
      autoHideMs: autoHideMs || (kind === 'phone' ? 5500 : 8000),
    });
    if (!floatShowing) drainFloatQueue();
  }

  function drainFloatQueue() {
    var item = floatQueue.shift();
    if (!item) { floatShowing = false; return; }
    floatShowing = true;
    renderFloat(item.kind, item.data, item.autoHideMs);
  }

  function renderFloat(kind, data, autoHideMs) {
    var el = gt('scn-float');
    if (!el) {
      el = document.createElement('div');
      el.id = 'scn-float';
      el.addEventListener('click', hideFloat);
      document.body.appendChild(el);
    }
    var kindText = kind === 'phone' ? '\u260E \u0412\u0427 \u7535\u8BDD \u00B7 \u9AD8\u9891\u7535\u8BDD' : '\u0392\u044B\u0437\u043E\u0432 \u00B7 \u5BF9\u8BDD';
    var from = (data.from || data.speaker || '').replace(/\n/g, ' ');
    var text = (data.text || '').replace(/\n/g, '<br>');
    var hint = '<div class="scn-float-hint"><kbd>\u23CE</kbd> \u5173\u95ED</div>';
    el.innerHTML =
      '<div class="scn-float-kind">' + kindText + '</div>' +
      '<div class="scn-float-from">' + from + '</div>' +
      '<div class="scn-float-text">' + text + '</div>' +
      hint;
    el.classList.add('show');
    if (floatTimer) clearTimeout(floatTimer);
    floatTimer = setTimeout(function() {
      el.classList.remove('show');
      drainFloatQueue();
    }, autoHideMs);
  }

  /* ================= \u573a\u666f\u5f15\u64ce\u63a5\u5165 ================= */

  function simState() {
    return {
      power: S.n * RBMK.N_NOM,
      n: S.n,
      azFired: S.azFired,
      orm: S.opr,
      xenon: S.xe,
      voidFraction: S.voidFrac,
      rodPositions: S.rodPos,
      fuelTemp: S.fuelTemp,
      meltdown: S.meltdown,
      t: S.t,
    };
  }

  function initScenario() {
    scenario = Scenario.create('chronicle_04');
    if (!scenario) return;
    lastRodTarget = S.rodTarget;
    scenario.on('log', function(text) { logEvent('info', text); });
    scenario.on('phone', function(a) {
      showFloat('phone', a, (a.duration || 4000) + 1000);
      Audio.click();
    });
    scenario.on('dialogue', function(a) {
      showFloat('dialogue', a);
      Audio.beep(880, 0.1, 0.05);
    });
    scenario.on('sound', function(a) {
      if (a.id === 'alarm_low') Audio.alarmTone(600, 0.6, 0.4);
      if (a.id === 'alarm_high') Audio.alarmTone(1200, 0.8, 0.6);
    });
    scenario.on('pressure', function(a) {
      logEvent('warn', '\u538B\u529B\u5C42\u7EA7 ' + a.level + ' \u2014 ' + (a.behavior || ''));
    });
    scenario.on('mode', function(a) { RBMK.setMode(a.value); });
    scenario.on('target', function(a) { RBMK.setTargetPower(a.value); });
    scenario.on('timescale', function(a) { RBMK.setTimeScale(a.value); });
    scenario.on('pumps', function(a) {
      for (var i = 0; i < 8; i++) S.pumps[i] = i < a.value;
    });
    scenario.on('timeskip', function(a) {
      if (a.delta > 0) RBMK.advanceSim(a.delta / 1000);
    });
    scenario.on('az', function(a) {
      RBMK.fireAZ(a.reason || '\u0410\u0417-5 \u5F3A\u5236\u505C\u5806');
    });
    scenario.on('az_reset', function() {
      RBMK.clearScram();
    });
    scenario.on('act', function(v) { updateStoryHud(v); });
    scenario.on('objective', function(a) { updateStoryObj(a.text || ''); });
    scenario.on('objective_done', function() {
      var el = gt('story-obj');
      if (el) el.classList.add('done');
    });
    scenario.on('endgame', function(a) {
      scenario.finish(a.endType, a.epilogue);
      endGame('SCENARIO_END', { endType: a.endType, epilogue: a.epilogue });
    });
  }

  /* ================= \u65e0\u5c3d\u6a21\u5f0f\u5f39\u7a97\uff08\u7ed3\u7b97 / \u4e8b\u4ef6\uff09 ================= */

  var endlessPanelLock = false;
  var endlessPanelOnClose = null;

  function showEndlessPanel(html, onClose) {
    var el = gt('endless-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'endless-overlay';
      el.className = 'hidden';
      el.innerHTML = '<div id="endless-panel"></div>';
      el.addEventListener('click', function(e) {
        if (e.target === el) closeEndlessPanel();
      });
      document.body.appendChild(el);
    }
    gt('endless-panel').innerHTML = html;
    el.classList.remove('hidden');
    paused = true;
    endlessPanelLock = true;
    endlessPanelOnClose = onClose;
  }

  function closeEndlessPanel() {
    var el = gt('endless-overlay');
    if (el) el.classList.add('hidden');
    if (!endLock && state === 'PLAYING') paused = false;
    endlessPanelLock = false;
    var cb = endlessPanelOnClose;
    endlessPanelOnClose = null;
    if (cb) cb();
  }

  function fmtMoney(v) {
    return Math.round(v).toLocaleString('en');
  }

  function showSettle(data) {
    if (typeof Audio !== 'undefined' && Audio.coin) Audio.coin();
    var profitCls = data.profit >= 0 ? 'pos' : 'neg';
    var html = '<h2>\u7b2c ' + data.month + ' \u6708\u7ed3\u7b97</h2>'
      + '<div class="ep-sub">\u041C\u0415\u0421\u042F\u0427\u041D\u042B\u0419 \u0420\u0410\u0421\u0427\u0401\u0422 \u00B7 \u6708\u5ea6\u7ecf\u6d4e\u62a5\u8868</div>'
      + '<div class="ep-row"><span>\u552e\u7535\u6536\u5165</span><b>+' + fmtMoney(data.income) + ' \u20BD</b></div>'
      + '<div class="ep-row"><span>\u65e5\u5e38\u7ef4\u62a4</span><b>-' + fmtMoney(data.maint) + ' \u20BD</b></div>'
      + '<div class="ep-row"><span>\u4eba\u5458\u5de5\u8d44</span><b>-' + fmtMoney(data.wages) + ' \u20BD</b></div>'
      + '<div class="ep-row"><span>\u4e8b\u4ef6 / \u7f5a\u6b3e</span><b>-' + fmtMoney(data.fines) + ' \u20BD</b></div>'
      + '<div class="ep-total">\u672c\u6708\u51c0\u5229\u6da6: <span class="' + profitCls + '">'
      + (data.profit >= 0 ? '+' : '') + fmtMoney(data.profit) + ' \u20BD</span>'
      + '<div style="font-size:10px;color:#8a8e7c;margin-top:4px;">\u73b0\u91d1: ' + fmtMoney(data.money) + ' \u20BD \u00B7 '
      + (data.lossStreak > 0 ? '\u8fde\u7eed\u4e8f\u635f ' + data.lossStreak + ' / 6 \u6708' : '\u8d22\u52a1\u5065\u5eb7')
      + '</div></div>'
      + '<div class="ep-brief">'
      + '<div class="ep-row"><span>\u6708\u5747\u7535\u4ef7</span><b>' + (data.price ? (data.price * 1000).toFixed(1) + ' \u5206/kWh' : '--') + '</b></div>'
      + '<div class="ep-row"><span>\u5e73\u5747\u529f\u7387</span><b>' + (data.avgPower !== undefined ? data.avgPower + ' %' : '--') + '</b></div>'
      + '<div class="ep-row"><span>\u71c3\u801d</span><b>' + (data.burnup !== undefined ? data.burnup.toFixed(1) + ' / 40 MW\u00B7\u65e5/kg' : '--') + '</b></div>'
      + '<div class="ep-row"><span>\u672c\u6708\u4e8b\u4ef6</span><b>' + (data.monthEvents !== undefined ? data.monthEvents + ' \u8d77' : '--') + '</b></div>'
      + (data.overhaulDueDays !== undefined && data.overhaulDueDays >= 0
        ? '<div class="ep-row"><span>\u7ed3\u7b97\u540e\u5927\u4fee\u5012\u8ba1\u65f6</span><b>' + data.overhaulDueDays + ' \u5929</b></div>'
        : '')
      + '</div>';
    if (data.bankrupt) {
      html += '<div class="ep-warn">\u8fde\u7eed 6 \u4e2a\u6708\u51c0\u4e8f\u635f \u2014 \u7535\u7ad9\u88ab\u4e0a\u7ea7\u90e8\u95e8\u63a5\u7ba1\u3002\u60a8\u88ab\u7f62\u804c\u3002</div>'
        + '<div class="ep-actions"><button class="ep-btn danger" id="endless-final-btn">\u6700\u7ec8\u7ed3\u7b97</button></div>'
        + '<div class="ep-hint"><kbd>\u23ce</kbd> \u7ee7\u7eed</div>';
    } else {
      html += '<div class="ep-actions"><button class="ep-btn" id="endless-continue-btn">\u7ee7\u7eed\u8fd0\u8425</button></div>'
        + '<div class="ep-hint"><kbd>\u23ce</kbd> \u7ee7\u7eed</div>';
    }
    showEndlessPanel(html, function() {
      if (data.bankrupt) endGame('BANKRUPT', {});
    });
    var cont = gt('endless-continue-btn');
    if (cont) cont.addEventListener('click', closeEndlessPanel);
    var fin = gt('endless-final-btn');
    if (fin) fin.addEventListener('click', closeEndlessPanel);
  }

  function showEndlessEvent(evt) {
    var html = '<div class="ep-event-title">' + evt.title + '</div>'
      + '<div class="ep-event-desc">' + evt.desc + '</div>'
      + '<div class="ep-actions">';
    evt.options.forEach(function(o) {
      html += '<button class="ep-btn" data-opt="' + o.id + '">' + o.label + '</button>';
    });
    html += '</div><div class="ep-hint">\u5ef6\u8fdf\u4e0d\u54cd\u5e94\u5c06\u6309\u9ed8\u8ba4\u65b9\u5f0f\u5904\u7406</div>';
    showEndlessPanel(html, null);
    var panel = gt('endless-panel');
    if (panel) {
      panel.querySelectorAll('button[data-opt]').forEach(function(b) {
        b.addEventListener('click', function() {
          Endless.choose(evt.id, b.dataset.opt);
          closeEndlessPanel();
        });
      });
    }
  }

  function initEndless(resume) {
    if (resume && Endless.resumeGame) {
      endless = Endless.resumeGame();
      if (!endless) endless = Endless.createGame();
      endlessRamped = true;
    } else {
      if (Endless.removeSave) Endless.removeSave();
      endless = Endless.createGame();
      RBMK.initFullPower();
      S.timeScale = 10;
    }
    var hud = gt('endless-hud');
    if (hud) hud.classList.remove('hidden');
    S.onAlarm = function(key, on) {
      if (on && Endless.alarmHook) Endless.alarmHook(true);
    };
    document.querySelectorAll('#endless-speed button').forEach(function(b) {
      if (b._el) return;
      b._el = true;
      b.addEventListener('click', function() {
        endlessRamped = true;
        Endless.setSpeed(parseFloat(b.dataset.ts));
      });
    });
    Endless.on('settle', function(d) { showSettle(d); });
    Endless.on('event', function(evt) { showEndlessEvent(evt); });
    Endless.on('log', function(t) { logEvent('info', t); });
    Endless.on('gameover', function() { endGame('BANKRUPT', {}); });
    Endless.on('speed', function(ts) { S.timeScale = ts.value; });
    Endless.on('achievement', function(a) { logEvent('info', '\u6210\u5C31\u89E3\u9501\uFF1A' + a.text + '\u3002'); });
    initEndlessActions();
  }

  /* ================= \u65E0\u5C3D\u6A21\u5F0F\u64CD\u4F5C\u9762\u677F ================= */

  function initEndlessActions() {
    document.querySelectorAll('#endless-actions button').forEach(function(b) {
      if (b._el) return;
      b._el = true;
      b.addEventListener('click', function() {
        switch (b.dataset.panel) {
          case 'save': showSavePanel(); break;
          case 'crew': showCrewPanel(); break;
          case 'goals': showGoalsPanel(); break;
          case 'ach': showAchPanel(); break;
        }
      });
    });
  }

  function panelShell(title, sub, body, extraActions) {
    var html = '<h2>' + title + '</h2><div class="ep-sub">' + sub + '</div>' + body;
    html += '<div class="ep-actions">' + (extraActions || '')
      + '<button class="ep-btn" id="ep-close-btn">\u5173\u95ED</button></div>';
    showEndlessPanel(html, null);
    var close = gt('ep-close-btn');
    if (close) close.addEventListener('click', closeEndlessPanel);
  }

  function showSavePanel() {
    var info = Endless.saveInfo ? Endless.saveInfo() : null;
    var hud = Endless.getHud();
    var body = '<div class="ep-row"><span>\u5F53\u524D\u65E5\u671F</span><b>' + (hud ? hud.dateStr : '-') + '</b></div>'
      + '<div class="ep-row"><span>\u5DF2\u8FD0\u8425</span><b>' + (hud ? '\u7B2C ' + hud.month + ' \u6708' : '-') + '</b></div>'
      + '<div class="ep-row"><span>\u73B0\u91D1</span><b>' + (hud ? '\u20BD ' + hud.money.toLocaleString('en') : '-') + '</b></div>'
      + (info ? '<div class="ep-hint">\u6700\u8FD1\u4FDD\u5B58\uFF1A' + new Date(info.savedAt).toLocaleTimeString() + ' \u00B7 \u7B2C ' + info.month + ' \u6708</div>' : '')
      + '<div class="ep-hint">\u6E38\u620F\u4F1A\u81EA\u52A8\u4FDD\u5B58\u3002\u4E5F\u53EF\u968F\u65F6\u624B\u52A8\u4FDD\u5B58\u3002</div>';
    panelShell('\u5B58\u6863 \u00B7 \u0421\u041E\u0425\u0420\u0410\u041D\u0418\u0422\u042C', '\u4FDD\u5B58\u5F53\u524D\u8FD0\u8425\u8FDB\u5EA6', body,
      '<button class="ep-btn" id="ep-save-btn">\u4FDD\u5B58\u8FDB\u5EA6</button>');
    var save = gt('ep-save-btn');
    if (save) save.addEventListener('click', function() {
      if (Endless.saveGame()) {
        logEvent('info', '\u5DF2\u4FDD\u5B58\u8FDB\u5EA6\u3002');
        closeEndlessPanel();
      } else {
        logEvent('warn', '\u4FDD\u5B58\u5931\u8D25\u3002');
      }
    });
  }

  function showCrewPanel() {
    var crew = Endless.getCrew();
    var ov = Endless.getOverview ? Endless.getOverview() : null;
    var wages = 0;
    crew.forEach(function(m) { wages += 85000 * (0.7 + 0.6 * m.competence); });
    var body = '<div class="ep-overview">'
      + '<span>\u5E73\u5747\u80FD\u529B <b>' + (ov ? (ov.avgComp * 100).toFixed(0) + '%' : '-') + '</b></span>'
      + '<span>\u5E73\u5747\u58EB\u6C14 <b>' + (ov ? (ov.avgMorale * 100).toFixed(0) + '%' : '-') + '</b></span>'
      + '<span>\u6708\u85AA <b>\u20BD ' + Math.round(wages).toLocaleString('en') + '</b></span>'
      + '</div>'
      + '<div class="ep-list">';
    crew.forEach(function(m) {
      var mor = m.morale < 0.55 ? ' style="color:#ff8a70"' : '';
      body += '<div class="ep-crew-row">'
        + '<span class="ep-crew-name">' + m.name + '<i>' + m.role + '</i></span>'
        + '<span class="ep-crew-stat">\u80FD ' + (m.competence * 100).toFixed(0) + '%</span>'
        + '<span class="ep-crew-stat"' + mor + '>\u58EB ' + (m.morale * 100).toFixed(0) + '%</span>'
        + '<span class="ep-crew-ops"><button class="ep-btn small" data-crew="' + m.id + '" data-op="bonus">\u5956\u91D1</button>'
        + '<button class="ep-btn small danger" data-crew="' + m.id + '" data-op="fire">\u89E3\u96C7</button></span>'
        + '</div>';
    });
    body += '</div>'
      + (ov && ov.overhaulDue >= 0
        ? '<div class="ep-hint">\u4E0B\u6B21\u5927\u4FEE\u5012\u8BA1\u65F6\uFF1A' + ov.overhaulDue + ' \u5929' + (ov.overhaulDelayCount > 0 ? ' \u00B7 \u5DF2\u5EF6\u671F ' + ov.overhaulDelayCount + ' \u6B21' : '') + '</div>'
        : '')
      + '<div class="ep-actions"></div>';
    panelShell('\u5DE5\u4F5C\u73ED\u7EC4 \u00B7 \u0421\u041C\u0415\u041D\u0410', '\u5458\u5DE5\u4E0E\u4E8B\u6545\u73ED\u7EC4 \u2014 \u80FD\u529B\u5F71\u54CD\u4E8B\u4EF6\u5904\u7406\uFF0C\u58EB\u6C14\u4F4E\u4E0E 55% \u6709\u8BEF\u64CD\u4F5C\u98CE\u9669', body,
      '<button class="ep-btn" id="ep-hire-btn">\u62DB\u8058 (₽120K)</button>');
    var hire = gt('ep-hire-btn');
    if (hire) hire.addEventListener('click', function() {
      Endless.crewHire();
      showCrewPanel();
    });
    var panel = gt('endless-panel');
    if (panel) panel.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-crew]');
      if (!btn) return;
      if (btn.dataset.op === 'bonus') Endless.crewBonus(btn.dataset.crew);
      else Endless.crewFire(btn.dataset.crew);
      showCrewPanel();
    });
  }

  function showGoalsPanel() {
    var goals = Endless.getGoals();
    var body = '<div class="ep-list">';
    goals.forEach(function(g) {
      var ok = g.done ? 'ep-goal-done' : '';
      body += '<div class="ep-goal-row ' + ok + '">'
        + '<span class="ep-goal-mark">' + (g.done ? '\u2713' : '\u25CB') + '</span>'
        + '<span class="ep-goal-text">' + g.text + '</span>'
        + '<span class="ep-goal-reward">\u20BD ' + g.reward.toLocaleString('en') + '</span>'
        + '</div>';
    });
    body += '</div>';
    panelShell('\u7ECF\u8425\u76EE\u6807 \u00B7 \u0426\u0415\u041B\u0418', '\u672C\u5C40\u76EE\u6807 \u2014 \u8FBE\u6210\u5373\u83B7\u5956\u91D1', body, '');
  }

  function showAchPanel() {
    var list = Endless.getAchList();
    var done = list.filter(function(a) { return a.unlocked; }).length;
    var body = '<div class="ep-hint">\u5DF2\u89E3\u9501 ' + done + ' / ' + list.length + ' \u2014 \u6210\u5C31\u8DE8\u5C40\u4FDD\u7559\u3002</div><div class="ep-list">';
    list.forEach(function(a) {
      var ok = a.unlocked ? 'ep-goal-done' : '';
      body += '<div class="ep-goal-row ' + ok + '">'
        + '<span class="ep-goal-mark">' + (a.unlocked ? '\u2713' : '\u25CB') + '</span>'
        + '<span class="ep-goal-text">' + a.text + '</span>'
        + '</div>';
    });
    body += '</div>';
    panelShell('\u6210\u5C31 \u00B7 \u041D\u0410\u0413\u0420\u0410\u0414\u042B', '\u6C38\u4E45\u89E3\u9501\u8BB0\u5F55', body, '');
  }

  /* ================= \u5386\u53F2\u6A21\u5F0F HUD\uff08\u5E55\u6B21 / \u5F15\u5BFC\uff09 ================= */

  var STORY_HUD = {
    acts: {
      1:  { cn: '\u7B2C\u4E00\u5E55', ru: '\u0410\u041A\u0422 I' },
      2:  { cn: '\u7B2C\u4E8C\u5E55', ru: '\u0410\u041A\u0422 II' },
      '2B': { cn: '\u7B2C\u4E8C\u5E55B', ru: '\u0410\u041A\u0422 II-\u0411' },
      3:  { cn: '\u7B2C\u4E09\u5E55', ru: '\u0410\u041A\u0422 III' },
      '3B': { cn: '\u7B2C\u4E09\u5E55B', ru: '\u0410\u041A\u0422 III-\u0411' },
      4:  { cn: '\u7B2C\u56DB\u5E55', ru: '\u0410\u041A\u0422 IV' },
      5:  { cn: '\u7B2C\u4E94\u5E55', ru: '\u0410\u041A\u0422 V' },
      6:  { cn: '\u7B2C\u516D\u5E55', ru: '\u0410\u041A\u0422 VI' },
    },
  };

  function buildStoryCal() {
    var wrap = gt('story-cal');
    if (!wrap || wrap.dataset.built) return;
    wrap.dataset.built = '1';
    var head = document.createElement('div');
    head.className = 'cal-head';
    head.innerHTML = '<span class="cal-title">'
      + (mode === 'endless' ? '\u65E0\u5C3D\u6A21\u5F0F \u00B7 1986 \u5E74 5 \u6708' : '\u5386\u53F2\u6A21\u5F0F \u00B7 1986 \u5E74 4 \u6708')
      + '</span>';
    var grid = document.createElement('div');
    grid.className = 'cal-grid';
    ['\u4E00', '\u4E8C', '\u4E09', '\u56DB', '\u4E94', '\u516D', '\u65E5'].forEach(function(w) {
      var d = document.createElement('div');
      d.className = 'cal-cell cal-w';
      d.textContent = w;
      grid.appendChild(d);
    });
    for (var i = 0; i < 1; i++) grid.appendChild(document.createElement('div'));
    for (var d2 = 1; d2 <= 30; d2++) {
      var c = document.createElement('div');
      c.className = 'cal-cell';
      c.textContent = d2;
      c.dataset.day = d2;
      grid.appendChild(c);
    }
    wrap.appendChild(head);
    wrap.appendChild(grid);
  }

  function updateStoryCal() {
    var wrap = gt('story-cal');
    if (!wrap) return;
    buildStoryCal();
    var day;
    if (mode === 'endless' && window.Endless && Endless.getHud) {
      var h = Endless.getHud();
      day = h ? Math.max(1, Math.min(30, h.day)) : 1;
    } else {
      day = Math.min(26, 25 + Math.floor((S.t + 8 * 3600) / 86400));
    }
    var cells = wrap.querySelectorAll('.cal-cell[data-day]');
    for (var i = 0; i < cells.length; i++) {
      var n = parseInt(cells[i].dataset.day, 10);
      cells[i].classList.toggle('today', n === day);
      cells[i].classList.toggle('start', n === (mode === 'endless' ? 1 : 25));
    }
  }

  /* ================= \u65e5\u5386 \u62ff\u51fa/\u653e\u56de + \u6d82\u753b ================= */

  var calVisible = false;
  var calPenColor = '#1a4a9a';
  var calTool = 'pen';
  var calCtx = null;
  var manualPenColor = '#1a2c52';
  var manualCtx = null;
  var manualDrawMode = false;

  function toolStyle() {
    if (calTool === 'pencil') return { width: 3.4, dash: [2, 3], alpha: 0.7, eraser: false };
    if (calTool === 'eraser') return { width: 16, dash: [], alpha: 1, eraser: true };
    return { width: 1.6, dash: [], alpha: 1, eraser: false };
  }

  function bindDrawCanvas(cv, getTool) {
    var drawing = false;
    var lastPt = null;
    var ctx = cv.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    function pos(e) {
      var r = cv.getBoundingClientRect();
      var t = e.touches && e.touches[0] ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function stroke(p0, p1) {
      var s = getTool();
      if (s.eraser) ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.alpha;
      ctx.lineWidth = s.width;
      ctx.setLineDash(s.dash);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    cv.addEventListener('pointerdown', function(e) {
      if (cv.style.pointerEvents === 'none') return;
      e.preventDefault();
      drawing = true;
      lastPt = pos(e);
      var s = getTool();
      if (s.eraser) ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(lastPt.x, lastPt.y, s.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    });
    cv.addEventListener('pointermove', function(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      if (lastPt) stroke(lastPt, p);
      lastPt = p;
    });
    function up() {
      drawing = false;
      lastPt = null;
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', up);
    return ctx;
  }

  function initStoryCalToggle() {
    var btn = gt('story-cal-toggle');
    if (!btn || btn._listening) return;
    btn._listening = true;
    btn.addEventListener('click', function() {
      calVisible = !calVisible;
      setCalVisible(calVisible);
      if (calVisible) {
        initCalCanvas();
        if (typeof Audio !== 'undefined' && Audio.paper) Audio.paper();
      } else {
        if (typeof Audio !== 'undefined' && Audio.paper) Audio.paper();
      }
    });
    var wrap = gt('story-cal');
    if (!wrap || wrap._penListening) return;
    wrap._penListening = true;
    wrap.addEventListener('click', function(e) {
      var pen = e.target.closest('.cal-pen');
      if (pen) {
        wrap.querySelectorAll('.cal-pen').forEach(function(p) { p.classList.remove('active'); });
        pen.classList.add('active');
        calPenColor = pen.dataset.color;
        return;
      }
      var tool = e.target.closest('.cal-tool');
      if (tool && tool.dataset.tool) {
        wrap.querySelectorAll('.cal-tool').forEach(function(t) { t.classList.remove('active'); });
        tool.classList.add('active');
        calTool = tool.dataset.tool;
        return;
      }
      if (e.target.classList.contains('cal-clear')) {
        var cv = gt('cal-canvas');
        if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      }
    });
  }

  function setCalVisible(v) {
    var cal = gt('story-cal');
    var btn = gt('story-cal-toggle');
    if (cal) cal.classList.toggle('hidden', !v);
    if (!v) saveCalDraw();
    if (btn) {
      btn.classList.toggle('open', v);
      btn.classList.toggle('active', v);
      var ru = btn.querySelector('.ru');
      var cn = btn.querySelector('.cn');
      if (ru) ru.textContent = v ? '\u041A\u0410\u041B\u0415\u041D\u0414\u0410\u0420\u042C \u2192' : '\u041A\u0410\u041B\u0415\u041D\u0414\u0410\u0420\u042C';
      if (cn) cn.textContent = v ? '\u2192 \u6536\u56DE \u65E5\u5386' : '\uD83D\uDCC5 \u62FF\u51FA \u65E5\u5386';
      btn.title = v ? '\u6536\u56DE\u65E5\u5386' : '\u62FF\u51FA\u65E5\u5386 \u00B7 \u53EF\u5728\u65E5\u5386\u4E0A\u6D82\u753B\u6807\u8BB0';
    }
    if (v) {
      var tools = cal ? cal.querySelector('.cal-tools') : null;
      if (tools) tools.classList.remove('hidden');
    }
  }

  function initCalCanvas() {
    var cv = gt('cal-canvas');
    var cal = gt('story-cal');
    if (!cv || !cal) return;
    if (!calCtx) {
      calCtx = bindDrawCanvas(cv, function() {
        var s = toolStyle();
        s.color = calPenColor;
        return s;
      });
      cv._bound = true;
    }
    var grid = cal.querySelector('.cal-grid');
    if (!grid) return;
    var rect = grid.getBoundingClientRect();
    if (!rect.width) return;
    var calRect = cal.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    if (cv.width && calCtx && !cv._buf) {
      var b = document.createElement('canvas');
      b.width = cv.width;
      b.height = cv.height;
      b.getContext('2d').drawImage(cv, 0, 0);
      cv._buf = b;
    }
    cv.width = w;
    cv.height = h;
    cv.style.left = Math.round(rect.left - calRect.left) + 'px';
    cv.style.top = Math.round(rect.top - calRect.top) + 'px';
    cv.style.width = rect.width + 'px';
    cv.style.height = rect.height + 'px';
    cv.style.position = 'absolute';
    if (cv._buf && calCtx) {
      calCtx.drawImage(cv._buf, 0, 0, w, h);
    }
    restoreCalDraw();
  }

  function calDrawKey() {
    return 'rbmk_cal_draw_' + (mode === 'endless' ? 'endless' : 'story');
  }

  function saveCalDraw() {
    var cv = gt('cal-canvas');
    if (!cv || !cv.width) return;
    try { localStorage.setItem(calDrawKey(), cv.toDataURL('image/png')); } catch (e) {}
  }

  function restoreCalDraw() {
    var cv = gt('cal-canvas');
    if (!cv || !cv.width || !calCtx) return;
    var key = calDrawKey();
    var url = null;
    try { url = localStorage.getItem(key); } catch (e) {}
    if (!url) return;
    var img = new Image();
    img.onload = function() {
      var cv2 = gt('cal-canvas');
      if (!cv2 || !cv2.width || !calCtx) return;
      calCtx.clearRect(0, 0, cv2.width, cv2.height);
      calCtx.drawImage(img, 0, 0, cv2.width, cv2.height);
    };
    img.src = url;
  }

  /* ============ \u624b\u518C\u6D82\u753B ============ */

  var manualBuffers = {};
  var manualCurPage = 0;

  function snapshotManual() {
    var cv = gt('manual-canvas');
    if (!cv || !cv.width || !manualCtx) return;
    var buf = document.createElement('canvas');
    buf.width = cv.width;
    buf.height = cv.height;
    buf.getContext('2d').drawImage(cv, 0, 0);
    manualBuffers[manualCurPage] = buf;
  }

  function restoreManual() {
    var cv = gt('manual-canvas');
    if (!cv || !cv.width || !manualCtx) return;
    manualCtx.clearRect(0, 0, cv.width, cv.height);
    var buf = manualBuffers[manualCurPage];
    if (buf && buf.width && buf.height) {
      manualCtx.drawImage(buf, 0, 0, cv.width, cv.height);
    }
  }

  function clearManualPage() {
    var cv = gt('manual-canvas');
    if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    delete manualBuffers[manualCurPage];
  }

  function initManualCanvas() {
    var cv = gt('manual-canvas');
    var pages = cv ? cv.closest('.manual-pages') : null;
    if (!cv || !pages) return;
    if (!manualCtx) {
      manualCtx = bindDrawCanvas(cv, function() {
        var s = toolStyle();
        s.color = manualPenColor;
        return s;
      });
    }
    resizeManualCanvas();
    if (!pages._toggled) {
      pages._toggled = true;
      var toggle = gt('manual-draw-toggle');
      if (toggle) {
        toggle.addEventListener('click', function() {
          manualDrawMode = !manualDrawMode;
          pages.classList.toggle('drawing', manualDrawMode);
          toggle.classList.toggle('active', manualDrawMode);
          toggle.textContent = manualDrawMode ? '\u2713 \u6D82\u753B\u4E2D' : '\u270E \u6D82\u753B\u6A21\u5F0F';
        });
      }
      var book = document.getElementById('manual-book');
      if (book && !book._drawBound) {
        book._drawBound = true;
        book.addEventListener('click', function(e) {
          var tool = e.target.closest('.manual-draw-tools .cal-tool');
          if (tool && tool.dataset.tool) {
            book.querySelectorAll('.manual-draw-tools .cal-tool').forEach(function(t) { t.classList.remove('active'); });
            tool.classList.add('active');
            calTool = tool.dataset.tool;
            return;
          }
          if (e.target.classList.contains('cal-clear')) {
            clearManualPage();
          }
        });
      }
    }
  }

  function resizeManualCanvas() {
    var cv = gt('manual-canvas');
    var pages = cv ? cv.closest('.manual-pages') : null;
    if (!cv || !pages) return;
    var r = pages.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var prev = null;
    if (manualCtx && cv.width) {
      prev = document.createElement('canvas');
      prev.width = cv.width;
      prev.height = cv.height;
      prev.getContext('2d').drawImage(cv, 0, 0);
    }
    cv.width = Math.round(r.width);
    cv.height = Math.round(r.height);
    cv.style.width = r.width + 'px';
    cv.style.height = r.height + 'px';
    if (prev && manualCtx && manualDrawMode) {
      manualCtx.drawImage(prev, 0, 0);
    }
  }

  function updateStoryHud(actVal) {
    var el = gt('story-hud');
    if (!el) return;
    var meta = STORY_HUD.acts[actVal] || {};
    gt('story-act-ru').textContent = meta.ru || '\u0410\u041A\u0422';
    gt('story-act-cn').textContent = meta.cn || '\u7B2C\u00B7\u5E55';
    el.classList.remove('hidden');
    var btn = gt('story-cal-toggle');
    if (btn) btn.classList.remove('hidden');
    var cal = gt('story-cal');
    if (cal) {
      calVisible = false;
      setCalVisible(false);
    }
    updateStoryCal();
  }

  function updateStoryObj(text) {
    var el = gt('story-obj');
    if (el) {
      el.textContent = text || '';
      el.classList.remove('done');
    }
  }

  function initStoryHud() {
    if (scenario) updateStoryHud(scenario.getFlags().act);
    var el = gt('story-hud');
    if (el) el.classList.remove('hidden');
  }

  function clearStoryHud() {
    saveCalDraw();
    var el = gt('story-hud');
    if (el) el.classList.add('hidden');
    var cal = gt('story-cal');
    if (cal) cal.classList.add('hidden');
    var btn = gt('story-cal-toggle');
    if (btn) btn.classList.add('hidden');
    updateStoryObj('');
  }

  function showCalendarToggle() {
    saveCalDraw();
    var cal = gt('story-cal');
    if (cal) {
      var cv2 = cal.querySelector('#cal-canvas');
      cal.querySelectorAll('.cal-head, .cal-grid').forEach(function(n) { n.remove(); });
      delete cal.dataset.built;
      if (cv2) cv2._buf = null;
    }
    var btn = gt('story-cal-toggle');
    if (btn) btn.classList.remove('hidden');
    calVisible = false;
    setCalVisible(false);
    updateStoryCal();
  }

  /* ================= \u8fd0\u884c\u7edf\u8ba1\u91c7\u96c6 ================= */

  function collectStats(dtGame) {
    if (S.n > 1.1) stats.overPowerTime += dtGame;
    if (S.opr < 15 && S.n > 0.05) stats.lowOprTime += dtGame;
    if (S.rodTarget > lastRodTarget + 1.5) {
      stats.rodMoves++;
      if (scenario) scenario.onPlayerAction('rod_withdrawn');
    }
    if (S.rodTarget < lastRodTarget - 1.5) {
      stats.rodMoves++;
    }
    lastRodTarget = S.rodTarget;
  }

  /* ================= \u8bc4\u5206 ================= */

  function evaluateScore() {
    try {
      return scoreInner();
    } catch (e) {
      console.error('evaluateScore failed:', e);
      return {
        dimensions: {}, ratings: {}, remarks: ['\u8BC4\u5206\u5931\u8D25'],
        report: { dimensions: {}, ratings: {} },
        outcome: stats.meltdown ? 'accident' : 'completed',
      };
    }
  }

  function scoreInner() {
    var dims = {};
    dims.safety = stats.meltdown
      ? 0.05
      : Math.max(0, 1 - Math.min(1, stats.overPowerTime / 300) * 0.7 - Math.min(1, stats.lowOprTime / 600) * 0.3);
    dims.procedure = Math.max(0, 1 - Math.min(1, stats.lowOprTime / 180) * 0.6 - stats.alarmCount * 0.03);
    dims.response = stats.alarmCount === 0 ? 1 : Math.max(0, 1 - stats.alarmCount * 0.15);
    dims.equipment = stats.meltdown
      ? 0
      : Math.max(0, 1 - stats.azPresses * 0.25 - stats.pumpsStopped * 0.08);
    dims.completeness = 0.7 + Math.min(0.3, stats.opCount / 50);

    var keys = ['procedure', 'safety', 'response', 'equipment', 'completeness'];
    var ratings = {};
    for (var i = 0; i < keys.length; i++) ratings[keys[i]] = Core.Scoring.ratingFromScore(dims[keys[i]]);

    var remarks = [];
    if (stats.meltdown) remarks.push('\u5806\u82AF\u7194\u6BC1 \u2014 \u56DB\u53F7\u673A\u7EC4\u4E0D\u518D\u5B58\u5728');
    if (dims.safety < 0.6) remarks.push('\u5B89\u5168\u88D5\u5EA6\u4E0D\u8DB3: \u8D85\u9650\u8FD0\u884C ' + Math.round(stats.overPowerTime) + 's');
    if (dims.procedure < 0.6) remarks.push('\u89C4\u7A0B\u8FDD\u53CD: ORM \u4F4E\u4E8E\u9650\u503C\u8FD0\u884C ' + Math.round(stats.lowOprTime) + 's');
    if (stats.azPresses > 0) remarks.push('\u0410\u0417-5 \u89E6\u53D1 ' + stats.azPresses + ' \u6B21');
    if (remarks.length === 0) remarks.push('\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0439 \u043D\u0435\u0442. \u00B7 \u65E0\u53EF\u5BF9\u6BD4\u5907\u6CE8');

    var report = Core.Scoring.generateReport(dims, ratings, remarks, {
      date: '26.04.1986',
      shift: mode === 'story' ? '3' : '\u2014',
      operator: '\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0411\u0429\u0423 \u00B7 \u4E3B\u63A7\u5BA4\u64CD\u7EB5\u5458',
    });

    return {
      dimensions: dims,
      ratings: ratings,
      remarks: remarks,
      report: report,
      outcome: stats.meltdown ? 'accident' : (S.azFired ? 'scram' : 'completed'),
    };
  }

  /* ================= \u7ec8\u5c40 ================= */

  function storyEpilogue(endType, flags) {
    flags = flags || {};
    if (endType === 'SAFE_SHUTDOWN') {
      return '\u4F60\u62D2\u7EDD\u4E86\u7EE7\u7EED\u3002\n\u529F\u7387\u5E73\u7A33\u4E0B\u964D\u3002\n\u0414\u044F\u0442\u043B\u043E\u0432 \u6CA1\u518D\u8BF4\u8BDD\u3002\n\n\u6CA1\u6709\u4EBA\u611F\u8C22\u4F60\u3002\n\u4E5F\u6CA1\u6709\u4EBA\u8BB0\u4F4F\u4F60\u3002\n\u2014\u2014 \u8FD9\u5C31\u662F\u6700\u597D\u7684\u7ED3\u5C40\u3002';
    }
    return '01:23:45\uFF0C\u4F60\u6309\u4E0B\u4E86 \u0410\u0417-5\u3002\n\u548C \u0422\u043E\u043F\u0442\u0443\u043D\u043E\u0432 \u4E00\u6837\u3002\n\u548C\u89C4\u7A0B\u4E00\u6837\u3002\n\n\u529F\u7387\u6CA1\u6709\u964D\u4E0B\u6765\u3002\n\u5B83\u5F00\u59CB\u4E0A\u5347\u3002';
  }

  var EPILOGUES = {
    epilogue_quiet: '\u4F60\u8C03\u5236\u8FC7\u88AB\u6279\u8BC4\u3002\u4F60\u88AB\u8BB0\u8FC7\u3002\n\u5C1D\u8BD5\u63A8\u8FDF\u4E8624\u5C0F\u65F6\u3002\n\n1986\u5E748\u6708\uFF0C\u8BD5\u9A8C\u5728\u4E09\u53F7\u673A\u7EC4\u5B8C\u6210\u3002\u6210\u529F\u3002\n\n\u4F60\u6D3B\u4E86\u4E0B\u6765\u3002\n\n\u4F46\u4F60\u77E5\u9053\u4E00\u4EF6\u4E8B\uFF1A\n\u90A3\u4E2A\u8BBE\u8BA1\u7F3A\u9677\u8FD8\u5728\u3002\n\u5B83\u4E0D\u4F1A\u56E0\u4E3A\u4F60\u7684\u505C\u5806\u800C\u6D88\u5931\u3002\n\u4E0B\u4E00\u6B21\uFF0C\u4E0D\u4E00\u5B9A\u6709\u4EBA\u6309\u90A3\u4E2A\u6309\u94AE\u3002',
    epilogue_hidden: '1986\u5E744\u670826\u65E5\u3002\u6CA1\u6709\u7206\u70B8\u3002\n\n1986\u5E745\u6708\u3002\u4F60\u88AB\u5F00\u9664\u3002\n\n1987\u5E74\u3002\u8BBE\u8BA1\u7F3A\u9677\u88AB\u5185\u90E8\u62A5\u544A\u6307\u51FA\u3002\u62A5\u544A\u88AB\u5F52\u6863\u3002\n\n1991\u5E74\u3002\u82CF\u8054\u89E3\u4F53\u3002\u62A5\u544A\u9057\u5931\u3002\n\n2000\u5E74\u3002\u5207\u5C14\u8BFA\u8D1D\u5229\u6838\u7535\u7AD9\u5B8C\u5168\u5173\u95ED\u3002\n\n\u6CA1\u6709\u4EBA\u8BB0\u5F97\u4F60\u3002\n\u4F46 4\u53F7\u673A\u7EC4\u8FD8\u5728\u3002',
    epilogue_blast: '1986\u5E744\u670826\u65E5 01:23:47\u3002\n\n\u5217\u6602\u5C3C\u5FB7\u00B7\u6258\u666E\u56FE\u8BFA\u592B\u4E8E1986\u5E745\u670814\u65E5\u6B7B\u4E8E\u6025\u6027\u653E\u5C04\u75C5\u3002\u4ED625\u5C81\u3002\n\u4E9A\u5386\u5C71\u5927\u00B7\u963F\u57FA\u83AB\u592B\u4E8E1986\u5E745\u670811\u65E5\u6B7B\u4E8E\u6025\u6027\u653E\u5C04\u75C5\u3002\u4ED633\u5C81\u3002\n\n\u963F\u7EB3\u6258\u5229\u00B7\u0414\u044F\u0442\u043B\u043E\u0432 \u5B58\u6D3B\u30021995\u5E74\u6B7B\u4E8E\u5FC3\u810F\u8870\u7AED\u3002\n\u4ED6\u81F3\u6B7B\u8BA4\u4E3A\u4E8B\u6545\u662F\u64CD\u7EB5\u5458\u7684\u8D23\u4EFB\u3002',
    epilogue_scram_saved: '\u4F60\u6309\u4E0B\u4E86 \u0410\u0417-5\u3002\u529F\u7387\u964D\u4E86\u4E0B\u6765\u3002\u6CA1\u6709\u7206\u70B8\u3002\n\n\u0414\u044F\u0442\u043B\u043E\u0432 \u770B\u4E86\u4F60\u4E00\u773C\u3002\u6CA1\u8BF4\u8BDD\u3002\n\u8BD5\u9A8C\u63A8\u8FDF\u3002\u53CD\u5E94\u5806\u5B89\u5168\u3002\n\n\u4F60\u5728\u65E5\u5FD7\u91CC\u5199\uFF1A\u201C\u4F4E\u529F\u7387\u4E0B\u63D2\u5165\u63A7\u5236\u68D2\u4F1A\u5148\u5F15\u5165\u6B63\u53CD\u5E94\u6027\u2014\u2014\u8FD9\u53EA\u662F\u63A8\u6D4B\u3002\u201D\n\u6CA1\u6709\u4EBA\u8BFB\u90A3\u884C\u5B57\u3002',
  };

  function playEnding(endType, done) {
    var el = gt('ending-overlay');
    if (!el) { done(); return; }
    var hard = endType === 'MELTDOWN' || endType === 'EXPLOSION';
    el.className = 'active ' + (hard ? 'flash' : 'fade');
    setTimeout(function() {
      el.className = '';
      done();
    }, hard ? 3000 : 2000);
  }

  function elapsedMs() {
    return performance.now() - shiftStart;
  }

  function endGame(type, payload) {
    if (endLock) return;
    endLock = true;
    state = 'ENDING';
    if (!stats) stats = newStats();
    if (animId) cancelAnimationFrame(animId);
    if (paused) Pause.hide();
    Audio.stopHum();

    var endType = type === 'SCENARIO_END' ? (payload.endType || 'SAFE_SHUTDOWN') : type;
    var flags = scenario ? scenario.getFlags() : {};
    var epilogue = payload.epilogue
      ? (EPILOGUES[payload.epilogue] || payload.epilogue)
      : storyEpilogue(endType, flags);
    var endlessStats = null;
    if (mode === 'endless' && Endless.getStats) {
      endlessStats = Endless.getStats(stats.azPresses);
      endlessStats.best = Endless.saveBest(endlessStats.score);
      if (endlessStats.score >= 5000 && Endless.unlockAch) Endless.unlockAch(endless, 'a_best_5000');
      if (endType === 'MELTDOWN' && Endless.unlockAch) Endless.unlockAch(endless, 'a_meltdown');
      if (Endless.removeSave) Endless.removeSave();
    }
    var challengeStats = null;
    if (mode === 'challenge' && window.Challenge) {
      challengeStats = Challenge.getStats();
      if (challengeStats && Challenge.saveBest) {
        challengeStats.best = Challenge.saveBest(challengeStats.score);
      }
    }

    playEnding(endType, function() {
      var report = evaluateScore();
      var decisions = scenario ? scenario.getDecisions() : [];
      var matchScore = mode === 'story' ? window.MatchScorer.calc(decisions, flags) : null;

      var journal = Core.Save.loadJournal();
      var scenarioLabel = mode === 'story' ? 'chronicle_04' : (mode === 'free' ? 'free_play' : mode);
      Core.Save.recordShiftEnd(journal, scenarioLabel, {
        dimensions: report.dimensions,
        outcome: report.outcome,
      }, elapsedMs());

      state = 'DEBRIEF';
      Debrief.show({
        mode: mode,
        endType: endType,
        endlessStats: endlessStats,
        challengeStats: challengeStats,
        duration: elapsedMs(),
        finalState: S,
        opCount: stats.opCount,
        report: report,
        decisions: decisions,
        matchScore: matchScore,
        epilogue: epilogue,
        onReturn: backToMenu,
      });
    });
  }

  function playIgnition(done) {
    var el = gt('ignition-overlay');
    if (!el) { done(); return; }
    el.classList.remove('hidden');
    var core = el.querySelector('.ig-core');
    var rings = el.querySelectorAll('.ig-ring');
    var txt = el.querySelector('.ig-text');
    [core, txt].concat(Array.prototype.slice.call(rings)).forEach(function(n) {
      if (n) { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; }
    });
    if (typeof Audio !== 'undefined' && Audio.hum) Audio.hum();
    setTimeout(function() {
      el.classList.add('hidden');
      done();
    }, 2600);
  }

  function backToMenu() {
    endLock = false;
    scenario = null;
    endless = null;
    endlessSaveAcc = 0;
    if (Endless && Endless.reset) Endless.reset();
    if (window.Tutorial) Tutorial.stop();
    if (window.Challenge && Challenge.reset) Challenge.reset();
    var eh = gt('endless-hud');
    if (eh) eh.classList.add('hidden');
    var chud = gt('challenge-hud');
    if (chud) chud.classList.add('hidden');
    var eo = gt('endless-overlay');
    if (eo) eo.classList.add('hidden');
    var tsUnit = gt('rocker-timescale');
    if (tsUnit) tsUnit.closest('.console-unit').style.display = '';
    endlessPanelLock = false;
    endlessPanelOnClose = null;
    state = 'MENU';
    gt('room').style.display = 'none';
    if (window.Props && Props.closeProp) Props.closeProp();
    Menu.show(function(m) { startGame(m); });
  }

  /* ================= \u4e3b\u5faa\u73af ================= */

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt <= 0) {
      animId = requestAnimationFrame(loop);
      return;
    }
    if (dt > 0.5) dt = 0.5;

    if (state === 'PLAYING' && !paused) {
      RBMK.step(dt);
      if (scenario) {
        scenario.update(dt * S.timeScale * 1000, simState());
        scenario.applyOverrides(dt * S.timeScale * 1000, S);
      }
      if (endless) {
        Endless.update(dt * S.timeScale, S);
        endlessSaveAcc += dt;
        if (endlessSaveAcc > 30000) {
          endlessSaveAcc = 0;
          if (Endless.saveGame) Endless.saveGame();
        }
        if (!endlessRamped && S.timeScale <= 10) {
          if (!S.meltdown && !S.azFired && Math.abs(S.n * 100 - S.targetPower) < 5) {
            endlessStableT += dt * S.timeScale;
          } else {
            endlessStableT = 0;
          }
          if (endlessStableT > 60) {
            endlessRamped = true;
            Endless.setSpeed(60);
          }
        }
      }
      if (mode === 'challenge' && window.Challenge) {
        Challenge.update(dt * S.timeScale, S);
      }
      collectStats(dt * S.timeScale);
      if (S.meltdown && !endLock && !(mode === 'story' && scenario)) {
        endGame('MELTDOWN', {});
      }
      if (S.meltdown && !document.getElementById('meltdown-fx').classList.contains('active')) {
        document.getElementById('meltdown-fx').classList.add('active');
        if (typeof Audio !== 'undefined' && Audio.rumble) Audio.rumble();
      }
    }
    if (state === 'PLAYING' || state === 'ENDING') {
      Render.frame();
      Props.updateDosimeter();
      updateUI();
      alarmLamps.update();
    }
    animId = requestAnimationFrame(loop);
  }

  /* ================= \u5f00\u59cb\u503c\u73ed ================= */

  function startGame(m) {
    mode = m || 'free';
    var resumeEndless = false;
    if (mode === 'endless_resume') { mode = 'endless'; resumeEndless = true; }
    endLock = false;
    paused = false;
    lastTime = 0;
    stats = newStats();
    lastRodTarget = 55;
    shiftStart = performance.now();
    endlessRamped = false;
    endlessStableT = 0;
    endlessSaveAcc = 0;

    console.log('\u0429\u0418\u0422 START mode=' + mode);
    RBMK.reset();
    if (mode === 'story') RBMK.initFullPower();
    Audio.startHum();
    Audio.setHumVolume(0.008);
    initSlider();
    initRockers();
    initRodRocker();
    initPumps();
    initAZ5();
    initAlarmLamps();
    Props.init();
    Props.resetTea();
    hideFloat();
    initStoryCalToggle();
    closeLogZoom();
    var mfx = gt('meltdown-fx');
    if (mfx) mfx.classList.remove('active');

    if (!document._teaWired) {
      document._teaWired = true;
      document.addEventListener('props:tea', function(e) {
        var a = e.detail && e.detail.action;
        if (a === 'poured') {
          logEvent('info', '\u70ED\u8336\u5012\u597D\u4E86\u3002');
        } else if (a === 'drunk') {
          logEvent('info', '\u4F60\u559D\u4E86\u4E00\u53E3\u70ED\u8336 \u2014 \u7CBE\u795E\u62C9\u6EE1\u3002');
          if (scenario) scenario.onPlayerAction('tea_drunk');
        }
      });
    }

    if (mode === 'story') initScenario();
    if (mode === 'endless') initEndless(resumeEndless);
    if (mode === 'challenge' && window.Challenge) {
      Challenge.init();
      Challenge.on('complete', function() { endGame('SAFE_SHUTDOWN', {}); });
    }

    var tsUnit = gt('rocker-timescale');
    if (tsUnit) tsUnit.closest('.console-unit').style.display = mode === 'endless' ? 'none' : '';

    if (mode === 'story') initStoryHud();
    else if (mode === 'endless') { showCalendarToggle(); clearStoryHud(); }
    else clearStoryHud();

    gt('room').style.display = 'flex';
    gt('room').classList.remove('meltdown');
    logEvent('info', '\u0421\u041C\u0415\u041D\u0410 \u041D\u0410\u0427\u0410\u0422\u0410 \u00B7 \u73ED\u6B21\u5F00\u59CB | \u0420\u0411\u041C\u041A-1000 \u0411\u041B\u041E\u041A \u21164');
    logEvent('info', '\u041D\u0430\u0447\u0430\u043B\u044C\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u00B7 \u521D\u59CB\u72B6\u6001: N = ' + Math.round(S.n * RBMK.N_NOM) + ' \u041C\u0412\u0442, \u041E\u0417\u0420 = ' + S.opr + ' \u0441\u0442.');
    if (mode === 'story') logEvent('info', '\u0425\u0420\u041E\u041D\u0418\u041A\u0410: 1986.04.25 08:00 \u767D\u73ED\u3002');
    if (mode === 'endless') logEvent('info', '\u0411\u0415\u0421\u041A\u041E\u041D\u0415\u0427\u041D\u041E\u0421\u0422\u042C: 1986.05.01 00:00 \u00B7 \u65E0\u5C3D\u8FD0\u8425\u5F00\u59CB\u3002');

    state = 'PLAYING';
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
    playIgnition(function() {
      if (mode === 'story' && window.Tutorial) Tutorial.start({ getState: function() { return S; } });
    });
  }

  /* ================= \u6682\u505c ================= */

  function openPause() {
    if (state !== 'PLAYING') return;
    if (Debrief.isOpen() || Pause.isOpen()) return;
    paused = true;
    Pause.show({
      items: [
        { id: 'resume', ru: '\u041F\u0420\u041E\u0414\u041E\u041B\u0416\u0418\u0422\u042C', cn: '\u7EE7\u7EED\u503C\u73ED' },
        { id: 'settings', ru: '\u041D\u0410\u0421\u0422\u0420\u041E\u0419\u041A\u0418', cn: '\u6574\u5B9A\u8BBE\u7F6E' },
        { id: 'end', ru: '\u041A\u041E\u041D\u0415\u0426 \u0421\u041C\u0415\u041D\u042B', cn: '\u7ED3\u675F\u503C\u73ED' },
      ],
      onResume: function() { paused = false; Pause.hide(); },
      onSettings: function() {
        Pause.hide();
        Menu.openSettings(function() {
          // Return to pause menu instead of resuming game
          openPause();
        });
      },
      onEndShift: function() {
        Pause.hide();
        endGame('VOLUNTARY', {});
      },
      stats: function() {
        var hh = String(Math.floor((S.t / 3600) % 24)).padStart(2, '0');
        var mm = String(Math.floor((S.t / 60) % 60)).padStart(2, '0');
        var ss = String(Math.floor(S.t % 60)).padStart(2, '0');
        return '\u8FD0\u884C\u65F6\u957F: ' + hh + ':' + mm + ':' + ss +
          '  \u5F53\u524D\u529F\u7387: ' + Math.round(S.n * RBMK.N_NOM) + ' MW' +
          '  \u72B6\u6001: ' + (S.meltdown ? '\u7194\u6BC1' : (S.azFired ? '\u505C\u5806' : '\u6B63\u5E38'));
      },
    });
  }

  function openEndConfirm() {
    if (state !== 'PLAYING') return;
    if (Debrief.isOpen() || Pause.isOpen()) return;
    paused = true;
    Pause.show({
      confirmOnly: true,
      onEndShift: function() {
        Pause.hide();
        endGame('VOLUNTARY', {});
      },
      onResume: function() { paused = false; Pause.hide(); },
      stats: function() {
        var hh = String(Math.floor((S.t / 3600) % 24)).padStart(2, '0');
        var mm = String(Math.floor((S.t / 60) % 60)).padStart(2, '0');
        var ss = String(Math.floor(S.t % 60)).padStart(2, '0');
        return '\u8FD0\u884C\u65F6\u957F: ' + hh + ':' + mm + ':' + ss +
          '  \u5F53\u524D\u529F\u7387: ' + Math.round(S.n * RBMK.N_NOM) + ' MW';
      },
    });
  }

  function handleGlobalKey(e) {
    if (state !== 'PLAYING') return;
    if (endlessPanelLock) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeEndlessPanel();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); return; }
    }
    if (e.key === 'Enter' || e.key === ' ') {
      var fl = gt('scn-float');
      if (fl && fl.classList.contains('show')) {
        e.preventDefault();
        hideFloat();
        return;
      }
    }
    if (e.key === 'Escape' && !Pause.isOpen() && !Debrief.isOpen()) {
      e.preventDefault();
      openPause();
    } else if (e.key === 'F12') {
      e.preventDefault();
      openEndConfirm();
    }
  }

  /* ================= \u63a7\u4ef6\u521d\u59cb\u5316 ================= */

  function initSlider() {
    var slider = gt('slider-target');
    var numInput = gt('input-target');
    function apply(v) {
      v = Math.round(Math.max(0, Math.min(120, v)));
      RBMK.setTargetPower(v);
      if (slider) slider.value = v;
      if (numInput) numInput.value = v;
      gt('read-target').childNodes[0].nodeValue = v + ' %';
    }
    if (slider && !slider._listening) {
      slider._listening = true;
      slider.addEventListener('input', function() {
        apply(parseFloat(slider.value));
      });
    }
    if (numInput && !numInput._listening) {
      numInput._listening = true;
      numInput.addEventListener('change', function() {
        var v = parseFloat(numInput.value);
        if (isNaN(v)) { numInput.value = RBMK.S.targetPower; return; }
        apply(v);
        if (typeof Audio !== 'undefined' && Audio.click) Audio.click();
      });
      numInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); numInput.blur(); }
        if (e.key === 'Escape') { numInput.value = RBMK.S.targetPower; numInput.blur(); }
      });
    }
  }

  function initRockers() {
    document.querySelectorAll('.rocker').forEach(function(group) {
      if (group._listening) return;
      var id = group.id;
      if (id !== 'rocker-speed' && id !== 'rocker-mode' && id !== 'rocker-timescale' && id !== 'rocker-range') return;
      group._listening = true;
      group.querySelectorAll('button').forEach(function(btn) {
        btn.addEventListener('click', function() {
          group.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var val = btn.dataset.val;
          if (id === 'rocker-speed') {
            RBMK.setRodSpeed(parseFloat(val));
          } else if (id === 'rocker-mode') {
            RBMK.setMode(val);
          } else if (id === 'rocker-timescale') {
            RBMK.setTimeScale(parseFloat(val));
          } else if (id === 'rocker-range') {
            instLayer.switchRange(parseInt(val, 10));
            var names = ['С 源量程','П 中间量程','1 功率量程','2 功率量程','3 功率量程'];
            var rd = gt('read-range');
            if (rd) rd.textContent = names[parseInt(val, 10)] || val;
          }
        });
      });
    });
  }

  function initRodRocker() {
    function bind(btn, dir) {
      if (!btn || btn._listening) return;
      btn._listening = true;
      function start(e) {
        e.preventDefault();
        RBMK.beginRodMove(dir);
        btn.classList.add('held');
      }
      function stop() {
        RBMK.endRodMove();
        btn.classList.remove('held');
      }
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('blur', stop);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    }
    bind(gt('rod-up'), 1);
    bind(gt('rod-down'), -1);
  }

  function initPumps() {
    var bank = gt('pump-bank');
    if (!bank || bank._listening) return;
    bank._listening = true;
    bank.innerHTML = '';
    for (var i = 1; i <= 8; i++) {
      var btn = document.createElement('button');
      btn.className = 'pump-btn' + (S.pumps[i - 1] ? ' running' : '');
      btn.dataset.idx = i - 1;
      btn.dataset.no = i;
      btn.title = '\u0413\u0426\u041D-' + i + ' \u00B7 \u4E3B\u5FAA\u73AF\u6CF5';
      btn.addEventListener('click', (function(idx) {
        return function() {
          var wasOn = S.pumps[idx];
          RBMK.togglePump(idx);
          if (wasOn) stats.pumpsStopped++;
        };
      })(i - 1));
      bank.appendChild(btn);
    }
  }

  function initAZ5() {
    var btn = gt('btn-az5');
    if (!btn || btn._listening) return;
    btn._listening = true;
    btn.addEventListener('click', function() {
      var coverEl = gt('az-cover');
      if (coverEl && !coverEl.classList.contains('open')) {
        coverEl.classList.add('shake');
        setTimeout(function() { coverEl.classList.remove('shake'); }, 600);
        logEvent('warn', '\u0410\u0417-5 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D \u043A\u043E\u043B\u043F\u0430\u043A\u043E\u043C \u2014 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0442\u0435\u043A\u043B\u044F\u043D\u043D\u0443\u044E \u043A\u0440\u044B\u0448\u043A\u0443 \u00B7 \u73BB\u7483\u7F69\u6263\u5408\uFF0C\u8BF7\u5148\u6253\u5F00');
        return;
      }
      if (RBMK.manualAZ()) {
        stats.azPresses++;
        if (endless) Endless.scramHook();
        if (scenario) scenario.onPlayerAction('az_pressed');
      }
    });
    var cover = gt('az-cover');
    if (cover) {
      cover.addEventListener('click', function(e) {
        if (e.target === cover || e.target.classList.contains('az-cover-glass')) {
          cover.classList.toggle('open');
          var st = gt('az-cover-state');
          if (st) {
            var open = cover.classList.contains('open');
            st.classList.toggle('open', open);
            var ru = st.querySelector('.ru');
            var cn = st.querySelector('.cn');
            if (ru) ru.textContent = open ? '\u041A\u041E\u041B\u041F\u0410\u041A \u041F\u041E\u0414\u041D\u042F\u0422' : '\u041A\u041E\u041B\u041F\u0410\u041A \u0417\u0410\u041A\u0420\u042B\u0422';
            if (cn) cn.textContent = open ? '\u73BB\u7483\u7F69\u5DF2\u6253\u5F00 \u2014 \u53EF\u6309\u4E0B \u0410\u0417-5' : '\u73BB\u7483\u7F69\u6263\u5408 \u00B7 \u70B9\u51FB\u73BB\u7483\u6253\u5F00';
          }
        }
      });
    }
    var keySwitch = gt('key-switch');
    if (keySwitch) {
      keySwitch.addEventListener('click', function() {
        RBMK.toggleKey();
        keySwitch.classList.toggle('locked', S.azBlocked);
        gt('key-handle').style.transform = S.azBlocked
          ? 'translate(-50%, -80%) rotate(90deg)'
          : 'translate(-50%, -80%) rotate(0deg)';
      });
    }
  }

  function initAlarmLamps() {
    document.querySelectorAll('.lamp-unit').forEach(function(el) {
      if (el._listening) return;
      el._listening = true;
      el.addEventListener('click', function() {
        var key = el.dataset.lamp;
        if (S.alarms[key]) el._acked = !el._acked;
      });
    });
  }

  /* ================= \u542f\u52a8 ================= */

  function init() {
    fetch('version.json').then(function(r) { return r.json(); }).then(function(v) {
      VERSION = v;
      console.log('\u0429\u0418\u0422 ' + fmtVer(v) + ' \u00B7 ' + v.author);
      gt('stamp-version').textContent = 'v' + v.version;
      gt('stamp-build').textContent = '\u0441\u0431.' + v.build;
      gt('stamp-revision').textContent = v.revision;
    }).catch(function() {
      console.log('\u0429\u0418\u0422 v0.1.0 (\u0441\u0431.2026.07.30, \u0420\u042D-86/12) \u00B7 sx1922');
    });

    gt('btn-about-close').addEventListener('click', closeAbout);
    gt('about-overlay').addEventListener('click', function(e) {
      if (e.target === gt('about-overlay')) closeAbout();
    });
    var aboutBtn = document.querySelector('.prop[data-prop="about"]');
    if (aboutBtn) aboutBtn.addEventListener('click', function() { App.showAbout(); });

    var logZoomBtn = gt('log-zoom-btn');
    if (logZoomBtn) logZoomBtn.addEventListener('click', openLogZoom);
    var logZoomClose = gt('log-zoom-close');
    if (logZoomClose) logZoomClose.addEventListener('click', closeLogZoom);
    var logZoom = gt('log-zoom');
    if (logZoom) logZoom.addEventListener('click', function(e) {
      if (e.target === logZoom) closeLogZoom();
    });
    var tutClose = gt('tutorial-close');
    if (tutClose) tutClose.addEventListener('click', function() {
      if (window.Tutorial) Tutorial.stop();
    });

    document.addEventListener('keydown', handleGlobalKey);

    gt('room').style.display = 'none';
    alarmLamps.init();
    Boot.play(function() {
      Menu.show(function(m) { startGame(m); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.App = {
    startGame: startGame,
    endGame: endGame,
    showAbout: showAbout,
    closeAbout: closeAbout,
    getState: function() { return state; },
    getMode: function() { return mode; },
    getScenario: function() { return scenario; },
    log: logEvent,
    showPanel: showEndlessPanel,
    closePanel: closeEndlessPanel,
    saveEndless: function() { return Endless && Endless.saveGame ? Endless.saveGame() : false; },
    notifyManualPage: function(page) {
      if (scenario && page === 10) scenario.flags.discovered_page_47 = true;
      if (manualDrawMode && manualCtx) snapshotManual();
      manualCurPage = page || 0;
      resizeManualCanvas();
      if (manualDrawMode && manualCtx) restoreManual();
    },
    initManualCanvas: initManualCanvas,
    resizeManualCanvas: resizeManualCanvas,
    manualDrawing: function() { return manualDrawMode; },
  };
})();
