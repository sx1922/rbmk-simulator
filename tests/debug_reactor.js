// Debug script to find NaN source
var fs = require('fs');
var code = fs.readFileSync(__dirname + '/test_reactor.js', 'utf8');
// Evaluate up to T1 section
var split = code.indexOf('\n// ============================================================\n// T1:');
eval(code.substring(0, split));

var r = mkR({}, 'FULL_POWER');
console.log('Initial: n='+r.neutron.n+', pos='+r.control.position.toFixed(6)+', rho='+r.rhoTotal.toExponential(4));
console.log('Prot signals:');
Object.keys(r.protection.signals).forEach(function(k){
  var s = r.protection.signals[k];
  console.log('  '+k+': tripped='+s.tripped+', val='+s.value.toExponential(4)+', thr='+s.threshold.toExponential(4));
});

// Run multiple steps until NaN or time up
for (var st = 0; st < 100; st++) {
  stepR(r, 0.1, {});
  if (!isFinite(r.neutron.n) || isNaN(r.neutron.n)) {
    console.log('NaN at step '+st+', t='+r.time+', az5='+r.az5.active+', demand='+r.protection.az5Demand+', cause='+r.protection.az5Cause);
    Object.keys(r.protection.signals).forEach(function(k){
      var s = r.protection.signals[k];
      if (s.tripped) console.log('  TRIPPED: '+k);
    });
    r.eventLog.forEach(function(e){console.log('Event: t='+e.time+' type='+e.type+' msg='+e.msg);});
    break;
  }
  if (st === 0) console.log('t=0.1: n='+r.neutron.n+', pos='+r.control.position.toFixed(6)+', az5='+r.az5.active);
  if (st === 9) console.log('t=1.0: n='+r.neutron.n+', pos='+r.control.position.toFixed(6)+', az5='+r.az5.active);
  if (r.az5.active && st > 0) {
    console.log('AZ5 fired at step '+st+', t='+r.time+', n='+r.neutron.n+', pos='+r.control.position.toFixed(6)+', cause='+r.protection.az5Cause);
    Object.keys(r.protection.signals).forEach(function(k){
      var s = r.protection.signals[k];
      if (s.tripped) console.log('  TRIPPED: '+k+' val='+s.value.toExponential(4));
    });
    break;
  }
}
console.log('Final state after loop: n='+r.neutron.n+', isNaN='+isNaN(r.neutron.n)+', isFinite='+isFinite(r.neutron.n));
