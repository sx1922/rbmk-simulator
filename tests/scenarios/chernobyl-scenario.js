import { createReactor, stepReactor, getReactorSnapshot, manualAZ5, bypassProtection } from '../core/reactor.js';

console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
console.log('\u2551   \u5207\u5c14\u8bfa\u8d1d\u5229\u4e8b\u6545\u590d\u73b0 \u2014 1986-04-26 01:23:40            \u2551');
console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n');

var reactor = createReactor({}, 'CHERNOBYL_PRE');
var snap = getReactorSnapshot(reactor);

console.log('=== \u4e8b\u6545\u524d\u72b6\u6001 ===');
console.log('  \u70ed\u529f\u7387:     ' + snap.powerMWth.toFixed(0) + ' MWth (' + snap.powerPercent + ')');
console.log('  \u68d2\u4f4d:       ' + snap.control.positionPercent);
console.log('  OPR:        ' + snap.opr.oprRods.toFixed(1) + ' \u6839 (\u89c4\u7a0b\u8981\u6c42 \u2265 15)');
console.log('  \u7a7a\u6ce1\u4efd\u989d:   ' + (snap.thermal.voidFraction * 100).toFixed(1) + '%');
console.log('  \u6c27\u6bd2:       ' + snap.xenon.XeRelative.toFixed(2) + ' \u00d7 \u5e73\u8861\n');

console.log('=== \u64cd\u4f5c\u5458\u5207\u9664\u4fdd\u62a4 ===');
var r1 = bypassProtection(reactor, 'P3', '\u6c7d\u8f6e\u673a\u60f0\u8f6c\u6d4b\u8bd5');
console.log('  ' + r1.message);
var r2 = bypassProtection(reactor, 'P4', '\u6c7d\u8f6e\u673a\u60f0\u8f6c\u6d4b\u8bd5');
console.log('  ' + r2.message + '\n');

console.log('=== 01:23:40 \u2014 \u6309\u4e0b AZ-5 ===\n');
manualAZ5(reactor);

console.log('  \u65f6\u95f4(s)  \u529f\u7387(%)  \u03c1(pcm)   \u68d2\u4f4d(%)  \u68d2\u5c16(pcm)');
console.log('  ' + '-'.repeat(60));

var history = [];
for (var i = 0; i < 100; i++) {
  stepReactor(reactor, 0.1, {});
  snap = getReactorSnapshot(reactor);
  history.push({ t: snap.time, power: snap.powerFrac * 100, rho: snap.rhoTotalPCM, rod: parseFloat(snap.control.positionPercent), tip: snap.control.tipEffect * 1e5 });
  if (i % 5 === 0) {
    var h = history[history.length - 1];
    console.log('' + h.t.toFixed(1).padStart(6) + '   ' + h.power.toFixed(2).padStart(8) + '   ' + h.rho.toFixed(1).padStart(8) + '   ' + h.rod.toFixed(1).padStart(8) + '   ' + h.tip.toFixed(2).padStart(12));
  }
}

console.log('\n=== \u5206\u6790 ===');
var maxPower = Math.max.apply(null, history.map(function(h){return h.power;}));
var maxPowerEntry = history.find(function(h){return h.power === maxPower;});
var initialPower = history[0] ? history[0].power : 6.3;
console.log('  AZ-5 \u524d\u529f\u7387: ' + initialPower.toFixed(2) + '%');
console.log('  \u529f\u7387\u5cf0\u503c: ' + maxPower.toFixed(2) + '% @ t=' + (maxPowerEntry ? maxPowerEntry.t.toFixed(1) : '?') + 's');
console.log('  \u529f\u7387\u589e\u5e45: ' + ((maxPower / initialPower - 1) * 100).toFixed(1) + '%');
var positivePhase = history.filter(function(h){return h.rho > 0;});
console.log('  \u6b63\u53cd\u5e94\u6027\u6301\u7eed: ' + (positivePhase.length * 0.1).toFixed(1) + 's');
var finalPower = history[history.length - 1].power;
console.log('  10s \u540e\u529f\u7387: ' + finalPower.toFixed(4) + '%');

console.log('\n=== \u7269\u7406\u89e3\u91ca ===');
console.log('  AZ-5 \u6309\u4e0b\u540e, 211 \u6839\u63a7\u5236\u68d2\u5f00\u59cb\u4ece\u5168\u63d0\u4f4d\u7f6e\u63d2\u5165\u3002');
console.log('  \u68d2\u5e95\u90e8\u662f\u77f3\u58a8 displacer\u3002');
console.log('  \u77f3\u58a8\u9996\u5148\u8fdb\u5165\u5806\u82af, \u66ff\u4ee3\u6c34 \u2192 \u6162\u5316\u6539\u5584 \u2192 \u6b63\u53cd\u5e94\u6027\u3002');
console.log('  \u7ea6 0.5-1s \u540e, B\u2084C \u5438\u6536\u4f53\u5230\u8fbe\u5806\u82af, \u624d\u5f15\u5165\u8d1f\u53cd\u5e94\u6027\u3002');
console.log('  \u5728\u4f4e\u529f\u7387 + \u7a7a\u6ce1\u5df2\u964d\u4f4e + \u68d2\u51e0\u4e4e\u5168\u63d0\u7684\u6761\u4ef6\u4e0b,');
console.log('  \u8fd9\u4e2a\u6b63\u53cd\u5e94\u6027\u5c16\u5cf0\u5f15\u53d1\u4e86\u529f\u7387 excursion\u3002');
console.log('\n  \u8fd9\u5c31\u662f\u5207\u5c14\u8bfa\u8d1d\u5229\u4e8b\u6545\u7684\u7269\u7406\u672c\u8d28\u3002');
