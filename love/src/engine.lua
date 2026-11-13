-- engine.lua — ЩИТ 物理引擎 v2
-- 点堆动力学（半隐式）+ 氙/空泡/OPR/棒控/热工/保护/损伤 + v2 增量系统
-- （汽水分离器 / 给水温度 / 包壳完整性 / 衰变热 / 周期 / 四象限 / 辐射 / 棒驱动）
--
-- 用法：
--   local Engine = require('src.engine')
--   Engine.step(dtReal)            -- 每帧调用
--   Engine.S                       -- 引擎状态表（只读展示 / 场景引擎 condition 用）
--   Engine.reset() / Engine.initFullPower()
--   Engine.S.onEvent = fn(type, msg, t) / Engine.S.onAlarm = fn(key, on)

local Engine = {}

-- ==================== 常量 ====================

local N_NOM      = 3200
local N_MAX      = 3840
local N_MIN_AUTO = 160
local RODS_TOTAL = 211
local ROD_SPEED  = 0.4
local SCRAM_TIME = 18
local OPR_LIMIT  = 15
local OPR_SCRAM  = 8
local BETA_EFF   = 0.0065
local LAMBDA     = 0.06
local XE_EQ_TIME = 40
local XE_BURN    = 0.9
local I_DECAY    = 0.105

local PERIOD_MAX = 1000
local PERIOD_TAU = 3

Engine.N_NOM, Engine.N_MAX, Engine.N_MIN_AUTO = N_NOM, N_MAX, N_MIN_AUTO
Engine.OPR_LIMIT, Engine.OPR_SCRAM = OPR_LIMIT, OPR_SCRAM
Engine.SCRAM_TIME = SCRAM_TIME

-- v2.0 物理引擎常量
local V2 = {
  sep   = { A = 12.0, V = 30, rho_w = 740, h_fg = 1500, K_p = 0.002, P_nom = 6.9 },
  feed  = { tau = 120, T_normal = 270, T_deaerator = 100, T_saor = 40, T_bypass = 160 },
  clad  = { shock_mod = 150, shock_sev = 300, dmg_mod = 0.0001, dmg_sev = 0.001,
            leak_thr = 0.8, rel_thr = 0.5, fail_thr = 0.1 },
  rod   = { max_sim = 40, heat_rate = 0.5, cool_rate = 1/300, overheat = 80, recover = 50 },
  decay = { c1 = 0.066, c2 = 0.007, e1 = -0.2, e2 = -0.8, max_frac = 0.07 },
  rad   = { lambda_N16 = 0.097, base_dose = 0.1, leak = 1e-9, fuel_rel = 50,
            cleanup = 100, total_flow = 48000 },
  quad  = { xe_worth = 0.004, rod_worth = 0.0016, void_worth = 0.0009,
            enable_t = 3600, enable_p = 0.5 },
}
Engine.V2 = V2

-- ==================== 状态 ====================

local S = {}
Engine.S = S

local function resetState()
  S.t = 0
  S.running = true
  S.timeScale = 10
  S.n = 0.625
  S.nPrev = 0.625
  S.period = math.huge
  S.dndts = 0
  S.C = 0.625
  S.rho = 0
  S.rhoComponents = { rod = 0, void = 0, xe = 0, tip = 0, doppler = 0 }
  S.rodPos = 47.5
  S.rodTarget = 47.5
  S.rodSpeed = ROD_SPEED
  S.rodHeld = 0
  S.autoI = 0
  S.scramming = false
  S.scramT = 0
  S.azFired = false
  S.azBlocked = false
  S.scramStartN = 0
  S.xe = 0.4
  S.iodine = 0.4
  S.voidFrac = 20
  S.flow = 75
  S.pumps = { true, true, true, true, true, true, false, false }
  S.pressure = 6.9
  S.level = 50
  S.fuelTemp = 280
  S.protections = { P1 = true, P2 = true, P3 = true, P4 = true, P5 = true }
  S.alarms = { P1 = false, P2 = false, P3 = false, P4 = false, P5 = false, AZ = false }
  S.mode = 'auto'
  S.targetPower = 62
  S.doseRate = 0.12
  S.doseTotal = 0.4
  S.meltdown = false
  S.coreDamage = 0
  S.opr = 30
  S.onEvent = nil
  S.onAlarm = nil
  -- v2.0 状态量
  S.separator_level = 1.0
  S.separator_pressure = 6.9
  S.feedwater_flow = 5000
  S.feedwater_temp = 270
  S.steam_flow = 1470
  S.clad_integrity = 1.0
  S.clad_temp_max = 350
  S.active_rod_drives = 0
  S.rod_drive_temp = 20
  S.rod_drive_overheat = false
  S.scram_time = nil
  S.pre_scram_power = 0
  S.decay_heat_power = 0
  S.reactor_period = math.huge
  S.dP_dt = 0
  S.prev_P_thermal = 3200
  S.quadrant_power = { 800, 800, 800, 800 }
  S.quadrant_xenon = { 0, 0, 0, 0 }
  S.quadrant_rods = { 0.5, 0.5, 0.5, 0.5 }
  S.enable_quadrant_model = false
  S.coolant_activity = 1e3
  S.containment_dose_rate = 0.1
  S.turbine_valve_opening = 1.0
end
resetState()

local function emit(etype, msg)
  if S.onEvent then S.onEvent(etype, msg, S.t) end
end

local function alarmSet(key, val)
  if S.alarms[key] ~= val then
    S.alarms[key] = val
    if S.onAlarm then S.onAlarm(key, val) end
  end
end

local function sign(x)
  if x > 0 then return 1 elseif x < 0 then return -1 else return 0 end
end

-- ==================== 核心物理 ====================

local function stepXenon(dt_h)
  local nEq = S.n
  S.iodine = S.iodine + (nEq - S.iodine) * math.min(1, dt_h * 1.6)
  local burn = XE_BURN * S.n * S.xe
  local prod = I_DECAY * S.iodine * 10
  local decay = 0.075 * S.xe
  S.xe = S.xe + (prod - burn - decay) * dt_h * 6
  if S.xe < 0 then S.xe = 0 elseif S.xe > 2.5 then S.xe = 2.5 end
end

local function stepVoid(dt)
  local target = math.max(0, 8 + S.n * 26 - (S.flow - 100) * 0.35)
  S.voidFrac = S.voidFrac + (target - S.voidFrac) * math.min(1, dt / 3)
  if S.voidFrac < 0 then S.voidFrac = 0 elseif S.voidFrac > 80 then S.voidFrac = 80 end
end

local function computeOPR()
  local rodTerm = (100 - S.rodPos) * 0.42
  local xeTerm = S.xe * 12
  S.opr = math.max(0, math.floor(rodTerm - xeTerm + 8 + 0.5))
  return S.opr
end

local function computeReactivity()
  local rc = S.rhoComponents
  rc.rod = (S.rodPos - 54) * 0.0016
  if not S.scramming then
    local lifting = S.rodTarget > S.rodPos
    local lowFactor = math.max(0, (40 - S.rodPos) / 40)
    if lifting then
      rc.tip = 0.04 * lowFactor * (S.opr < OPR_LIMIT and 1.8 or 0.6)
    else
      rc.tip = 0
    end
  else
    local progress = S.scramT / SCRAM_TIME
    local surge = 0
    local n0 = S.scramStartN
    if n0 > 0.04 and n0 < 0.14 then
      if n0 <= 0.065 then
        surge = 0.9 * (n0 - 0.04) / 0.025
      elseif n0 <= 0.10 then
        surge = 0.9
      else
        surge = 0.9 * (0.14 - n0) / 0.04
      end
    end
    local lowTip = math.max(0, surge * (1 - progress / 0.35))
    local hiTip = 0.016 * (1 - progress / 0.35) * (S.opr < OPR_LIMIT and 2.2 or 0.8)
    rc.tip = lowTip + hiTip
  end
  rc.void = (S.voidFrac - 20) * 0.0009
  rc.xe = -(S.xe - 0.4) * 0.004
  rc.doppler = -(S.n - 0.6) * 0.05
  S.rho = rc.rod + rc.tip + rc.void + rc.xe + rc.doppler
  return S.rho
end

local function stepKinetics(dt)
  S.nPrev = S.n
  local h = math.min(dt, 0.05)
  local steps = math.max(1, math.ceil(dt / h))
  local hh = dt / steps
  local rc = S.rhoComponents
  for _ = 1, steps do
    local a = hh * (S.rho - BETA_EFF) / LAMBDA
    local num = S.n + hh * LAMBDA * S.C
    S.n = num / (1 - a)
    S.C = S.C + hh * (BETA_EFF / LAMBDA * S.n - LAMBDA * S.C)
    if S.n < 1e-5 then S.n = 1e-5 end
    rc.doppler = -(S.n - 0.6) * 0.05
    S.rho = rc.rod + rc.tip + rc.void + rc.xe + rc.doppler
  end
  local dn = S.n - S.nPrev
  local dndt = dt > 0 and dn / dt or 0
  local k = math.min(1, dt / (dt + PERIOD_TAU))
  S.dndts = S.dndts + (dndt - S.dndts) * k
  if S.dndts ~= S.dndts or math.abs(S.dndts) == math.huge then S.dndts = 0 end
  if S.dndts == S.dndts and math.abs(S.dndts) > 1e-6 and math.abs(S.dndts) ~= math.huge
     and S.n > 1e-4 then
    S.period = S.n / S.dndts
    if math.abs(S.period) > PERIOD_MAX then S.period = math.huge end
  else
    S.period = math.huge
  end
end

local function stepRods(dt)
  if S.scramming then
    S.scramT = S.scramT + dt
    S.rodPos = math.max(0, S.rodPos - (100 / SCRAM_TIME) * dt)
    if S.rodPos <= 0 and S.scramT > SCRAM_TIME + 2 then
      S.scramming = false
    end
    return
  end
  -- v2.0: 过热闭锁时禁止棒运动（除 AZ-5 外）
  if S.rod_drive_overheat then return end
  if S.mode == 'auto' and not S.azFired and S.rodHeld == 0 then
    local t = S.targetPower / 100
    local ff = 42 + 16.625 * (2 * t - S.n) + 0.1969 * (S.flow - 100)
    local k = math.min(dt, 2)
    S.autoI = S.autoI + (t - S.n) * k * 0.15
    if S.autoI > 15 then S.autoI = 15 elseif S.autoI < -15 then S.autoI = -15 end
    local want = ff + S.autoI
    if want < 0 then want = 0 elseif want > 100 then want = 100 end
    if S.n < 0.02 and t > 0.1 then
      want = math.max(want, 62)
    end
    local rate = S.rodSpeed * dt * 0.5
    local dw = want - S.rodTarget
    if dw > rate then dw = rate elseif dw < -rate then dw = -rate end
    S.rodTarget = S.rodTarget + dw
  elseif S.rodHeld ~= 0 then
    S.rodTarget = S.rodTarget + S.rodHeld * S.rodSpeed * dt
    if S.rodTarget < 0 then S.rodTarget = 0 elseif S.rodTarget > 100 then S.rodTarget = 100 end
  end
  local diff = S.rodTarget - S.rodPos
  if math.abs(diff) > 0.01 then
    local step = sign(diff) * math.min(math.abs(diff), S.rodSpeed * dt)
    S.rodPos = S.rodPos + step
    S.active_rod_drives = math.min(V2.rod.max_sim, math.floor(math.abs(diff) * 2.1 + 0.5))
  else
    S.active_rod_drives = 0
  end
  if S.rodPos < 0 then S.rodPos = 0 elseif S.rodPos > 100 then S.rodPos = 100 end
end

local function stepThermal(dt)
  local pumpsOn = 0
  for i = 1, 8 do if S.pumps[i] then pumpsOn = pumpsOn + 1 end end
  S.flow = pumpsOn / 8 * 100
  local pTarget = 6.5 + S.n * 0.65
  S.pressure = S.pressure + (pTarget - S.pressure) * math.min(1, dt / 5)
  local lTarget = 50 + (S.flow - 100) * 0.2
  S.level = S.level + (lTarget - S.level) * math.min(1, dt / 4)
  -- v2.0: 热源 = 裂变功率 + 衰变热
  local fissionPower = S.n
  local decayPower = S.decay_heat_power / N_NOM
  local totalPower = fissionPower + decayPower
  local tTarget = 270 + totalPower * 30
  S.fuelTemp = S.fuelTemp + (tTarget - S.fuelTemp) * math.min(1, dt / 8)
end

local function fireAZ(reason)
  if S.scramming or S.azFired then return end
  if S.azBlocked then
    emit('warn', 'АЗ-5 被闭锁 (钥匙) — ' .. reason .. ' 未触发停堆!')
    return
  end
  S.scram_time = S.t
  S.pre_scram_power = S.n * N_NOM
  S.scramming = true
  S.scramT = 0
  S.azFired = true
  S.scramStartN = S.n
  S.rodTarget = 0
  alarmSet('AZ', true)
  emit('alarm', 'АЗ-5 动作: ' .. reason .. ' — 全部控制棒下插')
end

local function stepProtections()
  local P = S.protections
  local nPct = S.n * 100

  local p1 = P.P1 and nPct > 110
  alarmSet('P1', p1)
  if p1 then fireAZ('П1 功率超限') end

  local p2 = P.P2 and S.period > 0 and S.period < 10 and S.n >= 0.2
  alarmSet('P2', p2)
  if p2 then fireAZ('П2 周期过短') end

  local p3 = P.P3 and S.pressure > 7.25
  alarmSet('P3', p3)
  if p3 then fireAZ('П3 压力超限') end

  local p4 = P.P4 and (S.level < 20 or S.level > 85)
  alarmSet('P4', p4)
  if p4 then fireAZ('П4 水位异常') end

  local p5 = P.P5 and S.coreDamage > 5
  alarmSet('P5', p5)
  if p5 and not S.azFired then fireAZ('П5 工艺管破损') end

  if S.opr < OPR_LIMIT and S.t % 30 < 0.1 then
    emit('warn', 'ОЗР = ' .. S.opr .. ' ст. — 低于阈值 ' .. OPR_LIMIT .. ' 根')
  end
  if S.opr < OPR_SCRAM and not S.azFired and S.n > 0.05 then
    emit('alarm', 'ОЗР = ' .. S.opr .. ' < ' .. OPR_SCRAM .. ' — 应立即停堆!')
  end
end

local function stepDamage(dt)
  if S.meltdown then return end
  local nPct = S.n * 100
  if nPct > 120 then
    S.coreDamage = S.coreDamage + (nPct - 120) * dt * 2
    if S.coreDamage >= 100 then
      S.meltdown = true
      S.doseRate = 300000
      emit('alarm', '堆芯熔毁 — 燃料包壳失效, 放射性大量释放')
    end
  elseif S.fuelTemp > 350 then
    S.coreDamage = S.coreDamage + (S.fuelTemp - 350) * dt * 0.05
  end
  if S.coreDamage > 100 then S.coreDamage = 100 end
  local base = 0.12 + S.coreDamage * 2 + (S.meltdown and 300000 or 0)
  S.doseRate = S.doseRate + (base - S.doseRate) * math.min(1, dt / 2)
  S.doseTotal = S.doseTotal + S.doseRate * dt / 3600
end

-- ==================== v2.0 增量系统 ====================

local function updateSeparator(dt)
  S.steam_flow = S.n * N_NOM * 2.4
  local turbine_flow = S.steam_flow * S.turbine_valve_opening
  local feed_kg_s = S.feedwater_flow * V2.sep.rho_w / 3600
  local steam_kg_s = S.steam_flow * 1000 / 3600
  local dLevel = (feed_kg_s - steam_kg_s) / (V2.sep.rho_w * V2.sep.A)
  S.separator_level = S.separator_level + dLevel * dt
  if S.separator_level < 0 then S.separator_level = 0
  elseif S.separator_level > 2.0 then S.separator_level = 2.0 end
  local dPressure = (S.steam_flow - turbine_flow) / V2.sep.V * V2.sep.K_p
  S.separator_pressure = S.separator_pressure + dPressure * dt
  if S.separator_pressure < 0.1 then S.separator_pressure = 0.1
  elseif S.separator_pressure > 8.0 then S.separator_pressure = 8.0 end
  local void_corr = (V2.sep.P_nom - S.separator_pressure) * 0.02
  S.voidFrac = S.voidFrac + void_corr * dt * 0.1
  if S.separator_level < 0.3 then
    S.flow = S.flow + (math.random() - 0.5) * 30 * dt
  end
end

local function updateFeedwater(dt)
  local T_target = V2.feed.T_normal
  if S.separator_pressure < 0.1 then T_target = V2.feed.T_deaerator end
  S.feedwater_temp = S.feedwater_temp + (T_target - S.feedwater_temp) * math.min(1, dt / V2.feed.tau)
end

local function updateCladIntegrity(dt)
  S.clad_temp_max = 270 + S.n * 130
  local shock = math.abs(S.feedwater_temp - S.clad_temp_max) * (S.flow / 100)
  if shock > V2.clad.shock_sev then
    S.clad_integrity = S.clad_integrity - (shock - V2.clad.shock_sev) * V2.clad.dmg_sev * dt
  elseif shock > V2.clad.shock_mod then
    S.clad_integrity = S.clad_integrity - (shock - V2.clad.shock_mod) * V2.clad.dmg_mod * dt
  end
  if S.clad_integrity < 0 then S.clad_integrity = 0
  elseif S.clad_integrity > 1 then S.clad_integrity = 1 end
  if S.clad_integrity < V2.clad.leak_thr then
    S.coolant_activity = S.coolant_activity + (1.0 - S.clad_integrity) * 1e8 * dt
  end
  if S.clad_integrity < V2.clad.rel_thr then
    S.containment_dose_rate = S.containment_dose_rate
      + (V2.clad.rel_thr - S.clad_integrity) * 20 * dt
  end
  if S.clad_integrity < V2.clad.fail_thr and not S.meltdown then
    emit('alarm', '包壳大面积破裂 — 燃料损坏事故')
  end
end

local function updateDecayHeat(_dt)
  if S.scram_time == nil then
    S.decay_heat_power = 0
    return
  end
  local t = S.t - S.scram_time
  if t <= 0 then
    S.decay_heat_power = S.pre_scram_power * V2.decay.max_frac
    return
  end
  local frac = V2.decay.c1 * t ^ V2.decay.e1 + V2.decay.c2 * t ^ V2.decay.e2
  if frac > V2.decay.max_frac then frac = V2.decay.max_frac end
  S.decay_heat_power = S.pre_scram_power * frac
end

local function updatePeriod(dt)
  local P = S.n * N_NOM
  local dP = P - S.prev_P_thermal
  S.dP_dt = dt > 0 and dP / dt or 0
  if math.abs(S.dP_dt) < 1e-6 then
    S.reactor_period = math.huge
  else
    S.reactor_period = P / S.dP_dt
  end
  S.prev_P_thermal = P
end

local function updateQuadrants(dt)
  if not S.enable_quadrant_model then
    if S.t > V2.quad.enable_t and S.n < V2.quad.enable_p then
      S.enable_quadrant_model = true
      emit('info', '空间效应模型已启用 — 四象限动力学')
    end
    return
  end
  local totalPower = S.n * N_NOM
  local weights, sumW = {}, 0
  for i = 1, 4 do
    local localRho = -S.quadrant_xenon[i] * V2.quad.xe_worth
      - S.quadrant_rods[i] * V2.quad.rod_worth
      + (S.voidFrac / 100) * V2.quad.void_worth
    weights[i] = math.exp(localRho / BETA_EFF)
    sumW = sumW + weights[i]
  end
  for i = 1, 4 do
    S.quadrant_power[i] = totalPower * weights[i] / sumW
  end
  for i = 1, 4 do
    local qN = S.quadrant_power[i] / N_NOM
    local target = qN > 0.01 and S.xe / (qN * 4) or S.xe
    S.quadrant_xenon[i] = S.quadrant_xenon[i] + (target - S.quadrant_xenon[i]) * math.min(1, dt / 60)
  end
end

local function updateRadiation(dt)
  local source = (1.0 - S.clad_integrity) * 1e8 * S.n
  local decay = S.coolant_activity * V2.rad.lambda_N16
  local removal = S.coolant_activity * (V2.rad.cleanup / V2.rad.total_flow)
  S.coolant_activity = S.coolant_activity + (source - decay - removal) * dt
  if S.coolant_activity < 0 then S.coolant_activity = 0 end
  S.containment_dose_rate = V2.rad.base_dose
    + S.coolant_activity * V2.rad.leak
    + (1.0 - S.clad_integrity) * V2.rad.fuel_rel
end

local function updateRodDrives(dt)
  S.rod_drive_temp = S.rod_drive_temp
    + S.active_rod_drives * V2.rod.heat_rate * dt
    - (S.rod_drive_temp - 20) * V2.rod.cool_rate * dt
  if S.rod_drive_temp > V2.rod.overheat and not S.rod_drive_overheat then
    S.rod_drive_overheat = true
    S.active_rod_drives = 0
    emit('warn', '驱动机构过热闭锁 — 控制棒停止运动')
  end
  if S.rod_drive_overheat and S.rod_drive_temp < V2.rod.recover then
    S.rod_drive_overheat = false
    emit('info', '驱动机构已冷却 — 控制棒恢复运动')
  end
end

local function updateV2Protections()
  if S.clad_integrity < 0.1 and not S.meltdown then
    emit('alarm', '包壳大面积破裂 — 必须立即停堆')
  end
  if S.separator_level < 0.2 and S.n > 0.1 then
    emit('alarm', '汽水分离器干烧 — 水位低于急限')
  end
  if S.rod_drive_overheat and S.reactor_period < 20 and S.reactor_period > 0 then
    emit('warn', '无棒临界 — 不能插棒 + 功率在升 = 极度危险')
  end
end

-- ==================== 主步进 ====================

function Engine.step(dtReal)
  if not S.running or S.meltdown then
    if S.meltdown then
      S.t = S.t + dtReal * S.timeScale
      S.doseTotal = S.doseTotal + S.doseRate * dtReal * S.timeScale / 3600
    end
    return
  end
  local dt = dtReal * S.timeScale
  S.t = S.t + dt
  stepRods(dt)
  stepVoid(dt)
  stepXenon(dt / 3600)
  computeOPR()
  computeReactivity()
  stepKinetics(dt)
  stepThermal(dt)
  stepProtections()
  stepDamage(dt)
  updateSeparator(dt)
  updateFeedwater(dt)
  updateCladIntegrity(dt)
  updateDecayHeat(dt)
  updatePeriod(dt)
  updateQuadrants(dt)
  updateRadiation(dt)
  updateRodDrives(dt)
  updateV2Protections()
end

-- ==================== 公开操作 API ====================

function Engine.manualAZ()
  if S.azBlocked then
    emit('warn', 'АЗ-5 被钥匙闭锁, 无法触发')
    return false
  end
  fireAZ('手动触发')
  return true
end

Engine.fireAZ = fireAZ

function Engine.setTargetPower(p)
  if p < 0 then p = 0 elseif p > 120 then p = 120 end
  S.targetPower = p
end

function Engine.initFullPower()
  S.n = 1.0; S.nPrev = 1.0; S.C = 1.0
  S.targetPower = 100
  S.rodPos = 53.7; S.rodTarget = 53.7
  S.autoI = 0; S.period = math.huge; S.dndts = 0
  S.prev_P_thermal = 3200
  S.reactor_period = math.huge
  S.dP_dt = 0
  S.separator_level = 1.0
  S.separator_pressure = 6.9
  S.feedwater_flow = 5000
  S.feedwater_temp = 270
  S.steam_flow = 1470
  S.clad_integrity = 1.0
  S.clad_temp_max = 350
  S.active_rod_drives = 0
  S.rod_drive_temp = 20
  S.rod_drive_overheat = false
  S.scram_time = nil
  S.pre_scram_power = 0
  S.decay_heat_power = 0
  S.quadrant_power = { 800, 800, 800, 800 }
  S.quadrant_xenon = { 0, 0, 0, 0 }
  S.quadrant_rods = { 0.5, 0.5, 0.5, 0.5 }
  S.enable_quadrant_model = false
  S.coolant_activity = 1e3
  S.containment_dose_rate = 0.1
  S.turbine_valve_opening = 1.0
end

function Engine.setRodSpeed(v) S.rodSpeed = v end

function Engine.setMode(m)
  S.mode = m
  emit('info', m == 'auto' and '切换至自动调节模式' or '切换至手动棒控模式')
end

function Engine.setRodTarget(p)
  if p < 0 then p = 0 elseif p > 100 then p = 100 end
  S.rodTarget = p
end

function Engine.beginRodMove(dir) S.rodHeld = dir > 0 and 1 or -1 end
function Engine.endRodMove() S.rodHeld = 0 end

function Engine.togglePump(i)
  S.pumps[i] = not S.pumps[i]
  emit('info', 'ГЦН-' .. i .. ' ' .. (S.pumps[i] and '启动' or '停止'))
end

function Engine.setTimeScale(x) S.timeScale = x end

function Engine.clearScram()
  S.azFired = false
  S.scramming = false
  S.azBlocked = false
  alarmSet('AZ', false)
end

function Engine.advanceSim(sec)
  local left = sec
  while left > 0 and not S.meltdown do
    local chunk = math.min(left, 2)
    Engine.step(chunk / S.timeScale)
    left = left - chunk
  end
end

function Engine.toggleKey()
  S.azBlocked = not S.azBlocked
  emit(S.azBlocked and 'warn' or 'info',
    S.azBlocked and '保护闭锁钥匙已拔出 — АЗ-5 被禁止' or '保护闭锁解除 — АЗ-5 可用')
  return S.azBlocked
end

-- ==================== 状态快照（无尽模式存档用） ====================

local function copyVal(v)
  if type(v) == 'table' then
    local out = {}
    for k, vv in pairs(v) do out[k] = copyVal(vv) end
    return out
  end
  return v
end

function Engine.exportState()
  local out = copyVal(S)
  out.onEvent = nil
  out.onAlarm = nil
  return out
end

function Engine.importState(snap)
  if not snap then return end
  for k, v in pairs(snap) do
    if k ~= 'onEvent' and k ~= 'onAlarm' then
      S[k] = copyVal(v)
    end
  end
end

function Engine.reset()
  -- 注意 flow / targetPower / rodSpeed / protections 不在重置清单内
  -- （保留上次运行残留，首步 stepVoid 会读旧 flow ）
  S.t = 0; S.n = 0.625; S.nPrev = 0.625; S.C = 0.625
  S.period = math.huge; S.dndts = 0
  S.rodPos = 47.5; S.rodTarget = 47.5; S.rodHeld = 0; S.autoI = 0
  S.scramming = false; S.scramT = 0
  S.azFired = false; S.azBlocked = false; S.scramStartN = 0
  S.xe = 0.4; S.iodine = 0.4
  S.voidFrac = 20; S.meltdown = false; S.coreDamage = 0
  S.doseRate = 0.12; S.doseTotal = 0.4; S.opr = 30
  S.timeScale = 10; S.mode = 'auto'
  S.pressure = 6.9; S.level = 50; S.fuelTemp = 280
  S.separator_level = 1.0; S.separator_pressure = 6.9
  S.feedwater_flow = 5000; S.feedwater_temp = 270; S.steam_flow = 1470
  S.clad_integrity = 1.0; S.clad_temp_max = 350
  S.active_rod_drives = 0; S.rod_drive_temp = 20; S.rod_drive_overheat = false
  S.scram_time = nil; S.pre_scram_power = 0; S.decay_heat_power = 0
  S.reactor_period = math.huge; S.dP_dt = 0; S.prev_P_thermal = 3200
  S.quadrant_power = { 800, 800, 800, 800 }
  S.quadrant_xenon = { 0, 0, 0, 0 }
  S.quadrant_rods = { 0.5, 0.5, 0.5, 0.5 }
  S.enable_quadrant_model = false
  S.coolant_activity = 1e3; S.containment_dose_rate = 0.1
  S.turbine_valve_opening = 1.0
  S.pumps = { true, true, true, true, true, true, false, false }
  for k in pairs(S.alarms) do S.alarms[k] = false end
  emit('info', '仿真已重置')
end

return Engine
