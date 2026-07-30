const RBMK = (() => {

  const N_NOM = 3200;
  const N_MAX = 3840;
  const N_MIN_AUTO = 160;
  const RODS_TOTAL = 211;
  const ROD_SPEED = 0.4;
  const SCRAM_TIME = 18;
  const OPR_LIMIT = 15;
  const OPR_SCRAM = 8;
  const BETA_EFF = 0.0065;
  const LAMBDA = 0.08;
  const XE_EQ_TIME = 40;
  const XE_BURN = 0.9;
  const I_DECAY = 0.105;

  const S = {
    t: 0,
    running: true,
    timeScale: 10,
    n: 0.625,
    nPrev: 0.625,
    period: Infinity,
    C: 0.625,
    rho: 0,
    rhoComponents: { rod: 0, void: 0, xe: 0, tip: 0, doppler: 0 },
    rodPos: 55,
    rodTarget: 55,
    rodSpeed: ROD_SPEED,
    scramming: false,
    scramT: 0,
    azFired: false,
    azBlocked: false,
    xe: 0.4,
    iodine: 0.4,
    voidFrac: 20,
    flow: 100,
    pumps: [true,true,true,true,true,true,false,false],
    pressure: 6.9,
    level: 50,
    fuelTemp: 280,
    protections: { P1: true, P2: true, P3: true, P4: true, P5: true },
    alarms: { P1: false, P2: false, P3: false, P4: false, P5: false, AZ: false },
    mode: 'auto',
    targetPower: 62,
    doseRate: 0.12,
    doseTotal: 0.4,
    meltdown: false,
    coreDamage: 0,
    opr: 30,
    onEvent: null,
    onAlarm: null,
  };

  function emit(type, msg) {
    if (S.onEvent) S.onEvent(type, msg, S.t);
  }
  function alarmSet(key, val) {
    if (S.alarms[key] !== val) {
      S.alarms[key] = val;
      if (S.onAlarm) S.onAlarm(key, val);
    }
  }

  function stepXenon(dt_h) {
    const nEq = S.n;
    S.iodine += (nEq - S.iodine) * Math.min(1, dt_h * 1.6);
    const burn = XE_BURN * S.n * S.xe;
    const prod = I_DECAY * S.iodine * 10;
    const decay = 0.075 * S.xe;
    S.xe += (prod - burn - decay) * dt_h * 6;
    S.xe = Math.max(0, Math.min(2.5, S.xe));
  }

  function stepVoid(dt) {
    const target = Math.max(0, 8 + S.n * 26 - (S.flow - 100) * 0.35);
    S.voidFrac += (target - S.voidFrac) * Math.min(1, dt / 3);
    S.voidFrac = Math.max(0, Math.min(80, S.voidFrac));
  }

  function computeOPR() {
    const rodTerm = (100 - S.rodPos) * 0.42;
    const xeTerm = S.xe * 12;
    S.opr = Math.max(0, Math.round(rodTerm - xeTerm + 8));
    return S.opr;
  }

  function computeReactivity() {
    const rc = S.rhoComponents;
    rc.rod = (S.rodPos - 50) * 0.0016;
    if (!S.scramming) {
      const lifting = S.rodTarget > S.rodPos;
      const lowFactor = Math.max(0, (40 - S.rodPos) / 40);
      rc.tip = lifting ? 0.35 * lowFactor * (S.opr < OPR_LIMIT ? 1.8 : 0.6) : 0;
    } else {
      const progress = S.scramT / SCRAM_TIME;
      rc.tip = progress < 0.35 ? 0.9 * (1 - progress / 0.35) * (S.opr < OPR_LIMIT ? 2.2 : 0.8) : 0;
    }
    rc.void = (S.voidFrac - 20) * 0.0028;
    rc.xe = -(S.xe - 0.4) * 0.22;
    rc.doppler = -(S.n - 0.6) * 0.05;
    S.rho = rc.rod + rc.tip + rc.void + rc.xe + rc.doppler;
    return S.rho;
  }

  function stepKinetics(dt) {
    S.nPrev = S.n;
    const rhoDollar = S.rho / BETA_EFF;
    const h = Math.min(dt, 0.05);
    let steps = Math.ceil(dt / h);
    const hh = dt / steps;
    for (let i = 0; i < steps; i++) {
      const dn = ((rhoDollar - 1) * S.n + LAMBDA * S.C) * hh;
      S.n += dn;
      S.C += (S.n - S.C) * LAMBDA * hh;
      S.n = Math.max(1e-5, S.n);
    }
    const dn = S.n - S.nPrev;
    if (Math.abs(dn) > 1e-6 && S.n > 1e-4) {
      S.period = (S.n * dt) / dn;
    } else {
      S.period = Infinity;
    }
  }

  function stepRods(dt) {
    if (S.scramming) {
      S.scramT += dt;
      S.rodPos = Math.max(0, S.rodPos - (100 / SCRAM_TIME) * dt);
      if (S.rodPos <= 0) {
        S.rodPos = 0;
        if (S.scramT > SCRAM_TIME + 2) S.scramming = false;
      }
      return;
    }
    if (S.mode === 'auto') {
      const err = S.targetPower / 100 - S.n;
      if (Math.abs(err) > 0.005) {
        S.rodTarget = Math.max(0, Math.min(100,
          S.rodTarget + Math.sign(err) * S.rodSpeed * dt * 2));
      }
    }
    const diff = S.rodTarget - S.rodPos;
    if (Math.abs(diff) > 0.01) {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), S.rodSpeed * dt);
      S.rodPos += step;
    }
    S.rodPos = Math.max(0, Math.min(100, S.rodPos));
  }

  function stepThermal(dt) {
    S.flow = S.pumps.filter(p => p).length / 8 * 100;
    const pTarget = 6.5 + S.n * 0.65;
    S.pressure += (pTarget - S.pressure) * Math.min(1, dt / 5);
    const lTarget = 50 + (S.flow - 100) * 0.2;
    S.level += (lTarget - S.level) * Math.min(1, dt / 4);
    const tTarget = 270 + S.n * 30;
    S.fuelTemp += (tTarget - S.fuelTemp) * Math.min(1, dt / 8);
  }

  function stepProtections() {
    const P = S.protections, A = S.alarms;
    const nPct = S.n * 100;
    const p1 = P.P1 && nPct > 110;
    alarmSet('P1', p1);
    if (p1) fireAZ('\u041F1 \u529F\u7387\u8D85\u9650');

    const p2 = P.P2 && S.period > 0 && S.period < 10 && S.n > 0.02;
    alarmSet('P2', p2);
    if (p2) fireAZ('\u041F2 \u5468\u671F\u8FC7\u77ED');

    const p3 = P.P3 && S.pressure > 7.25;
    alarmSet('P3', p3);
    if (p3) fireAZ('\u041F3 \u538B\u529B\u8D85\u9650');

    const p4 = P.P4 && (S.level < 20 || S.level > 85);
    alarmSet('P4', p4);
    if (p4) fireAZ('\u041F4 \u6C34\u4F4D\u5F02\u5E38');

    const p5 = P.P5 && S.coreDamage > 5;
    alarmSet('P5', p5);
    if (p5 && !S.azFired) fireAZ('\u041F5 \u5DE5\u827A\u7BA1\u7834\u635F');

    if (S.opr < OPR_LIMIT && S.t % 30 < 0.1) {
      emit('warn', '\u041E\u0417\u0420 = ' + S.opr + ' \u0441\u0442. \u2014 \u4F4E\u4E8E\u9650\u503C ' + OPR_LIMIT + ' \u6839');
    }
    if (S.opr < OPR_SCRAM && !S.azFired && S.n > 0.05) {
      emit('alarm', '\u041E\u0417\u0420 = ' + S.opr + ' < ' + OPR_SCRAM + ' \u2014 \u5E94\u7ACB\u5373\u505C\u5806!');
    }
  }

  function fireAZ(reason) {
    if (S.scramming || S.azFired) return;
    if (S.azBlocked) {
      emit('warn', '\u0410\u0417-5 \u88AB\u95ED\u9501 (\u94A5\u5319) \u2014 ' + reason + ' \u672A\u89E6\u53D1\u505C\u5806!');
      return;
    }
    S.scramming = true;
    S.scramT = 0;
    S.azFired = true;
    alarmSet('AZ', true);
    emit('alarm', '\u0410\u0417-5 \u52A8\u4F5C: ' + reason + ' \u2014 \u5168\u90E8\u63A7\u5236\u68D2\u4E0B\u63D2');
  }

  function manualAZ() {
    if (S.azBlocked) {
      emit('warn', '\u0410\u0417-5 \u88AB\u94A5\u5319\u95ED\u9501, \u65E0\u6CD5\u89E6\u53D1');
      return false;
    }
    fireAZ('\u624B\u52A8\u89E6\u53D1');
    return true;
  }

  function stepDamage(dt) {
    if (S.meltdown) return;
    const nPct = S.n * 100;
    if (nPct > 120) {
      S.coreDamage += (nPct - 120) * dt * 2;
      if (S.coreDamage >= 100) {
        S.meltdown = true;
        S.doseRate = 300000;
        emit('alarm', '\u5806\u82AF\u7194\u6BC1 \u2014 \u71C3\u6599\u5305\u58F3\u5931\u6548, \u653E\u5C04\u6027\u5927\u91CF\u91CA\u653E');
      }
    } else if (S.fuelTemp > 350) {
      S.coreDamage += (S.fuelTemp - 350) * dt * 0.05;
    }
    S.coreDamage = Math.min(100, S.coreDamage);
    const base = 0.12 + S.coreDamage * 2 + (S.meltdown ? 300000 : 0);
    S.doseRate += (base - S.doseRate) * Math.min(1, dt / 2);
    S.doseTotal += S.doseRate * dt / 3600;
  }

  function step(dtReal) {
    if (!S.running || S.meltdown) {
      if (S.meltdown) S.doseTotal += S.doseRate * dtReal * S.timeScale / 3600;
      return;
    }
    const dt = dtReal * S.timeScale;
    S.t += dt;
    stepRods(dt);
    stepVoid(dt);
    stepXenon(dt / 3600);
    computeOPR();
    computeReactivity();
    stepKinetics(dt);
    stepThermal(dt);
    stepProtections();
    stepDamage(dt);
  }

  return {
    S, step, manualAZ, fireAZ,
    N_NOM, N_MAX, N_MIN_AUTO, OPR_LIMIT, OPR_SCRAM,
    setTargetPower(p) { S.targetPower = Math.max(0, Math.min(120, p)); },
    setRodSpeed(v) { S.rodSpeed = v; },
    setMode(m) {
      S.mode = m;
      emit('info', m === 'auto' ? '\u5207\u6362\u81F3\u81EA\u52A8\u8C03\u8282\u6A21\u5F0F' : '\u5207\u6362\u81F3\u624B\u52A8\u68D2\u63A7\u6A21\u5F0F');
    },
    setRodTarget(p) { S.rodTarget = Math.max(0, Math.min(100, p)); },
    togglePump(i) {
      S.pumps[i] = !S.pumps[i];
      emit('info', '\u0413\u0426\u041D-' + (i + 1) + ' ' + (S.pumps[i] ? '\u542F\u52A8' : '\u505C\u6B62'));
    },
    setTimeScale(x) { S.timeScale = x; },
    toggleKey() {
      S.azBlocked = !S.azBlocked;
      emit(S.azBlocked ? 'warn' : 'info',
        S.azBlocked ? '\u4FDD\u62A4\u95ED\u9501\u94A5\u5319\u5DF2\u62D4\u51FA \u2014 \u0410\u0417-5 \u88AB\u7981\u6B62' : '\u4FDD\u62A4\u95ED\u9501\u89E3\u9664 \u2014 \u0410\u0417-5 \u53EF\u7528');
      return S.azBlocked;
    },
    reset() {
      Object.assign(S, {
        t: 0, n: 0.625, nPrev: 0.625, C: 0.625, period: Infinity,
        rodPos: 55, rodTarget: 55, scramming: false, scramT: 0,
        azFired: false, azBlocked: false, xe: 0.4, iodine: 0.4,
        voidFrac: 20, meltdown: false, coreDamage: 0, doseRate: 0.12,
        doseTotal: 0.4, opr: 30,
      });
      S.pumps = [true,true,true,true,true,true,false,false];
      for (const k in S.alarms) S.alarms[k] = false;
      emit('info', '\u4EFF\u771F\u5DF2\u91CD\u7F6E');
    },
  };
})();
