/* Debrief \u2014 \u7ed3\u7b97\u753b\u9762 \u5386\u53f2\u5339\u914d\u5ea6 */

(function() {
  var overlay = null;
  var onReturn = null;
  var fadeTimer = null;

  var DIM_CN = {
    procedure: '\u89C4\u7A0B\u9075\u5B88',
    safety: '\u5B89\u5168\u88D5\u5EA6',
    response: '\u54CD\u5E94\u901F\u5EA6',
    equipment: '\u8BBE\u5907\u72B6\u6001',
    completeness: '\u8BB0\u5F55\u5B8C\u6574\u6027',
  };

  var END_TYPE_CN = {
    MELTDOWN: '\u5806\u82AF\u7194\u6BC1',
    EXPLOSION: '\u7206\u70B8',
    SAFE_SHUTDOWN: '\u5B89\u5168\u505C\u5806',
    VOLUNTARY: '\u4E3B\u52A8\u9000\u73ED',
    TIMEOUT: '\u8D85\u65F6',
    OBJECTIVE_COMPLETE: '\u76EE\u6807\u8FBE\u6210',
    BANKRUPT: '\u7834\u4EA7\u63A5\u7BA1',
  };

  var FREE_QUOTE = {
    VOLUNTARY: '\u4F60\u505A\u4E86\u6B63\u786E\u7684\u4E8B\u3002\u6CA1\u6709\u4EBA\u611F\u8C22\u4F60\u3002',
    MELTDOWN: '\u56DB\u53F7\u673A\u7EC4\u4E0D\u518D\u5B58\u5728\u3002',
    SAFE_SHUTDOWN: '\u4F60\u505A\u4E86\u6B63\u786E\u7684\u4E8B\u3002\u6CA1\u6709\u4EBA\u611F\u8C22\u4F60\u3002',
  };

  function ensure() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'debrief-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML =
      '<div id="debrief-frame">' +
        '<div id="debrief-head">' +
          '<span>\u0421\u041C\u0415\u041D\u0410 \u0417\u0410\u0412\u0415\u0420\u0428\u0415\u041D\u0410 / \u503C\u73ED\u7ED3\u675F</span>' +
          '<span id="debrief-endtype"></span>' +
        '</div>' +
        '<div id="debrief-body">' +
          '<div id="debrief-left"></div>' +
          '<div id="debrief-right"></div>' +
        '</div>' +
        '<div id="debrief-foot">' +
          '<span><kbd>\u23CE</kbd> / <kbd>Esc</kbd> \u8FD4\u56DE\u4E3B\u83DC\u5355</span>' +
          '<span id="debrief-match"></span>' +
        '</div>' +
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

  function row(label, value) {
    return '<div class="db-row"><span class="db-label">' + label + '</span><span class="db-value">' + value + '</span></div>';
  }

  function fmtMoney(v) {
    return Math.round(v).toLocaleString('en');
  }

  function fmtRating(r) {
    if (!r) return '\u2014';
    return '<b>' + r.rating + '</b> <i style="color:#6A6E5E">' + r.cn + '</i>';
  }

  function renderLeft(data) {
    var S = data.finalState || {};
    var html = '';
    html += row('\u8FD0\u884C\u65F6\u957F', fmtDur(data.duration));
    html += row('\u7EC8\u5C40\u7C7B\u578B', END_TYPE_CN[data.endType] || data.endType);
    if (data.mode === 'endless' && data.endlessStats) {
      var st = data.endlessStats;
      html += row('\u8FD0\u8425\u65F6\u95F4', st.months + ' \u4E2A\u6708 / ' + st.days + ' \u5929');
      html += row('\u7D2F\u8BA1\u53D1\u7535\u91CF', st.gwh.toFixed(2) + ' GWh');
      html += row('\u5E73\u5747\u529F\u7387', st.avgPower.toFixed(1) + ' %');
      html += row('\u53D8\u6362\u6599\u6B21\u6570', st.refuels + ' \u6B21');
      html += row('\u5927\u4FEE\u6B21\u6570', st.overhauls + ' \u6B21');
      html += row('\u73ED\u7EC4\u5E73\u5747\u80FD\u529B', (st.crewComp * 100).toFixed(0) + ' %');
      html += row('AZ-5 \u505C\u5806', st.scrams + ' \u6B21');
      html += row('\u8B66\u62A5', st.alarms + ' \u6B21');
      html += row('\u71C3\u801D', st.burnup.toFixed(1) + ' / 40');
      if (st.best && st.best > st.score) html += row('\u6700\u4F73\u8BB0\u5F55', st.best + ' \u5206');
    } else if (data.mode === 'challenge' && data.challengeStats) {
      var cs = data.challengeStats;
      var mm = String(Math.floor(cs.survived / 60)).padStart(2, '0');
      var ss = String(cs.survived % 60).padStart(2, '0');
      html += row('\u575A\u6301\u65F6\u95F4', mm + ':' + ss + ' / 15:00');
      html += row('\u5904\u7F6E\u4E8B\u4EF6', cs.eventsOk + ' / ' + cs.events);
      html += row('\u8B66\u62A5\u6B21\u6570', cs.alarms + ' \u6B21');
      html += row('AZ-5 \u505C\u5806', cs.scrams + ' \u6B21');
      if (cs.best && cs.best > cs.score) html += row('\u6700\u4F73\u8BB0\u5F55', cs.best + ' \u5206');
    } else {
      html += row('\u6700\u7EC8\u529F\u7387', Math.round((S.n || 0) * 3200) + ' MW');
      html += row('ORM', (S.opr !== undefined ? S.opr : '--') + ' \u6839');
      html += row('\u64CD\u4F5C\u6B21\u6570', data.opCount || 0);
      html += '<div class="db-sep">\u2500\u2500\u2500 \u8BC4\u5206 \u2500\u2500\u2500</div>';
      var dims = data.report.dimensions || {};
      var keys = ['procedure', 'safety', 'response', 'equipment', 'completeness'];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (dims[k] === undefined) continue;
        var r = (data.report.ratings || {})[k];
        html += row(DIM_CN[k], fmtRating(r));
      }
    }
    if (data.decisions && data.decisions.length > 0) {
      html += '<div class="db-sep">\u2500\u2500\u2500 \u5173\u952E\u51B3\u7B56 \u2500\u2500\u2500</div>';
      for (var j = 0; j < data.decisions.length; j++) {
        var d = data.decisions[j];
        html += row(d.id, d.choice);
      }
    }
    overlay.querySelector('#debrief-left').innerHTML = html;
  }

  function renderRight(data) {
    var box = overlay.querySelector('#debrief-right');
    if (data.mode === 'story') {
      var epi = data.epilogue || '';
      var lines = epi.split('\n');
      var html = '<div id="debrief-epilogue">';
      lines.forEach(function(ln) {
        html += '<div class="db-epi-line" style="opacity:0">' + (ln.trim() || '&nbsp;') + '</div>';
      });
      html += '</div>';
      box.innerHTML = html;
      var els = box.querySelectorAll('.db-epi-line');
      var i = 0;
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = setInterval(function() {
        if (i >= els.length) { clearInterval(fadeTimer); fadeTimer = null; return; }
        els[i].style.opacity = 1;
        i++;
      }, 800);
    } else if (data.mode === 'endless' && data.endlessStats) {
      var st = data.endlessStats;
      var bd = st.breakdown || {};
      var html = '<div style="width:100%;display:flex;flex-direction:column;">';
      html += '<div class="db-sep" style="margin-bottom:6px;">\u2500\u2500\u2500 \u65E0\u5C3D\u8FD0\u8425\u7ED3\u7B97 \u2500\u2500\u2500</div>';
      html += row('\u8FD0\u8425\u65F6\u95F4', st.months + ' \u4E2A\u6708 / ' + st.days + ' \u5929');
      html += row('\u7D2F\u8BA1\u53D1\u7535\u91CF', st.gwh.toFixed(2) + ' GWh');
      html += row('\u83B7\u5229\u603B\u989D', fmtMoney(st.profitTotal) + ' \u20BD');
      html += row('\u7EC8\u7ED3\u73B0\u91D1', fmtMoney(st.money) + ' \u20BD');
      html += row('\u6362\u6599\u6B21\u6570', st.refuels + ' \u6B21');
      html += row('AZ-5 \u505C\u5806', st.scrams + ' \u6B21');
      html += row('\u8B66\u62A5', st.alarms + ' \u6B21');
      html += '<div class="db-sep" style="margin-bottom:6px;">\u2500\u2500\u2500 \u8BC4\u5206\u7EC6\u5206 \u2500\u2500\u2500</div>';
      html += row('\u53D1\u7535 ' + st.gwh.toFixed(1) + ' GWh', '+' + (bd.generation || 0));
      html += row('\u8FD0\u884C ' + st.days + ' \u5929', '+' + (bd.survival || 0));
      html += row('\u5B89\u5168 (\u505C\u5806/\u8B66\u62A5\u6263\u5206)', '+' + (bd.safety || 0));
      html += row('\u76C8\u5229 ' + fmtMoney(st.profitTotal) + ' \u20BD', '+' + (bd.profit || 0));
      html += row('\u6548\u7387 ' + st.avgPower.toFixed(1) + ' %', '+' + (bd.efficiency || 0));
      html += '<div style="margin-top:14px;text-align:center;font-size:26px;font-family:monospace;color:#e8e8c8;">' +
        '<b>' + st.score + '</b> <span style="font-size:12px;color:#8a8e7c;">\u5206</span>' +
        '<span style="display:block;font-size:20px;margin-top:2px;color:' + (st.letter === 'S' ? '#e8b03c' : st.letter === 'A' ? '#7ae07a' : st.letter === 'B' ? '#9ab06a' : '#8a8e7c') + ';">\u8BC4\u7EA7 ' + st.letter + '</span></div>';
      box.innerHTML = html + '</div>';
    } else if (data.mode === 'challenge' && data.challengeStats) {
      var cs2 = data.challengeStats;
      var mm2 = String(Math.floor(cs2.survived / 60)).padStart(2, '0');
      var ss2 = String(cs2.survived % 60).padStart(2, '0');
      var html2 = '<div style="width:100%;display:flex;flex-direction:column;">';
      html2 += '<div class="db-sep" style="margin-bottom:6px;">\u2500\u2500\u2500 \u6311\u6218\u7ED3\u7B97 \u2500\u2500\u2500</div>';
      html2 += row('\u575A\u6301\u65F6\u95F4', mm2 + ':' + ss2 + ' / 15:00');
      html2 += row('\u5904\u7F6E\u4E8B\u4EF6', cs2.eventsOk + ' / ' + cs2.events + ' \u8D77');
      html2 += row('AZ-5 \u505C\u5806', cs2.scrams + ' \u6B21');
      html2 += row('\u8B66\u62A5', cs2.alarms + ' \u6B21');
      if (cs2.best && cs2.best > cs2.score) html2 += row('\u6700\u4F73\u8BB0\u5F55', cs2.best + ' \u5206');
      html2 += '<div style="margin-top:14px;text-align:center;font-size:26px;font-family:monospace;color:#e8e8c8;">' +
        '<b>' + cs2.score + '</b> <span style="font-size:12px;color:#8a8e7c;">\u5206</span>' +
        '<span style="display:block;font-size:20px;margin-top:2px;color:' + (cs2.score >= 3000 ? '#e8b03c' : cs2.score >= 2000 ? '#7ae07a' : '#8a8e7c') + ';">' +
        (cs2.score >= 3000 ? '\u8BC4\u7EA7 S' : cs2.score >= 2000 ? '\u8BC4\u7EA7 A' : cs2.score >= 1200 ? '\u8BC4\u7EA7 B' : '\u8BC4\u7EA7 C') + '</span></div>';
      box.innerHTML = html2 + '</div>';
    } else {
      var quote = FREE_QUOTE[data.endType] || FREE_QUOTE.VOLUNTARY;
      box.innerHTML = '<div id="debrief-quote">\u201C' + quote + '\u201D</div>';
    }
  }

  function handleKey(e) {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      Debrief.hide();
      onReturn && onReturn();
    }
  }

  var Debrief = {
    show: function(data) {
      ensure();
      onReturn = data.onReturn || null;
      overlay.querySelector('#debrief-endtype').textContent = END_TYPE_CN[data.endType] || data.endType;
      overlay.querySelector('#debrief-endtype').className = 'db-endtype ' + (data.endType === 'MELTDOWN' ? 'danger' : 'ok');
      var matchEl = overlay.querySelector('#debrief-match');
      if (data.mode === 'story' && data.matchScore !== null && data.matchScore !== undefined) {
        matchEl.textContent = '\u5386\u53F2\u5339\u914D\u5EA6: ' + data.matchScore + '%';
      } else {
        matchEl.textContent = '';
      }
      renderLeft(data);
      renderRight(data);
      overlay.classList.remove('hidden');
      document.addEventListener('keydown', handleKey);
    },
    hide: function() {
      if (!overlay) return;
      overlay.classList.add('hidden');
      if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
      document.removeEventListener('keydown', handleKey);
    },
    isOpen: function() {
      return overlay && !overlay.classList.contains('hidden');
    },
  };

  window.Debrief = Debrief;

  /* ================= \u5386\u53f2\u5339\u914d\u5ea6 ================= */

  var SCORE_TABLE = {
    xenon_pit: { continue: 20, shutdown: 10 },
    saor_disable: { obey: 15, refuse: 5 },
    az5_press: { press: 20, no_press: 0 },
    page47_found: { found: 10 },
  };

  var WEIGHTS = {
    xenon_pit: 1.5,
    saor_disable: 1.0,
    az5_press: 2.0,
    page47_found: 0.5,
  };

  function calcMatchScore(decisions, flags) {
    decisions = decisions || [];
    flags = flags || {};
    if (decisions.length === 0) return null;

    var base = 0;
    var weightSum = 0;
    var seen = {};
    for (var i = 0; i < decisions.length; i++) {
      var d = decisions[i];
      var table = SCORE_TABLE[d.id];
      if (!table || table[d.choice] === undefined) continue;
      if (seen[d.id]) continue;
      seen[d.id] = true;
      base += table[d.choice];
      weightSum += (WEIGHTS[d.id] || 1);
    }
    if (weightSum === 0) return null;
    var score = base * (weightSum / decisions.filter(function(d) {
      return !!SCORE_TABLE[d.id] && SCORE_TABLE[d.id][d.choice] !== undefined;
    }).length) * (decisions.filter(function(d) {
      return !!SCORE_TABLE[d.id] && SCORE_TABLE[d.id][d.choice] !== undefined;
    }).length / Math.max(1, Object.keys(WEIGHTS).length));
    score = Math.min(100, score);

    if (flags.discovered_page_47 && (flags.az5_pressed || flags.action_az_pressed)) score += 5;
    if (flags.all_phones_missed) score -= 5;
    if (flags.voluntary_shutdown) score = Math.min(score, 60);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  window.MatchScorer = { calc: calcMatchScore, SCORE_TABLE: SCORE_TABLE, WEIGHTS: WEIGHTS };
})();
