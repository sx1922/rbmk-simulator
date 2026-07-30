var fs = require('fs');
var code = fs.readFileSync(__dirname + '/test_reactor.js', 'utf8');
var split = code.indexOf('\n// ============================================================\n// T1:');
eval(code.substring(0, split));

var r = mkR({}, 'FULL_POWER');
console.log('Initial n='+r.neutron.n+', pos='+r.control.position.toFixed(6)+', rho='+r.rhoTotal.toExponential(4));

// Run the full 10s like T1 does, with logging
var dt = 0.1, nSteps = Math.ceil(10/dt);
for (var i = 0; i < nSteps; i++) {
  var tBefore = r.time;
  var nBefore = r.neutron.n;
  stepR(r, dt, {});
  var nAfter = r.neutron.n;
  if (isNaN(nAfter) || !isFinite(nAfter)) {
    console.log('NaN at step '+i+', t='+r.time+', n='+nBefore+' -> '+nAfter+', az5='+r.az5.active+', pos='+r.control.position.toFixed(6));
    Object.keys(r.protection.signals).forEach(function(k){
      var s = r.protection.signals[k];
      if (s.tripped) console.log('  TRIPPED: '+k);
    });
    r.eventLog.forEach(function(e){console.log('Event: t='+e.time+' type='+e.type+' msg='+e.msg);});
    break;
  }
  if (r.az5.active && !isFinite(nAfter)) {
    console.log('AZ5 issue at step '+i+', t='+r.time+', n='+nBefore+' -> '+nAfter);
    break;
  }
  // Log at strategic times
  if (i === 0) console.log('t=0.1: n='+nAfter.toFixed(6)+', pos='+r.control.position.toFixed(6));
  if (i === 9) console.log('t=1.0: n='+nAfter.toFixed(6)+', pos='+r.control.position.toFixed(6)+', az5='+r.az5.active);
  if (i === 10) console.log('t=1.1: n='+nAfter.toFixed(6)+', pos='+r.control.position.toFixed(6)+', az5='+r.az5.active);
}
console.log('Final: n='+r.neutron.n+', isNaN='+isNaN(r.neutron.n));
