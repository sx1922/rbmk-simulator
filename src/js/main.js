// main.js — 启动、主循环、步进调度
// 所有操作的入口，协调物理、系统、UI

var Main = {};

Main.init = function() {
  STATE.init();
  Systems.Instruments.init(STATE);
  this.canvas = document.getElementById('gameCanvas');
  this.ctx = this.canvas.getContext('2d');
  this.canvas.width = 800;
  this.canvas.height = 600;
  this.lastTime = performance.now();
  this.accumulator = 0;
  this.STEP_DT = 0.5; // 每个物理步进对应游戏内 0.5 小时

  // 事件绑定
  this._bindEvents();

  // 音频初始化
  Audio.init();

  // 启动循环
  var self = this;
  function loop(time) {
    self._tick(time);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
};

Main._bindEvents = function() {
  var self = this;
  var canvas = this.canvas;

  canvas.addEventListener('click', function(e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (800 / rect.width);
    var y = (e.clientY - rect.top) * (600 / rect.height);
    self._handleClick(x, y);
  });

  canvas.addEventListener('mousemove', function(e) {
    var rect = canvas.getBoundingClientRect();
    self.mouseX = (e.clientX - rect.left) * (800 / rect.width);
    self.mouseY = (e.clientY - rect.top) * (600 / rect.height);
  });

  document.addEventListener('keydown', function(e) {
    self._handleKey(e.key);
  });
};

Main._tick = function(time) {
  var dt = (time - this.lastTime) / 1000;
  this.lastTime = time;
  if (dt > 0.1) dt = 0.1; // 防止大跳帧
  this.dt = dt;

  // 物理步进（累加时间，固定步长）
  if (STATE.started && !STATE.gameOver) {
    this.accumulator += dt;
    while (this.accumulator >= this.STEP_DT) {
      this._step();
      this.accumulator -= this.STEP_DT;
    }
  }

  // 渲染
  this._render();

  // 音频
  Audio.tick(STATE);
};

Main._step = function() {
  var r = STATE.r;
  var hours = 0.5;

  // 计算反应性
  Physics.Reactivity.compute(STATE);

  // 中子动力学步进
  Physics.Neutron.step(hours, STATE);

  // 氙毒步进
  Physics.Xenon.step(hours, STATE);

  // 热工水力步进（5 区）
  Physics.Thermal.step(hours, STATE);

  // 汽轮机步进
  Physics.Turbine.step(hours, STATE);

  // 保护逻辑检查
  var alarms = Physics.Protection.check(STATE);
  for (var i = 0; i < alarms.length; i++) {
    STATE.logs.unshift({ type: 'alarm', msg: alarms[i], time: this._timeStr() });
  }

  // 系统更新
  Systems.Economy.daily(STATE, hours);
  Systems.Personnel.shiftChange(STATE);
  Systems.Maintenance.degrade(STATE);

  // 随机事件
  Systems.Events.trigger(STATE, function(a, b) { return STATE._range(a, b); });

  // 任务链
  if (STATE.mission.active) {
    Systems.Mission.checkProgress(STATE);
  } else if (!STATE.mission.completed) {
    Systems.Mission.checkTrigger(STATE);
    if (STATE.mission.active) {
      Systems.Mission.start(STATE);
      this._log('info', '安全试验任务链已触发');
    }
  }

  // 趋势记录
  STATE.trend.push(r.power);
  STATE.xenonTrend.push(r.xenon);
  if (STATE.trend.length > 200) STATE.trend.shift();
  if (STATE.xenonTrend.length > 200) STATE.xenonTrend.shift();

  // 时间推进
  STATE.hour += hours;
  while (STATE.hour >= 24) {
    STATE.hour -= 24;
    STATE.day++;
    STATE.daysOp++;
    if (STATE.day > 30) {
      STATE.day = 1;
      STATE.month++;
      if (STATE.month > 12) { STATE.month = 1; STATE.year++; }
      var pol = Systems.Politics.monthly(STATE);
      if (pol) this._log(pol.met ? 'good' : 'warn', pol.message);
    }
  }

  // 游戏结束检查
  this._checkGameOver();
};

Main._checkGameOver = function() {
  if (STATE.gameOver) return;
  if (STATE.r.state === 'EXPLOSION') {
    STATE.gameOver = true;
    STATE.screen = 'over';
    STATE.overReason = 'AZ-5 后功率失控，蒸汽爆炸掀翻 2000 吨屏蔽盖。';
    STATE.rad = 5000;
    STATE.flashAlpha = 1;
    STATE.shakeTime = 0.7;
  } else if (STATE.r.state === 'MELTDOWN') {
    STATE.gameOver = true;
    STATE.screen = 'over';
    STATE.overReason = '燃料温度超过 2800°C 熔化，放射性物质泄漏。';
    STATE.flashAlpha = 1;
  } else if (STATE.politics <= 0) {
    STATE.gameOver = true;
    STATE.screen = 'over';
    STATE.overReason = '上级信任归零。你被撤职调往西伯利亚燃煤电厂。';
  } else if (STATE.money < -1000000) {
    STATE.gameOver = true;
    STATE.screen = 'over';
    STATE.overReason = '资金严重透支。财政部接管运营。';
  }
};

Main._render = function() {
  var ctx = this.ctx;
  STATE.shakeTime = Math.max(0, STATE.shakeTime - this.dt);
  if (STATE.shakeTime > 0) {
    STATE.shakeX = (Math.random() - 0.5) * 20 * (STATE.shakeTime / 0.7);
    STATE.shakeY = (Math.random() - 0.5) * 12 * (STATE.shakeTime / 0.7);
  } else {
    STATE.shakeX = 0;
    STATE.shakeY = 0;
  }
  STATE.flashAlpha = Math.max(0, STATE.flashAlpha - this.dt * 2);

  ctx.save();
  ctx.translate(STATE.shakeX, STATE.shakeY);
  UI.Render.draw(ctx, STATE, this.dt);
  ctx.restore();
};

Main._log = function(type, msg) {
  STATE.logs.unshift({ type: type, msg: msg, time: this._timeStr() });
  STATE.logUnread++;
};

Main._timeStr = function() {
  return STATE.year + '/' + STATE.month + '/' + STATE.day + ' ' +
    ('0' + Math.floor(STATE.hour)).slice(-2) + ':00';
};

Main._handleClick = function(x, y) {
  // Delegate to render layer's hit detection
  UI.Render.handleClick(x, y, STATE);
};

Main._handleKey = function(key) {
  if (STATE.screen === 'intro') {
    if (key === 'Enter' || key === ' ') {
      STATE.screen = 'game';
      STATE.started = true;
    }
    return;
  }
  if (key === 'Tab') {
    STATE.page = (STATE.page + 1) % 8;
  }
  // Arrow keys, WASD, etc. handled by panels
};
