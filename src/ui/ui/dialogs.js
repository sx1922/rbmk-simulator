var UI = window.UI || {};

(function(ns) {
  ns.Dialogs = {};

  var W = 800;
  var H = 600;
  var COL_BG = 'rgba(0,0,0,0.7)';
  var COL_BOX = '#1a1a2e';
  var COL_BORDER = '#e94560';
  var COL_TEXT = '#eee';
  var COL_BTN = '#16213e';
  var COL_BTN_HOVER = '#0f3460';
  var COL_HIGHLIGHT = '#e94560';

  function drawButton(ctx, x, y, w, h, text, hover) {
    ctx.fillStyle = hover ? COL_BTN_HOVER : COL_BTN;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COL_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = COL_TEXT;
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
  }

  function drawBox(ctx, x, y, w, h, title) {
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COL_BOX;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COL_BORDER;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    if (title) {
      ctx.fillStyle = COL_HIGHLIGHT;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(title, W / 2, y + 10);
    }
  }

  ns.Dialogs.renderToast = function(ctx, state) {
    if (!state.toast || !state.toast.text) { return; }
    var elapsed = Date.now() - state.toast.time;
    if (elapsed > 3000) { return; }
    var alpha = 1;
    if (elapsed > 2500) {
      alpha = 1 - (elapsed - 2500) / 500;
    }
    ctx.save();
    ctx.globalAlpha = alpha;

    var tw = 400;
    var th = 30;
    var tx = (W - tw) / 2;
    var ty = H - 60;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = COL_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, th);

    ctx.fillStyle = COL_TEXT;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.toast.text, W / 2, ty + th / 2);

    ctx.restore();
  };

  ns.Dialogs.renderEventDialog = function(ctx, state) {
    var ev = state.pendingEvent;
    if (!ev) { return; }
    var bx = 100;
    var by = 80;
    var bw = 600;
    var bh = 440;

    drawBox(ctx, bx, by, bw, bh, '事件: ' + (ev.title || '未知事件'));

    ctx.fillStyle = COL_TEXT;
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    wrapText(ctx, ev.description || '', bx + 20, by + 40, bw - 40, 16);

    var btnY = by + bh - 60;
    var btnW = 150;
    var btnH = 36;
    var gap = 20;
    var totalW = ev.choices.length * btnW + (ev.choices.length - 1) * gap;
    var startX = (W - totalW) / 2;

    for (var i = 0; i < ev.choices.length; i++) {
      var cx = startX + i * (btnW + gap);
      var isHover = state.mouseX >= cx && state.mouseX <= cx + btnW && state.mouseY >= btnY && state.mouseY <= btnY + btnH;
      drawButton(ctx, cx, btnY, btnW, btnH, ev.choices[i].label || ('选项' + (i + 1)), isHover);
    }
  };

  ns.Dialogs.renderAz5Confirm = function(ctx, state) {
    if (!state.az5Pending) { return; }
    var bx = 150;
    var by = 150;
    var bw = 500;
    var bh = 250;

    drawBox(ctx, bx, by, bw, bh, 'AZ-5 紧急停堆确认');

    ctx.fillStyle = COL_TEXT;
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('按下 AZ-5 将触发紧急停堆 (SCRAM)', W / 2, by + 80);
    ctx.fillStyle = '#e94560';
    ctx.fillText('确定要继续吗？', W / 2, by + 110);

    var btnW = 160;
    var btnH = 40;
    var btnY2 = by + bh - 70;

    var yesHover = state.mouseX >= 220 && state.mouseX <= 380 && state.mouseY >= btnY2 && state.mouseY <= btnY2 + btnH;
    var noHover = state.mouseX >= 420 && state.mouseX <= 580 && state.mouseY >= btnY2 && state.mouseY <= btnY2 + btnH;

    drawButton(ctx, 220, btnY2, btnW, btnH, '确认 AZ-5', yesHover);
    drawButton(ctx, 420, btnY2, btnW, btnH, '取消', noHover);
  };

  function wrapText(ctx, text, x, y, maxW, lineH) {
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (ctx.measureText(line).width > maxW) {
        var words = line.split('');
        var cur = '';
        var ly = y;
        for (var j = 0; j < words.length; j++) {
          var test = cur + words[j];
          if (ctx.measureText(test).width > maxW && cur.length > 0) {
            ctx.fillText(cur, x, ly);
            ly += lineH;
            cur = words[j];
          } else {
            cur = test;
          }
        }
        if (cur.length > 0) {
          ctx.fillText(cur, x, ly);
          ly += lineH;
        }
        y = ly;
      } else {
        ctx.fillText(line, x, y);
        y += lineH;
      }
    }
  }
})(UI);
