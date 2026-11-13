/* PauseMenu \u2014 FLOW-01 \u00a78-9 \u6682\u505c\u83dc\u5355 + \u7ed3\u675f\u503c\u73ed\u786e\u8ba4 */

(function() {
  var overlay = null;
  var focusIdx = 0;
  var items = [];
  var confirmMode = false;
  var onEndShift = null;
  var onResume = null;
  var onSettings = null;
  var onCancel = null;

  function ensure() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML =
      '<div id="pause-card">' +
        '<div id="pause-title">\u041F\u0410\u0423\u0417\u0410 / \u6682\u505C</div>' +
        '<div id="pause-items"></div>' +
        '<div id="pause-hint"><kbd>Esc</kbd> \u7EE7\u7EED</div>' +
      '</div>' +
      '<div id="pause-confirm" class="hidden">' +
        '<div id="pause-confirm-title">\u786E\u8BA4\u7ED3\u675F\u503C\u73ED\uFF1F</div>' +
        '<div id="pause-confirm-stats"></div>' +
        '<div id="pause-confirm-keys"><span><kbd>\u23CE</kbd> \u786E\u8BA4</span><span><kbd>Esc</kbd> \u53D6\u6D88</span></div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  function fmtDur(ms) {
    var s = Math.floor(ms / 1000);
    var h = String(Math.floor(s / 3600) % 24).padStart(2, '0');
    var m = String(Math.floor(s / 60) % 60).padStart(2, '0');
    var ss = String(s % 60).padStart(2, '0');
    return h + ':' + m + ':' + ss;
  }

  function render() {
    ensure();
    var list = overlay.querySelector('#pause-items');
    list.innerHTML = '';
    items.forEach(function(it, i) {
      var row = document.createElement('div');
      row.className = 'pause-item' + (i === focusIdx ? ' focused' : '');
      row.innerHTML = '<span class="pause-marker">' + (i === focusIdx ? '\u25B6' : '\u00B7') + '</span>' +
        '<span>' + it.ru + '</span>' +
        '<span style="font-size:10px;color:#5A5E52">' + it.cn + '</span>';
      row.addEventListener('click', function() {
        focusIdx = i;
        render();
        activate();
      });
      list.appendChild(row);
    });
  }

  function activate() {
    var it = items[focusIdx];
    if (!it) return;
    if (it.id === 'resume') onResume && onResume();
    else if (it.id === 'settings') onSettings && onSettings();
    else if (it.id === 'end') showConfirm();
  }

  function showConfirm() {
    confirmMode = true;
    overlay.querySelector('#pause-card').classList.add('hidden');
    var box = overlay.querySelector('#pause-confirm');
    box.classList.remove('hidden');
    var stats = box.querySelector('#pause-confirm-stats');
    if (onStats) stats.textContent = onStats();
  }

  function hideConfirm() {
    confirmMode = false;
    overlay.querySelector('#pause-card').classList.remove('hidden');
    overlay.querySelector('#pause-confirm').classList.add('hidden');
  }

  function handleKey(e) {
    if (overlay.classList.contains('hidden')) return;
    if (confirmMode) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmOnly) { Pause.hide(); onResume && onResume(); }
        else hideConfirm();
        Audio.click();
      }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEndShift && onEndShift(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); onResume && onResume(); }
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault(); focusIdx = (focusIdx - 1 + items.length) % items.length; render(); Audio.click();
    }
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault(); focusIdx = (focusIdx + 1) % items.length; render(); Audio.click();
    }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  }

  var onStats = null;
  var confirmOnly = false;

  var Pause = {
    show: function(opts) {
      items = opts.items || [
        { id: 'resume', ru: '\u041F\u0420\u041E\u0414\u041E\u041B\u0416\u0418\u0422\u042C', cn: '\u7EE7\u7EED\u503C\u73ED' },
        { id: 'settings', ru: '\u041D\u0410\u0421\u0422\u0420\u041E\u0419\u041A\u0418', cn: '\u6574\u5B9A\u8BBE\u7F6E' },
        { id: 'end', ru: '\u041A\u041E\u041D\u0415\u0426 \u0421\u041C\u0415\u041D\u042B', cn: '\u7ED3\u675F\u503C\u73ED' },
      ];
      onEndShift = opts.onEndShift;
      onResume = opts.onResume;
      onSettings = opts.onSettings;
      onCancel = opts.onCancel;
      onStats = opts.stats || null;
      focusIdx = 0;
      confirmMode = false;
      confirmOnly = !!opts.confirmOnly;
      ensure();
      overlay.classList.remove('hidden');
      overlay.querySelector('#pause-card').classList.remove('hidden');
      overlay.querySelector('#pause-confirm').classList.add('hidden');
      render();
      document.addEventListener('keydown', handleKey);
      Audio.click();
      if (opts.confirmOnly) showConfirm();
    },
    hide: function() {
      ensure();
      overlay.classList.add('hidden');
      document.removeEventListener('keydown', handleKey);
    },
    isOpen: function() {
      return overlay && !overlay.classList.contains('hidden');
    },
  };

  window.Pause = Pause;
})();
