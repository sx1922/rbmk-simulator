var Systems = window.Systems || {};

(function(ns) {
  var INSTRUMENT_DEFS = [
    { id: 'power_meter',    name: '功率表',     unit: 'MWt',  lo: 0, hi: 5000, accuracy: 0.02,  delay: 2, readRaw: function(s) { var r = s.reactor; return r ? r.power : 0; } },
    { id: 'neutron_flux',   name: '中子通量',   unit: '%',    lo: 0, hi: 150,  accuracy: 0.03,  delay: 1, readRaw: function(s) { var r = s.reactor; return r ? r.neutronFlux : 0; } },
    { id: 'thermocouple',   name: '热电偶',     unit: '°C',   lo: 0, hi: 3000, accuracy: 0.01,  delay: 3, readRaw: function(s) { var t = s.thermal; return t && t.zones && t.zones[0] ? t.zones[0].temp : 0; } },
    { id: 'pressure_p',     name: '压力',       unit: 'MPa',  lo: 0, hi: 10,   accuracy: 0.02,  delay: 1, readRaw: function(s) { var r = s.reactor; return r ? r.pressure : 0; } },
    { id: 'flow_meter',     name: '流量计',     unit: 'm³/h', lo: 0, hi: 60000,accuracy: 0.015, delay: 2, readRaw: function(s) { var c = s.coolant; return c ? c.flow : 0; } },
    { id: 'void_meter',     name: '汽泡仪',     unit: '%',    lo: 0, hi: 100,  accuracy: 0.05,  delay: 2, readRaw: function(s) { var t = s.thermal; return t && t.zones && t.zones[0] ? t.zones[0].void : 0; } },
    { id: 'rad_meter',      name: '辐射计',     unit: 'mSv',  lo: 0, hi: 1000, accuracy: 0.1,   delay: 1, readRaw: function(s) { var d = s.duty; return d ? d.radiation : 0; } },
    { id: 'tachometer',     name: '转速表',     unit: 'rpm',  lo: 0, hi: 4000, accuracy: 0.01,  delay: 1, readRaw: function(s) { var t = s.turbine; return t ? t.speed : 0; } },
    { id: 'steam_p',        name: '蒸汽压力',   unit: 'MPa',  lo: 0, hi: 8,    accuracy: 0.02,  delay: 2, readRaw: function(s) { var t = s.turbine; return t ? t.steamPressure : 0; } },
    { id: 'fw_meter',       name: '给水流量',   unit: 't/h',  lo: 0, hi: 5000, accuracy: 0.02,  delay: 2, readRaw: function(s) { var f = s.feedwater; return f ? f.flow : 0; } }
  ];

  var FAULT_TYPES = ['stuck', 'drift', 'spike', 'dead'];
  var CLAMP = function(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };

  ns.Instruments = {};

  ns.Instruments.init = function(state) {
    var list = [];
    for (var i = 0; i < INSTRUMENT_DEFS.length; i++) {
      var def = INSTRUMENT_DEFS[i];
      var buf = [];
      for (var j = 0; j < def.delay; j++) {
        buf.push(null);
      }
      list.push({
        id: def.id,
        name: def.name,
        unit: def.unit,
        lo: def.lo,
        hi: def.hi,
        accuracy: def.accuracy,
        delay: def.delay,
        calAge: (Math.random() * 200) | 0,
        fault: null,
        buffer: buf,
        lastValue: 0,
        driftOffset: 0,
        readRaw: def.readRaw,
        raw: 0,
        display: 0
      });
    }
    state.instruments = { list: list };
  };

  ns.Instruments.step = function(state, dt, rngFunc, diffMul) {
    var list = state.instruments.list;
    var hoursPerStep = dt / 3600;
    for (var i = 0; i < list.length; i++) {
      var inst = list[i];
      inst.calAge += hoursPerStep;

      var raw = inst.readRaw(state);
      inst.raw = raw;

      var noise = (rngFunc() * 2 - 1) * inst.accuracy * raw * (1 + inst.calAge / 200) * (diffMul || 1);
      var val = raw + noise;

      if (inst.fault === 'dead') {
        val = null;
      } else if (inst.fault === 'stuck') {
        val = inst.lastValue;
      } else if (inst.fault === 'drift') {
        inst.driftOffset += (rngFunc() * 2 - 1) * inst.accuracy * inst.hi * 0.01 * diffMul;
        inst.driftOffset = CLAMP(inst.driftOffset, -inst.hi * 0.5, inst.hi * 0.5);
        val += inst.driftOffset;
      } else if (inst.fault === 'spike') {
        val += (rngFunc() * 2 - 1) * inst.hi * 0.3;
      }

      if (val !== null) {
        val = CLAMP(val, inst.lo, inst.hi);
        inst.lastValue = val;
      }

      inst.buffer.push(val);
      if (inst.buffer.length > inst.delay + 1) {
        inst.buffer.shift();
      }

      inst.display = inst.buffer.length > 0 ? inst.buffer[0] : null;

      if (inst.fault === null) {
        var faultProb = inst.calAge * 0.000005 * diffMul;
        if (rngFunc() < faultProb) {
          inst.fault = FAULT_TYPES[(rngFunc() * FAULT_TYPES.length) | 0];
        }
      }
    }
  };

  ns.Instruments.read = function(state, id) {
    var list = state.instruments.list;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        if (list[i].fault === 'dead') { return null; }
        return list[i].display !== null ? list[i].display : list[i].lastValue;
      }
    }
    return 0;
  };

  ns.Instruments.calibrate = function(state, id) {
    var list = state.instruments.list;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].calAge = 0;
        list[i].fault = null;
        list[i].driftOffset = 0;
        break;
      }
    }
  };

  ns.Instruments.injectFault = function(state, rngFunc) {
    var list = state.instruments.list;
    var idx = (rngFunc() * list.length) | 0;
    list[idx].fault = FAULT_TYPES[(rngFunc() * FAULT_TYPES.length) | 0];
    return list[idx].id;
  };
})(Systems);
