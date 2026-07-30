(function() {
  var BOOT_EL = null;
  var skipped = false;
  var firstBoot = !localStorage.getItem('_boot_done');

  function createBootDOM() {
    var el = document.createElement('div');
    el.id = 'boot-overlay';
    el.innerHTML =
      '<div id="boot-text"></div>' +
      '<div id="boot-indicators">' +
        '<span class="boot-led"></span><span class="boot-led"></span><span class="boot-led"></span><span class="boot-led"></span><span class="boot-led"></span>' +
      '</div>';
    document.body.appendChild(el);
    BOOT_EL = el;
    return el;
  }

  function skip() {
    if (skipped) return;
    skipped = true;
    Audio.stopHum();
    if (BOOT_EL) {
      BOOT_EL.style.transition = 'opacity 0.2s';
      BOOT_EL.style.opacity = '0';
      setTimeout(function() {
        if (BOOT_EL && BOOT_EL.parentNode) BOOT_EL.parentNode.removeChild(BOOT_EL);
        BOOT_EL = null;
        done();
      }, 250);
    } else {
      done();
    }
  }

  var done = null;

  function play(callback) {
    done = callback;
    if (!firstBoot) {
      skip();
      return;
    }
    var el = createBootDOM();
    var textEl = document.getElementById('boot-text');

    var lines = [
      { t: 300, text: '\u0420\u0411\u041C\u041A-1000 \u0421\u0418\u0421\u0422\u0415\u041C\u0410 \u0423\u041F\u0420\u0410\u0412\u041B\u0415\u041D\u0418\u042F', sound: 'click' },
      { t: 800, text: '\u0418\u041D\u0418\u0426\u0418\u0410\u041B\u0418\u0417\u0410\u0426\u0418\u042F...', sound: 'beep' },
      { t: 1100, text: '\u0418\u041D\u0418\u0426\u0418\u0410\u041B\u0418\u0417\u0410\u0426\u0418\u042F...\n\u041F\u0420\u041E\u0412\u0415\u0420\u041A\u0410 \u0414\u0410\u0422\u0427\u0418\u041A\u041E\u0412...', sound: 'beep' },
      { t: 1400, text: '\u0418\u041D\u0418\u0426\u0418\u0410\u041B\u0418\u0417\u0410\u0426\u0418\u042F...\n\u041F\u0420\u041E\u0412\u0415\u0420\u041A\u0410 \u0414\u0410\u0422\u0427\u0418\u041A\u041E\u0412...\n\u0413\u041E\u0422\u041E\u0412\u041E', sound: 'beep' },
    ];

    el.style.opacity = '1';
    el.style.background = '#000';

    Audio.ensureCtx();
    Audio.click();

    setTimeout(function() {
      el.style.background = '#000';
      textEl.textContent = lines[0].text;
      textEl.style.color = '#7FFF7F';
      Audio.click();

      setTimeout(function() {
        textEl.textContent = lines[1].text;
        Audio.beep(660, 0.08, 'square', 0.08);
        Audio.startHum();

        setTimeout(function() {
          textEl.textContent = lines[2].text;
          Audio.beep(660, 0.08, 'square', 0.08);

          setTimeout(function() {
            textEl.textContent = lines[3].text;
            Audio.beep(660, 0.08, 'square', 0.08);

            setTimeout(function() {
              el.style.background = '#1E211D';
              textEl.style.color = '#C8CFC0';

              setTimeout(function() {
                var leds = document.querySelectorAll('.boot-led');
                var ledTimings = [0, 200, 400, 600, 800];
                var ledColors = ['#7FFF7F','#7FFF7F','#7FFF7F','#FFB347','#7FFF7F'];
                leds.forEach(function(led, i) {
                  setTimeout(function() {
                    led.style.background = ledColors[i];
                    led.style.boxShadow = '0 0 8px ' + ledColors[i];
                    Audio.beep(2000, 0.015, 'sine', 0.04);
                  }, ledTimings[i]);
                });

                setTimeout(function() {
                  el.style.transition = 'opacity 0.4s';
                  el.style.opacity = '0';
                  setTimeout(function() {
                    if (el.parentNode) el.parentNode.removeChild(el);
                    BOOT_EL = null;
                    localStorage.setItem('_boot_done', '1');
                    Audio.stopHum();
                    if (done) done();
                  }, 450);
                }, 1200);
              }, 400);
            }, 400);
          }, 350);
        }, 350);
      }, 350);
    }, 300);

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        document.removeEventListener('keydown', handler);
        document.removeEventListener('click', handler);
        skip();
      }
    });
    document.addEventListener('click', function handler(e) {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('click', handler);
      skip();
    });
  }

  window.Boot = { play: play, skip: skip };
})();