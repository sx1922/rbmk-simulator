var Audio = window.Audio || {};

(function(ns) {
  var ctx = null;
  var alarmOn = false;
  var lastAlarmSwitch = 0;
  var alarmOsc = null;
  var alarmGain = null;
  var alarmActive = false;
  var tickTime = 0;

  function getCtx() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) {
        ctx = new C();
      }
    }
    return ctx;
  }

  function playTone(freq, type, duration, gainVal) {
    var c = getCtx();
    if (!c) { return; }
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = gainVal || 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  }

  ns.init = function() {
    getCtx();
  };

  ns.playAlarm = function() {
    playTone(880, 'square', 0.1, 0.2);
  };

  ns.playClick = function() {
    playTone(1200, 'square', 0.03, 0.08);
  };

  ns.playScram = function() {
    var c = getCtx();
    if (!c) { return; }
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, c.currentTime + 1.5);
    gain.gain.setValueAtTime(0.25, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 1.5);
  };

  ns.tick = function(state) {
    tickTime++;
    var hasAlarm = false;
    if (state && state.alarms) {
      for (var k in state.alarms) {
        if (state.alarms.hasOwnProperty(k) && state.alarms[k]) {
          hasAlarm = true;
          break;
        }
      }
    }

    if (hasAlarm && !alarmActive) {
      alarmActive = true;
    } else if (!hasAlarm && alarmActive) {
      alarmActive = false;
    }

    if (alarmActive && tickTime % 12 === 0) {
      ns.playAlarm();
    }
  };
})(Audio);
