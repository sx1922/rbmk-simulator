(function() {
  var MENU = {};
  var menuEl = null;
  var settingsEl = null;
  var onStartGame = null;
  var versionStr = '';
  var versionData = null;

  var focus = { col: 'left', leftIdx: 0, rightIdx: 0, rightPowered: false, exitConfirm: false };
  var clockTimer = null;
  var lampTimer = null;
  var clockSec = 0;

  var LEFT_ITEMS = [
    { id: 'start', ru: '\u041F\u0423\u0421\u041A', cn: '\u5F00\u59CB\u503C\u73ED', big: true },
    { id: 'archive', ru: '\u0410\u0420\u0425\u0418\u0412', cn: '\u6863\u6848\u7CFB\u7EDF', disabled: true },
    { id: 'settings', ru: '\u041D\u0410\u0421\u0422\u0420\u041E\u0419\u041A\u0418', cn: '\u6574\u5B9A\u8BBE\u7F6E', disabled: false },
    { id: 'exit', ru: '\u0412\u042B\u0425\u041E\u0414', cn: '\u9000\u73ED\u9000\u51FA', disabled: false },
  ];

  var MODE_ITEMS = [
    { id: 'story', ru: '\u0425\u0420\u041E\u041D\u0418\u041A\u0410', cn: '\u5386\u53F2\u91CD\u6F14', desc: '\u5207\u5C14\u8BFA\u8D1D\u5229\u7B49\u771F\u5B9E\u5386\u53F2\u5267\u672C', tag: '[\u0441\u044E\u0436\u0435\u0442 \u5267\u60C5]', locked: false },
    { id: 'challenge', ru: '\u0412\u042B\u0417\u041E\u0412', cn: '\u6311\u6218\u6A21\u5F0F', desc: '\u9650\u65F6\u968F\u673A\u6545\u969C\u8003\u9A8C\u53CD\u5E94', tag: '[\u043B\u0438\u043C\u0438\u0442 \u9650\u65F6]', locked: false },
    { id: 'endless', ru: '\u0411\u0415\u0421\u041A\u041E\u041D\u0415\u0427\u041D\u041E\u0421\u0422\u042C', cn: '\u65E0\u5C3D\u8FD0\u8425', desc: '\u6838\u7535\u7AD9\u8FDE\u7EED\u8FD0\u8425 \u00B7 \u9010\u6708\u7ED3\u7B97 \u00B7 \u76F4\u5230\u7834\u4EA7\u6216\u7194\u6BC1', tag: '[\u0431\u0435\u0441\u043A\u043E\u043D. \u65E0\u5C3D]', locked: false },
  ];

  var SETTINGS_TABS = [
    { id: 'audio', ru: '\u0417\u0412\u0423\u041A', cn: '\u58F0\u97F3' },
    { id: 'video', ru: '\u042D\u041A\u0420\u0410\u041D', cn: '\u753B\u9762' },
    { id: 'controls', ru: '\u0423\u041F\u0420\u0410\u0412\u041B\u0415\u041D\u0418\u0415', cn: '\u64CD\u4F5C' },
    { id: 'difficulty', ru: '\u0420\u0415\u0416\u0418\u041C', cn: '\u5DE5\u51B5\u96BE\u5EA6' },
    { id: 'interface', ru: '\u0418\u041D\u0422\u0415\u0420\u0424\u0415\u0419\u0421', cn: '\u754C\u9762\u8BED\u8A00' },
    { id: 'system', ru: '\u0421\u0418\u0421\u0422\u0415\u041C\u0410', cn: '\u7CFB\u7EDF\u5173\u4E8E' },
  ];

  var SETTINGS_DATA = {
    audio: {
      items: [
        { type: 'slider', id: 'masterVol', label: '\u4E3B\u97F3\u91CF', min: 0, max: 100, val: 80, unit: '%' },
        { type: 'slider', id: 'ambient', label: '\u63A7\u5236\u5BA4\u5E95\u566A', min: 0, max: 100, val: 60, unit: '%' },
        { type: 'slider', id: 'alarmVol', label: '\u8B66\u62A5\u97F3\u91CF', min: 0, max: 100, val: 70, unit: '%' },
        { type: 'slider', id: 'voiceVol', label: '\u5E7F\u64AD\u8BED\u97F3', min: 0, max: 100, val: 50, unit: '%' },
        { type: 'toggle', id: 'mute', label: '\u4E00\u952E\u9759\u97F3', val: false, opts: ['\u5F00', '\u5173'] },
      ]
    },
    video: {
      items: [
        { type: 'slider', id: 'crtIntensity', label: 'CRT \u663E\u50CF\u7BA1\u5F3A\u5EA6', min: 0, max: 100, val: 70, unit: '%' },
        { type: 'toggle', id: 'fullscreen', label: '\u5168\u5C4F', val: false, opts: ['\u5F00', '\u5173'] },
        { type: 'toggle', id: 'vSync', label: '\u5782\u76F4\u540C\u6B65', val: true, opts: ['\u5F00', '\u5173'] },
      ]
    },
    controls: {
      items: [
        { type: 'label', label: '\u952E\u4F4D\u7ED1\u5B9A', info: '\u8BF7\u5728\u6E38\u620F\u5185\u8BBE\u7F6E (v0.3+)' },
        { type: 'label', label: '\u9F20\u6807\u654F\u611F\u5EA6', info: '\u8BF7\u5728\u6E38\u620F\u5185\u8BBE\u7F6E (v0.3+)' },
        { type: 'label', label: '\u624B\u67C4\u652F\u6301', info: '\u5F85\u5B9E\u73B0' },
      ]
    },
    difficulty: {
      items: [
        { type: 'slider', id: 'displayAid', label: '\u4EEA\u8868\u6570\u5B57\u8F85\u52A9', min: 0, max: 100, val: 50, unit: '%' },
        { type: 'slider', id: 'warnLevel', label: '\u6545\u969C\u9884\u8B66\u7B49\u7EA7', min: 0, max: 100, val: 60, unit: '%' },
        { type: 'toggle', id: 'consequenceMode', label: '\u540E\u679C\u6A21\u5F0F', val: true, opts: ['\u5199\u5B9E', '\u5BBD\u5BB9'] },
        { type: 'slider', id: 'timeScale', label: '\u65F6\u95F4\u52A0\u901F', min: 0, max: 200, val: 100, unit: '%' },
      ]
    },
    interface: {
      items: [
        { type: 'toggle', id: 'lang', label: '\u8BED\u8A00', val: false, opts: ['\u4E2D\u6587', 'RU'] },
        { type: 'toggle', id: 'subtitles', label: '\u5B57\u5E55/\u5E7F\u64AD\u6587\u672C', val: true, opts: ['\u5F00', '\u5173'] },
        { type: 'slider', id: 'fxIntensity', label: '\u73AF\u5883\u52A8\u6548\u5F3A\u5EA6', min: 0, max: 100, val: 80, unit: '%' },
        { type: 'toggle', id: 'highContrast', label: '\u8272\u76F2/\u9AD8\u5BF9\u6BD4\u6A21\u5F0F', val: false, opts: ['\u5F00', '\u5173'] },
      ]
    },
    system: {
      items: [
        { type: 'version', label: '\u7248\u672C\u4FE1\u606F' },
        { type: 'action', id: 'clearSave', label: '\u6E05\u9664\u5B58\u6863', danger: true },
        { type: 'action', id: 'resetSettings', label: '\u8FD8\u539F\u51FA\u5382\u8BBE\u7F6E', danger: true },
      ]
    }
  };

  function createMenuDOM() {
    var el = document.createElement('div');
    el.id = 'new-menu';
    el.innerHTML =
      '<div class="menu-rivet tl"></div><div class="menu-rivet tr"></div>' +
      '<div class="menu-rivet bl"></div><div class="menu-rivet br"></div>' +
      '<div id="menu-crt">' +
        '<div id="menu-header">' +
          '<div id="menu-brand">\u0429\u0418\u0422<span id="menu-brand-cn">\u4E3B\u63A7\u57F9\u8BAD\u6A21\u62DF\u5668</span></div>' +
          '<div id="menu-lamps">' +
            '<div class="mlamp amber on" data-lamp="start"><span class="mlamp-bulb amber"></span><span class="mlamp-ru">\u041F\u0423\u0421\u041A</span><span class="mlamp-cn">\u5F00\u59CB\u503C\u73ED</span></div>' +
            '<div class="mlamp green breathing on" data-lamp="ready"><span class="mlamp-bulb green"></span><span class="mlamp-ru">\u0413\u041E\u0422\u041E\u0412</span><span class="mlamp-cn">\u5C31\u7EEA</span></div>' +
            '<div class="mlamp red" data-lamp="alarm"><span class="mlamp-bulb red"></span><span class="mlamp-ru">\u0410\u0412\u0410\u0420</span><span class="mlamp-cn">\u8B66\u62A5</span></div>' +
          '</div>' +
          '<div id="menu-clock">00:00:00</div>' +
        '</div>' +
        '<div id="menu-body">' +
          '<div id="menu-left"></div>' +
          '<div id="menu-right">' +
            '<div class="mr-placeholder">' +
              '<div class="mr-dash">\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510</div>' +
              '<div class="mr-line">\u2502  \u5B50\u5C4F\u5F85\u547D  \u2502</div>' +
              '<div class="mr-dash">\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518</div>' +
              '<div style="font-size:9px;color:#4A4E42;margin-top:10px;letter-spacing:2px">\u0412\u042B\u0411\u0415\u0420\u0418\u0422\u0415 \u0420\u0415\u0416\u0418\u041C \u0414\u041B\u042F \u0417\u0410\u041F\u0423\u0421\u041A\u0410 \u00B7 \u8BF7\u9009\u62E9\u8FD0\u884C\u6A21\u5F0F</div>' +
            '</div>' +
            '<div id="mr-mode-list"></div>' +
            '<div id="mr-info-card" style="display:none"></div>' +
          '</div>' +
        '</div>' +
        '<div id="menu-footer">' +
          '<div class="mf-version" id="mf-version"></div>' +
          '<div class="mf-keys"><span><kbd>\u2191</kbd><kbd>\u2193</kbd> \u79FB\u52A8</span><span><kbd>\u23CE</kbd> \u786E\u8BA4</span><span><kbd>Esc</kbd> \u8FD4\u56DE</span></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    menuEl = el;
    return el;
  }

  var SETTING_DATA_MAP = {};
  SETTINGS_TABS.forEach(function(tab) {
    SETTING_DATA_MAP[tab.id] = SETTINGS_DATA[tab.id] ? SETTINGS_DATA[tab.id].items : [];
  });

  var settingsTabIdx = 0;
  var settingsCloseCb = null;
  var settingsEscBound = false;

  var SETTING_MAP = {
    masterVol:       { key: 'masterVolume',       scale: 0.01, apply: function(v) { if (window.Audio) Audio.setMasterVolume(v); } },
    ambient:         { key: 'busVolumes.ambient', scale: 0.01 },
    alarmVol:        { key: 'busVolumes.alarms',  scale: 0.01 },
    voiceVol:        { key: 'busVolumes.narrative', scale: 0.01 },
    crtIntensity:    { key: 'crtIntensity' },
    fullscreen:      { key: 'fullscreen',         bool: true, apply: function(v) {
                         if (v) {
                           if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function() {});
                         } else if (document.fullscreenElement) {
                           document.exitFullscreen();
                         }
                       } },
    vSync:           { key: 'vSync',              bool: true },
    displayAid:      { key: 'digitalAssist',      scale: 0.01 },
    warnLevel:       { key: 'warningLevel',       scale: 0.03 },
    consequenceMode: { key: 'consequenceMode',    bool: true, trueVal: 'realistic', falseVal: 'forgiving' },
    timeScale:       { key: 'timeScale',          apply: function(v) { if (window.RBMK) RBMK.setTimeScale(Math.max(1, Math.round(v / 100 * 10))); } },
    lang:            { key: 'language',           bool: true, trueVal: 'zh', falseVal: 'ru', apply: function(v) {
                         document.body.setAttribute('data-lang', v === 'zh' ? 'zh' : 'ru');
                       } },
    subtitles:       { key: 'subtitles',          bool: true, apply: function(v) {
                         document.body.setAttribute('data-subtitles', v ? 'on' : 'off');
                       } },
    fxIntensity:     { key: 'ambientMotion' },
    mute:            { key: 'muted',              bool: true, apply: function(v) { if (window.Audio) Audio.setMuted(v); } },
    highContrast:    { key: 'highContrast',       bool: true, apply: function(v) {
                         document.body.classList.toggle('high-contrast', !!v);
                       } },
  };

  function setNested(obj, key, val) {
    var parts = key.split('.');
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
  }

  function getNested(obj, key) {
    var parts = key.split('.');
    var o = obj;
    for (var i = 0; i < parts.length; i++) {
      if (o === undefined || o === null) return undefined;
      o = o[parts[i]];
    }
    return o;
  }

  function initSettingsValues() {
    if (!window.Core) return;
    var s = Core.Save.loadJournal().settings || {};
    SETTINGS_TABS.forEach(function(tab) {
      (SETTING_DATA_MAP[tab.id] || []).forEach(function(item) {
        var m = SETTING_MAP[item.id];
        if (!m) return;
        var stored = getNested(s, m.key);
        if (stored === undefined || stored === null) return;
        if (m.bool) {
          item.val = m.trueVal !== undefined ? stored === m.trueVal : !!stored;
        } else if (item.type === 'slider') {
          item.val = m.scale ? Math.round(stored / m.scale) : Math.round(stored);
        }
      });
    });
  }

  function applySetting(id, raw) {
    var m = SETTING_MAP[id];
    if (!m || !window.Core) return;
    var j = Core.Save.loadJournal();
    var s = j.settings || (j.settings = Core.Save.defaultSettings());
    var val = m.bool
      ? (m.trueVal !== undefined ? (raw ? m.trueVal : m.falseVal) : !!raw)
      : (m.scale ? raw * m.scale : raw);
    setNested(s, m.key, val);
    if (m.apply) m.apply(val);
    Core.Save.recordSettingsChange(j, s);
    Object.keys(SETTING_DATA_MAP).forEach(function(tabId) {
      (SETTING_DATA_MAP[tabId] || []).forEach(function(item) {
        if (item.id === id) item.val = raw;
      });
    });
  }

  function restoreStoredSettings() {
    if (!window.Core) return;
    try {
      var s = Core.Save.loadJournal().settings || {};
      if (typeof s.masterVolume === 'number' && window.Audio) {
        Audio.setMasterVolume(s.masterVolume);
      }
      if (typeof s.timeScale === 'number' && window.RBMK) {
        RBMK.setTimeScale(Math.max(1, Math.round(s.timeScale / 100 * 10)));
      }
      if (window.Audio && typeof s.muted === 'boolean') Audio.setMuted(s.muted);
      if (s.fullscreen) {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function() {});
      }
      document.body.setAttribute('data-lang', s.language === 'ru' ? 'ru' : 'zh');
      document.body.setAttribute('data-subtitles', s.subtitles === false ? 'off' : 'on');
      document.body.classList.toggle('high-contrast', !!s.highContrast);
    } catch (e) {}
  }

  function createSettingsDOM() {
    var el = document.createElement('div');
    el.id = 'settings-overlay';
    el.innerHTML =
      '<div class="menu-rivet tl"></div><div class="menu-rivet tr"></div>' +
      '<div class="menu-rivet bl"></div><div class="menu-rivet br"></div>' +
      '<div id="settings-crt">' +
        '<div id="settings-header">' +
          '<div id="settings-title">\u041D\u0410\u0421\u0422\u0420\u041E\u0419\u041A\u0418 \u00B7 \u6574\u5B9A\u8BBE\u7F6E</div>' +
          '<div id="settings-close">[\u2715] \u0417\u0410\u041A\u0420\u042B\u0422\u042C \u00B7 \u5173\u95ED</div>' +
        '</div>' +
        '<div id="settings-body">' +
          '<div id="settings-left"></div>' +
          '<div id="settings-right">' +
            '<div class="sr-title" id="sr-title"></div>' +
            '<div id="sr-content"></div>' +
          '</div>' +
        '</div>' +
        '<div id="settings-footer">' +
          '<div class="sf-action" id="sf-reset">\u2190 \u6062\u590D\u51FA\u5382\u6574\u5B9A</div>' +
          '<div class="sf-esc">Esc \u8FD4\u56DE\u4E3B\u83DC\u5355</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#settings-close').addEventListener('click', hideSettings);
    el.querySelector('#sf-reset').addEventListener('click', function() {
      if (confirm('\u786E\u8BA4\u8FD8\u539F\u51FA\u5382\u6574\u5B9A\uFF1F')) {
        if (window.Core) {
          var j = Core.Save.loadJournal();
          Core.Save.recordSettingsChange(j, Core.Save.defaultSettings());
        }
        initSettingsValues();
        restoreStoredSettings();
        renderSettingsContent(SETTINGS_TABS[settingsTabIdx].id);
      }
    });
    settingsEl = el;
    return el;
  }

  function renderLeftItems() {
    var container = document.getElementById('menu-left');
    container.innerHTML = '';
    LEFT_ITEMS.forEach(function(item, i) {
      if (item.big) {
        var big = document.createElement('div');
        big.className = 'mop-big' + (focus.leftIdx === i ? ' focused' : '');
        big.dataset.idx = i;
        big.innerHTML = '<span class="mop-marker">' + (focus.leftIdx === i ? '\u25B6' : '') + '</span>' + item.ru + '<span class="mop-cn">' + item.cn + '</span>';
        big.addEventListener('click', function() { focusLeft(i); confirmLeft(); });
        container.appendChild(big);
      } else {
        var row = document.createElement('div');
        row.className = 'mop-item' + (focus.leftIdx === i ? ' focused' : '') + (item.disabled ? ' disabled' : '');
        row.dataset.idx = i;
        row.innerHTML =
          '<span class="mop-marker">' + (focus.leftIdx === i ? '\u25B6' : '\u00B7') + '</span>' +
          '<span class="mop-label">' + item.ru + '</span>' +
          '<span class="mop-cn">' + item.cn + '</span>' +
          (item.disabled ? '<span class="mop-stamp">\u041D\u0415 \u0414\u041E\u041F\u0423\u0429\u0415\u041D\u041E \u00B7 \u672A\u83B7\u51C6</span>' : '');
        row.addEventListener('click', function() { if (!item.disabled) { focusLeft(i); confirmLeft(); } });
        container.appendChild(row);
      }
    });
  }

  function renderModeList() {
    var container = document.getElementById('mr-mode-list');
    container.innerHTML = '';
    MODE_ITEMS.forEach(function(mode, i) {
      var row = document.createElement('div');
      row.className = 'mr-mode-item' + (focus.rightIdx === i ? ' focused' : '') + (mode.locked ? ' locked' : '');
      row.dataset.idx = i;
      row.innerHTML =
        '<span class="mr-mode-marker">' + (focus.rightIdx === i ? '\u25B8' : '') + '</span>' +
        '<span class="mr-mode-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="mr-mode-body">' +
          '<div class="mr-mode-title">' + mode.ru + '</div>' +
          '<div class="mr-mode-desc">' + mode.cn + ' \u00B7 ' + mode.desc + '</div>' +
        '</div>' +
        '<span class="mr-mode-tag">' + (mode.locked ? '\u041D\u0415 \u0414\u041E\u041F\u0423\u0429\u0415\u041D\u041E \u00B7 \u672A\u83B7\u51C6' : mode.tag) + '</span>';
      if (mode.id === 'endless' && window.Endless && Endless.hasSave && Endless.hasSave()) {
        var info = Endless.saveInfo ? Endless.saveInfo() : null;
        var cb = document.createElement('button');
        cb.className = 'mr-mode-continue';
        cb.textContent = '\u7EE7\u7EED\u4E0A\u6B21\u8FD0\u8425'
          + (info ? ' \u00B7 \u7B2C ' + info.month + ' \u6708 \u00B7 \u20BD' + info.money.toLocaleString('en') : '');
        cb.addEventListener('click', function(ev) {
          ev.stopPropagation();
          Audio.click();
          hideAll();
          if (onStartGame) onStartGame('endless_resume');
        });
        row.appendChild(cb);
      }
      row.addEventListener('click', function() { focusRight(i); confirmRight(); });
      container.appendChild(row);
    });
  }

  function removeMrFooter() {
    var existing = document.querySelector('.mr-footer');
    if (existing) existing.parentNode.removeChild(existing);
  }

  function renderRightPanel() {
    var right = document.getElementById('menu-right');
    var placeholder = right.querySelector('.mr-placeholder');
    var modeList = document.getElementById('mr-mode-list');
    var infoCard = document.getElementById('mr-info-card');
    modeList.style.display = 'none';
    infoCard.style.display = 'none';
    placeholder.style.display = 'none';
    removeMrFooter();

    var activeItem = LEFT_ITEMS[focus.leftIdx];
    if (!activeItem) return;

    if (activeItem.id === 'start') {
      if (focus.rightPowered) {
        right.classList.add('powered');
        renderModeList();
        modeList.style.display = 'flex';
      } else {
        right.classList.remove('powered');
        placeholder.style.display = 'block';
      }
    } else if (activeItem.id === 'archive') {
      right.classList.remove('powered');
      infoCard.style.display = 'flex';
      infoCard.innerHTML =
        '<div style="text-align:center;width:100%;padding:20px">' +
          '<div style="font-size:24px;color:#4A4E42;margin-bottom:10px">\u0410\u0420\u0425\u0418\u0412 \u00B7 \u6863\u6848\u7CFB\u7EDF</div>' +
          '<div style="font-size:11px;color:#C22410;border:1px solid #C22410;display:inline-block;padding:4px 12px;letter-spacing:2px;margin-bottom:10px">\u041D\u0415 \u0414\u041E\u0421\u0422\u0423\u041F\u0415\u041D \u00B7 \u672A\u5F00\u653E</div>' +
          '<div style="font-size:10px;color:#5A5E52;margin-top:6px">\u6863\u6848\u7CFB\u7EDF\u672A\u5C31\u7EEA</div>' +
          '<div style="font-size:9px;color:#4A4E42;margin-top:14px">v0.6 \u00AB\u041F\u0430\u043C\u044F\u0442\u044C\u00BB \u00B7 \u300A\u8BB0\u5FC6\u300B\u7248\u5EFA\u4E2D</div>' +
        '</div>';
    } else if (activeItem.id === 'settings') {
      right.classList.remove('powered');
      infoCard.style.display = 'flex';
      infoCard.innerHTML =
        '<div style="text-align:center;width:100%;padding:20px">' +
          '<div style="font-size:11px;color:#8A8E7C;margin-bottom:8px;letter-spacing:1px">\u041D\u0410\u0421\u0422\u0420\u041E\u0419\u041A\u0418 \u00B7 \u6574\u5B9A\u8BBE\u7F6E</div>' +
          '<div style="font-size:10px;color:#5A5E52;margin-bottom:14px">\u6574\u5B9A\u53C2\u6570 \u00B7 6 \u4E2A\u5206\u533A</div>' +
          '<div style="font-size:9px;color:#4A4E42">\u2192 \u6309\u23CE\u8FDB\u5165\u8BBE\u7F6E\u5C4F</div>' +
        '</div>';
    } else if (activeItem.id === 'exit') {
      right.classList.remove('powered');
      infoCard.style.display = 'flex';
      if (focus.exitConfirm) {
        infoCard.innerHTML =
          '<div style="text-align:center;width:100%;padding:20px">' +
            '<div style="font-size:14px;color:#D4C8A0;margin-bottom:12px;letter-spacing:2px">\u041F\u041E\u041A\u0418\u041D\u0423\u0422\u042C \u0421\u041C\u0415\u041D\u0423? \u00B7 \u9000\u51FA\u5F53\u524D\u73ED\u6B21\uFF1F</div>' +
            '<div style="font-size:9px;color:#5A5E52">\u786E\u8BA4\u9000\u73ED\uFF1F</div>' +
            '<div style="margin-top:16px;display:flex;gap:20px;justify-content:center;font-size:10px">' +
              '<span style="color:#7AE07A;border:1px solid #4A4E42;padding:4px 10px;border-radius:2px"><kbd style="font-family:inherit;color:#7AE07A">\u23CE</kbd> \u662F</span>' +
              '<span style="color:#C22410;border:1px solid #4A4E42;padding:4px 10px;border-radius:2px"><kbd style="font-family:inherit;color:#C22410">Esc</kbd> \u5426</span>' +
            '</div>' +
          '</div>';
      } else {
        infoCard.innerHTML =
          '<div style="text-align:center;width:100%;padding:20px">' +
            '<div style="font-size:11px;color:#8A8E7C;margin-bottom:8px">\u0412\u042B\u0425\u041E\u0414 \u00B7 \u9000\u51FA</div>' +
            '<div style="font-size:10px;color:#5A5E52">\u2192 \u6309\u23CE\u786E\u8BA4\u9000\u73ED</div>' +
          '</div>';
      }
    }
  }

  function focusLeft(idx) {
    if (idx < 0) idx = 0;
    if (idx >= LEFT_ITEMS.length) idx = LEFT_ITEMS.length - 1;
    var item = LEFT_ITEMS[idx];
    if (item.disabled) {
      if (idx < focus.leftIdx) { idx--; if (idx < 0) { idx = focus.leftIdx + 1; while (idx < LEFT_ITEMS.length && LEFT_ITEMS[idx].disabled) idx++; if (idx >= LEFT_ITEMS.length) idx = focus.leftIdx; } }
      else { idx++; if (idx >= LEFT_ITEMS.length) { idx = focus.leftIdx - 1; while (idx >= 0 && LEFT_ITEMS[idx].disabled) idx--; if (idx < 0) idx = focus.leftIdx; } }
    }
    if (idx < 0 || idx >= LEFT_ITEMS.length || LEFT_ITEMS[idx].disabled) return;
    focus.col = 'left';
    focus.leftIdx = idx;
    focus.rightPowered = false;
    focus.exitConfirm = false;
    renderLeftItems();
    renderRightPanel();
    Audio.beep(880, 0.025, 'square', 0.05);
  }

  function focusRight(idx) {
    if (idx < 0) idx = 0;
    if (idx >= MODE_ITEMS.length) idx = MODE_ITEMS.length - 1;
    focus.col = 'right';
    focus.rightIdx = idx;
    renderModeList();
    Audio.beep(880, 0.025, 'square', 0.05);
  }

  function addMrFooter() {
    var mf = document.createElement('div');
    mf.className = 'mr-footer';
    mf.textContent = '\u2191\u2193 \u9009\u62E9\u6A21\u5F0F  \u23CE \u8FDB\u5165  Esc \u8FD4\u56DE';
    document.getElementById('menu-right').appendChild(mf);
  }

  function confirmLeft() {
    Audio.click();
    var item = LEFT_ITEMS[focus.leftIdx];
    if (!item || item.disabled) return;

    if (item.id === 'start') {
      if (!focus.rightPowered) {
        focus.rightPowered = true;
        focus.col = 'right';
        focus.rightIdx = 0;
        renderLeftItems();
        renderRightPanel();
        renderModeList();
        addMrFooter();
        Audio.beep(440, 0.06, 'sawtooth', 0.08);
        setTimeout(function() { Audio.beep(660, 0.04, 'sawtooth', 0.06); }, 80);
      } else {
        confirmRight();
      }
    } else if (item.id === 'settings') {
      showSettings();
      } else if (item.id === 'exit') {
      if (focus.exitConfirm) {
        Audio.stopHum();
        document.body.style.transition = 'opacity 1s';
        document.body.style.opacity = '0';
        setTimeout(function() {
          try { window.close(); } catch(e) {}
          document.body.innerHTML = '<div style="color:#B8B2A0;background:#1A1C18;height:100vh;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:24px;letter-spacing:4px">\u0421\u041C\u0415\u041D\u0410 \u0417\u0410\u041A\u041E\u041D\u0427\u0415\u041D\u0410 \u00B7 \u73ED\u6B21\u5DF2\u7ED3\u675F</div>';
        }, 1000);
        return;
      }
      focus.exitConfirm = true;
      renderRightPanel();
    }
  }

  function confirmRight() {
    Audio.click();
    var mode = MODE_ITEMS[focus.rightIdx];
    if (!mode) return;
    if (mode.locked) {
      Audio.alarmTone();
      var row = document.querySelectorAll('.mr-mode-item')[focus.rightIdx];
      if (row) {
        row.style.transition = 'border-color 0.05s';
        row.style.borderColor = '#C22410';
        setTimeout(function() { row.style.borderColor = 'transparent'; }, 300);
      }
      return;
    }
    hideAll();
    if (onStartGame) onStartGame(mode.id);
  }

  function handleKey(e) {
    if (settingsEl && settingsEl.classList.contains('active')) {
      if (e.key === 'Escape') { hideSettings(); renderLeftItems(); renderRightPanel(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        settingsTabIdx = Math.max(0, settingsTabIdx - 1);
        renderSettingsTabs();
        e.preventDefault();
      }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        settingsTabIdx = Math.min(SETTINGS_TABS.length - 1, settingsTabIdx + 1);
        renderSettingsTabs();
        e.preventDefault();
      }
      return;
    }

    if (!menuEl || !menuEl.classList.contains('active')) return;
    e.preventDefault();

    if (focus.col === 'right') {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { focusRight(focus.rightIdx - 1); }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { focusRight(focus.rightIdx + 1); }
      else if (e.key === 'Escape') {
        focus.col = 'left';
        focus.rightPowered = false;
        renderLeftItems();
        renderRightPanel();
        Audio.click();
      }
      else if (e.key === 'Enter' || e.key === ' ') { confirmRight(); }
      else if (e.key === '1') { focusRight(0); if (!MODE_ITEMS[0].locked) confirmRight(); }
      else if (e.key === '2') { focusRight(1); if (!MODE_ITEMS[1].locked) confirmRight(); }
      else if (e.key === '3') { focusRight(2); if (!MODE_ITEMS[2].locked) confirmRight(); }
    } else {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { focusLeft(focus.leftIdx - 1); }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { focusLeft(focus.leftIdx + 1); }
      else if (e.key === 'Enter' || e.key === ' ') { confirmLeft(); }
      else if (e.key === 'Escape') {
        var item = LEFT_ITEMS[focus.leftIdx];
        if (item && item.id === 'exit' && focus.exitConfirm) {
          focus.exitConfirm = false;
          renderRightPanel();
          Audio.click();
        } else if (item && item.id === 'start' && focus.rightPowered) {
          focus.rightPowered = false;
          renderLeftItems();
          renderRightPanel();
          Audio.click();
        }
      }
    }
  }

  function handleClick(e) {
    if (settingsEl && settingsEl.classList.contains('active')) {
      if (e.target === document.getElementById('settings-close') ||
          e.target.closest('#settings-close')) { hideSettings(); }
      return;
    }
  }

  function show(cb) {
    onStartGame = cb;
    if (!menuEl) createMenuDOM();
    initSettingsValues();
    renderLeftItems();
    renderRightPanel();
    focus.col = 'left';
    focus.leftIdx = 0;
    focus.rightIdx = 0;
    focus.rightPowered = false;
    focus.exitConfirm = false;

    fetch('version.json').then(function(r) { return r.json(); }).then(function(v) {
      versionData = v;
      versionStr = 'v' + v.version + ' \u00B7 \u0441\u0431.' + v.build + ' \u00B7 ' + v.revision;
      var ve = document.getElementById('mf-version');
      if (ve) ve.textContent = versionStr;
      if (ve) ve.setAttribute('title', '\u7248\u672C \u00B7 \u6784\u5EFA ' + v.build + ' \u00B7 \u4FEE\u8BA2 ' + v.revision);
    }).catch(function() {
      var ve = document.getElementById('mf-version');
      if (ve) ve.textContent = 'v0.1.0 \u00B7 \u0441\u0431.2026.07.30 \u00B7 \u0420\u042D-86/12';
      if (ve) ve.setAttribute('title', '\u7248\u672C \u00B7 \u6784\u5EFA 2026.07.30 \u00B7 \u4FEE\u8BA2 \u0420\u042D-86/12');
    });

    Audio.ensureCtx();
    Audio.startHum();
    Audio.setHumVolume(0.012);
    restoreStoredSettings();

    clockSec = 0;
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(function() {
      clockSec++;
      var h = String(Math.floor(clockSec / 3600) % 24).padStart(2, '0');
      var m = String(Math.floor(clockSec / 60) % 60).padStart(2, '0');
      var s = String(clockSec % 60).padStart(2, '0');
      var clk = document.getElementById('menu-clock');
      if (clk) clk.textContent = h + ':' + m + ':' + s;
    }, 1000);

    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleClick);

    menuEl.classList.add('active');
    menuEl.style.display = '';
    setTimeout(function() {
      var lamp = document.querySelector('.mlamp[data-lamp="ready"]');
      if (lamp) lamp.classList.add('on');
    }, 400);
  }

  function hideAll() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (lampTimer) { clearInterval(lampTimer); lampTimer = null; }
    document.removeEventListener('keydown', handleKey);
    document.removeEventListener('click', handleClick);
    Audio.stopHum();
    if (menuEl) { menuEl.classList.remove('active'); menuEl.style.display = 'none'; }
    if (settingsEl) { settingsEl.classList.remove('active'); settingsEl.style.display = 'none'; }
  }

  function renderSettingsTabs() {
    var container = document.getElementById('settings-left');
    container.innerHTML = '';
    SETTINGS_TABS.forEach(function(tab, i) {
      var row = document.createElement('div');
      row.className = 'stab-item' + (i === settingsTabIdx ? ' focused' : '');
      row.dataset.idx = i;
      row.innerHTML =
        '<span class="stab-marker">' + (i === settingsTabIdx ? '\u25B6' : '\u00B7') + '</span>' +
        '<span>' + tab.ru + '</span>' +
        '<span style="font-size:9px;color:#5A5E52;margin-left:auto">' + tab.cn + '</span>';
      row.addEventListener('click', function() {
        settingsTabIdx = i;
        document.querySelectorAll('.stab-item').forEach(function(e) { e.classList.remove('focused'); e.querySelector('.stab-marker').textContent = '\u00B7'; });
        row.classList.add('focused');
        row.querySelector('.stab-marker').textContent = '\u25B6';
        renderSettingsContent(tab.id);
      });
      container.appendChild(row);
    });
    renderSettingsContent(SETTINGS_TABS[settingsTabIdx].id);
  }

  function renderSettingsContent(tabId) {
    var tab = SETTINGS_TABS.find(function(t) { return t.id === tabId; });
    if (!tab) return;
    document.getElementById('sr-title').textContent = tab.ru + ' \u00B7 ' + tab.cn;
    var data = SETTINGS_DATA[tabId];
    if (!data) return;
    var html = '';
    data.items.forEach(function(item) {
      if (item.type === 'slider') {
        html += '<div class="sr-row">' +
          '<span class="sr-label">' + item.label + '</span>' +
          '<div class="sr-control">' +
            '<input type="range" class="sr-slider" min="' + item.min + '" max="' + item.max + '" value="' + item.val + '" data-id="' + item.id + '" data-unit="' + (item.unit || '%') + '">' +
            '<span class="sr-slider-val">' + item.val + (item.unit || '%') + '</span>' +
          '</div>' +
        '</div>';
      } else if (item.type === 'toggle') {
        var activeIdx = item.val ? 0 : 1;
        html += '<div class="sr-row">' +
          '<span class="sr-label">' + item.label + '</span>' +
          '<div class="sr-control"><div class="sr-toggle" data-id="' + item.id + '">' +
            item.opts.map(function(o, i) { return '<button class="' + (i === activeIdx ? 'active' : '') + '" data-val="' + i + '">' + o + '</button>'; }).join('') +
          '</div></div>' +
        '</div>';
      } else if (item.type === 'label') {
        html += '<div class="sr-row">' +
          '<span class="sr-label" style="color:#5A5E52">' + item.label + '</span>' +
          '<span style="font-size:10px;color:#4A4E42">' + (item.info || '') + '</span>' +
        '</div>';
      } else if (item.type === 'version') {
        html += '<div class="sr-row"><span class="sr-label">' + item.label + '</span><span style="font-size:10px;color:#8A8E7C;text-align:right">' + (versionStr || '\u52A0\u8F7D\u4E2D...') + '</span></div>';
        if (versionData) {
          html += '<div class="sr-row"><span class="sr-label" style="font-size:10px;color:#5A5E52">\u7248\u672C\u540D</span><span style="font-size:10px;color:#5A5E52">\u00AB' + versionData.codename + '\u00BB</span></div>';
          html += '<div class="sr-row"><span class="sr-label" style="font-size:10px;color:#5A5E52">\u5E73\u53F0</span><span style="font-size:10px;color:#5A5E52">' + (versionData.platform === 'web' ? 'Web' : 'L\u00d6VE') + '</span></div>';
          html += '<div class="sr-row"><span class="sr-label" style="font-size:10px;color:#5A5E52">\u4F5C\u8005</span><span style="font-size:10px;color:#5A5E52">' + versionData.author + '</span></div>';
        }
      } else if (item.type === 'action') {
        html += '<div class="sr-row">' +
          '<span class="sr-label" style="color:' + (item.danger ? '#C22410' : '#8A8E7C') + '">' + item.label + '</span>' +
          '<span class="sf-action" data-action="' + item.id + '" style="font-size:10px;border:1px solid ' + (item.danger ? '#C22410' : '#4A4E42') + ';padding:2px 10px;border-radius:2px;color:' + (item.danger ? '#C22410' : '#8A8E7C') + '">\u2192</span>' +
        '</div>';
      }
    });
    document.getElementById('sr-content').innerHTML = html;

    document.querySelectorAll('#sr-content .sr-slider').forEach(function(slider) {
      slider.addEventListener('input', function() {
        var valEl = slider.parentElement.querySelector('.sr-slider-val');
        if (valEl) valEl.textContent = slider.value + (slider.dataset.unit || '%');
        applySetting(slider.dataset.id, parseFloat(slider.value));
      });
    });
    document.querySelectorAll('#sr-content .sr-toggle').forEach(function(toggle) {
      toggle.querySelectorAll('button').forEach(function(btn, bi) {
        btn.addEventListener('click', function() {
          toggle.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var activeIdx = bi === 0;
          applySetting(toggle.dataset.id, activeIdx);
        });
      });
    });
    document.querySelectorAll('#sr-content .sf-action[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = btn.dataset.action;
        if (action === 'clearSave') {
          if (confirm('\u786E\u8BA4\u6E05\u9664\u6240\u6709\u5B58\u6863\uFF1F')) {
            localStorage.removeItem('rbmk_journal');
            localStorage.removeItem('rbmk_journal_bak');
          }
        } else if (action === 'resetSettings') {
          if (confirm('\u786E\u8BA4\u8FD8\u539F\u51FA\u5382\u6574\u5B9A\uFF1F')) {
            if (window.Core) {
              var j = Core.Save.loadJournal();
              Core.Save.recordSettingsChange(j, Core.Save.defaultSettings());
            }
            initSettingsValues();
            renderSettingsContent(SETTINGS_TABS[settingsTabIdx].id);
            restoreStoredSettings();
          }
        }
      });
    });
  }

  function showSettings() {
    settingsTabIdx = 0;
    if (!settingsEl) createSettingsDOM();
    initSettingsValues();
    settingsEl.classList.add('active');
    renderSettingsTabs();
  }

  function hideSettings() {
    if (settingsEl) settingsEl.classList.remove('active');
    var cb = settingsCloseCb;
    settingsCloseCb = null;
    if (cb) cb();
  }

  function settingsEscHandler(e) {
    if (!settingsEl || !settingsEl.classList.contains('active')) return;
    if (menuEl && menuEl.classList.contains('active')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSettings();
    }
  }

  function openSettings(cb) {
    settingsCloseCb = cb || null;
    showSettings();
    if (!settingsEscBound) {
      settingsEscBound = true;
      document.addEventListener('keydown', settingsEscHandler);
    }
  }

  function hideMenu() {
    if (menuEl) { menuEl.classList.remove('active'); }
  }

  MENU.show = show;
  MENU.hide = hideAll;
  MENU.openSettings = openSettings;
  window.Menu = MENU;
})();
