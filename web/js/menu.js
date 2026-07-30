(function() {
  var MENU = {};
  var currentScreen = 'boot';
  var selectedIndex = 0;
  var items = [];
  var menuEl = null;
  var onStartGame = null;

  var mainItems = [
    { id: 'new', ru: '\u041D\u0410\u0427\u0410\u0422\u042C \u0421\u041C\u0415\u041D\u0423', cn: '\u5F00\u59CB\u503C\u73ED', icon: '\u25A3' },
    { id: 'continue', ru: '\u041F\u0420\u041E\u0414\u041E\u041B\u0416\u0418\u0422\u042C', cn: '\u7EE7\u7EED\u503C\u73ED', icon: '\u25A3' },
    { id: 'scenarios', ru: '\u0421\u0426\u0415\u041D\u0410\u0420\u0418\u0418', cn: '\u573A\u666F\u9009\u62E9', icon: '\u25A3' },
    { id: 'docs', ru: '\u0414\u041E\u041A\u0423\u041C\u0415\u041D\u0422\u0410\u0426\u0418\u042F', cn: '\u64CD\u4F5C\u89C4\u7A0B', icon: '\u25A3' },
    { id: 'settings', ru: '\u041D\u0410\u0421\u0422\u0420\u041E\u0419\u041A\u0418', cn: '\u8BBE\u7F6E', icon: '\u25A3' },
    { id: 'exit', ru: '\u0412\u042B\u0425\u041E\u0414', cn: '\u9000\u51FA', icon: '\u25A3' },
  ];

  var scenariosList = [];
  var hasSave = false;

  function createMenuDOM() {
    var el = document.createElement('div');
    el.id = 'menu-overlay';
    el.style.display = 'none';
    el.innerHTML =
      '<div id="menu-panel">' +
        '<div id="menu-title">\u0420\u0411\u041C\u041A-1000 \u00B7 \u0411\u041B\u041E\u041A \u21164</div>' +
        '<div id="menu-divider"></div>' +
        '<div id="menu-items"></div>' +
        '<div id="menu-divider-bot"></div>' +
        '<div id="menu-status">' +
          '<span id="menu-status-shift">\u0421\u041C\u0415\u041D\u0410: ---</span>' +
          '<span id="menu-status-power">\u041C\u041E\u0429\u041D\u041E\u0421\u0422\u042C: 0 \u041C\u0412\u0442</span>' +
          '<span id="menu-status-time">t: 00:00:00</span>' +
        '</div>' +
      '</div>' +
      '<div id="sub-panel" style="display:none"></div>' +
      '<div id="exit-confirm" style="display:none">' +
        '<span id="exit-text">\u041F\u041E\u041A\u0418\u041D\u0423\u0422\u042C \u0421\u041C\u0415\u041D\u0423?</span>' +
        '<button class="exit-btn" data-action="yes">\u0414\u0410</button>' +
        '<button class="exit-btn" data-action="no">\u041D\u0415\u0422</button>' +
      '</div>';
    document.body.appendChild(el);
    menuEl = el;
    return el;
  }

  function renderMainMenu() {
    var container = document.getElementById('menu-items');
    if (!container) return;
    container.innerHTML = '';
    items = mainItems;

    var hasSaveCheck = localStorage.getItem('rbmk_save') !== null;
    hasSave = hasSaveCheck;

    items.forEach(function(item, i) {
      var div = document.createElement('div');
      div.className = 'menu-item';
      div.dataset.index = i;
      var isDisabled = item.id === 'continue' && !hasSave;

      div.innerHTML =
        '<span class="menu-led' + (isDisabled ? ' amber' : '') + '"></span>' +
        '<span class="menu-cursor"></span>' +
        '<span class="menu-label' + (isDisabled ? ' disabled' : '') + '">' + item.icon + ' ' + item.ru + '</span>' +
        '<span class="menu-cn">' + item.cn + '</span>';
      container.appendChild(div);

      if (!isDisabled) {
        div.addEventListener('click', function() { selectItem(i); confirmItem(); });
        div.addEventListener('mouseenter', function() { selectItem(i); });
      }
    });

    selectItem(0);
    setupKeys();
  }

  function selectItem(idx) {
    if (idx < 0) idx = 0;
    if (idx >= items.length) idx = items.length - 1;
    var prev = document.querySelector('.menu-item.selected');
    if (prev) {
      prev.classList.remove('selected');
      prev.querySelector('.menu-led').style.boxShadow = 'none';
    }
    selectedIndex = idx;
    var el = document.querySelectorAll('.menu-item')[idx];
    if (!el || el.querySelector('.menu-label').classList.contains('disabled')) {
      var next = idx;
      while (next < items.length - 1) { next++; if (!document.querySelectorAll('.menu-item')[next].querySelector('.menu-label').classList.contains('disabled')) break; }
      if (next === idx) { while (next > 0) { next--; if (!document.querySelectorAll('.menu-item')[next].querySelector('.menu-label').classList.contains('disabled')) break; } }
      selectedIndex = next;
      el = document.querySelectorAll('.menu-item')[next];
    }
    el.classList.add('selected');
    el.querySelector('.menu-led').style.boxShadow = '0 0 10px #7FFF7F';
    el.querySelector('.menu-cursor').textContent = '\u25B6';
    Audio.beep(880, 0.03, 'square', 0.06);
    el.scrollIntoView({ block: 'nearest' });
  }

  function confirmItem() {
    Audio.click();
    var item = items[selectedIndex];
    if (!item) return;
    if (item.id === 'continue' && !hasSave) { return; }
    if (item.id === 'exit') { showExitConfirm(); return; }
    if (item.id === 'new') { showConfigSubmenu(); return; }
    if (item.id === 'scenarios') { loadScenarios(); return; }
    if (item.id === 'settings') { showSettings(); return; }
    if (item.id === 'docs') { openDocs(); return; }
  }

  function showExitConfirm() {
    Audio.alarmTone();
    document.getElementById('exit-confirm').style.display = 'block';
    document.querySelectorAll('.exit-btn').forEach(function(b) {
      b.addEventListener('click', function handler() {
        if (b.dataset.action === 'yes') {
          Audio.stopHum();
          document.body.style.transition = 'opacity 1s';
          document.body.style.opacity = '0';
          setTimeout(function() {
            try { window.close(); } catch(e) {}
            document.body.innerHTML = '<div style="color:#7FFF7F;background:#000;height:100vh;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:24px">\u0421\u041C\u0415\u041D\u0410 \u0417\u0410\u041A\u041E\u041D\u0427\u0415\u041D\u0410</div>';
          }, 1000);
        } else {
          hideSubPanel();
        }
        b.removeEventListener('click', handler);
      });
    });
  }

  function showConfigSubmenu() {
    var panel = document.getElementById('sub-panel');
    panel.style.display = 'block';
    panel.innerHTML =
      '<div class="sub-title">\u041A\u041E\u041D\u0424\u0418\u0413\u0423\u0420\u0410\u0426\u0418\u042F \u0421\u041C\u0415\u041D\u042B</div>' +
      '<div class="sub-divider"></div>' +
      '<div class="sub-row"><span class="sub-label">\u0411\u041B\u041E\u041A</span><span class="sub-options" id="cfg-unit"><button class="sub-opt active">\u21164</button></span></div>' +
      '<div class="sub-row"><span class="sub-label">\u0420\u0415\u0416\u0418\u041C</span><span class="sub-options" id="cfg-mode"><button class="sub-opt active">\u0428\u0422\u0410\u0422\u041D\u042B\u0419</button></span></div>' +
      '<div class="sub-row"><span class="sub-label">\u0421\u041B\u041E\u0416\u041D\u041E\u0421\u0422\u042C</span><div class="sub-slider-wrap"><input type="range" id="cfg-difficulty" min="1" max="5" value="3" class="sub-slider"><span id="cfg-diff-label" class="sub-diff-label">\u041D\u041E\u0420\u041C\u0410</span></div></div>' +
      '<div class="sub-divider"></div>' +
      '<button class="sub-start" id="sub-start-btn">\u041D\u0410\u0427\u0410\u0422\u042C \u2192</button>' +
      '<div class="sub-hint">Esc \u8FD4\u56DE</div>';

    document.getElementById('cfg-difficulty').addEventListener('input', function() {
      var v = parseInt(this.value);
      var labels = ['\u0421\u0422\u0410\u0416\u0415\u0420','\u041B\u0415\u0413\u041A\u041E','\u041D\u041E\u0420\u041C\u0410','\u0422\u042F\u0416\u0415\u041B\u041E','\u042D\u041A\u0421\u0422\u0420\u0415\u041C'];
      document.getElementById('cfg-diff-label').textContent = labels[v - 1];
    });

    document.getElementById('sub-start-btn').addEventListener('click', function() {
      hideAll();
      if (onStartGame) onStartGame();
    });

    currentScreen = 'config';
  }

  function loadScenarios() {
    var panel = document.getElementById('sub-panel');
    panel.style.display = 'block';

    var defaultScenarios = [
      { id: 'chernobyl', ru: '\u0427\u0415\u0420\u041D\u041E\u0411\u042B\u041B\u042C \u00B7 26.04.1986', cn: '\u5207\u5C14\u8BFA\u8D1D\u5229\u2665 1986', desc: '\u5B89\u5168\u6D4B\u8BD5 \u2192 \u529F\u7387\u9A71\u964D \u2192 \u6C28\u4E2D\u6BD2 \u2192 AZ-5', diff: 4, duration: '~45min', locked: false },
      { id: 'normal', ru: '\u0428\u0422\u0410\u0422\u041D\u0410\u042F \u042D\u041A\u0421\u041F\u041B\u0423\u0410\u0422\u0410\u0426\u0418\u042F', cn: '\u6B63\u5E38\u8FD0\u884C', desc: '\u4ECE\u51B7\u6001\u542F\u52A8\u5230\u6EE1\u529F\u7387\u5E76\u7F51', diff: 2, duration: '~30min', locked: false },
      { id: 'xenon', ru: '\u041A\u0421\u0415\u039D\u041E\u041D\u041E\u0412\u042B\u0415 \u041A\u041E\u041B\u0415\u0411\u0410\u041D\u0418\u042F', cn: '\u6C28\u632F\u8361\u6291\u5236', desc: '\u6C28\u632F\u8361\u6291\u5236\u8BAD\u7EC3', diff: 3, duration: '~20min', locked: false },
    ];

    var html = '<div class="sub-title">\u0421\u0426\u0415\u041D\u0410\u0420\u0418\u0418</div><div class="sub-divider"></div>';
    html += '<div class="scenario-list">';
    defaultScenarios.forEach(function(s) {
      var locked = s.locked;
      html += '<div class="scenario-item' + (locked ? ' locked' : '') + '" data-id="' + s.id + '">' +
        '<span class="scenario-icon">' + (locked ? '\u25C9' : '\u25A3') + '</span>' +
        '<div class="scenario-body">' +
          '<div class="scenario-title">' + s.ru + '</div>' +
          '<div class="scenario-desc">' + s.desc + '</div>' +
          '<div class="scenario-meta"><span>' + (locked ? '\u9700\u89E3\u9501' : '\u96BE\u5EA6: ' + '\u2588'.repeat(s.diff) + '\u2591'.repeat(5 - s.diff)) + '</span><span>' + s.duration + '</span></div>' +
        '</div>' +
      '</div>';
    });
    html += '</div><div class="sub-divider"></div><div class="sub-hint">Esc \u8FD4\u56DE</div>';
    panel.innerHTML = html;

    panel.querySelectorAll('.scenario-item:not(.locked)').forEach(function(el) {
      el.addEventListener('click', function() {
        Audio.click();
        hideAll();
        if (onStartGame) onStartGame();
      });
    });

    currentScreen = 'scenarios';
  }

  function showSettings() {
    var panel = document.getElementById('sub-panel');
    panel.style.display = 'block';
    panel.innerHTML =
      '<div class="sub-title">\u041D\u0410\u0421\u0422\u0420\u041E\u0419\u041A\u0418</div>' +
      '<div class="sub-divider"></div>' +
      '<div class="sub-row"><span class="sub-label">\u042F\u0417\u042B\u041A</span><span class="sub-options"><button class="sub-opt active">\u4E2D\u6587</button><button class="sub-opt">\u0420\u0443\u0441</button></span></div>' +
      '<div class="sub-row"><span class="sub-label">\u0417\u0412\u0423\u041A</span><span class="sub-options"><button class="sub-opt active">\u0412\u041A\u041B.</button><button class="sub-opt">\u0412\u042B\u041A\u041B.</button></span></div>' +
      '<div class="sub-divider"></div>' +
      '<div class="sub-hint">Esc \u8FD4\u56DE</div>';
    currentScreen = 'settings';
  }

  function openDocs() {
    var btn = document.querySelector('.prop[data-prop="manual"]');
    if (btn) btn.click();
    hideAll();
  }

  function hideSubPanel() {
    var panel = document.getElementById('sub-panel');
    if (panel) panel.style.display = 'none';
    document.getElementById('exit-confirm').style.display = 'none';
    currentScreen = 'main';
    selectedIndex = 0;
    renderMainMenu();
  }

  function hideAll() {
    if (menuEl) { menuEl.style.display = 'none'; }
    document.body.classList.remove('menu-active');
    Audio.stopHum();
  }

  function setupKeys() {
    document.removeEventListener('keydown', MENU._keyHandler);
    MENU._keyHandler = function(e) {
      if (menuEl.style.display === 'none') return;
      if (currentScreen !== 'main' && currentScreen !== 'boot') {
        if (e.key === 'Escape') { hideSubPanel(); e.preventDefault(); return; }
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { selectItem(selectedIndex - 1); e.preventDefault(); }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { selectItem(selectedIndex + 1); e.preventDefault(); }
      if (e.key === 'Enter' || e.key === ' ') { confirmItem(); e.preventDefault(); }
    };
    document.addEventListener('keydown', MENU._keyHandler);
  }

  function show(callback) {
    onStartGame = callback;
    createMenuDOM();
    currentScreen = 'main';
    renderMainMenu();

    Audio.startHum();
    Audio.setHumVolume(0.015);

    document.body.classList.add('menu-active');
    menuEl.style.display = 'flex';

    var statusShift = document.getElementById('menu-status-shift');
    var statusPower = document.getElementById('menu-status-power');
    var statusTime = document.getElementById('menu-status-time');
    var t = 0;
    if (MENU._clockInterval) clearInterval(MENU._clockInterval);
    MENU._clockInterval = setInterval(function() {
      t++;
      var h = String(Math.floor(t / 3600) % 24).padStart(2, '0');
      var m = String(Math.floor(t / 60) % 60).padStart(2, '0');
      var s = String(t % 60).padStart(2, '0');
      if (statusTime) statusTime.textContent = 't: ' + h + ':' + m + ':' + s;
    }, 1000);
  }

  MENU.show = show;
  MENU.hide = hideAll;
  window.Menu = MENU;
})();