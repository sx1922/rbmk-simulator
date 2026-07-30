// Scoring/Save/Scenario acceptance tests
// Run: node tests/scoring.test.js

import {
  OperationLog, evaluateProcedure, SafetyEnvelopeTracker, ResponseTracker,
  EquipmentTracker, LogCompleteness, ratingFromScore, createScoreResult,
  generateReport, generateCampaignReport, RATINGS
} from '../lib/scoring.js';
import {
  createNewJournal, recordShiftEnd, validateJournal, exportJournalData,
  setStorageAdapter, defaultSettings, emptyStatistics
} from '../lib/save.js';
import {
  ScenarioEngine, createScenarioEngine, getAllScenarioIds,
  getScenarioConfig, ScenarioStateManager, createDialogueAction,
  createAlarmAction, createEndAction
} from '../lib/scenario.js';

var PASS = 0, FAIL = 0;

function assert(cond, msg) {
  if (cond) { console.log('  [PASS] ' + msg); PASS++; }
  else { console.log('  [FAIL] ' + msg); FAIL++; }
}

function assertIn(a, lo, hi, msg) {
  var ok = a >= lo && a <= hi;
  (ok ? assert : assert)(ok, (msg || '') + ' (expected [' + lo + ', ' + hi + '], got ' + a + ')');
}

var ADAPTER = (function() {
  var store = {};
  return {
    getItem: function(k) { return store[k] || null; },
    setItem: function(k, v) { store[k] = v; },
    removeItem: function(k) { delete store[k]; },
  };
})();

setStorageAdapter(ADAPTER);

console.log('=== SCORING: Procedure ===');

(function() {
  var log = new OperationLog();
  log.record('CHECK_LIGHTS');
  log.record('RECEIVE_ORDER');
  log.record('INSERT_RODS');
  log.record('STOP_PUMPS');
  log.record('MONITOR_XENON');
  log.record('REACH_TARGET');
  log.record('STABILIZE');

  var expected = [
    { action: 'CHECK_LIGHTS', required: true, order: 1 },
    { action: 'RECEIVE_ORDER', required: true, order: 2 },
    { action: 'INSERT_RODS', required: true, order: 3 },
    { action: 'STOP_PUMPS', required: true, order: 4 },
    { action: 'MONITOR_XENON', required: true, order: 5 },
    { action: 'REACH_TARGET', required: true, order: 6 },
    { action: 'STABILIZE', required: true, order: 7 },
  ];

  var score = evaluateProcedure(log, expected);
  assert(score >= 0.95, 'perfect procedure score >= 0.95 (got ' + score.toFixed(4) + ')');
})();

(function() {
  var log = new OperationLog();
  log.record('RECEIVE_ORDER');
  log.record('CHECK_LIGHTS');
  log.record('STOP_PUMPS');
  log.record('MONITOR_XENON');

  var expected = [
    { action: 'CHECK_LIGHTS', required: true, order: 1 },
    { action: 'RECEIVE_ORDER', required: true, order: 2 },
    { action: 'INSERT_RODS', required: true, order: 3 },
    { action: 'STOP_PUMPS', required: true, order: 4 },
  ];

  var score = evaluateProcedure(log, expected);
  assert(score < 0.95 && score > 0.3, 'out-of-order procedure penalty (got ' + score.toFixed(4) + ')');
})();

console.log('\n=== SCORING: Safety ===');

(function() {
  var tracker = new SafetyEnvelopeTracker([
    { name: 'power', warn: [3200, 3600], danger: [3600, 5000] },
  ]);

  var p = 0;
  tracker.start(function() { return { power: p }; });

  // 10 samples at safe levels
  for (var i = 0; i < 10; i++) { p = 3000; tracker.samples.push({ time: Date.now(), values: { power: p } }); }
  // 2 samples at warning levels
  for (var j = 0; j < 2; j++) { p = 3400; tracker.samples.push({ time: Date.now(), values: { power: p } }); }

  tracker.stop();
  var score = tracker.evaluate();
  assert(score > 0.9, 'safe params score > 0.9 (got ' + score.toFixed(4) + ')');
})();

(function() {
  var tracker = new SafetyEnvelopeTracker([
    { name: 'power', warn: [3200, 3600], danger: [3600, 5000] },
  ]);

  // Simulate: 20 samples in danger
  for (var i = 0; i < 20; i++) {
    tracker.samples.push({ time: Date.now(), values: { power: 4000 } });
  }

  var score = tracker.evaluate();
  assert(score === 0, 'sustained danger => score = 0 (got ' + score + ')');
})();

console.log('\n=== SCORING: Response ===');

(function() {
  var tracker = new ResponseTracker();
  // No alarms => perfect
  assert(tracker.evaluate() === 1.0, 'no alarms => score 1.0');
})();

(function() {
  var tracker = new ResponseTracker();
  var now = Date.now();
  tracker.events.push({ code: 'P1', triggerTime: now - 45000, responseTime: now, selfCaused: false });
  var score = tracker.evaluate();
  assert(score >= 0.39 && score <= 0.41, '45s response => 0.4 (got ' + score.toFixed(2) + ')');
})();

console.log('\n=== SCORING: Equipment ===');

(function() {
  var tracker = new EquipmentTracker();
  assert(tracker.evaluate() === 1.0, 'no events => 1.0');
})();

(function() {
  var tracker = new EquipmentTracker();
  tracker.record('PROTECTION_UNNECESSARY');
  tracker.record('SAFETY_VALVE');
  var score = tracker.evaluate();
  assert(score < 0.9, 'penalties reduce score (got ' + score.toFixed(4) + ')');
})();

console.log('\n=== SCORING: Log Completeness ===');

(function() {
  var lc = new LogCompleteness(['power_in', 'power_target', 'pumps_stopped']);
  assert(lc.evaluate() === 0, 'nothing filled => 0');
})();

(function() {
  var lc = new LogCompleteness(['power_in', 'power_target']);
  lc.onFieldWritten('power_in');
  lc.onFieldWritten('power_target');
  assert(lc.evaluate() === 1.0, 'all filled => 1.0');
})();

console.log('\n=== SCORING: Rating Mapping ===');

(function() {
  var t = ratingFromScore(0.97);
  assert(t.rating === '\u043E\u0442\u043B\u0438\u0447\u043D\u043E', '0.97 => \u043E\u0442\u043B\u0438\u0447\u043D\u043E (got ' + t.rating + ')');
})();

(function() {
  var t = ratingFromScore(0.35);
  assert(t.rating === '\u0430\u0432\u0430\u0440\u0438\u0439\u043D\u0430\u044F \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044F', '0.35 => \u0430\u0432\u0430\u0440\u0438\u0439\u043D\u0430\u044F (got ' + t.rating + ')');
})();

console.log('\n=== SCORING: Report Generation ===');

(function() {
  var result = createScoreResult('scenario_1', {
    procedure: 0.92, safety: 0.88, response: 0.75, equipment: 0.95, completeness: 1.0
  }, {}, { date: '26.04.1986', shift: '1', operator: '\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0411\u0429\u0423' });
  assert(result.report.length > 100, 'report generated, length=' + result.report.length);
  assert(result.ratings.procedure.rating === '\u0445\u043E\u0440\u043E\u0448\u043E', 'procedure rating = \u0445\u043E\u0440\u043E\u0448\u043E');
  console.log('  Report sample (first 3 lines):');
  var rlines = result.report.split('\n');
  for (var i = 0; i < Math.min(3, rlines.length); i++) console.log('    ' + rlines[i]);
})();

console.log('\n=== SAVE: Journal CRUD ===');

(function() {
  var j = createNewJournal();
  assert(j.version === 1, 'version = 1');
  assert(j.entries.length === 0, 'empty entries');
  assert(j.operator.callsign === '\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0411\u0429\u0423', 'default callsign');
  assert(j.operator.shiftCount === 0, 'shiftCount = 0');
})();

(function() {
  var j = createNewJournal();
  recordShiftEnd(j, 'scenario_1', { dimensions: { procedure: 0.9, safety: 0.8, response: 0.7, equipment: 0.6, completeness: 0.5 }, outcome: 'normal' }, 300000);
  assert(j.entries.length === 1, 'entry added');
  assert(j.operator.shiftCount === 1, 'shiftCount incremented');
  assert(j.statistics.totalShifts === 1, 'stats updated');
  assert(j.statistics.scenariosCompleted.scenario_1 === 1, 'scenario_1 count = 1');
})();

(function() {
  var j = createNewJournal();
  recordShiftEnd(j, 'scenario_3', { dimensions: { procedure: 0, safety: 0, response: 0, equipment: 0, completeness: 0 }, outcome: 'accident' }, 120000);
  assert(j.statistics.accidents === 1, 'accident counted');
  assert(j.statistics.accidentsPrevented === 0, 'no prevented');
})();

console.log('\n=== SAVE: Validation ===');

(function() {
  var j = createNewJournal();
  var r = validateJournal(j);
  assert(r.valid === true, 'valid journal');
})();

(function() {
  var r = validateJournal({});
  assert(r.valid === false, 'invalid journal detected');
  assert(r.errors.length > 0, 'errors reported');
})();

console.log('\n=== SAVE: Export ===');

(function() {
  var j = createNewJournal();
  var data = exportJournalData(j);
  var parsed = JSON.parse(data);
  assert(parsed.version === 1, 'export/import roundtrip');
})();

console.log('\n=== SCENARIO: Engine ===');

(function() {
  var ids = getAllScenarioIds();
  assert(ids.length === 3, '3 scenarios registered: ' + ids.join(', '));
})();

(function() {
  var cfg = getScenarioConfig('scenario_1');
  assert(cfg !== null, 'scenario_1 config exists');
  assert(cfg.name_zh === '\u964D\u529F\u7387', 'name_zh = \u964D\u529F\u7387');
})();

(function() {
  var engine = createScenarioEngine('scenario_2');
  assert(engine !== null, 'engine created');
  assert(engine instanceof ScenarioEngine, 'correct type');
})();

console.log('\n=== SCENARIO: Time Trigger ===');

(function() {
  var engine = new ScenarioEngine([
    { id: 'e1', priority: 0, oneShot: true, trigger: { type: 'time', simTime: 5 }, actions: [{ type: 'dialogue', speaker: 'test', lines: [{ speaker: 'test', text_zh: 'hello', delay: 0, typing: false }] }] },
  ]);
  var fired = false;
  engine.on('event', function(id) { if (id === 'e1') fired = true; });
  engine.update({}, 3);
  assert(!fired, 'not fired at t=3');
  engine.update({}, 7);
  assert(fired, 'fired at t=7');
})();

console.log('\n=== SCENARIO: Compound AND Trigger ===');

(function() {
  var engine = new ScenarioEngine([
    { id: 'e1', priority: 0, oneShot: true, trigger: { type: 'compound', op: 'AND', conditions: [
      { type: 'time', simTime: 10 },
      { type: 'state', check: function(s) { return s.power > 2000; } },
    ]}, actions: [] },
  ]);
  engine.update({ power: 1500 }, 15);
  assert(!engine.isFired('e1'), 'AND not fired when state wrong');
  engine.update({ power: 2500 }, 20);
  assert(engine.isFired('e1'), 'AND fired when both conditions met');
})();

console.log('\n=== SCENARIO: Compound OR Trigger ===');

(function() {
  var engine = new ScenarioEngine([
    { id: 'e1', priority: 0, oneShot: true, trigger: { type: 'compound', op: 'OR', conditions: [
      { type: 'time', simTime: 100 },
      { type: 'player_action', action: 'panic' },
    ]}, actions: [] },
  ]);
  engine.notifyPlayerAction('panic');
  engine.update({}, 5);
  assert(engine.isFired('e1'), 'OR fired via player_action');
})();

console.log('\n=== SCENARIO: event_fired Trigger ===');

(function() {
  var engine = new ScenarioEngine([
    { id: 'first', priority: 0, oneShot: true, trigger: { type: 'time', simTime: 5 }, actions: [] },
    { id: 'second', priority: 0, oneShot: true, trigger: { type: 'event_fired', eventId: 'first', delay: 2 }, actions: [] },
  ]);
  engine.update({}, 5); // fires 'first'
  engine.update({}, 6);
  assert(!engine.isFired('second'), 'delay not met at t=6');
  engine.update({}, 8);
  assert(engine.isFired('second'), 'event_fired with delay works');
})();

console.log('\n=== SCENARIO: Tags ===');

(function() {
  var engine = new ScenarioEngine([
    { id: 'e1', priority: 0, oneShot: true, trigger: { type: 'time', simTime: 1 }, tags: ['important', 'narrative'], actions: [] },
  ]);
  engine.update({}, 2);
  assert(engine.hasTag('important'), 'tag important set');
  assert(engine.hasTag('narrative'), 'tag narrative set');
  assert(!engine.hasTag('unrelated'), 'tag unrelated not set');
})();

console.log('\n=== SCENARIO: State Manager ===');

(function() {
  var sm = new ScenarioStateManager();
  sm.startScenario('scenario_1', 0);
  sm.completeScenario('scenario_1', { finalPower: 1600, obr: 30 });
  assert(sm.getCompletedScenarios().length === 1, '1 scenario completed');
  var inherited = sm.getInheritedState('scenario_1');
  assert(inherited.finalPower === 1600, 'inherited state preserved');
})();

console.log('\n=== SCENARIO: Action Helpers ===');

(function() {
  var a = createDialogueAction('test', []);
  assert(a.type === 'dialogue', 'dialogue action');

  var b = createAlarmAction('P1', 'danger');
  assert(b.type === 'alarm', 'alarm action');
  assert(b.alarmId === 'P1', 'alarmId P1');

  var c = createEndAction('success', 'done');
  assert(c.type === 'end', 'end action');
  assert(c.result === 'success', 'result success');
})();

console.log('\n==========');
console.log('Passed: ' + PASS + ', Failed: ' + FAIL + '\n');
process.exit(FAIL > 0 ? 1 : 0);
