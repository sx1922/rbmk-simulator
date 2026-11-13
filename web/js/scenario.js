/* ScenarioRuntime — SCEN_ENGINE-01 事件运行时（web 端）
   事件格式：{ id, time|condition, priority, once, actions[] }
   动作：log / flag / sim_override / phone / dialogue / branch / sound / pressure /
         endgame / wait / mode / pumps / timescale / timeskip / az / target
   flag 特殊值：'@time' = 场景时间(ms)，'@stime' = 引擎时间(s) */

(function() {
  var ScenarioRuntime = function(data) {
    this.id = data.id;
    this.name = data.name || '';
    this.events = (data.events || []).slice().sort(function(a, b) {
      return (a.priority || 0) - (b.priority || 0) ||
        ((a.time === undefined || a.time === null) ? Infinity : a.time) -
        ((b.time === undefined || b.time === null) ? Infinity : b.time);
    });
    this.fired = {};
    this.flags = Object.assign({}, data.initialFlags || {});
    this.decisions = [];
    this.simTime = 0;
    this.activeBranch = null;
    this.branchTimer = 0;
    this.pending = [];
    this.finished = false;
    this.endResult = null;
    this.overrides = [];
    this.log = [];
    this.listeners = {};
    this.lastState = null;
  };

  ScenarioRuntime.prototype.on = function(name, cb) {
    if (!this.listeners[name]) this.listeners[name] = [];
    this.listeners[name].push(cb);
  };

  ScenarioRuntime.prototype.emit = function(name) {
    var cbs = this.listeners[name];
    if (!cbs) return;
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < cbs.length; i++) cbs[i].apply(null, args);
  };

  ScenarioRuntime.prototype.pushLog = function(text) {
    this.log.push({ time: this.simTime, text: text });
    this.emit('log', text, this.simTime);
  };

  ScenarioRuntime.prototype.update = function(dt, simState) {
    if (this.finished) return;
    this.simTime += dt;
    this.lastState = simState;

    for (var i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at <= this.simTime) {
        var act = this.pending[i].action;
        this.pending.splice(i, 1);
        this.execAction(act);
      }
    }

    for (var j = 0; j < this.events.length; j++) {
      var ev = this.events[j];
      if (this.fired[ev.id]) continue;
      var hit = ev.time === undefined || ev.time === null || this.simTime >= ev.time;
      if (hit && typeof ev.condition === 'function') {
        hit = ev.condition(simState, this.flags);
      }
      if (!hit) continue;
      this.fired[ev.id] = true;
      this.emit('event', ev.id, this.simTime);
      var delay = 0;
      for (var k = 0; k < (ev.actions || []).length; k++) {
        var a = ev.actions[k];
        if (a.type === 'wait') {
          delay += (a.ms || a.seconds * 1000 || 0);
        } else if (delay > 0) {
          this.pending.push({ at: this.simTime + delay, action: a });
        } else {
          this.execAction(a);
        }
      }
    }

    if (this.activeBranch && this.simTime - this.branchArmedAt >= (this.activeBranch.timeout || 180000)) {
      this.resolveBranch(this.activeBranch.default);
    }

    if (this.currentObjective && this.currentObjective.complete && !this.currentObjective.done) {
      if (this.currentObjective.complete(simState, this.flags)) {
        this.currentObjective.done = true;
        this.emit('objective_done', this.currentObjective.text);
      }
    }
  };

  ScenarioRuntime.prototype.execAction = function(a) {
    switch (a.type) {
      case 'log':
        this.pushLog(a.text);
        break;
      case 'flag':
        if (a.value === '@time') this.flags[a.key] = this.simTime;
        else if (a.value === '@stime') this.flags[a.key] = this.lastState ? this.lastState.t : 0;
        else this.flags[a.key] = a.value;
        break;
      case 'act':
        this.flags.act = a.value;
        this.emit('act', a.value);
        break;
      case 'objective':
        this.currentObjective = { text: a.text || '', complete: a.completeWhen || null };
        this.emit('objective', a);
        break;
      case 'sim_override':
        for (var oi = this.overrides.length - 1; oi >= 0; oi--) {
          if (this.overrides[oi].target === a.target) this.overrides.splice(oi, 1);
        }
        this.overrides.push({ target: a.target, value: a.value, ramp: a.ramp || 1000, t: 0 });
        break;
      case 'phone':
        this.emit('phone', a);
        break;
      case 'dialogue':
        this.emit('dialogue', a);
        break;
      case 'sound':
        this.emit('sound', a);
        break;
      case 'pressure':
        this.flags.pressureLevel = a.level;
        this.emit('pressure', a);
        break;
      case 'branch':
        this.armBranch(a);
        break;
      case 'protections':
        if (typeof RBMK !== 'undefined' && RBMK.S) {
          if (a.p1 !== undefined) RBMK.S.protections.P1 = a.p1;
          if (a.p2 !== undefined) RBMK.S.protections.P2 = a.p2;
          if (a.p3 !== undefined) RBMK.S.protections.P3 = a.p3;
          if (a.p4 !== undefined) RBMK.S.protections.P4 = a.p4;
          if (a.p5 !== undefined) RBMK.S.protections.P5 = a.p5;
        }
        break;
      case 'mode':
        this.emit('mode', a);
        break;
      case 'target':
        this.emit('target', a);
        break;
      case 'pumps':
        this.emit('pumps', a);
        break;
      case 'timescale':
        this.emit('timescale', a);
        break;
      case 'timeskip':
        var delta = a.to - this.simTime;
        if (delta > 0) {
          for (var pi = 0; pi < this.pending.length; pi++) this.pending[pi].at += delta;
          this.simTime = a.to;
          this.emit('timeskip', { to: a.to, delta: delta });
        }
        break;
      case 'az':
        this.emit('az', a);
        break;
      case 'az_reset':
        this.emit('az_reset', a);
        break;
      case 'endgame':
        if (a.delay > 0) {
          this.pending.push({ at: this.simTime + a.delay, action: { type: 'endgame', endType: a.endType, epilogue: a.epilogue } });
        } else {
          this.emit('endgame', a);
        }
        break;
    }
  };

  ScenarioRuntime.prototype.applyOverrides = function(dt, S) {
    var dts = dt / 1000;
    for (var i = this.overrides.length - 1; i >= 0; i--) {
      var o = this.overrides[i];
      if (o.target === 'rod' && S.rodHeld !== 0) {
        this.overrides.splice(i, 1);
        this.pushLog('[\u64CD\u4F5C] \u81EA\u52A8\u63A7\u5236\u68D2\u4F4D\u4E2D\u65AD \u2014 \u8F6C\u624B\u52A8\u64CD\u4F5C');
        continue;
      }
      o.t += dt;
      var f = Math.min(1, o.t / o.ramp);
      if (o.target === 'power') {
        var targetNorm = (o.value / RBMK.N_NOM);
        S.n += (targetNorm - S.n) * Math.min(1, dts * 0.5) * f;
        S.n = Math.max(1e-4, S.n);
      }
      if (o.target === 'rod') {
        if (o.t >= o.ramp + (o.hold || 30000)) {
          this.overrides.splice(i, 1);
          continue;
        }
        S.rodTarget += (o.value - S.rodTarget) * Math.min(1, dts * 0.3) * f;
        S.rodTarget = Math.max(0, Math.min(100, S.rodTarget));
      }
    }
  };

  ScenarioRuntime.prototype.armBranch = function(b) {
    this.activeBranch = b;
    this.branchArmedAt = this.simTime;
  };

  ScenarioRuntime.prototype.onPlayerAction = function(action) {
    this.flags['action_' + action] = true;
    if (!this.activeBranch) return;
    var rules = this.activeBranch.rules || [];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].if === action) {
        this.resolveBranch(rules[i].choice);
        return;
      }
    }
  };

  ScenarioRuntime.prototype.resolveBranch = function(choice) {
    if (!this.activeBranch) return;
    var id = this.activeBranch.id;
    this.playerDecision(id, choice);
    this.activeBranch = null;
    this.branchTimer = 0;
  };

  ScenarioRuntime.prototype.playerDecision = function(id, choice) {
    this.decisions.push({ id: id, choice: choice, timestamp: this.simTime });
    this.flags['branch_' + id] = choice;
    this.emit('decision', id, choice, this.simTime);
    this.pushLog('[\u51b3\u7b56] ' + id + ' \u2192 ' + choice);
  };

  ScenarioRuntime.prototype.isFinished = function() { return this.finished; };
  ScenarioRuntime.prototype.getFlags = function() { return this.flags; };
  ScenarioRuntime.prototype.getDecisions = function() { return this.decisions; };
  ScenarioRuntime.prototype.getLog = function() { return this.log; };
  ScenarioRuntime.prototype.getTime = function() { return this.simTime; };

  ScenarioRuntime.prototype.finish = function(endType, epilogue) {
    this.finished = true;
    this.endResult = { endType: endType, epilogue: epilogue };
  };

  /* ================= 时间：1986.04.25 08:00 起，支持跨日 ================= */

  var t = function(h, m, day) {
    if (day === undefined) day = h < 8 ? 1 : 0;
    return (((day * 24 + h) - 8) * 3600 + m * 60) * 1000;
  };

  /* ================= 场景数据：六幕 + 停堆线 + 隐藏结局 ================= */

  var CHRONICLE_EVENTS = [

    /* ———— 第一幕 «Смена» 08:00–14:00（×60 加速，约 6 分钟）———— */
    { id: 'a1_start', time: 0, priority: 1, actions: [
      { type: 'timescale', value: 60 },
      { type: 'log', text: '08:00 \u767d\u73ed\u63a5\u73ed\u3002\u673a\u7ec4\u6ee1\u529f\u7387\u8fd0\u884c\uff1aN = 3200 \u041c\u0412\u0442\u3002' },
      { type: 'log', text: '\u63a7\u5236\u76d8\u4e0a\u65b9\u4e09\u5757\u9762\u677f\uff1a\u529f\u7387/\u5468\u671f\u8868\u3001\u63a7\u5236\u68d2\u6df1\u5ea6\u3001\u7d27\u6025\u4fdd\u62a4\u3002\u4e0b\u65b9\u63a7\u5236\u53f0\uff1a\u76ee\u6807\u529f\u7387\u6ed1\u6746\u3001\u63d0\u68cd\u63a7\u5236\u3001\u4e3b\u5faa\u73af\u6cf5\u3002' },
      { type: 'log', text: '\u684c\u9762\u4e0a\u7684\u9053\u5177\uff1a\u8fd0\u884c\u89c4\u7a0b\u3001\u503c\u73ed\u65e5\u5fd7\u3001\u8ba1\u7b97\u5668\u3001\u5242\u91cf\u8ba1\u3001\u7535\u8bdd\u3001\u8336\u708a\u3002' },
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432 \u503c\u73ed\u957f', text: '\u4eca\u5929\u4f60\u767d\u73ed\u3002\u5148\u786e\u8ba4\u4e09\u4ef6\u4e8b\uff1a\u529f\u7387 N = 3200 \u041c\u0412\u0442\uff0c\u53cd\u5e94\u6027 \u041e\u0417\u0420 \u9ad8\u4e8e 15 \u6839\uff0c\u63a7\u5236\u68d2\u5728\u4e2d\u95f4\u4f4d\u7f6e\u3002\u4e0d\u61c2\u7684\u53bb\u67e5\u8fd0\u884c\u89c4\u7a0b\u3002' },
      { type: 'objective', text: '\u63a5\u73ed\u68c0\u67e5\uff1a\u2460 \u529f\u7387\u8868 N \u2248 3200 \u041c\u0412\u0442 \u2461 \u041e\u0417\u0420 \u2265 15 \u6839 \u2462 \u63a7\u5236\u68d2 \u2248 47% \u3002',
        completeWhen: function(s) { return Math.abs(s.n - 1) < 0.05 && s.orm >= 15 && s.rodPositions > 40 && s.rodPositions < 55; } },
    ]},

    { id: 'a1_inspect', time: t(8, 30), priority: 1, actions: [
      { type: 'log', text: '08:30 \u5de1\u68c0\u63d0\u793a\uff1a\u60ac\u505c\u9f20\u6807\u5728\u4eea\u8868\u4e0a\u53ef\u8bfb\u53d6\u6570\u503c\u3002' },
      { type: 'objective', text: '\u53cd\u5e94\u6027\u8868 \u03c1 \u5e94\u63a5\u8fd1 0\u3002\u60f3\u5f97\u77e5\u66f4\u591a\uff1f\u6253\u5f00\u684c\u9762\u4e0a\u7684\u300a\u8fd0\u884c\u89c4\u7a0b\u300b\u3002' },
    ]},

    { id: 'a1_dispatch', time: t(9, 0), priority: 1, actions: [
      { type: 'phone', from: '\u8c03\u5ea6', text: '\u4eca\u65e5\u8ba1\u5212\u68c0\u4fee\uff0c\u9700\u5c06\u529f\u7387\u964d\u81f3 1600 \u041c\u0412\u0442\u3002\u6309\u89c4\u7a0b\u6267\u884c\u3002', duration: 4000 },
      { type: 'log', text: '09:00 \u8c03\u5ea6\u6765\u7535\uff1a\u964d\u529f\u7387\u81f3 1600 \u041c\u0412\u0442\u3002' },
      { type: 'flag', key: 'order_received', value: true },
      { type: 'objective', text: '\u964d\u529f\u7387\uff1a\u628a\u63a7\u5236\u53f0\u4e0a\u7684\u300c\u76ee\u6807\u529f\u7387\u300d\u6ed1\u6746\u4ece 62% \u62d6\u5230 50%\u3002\u81ea\u52a8\u8c03\u8282\u4f1a\u7f13\u6162\u4e0b\u63d2\u63a7\u5236\u68d2\u3002',
        completeWhen: function(s) { return s.power <= 1650; } },
    ]},

    { id: 'a1_tea', time: t(10, 0), priority: 1, actions: [
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u529f\u7387\u964d\u5f97\u987a\u5229\u3002\u6362\u73ed\u524d\u559d\u53e3\u8336\u5427\u2014\u2014\u53f3\u4e0b\u89d2\u684c\u9762\u4e0a\u7684\u8336\u708a\u3002' },
      { type: 'log', text: '10:00 \u529f\u7387\u5e73\u7a33\u4e0b\u964d\u4e2d\u3002' },
      { type: 'objective', text: '\u4f11\u606f\u4e00\u4e0b\uff1a\u70b9\u5f00\u53f3\u4e0b\u89d2\u300c\u8336\u708a\u300d\u9053\u5177\uff0c\u5012\u4e00\u676f\u70ed\u8336\u5e76\u559d\u6389\u3002',
        completeWhen: function(s, f) { return !!f.action_tea_drunk; } },
    ]},

    { id: 'a1_pump', time: t(11, 0), priority: 1, actions: [
      { type: 'phone', from: '\u503c\u73ed\u957f', text: '\u0413\u0426\u041d-5 \u632f\u52a8\u504f\u5927\u3002\u5efa\u8bae\u5207\u6362\u5907\u7528\u6cf5\uff0c\u4f60\u6765\u5b9a\u3002', duration: 4000 },
      { type: 'log', text: '11:00 \u503c\u73ed\u957f\u6765\u7535\uff1a\u0413\u0426\u041d-5 \u632f\u52a8\u504f\u5927\u3002' },
      { type: 'objective', text: '\u67e5\u770b\u63a7\u5236\u53f0\u4e0a\u7684\u4e3b\u5faa\u73af\u6cf5\u6309\u94ae\uff1a8 \u53f0\u5168\u5f00\u3002\u6301\u7eed\u76d1\u89c6\u529f\u7387\u4e0b\u964d\u3002' },
    ]},

    { id: 'a1_rods', time: t(12, 0), priority: 1, actions: [
      { type: 'log', text: '12:00 \u63a7\u5236\u68d2\u968f\u529f\u7387\u964d\u4f4e\u800c\u4e0b\u63d2\u3002' },
      { type: 'objective', text: '\u63a7\u5236\u68d2\uff1a\u68d2\u4f4d\u968f\u529f\u7387\u4e0b\u964d\u800c\u7f13\u6162\u4e0b\u63d2\uff08\u219250%\uff09\u3002\u5982\u9700\u4e2d\u65ad\u81ea\u52a8\u63a7\u5236\uff0c\u70b9\u300c\u624b\u52a8\u300d\u518d\u4f4f\u6309\u63d0\u68d2/\u964d\u68d2\u3002' },
    ]},

    { id: 'a1_delay', time: t(13, 30), priority: 1, actions: [
      { type: 'phone', from: '\u8c03\u5ea6', text: '\u8bd5\u9a8c\u63a8\u8fdf\u5230\u591c\u73ed\u3002\u57fa\u8f85\u90a3\u8fb9\u8fd8\u6ca1\u6279\u3002', duration: 3000 },
      { type: 'log', text: '13:30 \u8c03\u5ea6\u6765\u7535\uff1a\u8bd5\u9a8c\u63a8\u8fdf\u81f3\u591c\u73ed\u3002' },
      { type: 'objective', text: '14:00 \u4ea4\u73ed\u3002\u786e\u8ba4\u529f\u7387\u5df2\u7a33\u5728 1600 \u041c\u0412\u0442\u3002',
        completeWhen: function(s) { return s.t >= t(14, 0) / 1000; } },
    ]},

    { id: 'a1_end', time: t(14, 0), priority: 2, actions: [
      { type: 'dialogue', speaker: '\u4ea4\u73ed', text: '\u767d\u73ed\u7ed3\u675f\u3002\u591c\u73ed\u64cd\u7eb5\u5458\u5217\u6602\u5c3c\u5fb7\u00b7\u6258\u666e\u56fe\u8bfa\u592b\u63a5\u73ed\u3002\n1986\u5e744\u670825\u65e5 23:10\u3002\n\u4ed625\u5c81\u3002\u8fd9\u662f\u4ed6\u7b2c\u4e00\u6b21\u72ec\u7acb\u503c\u73ed\u3002' },
      { type: 'log', text: '14:00 \u4ea4\u73ed\u5b8c\u6210\u3002' },
      { type: 'sim_override', target: 'rod', value: 46, ramp: 120000 },
      { type: 'timeskip', to: t(23, 10) },
      { type: 'act', value: 2 },
    ]},

    /* ———— 第二幕 «Яма» 23:10–01:23（×10 加速）———— */
    { id: 'a2_start', time: t(23, 10), priority: 1, actions: [
      { type: 'timescale', value: 10 },
      { type: 'log', text: '23:10 \u591c\u73ed\u63a5\u73ed\u3002\u529f\u7387 1600 \u041c\u0412\u0442\u3002' },
      { type: 'dialogue', speaker: '\u8c03\u5ea6', text: '\u591c\u73ed\u4efb\u52a1\uff1a\u7ee7\u7eed\u964d\u81f3 700\u20131000 \u041c\u0412\u0442\uff0c\u51c6\u5907\u6da1\u8f6e\u60f0\u8f6c\u8bd5\u9a8c\u3002' },
    ]},

    { id: 'a2_dispatch', time: t(23, 12), priority: 1, actions: [
      { type: 'phone', from: '\u8c03\u5ea6', text: '\u7ee7\u7eed\u964d\u81f3 700\u20131000 \u041c\u0412\u0442\uff0c\u51c6\u5907\u6da1\u8f6e\u60f0\u8f6c\u8bd5\u9a8c\u3002', duration: 4000 },
      { type: 'log', text: '23:12 \u8c03\u5ea6\u547d\u4ee4\uff1a\u964d\u529f\u7387\u81f3 700\u20131000 \u041c\u0412\u0442\u3002' },
    ]},

    { id: 'a2_crash', time: t(0, 0), priority: 2, condition: function(s, f) {
      return !s.azFired;
    }, actions: [
      { type: 'protections', p2: false },
      { type: 'mode', value: 'manual' },
      { type: 'sim_override', target: 'power', value: 30, ramp: 120000 },
      { type: 'sim_override', target: 'rod', value: 38, ramp: 1000 },
      { type: 'sound', id: 'alarm_low', volume: 0.6 },
      { type: 'flag', key: 'xenon_pit_active', value: true },
      { type: 'log', text: '00:00 \u529f\u7387\u9aa4\u964d\u81f3 30 \u041c\u0412\u0442\u3002\u6c19\u5751\u6b63\u5728\u52a0\u6df1\u3002' },
      { type: 'dialogue', speaker: '\u6258\u666e\u56fe\u8bfa\u592b', text: '\u529f\u7387\u5728\u77f3\u5f0f\u4e0b\u8dcc\u3002' },
      { type: 'objective', text: '\u529f\u7387\u9aa4\u964d\u81f3 30 \u041c\u0412\u0442\u3002\u7b49\u5f85\u6c19\u5751\u53cd\u5e94\u6027\u56de\u5347\u3002',
        completeWhen: function(s) { return s.n > 0.05; } },
    ]},

    { id: 'a2_branch', time: t(0, 0), priority: 10, condition: function(s, f) {
      return !s.azFired;
    }, actions: [
      { type: 'objective', text: '\u51B3\u7B56\uff1a\u6309 \u0410\u0417-5 \u505C\u5806\uff08\u5B89\u5168\u7EBF\uff09\uff0c\u6216\u63D0\u68D2\u6062\u590D\u529F\u7387\uff0830 \u5206\u949F\u5185\u672A\u64CD\u4F5C\u5C06\u81EA\u52A8\u7EE7\u7EED\uff09\u3002' },
      { type: 'branch', id: 'xenon_pit', detectBy: 'action',
        rules: [
          { if: 'az_pressed', choice: 'shutdown' },
          { if: 'rod_withdrawn', choice: 'continue' },
        ],
        timeout: 1800000,
        default: 'continue' },
    ]},

    { id: 'a2_phone_kiev', time: t(0, 15), priority: 1, actions: [
      { type: 'phone', from: '\u4e0d\u660e', text: '\u57fa\u8f85\u95ee\u8bd5\u9a8c\u4ec0\u4e48\u65f6\u5019\u5f00\u59cb\u3002', duration: 3000 },
      { type: 'log', text: '00:15 \u6765\u7535\uff1a\u8be2\u95ee\u8bd5\u9a8c\u8fdb\u5ea6\u3002' },
    ]},

    { id: 'a2_dyatlov', time: t(0, 30), priority: 2, condition: function(s, f) {
      return f.xenon_pit_active && s.n < 0.05;
    }, actions: [
      { type: 'pressure', level: 2, behavior: 'stand_behind' },
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u529f\u7387\u591a\u5c11\u4e86\uff1f' },
      { type: 'log', text: '00:30 \u526f\u603b\u5de5\u7a0b\u5e08 \u0414\u044f\u0442\u043b\u043e\u0432 \u8fdb\u5165\u4e3b\u63a7\u5ba4\u3002' },
      { type: 'flag', key: 'dyatlov_present', value: true },
    ]},

    { id: 'a2_dyatlov2', time: t(0, 45), priority: 2, condition: function(s, f) {
      return f.xenon_pit_active && s.n < 0.04 && f.act === 2;
    }, actions: [
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u5feb\uff0c\u628a\u529f\u7387\u62c9\u4e0a\u6765\uff01' },
      { type: 'log', text: '00:45 \u0414\u044f\u0442\u043b\u043e\u0432\uff1a\u62c9\u529f\u7387\u3002' },
    ]},

    { id: 'a2_scrammed_early', time: t(0, 10), priority: 5, condition: function(s, f) {
      return s.azFired && f.act === 2 && !f.voluntary_shutdown && !f.branch_xenon_pit;
    }, actions: [
      { type: 'protections', p2: true },
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u4f60\u505c\u4e86\u3002\n\u8bd5\u9a8c\u505a\u4e0d\u4e86\u4e86\u3002\u660e\u5929\u8c03\u5ea6\u4f1a\u95ee\u3002\n\u2026\u2026\u4ed6\u8f6c\u8eab\u8d70\u4e86\u3002' },
      { type: 'log', text: '00:10 \u4f60\u6309\u4e0b\u4e86 \u0410\u0417-5\u3002\u53cd\u5e94\u5806\u5b89\u5168\u505c\u95ed\u3002' },
      { type: 'flag', key: 'voluntary_shutdown', value: true },
      { type: 'act', value: '2B' },
      { type: 'timeskip', to: t(8, 0, 1) },
      { type: 'timescale', value: 60 },
      { type: 'objective', text: '\u505c\u5806\u5b8c\u6210\u3002\u503c\u5b88\u81f3\u767d\u73ed\uff0c\u7b49\u5f85\u5ba1\u6838\u3002',
        completeWhen: function(s) { return s.t >= t(8, 0, 1) / 1000; } },
    ]},

    /* —— 停堆线：第二幕B «Ожидание» → 第三幕B «Заново» —— */
    { id: 'a2_shutdown', time: null, priority: 20, condition: function(s, f) {
      return f.branch_xenon_pit === 'shutdown';
    }, actions: [
      { type: 'protections', p2: true },
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u4f60\u786e\u5b9a\uff1f\n\u4f60\u77e5\u9053\u8fd9\u610f\u5473\u7740\u4ec0\u4e48\u3002\u8bd5\u9a8c\u505a\u4e0d\u4e86\u4e86\u3002' },
      { type: 'flag', key: 'voluntary_shutdown', value: true },
      { type: 'act', value: '2B' },
      { type: 'log', text: '00:40 \u4f60\u6309\u4e0b\u4e86 \u0410\u0417-5\u3002\u53cd\u5e94\u5806\u5b89\u5168\u505c\u95ed\u3002' },
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u2026\u2026\u4ed6\u8f6c\u8eab\u8d70\u4e86\u3002' },
      { type: 'timeskip', to: t(8, 0, 1) },
      { type: 'timescale', value: 60 },
    ]},

    { id: 'a3b_start', time: t(8, 0, 1), priority: 1, condition: function(s, f) {
      return f.act === '2B';
    }, actions: [
      { type: 'az_reset' },
      { type: 'protections', p2: true },
      { type: 'phone', from: '\u8c03\u5ea6', text: '\u6c19\u6bd2\u5df2\u9000\u5316\u3002\u6062\u590d\u529f\u7387\uff0c\u8bd5\u9a8c\u53ef\u4ee5\u505a\u3002', duration: 4000 },
      { type: 'log', text: '08:00 \u8c03\u5ea6\u6765\u7535\uff1a\u6062\u590d\u529f\u7387\uff0c\u51c6\u5907\u8bd5\u9a8c\u3002' },
      { type: 'mode', value: 'auto' },
      { type: 'target', value: 100 },
      { type: 'sim_override', target: 'power', value: 3200, ramp: 600000 },
      { type: 'sim_override', target: 'rod', value: 53.7, ramp: 600000 },
      { type: 'act', value: '3B' },
      { type: 'objective', text: '\u76ee\u6807\uff1a\u81ea\u52a8\u6062\u590d\u529f\u7387\u81f3 3200 \u041c\u0412\u0442\uff0c\u7b49\u5f85 14:00 \u8bd5\u9a8c\u3002',
        completeWhen: function(s) { return s.n > 0.95; } },
    ]},

    { id: 'a3b_test', time: t(14, 0, 1), priority: 1, condition: function(s, f) {
      return f.act === '3B';
    }, actions: [
      { type: 'dialogue', speaker: '\u503c\u73ed\u957f', text: '\u529f\u7387\u5230\u4e86\u3002\u505a\u8bd5\u9a8c\u3002' },
      { type: 'log', text: '14:00 \u8bd5\u9a8c\u5f00\u59cb\uff1a\u6c7d\u8f6e\u673a\u60f0\u8d70 45 \u79d2\uff0c\u67f4\u6cb9\u53d1\u7535\u673a\u542f\u52a8\u3002\u8bd5\u9a8c\u6210\u529f\u3002' },
      { type: 'endgame', endType: 'SAFE_SHUTDOWN', epilogue: 'epilogue_quiet' },
    ]},

    /* —— 继续线：第三幕 «Тяга» —— */
    { id: 'a2_continue', time: null, priority: 20, condition: function(s, f) {
      return f.branch_xenon_pit === 'continue' && f.act === 2;
    }, actions: [
      { type: 'protections', p2: true },
      { type: 'log', text: '\u64cd\u7eb5\u5458\u5f00\u59cb\u62d4\u68d2\u3002' },
      { type: 'sim_override', target: 'power', value: 200, ramp: 600000 },
      { type: 'act', value: 3 },
      { type: 'objective', text: '\u76ee\u6807\uff1a\u7f13\u6162\u63d0\u68d2\u6062\u590d\u529f\u7387\u81f3 ~200 \u041c\u0412\u0442\uff08\u6ce8\u610f\u5468\u671f\uff09\u3002',
        completeWhen: function(s) { return s.n >= 0.05; } },
    ]},

    { id: 'a3_pull', time: t(0, 40), priority: 1, condition: function(s, f) {
      return f.act === 3 && !f.act3_done;
    }, actions: [
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u62c9\u529f\u7387\u3002200 \u5146\u74e6\uff0c\u505a\u8bd5\u9a8c\u3002' },
      { type: 'log', text: '00:40 \u624b\u52a8\u63d0\u68d2\uff0c\u529f\u7387\u56de\u5347\u3002' },
    ]},

    { id: 'a3_recover', time: null, priority: 2, condition: function(s, f) {
      return f.act === 3 && s.n > 0.05 && !f.act3_done;
    }, actions: [
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '200 \u591f\u4e86\u3002\u505a\u8bd5\u9a8c\u3002' },
      { type: 'log', text: '\u529f\u7387\u7a33\u5b9a\u5728 ~200 \u041c\u0412\u0442\u3002' },
      { type: 'flag', key: 'act3_done', value: true },
      { type: 'act', value: 4 },
    ]},

    { id: 'a3_stuck', time: t(1, 0), priority: 2, condition: function(s, f) {
      return f.act === 3 && s.n < 0.03 && !s.azFired;
    }, actions: [
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u529f\u7387\u8fd8\u5728 30 \u5146\u74e6\u3002\u628a\u68d2\u62c9\u51fa\u6765\uff01' },
      { type: 'log', text: '01:00 \u529f\u7387\u672a\u56de\u5347\u3002' },
    ]},

    /* —— 继续线：第四幕 «Подготовка» 01:00–01:20 —— */
    { id: 'a4_saor', time: t(1, 0), priority: 1, condition: function(s, f) {
      return f.act === 4 && !f.saor_off;
    }, actions: [
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u628a \u0421\u0410\u041e\u0420 \u5207\u4e86\u3002\u8bd5\u9a8c\u671f\u95f4\u4e0d\u80fd\u8ba9\u5b83\u8bef\u89e6\u53d1\u505c\u5806\u3002' },
      { type: 'log', text: '01:00 \u0414\u044f\u0442\u043b\u043e\u0432 \u547d\u4ee4\uff1a\u5173\u95ed\u5e94\u6025\u5806\u82af\u51b7\u5374\u7cfb\u7edf\u3002' },
      { type: 'objective', text: '\u51c6\u5907\u8bd5\u9a8c\uff1a\u56de\u5e94 \u0421\u0410\u041e\u0420 \u547d\u4ee4\uff08\u53ef\u62d2\u7edd\uff09\u3002',
        completeWhen: function(s, f) { return !!f.saor_off; } },
      { type: 'branch', id: 'saor_disable', detectBy: 'action',
        rules: [
          { if: 'az_pressed', choice: 'refuse' },
          { if: 'rod_withdrawn', choice: 'obey' },
        ],
        timeout: 180000,
        default: 'obey' },
    ]},

    { id: 'a4_obey', time: null, priority: 10, condition: function(s, f) {
      return f.branch_saor_disable === 'obey';
    }, actions: [
      { type: 'log', text: '01:03 \u0421\u0410\u041e\u0420 \u5df2\u5173\u95ed\u3002\u64cd\u4f5c\u4eba\uff1a\u6258\u666e\u56fe\u8bfa\u592b\u3002\u6307\u4ee4\u6765\u6e90\uff1a\u0414\u044f\u0442\u043b\u043e\u0432\u3002' },
      { type: 'flag', key: 'saor_off', value: true },
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u6d41\u91cf\u4e0d\u591f\u3002\u518d\u5f00\u4e24\u53f0\u6cf5\u3002' },
      { type: 'pumps', value: 8 },
      { type: 'log', text: '01:05 \u4e3b\u6cf5 7\u30018 \u542f\u52a8\u3002\u6d41\u91cf 100%\u3002' },
    ]},

    { id: 'a4_refuse', time: null, priority: 10, condition: function(s, f) {
      return f.branch_saor_disable === 'refuse';
    }, actions: [
      { type: 'dialogue', speaker: '\u0414\u044f\u0442\u043b\u043e\u0432', text: '\u8fd9\u662f\u547d\u4ee4\u3002\n\u2026\u2026\u597d\u3002\u90a3\u4f60\u81ea\u5df1\u8ddf\u8c03\u5ea6\u89e3\u91ca\u3002' },
      { type: 'log', text: '\u8bd5\u9a8c\u53d6\u6d88\u3002\u4f60\u88ab\u8bb0\u8fc7\u3002' },
      { type: 'endgame', endType: 'SAFE_SHUTDOWN', epilogue: 'epilogue_hidden' },
    ]},

    { id: 'a4_turbine', time: t(1, 10), priority: 1, condition: function(s, f) {
      return f.saor_off && !f.turbine_off;
    }, actions: [
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u65ad\u5f00\u6c7d\u8f6e\u673a\u3002\u8bd5\u9a8c\u8981\u6c42\uff1a\u6a21\u62df\u5931\u7535\u3002' },
      { type: 'log', text: '01:10 \u6c7d\u8f6e\u673a\u4e0e\u7535\u7f51\u65ad\u5f00\u3002' },
      { type: 'flag', key: 'turbine_off', value: true },
    ]},

    { id: 'a4_test', time: t(1, 20), priority: 1, condition: function(s, f) {
      return f.turbine_off && !f.act5;
    }, actions: [
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u5f00\u59cb\u5427\u3002' },
      { type: 'log', text: '01:20 \u8bd5\u9a8c\u5f00\u59cb\uff1a\u6c7d\u8f6e\u673a\u60f0\u8d70\uff0c\u53d1\u7535\u673a\u5931\u7535\u3002' },
      { type: 'act', value: 5 },
      { type: 'flag', key: 'act5', value: true },
      { type: 'objective', text: '\u8bd5\u9a8c\u5f00\u59cb\uff1a\u6ce8\u610f\u529f\u7387\u8d70\u5411\uff0c\u51c6\u5907 \u0410\u0417-5\u3002',
        completeWhen: function(s) { return s.azFired; } },
    ]},

    /* —— 继续线：第五幕 «АЗ-5» 01:23（实时 ×1）—— */
    { id: 'a5_rise', time: t(1, 23) + 4000, priority: 1, condition: function(s, f) {
      return f.act5 && !s.azFired;
    }, actions: [
      { type: 'timescale', value: 1 },
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u529f\u7387\u5728\u6da8\u3002' },
      { type: 'log', text: '01:23:04 \u529f\u7387\u5f00\u59cb\u4e0a\u5347\u3002' },
      { type: 'objective', text: '\u529f\u7387\u4e0a\u5347\u4e2d\uff1a\u7b49\u5f85\u81ea\u52a8 \u0410\u0417-5\uff0801:23:47\uff09\u6216\u624b\u52a8\u505c\u5806\u3002' },
      { type: 'branch', id: 'az5_press', detectBy: 'action',
        rules: [
          { if: 'az_pressed', choice: 'press' },
        ],
        timeout: 43000,
        default: 'press' },
    ]},

    { id: 'a5_press', time: t(1, 23) + 30000, priority: 1, condition: function(s, f) {
      return f.act5 && !s.azFired;
    }, actions: [
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u6309\u3002' },
    ]},

    { id: 'a5_autoaz', time: t(1, 23) + 47000, priority: 1, condition: function(s, f) {
      return f.act5 && !s.azFired;
    }, actions: [
      { type: 'az', reason: '\u0410\u043a\u0438\u043c\u043e\u0432 \u6309\u4e0b\u4e86 \u0410\u0417-5' },
      { type: 'log', text: '01:23:47 \u963f\u57fa\u83ab\u592b\u6309\u4e0b \u0410\u0417-5\u3002' },
    ]},

    { id: 'a5_explosion', time: null, priority: 10, condition: function(s, f) {
      return f.act5 && s.azFired && (s.n > 0.6 || s.meltdown) && !f.exploded;
    }, actions: [
      { type: 'flag', key: 'exploded', value: true },
      { type: 'sound', id: 'alarm_high', volume: 0.8 },
      { type: 'log', text: '01:23:45 \u529f\u7387\u7a81\u7834 2000 \u041c\u0412\u0442\uff01' },
      { type: 'dialogue', speaker: '\u6258\u666e\u56fe\u8bfa\u592b', text: '\u529f\u7387\u5728\u6da8\uff01' },
    ]},

    { id: 'a5_saved', time: t(1, 26), priority: 10, condition: function(s, f) {
      return f.act5 && s.azFired && !f.exploded && !s.meltdown && s.n < 0.2;
    }, actions: [
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u2026\u2026\u505c\u4e86\u3002\n\u6ca1\u6709\u7206\u70b8\u3002' },
      { type: 'log', text: '01:26 \u529f\u7387\u5e73\u7a33\u4e0b\u964d\u3002\u6ca1\u6709\u7206\u70b8\u3002' },
      { type: 'endgame', endType: 'SAFE_SHUTDOWN', epilogue: 'epilogue_scram_saved' },
    ]},

    { id: 'a5_nearmiss', time: t(1, 26), priority: 10, condition: function(s, f) {
      return f.act5 && f.exploded && !f.a5_nearmiss_done && s.azFired && !s.meltdown && s.n < 0.2;
    }, actions: [
      { type: 'flag', key: 'a5_nearmiss_done', value: true },
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u2026\u2026\u505c\u4e86\u3002\n\u521a\u624d\u90a3\u4e00\u4e0b\uff0c\u5806\u82af\u5dee\u70b9\u71c3\u7a7f\u3002' },
      { type: 'log', text: '01:26 \u529f\u7387\u843d\u56de\u5b89\u5168\u533a\u3002\u5806\u82af\u672a\u7194\u6bc1\u2014\u2014\u5343\u94a7\u4e00\u53d1\u3002' },
      { type: 'endgame', endType: 'SAFE_SHUTDOWN', epilogue: 'epilogue_scram_saved' },
    ]},

    /* —— 第六幕 «После»：熔毁后的灾后阶段 —— */
    { id: 'a0_meltdown_early', time: null, priority: 30, condition: function(s, f) {
      return s.meltdown && s.t < t(23, 10) / 1000;
    }, actions: [
      { type: 'endgame', endType: 'EXPLOSION', epilogue: 'epilogue_blast' },
    ]},

    { id: 'a6_start', time: null, priority: 20, condition: function(s, f) {
      return s.meltdown && s.t >= t(23, 10) / 1000 && !f.a6_done;
    }, actions: [
      { type: 'flag', key: 'a6_done', value: true },
      { type: 'flag', key: 'meltdown_at', value: '@stime' },
      { type: 'act', value: 6 },
      { type: 'timescale', value: 60 },
      { type: 'sound', id: 'alarm_high', volume: 0.8 },
      { type: 'log', text: '01:24 \u5e94\u6025\u706f\u3002\u8b66\u62a5\u58f0\u91cd\u53e0\u3002\u8f90\u5c04\u6c34\u5e73\u5728\u8df3\u3002' },
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u6ce8\u6c34\uff01\u624b\u52a8\u6ce8\u6c34\uff01' },
      { type: 'objective', text: '\u707e\u540e\u54cd\u5e94\uff1a\u7ee7\u7eed\u6ce8\u6c34\uff0c\u8bb0\u5f55\u8f90\u5c04\u8bfb\u6570\u3002' },
    ]},

    { id: 'a6_water', time: null, priority: 20, condition: function(s, f) {
      return f.a6_done && s.t >= f.meltdown_at + 600 && !f.a6_water_done;
    }, actions: [
      { type: 'flag', key: 'a6_water_done', value: true },
      { type: 'dialogue', speaker: '\u6258\u666e\u56fe\u8bfa\u592b', text: '\u6c34\u6ce8\u4e0d\u8fdb\u53bb\u3002\u6d41\u91cf\u4e3a\u96f6\u3002' },
      { type: 'log', text: '\u5907\u7528\u7ed9\u6c34\u6cf5\u8fd0\u884c\uff0c\u6d41\u91cf\u4e3a\u96f6\u3002\u5806\u82af\u5df2\u635f\u3002' },
    ]},

    { id: 'a6_walls', time: null, priority: 20, condition: function(s, f) {
      return f.a6_done && s.t >= f.meltdown_at + 2400 && !f.a6_walls_done;
    }, actions: [
      { type: 'flag', key: 'a6_walls_done', value: true },
      { type: 'dialogue', speaker: '\u503c\u73ed\u5458', text: '\u5c4b\u9876\u584c\u4e86\u3002' },
      { type: 'log', text: '\u8f90\u5c04\u8bfb\u6570\u6301\u7eed\u4e0a\u5347\u3002' },
    ]},

    { id: 'a6_limit', time: null, priority: 20, condition: function(s, f) {
      return f.a6_done && s.t >= f.meltdown_at + 4800 && !f.a6_limit_done;
    }, actions: [
      { type: 'flag', key: 'a6_limit_done', value: true },
      { type: 'log', text: '03:00 \u8f90\u5c04\u8d85\u8fc7\u4eea\u8868\u91cf\u7a0b\uff1a\u0417\u0410\u041f\u0420\u0415\u0414\u0415\u041b\u3002' },
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u7ee7\u7eed\u6ce8\u6c34\u3002' },
    ]},

    { id: 'a6_leave', time: null, priority: 20, condition: function(s, f) {
      return f.a6_done && s.t >= f.meltdown_at + 9000 && !f.a6_leave_done;
    }, actions: [
      { type: 'flag', key: 'a6_leave_done', value: true },
      { type: 'dialogue', speaker: '\u0410\u043a\u0438\u043c\u043e\u0432', text: '\u51fa\u53bb\u5427\u3002' },
    ]},

    { id: 'a6_end', time: null, priority: 20, condition: function(s, f) {
      return f.a6_done && s.t >= f.meltdown_at + 16200;
    }, actions: [
      { type: 'endgame', endType: 'EXPLOSION', epilogue: 'epilogue_blast' },
    ]},
  ];

  var CHRONICLE = {
    id: 'chronicle_04',
    name: '1986.04.26 \u00b7 4\u53f7\u673a\u7ec4',
    initialFlags: { act: 1 },
    events: CHRONICLE_EVENTS,
    actMeta: {
      1:   { ru: '\u0410\u041a\u0422 I \u00b7 \u0421\u043c\u0435\u043d\u0430', cn: '\u7B2C\u4E00\u5E55 \u00B7 \u767D\u73ED' },
      2:   { ru: '\u0410\u041A\u0422 II \u00b7 \u042F\u043c\u0430', cn: '\u7B2C\u4E8C\u5E55 \u00B7 \u6C19\u5751' },
      '2B': { ru: '\u0410\u041A\u0422 II-\u0411 \u00b7 \u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435', cn: '\u7B2C\u4E8C\u5E55B \u00B7 \u7B49\u5F85' },
      3:   { ru: '\u0410\u041A\u0422 III \u00b7 \u0422\u044F\u0433\u0430', cn: '\u7B2C\u4E09\u5E55 \u00B7 \u63D0\u68D2' },
      '3B': { ru: '\u0410\u041A\u0422 III-\u0411 \u00b7 \u0417\u0430\u043D\u043E\u0432\u043E', cn: '\u7B2C\u4E09\u5E55B \u00B7 \u91CD\u6765' },
      4:   { ru: '\u0410\u041A\u0422 IV \u00b7 \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430', cn: '\u7B2C\u56DB\u5E55 \u00B7 \u51C6\u5907' },
      5:   { ru: '\u0410\u041A\u0422 V \u00b7 \u0410\u0417-5', cn: '\u7B2C\u4E94\u5E55 \u00B7 \u8BD5\u9A8C' },
      6:   { ru: '\u0410\u041A\u0422 VI \u00b7 \u041F\u043E\u0441\u043B\u0435', cn: '\u7B2C\u516D\u5E55 \u00B7 \u707E\u540E' },
    },
  };

  var REGISTRY = {
    'chronicle_04': CHRONICLE,
  };

  window.Scenario = {
    Runtime: ScenarioRuntime,
    create: function(id) {
      var data = REGISTRY[id];
      if (!data) return null;
      return new ScenarioRuntime(data);
    },
    ids: function() { return Object.keys(REGISTRY); },
  };
})();
