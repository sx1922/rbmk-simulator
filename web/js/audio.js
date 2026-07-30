(function() {
  'use strict';

  var ctx = null;
  var buses = {};
  var noiseBuffer = null;
  var pinkNoiseBuffer = null;
  var initialized = false;

  // ======================== engine ========================

  function init() {
    if (initialized) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    limiter.connect(ctx.destination);
    var master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(limiter);
    var busNames = ['ambient', 'equipment', 'events', 'alarms', 'narrative'];
    for (var i = 0; i < busNames.length; i++) {
      var g = ctx.createGain();
      g.gain.value = 1.0;
      g.connect(master);
      buses[busNames[i]] = g;
    }
    buses._master = master;
    noiseBuffer = createNoiseBuffer(ctx, 1);
    pinkNoiseBuffer = createPinkNoiseBuffer(ctx, 2);
    initialized = true;
    return ctx;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function setMasterVolume(v) {
    if (buses._master) {
      buses._master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    }
  }

  function ensureCtx() {
    return init();
  }

  // ======================== synth ========================

  function createNoiseBuffer(context, duration) {
    duration = duration || 1;
    var length = context.sampleRate * duration;
    var buffer = context.createBuffer(1, length, context.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function createPinkNoiseBuffer(context, duration) {
    duration = duration || 2;
    var length = context.sampleRate * duration;
    var buffer = context.createBuffer(1, length, context.sampleRate);
    var data = buffer.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < length; i++) {
      var white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  function playPulse(bus, opts) {
    opts = opts || {};
    var c = bus.context;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.value = opts.freq || 1000;
    gain.gain.setValueAtTime(opts.volume || 0.3, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (opts.decay || 0.02));
    osc.connect(gain).connect(bus);
    osc.start();
    osc.stop(c.currentTime + (opts.decay || 0.02) + 0.01);
    osc.onended = function() {
      try { osc.disconnect(); } catch(e) {}
      try { gain.disconnect(); } catch(e) {}
    };
    return { osc: osc, gain: gain };
  }

  function playNoiseBurst(bus, noiseBuf, opts) {
    opts = opts || {};
    var c = bus.context;
    var src = c.createBufferSource();
    src.buffer = noiseBuf || noiseBuffer;
    src.loop = (opts.duration || 0.1) > src.buffer.duration;
    var filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'highpass';
    filter.frequency.value = opts.filterFreq || 4000;
    filter.Q.value = opts.filterQ || 1;
    var gain = c.createGain();
    var now = c.currentTime;
    var dur = opts.duration || 0.1;
    var att = opts.attack || 0.005;
    var rel = opts.release || 0.05;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(opts.volume || 0.2, now + att);
    gain.gain.setValueAtTime(opts.volume || 0.2, now + dur - rel);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    src.connect(filter).connect(gain).connect(bus);
    src.start();
    src.stop(now + dur + 0.01);
    src.onended = function() {
      try { src.disconnect(); } catch(e) {}
      try { filter.disconnect(); } catch(e) {}
      try { gain.disconnect(); } catch(e) {}
    };
    return { src: src, filter: filter, gain: gain };
  }

  function playSweep(bus, opts) {
    opts = opts || {};
    var c = bus.context;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sawtooth';
    osc.frequency.setValueAtTime(opts.freqStart || 400, c.currentTime);
    osc.frequency.linearRampToValueAtTime(opts.freqEnd || 800, c.currentTime + (opts.duration || 1));
    gain.gain.value = opts.volume || 0.25;
    osc.connect(gain).connect(bus);
    osc.start();
    osc.stop(c.currentTime + (opts.duration || 1) + 0.01);
    osc.onended = function() {
      try { osc.disconnect(); } catch(e) {}
      try { gain.disconnect(); } catch(e) {}
    };
    return { osc: osc, gain: gain };
  }

  // legacy one-shot beep
  function beep(freq, dur, type, vol) {
    ensureCtx();
    var c = ctx;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.value = vol || 0.15;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(buses.events || buses._master || c.destination);
    o.start(c.currentTime);
    o.stop(c.currentTime + dur);
  }

  // legacy click
  function click() {
    ensureCtx();
    var c = ctx;
    var b = c.createBuffer(1, c.sampleRate * 0.04, c.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.006));
    var s = c.createBufferSource();
    var g = c.createGain();
    s.buffer = b;
    g.gain.value = 0.2;
    s.connect(g);
    g.connect(buses.events || buses._master || c.destination);
    s.start(c.currentTime);
  }

  // legacy alarm tone
  function alarmTone() {
    beep(220, 0.2, 'sine', 0.12);
  }

  // ======================== ambient ========================

  var _humHandle = null;
  var _ventHandle = null;
  var _pipeHandle = null;

  function startHum(bus) {
    if (_humHandle) return _humHandle;
    bus = bus || buses.ambient;
    var c = bus.context;
    var freqs = [50, 100, 150];
    var gainVals = [0.06, 0.03, 0.015];
    var nodes = [];
    for (var i = 0; i < freqs.length; i++) {
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      g.gain.value = gainVals[i];
      osc.connect(g).connect(bus);
      osc.start();
      nodes.push({ osc: osc, gain: g });
    }
    _humHandle = {
      nodes: nodes,
      setPower: function(fraction) {
        var boost = 1 + fraction * 0.5;
        for (var j = 0; j < nodes.length; j++) {
          nodes[j].gain.gain.setTargetAtTime(gainVals[j] * boost, c.currentTime, 0.5);
        }
      },
      stop: function() {
        for (var j = 0; j < nodes.length; j++) {
          try { nodes[j].osc.stop(); } catch(e) {}
        }
        _humHandle = null;
      }
    };
    return _humHandle;
  }

  function stopHum() {
    if (_humHandle) {
      _humHandle.stop();
      _humHandle = null;
    }
  }

  function setHumVolume(v) {
    if (_humHandle) {
      for (var i = 0; i < _humHandle.nodes.length; i++) {
        _humHandle.nodes[i].gain.gain.value = v;
      }
    }
  }

  function startVentilation(bus) {
    if (_ventHandle) return _ventHandle;
    bus = bus || buses.ambient;
    var c = bus.context;
    var src = c.createBufferSource();
    src.buffer = pinkNoiseBuffer || noiseBuffer;
    src.loop = true;
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 250;
    filter.Q.value = 0.5;
    var gain = c.createGain();
    gain.gain.value = 0.04;
    src.connect(filter).connect(gain).connect(bus);
    src.start();
    _ventHandle = {
      src: src,
      gain: gain,
      setLevel: function(v) {
        gain.gain.setTargetAtTime(v * 0.04, c.currentTime, 1.0);
      },
      stop: function() {
        gain.gain.setTargetAtTime(0, c.currentTime, 1.5);
        try { src.stop(c.currentTime + 5); } catch(e) {}
        _ventHandle = null;
      }
    };
    return _ventHandle;
  }

  function stopVentilation() {
    if (_ventHandle) {
      _ventHandle.stop();
      _ventHandle = null;
    }
  }

  function startPipeSounds(bus) {
    if (_pipeHandle) return _pipeHandle;
    bus = bus || buses.ambient;
    var c = bus.context;
    var timer = null;
    function scheduleNext() {
      var delay = 30000 + Math.random() * 60000;
      timer = setTimeout(function() {
        if (Math.random() > 0.5) {
          playPulse(bus, { freq: 800 + Math.random() * 600, decay: 0.08, type: 'sine', volume: 0.02 });
          setTimeout(function() {
            playPulse(bus, { freq: 600 + Math.random() * 400, decay: 0.05, type: 'sine', volume: 0.01 });
          }, 80 + Math.random() * 40);
        } else {
          playNoiseBurst(bus, noiseBuffer, {
            duration: 0.3 + Math.random() * 0.5,
            filterFreq: 400,
            filterType: 'lowpass',
            volume: 0.015
          });
        }
        scheduleNext();
      }, delay);
    }
    scheduleNext();
    _pipeHandle = {
      stop: function() { clearTimeout(timer); _pipeHandle = null; }
    };
    return _pipeHandle;
  }

  function stopPipeSounds() {
    if (_pipeHandle) {
      _pipeHandle.stop();
      _pipeHandle = null;
    }
  }

  // ======================== equipment ========================

  function PumpSound(bus) {
    this.bus = bus || buses.equipment;
    this.ctx = this.bus.context;
    this.pumps = [];
  }

  PumpSound.prototype.startPump = function() {
    var c = this.ctx;
    var osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 28 + Math.random() * 4;
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    var gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.bus);
    osc.start();
    gain.gain.linearRampToValueAtTime(0.035, c.currentTime + 0.5);
    var pump = { osc: osc, filter: filter, gain: gain, running: true, cavitating: false };
    this.pumps.push(pump);
    return pump;
  };

  PumpSound.prototype.stopPump = function(pump) {
    if (!pump.running) return;
    pump.running = false;
    var c = this.ctx;
    pump.osc.frequency.linearRampToValueAtTime(10, c.currentTime + 3);
    pump.gain.gain.setTargetAtTime(0, c.currentTime, 1.0);
    var self = this;
    setTimeout(function() {
      try { pump.osc.stop(); } catch(e) {}
      self.pumps = self.pumps.filter(function(p) { return p !== pump; });
    }, 3500);
  };

  PumpSound.prototype.setCavitation = function(pump, active) {
    if (active && !pump.cavitating) {
      pump.cavitating = true;
      var c = this.ctx;
      var noise = c.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      var hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      var g = c.createGain();
      g.gain.value = 0.008;
      noise.connect(hp).connect(g).connect(this.bus);
      noise.start();
      pump._cavNoise = { noise: noise, gain: g };
    } else if (!active && pump.cavitating) {
      pump.cavitating = false;
      if (pump._cavNoise) {
        pump._cavNoise.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
        try { pump._cavNoise.noise.stop(this.ctx.currentTime + 1); } catch(e) {}
        pump._cavNoise = null;
      }
    }
  };

  PumpSound.prototype.stopAll = function() {
    for (var i = this.pumps.length - 1; i >= 0; i--) {
      this.stopPump(this.pumps[i]);
    }
  };

  function GeigerCounter(bus) {
    this.bus = bus || buses.equipment;
    this.ctx = this.bus.context;
    this.rate = 2;
    this.running = false;
    this._timer = null;
  }

  GeigerCounter.prototype.start = function() {
    this.running = true;
    this._schedule();
  };

  GeigerCounter.prototype.stop = function() {
    this.running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  };

  GeigerCounter.prototype.setDoseRate = function(mR) {
    if (mR < 0.1)       this.rate = 1 + Math.random() * 2;
    else if (mR < 1)    this.rate = 5 + mR * 10;
    else if (mR < 10)   this.rate = 30 + mR * 5;
    else if (mR < 100)  this.rate = 150 + mR * 2.5;
    else if (mR < 1000) this.rate = 400;
    else                this.rate = 800;
  };

  GeigerCounter.prototype._schedule = function() {
    if (!this.running) return;
    var interval = 1000 / this.rate;
    var jitter = interval * 0.6 * (Math.random() - 0.5);
    var delay = Math.max(3, interval + jitter);
    var self = this;
    this._timer = setTimeout(function() {
      self._click();
      self._schedule();
    }, delay);
  };

  GeigerCounter.prototype._click = function() {
    var c = this.ctx;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = 700 + Math.random() * 500;
    gain.gain.setValueAtTime(0.25, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.004);
    osc.connect(gain).connect(this.bus);
    osc.start();
    osc.stop(c.currentTime + 0.006);
    osc.onended = function() {
      try { osc.disconnect(); } catch(e) {}
      try { gain.disconnect(); } catch(e) {}
    };
  };

  function playRelay(bus, variant) {
    bus = bus || buses.equipment;
    var specs = {
      light:     { freq: 2000, decay: 0.015, volume: 0.15 },
      heavy:     { freq: 1200, decay: 0.025, volume: 0.25 },
      contactor: { freq: 800,  decay: 0.04,  volume: 0.3 }
    };
    var s = specs[variant] || specs.light;
    playPulse(bus, { freq: s.freq, decay: s.decay, type: 'square', volume: s.volume });
    if (variant === 'contactor') {
      setTimeout(function() {
        playPulse(bus, { freq: 1500, decay: 0.01, type: 'square', volume: 0.08 });
      }, 30);
    }
  }

  function playRelayCascade(bus, count, interval) {
    bus = bus || buses.equipment;
    count = count || 6;
    interval = interval || 80;
    for (var i = 0; i < count; i++) {
      (function(idx) {
        setTimeout(function() {
          playRelay(bus, idx % 2 === 0 ? 'heavy' : 'light');
        }, idx * interval + Math.random() * 20);
      })(i);
    }
  }

  function playValve(bus, duration) {
    bus = bus || buses.equipment;
    duration = duration || 3;
    var c = bus.context;
    var osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 120;
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    var gain = c.createGain();
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, c.currentTime + 0.2);
    gain.gain.setValueAtTime(0.06, c.currentTime + duration - 0.3);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + duration);
    osc.connect(filter).connect(gain).connect(bus);
    osc.start();
    osc.stop(c.currentTime + duration + 0.1);
    osc.onended = function() {
      try { osc.disconnect(); } catch(e) {}
      try { filter.disconnect(); } catch(e) {}
      try { gain.disconnect(); } catch(e) {}
    };
    setTimeout(function() {
      playPulse(bus, { freq: 150, decay: 0.08, type: 'sine', volume: 0.2 });
    }, duration * 1000);
  }

  function playSafetyValve(bus, duration) {
    bus = bus || buses.equipment;
    duration = duration || 2;
    playNoiseBurst(bus, noiseBuffer, {
      duration: duration,
      filterFreq: 6000,
      filterType: 'highpass',
      filterQ: 0.7,
      volume: 0.2,
      attack: 0.02,
      release: duration * 0.4
    });
  }

  // ======================== events ========================

  function playButtonSmall(bus) {
    bus = bus || buses.events;
    playPulse(bus, { freq: 3000, decay: 0.012, type: 'square', volume: 0.12 });
  }

  function playButtonLarge(bus) {
    bus = bus || buses.events;
    playPulse(bus, { freq: 600, decay: 0.03, type: 'square', volume: 0.2 });
    setTimeout(function() {
      playPulse(bus, { freq: 200, decay: 0.05, type: 'sine', volume: 0.3 });
    }, 100);
  }

  function playButtonWithLamp(bus) {
    bus = bus || buses.events;
    playButtonSmall(bus);
    setTimeout(function() { playRelay(bus || buses.events, 'light'); }, 30);
  }

  function playToggleSwitch(bus, direction) {
    bus = bus || buses.events;
    var freq = direction === 'right' ? 2500 : 2200;
    playPulse(bus, { freq: freq, decay: 0.015, type: 'square', volume: 0.15 });
  }

  function playKeyInsert(bus) {
    bus = bus || buses.events;
    playNoiseBurst(bus, noiseBuffer, {
      duration: 0.06, filterFreq: 5000, filterType: 'highpass', volume: 0.1
    });
  }

  function playKeyTurn(bus) {
    bus = bus || buses.events;
    playPulse(bus, { freq: 1800, decay: 0.02, type: 'square', volume: 0.12 });
    setTimeout(function() {
      playPulse(bus, { freq: 1600, decay: 0.015, type: 'square', volume: 0.08 });
    }, 60);
  }

  function playPageTurn(bus) {
    bus = bus || buses.events;
    playNoiseBurst(bus, noiseBuffer, {
      duration: 0.15, filterFreq: 3000, filterType: 'bandpass', filterQ: 0.8,
      volume: 0.08, attack: 0.01, release: 0.08
    });
  }

  function playPageTurnFast(bus, pages) {
    bus = bus || buses.events;
    pages = pages || 3;
    for (var i = 0; i < pages; i++) {
      (function(idx) {
        setTimeout(function() { playPageTurn(bus); }, idx * 80);
      })(i);
    }
  }

  function playBookPickup(bus) {
    bus = bus || buses.events;
    playNoiseBurst(bus, noiseBuffer, {
      duration: 0.08, filterFreq: 2000, filterType: 'bandpass', volume: 0.05
    });
  }

  function playBookDrop(bus) {
    bus = bus || buses.events;
    playPulse(bus, { freq: 200, decay: 0.06, type: 'sine', volume: 0.15 });
  }

  function playClipboardClip(bus) {
    bus = bus || buses.events;
    playPulse(bus, { freq: 4000, decay: 0.01, type: 'square', volume: 0.1 });
  }

  function playPenWrite(bus) {
    bus = bus || buses.events;
    playNoiseBurst(bus, noiseBuffer, {
      duration: 0.3, filterFreq: 2500, filterType: 'bandpass', filterQ: 2, volume: 0.015
    });
  }

  function playSlideRule(bus) {
    bus = bus || buses.events;
    playNoiseBurst(bus, noiseBuffer, {
      duration: 0.2, filterFreq: 1500, filterType: 'bandpass', filterQ: 3, volume: 0.02
    });
  }

  // ======================== phone (events) ========================

  function PhoneSound(bus) {
    this.bus = bus || buses.events;
    this.ctx = this.bus.context;
    this.ringing = false;
    this._ringInterval = null;
    this._busyInterval = null;
    this._busyOsc = null;
  }

  PhoneSound.prototype.startRing = function() {
    if (this.ringing) return;
    this.ringing = true;
    var self = this;
    var ring = function() {
      var c = self.ctx;
      var osc1 = c.createOscillator();
      var osc2 = c.createOscillator();
      var modGain = c.createGain();
      var outGain = c.createGain();
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      osc1.type = 'sine';
      osc2.type = 'sine';
      var mod = c.createOscillator();
      mod.frequency.value = 25;
      mod.type = 'square';
      mod.connect(modGain.gain);
      modGain.gain.value = 0;
      osc1.connect(modGain);
      osc2.connect(modGain);
      modGain.connect(outGain).connect(self.bus);
      outGain.gain.value = 0.15;
      osc1.start(); osc2.start(); mod.start();
      setTimeout(function() {
        try { osc1.stop(); } catch(e) {}
        try { osc2.stop(); } catch(e) {}
        try { mod.stop(); } catch(e) {}
      }, 2000);
    };
    ring();
    this._ringInterval = setInterval(ring, 3000);
  };

  PhoneSound.prototype.stopRing = function() {
    this.ringing = false;
    if (this._ringInterval) { clearInterval(this._ringInterval); this._ringInterval = null; }
  };

  PhoneSound.prototype.playPickup = function() {
    this.stopRing();
    playPulse(this.bus, { freq: 800, decay: 0.03, type: 'sine', volume: 0.12 });
  };

  PhoneSound.prototype.playHangup = function() {
    playPulse(this.bus, { freq: 600, decay: 0.04, type: 'sine', volume: 0.15 });
  };

  PhoneSound.prototype.playBusyTone = function() {
    var c = this.ctx;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.frequency.value = 425;
    osc.type = 'sine';
    gain.gain.value = 0;
    osc.connect(gain).connect(this.bus);
    osc.start();
    var self = this;
    this._busyInterval = setInterval(function() {
      var now = c.currentTime;
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.setValueAtTime(0, now + 0.5);
    }, 1000);
    this._busyOsc = osc;
  };

  PhoneSound.prototype.stopBusyTone = function() {
    if (this._busyInterval) { clearInterval(this._busyInterval); this._busyInterval = null; }
    if (this._busyOsc) { try { this._busyOsc.stop(); } catch(e) {} this._busyOsc = null; }
  };

  // ======================== alarms ========================

  var ALARM_SPECS = {
    П1:  { waveform: 'square', freq: 800,  pattern: 'continuous', level: '\u0430\u0432\u0430\u0440\u0438\u044F' },
    П2:  { waveform: 'square', freq: 800,  pattern: 'continuous', level: '\u0430\u0432\u0430\u0440\u0438\u044F' },
    П3:  { waveform: 'square', freq: 1200, pattern: 'pulse', onMs: 500, offMs: 500, level: '\u0430\u0432\u0430\u0440\u0438\u044F' },
    П4:  { waveform: 'square', freq: 600,  pattern: 'pulse', onMs: 1000, offMs: 1000, level: '\u0441\u0438\u0433\u043D\u0430\u043B' },
    П5:  { waveform: 'square', freq: 600,  pattern: 'pulse', onMs: 1000, offMs: 1000, level: '\u0441\u0438\u0433\u043D\u0430\u043B' },
    П6:  { waveform: 'square', freq: 800,  pattern: 'pulse', onMs: 2000, offMs: 1000, level: '\u0430\u0432\u0430\u0440\u0438\u044F' },
    П7:  { waveform: 'sine',   freq: 440,  pattern: 'pulse', onMs: 2000, offMs: 2000, level: '\u0441\u0438\u0433\u043D\u0430\u043B' },
    П8:  { waveform: 'sine',   freq: 520,  pattern: 'pulse', onMs: 2000, offMs: 2000, level: '\u0441\u0438\u0433\u043D\u0430\u043B' },
    П9:  { waveform: 'sine',   freq: [440, 660], pattern: 'alternate', onMs: 500, level: '\u0430\u0432\u0430\u0440\u0438\u044F' },
    П10: { waveform: 'square', freq: 1000, pattern: 'triple', count: 3, periodMs: 333, level: '\u0441\u0438\u0433\u043D\u0430\u043B' },
    AZ5: { waveform: 'sawtooth', freq: [400, 800], pattern: 'sweep', sweepMs: 1500, level: '\u0430\u0432\u0430\u0440\u0438\u044F' }
  };

  function AlarmSynth(bus) {
    this.bus = bus || buses.alarms;
    this.ctx = this.bus.context;
    this.active = new Map();
  }

  AlarmSynth.prototype.start = function(code) {
    if (this.active.has(code)) return;
    var spec = ALARM_SPECS[code];
    if (!spec) return;
    var controller;
    switch (spec.pattern) {
      case 'continuous': controller = this._startContinuous(spec); break;
      case 'pulse':      controller = this._startPulse(spec); break;
      case 'alternate':  controller = this._startAlternate(spec); break;
      case 'triple':     controller = this._startTriple(spec); break;
      case 'sweep':      controller = this._startSweep(spec); break;
      default: return;
    }
    this.active.set(code, controller);
  };

  AlarmSynth.prototype.acknowledge = function(code) {
    var ctrl = this.active.get(code);
    if (!ctrl) return;
    ctrl.stop();
    this.active.delete(code);
  };

  AlarmSynth.prototype.acknowledgeAll = function() {
    var self = this;
    this.active.forEach(function(ctrl, code) {
      ctrl.stop();
    });
    this.active.clear();
  };

  AlarmSynth.prototype._startContinuous = function(spec) {
    var c = this.ctx;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = spec.waveform;
    osc.frequency.value = spec.freq;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(this.bus);
    osc.start();
    return {
      stop: function() {
        gain.gain.setTargetAtTime(0, c.currentTime, 0.02);
        try { osc.stop(c.currentTime + 0.1); } catch(e) {}
      }
    };
  };

  AlarmSynth.prototype._startPulse = function(spec) {
    var c = this.ctx;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = spec.waveform;
    osc.frequency.value = spec.freq;
    gain.gain.value = 0;
    osc.connect(gain).connect(this.bus);
    osc.start();
    var running = true;
    var cycle = function() {
      if (!running) return;
      gain.gain.setTargetAtTime(0.2, c.currentTime, 0.01);
      setTimeout(function() {
        if (!running) return;
        gain.gain.setTargetAtTime(0, c.currentTime, 0.01);
        setTimeout(cycle, spec.offMs);
      }, spec.onMs);
    };
    cycle();
    return {
      stop: function() {
        running = false;
        gain.gain.setTargetAtTime(0, c.currentTime, 0.02);
        try { osc.stop(c.currentTime + 0.1); } catch(e) {}
      }
    };
  };

  AlarmSynth.prototype._startAlternate = function(spec) {
    var c = this.ctx;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = spec.waveform;
    osc.frequency.value = spec.freq[0];
    gain.gain.value = 0.2;
    osc.connect(gain).connect(this.bus);
    osc.start();
    var idx = 0;
    var interval = setInterval(function() {
      idx = 1 - idx;
      osc.frequency.setTargetAtTime(spec.freq[idx], c.currentTime, 0.01);
    }, spec.onMs);
    return {
      stop: function() {
        clearInterval(interval);
        gain.gain.setTargetAtTime(0, c.currentTime, 0.02);
        try { osc.stop(c.currentTime + 0.1); } catch(e) {}
      }
    };
  };

  AlarmSynth.prototype._startTriple = function(spec) {
    var c = this.ctx;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = spec.waveform;
    osc.frequency.value = spec.freq;
    gain.gain.value = 0;
    osc.connect(gain).connect(this.bus);
    osc.start();
    var running = true;
    var cycle = function() {
      if (!running) return;
      for (var i = 0; i < spec.count; i++) {
        (function(idx) {
          setTimeout(function() {
            if (!running) return;
            gain.gain.setValueAtTime(0.15, c.currentTime);
            gain.gain.setTargetAtTime(0, c.currentTime + 0.03, 0.01);
          }, idx * 80);
        })(i);
      }
      setTimeout(cycle, spec.periodMs * spec.count + 200);
    };
    cycle();
    return {
      stop: function() {
        running = false;
        gain.gain.setTargetAtTime(0, c.currentTime, 0.02);
        try { osc.stop(c.currentTime + 0.1); } catch(e) {}
      }
    };
  };

  AlarmSynth.prototype._startSweep = function(spec) {
    var c = this.ctx;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = spec.waveform;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(this.bus);
    osc.start();
    var running = true;
    var sweep = function() {
      if (!running) return;
      var now = c.currentTime;
      osc.frequency.setValueAtTime(spec.freq[0], now);
      osc.frequency.linearRampToValueAtTime(spec.freq[1], now + spec.sweepMs / 1000);
      osc.frequency.linearRampToValueAtTime(spec.freq[0], now + spec.sweepMs * 2 / 1000);
      setTimeout(sweep, spec.sweepMs * 2);
    };
    sweep();
    return {
      stop: function() {
        running = false;
        gain.gain.setTargetAtTime(0, c.currentTime, 0.02);
        try { osc.stop(c.currentTime + 0.1); } catch(e) {}
      }
    };
  };

  // ======================== narrative ========================

  function playPrint(bus, chars) {
    bus = bus || buses.narrative;
    chars = chars || 20;
    var charTime = 60;
    for (var i = 0; i < chars; i++) {
      (function(idx) {
        setTimeout(function() {
          playPulse(bus, {
            freq: 3000 + Math.random() * 1000,
            decay: 0.008,
            type: 'square',
            volume: 0.04
          });
        }, idx * charTime + Math.random() * 10);
      })(i);
    }
    setTimeout(function() {
      playPulse(bus, { freq: 500, decay: 0.03, type: 'square', volume: 0.1 });
    }, chars * charTime + 100);
  }

  function playVoice(bus, id) {
    console.warn('[audio] voice "' + id + '" not available in Phase 1');
  }

  // ======================== mixer ========================

  function Mixer(busMap) {
    this.buses = busMap || buses;
    this.duckRules = [
      { trigger: 'narrative', targets: ['ambient', 'equipment', 'events'], amount: 0.25, release: 1.0 },
      { trigger: 'alarms',    targets: ['ambient', 'equipment'],           amount: 0.5,  release: 0.5 }
    ];
    this._activeDucks = {};
  }

  Mixer.prototype.onLayerActive = function(layerName) {
    for (var i = 0; i < this.duckRules.length; i++) {
      var rule = this.duckRules[i];
      if (rule.trigger === layerName) {
        for (var j = 0; j < rule.targets.length; j++) {
          var target = rule.targets[j];
          var bus = this.buses[target];
          if (bus) {
            bus.gain.setTargetAtTime(rule.amount, bus.context.currentTime, 0.1);
            this._activeDucks[layerName + '->' + target] = rule;
          }
        }
      }
    }
  };

  Mixer.prototype.onLayerInactive = function(layerName) {
    var self = this;
    Object.keys(this._activeDucks).forEach(function(key) {
      if (key.indexOf(layerName + '->') === 0) {
        var target = key.split('->')[1];
        var rule = self._activeDucks[key];
        var bus = self.buses[target];
        if (bus) {
          bus.gain.setTargetAtTime(1.0, bus.context.currentTime, rule.release);
        }
        delete self._activeDucks[key];
      }
    });
  };

  // ======================== game integration ========================

  var defaultPumpSound = null;
  var defaultGeiger = null;
  var defaultAlarmSynth = null;
  var defaultPhone = null;
  var defaultMixer = null;

  function ensureDefaults() {
    if (!initialized) init();
    if (!defaultPumpSound) defaultPumpSound = new PumpSound(buses.equipment);
    if (!defaultGeiger) defaultGeiger = new GeigerCounter(buses.equipment);
    if (!defaultAlarmSynth) defaultAlarmSynth = new AlarmSynth(buses.alarms);
    if (!defaultPhone) defaultPhone = new PhoneSound(buses.events);
    if (!defaultMixer) defaultMixer = new Mixer(buses);
  }

  function onReactorStateChange(state) {
    ensureDefaults();
    if (_humHandle) {
      _humHandle.setPower(state.power / 3200);
    }
    defaultGeiger.setDoseRate(state.doseRate || 0);
    if (state.power > 3200) {
      if (!_pipeHandle) startPipeSounds();
    }
  }

  function onProtectionTrigger(code) {
    ensureDefaults();
    defaultAlarmSynth.start(code);
    defaultMixer.onLayerActive('alarms');
  }

  function onProtectionAcknowledge(code) {
    ensureDefaults();
    defaultAlarmSynth.acknowledge(code);
    if (defaultAlarmSynth.active.size === 0) {
      defaultMixer.onLayerInactive('alarms');
    }
  }

  function onAccidentSequence() {
    ensureDefaults();
    var t = function(ms, fn) { setTimeout(fn, ms); };
    t(0, function() {
      playButtonLarge(buses.events);
      defaultAlarmSynth.start('AZ5');
    });
    t(2000, function() { playRelayCascade(buses.equipment, 8, 100); });
    t(6000, function() {
      playSafetyValve(buses.equipment, 3);
      playSafetyValve(buses.equipment, 2.5);
      playPulse(buses.events, { freq: 100, decay: 0.15, type: 'sine', volume: 0.4 });
    });
    t(8000, function() {
      playPulse(buses.events, { freq: 40, decay: 0.5, type: 'sine', volume: 0.5 });
      if (_humHandle) { _humHandle.stop(); _humHandle = null; }
      if (_ventHandle) { _ventHandle.stop(); _ventHandle = null; }
      defaultPumpSound.stopAll();
      defaultAlarmSynth.acknowledgeAll();
    });
    t(9000, function() {
      playSafetyValve(buses.equipment, 8);
      defaultGeiger.setDoseRate(5000);
      if (!defaultGeiger.running) defaultGeiger.start();
    });
    t(15000, function() {
      defaultGeiger.setDoseRate(50);
    });
    t(30000, function() {
      defaultGeiger.stop();
    });
  }

  // ======================== public API ========================

  window.Audio = {
    // engine
    init: init,
    resume: resume,
    getCtx: function() { return ctx; },
    getBus: function(name) { return buses[name]; },
    setMasterVolume: setMasterVolume,
    getNoiseBuffer: function() { return noiseBuffer; },
    getPinkNoiseBuffer: function() { return pinkNoiseBuffer; },

    // legacy
    ensureCtx: ensureCtx,
    beep: beep,
    click: click,
    alarmTone: alarmTone,

    // synth
    createNoiseBuffer: createNoiseBuffer,
    createPinkNoiseBuffer: createPinkNoiseBuffer,
    playPulse: playPulse,
    playNoiseBurst: playNoiseBurst,
    playSweep: playSweep,

    // ambient
    startHum: startHum,
    stopHum: stopHum,
    setHumVolume: setHumVolume,
    startVentilation: startVentilation,
    stopVentilation: stopVentilation,
    startPipeSounds: startPipeSounds,
    stopPipeSounds: stopPipeSounds,

    // equipment
    PumpSound: PumpSound,
    GeigerCounter: GeigerCounter,
    playRelay: playRelay,
    playRelayCascade: playRelayCascade,
    playValve: playValve,
    playSafetyValve: playSafetyValve,
    getPumpSound: function() { ensureDefaults(); return defaultPumpSound; },
    getGeiger: function() { ensureDefaults(); return defaultGeiger; },

    // events
    playButtonSmall: playButtonSmall,
    playButtonLarge: playButtonLarge,
    playButtonWithLamp: playButtonWithLamp,
    playToggleSwitch: playToggleSwitch,
    playKeyInsert: playKeyInsert,
    playKeyTurn: playKeyTurn,
    playPageTurn: playPageTurn,
    playPageTurnFast: playPageTurnFast,
    playBookPickup: playBookPickup,
    playBookDrop: playBookDrop,
    playClipboardClip: playClipboardClip,
    playPenWrite: playPenWrite,
    playSlideRule: playSlideRule,

    // phone
    PhoneSound: PhoneSound,
    getPhone: function() { ensureDefaults(); return defaultPhone; },

    // alarms
    ALARM_SPECS: ALARM_SPECS,
    AlarmSynth: AlarmSynth,
    getAlarmSynth: function() { ensureDefaults(); return defaultAlarmSynth; },

    // narrative
    playPrint: playPrint,
    playVoice: playVoice,

    // mixer
    Mixer: Mixer,
    getMixer: function() { ensureDefaults(); return defaultMixer; },

    // game integration
    onReactorStateChange: onReactorStateChange,
    onProtectionTrigger: onProtectionTrigger,
    onProtectionAcknowledge: onProtectionAcknowledge,
    onAccidentSequence: onAccidentSequence
  };
})();
