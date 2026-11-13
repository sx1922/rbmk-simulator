const Render = (() => {

  const gt = id => document.getElementById(id);
  let chartBuf = [];
  const CHART_MAX = 280;

  function drawDial(canvas, value, opts) {
    if (typeof canvas === 'string') canvas = gt(canvas);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, R = W / 2 - 8;
    ctx.clearRect(0, 0, W, H);

    ctx.beginPath();
    ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#2e2c28';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - R * 0.1, cy - R * 0.1, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#faf8f2');
    g.addColorStop(1, '#e8e4d8');
    ctx.fillStyle = g;
    ctx.fill();

    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.083;
    const span = a1 - a0;

    if (opts.redFrom !== undefined) {
      const ar = a0 + span * opts.redFrom;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 4, ar, a1);
      ctx.arc(cx, cy, R - 16, a1, ar, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(194,36,16,0.18)';
      ctx.fill();
    }

    const nMajor = opts.majors || 8;
    ctx.strokeStyle = '#1c1a16';
    ctx.fillStyle = '#1c1a16';
    ctx.font = '700 ' + Math.round(R * 0.14) + 'px "PT Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= nMajor; i++) {
      const f = i / nMajor;
      const a = a0 + span * f;
      const cos = Math.cos(a), sin = Math.sin(a);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + cos * (R - 6), cy + sin * (R - 6));
      ctx.lineTo(cx + cos * (R - 20), cy + sin * (R - 20));
      ctx.stroke();
      const val = opts.min + (opts.max - opts.min) * f;
      ctx.fillText(opts.fmt ? opts.fmt(val) : Math.round(val),
        cx + cos * (R - 34), cy + sin * (R - 34));
      if (i < nMajor) {
        ctx.lineWidth = 1;
        for (let j = 1; j < 5; j++) {
          const a2 = a0 + span * (f + j / (nMajor * 5));
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a2) * (R - 6), cy + Math.sin(a2) * (R - 6));
          ctx.lineTo(cx + Math.cos(a2) * (R - 13), cy + Math.sin(a2) * (R - 13));
          ctx.stroke();
        }
      }
    }

    if (opts.unit) {
      ctx.font = '700 ' + Math.round(R * 0.11) + 'px "PT Sans", sans-serif';
      ctx.fillStyle = '#5c574a';
      ctx.fillText(opts.unit, cx, cy + R * 0.42);
    }

    const f = Math.max(0, Math.min(1, (value - opts.min) / (opts.max - opts.min)));
    const a = a0 + span * f;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#c22410';
    ctx.beginPath();
    ctx.moveTo(R - 18, 0);
    ctx.lineTo(-R * 0.18, -3.5);
    ctx.lineTo(-R * 0.18, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3;
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1a16';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#8a8474';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx - R * 0.25, cy - R * 0.35, R * 0.55, R * 0.3, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
  }

  function drawPower(n) {
    drawDial('dial-power', n * 100, {
      min: 0, max: 120, majors: 12, unit: '% N\u043D\u043E\u043C', redFrom: 110 / 120,
    });
    gt('read-power').textContent = Math.round(n * RBMK.N_NOM);
  }

  function drawPeriod(T) {
    let f = 0.5;
    if (isFinite(T)) {
      const a = Math.abs(T);
      if (a <= 10) f = T >= 0 ? 0.5 + 0.045 * (a / 10) : 0.5 - 0.045 * (a / 10);
      else if (a <= 1000) {
        const l = (Math.log10(a) - 1) / 2;
        f = T > 0 ? 0.5 + 0.045 + 0.455 * l : 0.5 - 0.045 - 0.455 * l;
      } else f = 0.5;
    }
    drawDial('dial-period', f * 100, {
      min: 0, max: 100, majors: 8, unit: '\u0441',
      fmt: v => {
        const p = v / 100;
        if (Math.abs(p - 0.5) < 0.045) return '\u221E';
        if (p > 0.5) return '+' + Math.round(Math.pow(10, 1 + (p - 0.545) / 0.455 * 2));
        return '\u2212' + Math.round(Math.pow(10, 1 + (0.545 - p) / 0.455 * 2));
      },
    });
    gt('read-period').textContent =
      !isFinite(T) ? '\u221E' : (T > 0 ? '+' : '') + T.toFixed(1);
    gt('read-period').style.color =
      (isFinite(T) && T > 0 && T < 10) ? '#c22410' : '';
  }

  function drawCore() {
    const cv = gt('core-canvas');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = RBMK.S;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1e1c18';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const top = 30, bot = H - 40;
    const coreH = bot - top;
    const coreW = 120;

    ctx.fillStyle = '#3a3830';
    ctx.fillRect(cx - coreW / 2 - 14, top - 10, coreW + 28, coreH + 20);
    ctx.strokeStyle = '#4a4840';
    ctx.strokeRect(cx - coreW / 2 - 14, top - 10, coreW + 28, coreH + 20);

    const amp = Math.min(1, S.n * 1.2);
    ctx.beginPath();
    for (let y = 0; y <= coreH; y += 2) {
      const x = Math.sin(Math.PI * y / coreH) * amp;
      const px = cx - coreW / 2 + x * coreW * 0.42;
      if (y === 0) ctx.moveTo(px, top + y);
      else ctx.lineTo(px, top + y);
    }
    for (let y = coreH; y >= 0; y -= 2) {
      const x = Math.sin(Math.PI * y / coreH) * amp;
      const px = cx + coreW / 2 - x * coreW * 0.42;
      ctx.lineTo(px, top + y);
    }
    ctx.closePath();
    const heat = ctx.createLinearGradient(0, top, 0, bot);
    heat.addColorStop(0, 'rgba(80,60,20,0.5)');
    heat.addColorStop(0.5, S.n > 1.1 ? 'rgba(224,80,20,0.95)' : 'rgba(232,164,24,0.85)');
    heat.addColorStop(1, 'rgba(80,60,20,0.5)');
    ctx.fillStyle = heat;
    ctx.fill();

    const rodX = [cx - 45, cx - 22, cx, cx + 22, cx + 45];
    const rodLen = coreH * 0.75;
    const absorber = rodLen * 0.55;
    const displacer = rodLen * 0.35;
    rodX.forEach((x, i) => {
      const rodBottom = top + coreH * (1 - S.rodPos / 100) + 20;
      const y0 = Math.max(top - 15, rodBottom - rodLen);
      ctx.strokeStyle = 'rgba(90,140,200,0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, y0 + rodLen);
      ctx.lineTo(x, Math.min(bot + 10, y0 + rodLen + 25));
      ctx.stroke();
      ctx.strokeStyle = '#8a8878';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, y0 + absorber);
      ctx.lineTo(x, y0 + absorber + displacer);
      ctx.stroke();
      ctx.strokeStyle = '#1c1a16';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + absorber);
      ctx.stroke();
      ctx.fillStyle = '#5c574a';
      ctx.fillRect(x - 5, y0 - 4, 10, 4);
    });

    ctx.fillStyle = '#8a8474';
    ctx.font = '10px "PT Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('\u0412\u0412\u0415\u0420\u0425 \u2191 \u4E0A', 8, 18);
    ctx.fillText('\u0412\u041D\u0418\u0417 \u2193 \u4E0B', 8, H - 12);

    gt('read-opr').textContent = S.opr;
    gt('read-opr').className = S.opr < RBMK.OPR_LIMIT ? 'danger' : '';
    gt('read-xe').textContent = S.xe.toFixed(2);
    gt('read-alpha').textContent = Math.round(S.voidFrac);
  }

  function drawRods() {
    const cv = gt('rods-canvas');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = RBMK.S;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1e1c18';
    ctx.fillRect(0, 0, W, H);

    const groups = 7;
    const gw = (W - 40) / groups;
    for (let i = 0; i < groups; i++) {
      const x = 20 + i * gw + gw / 2;
      ctx.fillStyle = '#2e2c26';
      ctx.fillRect(x - 8, 20, 16, H - 60);
      const offset = Math.sin(i * 1.7) * 6;
      const pos = Math.max(0, Math.min(100, S.rodPos + offset));
      const rodH = (H - 60) * (1 - pos / 100);
      ctx.fillStyle = S.scramming ? '#c22410' : '#8a8878';
      ctx.fillRect(x - 5, 20, 10, rodH);
      ctx.fillStyle = '#1c1a16';
      ctx.fillRect(x - 5, 20 + rodH, 10, 8);
      ctx.fillStyle = '#8a8474';
      ctx.font = '9px "PT Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), x, H - 28);
    }

    ctx.strokeStyle = '#5c574a';
    ctx.beginPath();
    ctx.moveTo(10, 20); ctx.lineTo(10, H - 40);
    ctx.stroke();
    ctx.fillStyle = '#8a8474';
    ctx.textAlign = 'left';
    for (let p = 0; p <= 100; p += 25) {
      const y = 20 + (H - 60) * (1 - p / 100);
      ctx.beginPath();
      ctx.moveTo(6, y); ctx.lineTo(14, y);
      ctx.stroke();
      ctx.fillText(p + '', 16, y + 3);
    }

    gt('read-rod-avg').textContent = Math.round(S.rodPos);
    const moving = Math.abs(S.rodTarget - S.rodPos) > 0.5;
    gt('read-rod-up').textContent = (moving && S.rodTarget > S.rodPos) ? '\u25B2' : '0';
    gt('read-rod-down').textContent = (moving && S.rodTarget < S.rodPos) || S.scramming ? '\u25BC' : '0';
  }

  function drawRho() {
    const cv = gt('rho-canvas');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = RBMK.S;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e6e0d0';
    ctx.fillRect(0, 0, W, H);

    const comps = [
      ['\u0421\u0422\u0415\u0420\u0416\u041D\u0418 \u68D2', S.rhoComponents.rod, '#4a463a'],
      ['\u041A\u041E\u041D\u0426. \u7AEF\u90E8', S.rhoComponents.tip, '#c22410'],
      ['\u03B1 \u7A7A\u6CE1', S.rhoComponents.void, '#1a4a9a'],
      ['Xe \u6C27', S.rhoComponents.xe, '#6a2a8a'],
      ['T \u591A\u666E\u52D2', S.rhoComponents.doppler, '#2e7a4a'],
    ];
    const rowH = 22, y0 = 12, barW = W - 130, x0 = 100;

    comps.forEach(([label, val, color], i) => {
      const y = y0 + i * rowH;
      ctx.fillStyle = '#4a463a';
      ctx.font = '9px "PT Sans"';
      ctx.textAlign = 'right';
      ctx.fillText(label, x0 - 8, y + 10);
      ctx.strokeStyle = '#b8b2a0';
      ctx.beginPath();
      ctx.moveTo(x0 + barW / 2, y);
      ctx.lineTo(x0 + barW / 2, y + 14);
      ctx.stroke();
      const w = Math.max(-barW / 2, Math.min(barW / 2, val * 400));
      ctx.fillStyle = color;
      ctx.fillRect(x0 + barW / 2, y + 2, w, 10);
      ctx.fillStyle = '#5c574a';
      ctx.font = '8px "PT Mono"';
      ctx.textAlign = 'left';
      ctx.fillText((val >= 0 ? '+' : '') + val.toFixed(3), x0 + barW + 6, y + 10);
    });

    const yT = y0 + comps.length * rowH + 6;
    ctx.fillStyle = '#1c1a16';
    ctx.font = '700 11px "PT Sans"';
    ctx.textAlign = 'right';
    ctx.fillText('\u03A3\u03C1', x0 - 8, yT + 4);
    ctx.font = '700 12px "PT Mono"';
    ctx.textAlign = 'left';
    ctx.fillStyle = S.rho > 0.1 ? '#c22410' : '#1c1a16';
    ctx.fillText((S.rho >= 0 ? '+' : '') + S.rho.toFixed(3) + ' ', x0 + 4, yT + 4);
  }

  function drawChart() {
    const cv = gt('chart-canvas');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = RBMK.S;

    chartBuf.push({ n: S.n, T: S.period, xe: S.xe, rho: S.rho });
    if (chartBuf.length > CHART_MAX) chartBuf.shift();

    ctx.fillStyle = '#f2ecd8';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(168,140,100,0.25)';
    ctx.lineWidth = 1;
    for (let x = W; x > 0; x -= 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const drawLine = (get, color, map) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      chartBuf.forEach((d, i) => {
        const x = W - (chartBuf.length - i);
        const y = map(get(d));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine(d => d.n, '#b02010', v => H - 8 - Math.min(1.2, v) / 1.2 * (H - 16));
    drawLine(d => d.xe, '#6a2a8a', v => H - 8 - Math.min(2, v) / 2 * (H - 16));
    drawLine(d => d.rho, '#1a1a1a', v => H / 2 - Math.max(-0.5, Math.min(0.5, v)) * (H * 0.8));
    drawLine(d => d.T, '#1a4a9a', v => {
      if (!isFinite(v)) return H * 0.3;
      const lv = Math.sign(v) * Math.log10(Math.max(1, Math.abs(v)));
      return H / 2 - lv / 3 * (H * 0.7);
    });

    ctx.fillStyle = '#5c574a';
    ctx.fillRect(0, 0, 6, H);
  }

  function drawClock() {
    const cv = gt('clock-canvas');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, R = W / 2 - 6;
    ctx.clearRect(0, 0, W, H);

    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#2e2c28';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#f4f2ea';
    ctx.fill();

    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      ctx.strokeStyle = '#1c1a16';
      ctx.lineWidth = major ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
      ctx.lineTo(cx + Math.cos(a) * (R - (major ? 14 : 8)), cy + Math.sin(a) * (R - (major ? 14 : 8)));
      ctx.stroke();
    }

    const endlessHud = (window.Endless && Endless.getHud) ? Endless.getHud() : null;
    const t = endlessHud ? RBMK.S.t : (1 * 3600 + 23 * 60 + 40) + RBMK.S.t;
    const hh = (t / 3600) % 24, mm = (t / 60) % 60, ss = t % 60;

    const hand = (frac, len, w, color) => {
      const a = frac * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    };
    hand((hh % 12) / 12 + mm / 720, R * 0.5, 4, '#1c1a16');
    hand(mm / 60 + ss / 3600, R * 0.72, 3, '#1c1a16');
    hand(ss / 60, R * 0.8, 1.2, '#c22410');

    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#c22410';
    ctx.fill();

    const pad = n => String(Math.floor(n)).padStart(2, '0');
    gt('read-simtime').textContent = pad(hh) + ':' + pad(mm) + ':' + pad(ss);
  }

  // ==================== 新增仪表渲染 ====================

  function drawQuadrants() {
    const cv = gt('canvas-quadrants');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = RBMK.S;
    ctx.clearRect(0, 0, W, H);
    const qw = (W - 24) / 2, qh = (H - 24) / 2;
    const R = Math.min(qw, qh) / 2 - 4;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.083, span = a1 - a0;
    for (let i = 0; i < 4; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const cx = 10 + col * (qw + 4) + qw / 2;
      const cy = 10 + row * (qh + 4) + qh / 2;
      // 外框
      ctx.beginPath();
      ctx.arc(cx, cy, R + 5, 0, Math.PI * 2);
      ctx.fillStyle = '#2e2c28';
      ctx.fill();
      // 表盘面：径向渐变
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx - R * 0.1, cy - R * 0.1, R * 0.1, cx, cy, R);
      g.addColorStop(0, '#faf8f2');
      g.addColorStop(1, '#e8e4d8');
      ctx.fillStyle = g;
      ctx.fill();
      // 红区 > 900 MW
      ctx.beginPath();
      ctx.arc(cx, cy, R - 4, a0 + span * 0.9, a1);
      ctx.arc(cx, cy, R - 14, a1, a0 + span * 0.9, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(194,36,16,0.18)';
      ctx.fill();
      // 主刻度
      ctx.strokeStyle = '#1c1a16';
      ctx.fillStyle = '#1c1a16';
      ctx.font = '700 ' + Math.round(R * 0.14) + 'px "PT Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let t = 0; t <= 4; t++) {
        const f = t / 4;
        const a = a0 + span * f;
        const cos = Math.cos(a), sin = Math.sin(a);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + cos * (R - 4), cy + sin * (R - 4));
        ctx.lineTo(cx + cos * (R - 14), cy + sin * (R - 14));
        ctx.stroke();
        ctx.fillText(String(t * 250), cx + cos * (R - 24), cy + sin * (R - 24));
        // 小刻度
        if (t < 4) {
          ctx.lineWidth = 1;
          for (let j = 1; j < 5; j++) {
            const a2 = a0 + span * (f + j / 20);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a2) * (R - 4), cy + Math.sin(a2) * (R - 4));
            ctx.lineTo(cx + Math.cos(a2) * (R - 10), cy + Math.sin(a2) * (R - 10));
            ctx.stroke();
          }
        }
      }
      // 单位标签
      ctx.font = '700 ' + Math.round(R * 0.11) + 'px "PT Sans", sans-serif';
      ctx.fillStyle = '#5c574a';
      ctx.fillText('MW', cx, cy + R * 0.42);
      // 指针
      const p = Math.max(0, Math.min(1, S.quadrant_power[i] / 1000));
      const a = a0 + span * p;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#c22410';
      ctx.beginPath();
      ctx.moveTo(R - 14, 0);
      ctx.lineTo(-R * 0.18, -3);
      ctx.lineTo(-R * 0.18, 3);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 3;
      ctx.restore();
      // 中心圆
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#1c1a16';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#8a8474';
      ctx.fill();
      // 玻璃反光
      ctx.beginPath();
      ctx.ellipse(cx - R * 0.25, cy - R * 0.35, R * 0.55, R * 0.3, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fill();
      // Q 标签
      ctx.fillStyle = '#5c574a';
      ctx.font = '8px "PT Sans"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Q' + (i + 1), cx, cy - R + 2);
    }
  }

  function drawSepLevel() {
    const cv = gt('canvas-sep-level');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = RBMK.S;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#2e2c28';
    ctx.fillRect(0, 0, W, H);
    const barW = 24, barX = (W - barW) / 2;
    const barH = H - 30, barY = 6;
    ctx.fillStyle = '#1a1a16';
    ctx.fillRect(barX, barY, barW, barH);
    const level = Math.max(0, Math.min(2.0, S.separator_level));
    const fillH = (level / 2.0) * barH;
    if (level < 0.3) {
      ctx.fillStyle = (Math.floor(Date.now() / 200) % 2) ? '#c22410' : '#1a4a9a';
    } else if (level < 0.5) {
      ctx.fillStyle = '#d4a020';
    } else {
      ctx.fillStyle = '#1a4a9a';
    }
    ctx.fillRect(barX, barY + barH - fillH, barW, fillH);
    ctx.strokeStyle = '#5c574a';
    ctx.strokeRect(barX, barY, barW, barH);
    for (const m of [0.3, 0.5, 0.8, 1.2, 1.5]) {
      const y = barY + barH - (m / 2.0) * barH;
      ctx.strokeStyle = m < 0.5 ? '#c22410' : (m > 1.5 ? '#d4a020' : '#5c574a');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barX - 4, y); ctx.lineTo(barX + barW + 4, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#8a8474';
    ctx.font = '9px "PT Mono"';
    ctx.textAlign = 'center';
    ctx.fillText(level.toFixed(2) + ' m', W / 2, H - 6);
  }

  function drawRodDrive() {
    const cv = gt('canvas-rod-drive');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = RBMK.S;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1e1c18';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8a8474';
    ctx.font = '9px "PT Mono"';
    ctx.textAlign = 'left';
    ctx.fillText('\u0412 \u0434\u0432\u0438\u0436: ' + S.active_rod_drives + '/40', 6, 14);
    if (S.rod_drive_overheat) {
      ctx.fillStyle = '#c22410';
      ctx.fillText('\u041F\u0415\u0420\u0415\u0413\u0420\u0415\u0412! \u8FC7\u70ED!', 6, 28);
    }
    const temp = Math.max(0, Math.min(100, S.rod_drive_temp));
    const barW = W - 12, barH = 8;
    const barY = 36;
    ctx.fillStyle = '#2a2822';
    ctx.fillRect(6, barY, barW, barH);
    const color = temp > 80 ? '#c22410' : (temp > 60 ? '#d4a020' : '#4a8a4a');
    ctx.fillStyle = color;
    ctx.fillRect(6, barY, barW * (temp / 100), barH);
    ctx.fillStyle = '#8a8474';
    ctx.font = '8px "PT Mono"';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(temp) + '\u00B0C', W / 2, barY + barH + 12);
  }

  function drawRecorder() {
    const cv = gt('canvas-recorder');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = RBMK.S;
    if (!cv._recorderBuf) {
      cv._recorderBuf = document.createElement('canvas');
      cv._recorderBuf.width = W * 2;
      cv._recorderBuf.height = H;
      cv._recorderX = 0;
    }
    const buf = cv._recorderBuf;
    const bctx = buf.getContext('2d');
    // 左移纸带
    if (cv._recorderX >= W - 1) {
      bctx.drawImage(buf, 1, 0, W - 1, H, 0, 0, W - 1, H);
      cv._recorderX = W - 1;
    } else {
      cv._recorderX++;
    }
    // 画新点
    const pNorm = Math.max(0, Math.min(1, S.n));
    const yPower = H - 4 - pNorm * (H - 8);
    bctx.fillStyle = '#b02010';
    bctx.fillRect(cv._recorderX, yPower, 1, 1);
    // 周期笔
    if (isFinite(S.period) && S.period > 0) {
      const tNorm = Math.min(1, Math.log10(S.period) / 3);
      const yPeriod = H - 4 - tNorm * (H - 8);
      bctx.fillStyle = '#1c1a16';
      bctx.fillRect(cv._recorderX, yPeriod, 1, 1);
    }
    // 渲染到屏幕
    bctx.fillStyle = 'rgba(242,236,216,0.01)';
    bctx.fillRect(cv._recorderX, 0, 1, H);
    ctx.drawImage(buf, 0, 0, W, H, 0, 0, W, H);
    ctx.strokeStyle = '#5c574a';
    ctx.strokeRect(0, 0, W, H);
  }

  function drawNewLamps() {
    const bank = gt('lamp-bank-new');
    if (!bank) return;
    const S = RBMK.S;
    const lamps = [
      { id: 'SEP_LO', label: '\u6C34\u4F4D\u4F4E', condition: S.separator_level < 0.5, color: '#d4a020' },
      { id: 'SEP_HI', label: '\u6C34\u4F4D\u9AD8', condition: S.separator_level > 1.5, color: '#d4a020' },
      { id: 'FW_COLD', label: '\u7ED9\u6C34\u4F4E\u6E29', condition: S.feedwater_temp < 100, color: '#e8d040' },
      { id: 'CLAD', label: '\u5305\u58F3\u635F\u4F24', condition: S.clad_integrity < 0.8, color: '#c22410' },
      { id: 'PERIOD_W', label: '\u5468\u671F\u8B66\u544A', condition: S.reactor_period > 0 && S.reactor_period < 80 && S.reactor_period > 20, color: '#e8d040' },
      { id: 'PERIOD_C', label: '\u5468\u671F\u5371\u9669', condition: S.reactor_period > 0 && S.reactor_period < 20, color: '#c22410' },
      { id: 'DECAY', label: '\u8870\u53D8\u70ED', condition: S.decay_heat_power > 50 && S.flow < 50, color: '#d4a020' },
      { id: 'RAD', label: '\u8F90\u5C04\u5347\u9AD8', condition: S.containment_dose_rate > 1, color: '#c22410' },
    ];
    lamps.forEach(function(lamp) {
      const el = bank.querySelector('[data-lamp="' + lamp.id + '"]');
      if (!el) return;
      const bulb = el.querySelector('.lamp');
      if (!bulb) return;
      const on = lamp.condition;
      if (on) {
        bulb.style.background = lamp.color;
        bulb.style.boxShadow = '0 0 6px ' + lamp.color;
        bulb.style.animation = (Date.now() % 1000 < 500) ? 'none' : '';
      } else {
        bulb.style.background = '#2a2822';
        bulb.style.boxShadow = 'none';
      }
    });
  }

  function drawKvit() {
    const btn = gt('btn-kvit');
    if (!btn) return;
    // 按钮状态由 CSS 处理，这里只触发反馈
  }

  function drawDecayHeat() {
    // handled in updateUI
  }

  function drawRadiation() {
    // handled in updateUI
  }

  function drawClad() {
    // handled in updateUI
  }

  function frame() {
    drawPower(RBMK.S.n);
    drawPeriod(RBMK.S.period);
    drawCore();
    drawRods();
    drawRho();
    drawChart();
    drawClock();
    drawQuadrants();
    drawSepLevel();
    drawRodDrive();
    drawRecorder();
    drawNewLamps();
    drawKvit();
    drawDecayHeat();
    drawRadiation();
    drawClad();
  }

  return { frame, drawDial };
})();
