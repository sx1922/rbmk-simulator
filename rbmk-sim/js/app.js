(function() {
  const gt = id => document.getElementById(id);
  const S = RBMK.S;

  let lastTime = 0;
  let animId = null;

  const LOG_MAX = 50;

  function logEvent(type, msg) {
    const strip = gt('log-strip');
    if (!strip) return;
    const div = document.createElement('div');
    div.className = 'log-line ' + type;
    const hh = String(Math.floor((S.t / 3600) % 24)).padStart(2, '0');
    const mm = String(Math.floor((S.t / 60) % 60)).padStart(2, '0');
    const ss = String(Math.floor(S.t % 60)).padStart(2, '0');
    div.textContent = '[' + hh + ':' + mm + ':' + ss + '] ' + msg;
    strip.appendChild(div);
    while (strip.children.length > LOG_MAX) strip.removeChild(strip.firstChild);
    strip.scrollTop = strip.scrollHeight;
  }

  function updateLamps() {
    document.querySelectorAll('.lamp-unit').forEach(function(el) {
      const key = el.dataset.lamp;
      const on = S.alarms[key];
      el.classList.toggle('on-red', on);
      el.classList.toggle('blink', on);
    });
  }

  function updatePumps() {
    document.querySelectorAll('.pump-btn').forEach(function(el) {
      var i = parseInt(el.dataset.idx);
      if (!isNaN(i)) el.classList.toggle('running', !!S.pumps[i]);
    });
    gt('read-pumps').textContent = S.pumps.filter(Boolean).length;
    gt('read-flow').textContent = Math.round(S.flow);
  }

  function updateUI() {
    gt('read-target').textContent = S.targetPower + ' %';
    gt('read-mode').textContent = S.mode === 'auto' ? '\u81EA\u52A8' : '\u624B\u52A8';
    updatePumps();
    updateLamps();

    if (S.meltdown) {
      document.getElementById('room').classList.add('meltdown');
    }
  }

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.5) dt = 0.5;

    RBMK.step(dt);
    Render.frame();
    Props.updateDosimeter();
    updateUI();

    animId = requestAnimationFrame(loop);
  }

  function initSlider() {
    var slider = gt('slider-target');
    if (!slider) return;
    slider.addEventListener('input', function() {
      var v = parseFloat(slider.value);
      RBMK.setTargetPower(v);
      gt('read-target').textContent = v + ' %';
    });
  }

  function initRockers() {
    document.querySelectorAll('.rocker').forEach(function(group) {
      group.querySelectorAll('button').forEach(function(btn) {
        btn.addEventListener('click', function() {
          group.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var val = btn.dataset.val;
          var id = group.id;
          if (id === 'rocker-speed') {
            RBMK.setRodSpeed(parseFloat(val));
          } else if (id === 'rocker-mode') {
            RBMK.setMode(val);
          } else if (id === 'rocker-timescale') {
            RBMK.setTimeScale(parseFloat(val));
          }
        });
      });
    });
  }

  function initPumps() {
    var bank = gt('pump-bank');
    if (!bank) return;
    bank.innerHTML = '';
    for (var i = 1; i <= 8; i++) {
      var btn = document.createElement('button');
      btn.className = 'pump-btn' + (S.pumps[i - 1] ? ' running' : '');
      btn.dataset.idx = i - 1;
      btn.dataset.no = i;
      btn.title = '\u0413\u0426\u041D-' + i;
      btn.addEventListener('click', (function(idx) {
        return function() { RBMK.togglePump(idx); };
      })(i - 1));
      bank.appendChild(btn);
    }
  }

  function initAZ5() {
    var btn = gt('btn-az5');
    if (!btn) return;
    btn.addEventListener('click', function() {
      RBMK.manualAZ();
    });
    var cover = gt('az-cover');
    if (cover) {
      cover.addEventListener('click', function(e) {
        if (e.target === cover || e.target.classList.contains('az-cover-glass')) {
          cover.classList.toggle('open');
        }
      });
    }
    var keySwitch = gt('key-switch');
    if (keySwitch) {
      keySwitch.addEventListener('click', function() {
        RBMK.toggleKey();
        keySwitch.classList.toggle('locked', S.azBlocked);
        gt('key-handle').style.transform = S.azBlocked
          ? 'translate(-50%, -80%) rotate(90deg)'
          : 'translate(-50%, -80%) rotate(0deg)';
      });
    }
  }

  function initAlarmLamps() {
    document.querySelectorAll('.lamp-unit').forEach(function(el) {
      el.addEventListener('click', function() {
        var key = el.dataset.lamp;
        el.classList.toggle('on-red');
        el.classList.toggle('blink');
      });
    });
  }

  function init() {
    S.onEvent = logEvent;
    S.onAlarm = function(key, val) {
      logEvent(val ? 'alarm' : 'info', key + ' ' + (val ? '\u52A8\u4F5C' : '\u590D\u5F52'));
    };

    logEvent('info', '\u4EFF\u771F\u7CFB\u7EDF\u542F\u52A8 | \u0420\u0411\u041C\u041A-1000 \u0411\u041B\u041E\u041A \u21164');
    logEvent('info', '\u521D\u59CB\u72B6\u6001: N = ' + Math.round(S.n * RBMK.N_NOM) + ' \u041C\u0412\u0442, \u041E\u0417\u0420 = ' + S.opr + ' \u0441\u0442.');

    initSlider();
    initRockers();
    initPumps();
    initAZ5();
    initAlarmLamps();
    Props.init();

    lastTime = 0;
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
