(function() {
  const gt = id => document.getElementById(id);
  const S = RBMK.S;

  let VERSION = null;
  let lastTime = 0;
  let animId = null;
  let gameStarted = false;

  const LOG_MAX = 50;

  function fmtVer(v) {
    return 'v' + v.version + ' (\u0441\u0431.' + v.build + ', ' + v.revision + ')';
  }

  function showAbout() {
    if (!VERSION) return;
    gt('about-version').textContent = 'v' + VERSION.version + ' \u00AB' + VERSION.codename + '\u00BB';
    gt('about-build').textContent = VERSION.build;
    gt('about-revision').textContent = VERSION.revision;
    gt('about-author').textContent = VERSION.author;
    gt('about-platform').textContent = VERSION.platform === 'web' ? 'Web (Canvas 2D)' : 'L\u00d6VE 2D';
    gt('about-notes').textContent = VERSION.notes;
    gt('about-overlay').classList.remove('hidden');
  }

  function closeAbout() {
    gt('about-overlay').classList.add('hidden');
  }

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

  function startGame() {
    if (gameStarted) return;
    gameStarted = true;

    RBMK.reset();
    Audio.startHum();
    Audio.setHumVolume(0.008);

    initSlider();
    initRockers();
    initPumps();
    initAZ5();
    initAlarmLamps();
    Props.init();

    gt('room').style.display = 'flex';

    logEvent('info', '\u0421\u041C\u0415\u041D\u0410 \u041D\u0410\u0427\u0410\u0422\u0410 | \u0420\u0411\u041C\u041A-1000 \u0411\u041B\u041E\u041A \u21164');
    logEvent('info', '\u041D\u0430\u0447\u0430\u043B\u044C\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: N = ' + Math.round(S.n * RBMK.N_NOM) + ' \u041C\u0412\u0442, \u041E\u0417\u0420 = ' + S.opr + ' \u0441\u0442.');

    lastTime = 0;
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  }

  window.App = { startGame: startGame, showAbout: showAbout, closeAbout: closeAbout };

  function initSlider() {
    var slider = gt('slider-target');
    if (!slider) return;
    if (slider._listening) return;
    slider._listening = true;
    slider.addEventListener('input', function() {
      var v = parseFloat(slider.value);
      RBMK.setTargetPower(v);
      gt('read-target').textContent = v + ' %';
    });
  }

  function initRockers() {
    document.querySelectorAll('.rocker').forEach(function(group) {
      if (group._listening) return;
      group._listening = true;
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
    if (!bank || bank._listening) return;
    bank._listening = true;
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
    if (!btn || btn._listening) return;
    btn._listening = true;
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
      if (el._listening) return;
      el._listening = true;
      el.addEventListener('click', function() {
        var key = el.dataset.lamp;
        el.classList.toggle('on-red');
        el.classList.toggle('blink');
      });
    });
  }

  function init() {
    fetch('version.json').then(function(r) { return r.json(); }).then(function(v) {
      VERSION = v;
      console.log('\u0429\u0418\u0422 ' + fmtVer(v) + ' \u00B7 ' + v.author);
      gt('stamp-version').textContent = 'v' + v.version;
      gt('stamp-build').textContent = '\u0441\u0431.' + v.build;
      gt('stamp-revision').textContent = v.revision;
    }).catch(function() {
      console.log('\u0429\u0418\u0422 v0.1.0 (\u0441\u0431.2026.07.30, \u0420\u042D-86/12) \u00B7 sx1922');
    });

    gt('btn-about-close').addEventListener('click', closeAbout);
    gt('about-overlay').addEventListener('click', function(e) {
      if (e.target === gt('about-overlay')) closeAbout();
    });
    var aboutBtn = document.querySelector('.prop[data-prop="about"]');
    if (aboutBtn) aboutBtn.addEventListener('click', function() { App.showAbout(); });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeAbout();
    });

    gt('room').style.display = 'none';

    Boot.play(function() {
      Menu.show(function() {
        App.startGame();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
