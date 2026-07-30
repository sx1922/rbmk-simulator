/**
 * physics/xenon.js
 * 碘-135 / 氙-135 毒物动力学
 * 核反应链:
   U-235 裂变 ──γ_I──▶ I-135 ──λ_I──▶ Xe-135 ──λ_Xe──▶ Cs-135 (稳定)
   │                                    │
   └──γ_Xe──────────────────────────────▶│
   │
   σ_a_Xe · φ (中子吸收燃耗)
 * 状态方程:
   dI/dt  = γ_I · Σ_f · φ - λ_I · I
   dXe/dt = γ_Xe · Σ_f · φ + λ_I · I - (λ_Xe + σ_a_Xe · φ) · Xe
 * 参考:
   - Lamarsh & Baratta, "Introduction to Nuclear Engineering" 3rd ed., Ch.7
   - Stacey, "Nuclear Reactor Physics" 2nd ed., Ch.7
   - IAEA-TECDOC-1049 (RBMK specific xenon behavior)
   - 切尔诺贝利事故调查报告 (INSAG-7, 1992)
 */

// ============================================================
// 物理常量
// ============================================================

export const XENON_CONSTANTS = {
  GAMMA_I: 0.0639,
  GAMMA_XE: 0.00237,

  LAMBDA_I: 2.874e-5,
  LAMBDA_XE: 2.093e-5,

  SIGMA_A_XE: 2.6e-22,

  SIGMA_F: 3.5,
  PHI_0: 1.0e18,

  NU: 2.43,
};

// ============================================================
// 状态定义
// ============================================================

/**
 * @typedef {Object} XenonState
 * @property {number} I          - I-135 浓度 (atoms/m³)
 * @property {number} Xe         - Xe-135 浓度 (atoms/m³)
 * @property {number} rhoXenon   - 氙毒反应性 (Δk/k)
 * @property {number} rhoXenonDollars - 等效控制棒数
 * @property {number} XeRelative - Xe 相对于额定平衡值的比值
 * @property {number} equilibriumXe - 当前功率下的平衡 Xe 浓度
 * @property {number} timeSinceShutdown - 距上次停堆的时间 (s), -1 表示运行中
 */

export function equilibriumConcentrations(powerFrac) {
  if (powerFrac === undefined) powerFrac = 1.0;
  const C = XENON_CONSTANTS;
  const phi = C.PHI_0 * powerFrac;

  const I_eq = C.GAMMA_I * C.SIGMA_F * phi / C.LAMBDA_I;
  const Xe_eq = (C.GAMMA_I + C.GAMMA_XE) * C.SIGMA_F * phi
              / (C.LAMBDA_XE + C.SIGMA_A_XE * phi);

  return { I_eq: I_eq, Xe_eq: Xe_eq };
}

export function createXenonState(options) {
  if (!options) options = {};
  var powerFrac = options.powerFrac || 1.0;
  var hoursAtPower = options.hoursAtPower || 100;
  const C = XENON_CONSTANTS;
  const { I_eq, Xe_eq } = equilibriumConcentrations(powerFrac);

  const t = hoursAtPower * 3600;
  const I = I_eq * (1 - Math.exp(-C.LAMBDA_I * t));
  const Xe = Xe_eq * (1 - Math.exp(-C.LAMBDA_XE * t));

  const rhoXenon = xenonReactivity(Xe);

  return {
    I: I,
    Xe: Xe,
    rhoXenon: rhoXenon,
    rhoXenonDollars: reactivityToRods(rhoXenon),
    XeRelative: Xe / Xe_eq,
    equilibriumXe: Xe_eq,
    timeSinceShutdown: -1,
  };
}

// ============================================================
// 反应性换算
// ============================================================

export function xenonReactivity(Xe) {
  const C = XENON_CONSTANTS;
  return -C.SIGMA_A_XE * Xe / (C.NU * C.SIGMA_F);
}

export function reactivityToRods(rho) {
  const ROD_WORTH = 0.001;
  return rho / ROD_WORTH;
}

// ============================================================
// 时间推进
// ============================================================

export function stepXenon(state, dt, inputs) {
  const C = XENON_CONSTANTS;
  const powerFrac = inputs.powerFrac;
  const phi = C.PHI_0 * Math.max(powerFrac, 0);

  // --- 碘-135 ---
  const I_source = C.GAMMA_I * C.SIGMA_F * phi;
  const I_eq = phi > 0 ? I_source / C.LAMBDA_I : 0;

  const exp_I = Math.exp(-C.LAMBDA_I * dt);
  state.I = I_eq + (state.I - I_eq) * exp_I;

  // --- 氙-135 ---
  const lambda_eff = C.LAMBDA_XE + C.SIGMA_A_XE * phi;
  const Xe_source = C.GAMMA_XE * C.SIGMA_F * phi + C.LAMBDA_I * state.I;
  const Xe_eq2 = lambda_eff > 0 ? Xe_source / lambda_eff : 0;

  const exp_Xe = Math.exp(-lambda_eff * dt);
  state.Xe = Xe_eq2 + (state.Xe - Xe_eq2) * exp_Xe;

  state.I = Math.max(state.I, 0);
  state.Xe = Math.max(state.Xe, 0);

  state.rhoXenon = xenonReactivity(state.Xe);

  const { Xe_eq: Xe_eq_nominal } = equilibriumConcentrations(1.0);
  state.XeRelative = state.Xe / Xe_eq_nominal;
  state.equilibriumXe = Xe_eq2;

  if (powerFrac < 0.001) {
    if (state.timeSinceShutdown < 0) state.timeSinceShutdown = 0;
    state.timeSinceShutdown += dt;
  } else {
    state.timeSinceShutdown = -1;
  }

  state.rhoXenonDollars = reactivityToRods(state.rhoXenon);

  return state;
}

// ============================================================
// 碘坑分析 (诊断工具)
// ============================================================

export function predictIodinePit(state, hoursAhead, dtHours) {
  if (dtHours === undefined) dtHours = 0.1;
  const C = XENON_CONSTANTS;
  const results = [];
  const I_0 = state.I;
  const Xe_0 = state.Xe;
  const { Xe_eq: Xe_eq_nominal } = equilibriumConcentrations(1.0);

  const nSteps = Math.ceil(hoursAhead / dtHours);

  for (let i = 0; i <= nSteps; i++) {
    const t = i * dtHours * 3600;

    const I_t = I_0 * Math.exp(-C.LAMBDA_I * t);

    let Xe_t;
    if (Math.abs(C.LAMBDA_XE - C.LAMBDA_I) < 1e-10) {
      Xe_t = (Xe_0 + I_0 * C.LAMBDA_I * t) * Math.exp(-C.LAMBDA_XE * t);
    } else {
      Xe_t = Xe_0 * Math.exp(-C.LAMBDA_XE * t)
           + I_0 * C.LAMBDA_I / (C.LAMBDA_XE - C.LAMBDA_I)
           * (Math.exp(-C.LAMBDA_I * t) - Math.exp(-C.LAMBDA_XE * t));
    }

    const rho = xenonReactivity(Xe_t);

    results.push({
      t_hours: i * dtHours,
      I: I_t,
      Xe: Xe_t,
      XeRelative: Xe_t / Xe_eq_nominal,
      rhoXenon: rho,
      rhoRods: reactivityToRods(rho),
    });
  }

  return results;
}

export function findIodinePitMinimum(state) {
  const C = XENON_CONSTANTS;
  const I_0 = state.I;
  const Xe_0 = state.Xe;

  let maxXe = 0;
  let t_max = 0;

  for (let t = 0; t < 50 * 3600; t += 60) {
    const I_t = I_0 * Math.exp(-C.LAMBDA_I * t);
    let Xe_t;
    if (Math.abs(C.LAMBDA_XE - C.LAMBDA_I) < 1e-10) {
      Xe_t = (Xe_0 + I_0 * C.LAMBDA_I * t) * Math.exp(-C.LAMBDA_XE * t);
    } else {
      Xe_t = Xe_0 * Math.exp(-C.LAMBDA_XE * t)
           + I_0 * C.LAMBDA_I / (C.LAMBDA_XE - C.LAMBDA_I)
           * (Math.exp(-C.LAMBDA_I * t) - Math.exp(-C.LAMBDA_XE * t));
    }

    if (Xe_t > maxXe) {
      maxXe = Xe_t;
      t_max = t;
    }
  }

  const { Xe_eq: Xe_eq_nominal } = equilibriumConcentrations(1.0);

  return {
    t_hours: t_max / 3600,
    Xe_max: maxXe,
    XeRelative_max: maxXe / Xe_eq_nominal,
    rho_min: xenonReactivity(maxXe),
    rhoRods: reactivityToRods(xenonReactivity(maxXe)),
  };
}

// ============================================================
// 运行裕度 (OPR) 计算
// ============================================================

export function calcOPR(xenonState, rodPosition, totalRodWorth) {
  const usedRodWorth = rodPosition * totalRodWorth;
  const availableRodWorth = totalRodWorth - usedRodWorth;
  const xenonPenalty = Math.abs(xenonState.rhoXenon);
  const opr = availableRodWorth - xenonPenalty;

  const ROD_WORTH = 0.001;
  const oprRods = opr / ROD_WORTH;

  return {
    opr: opr,
    oprRods: oprRods,
    safe: oprRods >= 15,
  };
}

// ============================================================
// 辅助/诊断
// ============================================================

export function getXenonSummary(state) {
  const pit = findIodinePitMinimum(state);

  var shutdownInfo = null;
  if (state.timeSinceShutdown >= 0) {
    shutdownInfo = state.timeSinceShutdown / 3600;
  }

  var pitSeverity = 'mild';
  if (Math.abs(pit.rhoRods) > 30) pitSeverity = 'severe';
  else if (Math.abs(pit.rhoRods) > 15) pitSeverity = 'moderate';

  return {
    XeRelative: state.XeRelative,
    rhoXenon: state.rhoXenon,
    rhoRods: state.rhoXenonDollars,
    isShutdown: state.timeSinceShutdown >= 0,
    shutdownHours: shutdownInfo,
    iodinePit: {
      peakHours: pit.t_hours,
      peakRods: pit.rhoRods,
      severity: pitSeverity,
    },
  };
}

export function assessXenonSafety(state, rodPosition, totalRodWorth) {
  const messages = [];
  let level = 'normal';

  const opr = calcOPR(state, rodPosition, totalRodWorth);

  if (!opr.safe) {
    level = 'critical';
    messages.push('OPR = ' + opr.oprRods.toFixed(1) + ' 根 < 15 根最低要求!');
  } else if (opr.oprRods < 20) {
    level = 'warning';
    messages.push('OPR = ' + opr.oprRods.toFixed(1) + ' 根, 接近最低限值');
  }

  if (state.XeRelative > 1.5) {
    if (level === 'normal') level = 'caution';
    messages.push('氙浓度 ' + state.XeRelative.toFixed(2) + '× 平衡值: 超平衡');
  }

  if (state.timeSinceShutdown >= 0 && state.timeSinceShutdown < 20 * 3600) {
    const pit = findIodinePitMinimum(state);
    if (pit.t_hours > state.timeSinceShutdown / 3600) {
      messages.push('碘坑将在 ' + pit.t_hours.toFixed(1) + 'h 后达到峰值 ('
        + pit.rhoRods.toFixed(1) + ' 根等效)');
    }
  }

  if (messages.length === 0) messages.push('氙毒水平正常');

  return { level: level, messages: messages };
}

export const XENON_CONFIG = XENON_CONSTANTS;
