/**
 * physics/reactivity.js
 * RBMK-1000 反应性合成模型
 * 将所有反应性来源合成为总 ρ(t)，供 neutron.js 使用。
 * 参考:
   - IAEA-TECDOC-1049 "Analysis of Severe Accidents in RBMK"
   - INSAG-7 "The Chernobyl Accident: Updating of INSAG-1" (1992)
   - Duderstadt & Hamilton, "Nuclear Reactor Analysis" (1976)
   - 苏联国家原子能委员会 RBMK 技术报告
 */

// BETA_TOTAL 参考值 (≈0.65% Δk/k) — 与 CONFIG.BETA_EFF 一致
const BETA_TOTAL = 0.006502;

// ============================================================
// 常量
// ============================================================

const CONFIG = {
  // --- 控制棒 ---
  RODS: {
    TOTAL_COUNT: 211,
    ABSORBER_WORTH_PER_ROD: 0.000072,
    DISPLACER_LENGTH_FRAC: 0.28,
    DISPLACER_POSITIVE_PER_ROD: 0.000012,
    INSERT_SPEED: 0.4,
    MANUAL_SPEED: 0.02,
    CORE_HEIGHT: 7.0,
  },

  // --- 空泡 ---
  VOID: {
    TOTAL_WORTH: 4.7 * BETA_TOTAL,
    NOMINAL_VOID_FRACTION: 0.35,
  },

  // --- Doppler (燃料温度) ---
  DOPPLER: {
    COEFF: -2.5e-5,
    REF_TEMP: 280,
  },

  // --- 慢化剂温度 ---
  MODERATOR: {
    COEFF_HIGH_POWER: -1.5e-5,
    COEFF_LOW_POWER: +0.5e-5,
    REF_TEMP: 270,
    POWER_THRESHOLD: 0.20,
  },

  // --- 氙毒 ---
  XENON: {
    EQUILIBRIUM_WORTH: -3.0 * BETA_TOTAL,
    REF_CONCENTRATION: 1.0,
  },

  // --- 燃耗 ---
  BURNUP: {
    COEFF: -1.2e-5,
    INITIAL_EXCESS: 0.012,
  },
};

// ============================================================
// 状态
// ============================================================

/**
 * @typedef {Object} ReactivityState
 * @property {number} rho_total       - 总反应性 (Δk/k)
 * @property {number} rho_rods        - 控制棒分量
 * @property {number} rho_void        - 空泡分量
 * @property {number} rho_doppler     - Doppler 分量
 * @property {number} rho_moderator   - 慢化剂温度分量
 * @property {number} rho_xenon       - 氙毒分量
 * @property {number} rho_burnup      - 燃耗分量
 * @property {number} rho_dollars     - 总反应性 ($)
 * @property {Object} components      - 各分量详情 (用于 UI)
 */

/**
 * 创建初始反应性状态
 * @returns {ReactivityState}
 */
export function createReactivityState() {
  return {
    rho_total: 0,
    rho_rods: 0,
    rho_void: 0,
    rho_doppler: 0,
    rho_moderator: 0,
    rho_xenon: 0,
    rho_burnup: 0,
    rho_dollars: 0,
    components: {},
  };
}

// ============================================================
// 各分量计算
// ============================================================

/**
 * 控制棒反应性
 * RBMK 控制棒结构 (从上到下):
   [吸收体 B4C] — [石墨置换段] — [吸收体 B4C]
 * 关键效应: 当棒从全提出位置开始插入时，
   石墨置换段进入活性区，将水排出 → 正反应性 (端部效应)
   这是切尔诺贝利事故的关键物理机制之一。
 * @param {number} insertionFrac - 插入份额 [0, 1] (0=全提出, 1=全插入)
 * @param {number} rodCount - 参与运动的棒数
 * @returns {number} ρ_rods (Δk/k)
 */
export function calcRodReactivity(insertionFrac, rodCount = CONFIG.RODS.TOTAL_COUNT) {
  const { ABSORBER_WORTH_PER_ROD, DISPLACER_LENGTH_FRAC,
          DISPLACER_POSITIVE_PER_ROD } = CONFIG.RODS;

  const absorberWorth = -ABSORBER_WORTH_PER_ROD * rodCount * insertionFrac;

  let displacerWorth = 0;
  if (insertionFrac < DISPLACER_LENGTH_FRAC) {
    const progress = insertionFrac / DISPLACER_LENGTH_FRAC;
    displacerWorth = DISPLACER_POSITIVE_PER_ROD * rodCount * Math.sin(Math.PI * progress);
  }

  return absorberWorth + displacerWorth;
}

/**
 * 空泡反应性
 * RBMK 的空泡系数是正的: 空泡增加 → 水减少 → 中子吸收减少 → 反应性增加
   这是 RBMK 与 LWR 的根本区别 (LWR 空泡系数为负)。
 * 非线性模型:
   微分空泡系数随空泡份额变化:
   - 低空泡 (α < 0.2): 系数较大 (~+10β per unit α)
   - 中空泡 (α ≈ 0.4): 系数中等 (~+5β per unit α)
   - 高空泡 (α > 0.7): 系数减小 (~+2β per unit α)
 * 积分形式: ρ_void(α) = W_total × f(α)
   其中 f(α) 是归一化非线性函数, f(0)=0, f(1)=1
 * @param {number} voidFraction - 空泡份额 [0, 1]
 * @param {number} rodInsertion - 平均棒插入份额 [0, 1] (影响能谱)
 * @returns {number} ρ_void (Δk/k)
 */
export function calcVoidReactivity(voidFraction, rodInsertion = 0.5) {
  const { TOTAL_WORTH } = CONFIG.VOID;

  const alpha = Math.max(0, Math.min(1, voidFraction));
  const f = Math.pow(alpha, 0.7);

  const rodFactor = 1.0 + 0.3 * (1.0 - rodInsertion);

  return TOTAL_WORTH * f * rodFactor;
}

/**
 * Doppler 反应性 (燃料温度反馈)
 * 物理机制: 燃料温度升高 → U-238 共振吸收展宽 → 反应性下降
   这是最重要的固有安全反馈 (负反馈，毫秒级响应)。
 * @param {number} fuelTemp - 燃料温度 (°C)
 * @returns {number} ρ_doppler (Δk/k)
 */
export function calcDopplerReactivity(fuelTemp) {
  const { COEFF, REF_TEMP } = CONFIG.DOPPLER;
  return COEFF * (fuelTemp - REF_TEMP);
}

/**
 * 慢化剂温度反应性
 * 物理机制: 慢化剂温度升高 → 水密度下降 → 慢化能力变化
   - 高功率 (正常工况): 负系数 (水密度下降 → 慢化不足 → 反应性降)
   - 低功率 + 高棒位: 可能为正 (水作为吸收体的角色超过慢化剂角色)
 * 这是切尔诺贝利事故的另一个关键因素:
   低功率运行时，慢化剂温度系数为正 → 正反馈 → 不稳定
 * @param {number} modTemp - 慢化剂/冷却剂温度 (°C)
 * @param {number} powerFrac - 归一化功率 [0, 1]
 * @returns {number} ρ_moderator (Δk/k)
 */
export function calcModeratorReactivity(modTemp, powerFrac) {
  const { COEFF_HIGH_POWER, COEFF_LOW_POWER, REF_TEMP, POWER_THRESHOLD }
    = CONFIG.MODERATOR;

  const blend = smoothstep(0, POWER_THRESHOLD, powerFrac);
  const coeff = COEFF_LOW_POWER + (COEFF_HIGH_POWER - COEFF_LOW_POWER) * blend;

  return coeff * (modTemp - REF_TEMP);
}

/**
 * 氙毒反应性
 * Xe-135 是裂变产物中吸收截面最大的核素 (σ_a ≈ 2.6×10⁶ barn)
   平衡氙毒约 -3$ (满功率)
 * @param {number} xeConcentration - 归一化 Xe 浓度 (1.0 = 满功率平衡)
 * @returns {number} ρ_xenon (Δk/k)
 */
export function calcXenonReactivity(xeConcentration) {
  const { EQUILIBRIUM_WORTH, REF_CONCENTRATION } = CONFIG.XENON;
  return EQUILIBRIUM_WORTH * (xeConcentration / REF_CONCENTRATION);
}

/**
 * 燃耗反应性
 * @param {number} burnup - 燃耗 (GWd/t)
 * @returns {number} ρ_burnup (Δk/k)
 */
export function calcBurnupReactivity(burnup) {
  return CONFIG.BURNUP.INITIAL_EXCESS + CONFIG.BURNUP.COEFF * burnup;
}

// ============================================================
// 合成
// ============================================================

/**
 * 合成总反应性
 * @param {Object} inputs
 * @param {number} inputs.rodInsertion    - 平均控制棒插入份额 [0,1]
 * @param {number} inputs.voidFraction    - 空泡份额 [0,1]
 * @param {number} inputs.fuelTemp        - 燃料温度 (°C)
 * @param {number} inputs.modTemp         - 慢化剂温度 (°C)
 * @param {number} inputs.powerFrac       - 归一化功率 [0,1]
 * @param {number} inputs.xeConcentration - 归一化 Xe 浓度
 * @param {number} inputs.burnup          - 燃耗 (GWd/t)
 * @param {number} [inputs.rodCount]      - 参与棒数 (默认全部)
 * @returns {ReactivityState}
 */
export function computeReactivity(inputs) {
  const {
    rodInsertion,
    voidFraction,
    fuelTemp,
    modTemp,
    powerFrac,
    xeConcentration,
    burnup,
    rodCount = CONFIG.RODS.TOTAL_COUNT,
  } = inputs;

  const rho_rods      = calcRodReactivity(rodInsertion, rodCount);
  const rho_void      = calcVoidReactivity(voidFraction, rodInsertion);
  const rho_doppler   = calcDopplerReactivity(fuelTemp);
  const rho_moderator = calcModeratorReactivity(modTemp, powerFrac);
  const rho_xenon     = calcXenonReactivity(xeConcentration);
  const rho_burnup    = calcBurnupReactivity(burnup);

  const rho_total = rho_rods + rho_void + rho_doppler
                  + rho_moderator + rho_xenon + rho_burnup;

  return {
    rho_total,
    rho_rods,
    rho_void,
    rho_doppler,
    rho_moderator,
    rho_xenon,
    rho_burnup,
    rho_dollars: rho_total / BETA_TOTAL,
    components: {
      rods:      { value: rho_rods,      dollars: rho_rods / BETA_TOTAL },
      void:      { value: rho_void,      dollars: rho_void / BETA_TOTAL },
      doppler:   { value: rho_doppler,   dollars: rho_doppler / BETA_TOTAL },
      moderator: { value: rho_moderator, dollars: rho_moderator / BETA_TOTAL },
      xenon:     { value: rho_xenon,     dollars: rho_xenon / BETA_TOTAL },
      burnup:    { value: rho_burnup,    dollars: rho_burnup / BETA_TOTAL },
    },
  };
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 平滑过渡函数 (Hermite)
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 * @returns {number} [0, 1]
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 计算当前工况下的空泡系数 (微分, 用于 UI 显示)
 * @param {number} voidFraction
 * @param {number} rodInsertion
 * @returns {number} dρ/dα (Δk/k per unit void fraction)
 */
export function getVoidCoefficient(voidFraction, rodInsertion = 0.5) {
  const { TOTAL_WORTH } = CONFIG.VOID;
  const alpha = Math.max(0.001, Math.min(0.999, voidFraction));
  const rodFactor = 1.0 + 0.3 * (1.0 - rodInsertion);
  return TOTAL_WORTH * 0.7 * Math.pow(alpha, -0.3) * rodFactor;
}

/**
 * 判断当前工况是否处于 "正空泡系数危险区"
 * (低功率 + 高棒位 + 高空泡)
 * @param {Object} inputs
 * @returns {{dangerous: boolean, reason: string}}
 */
export function assessVoidDanger(inputs) {
  const { powerFrac, rodInsertion, voidFraction } = inputs;

  const reasons = [];
  if (powerFrac < CONFIG.MODERATOR.POWER_THRESHOLD) {
    reasons.push('低功率 (<20%): 慢化剂温度系数可能为正');
  }
  if (rodInsertion < 0.3) {
    reasons.push('棒位过高: 空泡系数增强');
  }
  if (voidFraction > 0.5) {
    reasons.push('高空泡份额: 正反馈风险');
  }

  return {
    dangerous: reasons.length >= 2,
    reason: reasons.join('; ') || '正常',
  };
}

// ============================================================
// 导出
// ============================================================

export const REACTIVITY_CONFIG = CONFIG;
