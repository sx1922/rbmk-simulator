var UI = window.UI || {};

(function(ns) {
  ns.Charts = {};

  var FONT = '10px monospace';
  var PAD = 2;

  ns.Charts.drawTrend = function(ctx, data, color, lo, hi) {
    if (!data || data.length < 2) { return; }
    var w = ctx.canvas.width;
    var h = ctx.canvas.height;
    var range = hi - lo || 1;
    var steps = data.length;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    for (var i = 0; i < steps; i++) {
      var x = (i / (steps - 1)) * w;
      var norm = (data[i] - lo) / range;
      var y = h - PAD - norm * (h - PAD * 2);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.fillText((data[data.length - 1] | 0).toString(), 2, h - 2);
    ctx.restore();
  };

  ns.Charts.drawBar = function(ctx, val, lo, hi, color, label) {
    var w = ctx.canvas.width;
    var h = ctx.canvas.height;
    var range = hi - lo || 1;
    var norm = (val - lo) / range;
    norm = norm < 0 ? 0 : (norm > 1 ? 1 : norm);

    var barW = norm * (w - PAD * 2);
    var barH = h - PAD * 2;

    ctx.save();
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(PAD, PAD, w - PAD * 2, barH);

    ctx.fillStyle = color;
    ctx.fillRect(PAD, PAD, barW, barH);

    ctx.fillStyle = '#fff';
    ctx.font = FONT;
    ctx.textAlign = 'left';
    if (label) {
      ctx.fillText(label, PAD + 2, PAD + 10);
    }
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), w - PAD, PAD + 10);
    ctx.restore();
  };

  ns.Charts.drawGauge = function(ctx, val, lo, hi, warnLo, warnHi, color) {
    var w = ctx.canvas.width;
    var h = ctx.canvas.height;
    var range = hi - lo || 1;
    var norm = (val - lo) / range;
    norm = norm < 0 ? 0 : (norm > 1 ? 1 : norm);

    var gaugeW = w - PAD * 2;
    var gaugeH = h - PAD * 2;
    var fillH = norm * gaugeH;
    var fillY = h - PAD - fillH;

    ctx.save();

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(PAD, PAD, gaugeW, gaugeH);

    // Warning zones
    var warnLoNorm = (warnLo - lo) / range;
    var warnHiNorm = (warnHi - lo) / range;
    warnLoNorm = warnLoNorm < 0 ? 0 : (warnLoNorm > 1 ? 1 : warnLoNorm);
    warnHiNorm = warnHiNorm < 0 ? 0 : (warnHiNorm > 1 ? 1 : warnHiNorm);

    ctx.fillStyle = '#aa4400';
    var warnLoY = h - PAD - warnLoNorm * gaugeH;
    var warnHiY = h - PAD - warnHiNorm * gaugeH;
    ctx.fillRect(PAD, 0, gaugeW, warnHiY);
    ctx.fillRect(PAD, warnLoY, gaugeW, PAD + gaugeH - warnLoY);

    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(PAD, fillY, gaugeW, fillH);

    // Border
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD, PAD, gaugeW, gaugeH);

    // Value text
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(val.toFixed(1), w / 2, fillY - 2);

    ctx.restore();
  };
})(UI);
