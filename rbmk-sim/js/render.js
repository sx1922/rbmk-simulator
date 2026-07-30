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
      if (T > 0) f = 0.5 + 0.5 * Math.min(1, (Math.log10(Math.max(10, T)) - 1) / 2);
      else f = 0.5 - 0.5 * Math.min(1, (Math.log10(Math.max(10, -T)) - 1) / 2);
      if (Math.abs(T) < 10) f = T > 0 ? 0.52 : 0.48;
    }
    drawDial('dial-period', f * 100, {
      min: 0, max: 100, majors: 8, unit: '\u0441',
      fmt: v => {
        const p = v / 100;
        if (Math.abs(p - 0.5) < 0.04) return '\u221E';
        if (p > 0.5) return '+' + Math.round(Math.pow(10, 1 + (p - 0.5) * 4));
        return '\u2212' + Math.round(Math.pow(10, 1 + (0.5 - p) * 4));
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

    const base = 1 * 3600 + 23 * 60 + 40;
    const t = base + RBMK.S.t;
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

  function frame() {
    drawPower(RBMK.S.n);
    drawPeriod(RBMK.S.period);
    drawCore();
    drawRods();
    drawRho();
    drawChart();
    drawClock();
  }

  return { frame, drawDial };
})();
