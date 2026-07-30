var UI = window.UI || {};

(function(ns) {
  ns.Panels = {};

  // Color constants
  var C = {
    BG: '#0a0a1a',
    PANEL: '#12122a',
    BORDER: '#2a2a4a',
    TEXT: '#c8c8d8',
    TEXT_DIM: '#6868a0',
    HIGHLIGHT: '#e94560',
    OK: '#22cc66',
    WARN: '#ccaa22',
    CRIT: '#cc4422',
    ROD_IN: '#44aa44',
    ROD_OUT: '#888888',
    BAR_BG: '#1a1a2e',
    WATER: '#2266aa',
    STEAM: '#aaaa66',
    FUEL: '#aa6622'
  };

  var FONT_SM = '9px monospace';
  var FONT_MD = '11px monospace';
  var FONT_LG = '13px monospace';
  var TABS_Y = 28;
  var CONTENT_Y = TABS_Y + 4;
  var CONTENT_H = 600 - TABS_Y - 36;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function bar(ctx, x, y, w, h, val, lo, hi, color) {
    var range = hi - lo || 1;
    var norm = clamp((val - lo) / range, 0, 1);
    ctx.fillStyle = C.BAR_BG;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color || C.HIGHLIGHT;
    ctx.fillRect(x, y, w * norm, h);
    ctx.strokeStyle = C.BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  function label(ctx, x, y, text) {
    ctx.fillStyle = C.TEXT_DIM;
    ctx.font = FONT_SM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  function value(ctx, x, y, text, color) {
    ctx.fillStyle = color || C.TEXT;
    ctx.font = FONT_MD;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
  }

  ns.Panels.drawReactor = function(ctx, state) {
    var x0 = 10, y0 = CONTENT_Y, w = 780;

    // Power bar
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, y0, w, 90);

    label(ctx, x0 + 8, y0 + 6, '反应堆功率');
    var pwr = (state.reactor && state.reactor.power) || 0;
    bar(ctx, x0 + 8, y0 + 20, w - 16, 22, pwr, 0, 5000, '#22aa66');
    value(ctx, x0 + w - 10, y0 + 6, pwr.toFixed(1) + ' MWt');

    // ORM
    var orm = (state.reactor && state.reactor.orm) || 0;
    bar(ctx, x0 + 8, y0 + 50, w - 16, 14, orm, -10, 10, orm < 0 ? C.CRIT : (orm < 2 ? C.WARN : C.OK));
    label(ctx, x0 + 8, y0 + 48, 'ORM: ' + orm.toFixed(2) + ' β');

    // Neutron flux
    var nf = (state.reactor && state.reactor.neutronFlux) || 0;
    bar(ctx, x0 + 8, y0 + 68, w - 16, 12, nf, 0, 150, '#44aacc');
    label(ctx, x0 + 8, y0 + 66, '中子通量: ' + nf.toFixed(1) + ' %');

    // Rod visualization
    var ry = y0 + 94;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, ry, w, 50);
    label(ctx, x0 + 8, ry + 4, '控制棒');
    var rodH = 30;
    var rodW = 30;
    var gap = 18;
    var rods = (state.reactor && state.reactor.rods) || [];
    var nRods = rods.length || 16;
    var startX2 = x0 + 20;
    for (var i = 0; i < nRods; i++) {
      var rx = startX2 + i * (rodW + gap);
      var rp = rods[i] || 0;
      var fillH = rodH * rp;
      ctx.fillStyle = C.BAR_BG;
      ctx.fillRect(rx, ry + 14, rodW, rodH);
      ctx.fillStyle = rp > 0.5 ? C.ROD_IN : C.ROD_OUT;
      ctx.fillRect(rx, ry + 14 + rodH - fillH, rodW, fillH);
      ctx.strokeStyle = C.BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry + 14, rodW, rodH);
    }

    // Key params
    var py = ry + 54;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, py, w, 40);
    var params = [
      { lbl: '压力', val: ((state.reactor && state.reactor.pressure) || 0).toFixed(2) + ' MPa', col: C.TEXT },
      { lbl: '温度', val: ((state.reactor && state.reactor.temp) || 0).toFixed(1) + ' °C', col: C.TEXT },
      { lbl: '水位', val: ((state.reactor && state.reactor.waterLevel) || 0).toFixed(1) + ' m', col: C.TEXT },
      { lbl: '流量', val: ((state.coolant && state.coolant.flow) || 0).toFixed(0) + ' m³/h', col: C.TEXT }
    ];
    var px = x0 + 10;
    for (var pi = 0; pi < params.length; pi++) {
      ctx.fillStyle = C.TEXT_DIM;
      ctx.font = FONT_SM;
      ctx.textAlign = 'left';
      ctx.fillText(params[pi].lbl, px, py + 4);
      ctx.fillStyle = params[pi].col;
      ctx.font = FONT_MD;
      ctx.fillText(params[pi].val, px, py + 18);
      px += 190;
    }
  };

  ns.Panels.drawThermal = function(ctx, state) {
    var x0 = 10, y0 = CONTENT_Y, gap = 4;
    var zW = 145;
    var zH = 460;
    var zones = (state.thermal && state.thermal.zones) || [];
    for (var i = 0; i < 5; i++) {
      var zx = x0 + i * (zW + gap);
      var z = zones[i] || { temp: 0, void: 0, dnbr: 2 };
      ctx.fillStyle = C.PANEL;
      ctx.fillRect(zx, y0, zW, zH);

      label(ctx, zx + 4, y0 + 4, '通道 ' + (i + 1));

      // Temp bar
      var temp = z.temp || 0;
      bar(ctx, zx + 4, y0 + 20, zW - 8, 70, temp, 0, 3000, temp > 2000 ? C.CRIT : (temp > 1500 ? C.WARN : '#cc6622'));
      value(ctx, zx + zW - 4, y0 + 20, temp.toFixed(0) + '°C');

      // Void bar
      var vd = z.void || 0;
      bar(ctx, zx + 4, y0 + 100, zW - 8, 50, vd, 0, 100, '#88aacc');
      value(ctx, zx + zW - 4, y0 + 100, vd.toFixed(1) + '%');
      label(ctx, zx + 4, y0 + 96, '汽泡份额');

      // DNBR
      var dnbr = z.dnbr || 2;
      bar(ctx, zx + 4, y0 + 160, zW - 8, 30, dnbr, 0, 5, dnbr < 1.05 ? C.CRIT : (dnbr < 1.2 ? C.WARN : C.OK));
      value(ctx, zx + zW - 4, y0 + 160, 'DNBR ' + dnbr.toFixed(2));

      // Extra params
      var ey = y0 + 200;
      var extra = [
        '流速: ' + ((z.flow || 0).toFixed(0)) + ' m/s',
        '压力: ' + ((z.pressure || 0).toFixed(2)) + ' MPa',
        '焓值: ' + ((z.enthalpy || 0).toFixed(0)) + ' kJ/kg',
        '密度: ' + ((z.density || 0).toFixed(1)) + ' kg/m³'
      ];
      for (var ei = 0; ei < extra.length; ei++) {
        ctx.fillStyle = C.TEXT_DIM;
        ctx.font = FONT_SM;
        ctx.textAlign = 'left';
        ctx.fillText(extra[ei], zx + 4, ey + ei * 14);
      }
    }
  };

  ns.Panels.drawTurbine = function(ctx, state) {
    var x0 = 10, y0 = CONTENT_Y, w = 780;
    var t = state.turbine || {};

    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, y0, w, 140);

    // Speed
    var speed = t.speed || 0;
    bar(ctx, x0 + 8, y0 + 20, w - 16, 30, speed, 0, 4000, '#44aacc');
    label(ctx, x0 + 8, y0 + 4, '转速');
    value(ctx, x0 + w - 10, y0 + 4, speed.toFixed(0) + ' rpm');
    var speedPct = (speed / 3000) * 100;
    value(ctx, x0 + w - 10, y0 + 20, speedPct.toFixed(1) + '%', speed > 3300 ? C.CRIT : C.TEXT);

    // Steam
    var sp = t.steamPressure || 0;
    bar(ctx, x0 + 8, y0 + 58, w - 16, 18, sp, 0, 8, '#aaaa66');
    label(ctx, x0 + 8, y0 + 54, '蒸汽压力: ' + sp.toFixed(2) + ' MPa');

    var sf = t.steamFlow || 0;
    bar(ctx, x0 + 8, y0 + 80, w - 16, 18, sf, 0, 6000, '#8888aa');
    label(ctx, x0 + 8, y0 + 78, '蒸汽流量: ' + sf.toFixed(0) + ' t/h');

    // Electric power
    var ep = t.electricPower || 0;
    bar(ctx, x0 + 8, y0 + 104, w - 16, 22, ep, 0, 1500, '#22cc66');
    label(ctx, x0 + 8, y0 + 100, '电功率: ' + ep.toFixed(1) + ' MW');

    // Bypass slider
    var bpy = y0 + 144;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, bpy, w, 40);
    label(ctx, x0 + 8, bpy + 4, '旁通阀');
    var bypass = t.bypass || 0;
    ctx.fillStyle = C.BAR_BG;
    ctx.fillRect(x0 + 80, bpy + 8, 300, 14);
    ctx.fillStyle = '#ccaa22';
    ctx.fillRect(x0 + 80, bpy + 8, 300 * bypass, 14);
    ctx.strokeStyle = C.BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 80, bpy + 8, 300, 14);
    value(ctx, x0 + w - 10, bpy + 4, (bypass * 100).toFixed(0) + '%');

    // Trip status
    var tripY = bpy + 44;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, tripY, w, 30);
    var tripped = t.tripped || false;
    ctx.fillStyle = tripped ? C.CRIT : C.OK;
    ctx.font = FONT_LG;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tripped ? '⚠ 跳闸' : '● 运行中', x0 + 10, tripY + 15);
    if (tripped) {
      ctx.fillStyle = C.TEXT_DIM;
      ctx.font = FONT_SM;
      ctx.fillText('转速下降中...', x0 + 120, tripY + 15);
    }
  };

  ns.Panels.drawInstruments = function(ctx, state) {
    var x0 = 8, y0 = CONTENT_Y, gap = 4;
    var cols = 5;
    var iW = (780 - gap * (cols - 1)) / cols;
    var iH = 134;
    var list = (state.instruments && state.instruments.list) || [];

    for (var i = 0; i < list.length; i++) {
      var col = i % cols;
      var row = (i / cols) | 0;
      var ix = x0 + col * (iW + gap);
      var iy = y0 + row * (iH + gap);
      var inst = list[i];

      ctx.fillStyle = inst.fault ? '#1a1020' : C.PANEL;
      ctx.fillRect(ix, iy, iW, iH);
      ctx.strokeStyle = inst.fault ? C.CRIT : C.BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(ix, iy, iW, iH);

      // Name
      ctx.fillStyle = C.TEXT_DIM;
      ctx.font = FONT_SM;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(inst.name || inst.id, ix + iW / 2, iy + 4);

      // Gauge area
      var gH = 60;
      var gY = iy + 18;
      var disp = inst.display !== null && inst.display !== undefined ? inst.display : 0;
      var norm = clamp((disp - inst.lo) / (inst.hi - inst.lo || 1), 0, 1);
      ctx.fillStyle = C.BAR_BG;
      ctx.fillRect(ix + 6, gY, iW - 12, gH);
      ctx.fillStyle = inst.fault === 'dead' ? '#444' : '#22aacc';
      ctx.fillRect(ix + 6, gY + gH - norm * gH, iW - 12, norm * gH);
      ctx.strokeStyle = C.BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(ix + 6, gY, iW - 12, gH);

      // Value
      ctx.fillStyle = inst.fault === 'dead' ? C.CRIT : C.TEXT;
      ctx.font = FONT_LG;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var valStr = inst.fault === 'dead' ? '---' : (disp !== null ? disp.toFixed(1) : '---');
      ctx.fillText(valStr, ix + iW / 2, gY + gH + 2);

      // Unit
      ctx.fillStyle = C.TEXT_DIM;
      ctx.font = FONT_SM;
      ctx.fillText(inst.unit, ix + iW / 2, gY + gH + 18);

      // Cal age
      ctx.fillStyle = C.TEXT_DIM;
      ctx.font = '7px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('校准: ' + (inst.calAge ? inst.calAge.toFixed(1) : '0') + 'h', ix + 4, iy + iH - 2);

      // Fault indicator
      if (inst.fault) {
        ctx.fillStyle = C.CRIT;
        ctx.font = '7px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('故障:' + inst.fault, ix + iW - 4, iy + iH - 2);
      }
    }
  };

  ns.Panels.drawMission = function(ctx, state) {
    var x0 = 10, y0 = CONTENT_Y, w = 780, h = CONTENT_H;
    var phases = state.mission && state.mission.phases;
    if (!phases) {
      ctx.fillStyle = C.PANEL;
      ctx.fillRect(x0, y0, w, h);
      label(ctx, x0 + 8, y0 + 8, '任务系统未初始化');
      return;
    }

    // Timeline
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, y0, w, 240);
    label(ctx, x0 + 8, y0 + 4, '任务时间线');

    var timelineY = y0 + 24;
    var tlH = 180;
    var tlW = w - 20;
    ctx.fillStyle = C.BAR_BG;
    ctx.fillRect(x0 + 10, timelineY, tlW, tlH);

    var nPhases = phases.length || 14;
    var segW = tlW / nPhases;
    for (var i = 0; i < nPhases; i++) {
      var ph = phases[i] || { status: 0, label: '' };
      var sx = x0 + 10 + i * segW;
      ctx.fillStyle = ph.status === 2 ? C.OK : (ph.status === 1 ? C.WARN : C.TEXT_DIM);
      ctx.fillRect(sx, timelineY + tlH - (ph.status === 2 ? 40 : (ph.status === 1 ? 20 : 10)), segW - 1, ph.status === 2 ? 40 : (ph.status === 1 ? 20 : 10));
      ctx.fillStyle = C.TEXT;
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(ph.label || (i + 1).toString(), sx + segW / 2, timelineY - 2);
    }

    // Phase labels below
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '7px monospace';
    for (var li = 0; li < nPhases; li++) {
      ctx.fillStyle = phases[li] && phases[li].status === 2 ? C.OK : C.TEXT_DIM;
      ctx.fillText((phases[li] && phases[li].status === 2 ? '✓' : (phases[li] && phases[li].status === 1 ? '◷' : '○')), x0 + 10 + li * segW + segW / 2, timelineY + tlH + 2);
    }

    // Decision buttons
    var btnY = y0 + 260;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, btnY, w, h - 260);

    var decisions = (state.mission && state.mission.decisions) || [];
    for (var di = 0; di < decisions.length; di++) {
      var dec = decisions[di];
      var dbx = x0 + 10 + di * 190;
      var dbw = 180;
      var dbh = 50;
      var isHover = state.mouseX >= dbx && state.mouseX <= dbx + dbw && state.mouseY >= btnY + 10 && state.mouseY <= btnY + 10 + dbh;
      ctx.fillStyle = isHover ? '#1a2a3a' : '#16213e';
      ctx.fillRect(dbx, btnY + 10, dbw, dbh);
      ctx.strokeStyle = dec.urgent ? C.CRIT : C.BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(dbx, btnY + 10, dbw, dbh);
      ctx.fillStyle = C.TEXT;
      ctx.font = FONT_SM;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dec.label || ('决策 ' + (di + 1)), dbx + dbw / 2, btnY + 35);
    }

    // Mission info
    var infoY = btnY + 70;
    ctx.fillStyle = C.TEXT_DIM;
    ctx.font = FONT_SM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var mi = state.mission;
    ctx.fillText('阶段: ' + ((mi && mi.phase) || 0) + '/' + nPhases, x0 + 10, infoY);
    ctx.fillText('时间: ' + ((mi && mi.time) || '00:00'), x0 + 10, infoY + 14);
    ctx.fillText('得分: ' + ((mi && mi.score) || 0), x0 + 10, infoY + 28);
    if (mi && mi.objective) {
      ctx.fillText('目标: ' + mi.objective, x0 + 10, infoY + 44);
    }
  };

  ns.Panels.drawOperations = function(ctx, state) {
    var x0 = 10, y0 = CONTENT_Y, w = 780;
    var ops = state.operations || {};

    // Money
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, y0, w, 50);
    label(ctx, x0 + 8, y0 + 4, '资金');
    var money = ops.money || 1000;
    bar(ctx, x0 + 8, y0 + 20, w - 16, 20, money, 0, 5000, money < 200 ? C.CRIT : C.OK);
    value(ctx, x0 + w - 10, y0 + 4, money.toFixed(0) + ' M₽');

    // Politics
    var polY = y0 + 54;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, polY, w, 50);
    label(ctx, x0 + 8, polY + 4, '政治支持');
    var pol = ops.politics || 50;
    bar(ctx, x0 + 8, polY + 20, w - 16, 20, pol, 0, 100, pol < 20 ? C.CRIT : (pol < 40 ? C.WARN : C.OK));
    value(ctx, x0 + w - 10, polY + 4, pol.toFixed(0) + '%');

    // Safety systems
    var safY = polY + 58;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, safY, w, 120);
    label(ctx, x0 + 8, safY + 4, '安全系统');
    var sys = ops.safetySystems || {};
    var sysList = [
      { id: 'ecs', name: '应急冷却 (ECS)', val: sys.ecs || 100 },
      { id: 'zht', name: '应急给水 (ZHT)', val: sys.zht || 100 },
      { id: 'prr', name: '泄压阀 (PRR)', val: sys.prr || 100 },
      { id: 'sr',  name: '停机棒 (SR)',   val: sys.sr || 100 },
      { id: 'ms',  name: '主蒸汽隔离',     val: sys.ms || 100 }
    ];
    for (var si = 0; si < sysList.length; si++) {
      var sy = safY + 20 + si * 18;
      ctx.fillStyle = C.TEXT_DIM;
      ctx.font = FONT_SM;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(sysList[si].name, x0 + 8, sy);
      var sval = sysList[si].val;
      ctx.fillStyle = sval < 30 ? C.CRIT : (sval < 60 ? C.WARN : C.OK);
      ctx.textAlign = 'right';
      ctx.fillText(sval.toFixed(0) + '%', x0 + w - 10, sy);
    }

    // Personnel
    var perY = safY + 124;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, perY, w, 120);
    label(ctx, x0 + 8, perY + 4, '人员');
    var personnel = ops.personnel || [];
    for (var pi = 0; pi < Math.min(personnel.length, 8); pi++) {
      var p = personnel[pi];
      var ppy = perY + 20 + pi * 13;
      ctx.fillStyle = p.status === 'dead' ? C.CRIT : (p.status === 'injured' ? C.WARN : C.TEXT_DIM);
      ctx.font = FONT_SM;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText((p.name || '操作员' + (pi + 1)) + ' - ' + (p.status || '正常'), x0 + 8, ppy);
      ctx.textAlign = 'right';
      ctx.fillText((p.radiation || 0).toFixed(1) + ' mSv', x0 + w - 10, ppy);
    }
  };

  ns.Panels.drawDuty = function(ctx, state) {
    var x0 = 10, y0 = CONTENT_Y, w = 780, h = CONTENT_H;
    var duty = state.duty || {};

    // Radiation
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, y0, w, 60);
    label(ctx, x0 + 8, y0 + 4, '辐射水平');
    var rad = duty.radiation || 0;
    bar(ctx, x0 + 8, y0 + 20, w - 16, 28, rad, 0, 1000, rad > 500 ? C.CRIT : (rad > 100 ? C.WARN : C.OK));
    value(ctx, x0 + w - 10, y0 + 4, rad.toFixed(2) + ' mSv');
    value(ctx, x0 + w - 10, y0 + 20, (rad > 100 ? '危险' : (rad > 20 ? '警告' : '安全')), rad > 100 ? C.CRIT : (rad > 20 ? C.WARN : C.OK));

    // Log viewer
    var logY = y0 + 64;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, logY, w, h - 64);
    label(ctx, x0 + 8, logY + 4, '运行日志');

    var logs = duty.logs || [];
    var startIdx = Math.max(0, logs.length - 10);
    for (var li = 0; li < 10; li++) {
      var idx = startIdx + li;
      var ly = logY + 20 + li * 18;
      ctx.fillStyle = C.TEXT_DIM;
      ctx.font = FONT_SM;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (idx < logs.length) {
        var entry = logs[idx];
        ctx.fillStyle = entry.level === 'error' ? C.CRIT : (entry.level === 'warn' ? C.WARN : C.TEXT_DIM);
        ctx.fillText((entry.time || '--:--') + ' ' + (entry.text || ''), x0 + 8, ly);
      } else {
        ctx.fillStyle = '#282848';
        ctx.fillText('~', x0 + 8, ly);
      }
    }

    // Quick actions at bottom
    var actionY = logY + h - 64 - 50;
    var actions = (duty.actions || ['测量辐射', '呼叫医疗', '通报上级']);
    for (var ai = 0; ai < actions.length; ai++) {
      var ax = x0 + 10 + ai * 200;
      var isHover = state.mouseX >= ax && state.mouseX <= ax + 180 && state.mouseY >= actionY && state.mouseY <= actionY + 32;
      ctx.fillStyle = isHover ? '#1a2a3a' : '#16213e';
      ctx.fillRect(ax, actionY, 180, 32);
      ctx.strokeStyle = C.BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(ax, actionY, 180, 32);
      ctx.fillStyle = C.TEXT;
      ctx.font = FONT_SM;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(actions[ai], ax + 90, actionY + 16);
    }
  };

  ns.Panels.drawOverview = function(ctx, state) {
    var x0 = 10, y0 = CONTENT_Y, w = 780, h = CONTENT_H;
    ctx.fillStyle = C.PANEL;
    ctx.fillRect(x0, y0, w, h);

    var items = [];
    var r = state.reactor || {};
    var t = state.turbine || {};
    var th = state.thermal || {};
    var d = state.duty || {};
    var op = state.operations || {};
    var m = state.mission || {};

    items.push({ l: '反应堆功率', v: (r.power || 0).toFixed(1) + ' / 5000 MWt', c: (r.power || 0) > 4000 ? C.CRIT : C.TEXT });
    items.push({ l: '中子通量', v: (r.neutronFlux || 0).toFixed(1) + ' %', c: (r.neutronFlux || 0) > 120 ? C.CRIT : C.TEXT });
    items.push({ l: 'ORM', v: (r.orm || 0).toFixed(2) + ' β', c: (r.orm || 0) < 0 ? C.CRIT : ((r.orm || 0) < 2 ? C.WARN : C.OK) });
    items.push({ l: '反应堆压力', v: (r.pressure || 0).toFixed(2) + ' MPa', c: (r.pressure || 0) > 8 ? C.CRIT : C.TEXT });
    items.push({ l: '控制棒', v: (r.rods ? r.rods.filter(function(v) { return v > 0.5; }).length : 0) + '/' + ((r.rods && r.rods.length) || 16) + ' 插入', c: C.TEXT });
    items.push({ l: '汽轮机转速', v: (t.speed || 0).toFixed(0) + ' rpm', c: (t.speed || 0) > 3300 ? C.CRIT : C.TEXT });
    items.push({ l: '电功率', v: (t.electricPower || 0).toFixed(1) + ' MW', c: C.TEXT });
    items.push({ l: '蒸汽压力', v: (t.steamPressure || 0).toFixed(2) + ' MPa', c: C.TEXT });
    items.push({ l: '辐射水平', v: (d.radiation || 0).toFixed(2) + ' mSv', c: (d.radiation || 0) > 100 ? C.CRIT : C.TEXT });
    items.push({ l: '资金', v: (op.money || 0).toFixed(0) + ' M₽', c: (op.money || 0) < 200 ? C.CRIT : C.OK });
    items.push({ l: '政治支持', v: (op.politics || 0).toFixed(0) + ' %', c: (op.politics || 0) < 20 ? C.CRIT : C.TEXT });
    items.push({ l: '任务阶段', v: ((m.phase || 0) + 1) + '/' + ((m.phases && m.phases.length) || 14), c: C.TEXT });
    items.push({ l: '任务得分', v: (m.score || 0).toFixed(0), c: C.TEXT });
    items.push({ l: '通道最高温', v: Math.max.apply(null, (th.zones || []).map(function(z) { return z.temp || 0; })).toFixed(0) + ' °C', c: C.TEXT });

    var iy = y0 + 8;
    var colW = 380;
    for (var ii = 0; ii < items.length; ii++) {
      var colIdx = ii < Math.ceil(items.length / 2) ? 0 : 1;
      var rowIdx = colIdx === 0 ? ii : (ii - Math.ceil(items.length / 2));
      var ox = x0 + 10 + colIdx * colW;
      var oy = iy + rowIdx * 26;

      ctx.fillStyle = C.TEXT_DIM;
      ctx.font = FONT_MD;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(items[ii].l + ':', ox, oy);
      ctx.fillStyle = items[ii].c;
      ctx.textAlign = 'right';
      ctx.fillText(items[ii].v, ox + colW - 10, oy);
    }

    // Status bar at bottom
    var sbY = y0 + h - 30;
    var alarmCount = 0;
    if (state.alarms) {
      for (var k in state.alarms) {
        if (state.alarms[k] && state.alarms.hasOwnProperty(k)) { alarmCount++; }
      }
    }
    ctx.fillStyle = alarmCount > 0 ? C.CRIT : C.OK;
    ctx.font = FONT_LG;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(alarmCount > 0 ? ('⚠ ' + alarmCount + ' 个报警') : '● 系统正常', x0 + w / 2, sbY + 10);
  };
})(UI);
