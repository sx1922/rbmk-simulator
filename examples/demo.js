import { createReactor, stepReactor, getReactorSnapshot, setRodTarget, manualAZ5 } from '../core/reactor.js';

console.log('=== RBMK-1000 \u57fa\u7840\u6f14\u793a ===\n');

var reactor = createReactor({}, 'FULL_POWER');
console.log('\u521d\u59cb\u72b6\u6001: \u989d\u5b9a\u529f\u7387\u8fd0\u884c\n');

console.log('--- \u9636\u6bb5 1: \u7a33\u6001\u8fd0\u884c 10s ---');
for (var t = 0; t < 10; t += 1) {
  stepReactor(reactor, 1.0, {});
  var snap = getReactorSnapshot(reactor);
  console.log('  t=' + snap.timeFormatted + '  P=' + snap.powerPercent + '  \u03c1=' + snap.rhoTotalPCM.toFixed(1) + ' pcm  T=' + snap.periodFormatted);
}

console.log('\n--- \u9636\u6bb5 2: \u63d0\u68d2 (0.51 \u2192 0.50) ---');
setRodTarget(reactor, 0.50);
for (var t2 = 0; t2 < 30; t2 += 2) {
  stepReactor(reactor, 2.0, { rodTarget: 0.50 });
  var snap2 = getReactorSnapshot(reactor);
  console.log('  t=' + snap2.timeFormatted + '  P=' + snap2.powerPercent + '  \u68d2\u4f4d=' + snap2.control.positionPercent + '  \u03c1=' + snap2.rhoTotalPCM.toFixed(1) + ' pcm');
}

console.log('\n--- \u9636\u6bb5 3: AZ-5 \u7d27\u6025\u505c\u5806 ---');
manualAZ5(reactor);
for (var t3 = 0; t3 < 25; t3 += 1) {
  stepReactor(reactor, 1.0, {});
  var snap3 = getReactorSnapshot(reactor);
  console.log('  t=' + snap3.timeFormatted + '  P=' + snap3.powerPercent + '  \u68d2\u4f4d=' + snap3.control.positionPercent + '  \u03c1=' + snap3.rhoTotalPCM.toFixed(1) + ' pcm');
}

console.log('\n=== \u6f14\u793a\u7ed3\u675f ===');
