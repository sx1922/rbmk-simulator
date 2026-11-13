-- endless.lua — БЕСКОНЕЧНЫЙ РЕЖИМ · 无尽模式 · web/js/endless.js 1:1 移植
-- 功能：逐月结算 / 事件系统 / 燃耗换料 / 机组大修 / 员工班组 / 经营目标 / 成就 / 存档继续

local Engine = require('src.engine')
local KvStore = require('src.kvstore')

local Endless = {}

local SHIFT_S = 8 * 3600
local DAY_S = 3 * SHIFT_S
local MONTH_S = 30 * DAY_S

local BASE_PRICE = 0.02
local START_MONEY = 8000000
local MAINT_MONTH = 300000
local AGING_PER_MONTH = 15000
local REFUEL_COST = 12000000
local REFUEL_OUTAGE_S = 5 * DAY_S
local OVERHAUL_OUTAGE_S = 14 * DAY_S
local FINE_AZ = 500000
local FINE_ALARM = 100000
local FINE_REFUSE_DISPATCH = 300000
local SUBSIDY_DISPATCH = 150000
local FINE_INSPECT = 500000
local PUMP_FAST_COST = 500000
local PUMP_FAST_S = 1800
local PUMP_SLOW_COST = 250000
local PUMP_SLOW_S = 3 * 3600
local LOSS_LIMIT = 6
local BURN_FULL_MONTH = 3.1
local BURN_REMIND = 34
local BURN_FORCE = 40
local START_YEAR = 1986
local START_MONTH_IDX = 4

local BEST_KEY = 'rbmk_endless_best'
local SAVE_KEY = 'rbmk_endless_save'
local ACH_KEY = 'rbmk_endless_achievements'

local CREW_ROLES = { '值长', '资深操作员', '操作员', '机械师', '电气师', '仪表工', '化学师', '安全员' }
local CREW_NAMES = { '伊万诺夫 Иванов', '彼得罗夫 Петров', '西多罗夫 Сидоров', '斯米尔诺夫 Смирнов',
  '库兹涅佐夫 Кузнецов', '波波夫 Попов', '索科洛夫 Соколов', '列别杰夫 Лебедев',
  '科兹洛夫 Козлов', '诺维科夫 Новиков', '莫罗佐夫 Морозов', '沃罗比约夫 Воробьёв',
  '费奥多罗夫 Фёдоров', '米哈伊洛夫 Михайлов', '别利亚耶夫 Беляев', '古谢夫 Гусев' }
local HIRE_COST = 120000
local FIRE_COST = 60000
local BONUS_COST = 50000

local MONTH_NAMES = { '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二' }

local function rnd(min, max) return min + math.random() * (max - min) end

local function pad2(n)
  n = math.floor(n)
  if n < 10 then return '0' .. n end
  return tostring(n)
end

local function fmtMoney(v)
  local s = tostring(math.floor(v + 0.5))
  local out = s:reverse():gsub('(%d%d%d)', '%1,'):reverse()
  return (out:gsub('^,', ''))
end

local function genMember(i)
  return {
    id = 'c' .. i,
    name = CREW_NAMES[(i - 1) % #CREW_NAMES + 1],
    role = CREW_ROLES[(i - 1) % #CREW_ROLES + 1],
    competence = math.floor(rnd(0.55, 0.98) * 100 + 0.5) / 100,
    morale = math.floor(rnd(0.6, 1.0) * 100 + 0.5) / 100,
  }
end

local function genCrew()
  local crew = {}
  for i = 1, 8 do crew[i] = genMember(i) end
  return crew
end

local function wagesTotal(E)
  local s = 0
  for _, m in ipairs(E.crew) do s = s + 85000 * (0.7 + 0.6 * m.competence) end
  return s
end

local function avgCompetence(E)
  if #E.crew == 0 then return 0 end
  local s = 0
  for _, m in ipairs(E.crew) do s = s + m.competence end
  return s / #E.crew
end

local function avgMorale(E)
  if #E.crew == 0 then return 0 end
  local s = 0
  for _, m in ipairs(E.crew) do s = s + m.morale end
  return s / #E.crew
end

local GOAL_DEFS = {
  { id = 'g_profit_first', text = '首次实现单月盈利', reward = 300000,
    test = function(E) return E.monthProfit > 0 end },
  { id = 'g_profit_2m', text = '单月利润突破 200 万', reward = 500000,
    test = function(E) return E.monthProfit > 2000000 end },
  { id = 'g_safe_90', text = '连续 90 天无报警', reward = 1000000,
    test = function(E) return E.noAlarmDays >= 90 end },
  { id = 'g_refuel_3', text = '完成 3 次换料', reward = 1500000,
    test = function(E) return E.refuels >= 3 end },
  { id = 'g_year', text = '安全运行满一年（无熔毁）', reward = 3000000,
    test = function(E, S) return E.monthIdx >= 11 and not S.meltdown end },
  { id = 'g_cash_50m', text = '现金储备突破 5000 万', reward = 2000000,
    test = function(E) return E.money >= 50000000 end },
  { id = 'g_crew_strong', text = '班组平均能力达到 0.85', reward = 800000,
    test = function(E) return avgCompetence(E) >= 0.85 end },
}

local ACH_DEFS = {
  { id = 'a_first_month', text = '完成首次月结算' },
  { id = 'a_first_refuel', text = '首次完成换料' },
  { id = 'a_first_overhaul', text = '首次完成机组大修' },
  { id = 'a_pumps_5', text = '维修 5 台主循环泵' },
  { id = 'a_scram_10', text = '触发 10 次 АЗ-5' },
  { id = 'a_profit_10m', text = '累计盈利突破 1000 万' },
  { id = 'a_year_1', text = '安全运行满一年' },
  { id = 'a_meltdown', text = '堆芯熔毁（一次）' },
  { id = 'a_bankrupt', text = '宣告破产' },
  { id = 'a_best_5000', text = '单局得分达到 5000' },
}

local function seasonFactor(m)
  if m == 11 or m <= 1 then return 1.2 end
  if m >= 5 and m <= 7 then return 1.1 end
  return 1.0
end

-- ==================== 运行时 ====================

local current = nil

local function create()
  local E = {
    simTime = 0,
    money = START_MONEY,
    price = BASE_PRICE,
    priceNoise = 0,
    monthIdx = 0,
    monthIncome = 0,
    monthFines = 0,
    monthEvents = 0,
    monthProfit = 0,
    monthHistory = {},
    energyMWh = 0,
    burnup = 0,
    outageS = 0,
    outage = nil,
    lossStreak = 0,
    daysRun = 0,
    scramCount = 0,
    alarmCount = 0,
    refuels = 0,
    pumpRepairs = 0,
    profitTotal = 0,
    speed = 10,
    nextEventAt = 20 * 3600 + math.random() * 50 * 3600,
    event = nil,
    eventTimeout = 0,
    dispatch = nil,
    inspection = nil,
    pendingPumps = {},
    refuelArmed = false,
    refuelCostMul = 1,
    burnupBoostUntil = 0,
    overhaulDueAt = 12 * MONTH_S,
    overhaulArmed = false,
    overhaulCount = 0,
    overhaulDelayCount = 0,
    crew = genCrew(),
    goals = {},
    achEmitted = {},
    modifiers = {},
    noAlarmDays = 0,
    lastCrewTick = 0,
    powerSum = 0,
    powerTime = 0,
    bankrupt = false,
    finished = false,
    listeners = {},
  }
  for i, g in ipairs(GOAL_DEFS) do
    E.goals[i] = { id = g.id, text = g.text, reward = g.reward, done = false }
  end
  return E
end

local function emit(name, payload)
  local E = current
  if not E or not E.listeners[name] then return end
  for _, fn in ipairs(E.listeners[name]) do fn(payload or {}) end
end

function Endless.on(name, fn)
  local E = current
  if not E then return end
  E.listeners[name] = E.listeners[name] or {}
  table.insert(E.listeners[name], fn)
end

function Endless.setSpeed(x)
  local E = current
  if not E then return end
  E.speed = x
  Engine.setTimeScale(x)
  emit('speed', { value = x })
end

local function getDate(E)
  local month = math.floor(E.simTime / MONTH_S)
  local day = math.floor(E.simTime / DAY_S) % 30 + 1
  local shift = math.floor(E.simTime / SHIFT_S) % 3 + 1
  local m = START_MONTH_IDX + month
  local year = START_YEAR + math.floor(m / 12)
  local monthOfYear = m % 12 + 1
  return {
    month = month + 1,
    day = day,
    shift = shift,
    dateStr = pad2(day) .. '.' .. pad2(monthOfYear) .. '.' .. year,
    monthName = pad2(monthOfYear) .. '.' .. year,
  }
end

local function priceUpdate(E, dtS)
  local wave = 0.3 * math.sin(2 * math.pi * E.simTime / (7 * DAY_S) + 1.3)
  E.priceNoise = E.priceNoise + (math.random() - 0.5) * 0.0015
  if E.priceNoise > 0.008 then E.priceNoise = 0.008 end
  if E.priceNoise < -0.008 then E.priceNoise = -0.008 end
  local m = (START_MONTH_IDX + math.floor(E.simTime / MONTH_S)) % 12
  local hour = math.floor((E.simTime % DAY_S) / SHIFT_S) + 1
  local loadFactor = 0.94 + 0.14 * (hour == 2 and 1 or 0) + 0.05 * (hour == 1 and 1 or 0)
  local extra = 0
  for i = #E.modifiers, 1, -1 do
    if E.simTime >= E.modifiers[i].endTime then
      table.remove(E.modifiers, i)
    else
      extra = extra + E.modifiers[i].priceAdd
    end
  end
  local p = BASE_PRICE * (1 + wave + E.priceNoise) * seasonFactor(m) * loadFactor + extra
  if p < 0.012 then p = 0.012 end
  if p > 0.032 then p = 0.032 end
  E.price = p
end

local function log(E, msg)
  emit('log', { text = msg })
end

local function startEvent(E, evt, urgent)
  E.event = evt
  E.eventTimeout = evt.timeoutS
  E.monthEvents = E.monthEvents + 1
  if urgent and Engine.S.timeScale > 1 then
    Endless.setSpeed(1)
    log(E, '紧急事件：时间流速已降至 ×1。')
  end
  emit('event', { id = evt.id, title = evt.title, desc = evt.desc, options = evt.options })
end

-- ==================== 事件生成器 ====================

local function pumpEvent(E)
  local running = {}
  for i = 1, 8 do if Engine.S.pumps[i] then running[#running + 1] = i end end
  if #running == 0 then return end
  local idx = running[math.random(#running)]
  Engine.S.pumps[idx] = false
  local left = 0
  for i = 1, 8 do if Engine.S.pumps[i] then left = left + 1 end end
  startEvent(E, {
    id = 'pump_fail_' .. idx,
    title = 'ГЦН 故障 · 主循环泵',
    desc = '泵 ' .. idx .. ' 改变位置。流量下降。需要维修。',
    options = {
      { id = 'fast', label = '立即维修 (₽0.5M · 30 分钟)' },
      { id = 'slow', label = '等维修班 (₽0.25M · 3 小时)' },
    },
    timeoutS = 7200,
    data = { idx = idx, left = left },
  }, left < 5)
end

local function steamEvent(E)
  local cost = math.floor(300000 + avgCompetence(E) * 100000)
  startEvent(E, {
    id = 'steam_leak',
    title = '蒸汽阀泄漏 · ПАРОПРОВОД',
    desc = '主蒸汽管道阀门泄漏。压力波动。',
    options = {
      { id = 'fix', label = '立即抢修 (₽' .. fmtMoney(cost) .. ' · 停机 2 小时)' },
      { id = 'hold', label = '维持运行 (有爆管风险)' },
    },
    timeoutS = 6 * 3600,
  }, true)
end

local function dieselEvent(E)
  startEvent(E, {
    id = 'diesel_test',
    title = '柴油机月度试验 · ДИЗЕЛЬ',
    desc = '备用柴油发电机月度启动试验（班组能力影响通过率）。',
    options = {
      { id = 'test', label = '执行试验 (₽40K)' },
      { id = 'skip', label = '跳过 (罚款 ₽100K)' },
    },
    timeoutS = 6 * 3600,
  }, false)
end

local function fuelLeakEvent(E)
  startEvent(E, {
    id = 'fuel_leak',
    title = '燃料棒破损检测 · ТВЭЛ',
    desc = '回路活性检测提示可能存在燃料棒破损。',
    options = {
      { id = 'repair', label = '停机检测 (₽200K · 停机 2 小时)' },
      { id = 'run', label = '继续运行 (燃耗加速)' },
    },
    timeoutS = 6 * 3600,
  }, false)
end

local function supplierEvent(E)
  startEvent(E, {
    id = 'supplier_strike',
    title = '供货商罢工 · ПОСТАВЩИК',
    desc = '燃料供应商工人罢工，下次换料成本将上涨 20%。',
    options = {
      { id = 'pay', label = '支付加班费 (₽100K，取消涨价)' },
      { id = 'accept', label = '接受涨价' },
    },
    timeoutS = 6 * 3600,
  }, false)
end

local function workerEvent(E)
  startEvent(E, {
    id = 'worker_accident',
    title = '工人事故 · ТРАВМА',
    desc = '检修时一名工人轻伤（班组士气影响后续风险）。',
    options = {
      { id = 'treat', label = '妥善处理 (₽120K · 士气回升)' },
      { id = 'minimize', label = '低调处理 (有被检查风险)' },
    },
    timeoutS = 6 * 3600,
  }, false)
end

local function stormEvent(E)
  startEvent(E, {
    id = 'storm',
    title = '暴风雨 · ГРОЗА',
    desc = '强雷暴天气，电网不稳定，电价将下跌 10%（2 天）。',
    options = {
      { id = 'grid', label = '接入备用线路 (₽250K)' },
      { id = 'accept', label = '接受电价波动' },
    },
    timeoutS = 6 * 3600,
  }, false)
end

local function moraleEvent(E)
  startEvent(E, {
    id = 'morale_issue',
    title = '班组士气低落 · МОРАЛЬ',
    desc = '连续高强度值班后班组疲劳，有误操作风险。',
    options = {
      { id = 'walk', label = '安排轮休 (₽50K · 士气回升)' },
      { id = 'ignore', label = '继续运转 (有误停堆风险)' },
    },
    timeoutS = 6 * 3600,
  }, false)
end

local function dispatchEvent(E)
  if E.dispatch then return end
  startEvent(E, {
    id = 'grid_dispatch',
    title = '调度命令 · 调峰',
    desc = '电网要求 2 小时内降到 60% 功率。',
    options = {
      { id = 'obey', label = '响应调度 (补贴 ₽0.15M · 水平降到 60%)' },
      { id = 'refuse', label = '拒绝 (罚款 ₽0.3M)' },
    },
    timeoutS = 7200,
  }, false)
end

local function inspectionEvent(E)
  if E.inspection then return end
  E.inspection = { endTime = E.simTime + DAY_S, alarms = 0 }
  log(E, '监管检查：未来 24 小时内正常运行。此间触发报警将受处罚。')
  emit('event', {
    id = 'inspection',
    title = '监管检查 · ИНСПЕКЦИЯ',
    desc = '国家核安全监管机构已到站。24 小时内触发任何报警会被记录。',
    options = { { id = 'ok', label = '了解，召开检查' } },
    timeoutS = DAY_S,
  })
end

local function refuelEvent(E, forced)
  local cost = fmtMoney(math.floor(REFUEL_COST * E.refuelCostMul))
  startEvent(E, {
    id = 'refuel',
    title = '换料大修 · ПЕРЕГРУЗКА',
    desc = 'РБМК 燃耗 ' .. string.format('%.1f', E.burnup) .. ' MWd/kg'
      .. (forced and ' — 超过限值，必须换料！' or ' — 建议换料。'),
    options = {
      { id = 'do', label = '换料 (₽' .. cost .. ' · 停机 5 天 · 燃耗归零)' },
      { id = 'wait', label = forced and '延期 (罚款 ₽1M)' or '继续运行' },
    },
    timeoutS = 6 * 3600,
    data = { forced = forced },
  }, forced)
end

local function overhaulEvent(E, forced)
  local cost = fmtMoney(2000000 + 150000 * E.monthIdx)
  local opts = { { id = 'do', label = '立即大修 (₽' .. cost .. ' · 停机 14 天)' } }
  if not forced then
    opts[#opts + 1] = { id = 'delay', label = '延期 1 个月 (罚款 ₽0.8M)' }
  end
  startEvent(E, {
    id = 'overhaul',
    title = '机组大修 · КАПРЕМОНТ',
    desc = forced and '大修已逾期两次，必须执行！' or '机组已连续运行满一年，按规程需要大修。',
    options = opts,
    timeoutS = 6 * 3600,
    data = { forced = forced, cost = cost },
  }, forced)
end

local function rollEvent(E)
  local m = (START_MONTH_IDX + math.floor(E.simTime / MONTH_S)) % 12
  if E.burnup >= BURN_REMIND and not E.refuelArmed then
    E.refuelArmed = true
    refuelEvent(E, E.burnup >= BURN_FORCE)
    return
  end
  if E.overhaulDueAt and E.simTime >= E.overhaulDueAt and not E.overhaulArmed and E.outageS <= 0 then
    E.overhaulArmed = true
    overhaulEvent(E, E.overhaulDelayCount >= 2)
    return
  end
  if avgMorale(E) < 0.55 and math.random() < 0.18 then moraleEvent(E) return end

  local months = math.floor(E.simTime / MONTH_S)
  local aging = math.min(1, months / 24)
  local fatigue = Engine.S.timeScale >= 60 and 0.04 or 0
  local pool = {
    { w = 0.24 + aging * 0.10 + fatigue, fn = pumpEvent },
    { w = 0.11 + aging * 0.05, fn = steamEvent },
    { w = 0.09, fn = dieselEvent },
    { w = 0.08 + aging * 0.04, fn = fuelLeakEvent },
    { w = 0.08, fn = workerEvent },
    { w = 0.07, fn = stormEvent },
    { w = 0.07, fn = supplierEvent },
    { w = 0.08, fn = dispatchEvent },
    { w = 0.07 + aging * 0.03, fn = inspectionEvent },
    { w = 0.06, fn = nil },
  }
  local total = 0
  for _, p in ipairs(pool) do total = total + p.w end
  if m >= 4 and m <= 6 and math.random() < 0.1 then
    log(E, '热浪：电网需求上升，电价上行（约一周）。')
    E.modifiers[#E.modifiers + 1] = { endTime = E.simTime + 7 * DAY_S, priceAdd = 0.0025 }
    return
  end
  local r = math.random() * total
  for _, p in ipairs(pool) do
    r = r - p.w
    if r <= 0 then
      if p.fn then p.fn(E) else log(E, '仪表失真：周期表短暂偏差（影响约 2 小时）。') end
      return
    end
  end
  log(E, '仪表失真：周期表短暂偏差（影响约 2 小时）。')
end

-- ==================== 月度结算 ====================

local function unlockAch(E, id)
  if not E or E.achEmitted[id] then return end
  E.achEmitted[id] = true
  local def = nil
  for _, a in ipairs(ACH_DEFS) do if a.id == id then def = a end end
  if not def then return end
  local ids = KvStore.get(ACH_KEY) or {}
  local have = false
  for _, v in ipairs(ids) do if v == id then have = true end end
  if not have then
    ids[#ids + 1] = id
    KvStore.set(ACH_KEY, ids)
  end
  emit('achievement', { id = id, text = def.text })
end

local function monthChange(E)
  E.monthIdx = E.monthIdx + 1
  local aging = AGING_PER_MONTH * E.monthIdx
  local maint = MAINT_MONTH + aging
  local wages = wagesTotal(E)
  local profit = E.monthIncome - maint - wages - E.monthFines
  E.money = E.money + profit
  E.profitTotal = E.profitTotal + profit
  if profit < 0 then
    E.lossStreak = E.lossStreak + 1
    if E.lossStreak >= LOSS_LIMIT then
      E.bankrupt = true
      E.monthProfit = profit
      unlockAch(E, 'a_bankrupt')
      emit('settle', {
        month = E.monthIdx + 1,
        income = E.monthIncome,
        maint = maint,
        wages = wages,
        fines = E.monthFines,
        profit = profit,
        money = E.money,
        lossStreak = E.lossStreak,
        bankrupt = true,
        price = E.price,
        burnup = E.burnup,
        avgPower = E.powerTime > 0 and math.floor((E.powerSum / E.powerTime) * 100 + 0.5) or 0,
        monthEvents = E.monthEvents,
        overhaulDueDays = E.overhaulDueAt and math.max(0, math.ceil((E.overhaulDueAt - E.simTime) / DAY_S)) or -1,
      })
      E.finished = true
      emit('gameover', { reason = 'bankrupt' })
      return
    end
  else
    E.lossStreak = 0
  end
  E.monthHistory[#E.monthHistory + 1] = {
    month = E.monthIdx,
    income = math.floor(E.monthIncome + 0.5),
    profit = math.floor(profit + 0.5),
  }
  E.monthProfit = profit
  local income = E.monthIncome
  local fines = E.monthFines
  local avgP = E.powerTime > 0 and math.floor((E.powerSum / E.powerTime) * 100 + 0.5) or 0
  local lastMonthEvents = E.monthEvents
  E.monthIncome = 0
  E.monthFines = 0
  E.monthEvents = 0
  unlockAch(E, 'a_first_month')
  emit('settle', {
    month = E.monthIdx + 1,
    income = income,
    maint = maint,
    wages = wages,
    fines = fines,
    profit = profit,
    money = E.money,
    lossStreak = E.lossStreak,
    bankrupt = false,
    price = E.price,
    burnup = E.burnup,
    avgPower = avgP,
    monthEvents = lastMonthEvents,
    overhaulDueDays = E.overhaulDueAt and math.max(0, math.ceil((E.overhaulDueAt - E.simTime) / DAY_S)) or -1,
  })
end

local function checkGoals(E, S)
  for i, g in ipairs(E.goals) do
    if not g.done then
      local def = GOAL_DEFS[i]
      if def.test(E, S) then
        g.done = true
        E.money = E.money + g.reward
        E.monthIncome = E.monthIncome + g.reward
        log(E, '经营目标达成：「' .. g.text .. '」奖金 ₽' .. fmtMoney(g.reward) .. '。')
        emit('goal_done', { id = g.id, text = g.text })
      end
    end
  end
end

-- ==================== 事件处理 ====================

function Endless.choose(actionId)
  local E = current
  if not E or not E.event then return end
  local evt = E.event
  local opt = nil
  for _, o in ipairs(evt.options or {}) do
    if o.id == actionId then opt = o end
  end
  E.event = nil
  if not opt then return end
  local kind = evt.id:match('^([^_]+)_')
  if kind == 'pump' then
    local idx = evt.data.idx
    local comp = avgCompetence(E)
    if actionId == 'fast' then
      E.money = E.money - PUMP_FAST_COST
      E.monthFines = E.monthFines + PUMP_FAST_COST
      E.pendingPumps[#E.pendingPumps + 1] = { idx = idx, at = E.simTime + PUMP_FAST_S }
      log(E, '立即维修：泵 ' .. idx .. ' 将在 30 分钟后恢复。')
    else
      E.money = E.money - PUMP_SLOW_COST
      E.monthFines = E.monthFines + PUMP_SLOW_COST
      local dur = PUMP_SLOW_S * (1.8 - comp)
      E.pendingPumps[#E.pendingPumps + 1] = { idx = idx, at = E.simTime + dur }
      log(E, '维修班召集：泵 ' .. idx .. ' 将在约 ' .. math.floor(dur / 360) / 10 .. ' 小时后恢复。')
    end
    E.pumpRepairs = E.pumpRepairs + 1
    if E.pumpRepairs >= 5 then unlockAch(E, 'a_pumps_5') end
  elseif kind == 'grid' then
    if actionId == 'obey' then
      E.money = E.money + SUBSIDY_DISPATCH
      E.monthIncome = E.monthIncome + SUBSIDY_DISPATCH
      E.dispatch = { endTime = E.simTime + 7200, restoreTo = 100 }
      Engine.setTargetPower(60)
      log(E, '已响应调度：功率降至 60%，2 小时后恢复。补贴 ' .. fmtMoney(SUBSIDY_DISPATCH) .. ' ₽。')
    else
      E.money = E.money - FINE_REFUSE_DISPATCH
      E.monthFines = E.monthFines + FINE_REFUSE_DISPATCH
      log(E, '拒绝调度：罚款 ' .. fmtMoney(FINE_REFUSE_DISPATCH) .. ' ₽。')
    end
  elseif kind == 'inspection' then
    local passed = E.inspection and E.inspection.alarms == 0 or true
    if not passed then
      E.money = E.money - FINE_INSPECT
      E.monthFines = E.monthFines + FINE_INSPECT
      log(E, '检查发现报警记录：处罚 ' .. fmtMoney(FINE_INSPECT) .. ' ₽。')
    else
      log(E, '检查合格：无可外记备注。')
    end
    E.inspection = nil
  elseif kind == 'refuel' then
    local forced = evt.data.forced
    if actionId == 'do' then
      local cost = math.floor(REFUEL_COST * E.refuelCostMul)
      E.money = E.money - cost
      E.monthFines = E.monthFines + cost
      E.burnup = 0
      E.refuels = E.refuels + 1
      E.refuelCostMul = 1
      E.outage = { endTime = E.simTime + REFUEL_OUTAGE_S, reason = 'refuel' }
      E.outageS = REFUEL_OUTAGE_S
      E.refuelArmed = false
      log(E, '换料开始：停机 5 天，花费 ' .. fmtMoney(cost) .. ' ₽。')
      unlockAch(E, 'a_first_refuel')
    elseif forced then
      E.money = E.money - 1000000
      E.monthFines = E.monthFines + 1000000
      E.refuelArmed = false
      log(E, '延期换料：罚款 1,000,000 ₽。必须近期做换料。')
    else
      E.refuelArmed = false
      log(E, '决定继续运行。当燃耗达 40 MWd/kg 时将强制换料。')
    end
  elseif kind == 'overhaul' then
    local forced = evt.data.forced
    if actionId == 'do' then
      local cost = 2000000 + 150000 * E.monthIdx
      E.money = E.money - cost
      E.monthFines = E.monthFines + cost
      E.outage = { endTime = E.simTime + OVERHAUL_OUTAGE_S, reason = 'overhaul' }
      E.outageS = OVERHAUL_OUTAGE_S
      E.overhaulCount = E.overhaulCount + 1
      E.overhaulDelayCount = 0
      E.overhaulDueAt = E.simTime + 12 * MONTH_S
      E.overhaulArmed = false
      log(E, '大修开始：停机 14 天，花费 ' .. fmtMoney(cost) .. ' ₽。')
      unlockAch(E, 'a_first_overhaul')
    else
      E.money = E.money - 800000
      E.monthFines = E.monthFines + 800000
      E.overhaulDelayCount = E.overhaulDelayCount + 1
      E.overhaulDueAt = E.simTime + MONTH_S
      E.overhaulArmed = false
      log(E, '大修延期 1 个月：罚款 800,000 ₽（累计 ' .. E.overhaulDelayCount .. ' 次）。')
    end
  elseif kind == 'steam' then
    if actionId == 'fix' then
      local cost = math.floor(300000 + avgCompetence(E) * 100000)
      E.money = E.money - cost
      E.monthFines = E.monthFines + cost
      E.outage = { endTime = E.simTime + 2 * 3600, reason = 'repair' }
      E.outageS = 2 * 3600
      log(E, '抢修开始：停机 2 小时，花费 ' .. fmtMoney(cost) .. ' ₽。')
    else
      if math.random() < 0.3 then
        E.money = E.money - FINE_AZ
        E.monthFines = E.monthFines + FINE_AZ
        E.scramCount = E.scramCount + 1
        if not Engine.S.azFired then Engine.fireAZ('蒸汽管爆裂') end
        log(E, '蒸汽管爆裂！П5 触发停堆，罚款 ' .. fmtMoney(FINE_AZ) .. ' ₽。')
      else
        log(E, '阀门撑住了——暂时压得住。')
      end
    end
  elseif kind == 'diesel' then
    if actionId == 'test' then
      E.money = E.money - 40000
      E.monthFines = E.monthFines + 40000
      local pass = avgCompetence(E) >= rnd(0.3, 0.95)
      if pass then
        log(E, '柴油机试验通过。备用电源可用。')
      else
        E.alarmCount = E.alarmCount + 1
        E.noAlarmDays = 0
        E.money = E.money - FINE_ALARM
        E.monthFines = E.monthFines + FINE_ALARM
        log(E, '柴油机启动失败：记录报警一次，罚款 ' .. fmtMoney(FINE_ALARM) .. ' ₽。')
      end
    else
      E.money = E.money - 100000
      E.monthFines = E.monthFines + 100000
      log(E, '跳过柴油机试验：罚款 100,000 ₽。')
    end
  elseif kind == 'fuel' then
    if actionId == 'repair' then
      E.money = E.money - 200000
      E.monthFines = E.monthFines + 200000
      E.outage = { endTime = E.simTime + 2 * 3600, reason = 'repair' }
      E.outageS = 2 * 3600
      log(E, '停机检测：2 小时后恢复。未发现破损棒（或已隔离）。')
    else
      E.burnupBoostUntil = E.simTime + 10 * DAY_S
      if math.random() < 0.35 then
        E.money = E.money - 300000
        E.monthFines = E.monthFines + 300000
        log(E, '继续运行：活性持续上升，监管部门罚款 300,000 ₽。燃耗加速。')
      else
        log(E, '继续运行：未发现明显恶化。燃耗加速。')
      end
    end
  elseif kind == 'supplier' then
    if actionId == 'pay' then
      E.money = E.money - 100000
      E.monthFines = E.monthFines + 100000
      E.refuelCostMul = 1
      log(E, '已支付加班费：换料成本恢复正常。')
    else
      E.refuelCostMul = 1.2
      log(E, '接受涨价：下次换料成本 +20%。')
    end
  elseif kind == 'worker' then
    if actionId == 'treat' then
      E.money = E.money - 120000
      E.monthFines = E.monthFines + 120000
      for _, m in ipairs(E.crew) do m.morale = math.min(1, m.morale + 0.05) end
      log(E, '妥善处理：工人康复，班组士气回升。')
    else
      if math.random() < 0.4 then
        E.money = E.money - 200000
        E.monthFines = E.monthFines + 200000
        log(E, '低调处理被举报：罚款 200,000 ₽。')
      else
        log(E, '工人带伤离岗，事情压下来了。')
      end
    end
  elseif kind == 'storm' then
    if actionId == 'grid' then
      E.money = E.money - 250000
      E.monthFines = E.monthFines + 250000
      log(E, '已接入备用线路：电价不受影响。')
    else
      E.modifiers[#E.modifiers + 1] = { endTime = E.simTime + 2 * DAY_S, priceAdd = -0.002 }
      log(E, '接受电价波动：未来 2 天电价下降。')
    end
  elseif kind == 'morale' then
    if actionId == 'walk' then
      E.money = E.money - 50000
      E.monthFines = E.monthFines + 50000
      for _, m in ipairs(E.crew) do m.morale = math.min(1, m.morale + 0.06) end
      log(E, '安排轮休：士气回升。')
    else
      if math.random() < 0.3 then
        E.alarmCount = E.alarmCount + 1
        E.noAlarmDays = 0
        E.money = E.money - FINE_AZ
        E.monthFines = E.monthFines + FINE_AZ
        E.scramCount = E.scramCount + 1
        if not Engine.S.azFired then Engine.fireAZ('误操作：值班员按错') end
        log(E, '疲劳误操作：误触停堆，罚款 ' .. fmtMoney(FINE_AZ) .. ' ₽。')
      else
        log(E, '没有出事——但班组脸色很难看。')
      end
    end
  end
end

-- ==================== 主更新 ====================

function Endless.update(dtSim, S)
  local E = current
  if not E or E.finished or E.bankrupt then return end
  if dtSim <= 0 then return end
  local prevMonth = math.floor(E.simTime / MONTH_S)
  E.simTime = E.simTime + dtSim
  local month = math.floor(E.simTime / MONTH_S)
  E.daysRun = math.floor(E.simTime / DAY_S)
  E.noAlarmDays = E.noAlarmDays + dtSim / DAY_S
  priceUpdate(E, dtSim)

  if E.outageS > 0 then
    E.outageS = E.outageS - dtSim
    if E.outageS <= 0 then
      E.outageS = 0
      local reason = E.outage and E.outage.reason or 'refuel'
      E.outage = nil
      if reason == 'overhaul' then log(E, '大修完成：机组重新启动，设备状态恢复。')
      elseif reason == 'repair' then log(E, '检修完成：机组恢复正常运行。')
      else log(E, '换料完成：反应堆重新启动。燃耗已归零。') end
    end
  elseif not S.meltdown then
    local mw = S.n * 3200
    local h = dtSim / 3600
    local kwh = mw * h * 1000
    E.energyMWh = E.energyMWh + mw * h
    E.powerSum = E.powerSum + S.n * dtSim
    E.powerTime = E.powerTime + dtSim
    local rev = kwh * E.price
    E.money = E.money + rev
    E.monthIncome = E.monthIncome + rev
    local burnMul = E.simTime < E.burnupBoostUntil and 1.2 or 1
    E.burnup = E.burnup + S.n * (BURN_FULL_MONTH / MONTH_S) * dtSim * burnMul
    if E.burnup > BURN_FORCE + 5 then E.burnup = BURN_FORCE + 5 end
  end

  for i = #E.pendingPumps, 1, -1 do
    if E.simTime >= E.pendingPumps[i].at then
      local p = E.pendingPumps[i]
      if not S.pumps[p.idx] then
        S.pumps[p.idx] = true
        log(E, '泵 ' .. p.idx .. ' 维修完成，恢复运行。')
      end
      table.remove(E.pendingPumps, i)
    end
  end

  if E.dispatch and E.simTime >= E.dispatch.endTime then
    Engine.setTargetPower(E.dispatch.restoreTo)
    log(E, '调度结束：功率恢复至 ' .. E.dispatch.restoreTo .. '%。')
    E.dispatch = nil
  end
  if E.inspection and E.simTime >= E.inspection.endTime then
    local passed = E.inspection.alarms == 0
    E.inspection = nil
    if not passed then
      E.money = E.money - FINE_INSPECT
      E.monthFines = E.monthFines + FINE_INSPECT
      log(E, '检查结束：记录不良，处罚 ' .. fmtMoney(FINE_INSPECT) .. ' ₽。')
    else
      log(E, '检查结束：合格。')
    end
  end

  if E.event then
    E.eventTimeout = E.eventTimeout - dtSim
    if E.eventTimeout <= 0 then
      local id = E.event.id
      local fallback = 'slow'
      if id == 'grid_dispatch' then fallback = 'refuse'
      elseif id == 'refuel' then fallback = E.event.data.forced and 'do' or 'wait'
      elseif id == 'inspection' then fallback = 'ok'
      elseif id == 'overhaul' then fallback = E.event.data.forced and 'do' or 'delay'
      elseif id:find('^steam') then fallback = 'fix'
      elseif id:find('^diesel') then fallback = 'test'
      elseif id:find('^fuel_leak') then fallback = 'repair'
      elseif id:find('^supplier') then fallback = 'pay'
      elseif id:find('^worker') then fallback = 'treat'
      elseif id:find('^storm') then fallback = 'grid'
      elseif id:find('^morale') then fallback = 'walk' end
      Endless.choose(fallback)
      log(E, '事件超时，按默认方式处理。')
    end
  elseif E.simTime >= E.nextEventAt then
    local months = math.floor(E.simTime / MONTH_S)
    local aging = math.min(1, months / 24)
    local interval = (24 + math.random() * 40) * 3600 / (1 + aging * 0.6)
    E.nextEventAt = E.simTime + interval
    rollEvent(E)
  end

  if E.simTime - E.lastCrewTick > 4 * 3600 then
    E.lastCrewTick = E.simTime
    local fatigue = Engine.S.timeScale >= 60 and 0.012 or 0.01
    for _, m in ipairs(E.crew) do
      m.morale = math.max(0.3, m.morale - fatigue)
    end
  end

  checkGoals(E, S)
  if E.profitTotal >= 10000000 then unlockAch(E, 'a_profit_10m') end
  if E.monthIdx >= 11 and not S.meltdown then unlockAch(E, 'a_year_1') end

  if month > prevMonth then monthChange(E) end
end

-- ==================== HUD / 统计 ====================

function Endless.getHud()
  local E = current
  if not E then return nil end
  local d = getDate(E)
  return {
    month = d.month,
    day = d.day,
    shift = d.shift,
    dateStr = d.dateStr,
    money = math.floor(E.money + 0.5),
    price = E.price,
    burnup = E.burnup,
    speed = E.speed,
    outageS = E.outageS,
    lossStreak = E.lossStreak,
    crewMorale = math.floor(avgMorale(E) * 100 + 0.5),
  }
end

function Endless.alarmHook(on)
  local E = current
  if not E then return end
  if on then
    E.alarmCount = E.alarmCount + 1
    E.noAlarmDays = 0
    if E.inspection then E.inspection.alarms = E.inspection.alarms + 1 end
  end
end

function Endless.scramHook()
  local E = current
  if not E then return end
  E.scramCount = E.scramCount + 1
  if E.scramCount >= 10 then unlockAch(E, 'a_scram_10') end
end

function Endless.getStats(azPresses)
  local E = current
  if not E then return nil end
  local days = E.daysRun
  local gwh = E.energyMWh / 1000
  local scrams = azPresses ~= nil and azPresses or E.scramCount
  local avgPower = E.powerTime > 0 and (E.powerSum / E.powerTime) * 100 or 0

  local sGeneration = math.floor(gwh * 5 + 0.5)
  local sSurvival = math.floor(days * 10 + 0.5)
  local sSafety = math.max(0, math.floor(days * 2 - scrams * 50 - E.alarmCount * 15 + 0.5))
  local sProfit = math.floor(E.profitTotal / 1000 + 0.5)
  local sEfficiency = math.floor(avgPower * 8 + 0.5)
  local score = math.max(0, math.floor(sGeneration + sSurvival + sSafety + sProfit + sEfficiency + 0.5))
  local letter = score >= 8000 and 'S' or score >= 5000 and 'A' or score >= 3000 and 'B' or score >= 1500 and 'C' or 'D'
  return {
    days = days,
    months = math.floor(E.simTime / MONTH_S) + 1,
    gwh = gwh,
    energyMWh = E.energyMWh,
    avgPower = avgPower,
    scrams = scrams,
    alarms = E.alarmCount,
    refuels = E.refuels,
    overhauls = E.overhaulCount,
    profitTotal = E.profitTotal,
    burnup = E.burnup,
    crewComp = avgCompetence(E),
    money = math.floor(E.money + 0.5),
    score = score,
    letter = letter,
    breakdown = { generation = sGeneration, survival = sSurvival, safety = sSafety, profit = sProfit, efficiency = sEfficiency },
    bankrupt = E.bankrupt,
  }
end

function Endless.saveBest(score)
  local prev = KvStore.get(BEST_KEY) or 0
  if score > prev then KvStore.set(BEST_KEY, score) end
  return math.max(prev, score)
end

function Endless.loadBest()
  return KvStore.get(BEST_KEY) or 0
end

-- ==================== 存档 / 继续 ====================

function Endless.saveGame()
  local E = current
  if not E or E.finished or E.bankrupt then return false end
  local data = {
    v = 1,
    savedAt = os.time(),
    E = E,
    engine = Engine.exportState(),
  }
  data.E.listeners = nil
  data.E.event = nil
  data.E.eventTimeout = 0
  return KvStore.set(SAVE_KEY, data)
end

function Endless.hasSave()
  local d = KvStore.get(SAVE_KEY)
  return d ~= nil and d.E ~= nil
end

function Endless.loadSave()
  local data = KvStore.get(SAVE_KEY)
  if not data or not data.E then return nil end
  local base = create()
  for k, v in pairs(data.E) do base[k] = v end
  base.listeners = {}
  base.event = nil
  base.eventTimeout = 0
  return { E = base, engine = data.engine or nil }
end

function Endless.removeSave()
  KvStore.remove(SAVE_KEY)
end

function Endless.resumeGame()
  local data = Endless.loadSave()
  if not data then return nil end
  current = data.E
  if data.engine then Engine.importState(data.engine) end
  return data.E
end

function Endless.saveInfo()
  local data = KvStore.get(SAVE_KEY)
  if not data or not data.E then return nil end
  return {
    month = math.floor(data.E.simTime / MONTH_S) + 1,
    money = math.floor(data.E.money + 0.5),
    savedAt = data.savedAt or 0,
  }
end

-- ==================== 班组管理 ====================

function Endless.getCrew()
  local E = current
  if not E then return {} end
  local out = {}
  for i, m in ipairs(E.crew) do out[i] = m end
  return out
end

function Endless.crewHire()
  local E = current
  if not E or E.finished or E.bankrupt then return false end
  if #E.crew >= 12 then log(E, '班组满员（12 人）。') return false end
  if E.money < HIRE_COST then
    log(E, '资金不足：招聘需要 ₽' .. fmtMoney(HIRE_COST) .. '。')
    return false
  end
  E.money = E.money - HIRE_COST
  E.monthFines = E.monthFines + HIRE_COST
  local m = genMember(math.random(#CREW_NAMES))
  m.id = 'c' .. tostring(os.time())
  E.crew[#E.crew + 1] = m
  log(E, '招聘完成：' .. m.name .. '（' .. m.role .. '）入职，花费 ₽' .. fmtMoney(HIRE_COST) .. '。')
  return true
end

function Endless.crewFire(id)
  local E = current
  if not E or E.finished or E.bankrupt then return false end
  if #E.crew <= 6 then log(E, '班组最少 6 人，不能继续解雇。') return false end
  local idx = -1
  for i, m in ipairs(E.crew) do if m.id == id then idx = i end end
  if idx < 0 then return false end
  local m = table.remove(E.crew, idx)
  E.money = E.money - FIRE_COST
  E.monthFines = E.monthFines + FIRE_COST
  log(E, '解雇 ' .. m.name .. '：支付补偿 ₽' .. fmtMoney(FIRE_COST) .. '。')
  return true
end

function Endless.crewBonus(id)
  local E = current
  if not E or E.finished or E.bankrupt then return false end
  local m = nil
  for _, c in ipairs(E.crew) do if c.id == id then m = c end end
  if not m then return false end
  if E.money < BONUS_COST then
    log(E, '资金不足：奖金需要 ₽' .. fmtMoney(BONUS_COST) .. '。')
    return false
  end
  E.money = E.money - BONUS_COST
  E.monthFines = E.monthFines + BONUS_COST
  m.morale = math.min(1, m.morale + 0.15)
  log(E, m.name .. ' 获得奖金，士气 +0.15。')
  return true
end

function Endless.getGoals()
  local E = current
  if not E then return {} end
  local out = {}
  for i, g in ipairs(E.goals) do out[i] = g end
  return out
end

function Endless.getAchList()
  local ids = KvStore.get(ACH_KEY) or {}
  local out = {}
  for _, a in ipairs(ACH_DEFS) do
    local unlocked = false
    for _, v in ipairs(ids) do if v == a.id then unlocked = true end end
    out[#out + 1] = { id = a.id, text = a.text, unlocked = unlocked }
  end
  return out
end

function Endless.unlockAch(E, id) unlockAch(E, id) end

function Endless.getOverview()
  local E = current
  if not E then return nil end
  return {
    overhaulDue = E.overhaulDueAt and math.max(0, math.ceil((E.overhaulDueAt - E.simTime) / DAY_S)) or -1,
    overhaulDelayCount = E.overhaulDelayCount,
    overhaulCount = E.overhaulCount,
    refuelCostMul = E.refuelCostMul,
    avgComp = avgCompetence(E),
    avgMorale = avgMorale(E),
  }
end

function Endless.createGame()
  current = create()
  return current
end

function Endless.reset()
  current = nil
end

function Endless.current() return current end

function Endless._seek(simS)
  local E = current
  if not E then return false end
  E.simTime = simS
  E.nextEventAt = simS + 60
  return true
end

Endless.MONTH_S = MONTH_S
Endless.DAY_S = DAY_S
Endless.SHIFT_S = SHIFT_S
Endless.REFUEL_COST = REFUEL_COST
Endless.CREW_NAMES = CREW_NAMES
Endless.CREW_ROLES = CREW_ROLES

return Endless
