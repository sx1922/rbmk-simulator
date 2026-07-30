window.Physics = window.Physics || {};

/**
 * physics/neutron.js
 * RBMK-1000 点堆动力学模型
 * 标准 6 组缓发中子点堆方程 + RK4 积分 + 自适应步长
 * 参考: Duderstadt & Hamilton (1976), Keepin (1965)
 */
Physics.Neutron = {};

// 外中子源 (归一化) — 保证次临界时 n > 0
var SOURCE_TERM = 1e-8;

/**
 * derivatives — 计算 dn/dt 和 dC_i/dt
 * @param {number} n  - 归一化中子密度
 * @param {number[]} C - 6 组先驱核浓度
 * @param {number} rho - 反应性 (Δk/k)
 * @returns {{dn: number, dC: number[]}}
 */
function derivatives(n, C, rho) {
  var nSafe = Math.max(n, 0);
  var Lambda = CONFIG.LAMBDA_PROMPT;
  var beta = CONFIG.BETA_EFF;

  var dn = ((rho - beta) / Lambda) * nSafe;
  for (var i = 0; i < 6; i++) {
    dn += CONFIG.LAMBDA_D[i] * C[i];
  }
  dn += SOURCE_TERM;

  var dC = [];
  for (var j = 0; j < 6; j++) {
    dC[j] = (CONFIG.BETA_I[j] / Lambda) * nSafe - CONFIG.LAMBDA_D[j] * C[j];
  }

  return { dn: dn, dC: dC };
}

/**
 * stepRK4 — 单步 RK4 积分
 */
function stepRK4(n, C, rho, dt) {
  var k1 = derivatives(n, C, rho);

  var n2 = n + 0.5 * dt * k1.dn;
  var C2 = [];
  for (var i = 0; i < 6; i++) C2[i] = C[i] + 0.5 * dt * k1.dC[i];
  var k2 = derivatives(n2, C2, rho);

  var n3 = n + 0.5 * dt * k2.dn;
  var C3 = [];
  for (var j = 0; j < 6; j++) C3[j] = C[j] + 0.5 * dt * k2.dC[j];
  var k3 = derivatives(n3, C3, rho);

  var n4 = n + dt * k3.dn;
  var C4 = [];
  for (var k = 0; k < 6; k++) C4[k] = C[k] + dt * k3.dC[k];
  var k4 = derivatives(n4, C4, rho);

  var nNew = n + (dt / 6) * (k1.dn + 2 * k2.dn + 2 * k3.dn + k4.dn);
  var CNew = [];
  for (var m = 0; m < 6; m++) {
    CNew[m] = C[m] + (dt / 6) * (k1.dC[m] + 2 * k2.dC[m] + 2 * k3.dC[m] + k4.dC[m]);
    CNew[m] = Math.max(CNew[m], 0);
  }
  nNew = Math.max(nNew, 0);

  var dnFinal = derivatives(nNew, CNew, rho).dn;
  var period = Math.abs(dnFinal) > 1e-12 ? nNew / dnFinal : Infinity;

  return { n: nNew, C: CNew, period: period };
}

/**
 * step — 主入口：自适应子步进 RK4 积分
 * @param {number} dt    - 帧时间 (s)
 * @param {object} state - STATE 对象 (读写 STATE.r)
 */
Physics.Neutron.step = function(dt, state) {
  var r = state.r;
  if (!r.precursors) {
    r.precursors = [];
    for (var i = 0; i < 6; i++) {
      r.precursors[i] = (CONFIG.BETA_I[i] / (CONFIG.LAMBDA_D[i] * CONFIG.LAMBDA_PROMPT)) * (r.power / CONFIG.RATED_T);
    }
  }

  var n = r.power / CONFIG.RATED_T;
  var rho = r.reactivity || 0;
  var C = r.precursors;
  var beta = CONFIG.BETA_EFF;

  // 子步数: 确保 dt_sub * max(λ) ≤ 0.2 (RK4 对最快先驱核组的稳定限)
  var minSubByLambda = Math.ceil(dt * Math.max.apply(null, CONFIG.LAMBDA_D) / 0.2);
  // 额外自适应: ρ 越接近 β, 系统越刚, 步长越小
  var rhoRatio = Math.abs(rho) / beta;
  var subByRho;
  if (rhoRatio < 0.5) {
    subByRho = 1;
  } else if (rhoRatio < 0.9) {
    subByRho = 4;
  } else if (rhoRatio < 1.0) {
    subByRho = 16;
  } else {
    subByRho = 64;
  }
  var subSteps = Math.max(minSubByLambda, subByRho);
  var dtSub = dt / subSteps;

  for (var s = 0; s < actualSteps; s++) {
    var result = stepRK4(n, C, rho, dtSub);
    n = result.n;
    C = result.C;

    // 功率硬上限
    if (n * CONFIG.RATED_T > CONFIG.P_MELTDOWN) {
      n = CONFIG.P_MELTDOWN / CONFIG.RATED_T;
      break;
    }
  }

  // 写回 state
  r.power = n * CONFIG.RATED_T;
  r.precursors = C;
  r.reactorPeriod = result.period;
};

/**
 * decayHeat — 停堆后衰变热 (Way-Wigner 近似)
 * P_decay / P_0 ≈ 0.0622 · t^(-0.2)
 * 适用范围: 10s < t < 100 天
 */
Physics.Neutron.decayHeat = function(tShutdown, powerBefore) {
  if (tShutdown <= 0) return 0;
  var fraction = 0.0622 * Math.pow(tShutdown, -0.2);
  return powerBefore * Math.min(fraction, 0.07);
};

/**
 * rhoToDollars — 反应性转换
 */
Physics.Neutron.rhoToDollars = function(rho) {
  return rho / CONFIG.BETA_EFF;
};

/**
 * isPromptCritical — 判断是否瞬发临界
 */
Physics.Neutron.isPromptCritical = function(rho) {
  return rho >= CONFIG.BETA_EFF;
};
