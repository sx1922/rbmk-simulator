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
  const LAMBDA = 0.06;
  const XE_EQ_TIME = 40;
  const XE_BURN = 0.9;
  const I_DECAY = 0.105;

  const PERIOD_MAX = 1000;
  const PERIOD_TAU = 3;

  // ============ v2.0 物理引擎常量 ============
  const V2 = {
    // 汽水分离器
    sep: { A: 12.0, V: 30, rho_w: 740, h_fg: 1500, K_p: 0.002, P_nom: 6.9 },
    // 给水温度
    feed: { tau: 120, T_normal: 270, T_deaerator: 100, T_saor: 40, T_bypass: 160 },
    // 包壳/热冲击
    clad: { shock_mod: 150, shock_sev: 300, dmg_mod: 0.0001, dmg_sev: 0.001,
            leak_thr: 0.8, rel_thr: 0.5, fail_thr: 0.1 },
    // 棒驱动
    rod: { max_sim: 40, heat_rate: 0.5, cool_rate: 1/300, overheat: 80, recover: 50 },
    // 衰变热 (Way-Wigner)
    decay: { c1: 0.066, c2: 0.007, e1: -0.2, e2: -0.8, max_frac: 0.07 },
    // 辐射
    rad: { lambda_N16: 0.097, base_dose: 0.1, leak: 1e-9, fuel_rel: 50,
           cleanup: 100, total_flow: 48000 },
    // 四象限
    quad: { xe_worth: 0.004, rod_worth: 0.0016, void_worth: 0.0009,
            enable_t: 3600, enable_p: 0.5 },
  };

  const S = {
    t: 0,
    running: true,
    timeScale: 10,
    n: 0.625,
    nPrev: 0.625,
    period: Infinity,
    dndts: 0,
    C: 0.625,
    rho: 0,
    rhoComponents: { rod: 0, void: 0, xe: 0, tip: 0, doppler: 0 },
    rodPos: 47.5,
    rodTarget: 47.5,
    rodSpeed: ROD_SPEED,
    rodHeld: 0,
    autoI: 0,
    scramming: false,
    scramT: 0,
    azFired: false,
    azBlocked: false,
    scramStartN: 0,
    xe: 0.4,
    iodine: 0.4,
    voidFrac: 20,
    flow: 75,
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

    // ============ v2.0 状态量 ============
    // 汽水分离器
    separator_level: 1.0,
    separator_pressure: 6.9,
    feedwater_flow: 5000,
    feedwater_temp: 270,
    steam_flow: 1470,
    // 包壳
    clad_integrity: 1.0,
    clad_temp_max: 350,
    // 棒驱动
    active_rod_drives: 0,
    rod_drive_temp: 20,
    rod_drive_overheat: false,
    // 衰变热
    scram_time: null,
    pre_scram_power: 0,
    decay_heat_power: 0,
    // 周期
    reactor_period: Infinity,
    dP_dt: 0,
    prev_P_thermal: 3200,
    // 四象限
    quadrant_power: [800, 800, 800, 800],
    quadrant_xenon: [0, 0, 0, 0],
    quadrant_rods: [0.5, 0.5, 0.5, 0.5],
    enable_quadrant_model: false,
    // 辐射
    coolant_activity: 1e3,
    containment_dose_rate: 0.1,
    // 汽机阀门
    turbine_valve_opening: 1.0,
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
    rc.rod = (S.rodPos - 54) * 0.0016;
    if (!S.scramming) {
      const lifting = S.rodTarget > S.rodPos;
      const lowFactor = Math.max(0, (40 - S.rodPos) / 40);
      rc.tip = lifting ? 0.04 * lowFactor * (S.opr < OPR_LIMIT ? 1.8 : 0.6) : 0;
    } else {
      const progress = S.scramT / SCRAM_TIME;
      let surge = 0;
      const n0 = S.scramStartN;
      if (n0 > 0.04 && n0 < 0.14) {
        if (n0 <= 0.065) surge = 0.9 * (n0 - 0.04) / 0.025;
        else if (n0 <= 0.10) surge = 0.9;
        else surge = 0.9 * (0.14 - n0) / 0.04;
      }
      const lowTip = Math.max(0, surge * (1 - progress / 0.35));
      const hiTip = 0.016 * (1 - progress / 0.35) * (S.opr < OPR_LIMIT ? 2.2 : 0.8);
      rc.tip = lowTip + hiTip;
    }
    rc.void = (S.voidFrac - 20) * 0.0009;
    rc.xe = -(S.xe - 0.4) * 0.004;
    rc.doppler = -(S.n - 0.6) * 0.05;
    S.rho = rc.rod + rc.tip + rc.void + rc.xe + rc.doppler;
    return S.rho;
  }

  function stepKinetics(dt) {
    S.nPrev = S.n;
    const h = Math.min(dt, 0.05);
    const steps = Math.max(1, Math.ceil(dt / h));
    const hh = dt / steps;
    const rc = S.rhoComponents;
    for (let i = 0; i < steps; i++) {
      const a = hh * (S.rho - BETA_EFF) / LAMBDA;
      const num = S.n + hh * LAMBDA * S.C;
      S.n = num / (1 - a);
      S.C += hh * (BETA_EFF / LAMBDA * S.n - LAMBDA * S.C);
      S.n = Math.max(1e-5, S.n);
      rc.doppler = -(S.n - 0.6) * 0.05;
      S.rho = rc.rod + rc.tip + rc.void + rc.xe + rc.doppler;
    }
    const dn = S.n - S.nPrev;
    const dndt = dt > 0 ? dn / dt : 0;
    const k = Math.min(1, dt / (dt + PERIOD_TAU));
    S.dndts += (dndt - S.dndts) * k;
    if (!isFinite(S.dndts)) S.dndts = 0;
    if (isFinite(S.dndts) && Math.abs(S.dndts) > 1e-6 && S.n > 1e-4) {
      S.period = S.n / S.dndts;
      if (Math.abs(S.period) > PERIOD_MAX) S.period = Infinity;
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
    // v2.0: 过热闭锁时禁止棒运动（除 AZ-5 外）
    if (S.rod_drive_overheat) return;
    if (S.mode === 'auto' && !S.azFired && !S.rodHeld) {
      const t = S.targetPower / 100;
      const ff = 42 + 16.625 * (2 * t - S.n) + 0.1969 * (S.flow - 100);
      const k = Math.min(dt, 2);
      S.autoI = Math.max(-15, Math.min(15, S.autoI + (t - S.n) * k * 0.15));
      let want = Math.max(0, Math.min(100, ff + S.autoI));
      if (S.n < 0.02 && t > 0.1) want = Math.max(want, 62);
      const rate = S.rodSpeed * dt * 0.5;
      S.rodTarget += Math.max(-rate, Math.min(rate, want - S.rodTarget));
    } else if (S.rodHeld) {
      S.rodTarget = Math.max(0, Math.min(100, S.rodTarget + S.rodHeld * S.rodSpeed * dt));
    }
    const diff = S.rodTarget - S.rodPos;
    if (Math.abs(diff) > 0.01) {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), S.rodSpeed * dt);
      S.rodPos += step;
      S.active_rod_drives = Math.min(V2.rod.max_sim, Math.round(Math.abs(diff) * 2.1));
    } else {
      S.active_rod_drives = 0;
    }
    S.rodPos = Math.max(0, Math.min(100, S.rodPos));
  }

  function stepThermal(dt) {
    S.flow = S.pumps.filter(p => p).length / 8 * 100;
    const pTarget = 6.5 + S.n * 0.65;
    S.pressure += (pTarget - S.pressure) * Math.min(1, dt / 5);
    const lTarget = 50 + (S.flow - 100) * 0.2;
    S.level += (lTarget - S.level) * Math.min(1, dt / 4);
    // v2.0: 热源 = 裂变功率 + 衰变热
    const fissionPower = S.n;
    const decayPower = S.decay_heat_power / N_NOM;
    const totalPower = fissionPower + decayPower;
    const tTarget = 270 + totalPower * 30;
    S.fuelTemp += (tTarget - S.fuelTemp) * Math.min(1, dt / 8);
  }

  function stepProtections() {
    const P = S.protections, A = S.alarms;
    const nPct = S.n * 100;
    const p1 = P.P1 && nPct > 110;
    alarmSet('P1', p1);
    if (p1) fireAZ('\u041F1 \u529F\u7387\u8D85\u9650');

    const p2 = P.P2 && S.period > 0 && S.period < 10 && S.n >= 0.2;
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
    S.scram_time = S.t;
    S.pre_scram_power = S.n * N_NOM;
    S.scramming = true;
    S.scramT = 0;
    S.azFired = true;
    S.scramStartN = S.n;
    S.rodTarget = 0;
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

  // ==================== v2.0 物理引擎增量函数 ====================

  function updateSeparator(dt) {
    S.steam_flow = S.n * N_NOM * 2.4;
    const turbine_flow = S.steam_flow * S.turbine_valve_opening;
    const feed_kg_s = S.feedwater_flow * V2.sep.rho_w / 3600;
    const steam_kg_s = S.steam_flow * 1000 / 3600;
    const dLevel = (feed_kg_s - steam_kg_s) / (V2.sep.rho_w * V2.sep.A);
    S.separator_level += dLevel * dt;
    S.separator_level = Math.max(0, Math.min(2.0, S.separator_level));
    const dPressure = (S.steam_flow - turbine_flow) / V2.sep.V * V2.sep.K_p;
    S.separator_pressure += dPressure * dt;
    S.separator_pressure = Math.max(0.1, Math.min(8.0, S.separator_pressure));
    const void_corr = (V2.sep.P_nom - S.separator_pressure) * 0.02;
    S.voidFrac += void_corr * dt * 0.1;
    if (S.separator_level < 0.3) {
      S.flow += (Math.random() - 0.5) * 30 * dt;
    }
  }

  function updateFeedwater(dt) {
    let T_target = V2.feed.T_normal;
    if (S.separator_pressure < 0.1) T_target = V2.feed.T_deaerator;
    S.feedwater_temp += (T_target - S.feedwater_temp) * Math.min(1, dt / V2.feed.tau);
  }

  function updateCladIntegrity(dt) {
    S.clad_temp_max = 270 + S.n * 130;
    const shock = Math.abs(S.feedwater_temp - S.clad_temp_max) * (S.flow / 100);
    if (shock > V2.clad.shock_sev) {
      S.clad_integrity -= (shock - V2.clad.shock_sev) * V2.clad.dmg_sev * dt;
    } else if (shock > V2.clad.shock_mod) {
      S.clad_integrity -= (shock - V2.clad.shock_mod) * V2.clad.dmg_mod * dt;
    }
    S.clad_integrity = Math.max(0, Math.min(1, S.clad_integrity));
    if (S.clad_integrity < V2.clad.leak_thr) {
      S.coolant_activity += (1.0 - S.clad_integrity) * 1e8 * dt;
    }
    if (S.clad_integrity < V2.clad.rel_thr) {
      S.containment_dose_rate += (V2.clad.rel_thr - S.clad_integrity) * 20 * dt;
    }
    if (S.clad_integrity < V2.clad.fail_thr && !S.meltdown) {
      emit('alarm', '\u5305\u58F3\u5927\u9762\u79EF\u7834\u88C2 \u2014 \u71C3\u6599\u635F\u574F\u4E8B\u6545');
    }
  }

  function updateDecayHeat(dt) {
    if (S.scram_time === null) { S.decay_heat_power = 0; return; }
    const t = S.t - S.scram_time;
    if (t <= 0) { S.decay_heat_power = S.pre_scram_power * V2.decay.max_frac; return; }
    const frac = V2.decay.c1 * Math.pow(t, V2.decay.e1) + V2.decay.c2 * Math.pow(t, V2.decay.e2);
    S.decay_heat_power = S.pre_scram_power * Math.min(frac, V2.decay.max_frac);
  }

  function updatePeriod(dt) {
    const P = S.n * N_NOM;
    const dP = P - S.prev_P_thermal;
    S.dP_dt = dt > 0 ? dP / dt : 0;
    if (Math.abs(S.dP_dt) < 1e-6) {
      S.reactor_period = Infinity;
    } else {
      S.reactor_period = P / S.dP_dt;
    }
    S.prev_P_thermal = P;
  }

  function updateQuadrants(dt) {
    if (!S.enable_quadrant_model) {
      if (S.t > V2.quad.enable_t && S.n < V2.quad.enable_p) {
        S.enable_quadrant_model = true;
        emit('info', '\u7A7A\u95F4\u6548\u5E94\u6A21\u578B\u5DF2\u542F\u7528 \u2014 \u56DB\u8C61\u9650\u52A8\u529B\u5B66');
      }
      return;
    }
    const totalPower = S.n * N_NOM;
    const localRho = [];
    for (let i = 0; i < 4; i++) {
      localRho[i] = -S.quadrant_xenon[i] * V2.quad.xe_worth
        - S.quadrant_rods[i] * V2.quad.rod_worth
        + (S.voidFrac / 100) * V2.quad.void_worth;
    }
    const weights = localRho.map(r => Math.exp(r / BETA_EFF));
    const sumW = weights.reduce(function(a, b) { return a + b; }, 0);
    const w = weights.map(function(w) { return w / sumW; });
    for (let i = 0; i < 4; i++) {
      S.quadrant_power[i] = totalPower * w[i];
    }
    for (let i = 0; i < 4; i++) {
      const qN = S.quadrant_power[i] / N_NOM;
      const target = qN > 0.01 ? S.xe / (qN * 4) : S.xe;
      S.quadrant_xenon[i] += (target - S.quadrant_xenon[i]) * Math.min(1, dt / 60);
    }
  }

  function updateRadiation(dt) {
    const source = (1.0 - S.clad_integrity) * 1e8 * S.n;
    const decay = S.coolant_activity * V2.rad.lambda_N16;
    const removal = S.coolant_activity * (V2.rad.cleanup / V2.rad.total_flow);
    S.coolant_activity += (source - decay - removal) * dt;
    S.coolant_activity = Math.max(0, S.coolant_activity);
    S.containment_dose_rate = V2.rad.base_dose
      + S.coolant_activity * V2.rad.leak
      + (1.0 - S.clad_integrity) * V2.rad.fuel_rel;
  }

  function updateRodDrives(dt) {
    S.rod_drive_temp += S.active_rod_drives * V2.rod.heat_rate * dt
      - (S.rod_drive_temp - 20) * V2.rod.cool_rate * dt;
    if (S.rod_drive_temp > V2.rod.overheat && !S.rod_drive_overheat) {
      S.rod_drive_overheat = true;
      S.active_rod_drives = 0;
      emit('warn', '\u9A71\u52A8\u673A\u6784\u8FC7\u70ED\u95ED\u9501 \u2014 \u63A7\u5236\u68D2\u505C\u6B62\u8FD0\u52A8');
    }
    if (S.rod_drive_overheat && S.rod_drive_temp < V2.rod.recover) {
      S.rod_drive_overheat = false;
      emit('info', '\u9A71\u52A8\u673A\u6784\u5DF2\u51B7\u5374 \u2014 \u63A7\u5236\u68D2\u6062\u590D\u8FD0\u52A8');
    }
  }

  function updateV2Protections() {
    if (S.clad_integrity < 0.1 && !S.meltdown) {
      emit('alarm', '\u5305\u58F3\u5927\u9762\u79EF\u7834\u88C2 \u2014 \u5FC5\u987B\u7ACB\u5373\u505C\u5806');
    }
    if (S.separator_level < 0.2 && S.n > 0.1) {
      emit('alarm', '\u6C7D\u6C34\u5206\u79BB\u5668\u5E72\u70E7 \u2014 \u6C34\u4F4D\u4F4E\u4E8E\u6025\u9650');
    }
    if (S.rod_drive_overheat && S.reactor_period < 20 && S.reactor_period > 0) {
      emit('warn', '\u65E0\u68D2\u4E34\u754C \u2014 \u4E0D\u80FD\u63D2\u68D2 + \u529F\u7387\u5728\u5347 = \u6781\u5EA6\u5371\u9669');
    }
  }

  function step(dtReal) {
    if (!S.running || S.meltdown) {
      if (S.meltdown) {
        S.t += dtReal * S.timeScale;
        S.doseTotal += S.doseRate * dtReal * S.timeScale / 3600;
      }
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
    // v2.0 增量
    updateSeparator(dt);
    updateFeedwater(dt);
    updateCladIntegrity(dt);
    updateDecayHeat(dt);
    updatePeriod(dt);
    updateQuadrants(dt);
    updateRadiation(dt);
    updateRodDrives(dt);
    updateV2Protections();
  }

  return {
    S, step, manualAZ, fireAZ,
    N_NOM, N_MAX, N_MIN_AUTO, OPR_LIMIT, OPR_SCRAM,
    setTargetPower(p) { S.targetPower = Math.max(0, Math.min(120, p)); },
    initFullPower() {
      S.n = 1.0; S.nPrev = 1.0; S.C = 1.0;
      S.targetPower = 100;
      S.rodPos = 53.7; S.rodTarget = 53.7;
      S.autoI = 0; S.period = Infinity; S.dndts = 0;
      S.prev_P_thermal = 3200;
      S.reactor_period = Infinity;
      S.dP_dt = 0;
      S.separator_level = 1.0;
      S.separator_pressure = 6.9;
      S.feedwater_flow = 5000;
      S.feedwater_temp = 270;
      S.steam_flow = 1470;
      S.clad_integrity = 1.0;
      S.clad_temp_max = 350;
      S.active_rod_drives = 0;
      S.rod_drive_temp = 20;
      S.rod_drive_overheat = false;
      S.scram_time = null;
      S.pre_scram_power = 0;
      S.decay_heat_power = 0;
      S.quadrant_power = [800, 800, 800, 800];
      S.quadrant_xenon = [0, 0, 0, 0];
      S.quadrant_rods = [0.5, 0.5, 0.5, 0.5];
      S.enable_quadrant_model = false;
      S.coolant_activity = 1e3;
      S.containment_dose_rate = 0.1;
      S.turbine_valve_opening = 1.0;
    },
    setRodSpeed(v) { S.rodSpeed = v; },
    setMode(m) {
      S.mode = m;
      emit('info', m === 'auto' ? '\u5207\u6362\u81F3\u81EA\u52A8\u8C03\u8282\u6A21\u5F0F' : '\u5207\u6362\u81F3\u624B\u52A8\u68D2\u63A7\u6A21\u5F0F');
    },
    setRodTarget(p) { S.rodTarget = Math.max(0, Math.min(100, p)); },
    beginRodMove(dir) { S.rodHeld = dir > 0 ? 1 : -1; },
    endRodMove() { S.rodHeld = 0; },
    togglePump(i) {
      S.pumps[i] = !S.pumps[i];
      emit('info', '\u0413\u0426\u041D-' + (i + 1) + ' ' + (S.pumps[i] ? '\u542F\u52A8' : '\u505C\u6B62'));
    },
    setTimeScale(x) { S.timeScale = x; },
    clearScram() {
      S.azFired = false;
      S.scramming = false;
      S.azBlocked = false;
      alarmSet('AZ', false);
    },
    advanceSim(sec) {
      let left = sec;
      while (left > 0 && !S.meltdown) {
        const chunk = Math.min(left, 2);
        this.step(chunk / S.timeScale);
        left -= chunk;
      }
    },
    toggleKey() {
      S.azBlocked = !S.azBlocked;
      emit(S.azBlocked ? 'warn' : 'info',
        S.azBlocked ? '\u4FDD\u62A4\u95ED\u9501\u94A5\u5319\u5DF2\u62D4\u51FA \u2014 \u0410\u0417-5 \u88AB\u7981\u6B62' : '\u4FDD\u62A4\u95ED\u9501\u89E3\u9664 \u2014 \u0410\u0417-5 \u53EF\u7528');
      return S.azBlocked;
    },
    exportState() {
      const out = {};
      for (const k in S) {
        if (k === 'onEvent' || k === 'onAlarm') continue;
        out[k] = S[k];
      }
      out.pumps = S.pumps.slice();
      out.protections = Object.assign({}, S.protections);
      out.alarms = Object.assign({}, S.alarms);
      out.rhoComponents = Object.assign({}, S.rhoComponents);
      out.quadrant_power = S.quadrant_power.slice();
      out.quadrant_xenon = S.quadrant_xenon.slice();
      out.quadrant_rods = S.quadrant_rods.slice();
      return out;
    },
    importState(snap) {
      if (!snap) return;
      Object.assign(S, snap);
      if (Array.isArray(snap.pumps)) S.pumps = snap.pumps.slice();
      if (snap.protections) S.protections = Object.assign({}, snap.protections);
      if (snap.alarms) S.alarms = Object.assign({}, snap.alarms);
      if (snap.rhoComponents) S.rhoComponents = Object.assign({}, snap.rhoComponents);
      if (Array.isArray(snap.quadrant_power)) S.quadrant_power = snap.quadrant_power.slice();
      if (Array.isArray(snap.quadrant_xenon)) S.quadrant_xenon = snap.quadrant_xenon.slice();
      if (Array.isArray(snap.quadrant_rods)) S.quadrant_rods = snap.quadrant_rods.slice();
    },
    reset() {
      Object.assign(S, {
        t: 0, n: 0.625, nPrev: 0.625, C: 0.625, period: Infinity, dndts: 0,
        rodPos: 47.5, rodTarget: 47.5, rodHeld: 0, autoI: 0, scramming: false, scramT: 0,
        azFired: false, azBlocked: false, scramStartN: 0, xe: 0.4, iodine: 0.4,
        voidFrac: 20, meltdown: false, coreDamage: 0, doseRate: 0.12,
        doseTotal: 0.4, opr: 30, timeScale: 10, mode: 'auto',
        pressure: 6.9, level: 50, fuelTemp: 280,
        separator_level: 1.0, separator_pressure: 6.9,
        feedwater_flow: 5000, feedwater_temp: 270, steam_flow: 1470,
        clad_integrity: 1.0, clad_temp_max: 350,
        active_rod_drives: 0, rod_drive_temp: 20, rod_drive_overheat: false,
        scram_time: null, pre_scram_power: 0, decay_heat_power: 0,
        reactor_period: Infinity, dP_dt: 0, prev_P_thermal: 3200,
        quadrant_power: [800,800,800,800],
        quadrant_xenon: [0,0,0,0], quadrant_rods: [0.5,0.5,0.5,0.5],
        enable_quadrant_model: false,
        coolant_activity: 1e3, containment_dose_rate: 0.1,
        turbine_valve_opening: 1.0,
      });
      S.pumps = [true,true,true,true,true,true,false,false];
      for (const k in S.alarms) S.alarms[k] = false;
      emit('info', '\u4EFF\u771F\u5DF2\u91CD\u7F6E');
    },
    // v2.0 物理引擎导出（供测试/app.js 使用）
    V2: {
      updateSeparator, updateFeedwater, updateCladIntegrity,
      updateDecayHeat, updatePeriod, updateQuadrants,
      updateRadiation, updateRodDrives, updateV2Protections,
      V2,
    },
  };
})();

window.RBMK = RBMK;
