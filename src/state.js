// state.js — STATE 初始化 + schema
// 全局唯一状态对象

var STATE = {};

STATE.init = function(seed) {
  seed = seed || Date.now();
  var rng = this._rng = { seed: seed, state: seed };

  this.money = CONFIG.START_MONEY;
  this.politics = 70;
  this.diff = 2;
  this.day = 25; this.hour = 8; this.month = 4; this.year = 1986;
  this.daysOp = 0; this.totalGen = 0; this.scrams = 0; this.incidents = 0;
  this.quota = CONFIG.QUOTA; this.quotaDone = 0; this.rad = 0.012;
  this.gameOver = false; this.started = false;
  this.shift = 0;
  this.shiftNames = ['白班 А', '中班 Б', '夜班 В'];
  this.trend = []; this.xenonTrend = [];
  this.logs = []; this.logUnread = 0;
  this.lastEventDay = 0; this.daysSinceEvent = 0;

  // 反应堆状态
  this.r = {
    power: 0,           // MWt
    state: 'SHUTDOWN',  // SHUTDOWN | POWER | SCRAM | LOWPOW | EXPLOSION | MELTDOWN
    rods: new Array(CONFIG.NUM_RODS).fill(100),
    void: 0,            // 0-1 平均空泡份额
    xenon: 0,           // 氙浓度（归一化）
    iodine: 0,          // 碘浓度
    fuelT: 20,          // °C 燃料平均温度
    coolOut: 270,       // °C 出口水温
    coolIn: 270,        // °C 入口水温
    graphiteT: 20,      // °C 石墨温度
    flow: 0,            // m³/h
    pumpsOn: 0,
    hours: 0,           // 累计运行小时
    reactivity: 0,
    az5Done: false,
    az5Phase: 0,
    az5Timer: 0,
    refuelBonus: 0,
  };

  // 热工水力（5 区）
  this.thermal = {
    totalVoid: 0,
    coolantFlow: CONFIG.FLOW_RATED,
    pumpsOn: 8,
    zones: [],
  };
  for (var i = 0; i < 5; i++) {
    this.thermal.zones.push({
      power: 0, tIn: 265, tOut: 265,
      void: 0, tFuel: 300, tClad: 280,
      dnbr: 5.0, boiling: false,
    });
  }

  // 汽轮机
  this.turbine = {
    online: false, speed: 0, steamPressure: 0, steamTemp: 0,
    steamFlow: 0, fwFlow: 0, bypassValve: 0, condenserVacuum: 0.005,
    electricPower: 0, tripped: false, health: 95,
    vibration: 0, axialShift: 0,
  };

  // 仪表层
  this.instruments = {
    list: {},
  };

  // 任务链
  this.mission = {
    active: false, phase: 'idle', completed: false, failed: false,
  };

  // 人员
  this.staff = [];
  this._initStaff();

  // 安全系统
  this.safety = [];
  this._initSafety();

  // 燃料燃耗
  this.fuelBurn = [];
  for (var j = 0; j < 100; j++) this.fuelBurn.push(5 + Math.random() * 13);

  // 成就
  this.achievements = [];
  this.totalCrits = 0; this.maxPowerPct = 0;
  this.survivedXenonPeak = false; this.az5Survived = false;
  this.survivedOverpower = false; this.winterQuotaDone = false;

  // UI 状态
  this.toastMsg = ''; this.toastTimer = 0; this.toastType = '';
  this.screen = 'intro';
  this.page = 0;
  this.shakeTime = 0; this.shakeX = 0; this.shakeY = 0;
  this.flashAlpha = 0;
};

STATE._rng = { seed: 0, state: 0 };

STATE._nextRng = function() {
  this._rng.state = (this._rng.state * 1664525 + 1013904223) >>> 0;
  return (this._rng.state & 0x7fffffff) / 0x80000000;
};

STATE._range = function(a, b) {
  return a + this._nextRng() * (b - a);
};

STATE._initStaff = function() {
  var names = ['阿纳托利','鲍里斯','维克多','德米特里','叶夫根尼','伊戈尔','尤里','列昂尼德','米哈伊尔','尼古拉','谢尔盖','瓦西里'];
  var specs = ['反应堆控制','热工水力','辐射防护','电气系统','化学水处理','涡轮机'];
  var patr = ['维奇','诺夫','斯基'];
  for (var i = 0; i < 12; i++) {
    this.staff.push({
      name: names[i % names.length] + '·' + patr[i % 3],
      skill: 3 + Math.floor(this._nextRng() * 6),
      exp: 0, fatigue: this._range(0, 30), morale: 50 + Math.floor(this._nextRng() * 30),
      shift: i % 3, spec: specs[i % specs.length],
      alive: true, dose: 0,
    });
  }
};

STATE._initSafety = function() {
  var sys = ['紧急冷却 САОР','应急柴油机','辐射监测 КИП','消防系统','通风过滤','应急硼注入'];
  for (var i = 0; i < sys.length; i++) {
    this.safety.push({ name: sys[i], status: this._range(82, 96) });
  }
};
