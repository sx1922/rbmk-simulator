/* Tutorial — 第一幕道具教学引导
   启动：App.startGame (story 模式) → Tutorial.start(ctx)
   停止：backToMenu / 跳过按钮 / 完成 */

(function() {
  'use strict';

  var box = null;
  var stepEl = null;
  var msgEl = null;
  var closeBtn = null;
  var ring = null;
  var idx = -1;
  var ctx = null;
  var checkTimer = null;
  var advancing = false;

  var STEPS = [
    {
      target: '[data-prop="manual"]',
      openSel: '#manual-overlay',
      msg: '\u4ECE\u8FD0\u884C\u89C4\u7A0B\u624B\u518C\u5F00\u59CB\u3002' +
        '\u5B83\u6536\u5F55\u4E86\u673A\u7EC4\u53C2\u6570\u3001\u64CD\u4F5C\u89C4\u7A0B\u548C\u4FDD\u62A4\u5B9A\u503C\u3002' +
        '<br>\u503C\u73ED\u65F6\u9047\u5230\u62FF\u4E0D\u51C6\u7684\u5730\u65B9\uFF0C\u7FFB\u5B83\u3002' +
        '<br><i>\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u0441 \u0440\u0435\u0433\u043B\u0430\u043C\u0435\u043D\u0442\u0430 \u2014 \u0432 \u043D\u0451\u043C \u0432\u0441\u0435 \u043D\u043E\u0440\u043C\u044B \u0438 \u0440\u0435\u0436\u0438\u043C\u044B.</i>' +
        '<br><b>\u2460 \u70B9\u51FB\u6253\u5F00 \u2192 \u2461 \u7FFB\u9605\u5185\u5BB9 \u2192 \u2462 \u70B9\u300C\u2715 \u653E\u56DE\u300D\u6216\u6309 Esc \u5173\u95ED</b>',
    },
    {
      target: '[data-prop="clipboard"]',
      openSel: '#prop-overlay',
      msg: '\u8FD9\u662F\u503C\u73ED\u65E5\u5FD7\u3002\u6BCF\u73ED\u5F00\u59CB\u548C\u7ED3\u675F\u90FD\u8981\u8BB0\u5F55\u673A\u7EC4\u72B6\u6001\u3001\u529F\u7387\u548C\u4EA4\u63A5\u4E8B\u9879\u3002' +
        '<br>\u6362\u73ED\u65F6\u4E0A\u7EA7\u4F1A\u6765\u62BD\u67E5\uFF0C\u586B\u5199\u4E0D\u5B8C\u6574\u4F1A\u88AB\u8BB0\u8FC7\u3002' +
        '<br><i>\u0416\u0443\u0440\u043D\u0430\u043B \u0432\u0430\u0445\u0442\u044B \u2014 \u043F\u043B\u0430\u043D\u043E\u0432\u044B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B.</i>' +
        '<br><b>\u2460 \u6253\u5F00\u67E5\u770B\u683C\u5F0F \u2192 \u2462 \u70B9\u300C\u2715 \u653E\u56DE\u300D\u6216\u6309 Esc \u5173\u95ED</b>',
    },
    {
      target: '[data-prop="calculator"]',
      openSel: '#prop-overlay',
      msg: '\u8BA1\u7B97\u5668\uff08\u041C\u041A-61\uff09\u7528\u6765\u5FEB\u901F\u6838\u7B97\u529F\u7387\u88D5\u5EA6\u3001\u63A7\u5236\u68D2\u4F59\u91CF\u7B49\u53C2\u6570\u3002' +
        '<br>\u9700\u8981\u7CBE\u786E\u8BA1\u7B97\u65F6\u62FF\u51FA\u6765\u7528\uFF0C\u907F\u514D\u5FC3\u7B97\u51FA\u9519\u3002' +
        '<br><i>\u041C\u041A-61 \u2014 \u0434\u043B\u044F \u0442\u043E\u0447\u043D\u044B\u0445 \u0440\u0430\u0441\u0447\u0451\u0442\u043E\u0432 \u0437\u0430\u043F\u0430\u0441\u0430 \u0440\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438.</i>' +
        '<br><b>\u2460 \u6253\u5F00\u770B\u770B\u952E\u4F4D \u2192 \u2462 \u70B9\u300C\u2715 \u653E\u56DE\u300D\u5173\u95ED</b>',
    },
    {
      target: '[data-prop="dosimeter"]',
      openSel: '#prop-overlay',
      msg: '\u5242\u91CF\u8BA1\uff08\u0414\u041F-5\u0412\uff09\u6D4B\u91CF\u63A7\u5236\u5BA4\u4E0E\u5806\u82AF\u9644\u8FD1\u7684\u8F90\u5C04\u6C34\u5E73\u3002' +
        '<br>\u8BFB\u6570\u5347\u9AD8\u8BF4\u660E\u5C4F\u969C\u51FA\u73B0\u95EE\u9898\u3002\u542C\u5B83\u7684\u5494\u5618\u58F0\u2014\u2014\u8D8A\u5BC6\u8D8A\u5371\u9669\u3002' +
        '<br><i>\u0414\u041F-5\u0412: \u0441\u0442\u0443\u043A \u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430 \u0447\u0430\u0449\u0435 \u2014 \u0440\u0430\u0434\u0438\u0430\u0446\u0438\u044F \u0432\u044B\u0448\u0435.</i>' +
        '<br><b>\u2460 \u6253\u5F00\u542C\u542C\u58F0\u97F3 \u2192 \u2462 \u70B9\u300C\u2715 \u653E\u56DE\u300D\u5173\u95ED</b>',
    },
    {
      target: '[data-prop="phone"]',
      openSel: '#prop-overlay',
      msg: '\u9AD8\u9891\u7535\u8BDD\uff08\u0412\u0427\uff09\u76F4\u901A\u8C03\u5EA6\u53F0\u3002' +
        '<br>\u62FF\u8D77\u542C\u7B52\uFF0C\u62E8\u4E2A\u53F7\uFF0C\u6309\u300C\u62E8\u53F7\u300D\u547C\u53EB\u8C03\u5EA6\u3002' +
        '<br>\u53F7\u7801\u53EF\u4EE5\u5728\u684C\u4E0A\u7684\u300C\u7535\u8BDD\u53F7\u7801\u7C3F\u300D\u91CC\u67E5\u9605\u3002' +
        '<br>\u5267\u60C5\u4E2D\u4E0A\u7EA7\u7684\u6307\u793A\u4F1A\u7ECF\u7531\u5B83\u4F20\u6765\uFF0C\u52A1\u5FC5\u5E94\u7B54\u3002' +
        '<br><i>\u0412\u0427 \u2014 \u0441\u0432\u044F\u0437\u044C \u0441 \u0434\u0438\u0441\u043F\u0435\u0442\u0447\u0435\u0440\u043E\u043C. \u041E\u0442\u0432\u0435\u0447\u0430\u0439\u0442\u0435 \u0432\u0441\u0435\u0433\u0434\u0430.</i>' +
        '<br><b>\u2460 \u6253\u5F00\u62FF\u8D77\u542C\u7B52 \u2192 \u2462 \u70B9\u300C\u2715 \u653E\u56DE\u300D\u5173\u95ED</b>',
    },
    // 仪表盘阅读引导
    {
      target: '#dial-power',
      msg: '\u8FD9\u662F\u70ED\u529F\u7387\u8868\u3002' +
        '<br>\u5DE6\u4FA7\u662F\u529F\u7387\u8868\u76D8\uff08% N\u043D\u043E\u043C\uff09\uFF0C\u53F3\u4FA7\u6570\u5B57\u662F\u5B9E\u9645\u529F\u7387\uff08MW\uff09\u3002' +
        '<br>\u7EA2\u8272\u533A\u57DF = 110% \u4EE5\u4E0A\uFF0C\u8D85\u8FC7\u4F1A\u89E6\u53D1 \u041F1 \u4FDD\u62A4\u3002' +
        '<br>\u73B0\u5728\u770B\u770B\u5B83\u7684\u6307\u9488\u5728\u54EA\u91CC\u3002' +
        '<br><i>\u042D\u0442\u043E \u043F\u0440\u0438\u0431\u043E\u0440 \u0442\u0435\u043F\u043B\u043E\u0432\u043E\u0439 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438.</i>',
    },
    {
      target: '#dial-period',
      msg: '\u8FD9\u662F\u5468\u671F\u8868\u3002' +
        '<br>\u5468\u671F = \u529F\u7387\u53D8\u5316\u7684\u901F\u5EA6\u3002\u6307\u9488\u5728\u4E2D\u592E = \u529F\u7387\u7A33\u5B9A\u3002' +
        '<br>\u504F\u53F3 = \u529F\u7387\u5728\u5347\uFF0C\u504F\u5DE6 = \u529F\u7387\u5728\u964D\u3002' +
        '<br>\u5F53\u6307\u9488\u8FDB\u5165\u7EA2\u8272\u533A\u57DF\uff08T < 10s\uff09\u65F6\uFF0C\u5FC5\u987B\u7ACB\u5373\u505C\u5806\u3002' +
        '<br><i>\u041F\u0435\u0440\u0438\u043E\u0434 \u2014 \u0441\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438.</i>',
    },
    {
      target: '#read-opr',
      msg: '\u8FD9\u662F\u64CD\u4F5C\u53CD\u5E94\u6027\u88D5\u5EA6\uff08\u041E\u0417\u0420 / OPR\uff09\u3002' +
        '<br>\u5B83\u8868\u793A\u8FD8\u6709\u591A\u5C11\u63A7\u5236\u68D2\u53EF\u4EE5\u63D2\u5165\u3002' +
        '<br>\u5B89\u5168\u89C4\u7A0B\u8981\u6C42 OPR \u2265 26 \u6839\u3002\u4F4E\u4E8E 15 \u7EA2\u8272\u8B66\u544A\uFF0C\u4F4E\u4E8E 8 \u5FC5\u987B\u505C\u5806\u3002' +
        '<br>\u73B0\u5728\u7684\u503C\u662F\u591A\u5C11\uFF1F\u770B\u770B\u53F3\u4FA7\u7684\u6570\u5B57\u3002' +
        '<br><i>\u041E\u0417\u0420 \u2014 \u0437\u0430\u043F\u0430\u0441 \u0440\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438.</i>',
    },
    {
      target: '#read-xe',
      msg: '\u8FD9\u662F\u6C19\u6D53\u5EA6\u3002' +
        '<br>\u6C19-135 \u662F\u6700\u5F3A\u7684\u4E2D\u5B50\u5438\u6536\u4F53\u3002\u529F\u7387\u964D\u4F4E\u65F6\u6C19\u4F1A\u7D2F\u79EF\uFF0C\u53CD\u5E94\u6027\u4E0B\u964D\u3002' +
        '<br>\u8FD9\u5C31\u662F\u201C\u7898\u5751\u201D\u2014\u2014\u964D\u529F\u7387\u540E\u4E0D\u80FD\u7ACB\u5373\u518D\u5347\u3002' +
        '<br><i>\u041A\u0441\u0435\u043D\u043E\u043D-135 \u2014 \u0441\u0438\u043B\u044C\u043D\u0435\u0439\u0448\u0438\u0439 \u043F\u043E\u0433\u043B\u043E\u0442\u0438\u0442\u0435\u043B\u044C.</i>',
    },
    {
      target: '.core-readouts',
      msg: '\u4EEA\u8868\u76D8\u4E0A\u8FD8\u6709\u5176\u4ED6\u91CD\u8981\u4FE1\u606F\uFF1A' +
        '<br>\u2022 \u041E\u0417\u0420 = \u64CD\u4F5C\u88D5\u5EA6\uFF08\u5269\u4F59\u63D2\u5165\u80FD\u529B\uFF09' +
        '<br>\u2022 Xe-135 = \u6C19\u6D53\u5EA6\uFF08\u4E2D\u6BD2\u7A0B\u5EA6\uFF09' +
        '<br>\u2022 \u03B1 = \u7A7A\u6CE1\u4EFD\u989D\uFF08RBMK \u6B63\u53CD\u9988\u7684\u6838\u5FC3\uFF09' +
        '<br>\u8FD9\u4E09\u4E2A\u6570\u503C\u51B3\u5B9A\u4E86\u53CD\u5E94\u5806\u7684\u5B89\u5168\u72B6\u6001\u3002' +
        '<br><i>\u042D\u0442\u0438 \u0442\u0440\u0438 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0430 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u044E\u0442 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u044C.</i>',
    },
    {
      target: '#slider-target',
      cond: function(S) { return S.n >= 0.07; },
      msg: '\u73B0\u5728\u628A\u76EE\u6807\u529F\u7387\u63A8\u5230 7% \u4EE5\u4E0A\uFF1A\u62D6\u52A8\u6ED1\u6746\uFF0C\u6216\u76F4\u63A5\u5728\u6570\u503C\u6846\u91CC\u8F93\u5165\u3002' +
        '<br>\u76EE\u6807\u529F\u7387\u51B3\u5B9A\u63A7\u5236\u68D2\u63D2\u6DF1\uFF0C\u53CD\u5E94\u5806\u529F\u7387\u968F\u4E4B\u722C\u5347\u3002' +
        '<br>\u4F4E\u529F\u7387\u533A\uff08ORM \u2014 \u8FDC\u8FDC\u4F4E\u4E8E 30 \u6839\uff09\u64CD\u4F5C\u8981\u7279\u522B\u5C0F\u5FC3\u3002' +
        '<br><i>\u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u043D\u0438\u0436\u0435 7%.</i>',
    },
    {
      target: '#pump-bank .pump-btn',
      cond: function(S) { return S.pumps && S.pumps.some(Boolean); },
      msg: '\u542F\u52A8\u4E3B\u5FAA\u73AF\u6CF5\u3002' +
        '<br>\u51B7\u5374\u5242\u5FAA\u73AF\u4E00\u65E6\u505C\u6B62\uFF0C\u5806\u82AF\u6E29\u5EA6\u4F1A\u8FC5\u901F\u4E0A\u5347\uFF0C\u53EF\u80FD\u70E7\u7A7F\u71C3\u6599\u3002' +
        '<br>\u81F3\u5C11\u4FDD\u6301 4 \u53F0\u6CF5\u8FD0\u8F6C\uFF08\u542B 2 \u53F0\u5907\u7528\uff09\uFF0C\u6BCF\u53F0\u5408\u95F8\u624D\u80FD\u5207\u5165\u3002' +
        '<br><i>\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0433\u043B\u0430\u0432\u043D\u044B\u0435 \u0446\u0438\u0440\u043A\u0443\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u044B\u0435 \u043D\u0430\u0441\u043E\u0441\u044B.</i>',
    },
    {
      target: '#az-cover',
      msg: '\u6700\u540E\u662F \u0410\u0417-5 \u7D27\u6025\u505C\u5806\u6309\u94AE\u2014\u2014\u6574\u4E2A\u63A7\u5236\u53F0\u6700\u91CD\u8981\u7684\u6309\u94AE\u3002' +
        '<br>\u53EA\u6709\u5728\u5371\u6025\u65F6\u523B\u624D\u80FD\u6309\u4E0B\uFF1A\u529F\u7387\u5931\u63A7\u3001\u5468\u671F\u8FC7\u77ED\u3001\u5806\u82AF\u53C2\u6570\u8D85\u9650\u3002' +
        '<br>\u8BB0\u4F4F\u5B83\uFF1A\u8FD9\u53EF\u80FD\u662F\u4F60\u6700\u540E\u7684\u4FDD\u547D\u624B\u6BB5\u3002' +
        '<br>\u6559\u5B66\u7ED3\u675F\u3002\u795D\u4F60\u597D\u8FD0\uFF0C\u503C\u73ED\u957F\u3002' +
        '<br><i>\u0410\u0417-5: \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0437\u0430\u0449\u0438\u0442\u0430 \u0440\u0435\u0430\u043A\u0442\u043E\u0440\u0430.</i>',
    },
  ];

  function ensure() {
    box = document.getElementById('tutorial-box');
    stepEl = document.getElementById('tutorial-step');
    msgEl = document.getElementById('tutorial-msg');
    closeBtn = document.getElementById('tutorial-close');
    if (closeBtn && !closeBtn._tutBound) {
      closeBtn._tutBound = true;
      closeBtn.addEventListener('click', stop);
    }
    if (!ring) {
      ring = document.createElement('div');
      ring.className = 'tut-target-ring';
      ring.style.display = 'none';
      document.body.appendChild(ring);
    }
  }

  function current() {
    return idx >= 0 && idx < STEPS.length ? STEPS[idx] : null;
  }

  function checkCond() {
    var s = current();
    if (!s) return;
    positionRing(s);
    if (s.openSel) {
      var ov = document.querySelector(s.openSel);
      var vis = !!ov && !ov.classList.contains('hidden');
      if (vis) s._opened = true;
      if (s._opened && !vis) advance();
      return;
    }
    if (!s.cond || !ctx || !ctx.getState) return;
    if (s.cond(ctx.getState())) advance();
  }

  function onDocClick(e) {
    var s = current();
    if (!s || e.target === closeBtn) return;
    if (!s.target || !e.target.closest || !e.target.closest(s.target)) return;
    e.preventDefault();
    if (!s.cond && !s.openSel) advance();
    else if (ctx && ctx.getState && s.cond && s.cond(ctx.getState())) advance();
  }

  function onKey(e) {
    var s = current();
    if (!s || s.cond || s.openSel) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advance();
    }
  }

  function advance() {
    if (advancing) return;
    advancing = true;
    idx++;
    if (idx >= STEPS.length) {
      stepEl.textContent = '\u041E\u0411\u0423\u0427\u0415\u041D\u0418\u0415 \u0417\u0410\u0412\u0415\u0420\u0428\u0415\u041D\u041E \u00B7 \u6559\u5B66\u7ED3\u675F';
      msgEl.innerHTML = '\u73B0\u5728\u6309\u4F60\u7684\u5224\u65AD\u64CD\u4F5C\u5427\u3002';
      setTimeout(stop, 2200);
      setTimeout(function() { advancing = false; }, 300);
      return;
    }
    render();
    setTimeout(function() { advancing = false; }, 250);
  }

  function render() {
    var s = current();
    if (!s) return;
    box.classList.remove('hidden');
    stepEl.textContent = '\u7B2C ' + (idx + 1) + ' \u6B65 / ' + STEPS.length;
    msgEl.innerHTML = s.msg.replace(/\n/g, '<br>') +
      (s.cond ? '' : (s.openSel ? '<div class="tut-tip">\u2192 \u6253\u5F00\u8BE5\u9053\u5177\uFF0C\u9605\u8BFB\u540E\u70B9\u300C\u2715 \u653E\u56DE\u300D\u5173\u95ED</div>' : '<div class="tut-tip">\u2192 \u70B9\u51FB\u8BE5\u76EE\u6807\u7EE7\u7EED</div>'));
    positionRing(s);
  }

  function positionRing(s) {
    if (!ring) return;
    var el = s.target ? document.querySelector(s.target) : null;
    if (!el) { ring.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    if (!r.width) { ring.style.display = 'none'; return; }
    ring.style.display = 'block';
    ring.style.left = (r.left - 6) + 'px';
    ring.style.top = (r.top - 6) + 'px';
    ring.style.width = (r.width + 12) + 'px';
    ring.style.height = (r.height + 12) + 'px';
  }

  function start(c) {
    ensure();
    if (idx >= 0) return;
    ctx = c || null;
    idx = 0;
    checkTimer = setInterval(checkCond, 300);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    render();
  }

  function stop() {
    if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
    if (box) box.classList.add('hidden');
    if (ring) ring.style.display = 'none';
    idx = -1;
    ctx = null;
  }

  window.Tutorial = {
    start: start,
    stop: stop,
    isActive: function() { return idx >= 0; },
  };
})();
