// config.js — 所有常量/参数
// 修改参数只需编辑此文件

const CONFIG = {};

// === 反应堆物理参数 ===
CONFIG.RATED_T = 3200;        // MWt 额定热功率
CONFIG.MELT_T = 2800;         // MWt 熔毁阈值（功率对应燃料温度 > 2800°C）
CONFIG.NUM_RODS = 211;        // 控制棒总数
CONFIG.ORM_MIN = 26;          // 最低允许 ORM（根当量）
CONFIG.ORM_CRIT = 15;         // 临界安全 ORM 下限
CONFIG.FLOW_RATED = 48000;    // m³/h 额定冷却剂流量
CONFIG.FLOW_PER_PUMP = 6000;  // m³/h 单台主泵流量
CONFIG.PUMP_TOTAL = 8;        // 主泵总数

// === 中子动力学（点堆） ===
CONFIG.LAMBDA_PROMPT = 1e-3;   // s 瞬发中子代时间 (RBMK 大型石墨堆特征值)
CONFIG.BETA_EFF = 0.006502;    // 总缓发中子份额 (U-235 热裂变, Keepin 1965)
CONFIG.BETA_I = [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273]; // 6 组份额
CONFIG.LAMBDA_D = [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01]; // 6 组衰变常数 (s⁻¹)
CONFIG.P_MAX_SAFE = 3840;      // MWt 最大安全热功率 (120%)
CONFIG.P_MELTDOWN = 5000;      // MWt 绝对熔毁功率 (超过即不可逆)

// === 反应性系数 ===
CONFIG.ALPHA_FUEL = -2.4e-5;  // Δρ/°C 燃料多普勒系数
CONFIG.ALPHA_VOID = 2.8e-4;   // Δρ/%void 空泡系数（RBMK 为正！）
CONFIG.ALPHA_GRAPHITE = 1.2e-6; // Δρ/°C 石墨温度系数

// === 氙毒 ===
CONFIG.YIELD_XE = 0.003;      // 氙裂变产额
CONFIG.YIELD_I = 0.061;       // 碘裂变产额
CONFIG.LAMBDA_I = 2.87e-5;    // /s 碘衰变常数
CONFIG.LAMBDA_XE = 2.09e-5;   // /s 氙衰变常数
CONFIG.SIGMA_XE = 2.7e-18;    // cm² 氙热中子吸收截面（微观）
CONFIG.FLUX_FACTOR = 1e13;    // n/cm²·s 通量归一因子

// === 热工水力（5 区） ===
CONFIG.ZONE_POWER_FRAC = [0.12, 0.18, 0.40, 0.18, 0.12]; // 各区功率份额
CONFIG.ZONE_MASS = [8000, 10000, 12000, 10000, 8000];    // kg 冷却剂质量
CONFIG.ZONE_VOL = [5.0, 6.5, 8.0, 6.5, 5.0];            // m³
CONFIG.CP_COOLANT = 4200;     // J/kg·K 水比热
CONFIG.CP_FUEL = 300;         // J/kg·K UO₂比热（有效值）
CONFIG.TSAT_4MPA = 280;       // °C 4MPa 饱和温度
CONFIG.H_FG = 1500e3;         // J/kg 汽化潜热

// === 汽轮机 ===
CONFIG.TURBINE_RATED = 500;   // MWe 额定电功率
CONFIG.TURBINE_VMAX = 3150;   // rpm 超速保护阈值
CONFIG.TURBINE_VNOM = 3000;   // rpm 额定转速
CONFIG.STEAM_PRES_RATED = 6.0; // MPa 额定蒸汽压力

// === 经济参数 ===
CONFIG.QUOTA = 120000;        // MWh/月 发电指标
CONFIG.ELECTRIC_PRICE = 0.02; // ₽/MWh 电价
CONFIG.STAFF_COST = 800;      // ₽/人·月
CONFIG.BASE_MAINT = 1000;     // ₽/天
CONFIG.START_MONEY = 5000000; // ₽ 初始资金

// === 政治参数 ===
CONFIG.POLITICS_DECAY = {1: 3, 2: 5, 3: 8}; // 月度信任衰减（按难度）

// === 难度 ===
CONFIG.DIFFICULTIES = {
  1: { name: '简单', money: 8000000, eventMul: 0.5, politicsDecay: 3, staffBonus: 2 },
  2: { name: '普通', money: 5000000, eventMul: 1.0, politicsDecay: 5, staffBonus: 0 },
  3: { name: '困难', money: 3000000, eventMul: 1.8, politicsDecay: 8, staffBonus: -1 },
};

// === 季节冷却水温 ===
CONFIG.SEASON_TEMP = { 1: 255, 2: 255, 3: 265, 4: 265, 5: 265, 6: 280, 7: 280, 8: 280, 9: 270, 10: 270, 11: 255, 12: 255 };
// 月份: 1-12 → °C

// === 状态名称 ===
CONFIG.STATE_NAMES = {
  SHUTDOWN: '停堆',
  POWER: '功率运行',
  SCRAM: '紧急停堆',
  LOWPOW: '低功率',
  EXPLOSION: '爆炸',
  MELTDOWN: '熔毁',
};

// === 位置类型 ===
CONFIG.SEASONS = ['冬', '冬', '春', '春', '春', '夏', '夏', '夏', '秋', '秋', '冬', '冬'];
