-- instrument.lua — 仪表中间层 + 报警灯状态机 · app.js instLayer/alarmLamps 移植
-- 物理引擎输出 → 量程截断 → 一阶滞后 → 噪声叠加 → 故障注入 → DisplayValue
-- 报警灯：OFF → FAST_BLINK →(КВИТ)→ ON →(条件消除)→ SLOW_BLINK → OFF

local Instrument = {}

-- ==================== 量程 ====================

Instrument.DETECTOR_RANGES = {
  { id = 0, name = 'С 源量程',   min = 1e-6, max = 1e-3 },
  { id = 1, name = 'П 中间量程', min = 1e-3, max = 0.01 },
  { id = 2, name = '1 功率量程1', min = 0.001, max = 0.10 },
  { id = 3, name = '2 功率量程2', min = 0.01,  max = 1.20 },
  { id = 4, name = '3 功率量程3', min = 0.10,  max = 1.20 },
}

-- 仪表参数：tau(滞后 s), noiseAmp(噪声幅度 %FS), noiseFreq(Hz)
local INST_SPECS = {
  power      = { tau = 0.5, noiseAmp = 0.003, noiseFreq = 0.8 },
  period     = { tau = 1.0, noiseAmp = 0.005, noiseFreq = 0.5 },
  sep_level  = { tau = 1.5, noiseAmp = 0.004, noiseFreq = 0.6 },
  sep_press  = { tau = 2.0, noiseAmp = 0.003, noiseFreq = 0.4 },
  fw_flow    = { tau = 1.0, noiseAmp = 0.005, noiseFreq = 1.0 },
  fw_temp    = { tau = 0,   noiseAmp = 0.002, noiseFreq = 0.3 },
  steam_flow = { tau = 0.5, noiseAmp = 0.004, noiseFreq = 0.5 },
  dose       = { tau = 5.0, noiseAmp = 0.02,  noiseFreq = 0.1 },
  coolant    = { tau = 3.0, noiseAmp = 0.01,  noiseFreq = 0.2 },
}
Instrument.INST_SPECS = INST_SPECS

local state = {}
local faults = {}
local currentRange = 2
local switchTimer = 0
local simTime = 0

function Instrument.init()
  state = {}
  faults = {}
  currentRange = 2
  switchTimer = 0
  simTime = 0
  for id in pairs(INST_SPECS) do
    state[id] = { displayed = 0, phase = math.random() * math.pi * 2 }
  end
end
Instrument.init()

function Instrument.currentRangeId() return currentRange end
function Instrument.rangeName()
  return Instrument.DETECTOR_RANGES[currentRange + 1] and
    Instrument.DETECTOR_RANGES[currentRange + 1].name or '?'
end
function Instrument.switching() return switchTimer > 0 end

-- 量程截断：功率分数 → 显示值
function Instrument.truncatePower(n)
  local range = Instrument.DETECTOR_RANGES[currentRange + 1]
  if not range then return n end
  if n < range.min then return 0 end
  if n > range.max then return range.max end
  return n
end

-- 一阶滞后 + 噪声 + 故障
function Instrument.update(id, trueValue, dt)
  local spec = INST_SPECS[id]
  if not spec then return trueValue end
  local st = state[id]
  if not st then
    st = { displayed = trueValue, phase = math.random() * math.pi * 2 }
    state[id] = st
  end
  if spec.tau > 0 and dt > 0 then
    st.displayed = st.displayed + (trueValue - st.displayed) * math.min(1, dt / spec.tau)
  else
    st.displayed = trueValue
  end
  simTime = simTime + dt
  local periodic = spec.noiseAmp * math.sin(2 * math.pi * spec.noiseFreq * simTime + st.phase)
  local random = spec.noiseAmp * 0.3 * (math.random() * 2 - 1)
  local fault = faults[id]
  if fault then
    if fault.mode == 'STUCK' then return st.displayed
    elseif fault.mode == 'DRIFT' then return trueValue + (simTime - fault.startTime) / 60 * fault.driftRate
    elseif fault.mode == 'PEGGED' then return 1.2
    elseif fault.mode == 'JITTER' then return trueValue + fault.jitterAmp * (math.random() * 2 - 1)
    elseif fault.mode == 'REVERSE' then return 1.2 - trueValue
    elseif fault.mode == 'DEAD' then return 0 end
  end
  return st.displayed + periodic + random
end

function Instrument.injectFault(id, mode, params)
  params = params or {}
  faults[id] = {
    mode = mode,
    startTime = simTime,
    driftRate = params.driftRate or 0.5,
    jitterAmp = params.jitterAmp or 0.2,
    duration = params.duration or 30,
  }
end

function Instrument.clearFault(id) faults[id] = nil end
function Instrument.hasFault(id) return faults[id] ~= nil end

function Instrument.switchRange(newRange)
  if newRange == currentRange then return end
  if newRange < 0 then newRange = 0 elseif newRange > 4 then newRange = 4 end
  currentRange = newRange
  state.power = state.power or { displayed = 0, phase = 0 }
  state.power.displayed = 0
  switchTimer = 0.8
end

function Instrument.updateTimer(dt)
  if switchTimer > 0 then switchTimer = switchTimer - dt end
end

-- ==================== 报警灯状态机（4 态） ====================

local lamps = {}
local LAMP_IDS = { 'SEP_LO', 'SEP_HI', 'FW_COLD', 'THERMAL_SH', 'CLAD',
                   'PERIOD_W', 'PERIOD_C', 'DECAY', 'RAD' }

function Instrument.initLamps()
  lamps = {}
  for i = 1, #LAMP_IDS do lamps[LAMP_IDS[i]] = 'OFF' end
end
Instrument.initLamps()

function Instrument.lampState(id) return lamps[id] or 'OFF' end

function Instrument.lampSet(id, condition)
  local current = lamps[id] or 'OFF'
  if condition then
    if current == 'OFF' then lamps[id] = 'FAST_BLINK' end
  else
    if current == 'ON' then lamps[id] = 'SLOW_BLINK'
    elseif current == 'FAST_BLINK' then lamps[id] = 'OFF' end
  end
end

function Instrument.kvit()
  for id, st in pairs(lamps) do
    if st == 'FAST_BLINK' then lamps[id] = 'ON'
    elseif st == 'SLOW_BLINK' then lamps[id] = 'OFF' end
  end
end

-- 每帧根据引擎状态驱动灯（S = engine.S）
function Instrument.updateLamps(S)
  Instrument.lampSet('SEP_LO', S.separator_level < 0.5)
  Instrument.lampSet('SEP_HI', S.separator_level > 1.5)
  Instrument.lampSet('FW_COLD', S.feedwater_temp < 100)
  local shock = math.abs(S.feedwater_temp - S.clad_temp_max) * (S.flow / 100)
  Instrument.lampSet('THERMAL_SH', shock > 150)
  Instrument.lampSet('CLAD', S.clad_integrity < 0.8)
  Instrument.lampSet('PERIOD_W', S.reactor_period > 0 and S.reactor_period < 80 and S.reactor_period > 20)
  Instrument.lampSet('PERIOD_C', S.reactor_period > 0 and S.reactor_period < 20)
  Instrument.lampSet('DECAY', S.decay_heat_power > 50 and S.flow < 50)
  Instrument.lampSet('RAD', S.containment_dose_rate > 1)
end

Instrument.LAMP_IDS = LAMP_IDS

return Instrument
