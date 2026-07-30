export function ScenarioEngine(events) {
  this.events = (events || []).slice().sort(function(a, b) { return (a.priority || 0) - (b.priority || 0); });
  this.firedEvents = {};
  this.firedTimes = {};
  this.pendingActions = [];
  this.tags = {};
  this.lastPlayerAction = null;
  this.simTime = 0;
  this.listeners = {};
}

ScenarioEngine.prototype.checkTrigger = function(trigger, state, simTime) {
  if (!trigger) return false;
  switch (trigger.type) {
    case 'time':
      return simTime >= trigger.simTime;
    case 'state':
      if (typeof trigger.check === 'function') return trigger.check(state);
      return false;
    case 'player_action':
      return this.lastPlayerAction === trigger.action;
    case 'event_fired':
      if (!this.firedEvents[trigger.eventId]) return false;
      if (trigger.delay) {
        return simTime >= (this.firedTimes[trigger.eventId] || 0) + trigger.delay;
      }
      return true;
    case 'compound':
      if (trigger.op === 'AND') {
        for (var i = 0; i < trigger.conditions.length; i++) {
          if (!this.checkTrigger(trigger.conditions[i], state, simTime)) return false;
        }
        return true;
      } else {
        for (var j = 0; j < trigger.conditions.length; j++) {
          if (this.checkTrigger(trigger.conditions[j], state, simTime)) return true;
        }
        return false;
      }
    default:
      return false;
  }
};

ScenarioEngine.prototype.update = function(state, simTime) {
  this.simTime = simTime;
  this.processPendingActions(simTime);

  for (var i = 0; i < this.events.length; i++) {
    var event = this.events[i];
    if (event.oneShot && this.firedEvents[event.id]) continue;
    if (this.checkTrigger(event.trigger, state, simTime)) {
      this.fireEvent(event, simTime);
    }
  }
};

ScenarioEngine.prototype.processPendingActions = function(simTime) {
  var remaining = [];
  for (var i = 0; i < this.pendingActions.length; i++) {
    var pa = this.pendingActions[i];
    if (pa.time <= simTime) {
      this.executeAction(pa.action);
    } else {
      remaining.push(pa);
    }
  }
  this.pendingActions = remaining;
};

ScenarioEngine.prototype.fireEvent = function(event, simTime) {
  this.firedEvents[event.id] = true;
  this.firedTimes[event.id] = simTime;
  if (event.tags) {
    for (var i = 0; i < event.tags.length; i++) {
      this.tags[event.tags[i]] = true;
    }
  }
  this.emit('event', event.id, simTime);

  var accumulatedDelay = 0;
  for (var j = 0; j < event.actions.length; j++) {
    var action = event.actions[j];
    if (action.type === 'wait') {
      accumulatedDelay += action.seconds;
    } else {
      this.pendingActions.push({
        time: simTime + accumulatedDelay,
        action: action,
      });
    }
  }
};

ScenarioEngine.prototype.executeAction = function(action) {
  this.emit('action', action);
};

ScenarioEngine.prototype.notifyPlayerAction = function(action) {
  this.lastPlayerAction = action;
};

ScenarioEngine.prototype.hasTag = function(tag) {
  return !!this.tags[tag];
};

ScenarioEngine.prototype.isFired = function(eventId) {
  return !!this.firedEvents[eventId];
};

ScenarioEngine.prototype.reset = function() {
  this.firedEvents = {};
  this.firedTimes = {};
  this.pendingActions = [];
  this.tags = {};
  this.lastPlayerAction = null;
  this.simTime = 0;
};

// Event emitter pattern
ScenarioEngine.prototype.on = function(event, callback) {
  if (!this.listeners[event]) this.listeners[event] = [];
  this.listeners[event].push(callback);
};

ScenarioEngine.prototype.emit = function(event) {
  var cbs = this.listeners[event];
  if (!cbs) return;
  var args = Array.prototype.slice.call(arguments, 1);
  for (var i = 0; i < cbs.length; i++) {
    cbs[i].apply(null, args);
  }
};

// ================== Scenario Registry ==================

var SCENARIO_REGISTRY = {};

export function registerScenario(id, config) {
  SCENARIO_REGISTRY[id] = config;
}

export function getScenarioConfig(id) {
  return SCENARIO_REGISTRY[id] || null;
}

export function getAllScenarioIds() {
  var keys = [];
  for (var k in SCENARIO_REGISTRY) {
    if (SCENARIO_REGISTRY.hasOwnProperty(k)) keys.push(k);
  }
  return keys;
}

export function createScenarioEngine(id) {
  var config = SCENARIO_REGISTRY[id];
  if (!config) return null;
  return new ScenarioEngine(config.events || []);
}

// ================== Scenario State Manager ==================

export function ScenarioStateManager() {
  this.state = {
    currentScenario: null,
    scenarioIndex: -1,
    completed: {},
    inherited: {},
  };
}

ScenarioStateManager.prototype.startScenario = function(id, index) {
  this.state.currentScenario = id;
  this.state.scenarioIndex = index;
};

ScenarioStateManager.prototype.completeScenario = function(id, result) {
  this.state.completed[id] = { result: result, time: Date.now() };
  this.state.inherited[id] = result ? Object.assign({}, result) : {};
};

ScenarioStateManager.prototype.getInheritedState = function(id) {
  return this.state.inherited[id] || null;
};

ScenarioStateManager.prototype.getCompletedScenarios = function() {
  return Object.keys(this.state.completed);
};

ScenarioStateManager.prototype.isAllCompleted = function() {
  var ids = getAllScenarioIds();
  for (var i = 0; i < ids.length; i++) {
    if (!this.state.completed[ids[i]]) return false;
  }
  return true;
};

// ================== Standard Event Actions ==================

export function createDialogueAction(speaker, lines) {
  return { type: 'dialogue', speaker: speaker, lines: lines };
}

export function createAlarmAction(alarmId, level) {
  return { type: 'alarm', alarmId: alarmId, level: level || 'warning' };
}

export function createAlarmClearAction(alarmId) {
  return { type: 'alarm_clear', alarmId: alarmId };
}

export function createPhoneCallAction(from, script) {
  return { type: 'phone_call', from: from, script: script };
}

export function createEndAction(result, reason) {
  return { type: 'end', result: result || 'success', reason: reason || '' };
}

// ================== Scenario 1: 降功率 ==================

registerScenario('scenario_1', {
  id: 'scenario_1',
  version: 1,
  name_ru: '\u0421\u043D\u0438\u0436\u0435\u043D\u0438\u0435 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438',
  name_zh: '\u964D\u529F\u7387',
  description_zh: '\u767D\u7248 08:00\u201312:00\uFF0C\u4ECE 3200 MW \u964D\u5230 1600 MW\uFF0C\u5B66\u4E60\u57FA\u7840\u64CD\u4F5C',
  startClock: '08:00',
  startDate: '1986-04-25',
  initialState: 'FULL_POWER',
  hints: [
    { condition: 'order_received', wait: 5, text: '\u6253\u5F00\u624B\u518C\uFF0C\u7FFB\u5230 4.2 \u8282\u3002' },
    { condition: 'power_lt_2400', text: '\u529F\u7387\u4F4E\u4E8E 2400\u3002\u5E94\u505C\u6CF5\u3002' },
    { condition: 'xe_gt_1.2', text: '\u6C28\u6D53\u5EA6\u4E0A\u5347\u3002\u68C0\u67E5\u624B\u518C 4.2.2\u3002' },
    { condition: 'obr_lt_30', text: 'OBR \u4F4E\u4E8E 30\u3002\u505C\u6B62\u63D0\u68D2\u3002' },
    { condition: 'target_reached_no_report', text: '\u6253\u7535\u8BDD\u6C47\u62A5\u503C\u73ED\u4E3B\u4EFB\u3002' },
    { condition: 'reported_no_log', text: '\u586B\u5199\u8BB0\u5F55\u677F\u3002' },
  ],
  events: [
    {
      id: 's1_intro',
      name: '\u4EA4\u63A5\u73ED',
      priority: 0,
      oneShot: true,
      trigger: { type: 'time', simTime: 0 },
      actions: [
        { type: 'dialogue', speaker: '\u7CFB\u7EDF', lines: [
          { speaker: '\u7CFB\u7EDF', text_zh: '\u4EA4\u63A5\u73ED\u5B8C\u6BD5\u3002\u673A\u7EC4\u6EE1\u529F\u7387\u8FD0\u884C\u3002', delay: 0, typing: true },
        ]},
      ],
    },
  ],
});

// ================== Scenario 2: 涡轮惰转试验 ==================

registerScenario('scenario_2', {
  id: 'scenario_2',
  version: 1,
  name_ru: '\u0418\u0441\u043F\u044B\u0442\u0430\u043D\u0438\u0435 \u0432\u044B\u0431\u0435\u0433\u0430',
  name_zh: '\u6DA4\u8F6E\u60F0\u8F6C\u8BD5\u9A8C',
  description_zh: '\u591C\u73ED 23:10\u201301:00\uFF0C\u5207 \u0421\u0410\u041E\u0420 \u2192 \u60F0\u8F6C \u2192 \u67F4\u6CB9\u542F\u52A8',
  startClock: '23:10',
  startDate: '1986-04-25',
  initialState: 'CHERNOBYL_PRE',
  events: [],
});

// ================== Scenario 3: 事故 ==================

registerScenario('scenario_3', {
  id: 'scenario_3',
  version: 1,
  name_ru: '\u0410\u0432\u0430\u0440\u0438\u044F',
  name_zh: '\u4E8B\u6545',
  description_zh: '01:03\u201301:23:47\uFF0C\u4E1C\u65B9\u5C55\u5F00\u4E86\u6211\u7684\u4EBA\u751F\u4E4B\u8DEF',
  startClock: '01:03',
  startDate: '1986-04-26',
  initialState: 'CHERNOBYL_PRE',
  events: [],
});

// ================== Scenario configs for common use ==================

export var SCENARIO_DEFAULTS = {
  'scenario_1': {
    expectedSequence: [
      { action: 'CHECK_LIGHTS', required: true, order: 1 },
      { action: 'RECEIVE_ORDER', required: true, order: 2 },
      { action: 'INSERT_RODS', required: true, order: 3 },
      { action: 'STOP_PUMPS', required: true, order: 4, maxCount: 4 },
      { action: 'MONITOR_XENON', required: true, order: 5, minDuration: 10 },
      { action: 'REACH_TARGET', required: true, order: 6 },
      { action: 'STABILIZE', required: true, order: 7, minDuration: 30 },
      { action: 'LOG_ENTRY', required: false, order: 8 },
    ],
    requiredLogFields: ['initial_power', 'target_power', 'pumps_stopped', 'final_xe', 'shift_time'],
    safetyParams: [
      { name: 'power', warn: [3200, 3600], danger: [3600, 5000] },
      { name: 'period', warn: [10, 20], danger: [0, 10] },
      { name: 'xe', warn: [0.8, 1.0], danger: [1.0, 3.0] },
    ],
  },
  'scenario_2': {
    expectedSequence: [
      { action: 'RECEIVE_BRIEFING', required: true, order: 1 },
      { action: 'REDUCE_POWER', required: true, order: 2 },
      { action: 'DISABLE_SAOR', required: true, order: 3 },
      { action: 'CONTACT_TC', required: true, order: 4 },
      { action: 'START_RUNDOWN', required: true, order: 5 },
      { action: 'MONITOR_DIESEL', required: true, order: 6 },
      { action: 'RESTORE_SAOR', required: true, order: 7 },
      { action: 'LOG_RESULT', required: false, order: 8 },
    ],
    requiredLogFields: ['test_start', 'test_end', 'rundown_time', 'pump_status'],
    safetyParams: [
      { name: 'power', warn: [0, 800], danger: [800, 1200] },
      { name: 'pump_flow', warn: [5000, 8000], danger: [0, 5000] },
    ],
  },
  'scenario_3': {
    expectedSequence: [
      { action: 'RECEIVE_ORDER', required: true, order: 1 },
      { action: 'MAKE_CHOICE', required: true, order: 2 },
      { action: 'AZ5_PRESS', required: false, order: 3 },
    ],
    requiredLogFields: ['az5_time', 'final_power', 'radiation_level'],
    safetyParams: [
      { name: 'power', warn: [500, 1000], danger: [1000, 50000] },
      { name: 'period', warn: [1, 5], danger: [0, 1] },
      { name: 'fuel_temp', warn: [500, 1000], danger: [1000, 3000] },
    ],
  },
};
