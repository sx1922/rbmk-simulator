-- challenge.lua — ВЫЗОВ · 挑战模式 (15 分钟限时排障)
-- 目标：在突发故障中保持功率稳定；得分按「存活时间 × 精度 × 处置」计

local Engine = require('src.engine')
local KvStore = require('src.kvstore')

local Challenge = {}

local DURATION_S = 900          -- 15 分钟（现实时间）
local BEST_KEY = 'rbmk_challenge_best'

local C = nil
local listeners = nil
local hudTimer = 0

local function log(etype, msg)
  local ok, App = pcall(require, 'src.app')
  if ok and App.logEvent then App.logEvent(etype, msg) end
end

local function emit(name, payload)
  if not listeners[name] then return end
  for _, fn in ipairs(listeners[name]) do fn(payload or {}) end
end

function Challenge.on(name, fn)
  listeners[name] = listeners[name] or {}
  table.insert(listeners[name], fn)
end

local function create()
  return {
    timeLeft = DURATION_S,
    score = 0,
    eventsTotal = 0,
    eventsOk = 0,
    scrams = 0,
    alarms = 0,
    melted = false,
    nextEventAt = 12 + math.random() * 20,
    event = nil,
    eventTimeout = 0,
    repairing = false,
    repairUntil = 0,
    _scramLogged = false,
    targetNow = 62,
    targetUntil = 0,
    finished = false,
  }
end

-- ==================== 事件 ====================

local function spawnEvent()
  local pool = { 'pump_trip', 'steam_leak', 'dispatch', 'period_warn', 'orm_drain', 'phone' }
  local kind = pool[math.random(#pool)]
  C.eventsTotal = C.eventsTotal + 1
  if kind == 'pump_trip' then
    local onPumps = {}
    for i = 1, 8 do if Engine.S.pumps[i] then onPumps[#onPumps + 1] = i end end
    local idx = #onPumps > 0 and onPumps[math.random(#onPumps)] or 1
    Engine.S.pumps[idx] = false
    log('warn', 'ГЦН-' .. idx .. ' 跳闸：主循环泵 ' .. idx .. ' 停转。请恢复或降低功率。')
    C.event = { kind = 'pump_trip', idx = idx, timeout = 40 }
    C.eventTimeout = 40
  elseif kind == 'steam_leak' then
    C.event = { kind = 'steam_leak', timeout = 30 }
    C.eventTimeout = 30
    local ok, Hud = pcall(require, 'src.ui.hud')
    if ok and Hud.showEndlessEvent then
      Hud.showEndlessEvent({
        id = 'steam_leak',
        title = '蒸汽阀泄漏 · ПАРОПРОВОД',
        desc = '主蒸汽管道阀门泄漏，压力波动。立即抢修（停机 2 分钟）或维持运行（有爆管风险）。',
        options = {
          { id = 'fix', label = '立即抢修 (停机 2 分钟 · +150 分)' },
          { id = 'hold', label = '维持运行 (风险 30%)' },
        },
      }, Challenge.choose)
    end
  elseif kind == 'dispatch' then
    local want = ({ 30, 40, 50, 70, 80 })[math.random(5)]
    C.targetNow = want
    C.targetUntil = C.timeLeft + 45
    C.event = { kind = 'dispatch', want = want, timeout = 45 }
    C.eventTimeout = 45
    log('warn', '调度指令：将功率调整至 ' .. want .. ' %（45 秒内响应）。')
  elseif kind == 'period_warn' then
    C.event = { kind = 'period_warn', timeout = 30 }
    C.eventTimeout = 30
    log('warn', 'П2 周期报警预触发：功率波动加剧。30 秒内压低功率或稳定功率。')
  elseif kind == 'orm_drain' then
    C.event = { kind = 'orm_drain', timeout = 25 }
    C.eventTimeout = 25
    log('warn', '反应性异常：ОЗР 持续下降。25 秒内提棒恢复裕度。')
  else
    C.event = { kind = 'phone', timeout = 12 }
    C.eventTimeout = 12
    log('info', '调度来电：要求报告功率。值班日志已自动记录。')
  end
end

function Challenge.choose(actionId)
  if not C or not C.event then return end
  local evt = C.event
  C.event = nil
  C.eventsOk = C.eventsOk + 1
  if evt.kind == 'steam_leak' then
    if actionId == 'fix' then
      C.repairUntil = math.max(0, C.timeLeft - 60)
      C.repairing = true
      Engine.setTargetPower(3)
      C.score = C.score + 150
      log('info', '抢修开始：功率降至 3%，2 分钟后恢复。+150 分')
    else
      if math.random() < 0.3 then
        C.alarms = C.alarms + 1
        if not Engine.S.azFired then Engine.fireAZ('蒸汽管爆裂') end
        C.scrams = C.scrams + 1
        C.score = C.score - 500
        log('warn', '蒸汽管爆裂！АЗ-5 触发：-500 分。')
      else
        log('info', '阀门撑住了——暂时压得住。')
      end
    end
  elseif evt.kind == 'dispatch' then
    if actionId == 'obey' then
      Engine.setTargetPower(evt.want)
      C.targetNow = 0
      C.score = C.score + 200
      log('info', '已响应调度：目标功率 ' .. evt.want .. ' %。+200 分')
    else
      C.score = C.score - 300
      log('warn', '拒绝调度：-300 分。')
    end
  end
  local ok, Hud = pcall(require, 'src.ui.hud')
  if ok and Hud.closeEndlessPanel then Hud.closeEndlessPanel() end
end

local function tickEvent(dt)
  if not C.event then return end
  C.eventTimeout = C.eventTimeout - dt
  if C.eventTimeout <= 0 then
    local evt = C.event
    C.event = nil
    C.eventsOk = C.eventsOk + 1
    if evt.kind == 'steam_leak' then
      log('warn', '泄漏无人处理：按默认抢修（停机 2 分钟）。')
      C.repairing = true
      C.repairUntil = math.max(0, C.timeLeft - 60)
      Engine.setTargetPower(3)
      local ok, Hud = pcall(require, 'src.ui.hud')
      if ok and Hud.closeEndlessPanel then Hud.closeEndlessPanel() end
    elseif evt.kind == 'dispatch' then
      Engine.setTargetPower(evt.want)
      C.targetNow = 0
      log('info', '调度超时：已自动调整至 ' .. evt.want .. ' %。')
    elseif evt.kind == 'period_warn' or evt.kind == 'orm_drain' then
      C.alarms = C.alarms + 1
      C.score = C.score - 100
      log('warn', '未及时处置：记录报警一次，-100 分。')
    end
  end
end

-- ==================== 主更新 ====================

function Challenge.update(dt, S)
  if not C or C.finished or S.meltdown then return end
  C.timeLeft = C.timeLeft - dt
  if C.repairing then
    if C.timeLeft <= C.repairUntil then
      C.repairing = false
      if S.targetPower < 30 then Engine.setTargetPower(62) end
      log('info', '检修完成：功率恢复中。')
    end
  end
  local targetPct = S.targetPower
  local err = math.abs(S.n * 100 - targetPct)
  if err < 5 then
    C.score = C.score + 1.5 * dt
  elseif err < 12 then
    C.score = C.score + 0.4 * dt
  end
  if S.azFired and not C._scramLogged then
    C._scramLogged = true
    C.scrams = C.scrams + 1
    C.score = C.score - 500
    log('warn', 'АЗ-5 触发：-500 分。')
  end
  if C.timeLeft <= 0 then
    C.finished = true
    emit('complete')
    return
  end
  C.nextEventAt = C.nextEventAt - dt
  if not C.event and C.nextEventAt <= 0 then
    C.nextEventAt = 35 + math.random() * 35
    spawnEvent()
  end
  tickEvent(dt)
end

-- ==================== 统计 ====================

function Challenge.getStats()
  if not C then return nil end
  local score = math.max(0, math.floor(C.score + 0.5))
  return {
    survived = math.max(0, math.floor(DURATION_S - C.timeLeft + 0.5)),
    events = C.eventsTotal,
    eventsOk = C.eventsOk,
    scrams = C.scrams,
    alarms = C.alarms,
    score = score,
    best = 0,
  }
end

function Challenge.saveBest(score)
  local prev = KvStore.get(BEST_KEY) or 0
  if score > prev then KvStore.set(BEST_KEY, score) end
  return math.max(prev, score)
end

function Challenge.loadBest()
  return KvStore.get(BEST_KEY) or 0
end

function Challenge.init()
  C = create()
  listeners = {}
  Engine.initFullPower()
  Engine.S.timeScale = 10
end

function Challenge.reset()
  C = nil
  listeners = {}
end

function Challenge.current() return C end

Challenge.DURATION_S = DURATION_S

return Challenge
