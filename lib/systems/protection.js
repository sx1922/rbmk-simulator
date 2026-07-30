var PC = { POWER_T: 1.30, POWER_W: 1.05, PERIOD_T: 10, PERIOD_W: 20, PERIOD_MIN: 0.01, PRES_T: 7.5e6, PRES_W: 7e6, LEV_T: 0.5, LEV_W: 0.8, FLOW_T: 0.70, FLOW_W: 0.80, TEMP_T: 350, TEMP_W: 320, OPR_T: 15, OPR_W: 20, OPR_TDELAY: 10, VOTE: 2 };

export var PROTECTION_CONSTANTS = { POWER_TRIP: PC.POWER_T, POWER_WARNING: PC.POWER_W, PERIOD_TRIP: PC.PERIOD_T, PERIOD_WARNING: PC.PERIOD_W, PERIOD_MIN_POWER: PC.PERIOD_MIN, PRESSURE_TRIP: PC.PRES_T, PRESSURE_WARNING: PC.PRES_W, LEVEL_TRIP: PC.LEV_T, LEVEL_WARNING: PC.LEV_W, FLOW_TRIP: PC.FLOW_T, FLOW_WARNING: PC.FLOW_W, TEMP_TRIP: PC.TEMP_T, TEMP_WARNING: PC.TEMP_W, OPR_TRIP: PC.OPR_T, OPR_WARNING: PC.OPR_W, VOTING_CHANNELS: 3, VOTING_THRESHOLD: PC.VOTE };

export function createProtectionState() {
  var ds = [['P1','Power overpower',PC.POWER_T,false],['P2','Short period',PC.PERIOD_T,false],['P3','High steam pressure',PC.PRES_T,true],['P4','Low steam drum level',PC.LEV_T,true],['P5','Low coolant flow',PC.FLOW_T,true],['P6','High fuel exit temp',PC.TEMP_T,true],['P7','Manual AZ-5',1,false],['P8','Power loss',1,false],['P9','Seismic',0.5,false],['P10','OPR insufficient',PC.OPR_T,true]];
  var sigs = {};
  for (var si = 0; si < ds.length; si++) { var d = ds[si]; sigs[d[0]] = { id:d[0], name:d[1], tripped:false, warning:false, bypassed:false, bypassable:d[3], value:0, threshold:d[2], tripTime:-1, chV:[0,0,0], chT:[false,false,false] }; }
  return { signals:sigs, az5Demand:false, az5DemandLatched:false, az5Cause:'', alarms:[], bypassCount:0, protectionDisabled:false };
}

function evalSig(sig, val, cfg, t) {
  sig.value = val;
  var n = function(){return(Math.random()-0.5)*0.001*Math.abs(val||1);};
  sig.chV = [val+n(),val+n(),val+n()];
  for (var i=0;i<3;i++) sig.chT[i]=cfg.dir==='high'?sig.chV[i]>=cfg.trip:sig.chV[i]<=cfg.trip;
  var tc=0;for(var ci=0;ci<3;ci++){if(sig.chT[ci])tc++;}
  var wt=sig.tripped;sig.tripped=tc>=PC.VOTE;
  if(sig.tripped&&!wt)sig.tripTime=t;
  sig.warning=cfg.dir==='high'?(val>=cfg.warn&&!sig.tripped):(val<=cfg.warn&&!sig.tripped);
}

export function stepProtection(ps, dt, time, inp) {
  if(ps.protectionDisabled){ps.az5Demand=false;return ps;}
  var al=[];
  evalSig(ps.signals.P1,inp.powerFrac,{trip:PC.POWER_T,warn:PC.POWER_W,dir:'high'},time);
  if(ps.signals.P1.warning)al.push({level:'warning',id:'P1',msg:'Power '+(inp.powerFrac*100).toFixed(1)+'%'});
  if(inp.powerFrac>PC.PERIOD_MIN)evalSig(ps.signals.P2,inp.period,{trip:PC.PERIOD_T,warn:PC.PERIOD_W,dir:'low'},time);else{ps.signals.P2.tripped=false;ps.signals.P2.warning=false;}
  evalSig(ps.signals.P3,inp.pressure,{trip:PC.PRES_T,warn:PC.PRES_W,dir:'high'},time);
  evalSig(ps.signals.P4,inp.waterLevel,{trip:PC.LEV_T,warn:PC.LEV_W,dir:'low'},time);
  evalSig(ps.signals.P5,inp.coolantFlow,{trip:PC.FLOW_T,warn:PC.FLOW_W,dir:'low'},time);
  evalSig(ps.signals.P6,inp.fuelExitTemp,{trip:PC.TEMP_T,warn:PC.TEMP_W,dir:'high'},time);
  if(inp.manualAZ5){ps.signals.P7.tripped=true;ps.signals.P7.tripTime=time;ps.signals.P7.value=1;}
  if(inp.powerLoss){ps.signals.P8.tripped=true;ps.signals.P8.tripTime=time;ps.signals.P8.value=1;}
  evalSig(ps.signals.P9,inp.seismicG||0,{trip:0.5,warn:0.3,dir:'high'},time);
  if(!ps.az5DemandLatched){
    evalSig(ps.signals.P10,inp.oprRods,{trip:PC.OPR_T,warn:PC.OPR_W,dir:'low'},time);
    if(ps.signals.P10.tripped&&ps.signals.P10.tripTime>0&&time-ps.signals.P10.tripTime<PC.OPR_TDELAY)ps.signals.P10.tripped=false;
  }
  if(ps.signals.P10.tripped)al.push({level:'critical',id:'P10',msg:'OPR='+inp.oprRods.toFixed(1)+'<15!'});
  ps.az5Demand=false;ps.az5Cause='';
  var ts=[],keys=Object.keys(ps.signals);
  for(var si=0;si<keys.length;si++){var s=ps.signals[keys[si]];if(s.tripped&&!s.bypassed)ts.push(keys[si]);}
  if(ts.length>0){ps.az5Demand=true;ps.az5DemandLatched=true;ps.az5Cause=ts.join(' + ');}
  ps.alarms=al;
  ps.bypassCount=0;for(var si2=0;si2<keys.length;si2++){if(ps.signals[keys[si2]].bypassed)ps.bypassCount++;}
}

export function bypassSignal(ps, id, reason) {
  if(!ps.signals[id])return{success:false,message:'Unknown: '+id};
  if(!ps.signals[id].bypassable)return{success:false,message:id+' not bypassable'};
  ps.signals[id].bypassed=true;ps.bypassCount++;return{success:true,message:id+' bypassed. Reason: '+(reason||'none')};
}

export function restoreSignal(ps, id) {
  if(!ps.signals[id])return{success:false,message:'Unknown: '+id};
  ps.signals[id].bypassed=false;ps.bypassCount=Math.max(0,ps.bypassCount-1);return{success:true,message:id+' restored'};
}

export function setProtectionDisabled(ps, disabled) {
  ps.protectionDisabled=disabled;return{success:true,message:disabled?'Protection disabled':'Protection restored'};
}

export function resetAZ5Latch(ps) {
  var active=[];var keys=Object.keys(ps.signals);
  for(var si=0;si<keys.length;si++){var s=ps.signals[keys[si]];if(s.tripped&&!s.bypassed)active.push(s.id);}
  if(active.length>0)return{success:false,message:'Active trips: '+active.join(', ')};
  ps.az5DemandLatched=false;ps.az5Cause='';
  for(var si2=0;si2<keys.length;si2++){var s2=ps.signals[keys[si2]];s2.tripped=false;s2.tripTime=-1;}
  return{success:true,message:'AZ-5 latch reset'};
}

export function getProtectionReport(ps) {
  return { az5Demand:ps.az5Demand, az5DemandLatched:ps.az5DemandLatched, az5Cause:ps.az5Cause, bypassCount:ps.bypassCount, protectionDisabled:ps.protectionDisabled, alarms:ps.alarms, signals:ps.signals };
}

export function assessProtectionSafety(ps) {
  var score=100;var msgs=[];
  if(ps.protectionDisabled){score-=50;msgs.push('Protection disabled');}
  if(ps.bypassCount>0){score-=ps.bypassCount*10;msgs.push(ps.bypassCount+' bypassed');}
  if(ps.az5DemandLatched){score-=20;msgs.push('AZ-5 triggered');}
  if(score<0)score=0;
  var level=score>=80?'normal':score>=60?'caution':score>=40?'warning':score>=20?'critical':'catastrophic';
  if(msgs.length===0)msgs.push('Normal');
  return{level:level,score:score,messages:msgs};
}
