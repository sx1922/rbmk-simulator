import {
  createReactor,
  stepReactor,
  runReactor,
  getReactorSnapshot,
  setRodTarget,
  setControlMode,
  manualAZ5,
  bypassProtection,
  restoreProtection,
  resetReactorAZ5,
  setCoolantFlow,
  resetReactor,
  getReactorPeriod,
  isSteadyState,
  REACTOR_CONFIG,
} from '../lib/reactor.js';

import {
  integralRodWorth,
  differentialRodWorth,
  tipEffect,
  simulateAZ5Insertion,
} from '../lib/systems/control.js';

import {
  totalReactivity,
  getReactivityBreakdown,
} from '../lib/physics/reactivity.js';

import {
  calcOPR,
} from '../lib/physics/xenon.js';

var totalTests = 0;
var passedTests = 0;
var failedTests = 0;
var failures = [];

function assert(condition, message) {
  totalTests++;
  if (condition) { passedTests++; }
  else { failedTests++; failures.push(message); console.log('  \u2717 FAIL: ' + message); }
}

function assertClose(actual, expected, tolerance, message) {
  var diff = Math.abs(actual - expected);
  var relDiff = expected !== 0 ? diff / Math.abs(expected) : diff;
  var pass = diff <= tolerance || relDiff <= tolerance;
  totalTests++;
  if (pass) { passedTests++; }
  else { failedTests++; var msg = message + ' \u2014 expected ' + expected + ', got ' + actual + ' (diff=' + diff.toExponential(3) + ', tol=' + tolerance + ')'; failures.push(msg); console.log('  \u2717 FAIL: ' + msg); }
}

function assertRange(actual, min, max, message) {
  totalTests++;
  if (actual >= min && actual <= max) { passedTests++; }
  else { failedTests++; var msg = message + ' \u2014 expected [' + min + ', ' + max + '], got ' + actual; failures.push(msg); console.log('  \u2717 FAIL: ' + msg); }
}

function assertNoNaN(obj, path, message) {
  totalTests++;
  var val = path.split('.').reduce(function(o,k){return (o&&o[k]!==undefined)?o[k]:undefined;}, obj);
  if (val === undefined || Number.isNaN(val)) { failedTests++; console.log('  \u2717 FAIL: ' + message + ' \u2014 ' + path + ' is ' + val); }
  else { passedTests++; }
}

function section(name) { console.log('\n' + '='.repeat(60) + '\n  ' + name + '\n' + '='.repeat(60)); }
function subsection(name) { console.log('  --- ' + name + ' ---'); }

function testT1_SteadyState() {
  section('T1: \u989d\u5b9a\u529f\u7387\u7a33\u6001');
  var reactor = createReactor({}, 'FULL_POWER');
  subsection('\u521d\u59cb\u72b6\u6001\u68c0\u67e5');
  assertClose(reactor.neutron.n, 1.0, 0.01, 'T1: \u521d\u59cb\u529f\u7387\u2248 100%');
  assertRange(reactor.control.position, 0.4, 0.7, 'T1: \u521d\u59cb\u68d2\u4f4d\u5408\u7406');
  assertRange(reactor.thermal.voidFraction, 0.2, 0.5, 'T1: \u521d\u59cb\u7a7a\u6ce1\u4efd\u989d\u5408\u7406');
  subsection('\u8fd0\u884c 10s \u65e0\u64cd\u4f5c');
  runReactor(reactor, 10.0, 0.1, {});
  assertClose(reactor.neutron.n, 1.0, 0.005, 'T1: 10s \u540e\u529f\u7387\u4ecd\u2248 100%');
  assertRange(reactor.rhoTotal, -5e-5, 5e-5, 'T1: \u603b\u53cd\u5e94\u6027\u2248 0 (\u00b15 pcm)');
  assert(Math.abs(reactor.period) > 100, 'T1: \u5468\u671f > 100s (\u63a5\u8fd1\u7a33\u6001)');
  subsection('\u8fd0\u884c 100s \u65e0\u64cd\u4f5c');
  runReactor(reactor, 100.0, 0.1, {});
  assertClose(reactor.neutron.n, 1.0, 0.01, 'T1: 100s \u540e\u529f\u7387\u6f02\u79fb < 1%');
  assert(reactor.eventLog.filter(function(e){return e.type==='alarm';}).length===0, 'T1: \u65e0\u62a5\u8b66\u4e8b\u4ef6');
  subsection('\u7a33\u6001\u5224\u636e');
  var rhoAbs = Math.abs(reactor.rhoTotal);
  assert(rhoAbs < 1e-4, 'T1: |\u03c1| = ' + rhoAbs.toExponential(2) + ' < 1e-4');
}

function testT2_RodWithdrawal() {
  section('T2: \u624b\u52a8\u63d0\u68d2');
  var reactor = createReactor({}, 'FULL_POWER');
  var initialPower = reactor.neutron.n;
  var initialRodPos = reactor.control.position;
  var initialVoid = reactor.thermal.voidFraction;
  subsection('\u63d0\u68d2: ' + initialRodPos.toFixed(3) + ' \u2192 0.50');
  setRodTarget(reactor, 0.50);
  runReactor(reactor, 30.0, 0.1, { rodTarget: 0.50 });
  assertClose(reactor.control.position, 0.50, 0.01, 'T2: \u68d2\u4f4d\u5230\u8fbe\u76ee\u6807');
  assert(reactor.neutron.n > initialPower, 'T2: \u529f\u7387\u4e0a\u5347 (' + initialPower.toFixed(4) + ' \u2192 ' + reactor.neutron.n.toFixed(4) + ')');
  subsection('\u65b0\u5e73\u8861\u5efa\u7acb');
  runReactor(reactor, 60.0, 0.1, { rodTarget: 0.50 });
  var finalPower = reactor.neutron.n;
  assertRange(finalPower, 1.0, 1.5, 'T2: \u65b0\u5e73\u8861\u529f\u7387\u5728 100%~150%');
  assert(Math.abs(reactor.rhoTotal) < 5e-4, 'T2: \u65b0\u5e73\u8861 \u03c1 \u2248 0 (\u7a7a\u6ce1\u8865\u507f)');
  subsection('\u7269\u7406\u9a8c\u8bc1: \u7a7a\u6ce1\u8d1f\u53cd\u9988');
  var voidIncrease = reactor.thermal.voidFraction - initialVoid;
  assert(voidIncrease > 0, 'T2: \u7a7a\u6ce1\u4efd\u989d\u589e\u52a0 (\u529f\u7387\u4e0a\u5347 \u2192 \u66f4\u591a\u6cb8\u817e)');
  console.log('    \u7a7a\u6ce1\u53d8\u5316: +' + (voidIncrease*100).toFixed(2) + '%');
  console.log('    \u7a7a\u6ce1\u521d\u59cb\u503c: ' + (initialVoid*100).toFixed(2) + '%');
  console.log('    \u529f\u7387\u53d8\u5316: ' + initialPower.toFixed(4) + ' \u2192 ' + finalPower.toFixed(4));
}

function testT3_AZ5Scram() {
  section('T3: AZ-5 \u505c\u5806');
  var reactor = createReactor({}, 'FULL_POWER');
  var initialRodPos = reactor.control.position;
  subsection('\u89e6\u53d1 AZ-5');
  manualAZ5(reactor);
  assert(reactor.az5.active, 'T3: AZ-5 \u5df2\u6fc0\u6d3b');
  subsection('\u8fd0\u884c 25s');
  runReactor(reactor, 25.0, 0.1, {});
  var expectedFullInsertTime = (1.0 - initialRodPos) * 7.0 / 0.4;
  console.log('    \u9884\u671f\u5168\u63d2\u65f6\u95f4: ' + expectedFullInsertTime.toFixed(1) + 's');
  console.log('    \u5b9e\u9645\u68d2\u4f4d: ' + reactor.control.position.toFixed(4));
  assertClose(reactor.control.position, 1.0, 0.01, 'T3: \u68d2\u5df2\u5168\u63d2');
  assert(reactor.neutron.n < 0.01, 'T3: \u529f\u7387\u5df2\u964d\u5230 < 1% (\u5b9e\u9645: ' + (reactor.neutron.n*100).toFixed(4) + '%)');
  subsection('\u6df1\u5ea6\u6b21\u4e34\u754c');
  runReactor(reactor, 10.0, 0.1, {});
  assert(reactor.neutron.n < 1e-4, 'T3: \u6df1\u5ea6\u505c\u5806 (n = ' + reactor.neutron.n.toExponential(2) + ')');
  subsection('\u4e8b\u4ef6\u65e5\u5fd7');
  var az5Events = reactor.eventLog.filter(function(e){return e.type==='az5';});
  assert(az5Events.length >= 1, 'T3: AZ-5 \u4e8b\u4ef6\u5df2\u8bb0\u5f55');
}

function testT4_ProtectionTrip() {
  section('T4: \u4fdd\u62a4\u89e6\u53d1');
  var reactor = createReactor({}, 'FULL_POWER');
  subsection('\u5927\u5e45\u63d0\u68d2\u5f15\u5165\u6b63\u53cd\u5e94\u6027');
  setRodTarget(reactor, 0.10);
  var protectionTriggered = false;
  for (var i = 0; i < 1200; i++) {
    stepReactor(reactor, 0.1, { rodTarget: 0.10 });
    if (reactor.protection.az5Demand) { protectionTriggered = true; break; }
  }
  assert(protectionTriggered, 'T4: \u4fdd\u62a4\u7cfb\u7edf\u89e6\u53d1');
  assert(reactor.protection.az5Cause.indexOf('P1') >= 0, 'T4: \u89e6\u53d1\u539f\u56e0\u662f P1 (\u529f\u7387\u8d85\u9650), \u5b9e\u9645: ' + reactor.protection.az5Cause);
  subsection('AZ-5 \u81ea\u52a8\u6267\u884c');
  assert(reactor.az5.active, 'T4: AZ-5 \u5df2\u81ea\u52a8\u6fc0\u6d3b');
  runReactor(reactor, 30.0, 0.1, {});
  assert(reactor.neutron.n < 0.01, 'T4: \u529f\u7387\u5df2\u964d\u4f4e');
  subsection('\u9501\u5b58\u4e0e\u590d\u4f4d');
  assert(reactor.protection.az5DemandLatched, 'T4: AZ-5 \u9501\u5b58');
  runReactor(reactor, 20.0, 0.1, {});
  var resetResult = resetReactorAZ5(reactor);
  if (reactor.neutron.n < 1.2) { assert(resetResult.success, 'T4: \u590d\u4f4d\u6210\u529f'); }
  else { assert(!resetResult.success, 'T4: \u529f\u7387\u4ecd\u9ad8, \u590d\u4f4d\u88ab\u62d2\u7edd'); }
}

function testT5_XenonTransient() {
  section('T5: \u6c27\u6bd2\u77ac\u6001');
  var reactor = createReactor({}, 'FULL_POWER');
  subsection('\u786e\u8ba4\u521d\u59cb\u6c27\u5e73\u8861');
  assertClose(reactor.xenon.XeRelative, 1.0, 0.05, 'T5: \u521d\u59cb Xe \u2248 \u5e73\u8861');
  subsection('\u964d\u529f\u7387 (\u63d0\u68d2)');
  setRodTarget(reactor, 0.75);
  runReactor(reactor, 60.0, 0.1, { rodTarget: 0.75 });
  var powerAfterDrop = reactor.neutron.n;
  assert(powerAfterDrop < 0.9, 'T5: \u529f\u7387\u5df2\u964d\u4f4e (' + (powerAfterDrop*100).toFixed(1) + '%)');
  subsection('\u6c27\u6bd2\u79ef\u7d2f (\u8fd0\u884c 5h)');
  var xeBefore = reactor.xenon.XeRelative;
  runReactor(reactor, 5 * 3600, 1.0, { rodTarget: 0.75 });
  var xeAfter5h = reactor.xenon.XeRelative;
  console.log('    Xe: ' + xeBefore.toFixed(3) + ' \u2192 ' + xeAfter5h.toFixed(3) + ' (5h)');
  assert(xeAfter5h > xeBefore, 'T5: \u964d\u529f\u7387\u540e\u6c27\u6bd2\u589e\u52a0');
  subsection('\u7ee7\u7eed\u8fd0\u884c\u5230 15h (\u5cf0\u503c\u533a\u95f4)');
  runReactor(reactor, 10 * 3600, 1.0, { rodTarget: 0.75 });
  var xeAfter15h = reactor.xenon.XeRelative;
  console.log('    Xe: ' + xeAfter5h.toFixed(3) + ' \u2192 ' + xeAfter15h.toFixed(3) + ' (15h)');
  assert(xeAfter15h > xeBefore, 'T5: 15h \u540e\u6c27\u6bd2\u4ecd\u9ad8\u4e8e\u521d\u59cb\u503c');
  subsection('\u7ee7\u7eed\u8fd0\u884c\u5230 30h (\u5e94\u660e\u786e\u4e0b\u964d)');
  runReactor(reactor, 15 * 3600, 1.0, { rodTarget: 0.75 });
  var xeAfter30h = reactor.xenon.XeRelative;
  console.log('    Xe: ' + xeAfter15h.toFixed(3) + ' \u2192 ' + xeAfter30h.toFixed(3) + ' (30h)');
  assert(xeAfter30h < xeAfter15h, 'T5: 30h \u540e\u6c27\u6bd2\u660e\u786e\u4e0b\u964d (\u8d8b\u5411\u65b0\u5e73\u8861)');
  subsection('OPR \u53d8\u5316');
  var reactorRef = createReactor({}, 'FULL_POWER');
  var oprInitial = calcOPR(reactorRef.xenon, reactorRef.control.position, reactor.config.TOTAL_ROD_WORTH);
  var opr = calcOPR(reactor.xenon, reactor.control.position, reactor.config.TOTAL_ROD_WORTH);
  console.log('    \u521d\u59cb OPR = ' + oprInitial.oprRods.toFixed(1) + ' \u6839');
  console.log('    \u5f53\u524d OPR = ' + opr.oprRods.toFixed(1) + ' \u6839');
  assert(opr.oprRods >= 0, 'T5: OPR >= 0 (\u9ad8\u6c27\u6bd2\u4e0b\u53ef\u4e3a 0)');
  assert(opr.oprRods < oprInitial.oprRods, 'T5: \u6c27\u6bd2\u79ef\u7d2f\u5bfc\u81f4 OPR \u964d\u4f4e');
}

function testT6_Chernobyl() {
  section('T6: \u5207\u5c14\u8bfa\u8d1d\u5229\u573a\u666f (\u6b63\u505c\u5806\u6548\u5e94)');
  var reactor = createReactor({}, 'CHERNOBYL_PRE');
  subsection('\u521d\u59cb\u72b6\u6001\u786e\u8ba4');
  assertRange(reactor.neutron.n, 0.05, 0.08, 'T6: \u521d\u59cb\u529f\u7387\u2248 6%');
  assertRange(reactor.control.position, 0.02, 0.06, 'T6: \u68d2\u51e0\u4e4e\u5168\u63d0');
  var opr = calcOPR(reactor.xenon, reactor.control.position, reactor.config.TOTAL_ROD_WORTH);
  console.log('    OPR = ' + opr.oprRods.toFixed(1) + ' \u6839');
  console.log('    (\u68d2\u51e0\u4e4e\u5168\u63d0, \u5269\u4f59\u68d2\u4ef7\u503c\u6781\u5927, \u65e0\u6c27\u6bd2, OPR \u5145\u8db3)');
  assert(opr.oprRods > 0, 'T6: OPR \u4e3a\u6b63\u503c (\u68d2\u5168\u63d0\u65f6\u5269\u4f59\u4ef7\u503c\u6700\u5927)');
  subsection('\u5207\u9664\u4fdd\u62a4 (\u6a21\u62df\u4e8b\u6545\u524d\u64cd\u4f5c)');
  var r1 = bypassProtection(reactor, 'P3', '\u6c7d\u8f6e\u673a\u60f0\u8f6c\u6d4b\u8bd5');
  var r2 = bypassProtection(reactor, 'P4', '\u6c7d\u8f6e\u673a\u60f0\u8f6c\u6d4b\u8bd5');
  assert(r1.success, 'T6: P3 \u65c1\u8def\u6210\u529f');
  assert(r2.success, 'T6: P4 \u65c1\u8def\u6210\u529f');
  subsection('\u6309\u4e0b AZ-5');
  var powerBeforeAZ5 = reactor.neutron.n;
  manualAZ5(reactor);
  var powerHistory = [];
  for (var si = 0; si < 50; si++) {
    stepReactor(reactor, 0.1, {});
    powerHistory.push({ t: reactor.time, n: reactor.neutron.n, rodPos: reactor.control.position, rho: reactor.rhoTotal, tip: reactor.control.tipEffect });
  }
  subsection('\u9a8c\u8bc1\u6b63\u505c\u5806\u6548\u5e94');
  var maxPower = powerBeforeAZ5;
  var maxPowerTime = 0;
  for (var pi = 0; pi < powerHistory.length; pi++) {
    var p = powerHistory[pi];
    if (p.n > maxPower) { maxPower = p.n; maxPowerTime = p.t; }
  }
  console.log('    AZ-5 \u524d\u529f\u7387: ' + (powerBeforeAZ5*100).toFixed(2) + '%');
  console.log('    \u529f\u7387\u5cf0\u503c: ' + (maxPower*100).toFixed(2) + '% @ t=' + maxPowerTime.toFixed(1) + 's');
  console.log('    \u529f\u7387\u589e\u5e45: ' + ((maxPower/powerBeforeAZ5 - 1)*100).toFixed(1) + '%');
  assert(maxPower > powerBeforeAZ5, 'T6: AZ-5 \u540e\u529f\u7387\u5148\u4e0a\u5347 (\u6b63\u505c\u5806\u6548\u5e94!)');
  var positiveRhoPhase = powerHistory.filter(function(p){return p.rho > 0;});
  console.log('    \u6b63\u53cd\u5e94\u6027\u6301\u7eed: ' + (positiveRhoPhase.length * 0.1) + 's');
  if (positiveRhoPhase.length > 0) { assert(positiveRhoPhase.length >= 2, 'T6: \u6b63\u53cd\u5e94\u6027\u6301\u7eed \u2265 0.2s'); }
  var earlyTip = powerHistory.filter(function(p){return p.t < 2.0;});
  var hasPositiveTip = earlyTip.some(function(p){return p.tip > 1e-5;});
  assert(hasPositiveTip, 'T6: \u524d 2s \u5b58\u5728\u68d2\u5c16\u6b63\u53cd\u5e94\u6027');
  subsection('\u540e\u7eed: \u529f\u7387\u5e94\u6700\u7ec8\u4e0b\u964d');
  runReactor(reactor, 20.0, 0.1, {});
  var powerAfter25s = reactor.neutron.n;
  console.log('    25s \u540e\u529f\u7387: ' + (powerAfter25s*100).toFixed(4) + '%');
  assert(reactor.control.position > 0.95, 'T6: 25s \u540e\u68d2\u63a5\u8fd1\u5168\u63d2');
}

function testT7_AutoRegulation() {
  section('T7: \u81ea\u52a8\u8c03\u8282');
  var reactor = createReactor({}, 'FULL_POWER');
  subsection('\u5207\u6362\u5230\u81ea\u52a8\u6a21\u5f0f');
  setControlMode(reactor, 'auto');
  assert(reactor.control.mode === 'auto', 'T7: \u6a21\u5f0f\u5df2\u5207\u6362');
  subsection('\u65bd\u52a0\u6270\u52a8: \u964d\u4f4e\u51b7\u5374\u5242\u6d41\u91cf');
  setCoolantFlow(reactor, 0.8);
  var powerHistory = [];
  for (var hi = 0; hi < 120; hi++) {
    stepReactor(reactor, 1.0, { controlMode: 'auto', powerSetpoint: 1.0 });
    powerHistory.push(reactor.neutron.n);
  }
  var powerAfterDisturbance = powerHistory[powerHistory.length - 1];
  console.log('    \u6270\u52a8\u540e\u529f\u7387: ' + (powerAfterDisturbance*100).toFixed(2) + '%');
  assertRange(powerAfterDisturbance, 0.90, 1.10, 'T7: \u529f\u7387\u56de\u5230\u8bbe\u5b9a\u503c \u00b110%');
  subsection('\u9a8c\u8bc1\u68d2\u4f4d\u8c03\u6574');
  var rodMoved = Math.abs(reactor.control.position - 0.55) > 0.01;
  assert(rodMoved, 'T7: \u63a7\u5236\u68d2\u6709\u8c03\u6574\u52a8\u4f5c');
}

function testT8_LongTermStability() {
  section('T8: \u957f\u65f6\u95f4\u8fd0\u884c\u7a33\u5b9a\u6027 (24h)');
  var reactor = createReactor({}, 'FULL_POWER');
  var initialPower = reactor.neutron.n;
  subsection('\u8fd0\u884c 24h (86400s)');
  var startTime = performance.now();
  runReactor(reactor, 86400, 1.0, {});
  var elapsed = performance.now() - startTime;
  console.log('    \u8017\u65f6: ' + (elapsed/1000).toFixed(2) + 's');
  subsection('\u68c0\u67e5\u7a33\u5b9a\u6027');
  var powerDrift = Math.abs(reactor.neutron.n - initialPower) / initialPower;
  console.log('    \u529f\u7387\u6f02\u79fb: ' + (powerDrift*100).toFixed(4) + '%');
  assert(powerDrift < 0.01, 'T8: 24h \u529f\u7387\u6f02\u79fb < 1%');
  assert(!Number.isNaN(reactor.neutron.n), 'T8: \u529f\u7387\u65e0 NaN');
  assert(!Number.isNaN(reactor.thermal.fuelTempAvg), 'T8: \u6e29\u5ea6\u65e0 NaN');
  assert(!Number.isNaN(reactor.xenon.Xe), 'T8: \u6c27\u6d53\u5ea6\u65e0 NaN');
  assert(!Number.isNaN(reactor.rhoTotal), 'T8: \u53cd\u5e94\u6027\u65e0 NaN');
  subsection('\u6c27\u6bd2\u5e73\u8861');
  assertClose(reactor.xenon.XeRelative, 1.0, 0.05, 'T8: 24h \u540e\u6c27\u6bd2\u4ecd\u5e73\u8861');
  subsection('\u4e8b\u4ef6\u65e5\u5fd7\u9650\u5236');
  assert(reactor.eventLog.length <= 1000, 'T8: \u65e5\u5fd7\u957f\u5ea6 ' + reactor.eventLog.length + ' \u2264 1000');
}

function testT9_Performance() {
  section('T9: \u6027\u80fd');
  subsection('1s \u4eff\u771f (dt=0.001, 1000 \u6b65)');
  var reactor = createReactor({}, 'FULL_POWER');
  var start = performance.now();
  runReactor(reactor, 1.0, 0.001, {});
  var elapsed = performance.now() - start;
  console.log('    \u8017\u65f6: ' + elapsed.toFixed(1) + 'ms');
  assert(elapsed < 500, 'T9: 1s/1ms \u4eff\u771f < 500ms (\u5b9e\u9645 ' + elapsed.toFixed(0) + 'ms)');
  subsection('60s \u4eff\u771f (dt=0.1, 600 \u6b65)');
  reactor = createReactor({}, 'FULL_POWER');
  start = performance.now();
  runReactor(reactor, 60.0, 0.1, {});
  elapsed = performance.now() - start;
  console.log('    \u8017\u65f6: ' + elapsed.toFixed(1) + 'ms');
  assert(elapsed < 2000, 'T9: 60s/0.1s \u4eff\u771f < 2s (\u5b9e\u9645 ' + elapsed.toFixed(0) + 'ms)');
  subsection('1h \u4eff\u771f (dt=0.1, 36000 \u6b65)');
  reactor = createReactor({}, 'FULL_POWER');
  start = performance.now();
  runReactor(reactor, 3600.0, 0.1, {});
  elapsed = performance.now() - start;
  console.log('    \u8017\u65f6: ' + (elapsed/1000).toFixed(2) + 's');
  assert(elapsed < 30000, 'T9: 1h/0.1s \u4eff\u771f < 30s (\u5b9e\u9645 ' + (elapsed/1000).toFixed(1) + 's)');
}

function testT10_Snapshot() {
  section('T10: \u5feb\u7167\u5b8c\u6574\u6027');
  var reactor = createReactor({}, 'FULL_POWER');
  runReactor(reactor, 5.0, 0.1, {});
  var snap = getReactorSnapshot(reactor);
  subsection('\u9876\u5c42\u5b57\u6bb5');
  var requiredFields = ['time','timeFormatted','stepCount','powerMWth','powerMWe','powerFrac','powerPercent','rhoTotal','rhoTotalPCM','period','periodFormatted','reactivityBreakdown','neutron','thermal','xenon','control','az5','protection','safety','opr','recentEvents','running'];
  for (var fi = 0; fi < requiredFields.length; fi++) {
    var field = requiredFields[fi];
    assert(snap[field] !== undefined, 'T10: \u5b57\u6bb5 \'' + field + '\' \u5b58\u5728');
  }
  subsection('\u6570\u503c\u6709\u6548\u6027');
  assertNoNaN(snap, 'powerMWth', 'T10: powerMWth');
  assertNoNaN(snap, 'powerMWe', 'T10: powerMWe');
  assertNoNaN(snap, 'rhoTotal', 'T10: rhoTotal');
  assertNoNaN(snap, 'period', 'T10: period');
  assertNoNaN(snap, 'neutron.n', 'T10: neutron.n');
  assertNoNaN(snap, 'thermal.voidFraction', 'T10: thermal.voidFraction');
  assertNoNaN(snap, 'xenon.XeRelative', 'T10: xenon.XeRelative');
  assertNoNaN(snap, 'control.position', 'T10: control.position');
  subsection('\u5b89\u5168\u8bc4\u4f30');
  assert(snap.safety.protection !== undefined, 'T10: safety.protection \u5b58\u5728');
  assert(snap.safety.xenon !== undefined, 'T10: safety.xenon \u5b58\u5728');
  assert(snap.safety.control !== undefined, 'T10: safety.control \u5b58\u5728');
  assertRange(snap.safety.protection.score, 0, 100, 'T10: \u5b89\u5168\u8bc4\u5206\u8303\u56f4');
  subsection('JSON \u5e8f\u5217\u5316');
  var jsonOk = true;
  try { JSON.stringify(snap); } catch (e) { jsonOk = false; }
  assert(jsonOk, 'T10: \u5feb\u7167\u53ef JSON \u5e8f\u5217\u5316');
  subsection('OPR');
  assert(snap.opr.oprRods !== undefined, 'T10: OPR \u5b58\u5728');
  assertRange(snap.opr.oprRods, 0, 211, 'T10: OPR \u8303\u56f4\u5408\u7406');
}

function testUnit_RodWorth() {
  section('\u9644\u52a0: \u68d2\u4ef7\u503c\u66f2\u7ebf\u9a8c\u8bc1');
  subsection('\u79ef\u5206\u68d2\u4ef7\u503c');
  assertClose(integralRodWorth(0.0), 0.0, 1e-10, '\u03c1(0) = 0');
  assertClose(integralRodWorth(0.5), -0.05, 1e-6, '\u03c1(0.5) = -0.05');
  assertClose(integralRodWorth(1.0), -0.10, 1e-6, '\u03c1(1.0) = -0.10');
  subsection('\u5355\u8c03\u6027');
  var prev = 0;
  var monotonic = true;
  for (var x = 0.01; x <= 1.0; x += 0.01) {
    var val = integralRodWorth(x);
    if (val > prev + 1e-10) { monotonic = false; break; }
    prev = val;
  }
  assert(monotonic, '\u79ef\u5206\u68d2\u4ef7\u503c\u5355\u8c03\u9012\u51cf');
  subsection('\u68d2\u5c16\u6548\u5e94');
  var tip0 = tipEffect(0.0);
  var tip05 = tipEffect(0.5);
  assert(tip0 > tip05, 'T_tip: \u5168\u63d0\u65f6\u68d2\u5c16\u6548\u5e94\u6700\u5927');
  assert(tip0 > 0, 'T_tip: \u68d2\u5c16\u6548\u5e94\u4e3a\u6b63');
  assert(tip05 > 0, 'T_tip: \u534a\u63d2\u65f6\u68d2\u5c16\u6548\u5e94\u4ecd\u4e3a\u6b63');
  subsection('\u6b63\u505c\u5806\u6548\u5e94\u9a8c\u8bc1');
  var x_test = 0.02;
  var rodWorth = integralRodWorth(x_test);
  var tip = tipEffect(x_test);
  var total = rodWorth + tip;
  console.log('    x=' + x_test + ': rod=' + rodWorth.toExponential(3) + ', tip=' + tip.toExponential(3) + ', total=' + total.toExponential(3));
  assert(total > 0, 'T_tip: x=0.02 \u65f6\u603b\u53cd\u5e94\u6027\u4e3a\u6b63 (\u6b63\u505c\u5806\u6548\u5e94)');
}

function testUnit_AZ5Insertion() {
  section('\u9644\u52a0: AZ-5 \u63d2\u5165\u6a21\u62df');
  var results = simulateAZ5Insertion(0.0, 0.1);
  subsection('\u65f6\u95f4\u5e8f\u5217');
  assert(results.length > 0, 'AZ5 \u6a21\u62df\u6709\u8f93\u51fa');
  assert(results[0].t === 0, 'AZ5 \u4ece t=0 \u5f00\u59cb');
  var lastResult = results[results.length - 1];
  assertClose(lastResult.position, 1.0, 0.01, 'AZ5 \u7ed3\u675f\u4e8e\u5168\u63d2');
  subsection('\u6b63\u53cd\u5e94\u6027\u533a\u95f4');
  var positivePhase = results.filter(function(r){return r.rho_total > 0;});
  console.log('    \u6b63\u53cd\u5e94\u6027\u6301\u7eed: ' + (positivePhase.length * 0.1).toFixed(1) + 's');
  console.log('    \u6b63\u53cd\u5e94\u6027\u5cf0\u503c: ' + Math.max.apply(null, results.map(function(r){return r.rho_total;})).toExponential(3));
  assert(positivePhase.length > 0, 'AZ5: \u5b58\u5728\u6b63\u53cd\u5e94\u6027\u533a\u95f4');
  assert(positivePhase.length * 0.1 <= 5.0, 'AZ5: \u6b63\u53cd\u5e94\u6027\u6301\u7eed < 5s');
  subsection('\u6700\u7ec8\u72b6\u6001');
  assert(lastResult.rho_total < -0.04, 'AZ5: \u5168\u63d2\u540e\u5f3a\u8d1f\u53cd\u5e94\u6027');
}

function main() {
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551   RBMK-1000 \u53cd\u5e94\u5806\u4eff\u771f \u2014 \u95ed\u73af\u96c6\u6210\u6d4b\u8bd5                  \u2551');
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
  var startTime = performance.now();
  testUnit_RodWorth();
  testUnit_AZ5Insertion();
  testT1_SteadyState();
  testT2_RodWithdrawal();
  testT3_AZ5Scram();
  testT4_ProtectionTrip();
  testT5_XenonTransient();
  testT6_Chernobyl();
  testT7_AutoRegulation();
  testT8_LongTermStability();
  testT9_Performance();
  testT10_Snapshot();
  var totalTime = performance.now() - startTime;
  console.log('\n');
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551   \u6d4b\u8bd5\u7ed3\u679c\u6c47\u603b                                         \u2551');
  console.log('\u2551   \u603b\u8ba1: ' + totalTests + ' \u9879                                        \u2551');
  console.log('\u2551   \u901a\u8fc7: ' + passedTests + ' \u2713                                        \u2551');
  console.log('\u2551   \u5931\u8d25: ' + failedTests + ' \u2717                                        \u2551');
  console.log('\u2551   \u8017\u65f6: ' + (totalTime/1000).toFixed(2) + 's                                     \u2551');
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
  if (failures.length > 0) {
    console.log('\n\u5931\u8d25\u8be6\u60c5:');
    failures.forEach(function(f,i){console.log('  ' + (i+1) + '. ' + f);});
  }
  console.log('\n');
  if (typeof process !== 'undefined') { process.exit(failedTests > 0 ? 1 : 0); }
  return { totalTests: totalTests, passedTests: passedTests, failedTests: failedTests, failures: failures };
}

main();
