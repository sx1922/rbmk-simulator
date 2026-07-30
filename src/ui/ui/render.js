var UI = window.UI || {};

(function(ns) {
  ns.Render = {};

  var W = 800;
  var H = 600;

  var COLORS = {
    bg: '#0a0a1a',
    tabBar: '#0d0d22',
    tabInactive: '#16213e',
    tabActive: '#1a1a3e',
    tabText: '#6868a0',
    tabTextActive: '#e94560',
    botBar: '#0d0d22',
    botBtn: '#16213e',
    botBtnText: '#c8c8d8',
    border: '#2a2a4a',
    highlight: '#e94560',
    text: '#c8c8d8',
    dim: '#6868a0'
  };

  var TABS = [
    { id: 'reactor',    label: '反应堆' },
    { id: 'thermal',    label: '热工' },
    { id: 'turbine',    label: '汽轮机' },
    { id: 'instruments',label: '仪表' },
    { id: 'mission',    label: '任务' },
    { id: 'operations', label: '运营' },
    { id: 'duty',       label: '值班' },
    { id: 'overview',   label: '概况' }
  ];

  var TAB_H = 28;
  var BOT_H = 32;

  function drawIntro(ctx, state) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.highlight;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RBMK 模拟器', W / 2, H / 2 - 60);

    ctx.fillStyle = COLORS.dim;
    ctx.font = '14px monospace';
    ctx.fillText('切尔诺贝利核电站 仿真训练系统', W / 2, H / 2 - 20);

    ctx.fillStyle = COLORS.text;
    ctx.font = '12px monospace';
    ctx.fillText('按 ENTER 或 点击开始', W / 2, H / 2 + 40);

    ctx.fillStyle = COLORS.dim;
    ctx.font = '10px monospace';
    ctx.fillText('v1.0', W / 2, H / 2 + 80);

    if (state.mouseX >= W / 2 - 80 && state.mouseX <= W / 2 + 80 && state.mouseY >= H / 2 + 100 && state.mouseY <= H / 2 + 140) {
      ctx.fillStyle = '#1a2a3a';
    } else {
      ctx.fillStyle = '#16213e';
    }
    ctx.fillRect(W / 2 - 80, H / 2 + 100, 160, 40);
    ctx.strokeStyle = COLORS.highlight;
    ctx.lineWidth = 1;
    ctx.strokeRect(W / 2 - 80, H / 2 + 100, 160, 40);
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('开 始', W / 2, H / 2 + 120);
  }

  function drawGameOver(ctx, state) {
    ctx.fillStyle = '#0a0010';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#cc2200';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('游 戏 结 束', W / 2, H / 2 - 80);

    var msg = state.gameOverMessage || '反应堆事故导致严重辐射泄漏';
    ctx.fillStyle = COLORS.text;
    ctx.font = '13px monospace';
    ctx.fillText(msg, W / 2, H / 2 - 30);

    ctx.fillStyle = COLORS.dim;
    ctx.font = '11px monospace';
    ctx.fillText('任务得分: ' + ((state.mission && state.mission.score) || 0), W / 2, H / 2 + 10);

    var survival = state.survivalTime || 0;
    var mins = (survival / 60) | 0;
    var secs = (survival % 60) | 0;
    ctx.fillText('存活时间: ' + mins + '分 ' + secs + '秒', W / 2, H / 2 + 30);

    ctx.fillStyle = COLORS.text;
    ctx.font = '12px monospace';
    ctx.fillText('按 ENTER 重新开始', W / 2, H / 2 + 80);
  }

  function drawTabBar(ctx, state) {
    ctx.fillStyle = COLORS.tabBar;
    ctx.fillRect(0, 0, W, TAB_H);

    var tabW = (W / TABS.length) | 0;
    for (var i = 0; i < TABS.length; i++) {
      var tx = i * tabW;
      var active = state.tab === TABS[i].id;
      ctx.fillStyle = active ? COLORS.tabActive : COLORS.tabInactive;
      ctx.fillRect(tx, 2, tabW, TAB_H - 2);
      if (active) {
        ctx.fillStyle = COLORS.highlight;
        ctx.fillRect(tx, 0, tabW, 2);
      }
      ctx.fillStyle = active ? COLORS.tabTextActive : COLORS.tabText;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TABS[i].label, tx + tabW / 2, TAB_H / 2);
    }

    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, TAB_H);
  }

  function drawBottomBar(ctx, state) {
    var by = H - BOT_H;
    ctx.fillStyle = COLORS.botBar;
    ctx.fillRect(0, by, W, BOT_H);

    var btns = [];
    if (state.az5Available !== false) {
      btns.push({ label: 'AZ-5 停堆', id: 'az5', urgent: true });
    }
    btns.push({ label: '事件记录', id: 'log' });
    btns.push({ label: '保存', id: 'save' });
    btns.push({ label: '菜单', id: 'menu' });

    var btnGap = 8;
    var btnW = 120;
    var totalW = btns.length * btnW + (btns.length - 1) * btnGap;
    var startX = (W - totalW) / 2;

    for (var i = 0; i < btns.length; i++) {
      var bx = startX + i * (btnW + btnGap);
      var isHover = state.mouseX >= bx && state.mouseX <= bx + btnW && state.mouseY >= by && state.mouseY <= by + BOT_H;
      ctx.fillStyle = btns[i].urgent ? '#331111' : (isHover ? '#1a2a3a' : COLORS.botBtn);
      ctx.fillRect(bx, by + 2, btnW, BOT_H - 4);
      ctx.strokeStyle = btns[i].urgent ? COLORS.highlight : COLORS.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by + 2, btnW, BOT_H - 4);
      ctx.fillStyle = btns[i].urgent ? COLORS.highlight : COLORS.botBtnText;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btns[i].label, bx + btnW / 2, by + BOT_H / 2);
    }

    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, by, W, BOT_H);
  }

  function dispatchPanel(ctx, state) {
    var tab = state.tab || 'reactor';
    switch (tab) {
      case 'reactor':     ns.Panels.drawReactor(ctx, state); break;
      case 'thermal':     ns.Panels.drawThermal(ctx, state); break;
      case 'turbine':     ns.Panels.drawTurbine(ctx, state); break;
      case 'instruments': ns.Panels.drawInstruments(ctx, state); break;
      case 'mission':     ns.Panels.drawMission(ctx, state); break;
      case 'operations':  ns.Panels.drawOperations(ctx, state); break;
      case 'duty':        ns.Panels.drawDuty(ctx, state); break;
      case 'overview':    ns.Panels.drawOverview(ctx, state); break;
      default:            ns.Panels.drawReactor(ctx, state); break;
    }
  }

  ns.Render.draw = function(ctx, state, dt) {
    ctx.save();

    // Handle shake effect
    if (state.shakeTime && state.shakeTime > 0) {
      var intensity = state.shakeIntensity || 3;
      var sx = (Math.random() * 2 - 1) * intensity;
      var sy = (Math.random() * 2 - 1) * intensity;
      ctx.translate(sx, sy);
    }

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(-10, -10, W + 20, H + 20);

    if (state.screen === 'intro') {
      drawIntro(ctx, state);
    } else if (state.screen === 'gameover') {
      drawGameOver(ctx, state);
    } else {
      drawTabBar(ctx, state);
      dispatchPanel(ctx, state);
      drawBottomBar(ctx, state);

      // Dialogs overlay
      if (state.az5Pending) {
        ns.Dialogs.renderAz5Confirm(ctx, state);
      }
      if (state.pendingEvent) {
        ns.Dialogs.renderEventDialog(ctx, state);
      }
    }

    // Toast always on top
    ns.Dialogs.renderToast(ctx, state);

    // Flash effect
    if (state.flashTime && state.flashTime > 0) {
      ctx.fillStyle = 'rgba(255,255,200,' + (state.flashTime / 0.5 * 0.3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  };
})(UI);
