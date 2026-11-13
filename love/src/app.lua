-- app.lua — 生命周期状态机 · web/js/app.js 移植
-- 状态：MENU | PLAYING | ENDING | DEBRIEF（FLOW-01 §2）
-- 终局触发源：MELTDOWN / SCENARIO_END / VOLUNTARY / CHALLENGE_END / BANKRUPT（§3）

local Layout = require('src.ui.layout')
local Theme = require('src.ui.theme')
local W = require('src.ui.widgets')
local Engine = require('src.engine')
local Instrument = require('src.instrument')
local Journal = require('src.journal')
local Scoring = require('src.scoring')
local Props = require('src.props')

local Hud = require('src.ui.hud')
local Menu = require('src.menu')
local Pause = require('src.pause')
local Debrief = require('src.debrief')

local App = {}

App.state = 'MENU'
App.mode = 'free'
App.paused = false
App.endLock = false
App.shiftStart = 0          -- os.clock() 秒（现实时长）
App.stats = nil
App.scenario = nil
App.endless = nil
App.challenge = nil
App.time = 0                -- 全局动画时钟（秒）

-- 过渡演出
App.endingFx = nil          -- { t, dur, hard }
App.ignitionFx = nil        -- { t, dur }
App.meltdownFxActive = false

-- 日志
App.logEntries = {}

-- 浮层队列（电话 / 对话）
App.floatQueue = {}
App.floatShowing = nil      -- { kind, data, timer, dur }
App.endlessPanelLock = false

local lastRodTarget = 0
local endlessRamped = false
local endlessStableT = 0
local endlessSaveAcc = 0

local onQuit = nil          -- 由 main 注入（退出确认回调给 menu）

function App.setOnQuit(fn) onQuit = fn end

-- ==================== 日志 ====================

local function pad2(n)
  n = math.floor(n)
  if n < 10 then return '0' .. n end
  return tostring(n)
end

function App.logEvent(etype, msg)
  local t = Engine.S.t
  local line = '[' .. pad2((t / 3600) % 24) .. ':' .. pad2((t / 60) % 60) .. ':' .. pad2(t % 60) .. '] ' .. msg
  App.logEntries[#App.logEntries + 1] = { typ = etype, line = line, t = t }
  if #App.logEntries > 500 then table.remove(App.logEntries, 1) end
end

-- ==================== 浮层（电话 / 对话） ====================

function App.showFloat(kind, data, autoHideMs)
  if Journal.getSetting(Journal.loadJournal(), 'subtitles') == false then return end
  App.floatQueue[#App.floatQueue + 1] = {
    kind = kind, data = data,
    dur = autoHideMs or (kind == 'phone' and 5.5 or 8.0),
  }
  if not App.floatShowing then App.drainFloat() end
end

function App.hideFloat()
  App.floatShowing = nil
  App.drainFloat()
end

function App.drainFloat()
  local item = table.remove(App.floatQueue, 1)
  if not item then return end
  item.timer = 0
  App.floatShowing = item
end

local function updateFloat(dt)
  local f = App.floatShowing
  if not f then return end
  f.timer = f.timer + dt
  if f.timer >= f.dur then
    App.floatShowing = nil
    App.drainFloat()
  end
end

-- ==================== 运行统计（DEBRIEF-01 §3.1） ====================

function App.newStats()
  return Scoring.newStats()
end

local function collectStats(dtGame)
  local S = Engine.S
  local stats = App.stats
  if S.n > 1.1 then stats.overPowerTime = stats.overPowerTime + dtGame end
  if S.opr < 15 and S.n > 0.05 then stats.lowOprTime = stats.lowOprTime + dtGame end
  if S.rodTarget > lastRodTarget + 1.5 then
    stats.rodMoves = stats.rodMoves + 1
    stats.opCount = stats.opCount + 1
    if App.scenario then App.scenario:onPlayerAction('rod_withdrawn') end
  elseif S.rodTarget < lastRodTarget - 1.5 then
    stats.rodMoves = stats.rodMoves + 1
    stats.opCount = stats.opCount + 1
  end
  lastRodTarget = S.rodTarget
end

function App.countOp()
  if App.stats then App.stats.opCount = App.stats.opCount + 1 end
end

-- ==================== 场景引擎接入（SCEN-01 §2） ====================

function App.simState()
  local S = Engine.S
  return {
    power = S.n * Engine.N_NOM,
    n = S.n,
    azFired = S.azFired,
    orm = S.opr,
    xenon = S.xe,
    voidFraction = S.voidFrac,
    rodPositions = S.rodPos,
    fuelTemp = S.fuelTemp,
    meltdown = S.meltdown,
    t = S.t,
  }
end

function App.initScenario()
  local ok, Scenario = pcall(require, 'src.scenario')
  if not ok or not Scenario.create then
    App.logEvent('warn', '场景模块尚未实装 — ХРОНИКА 不可用')
    return
  end
  local sc = Scenario.create('chronicle_04')
  if not sc then return end
  App.scenario = sc
  lastRodTarget = Engine.S.rodTarget

  sc:on('log', function(text) App.logEvent('info', text) end)
  sc:on('phone', function(a)
    App.showFloat('phone', a, (a.duration or 4000) / 1000 + 1)
  end)
  sc:on('dialogue', function(a) App.showFloat('dialogue', a) end)
  sc:on('sound', function(a)
    local okA, Audio = pcall(require, 'src.audio.synth')
    if okA and Audio.alarmTone then
      if a.id == 'alarm_low' then Audio.alarmTone(600, 0.6, 0.4) end
      if a.id == 'alarm_high' then Audio.alarmTone(1200, 0.8, 0.6) end
    end
  end)
  sc:on('pressure', function(a)
    App.logEvent('warn', '压力层级 ' .. tostring(a.level) .. ' — ' .. (a.behavior or ''))
  end)
  sc:on('mode', function(a) Engine.setMode(a.value) end)
  sc:on('target', function(a) Engine.setTargetPower(a.value) end)
  sc:on('timescale', function(a) Engine.setTimeScale(a.value) end)
  sc:on('pumps', function(a)
    for i = 1, 8 do Engine.S.pumps[i] = i <= a.value end
  end)
  sc:on('timeskip', function(a)
    if a.delta and a.delta > 0 then Engine.advanceSim(a.delta / 1000) end
  end)
  sc:on('az', function(a) Engine.fireAZ(a.reason or 'АЗ-5 强制停堆') end)
  sc:on('az_reset', function() Engine.clearScram() end)
  sc:on('act', function(v) Hud.storyAct(v) end)
  sc:on('objective', function(a) Hud.storyObjective(a.text or '') end)
  sc:on('endgame', function(a)
    sc:finish(a.endType, a.epilogue)
    App.endGame('SCENARIO_END', { endType = a.endType, epilogue = a.epilogue })
  end)
  Hud.storyAct(sc.flags.act or 1)
end

-- ==================== 无尽模式接入 ====================

function App.initEndless(resume)
  local ok, Endless = pcall(require, 'src.endless')
  if not ok then
    App.logEvent('warn', '无尽模式模块尚未实装')
    return
  end
  if resume and Endless.resumeGame then
    App.endless = Endless.resumeGame()
    if not App.endless then App.endless = Endless.createGame() end
    endlessRamped = true
  else
    if Endless.removeSave then Endless.removeSave() end
    App.endless = Endless.createGame()
    Engine.initFullPower()
    Engine.S.timeScale = 10
  end
  endlessRamped = resume and true or endlessRamped
  Engine.S.onAlarm = function(key, on)
    if on and Endless.alarmHook then Endless.alarmHook(true) end
  end
  Endless:on('settle', function(d) Hud.showEndlessSettle(d) end)
  Endless:on('event', function(evt) Hud.showEndlessEvent(evt) end)
  Endless:on('log', function(t) App.logEvent('info', t) end)
  Endless:on('gameover', function() App.endGame('BANKRUPT', {}) end)
  Endless:on('speed', function(ts) Engine.S.timeScale = ts.value end)
  Endless:on('achievement', function(a) App.logEvent('info', '成就解锁：' .. a.text .. '。') end)
end

-- ==================== 挑战模式接入 ====================

function App.initChallenge()
  local ok, Challenge = pcall(require, 'src.challenge')
  if not ok then
    App.logEvent('warn', '挑战模式模块尚未实装')
    return
  end
  App.challenge = Challenge
  Challenge.init()
  Challenge:on('complete', function() App.endGame('SAFE_SHUTDOWN', {}) end)
end

-- ==================== 终局（FLOW-01 §3/§5/§7.1） ====================

local EPILOGUES = {
  epilogue_quiet = '你调制过被批评。你被记过。\n尝试推迟了24小时。\n\n1986年8月，试验在三号机组完成。成功。\n\n你活了下来。\n\n但你知道一件事：\n那个设计缺陷还在。\n它不会因为你的停堆而消失。\n下一次，不一定有人按那个按钮。',
  epilogue_hidden = '1986年4月26日。没有爆炸。\n\n1986年5月。你被开除。\n\n1987年。设计缺陷被内部报告指出。报告被归档。\n\n1991年。苏联解体。报告遗失。\n\n2000年。切尔诺贝利核电站完全关闭。\n\n没有人记得你。\n但 4号机组还在。',
  epilogue_blast = '1986年4月26日 01:23:47。\n\n列昂尼德·托普图诺夫于1986年5月14日死于急性放射病。他25岁。\n亚历山大·阿基莫夫于1986年5月11日死于急性放射病。他33岁。\n\n阿纳托利·Дятлов 存活。1995年死于心脏衰竭。\n他至死认为事故是操作员的责任。',
  epilogue_scram_saved = '你按下了 АЗ-5。功率降了下来。没有爆炸。\n\nДятлов 看了你一眼。没说话。\n试验推迟。反应堆安全。\n\n你在日志里写："低功率插入控制棒会先引入正反应性——这只是推测。"\n没有人读那行字。',
}

local function storyEpilogue(endType)
  if endType == 'SAFE_SHUTDOWN' then
    return '你拒绝了继续。\n功率平稳下降。\nДятлов 没再说话。\n\n没有人感谢你。\n也没有人记住你。\n—— 这就是最好的结局。'
  end
  return '01:23:45，你按下了 АЗ-5。\n和 Топтунов 一样。\n和规程一样。\n\n功率没有降下来。\n它开始上升。'
end

local function elapsedSec()
  return os.clock() - App.shiftStart
end

function App.playIgnition(done)
  App.ignitionFx = { t = 0, dur = 2.6, done = done }
end

local function playEnding(endType, done)
  local hard = endType == 'MELTDOWN' or endType == 'EXPLOSION'
  App.endingFx = { t = 0, dur = hard and 3.0 or 2.0, hard = hard, done = done }
end

function App.endGame(etype, payload)
  if App.endLock then return end
  App.endLock = true
  App.state = 'ENDING'
  if not App.stats then App.stats = App.newStats() end
  App.paused = false
  Pause.hide()

  local endType = etype == 'SCENARIO_END' and (payload.endType or 'SAFE_SHUTDOWN') or etype
  local flags = App.scenario and App.scenario.flags or {}
  local epilogue = payload.epilogue and (EPILOGUES[payload.epilogue] or payload.epilogue)
    or storyEpilogue(endType)

  local endlessStats = nil
  if App.mode == 'endless' and App.endless then
    local okE, Endless = pcall(require, 'src.endless')
    if okE and Endless.getStats then
      endlessStats = Endless.getStats(App.stats.azPresses)
      if endlessStats then
        endlessStats.best = Endless.saveBest(endlessStats.score)
        if endlessStats.score >= 5000 and Endless.unlockAch then
          Endless.unlockAch(App.endless, 'a_best_5000')
        end
        if endType == 'MELTDOWN' and Endless.unlockAch then
          Endless.unlockAch(App.endless, 'a_meltdown')
        end
      end
      if Endless.removeSave then Endless.removeSave() end
    end
  end

  local challengeStats = nil
  if App.mode == 'challenge' and App.challenge and App.challenge.getStats then
    challengeStats = App.challenge.getStats()
    if challengeStats and App.challenge.saveBest then
      challengeStats.best = App.challenge.saveBest(challengeStats.score)
    end
  end

  playEnding(endType, function()
    local report = Scoring.evaluate(App.stats, App.mode, endType)
    local decisions = App.scenario and App.scenario.decisions or {}
    local matchScore = nil
    if App.mode == 'story' then matchScore = Scoring.matchScore(decisions, flags) end

    local journal = Journal.loadJournal()
    local scenarioLabel = App.mode == 'story' and 'chronicle_04'
      or (App.mode == 'free' and 'free_play' or App.mode)
    Journal.recordShiftEnd(journal, scenarioLabel, {
      dimensions = report.dimensions,
      outcome = report.outcome,
    }, math.floor(elapsedSec() * 1000))

    App.state = 'DEBRIEF'
    Debrief.show({
      mode = App.mode,
      endType = endType,
      endlessStats = endlessStats,
      challengeStats = challengeStats,
      duration = math.floor(elapsedSec() * 1000),
      finalState = Engine.S,
      opCount = App.stats.opCount,
      report = report,
      decisions = decisions,
      matchScore = matchScore,
      epilogue = epilogue,
      onReturn = App.backToMenu,
    })
  end)
end

function App.backToMenu()
  App.endLock = false
  App.scenario = nil
  App.endless = nil
  App.challenge = nil
  endlessSaveAcc = 0
  endlessRamped = false
  endlessStableT = 0
  local okE, Endless = pcall(require, 'src.endless')
  if okE and Endless.reset then Endless.reset() end
  local okC, Challenge = pcall(require, 'src.challenge')
  if okC and Challenge.reset then Challenge.reset() end
  local okT, Tutorial = pcall(require, 'src.tutorial')
  if okT and Tutorial.stop then Tutorial.stop() end
  Hud.clearStoryHud()
  Hud.hideEndlessHud()
  Hud.closeEndlessPanel()
  Props.closeProp()
  App.endlessPanelLock = false
  App.state = 'MENU'
  Menu.show(function(m) App.startGame(m) end)
end

-- ==================== 开始值班（SCEN-01 §6） ====================

function App.startGame(m)
  App.mode = m or 'free'
  local resumeEndless = false
  if App.mode == 'endless_resume' then
    App.mode = 'endless'
    resumeEndless = true
  end
  App.endLock = false
  App.paused = false
  App.stats = App.newStats()
  lastRodTarget = 55
  App.shiftStart = os.clock()
  endlessRamped = false
  endlessStableT = 0
  endlessSaveAcc = 0
  App.logEntries = {}
  App.floatQueue = {}
  App.floatShowing = nil
  App.meltdownFxActive = false
  App.endingFx = nil

  Engine.reset()
  if App.mode == 'story' then Engine.initFullPower() end

  local okA, Audio = pcall(require, 'src.audio.synth')
  if okA then
    if Audio.startHum then Audio.startHum() end
    if Audio.setHumVolume then Audio.setHumVolume(0.008) end
  end

  Hud.reset()
  Props.resetTea()
  App.hideFloat()

  if App.mode == 'story' then
    App.initScenario()
    if App.scenario then
      Engine.S.onEvent = function(etype, msg)
        if etype == 'alarm' then App.stats.alarmCount = App.stats.alarmCount + 1 end
        App.logEvent(etype, msg)
      end
      Engine.S.onAlarm = function() end
    end
  elseif App.mode == 'endless' then
    App.initEndless(resumeEndless)
    Engine.S.onEvent = function(etype, msg)
      if etype == 'alarm' then App.stats.alarmCount = App.stats.alarmCount + 1 end
      App.logEvent(etype, msg)
    end
  elseif App.mode == 'challenge' then
    App.initChallenge()
    Engine.S.onEvent = function(etype, msg)
      if etype == 'alarm' then App.stats.alarmCount = App.stats.alarmCount + 1 end
      App.logEvent(etype, msg)
    end
  else
    -- 自由操作
    Engine.S.onEvent = function(etype, msg)
      if etype == 'alarm' then App.stats.alarmCount = App.stats.alarmCount + 1 end
      App.logEvent(etype, msg)
    end
    Engine.S.onAlarm = function() end
  end

  if App.mode == 'story' then Hud.initStoryHud()
  elseif App.mode == 'endless' then Hud.showEndlessHud()
  else Hud.clearStoryHud() end

  App.logEvent('info', 'СМЕНА НАЧАТА · 班次开始 | РБМК-1000 БЛОК №4')
  App.logEvent('info', '初始状态: N = ' .. math.floor(Engine.S.n * Engine.N_NOM + 0.5)
    .. ' МВт, ОЗР = ' .. Engine.S.opr .. ' ст.')
  if App.mode == 'story' then
    App.logEvent('info', 'ХРОНИКА: 1986.04.25 08:00 白班。')
  elseif App.mode == 'endless' then
    App.logEvent('info', 'БЕСКОНЕЧНОСТЬ: 1986.05.01 00:00 · 无尽运营开始。')
  end

  App.state = 'PLAYING'
  App.playIgnition(function()
    if App.mode == 'story' then
      local okT, Tutorial = pcall(require, 'src.tutorial')
      if okT and Tutorial.start then
        Tutorial.start({
          getState = function() return Engine.S end,
          propOpen = function() return Props.isOpen() end,
        })
      end
    end
  end)
end

-- ==================== 暂停（FLOW-01 §8-9） ====================

function App.openPause()
  if App.state ~= 'PLAYING' then return end
  if Debrief.isOpen() or Pause.isOpen() or App.endlessPanelLock then return end
  App.paused = true
  local S = Engine.S
  Pause.show({
    items = {
      { id = 'resume', ru = 'ПРОДОЛЖИТЬ', cn = '继续值班' },
      { id = 'settings', ru = 'НАСТРОЙКИ', cn = '整定设置' },
      { id = 'end', ru = 'КОНЕЦ СМЕНЫ', cn = '结束值班' },
    },
    onResume = function() App.paused = false; Pause.hide() end,
    onSettings = function()
      Pause.hide()
      Menu.openSettings(function() App.openPause() end)
    end,
    onEndShift = function()
      Pause.hide()
      App.endGame('VOLUNTARY', {})
    end,
    stats = function()
      return '运行时长: ' .. pad2((S.t / 3600) % 24) .. ':' .. pad2((S.t / 60) % 60) .. ':' .. pad2(S.t % 60)
        .. '  当前功率: ' .. math.floor(S.n * Engine.N_NOM + 0.5) .. ' MW'
        .. '  状态: ' .. (S.meltdown and '熔毁' or (S.azFired and '停堆' or '正常'))
    end,
  })
end

function App.openEndConfirm()
  if App.state ~= 'PLAYING' then return end
  if Debrief.isOpen() or Pause.isOpen() or App.endlessPanelLock then return end
  App.paused = true
  local S = Engine.S
  Pause.show({
    confirmOnly = true,
    onEndShift = function()
      Pause.hide()
      App.endGame('VOLUNTARY', {})
    end,
    onResume = function() App.paused = false; Pause.hide() end,
    stats = function()
      return '运行时长: ' .. pad2((S.t / 3600) % 24) .. ':' .. pad2((S.t / 60) % 60) .. ':' .. pad2(S.t % 60)
        .. '  当前功率: ' .. math.floor(S.n * Engine.N_NOM + 0.5) .. ' MW'
    end,
  })
end

-- ==================== 主循环 ====================

function App.update(dt)
  App.time = App.time + dt

  -- 演出时间轴
  if App.ignitionFx then
    App.ignitionFx.t = App.ignitionFx.t + dt
    if App.ignitionFx.t >= App.ignitionFx.dur then
      local done = App.ignitionFx.done
      App.ignitionFx = nil
      if done then done() end
    end
  end
  if App.endingFx then
    App.endingFx.t = App.endingFx.t + dt
    if App.endingFx.t >= App.endingFx.dur then
      local done = App.endingFx.done
      App.endingFx = nil
      if done then done() end
    end
    return  -- 过渡期间不接受模拟推进（FLOW-01 §5）
  end

  Instrument.updateTimer(dt)
  updateFloat(dt)

  do
    local okA, Audio = pcall(require, 'src.audio.synth')
    if okA and Audio.update then Audio.update(dt) end
  end

  -- 教程推进
  if App.state == 'PLAYING' and not App.paused then
    local okT, Tutorial = pcall(require, 'src.tutorial')
    if okT and Tutorial.isActive() then Tutorial.update(dt) end
  end

  if App.state == 'PLAYING' and not App.paused then
    local S = Engine.S
    Engine.step(dt)
    local dtGame = dt * S.timeScale
    if App.scenario then
      App.scenario:update(dtGame * 1000, App.simState())
      App.scenario:applyOverrides(dtGame * 1000, S)
    end
    if App.endless then
      local okE, Endless = pcall(require, 'src.endless')
      if okE then
        Endless.update(dtGame, S)
        endlessSaveAcc = endlessSaveAcc + dt
        if endlessSaveAcc > 30 then
          endlessSaveAcc = 0
          if Endless.saveGame then Endless.saveGame() end
        end
        if not endlessRamped and S.timeScale <= 10 then
          if not S.meltdown and not S.azFired and math.abs(S.n * 100 - S.targetPower) < 5 then
            endlessStableT = endlessStableT + dt * S.timeScale
          else
            endlessStableT = 0
          end
          if endlessStableT > 60 then
            endlessRamped = true
            Endless.setSpeed(60)
          end
        end
      end
    end
    if App.mode == 'challenge' and App.challenge then
      App.challenge.update(dtGame, S)
    end
    collectStats(dtGame)
    if S.meltdown then
      if not App.endLock and not (App.mode == 'story' and App.scenario) then
        App.endGame('MELTDOWN', {})
      end
      if not App.meltdownFxActive then
        App.meltdownFxActive = true
        local okA, Audio = pcall(require, 'src.audio.synth')
        if okA and Audio.rumble then Audio.rumble() end
      end
    end
  end

  if App.state == 'PLAYING' or App.state == 'ENDING' then
    Instrument.updateLamps(Engine.S)
  end
end

-- ==================== 绘制 ====================

function App.draw()
  if App.state == 'MENU' then
    Menu.draw()
  elseif App.state == 'PLAYING' or App.state == 'ENDING' then
    -- 模态道具打开时抑制 HUD 即时点击（对齐 web 弹层遮罩）
    local blocked = Props.isOpen() ~= nil
    if blocked then
      local kp, kd, kr = W.mouse.pressed, W.mouse.down, W.mouse.released
      W.mouse.pressed, W.mouse.down, W.mouse.released = false, false, false
      Hud.draw(App)
      W.mouse.pressed, W.mouse.down, W.mouse.released = kp, kd, kr
    else
      Hud.draw(App)
    end
    Props.draw(App)
    local okT, Tutorial = pcall(require, 'src.tutorial')
    if okT and Tutorial.isActive() then Tutorial.draw() end
  elseif App.state == 'DEBRIEF' then
    Hud.draw(App)
    Debrief.draw()
  end
  W.endFrame()

  -- 终局过渡（覆盖一切）
  if App.endingFx then
    local f = App.endingFx
    local p = math.min(1, f.t / f.dur)
    if f.hard then
      -- 白闪 → 红光 → 渐暗
      local a = p < 0.25 and (p / 0.25) or math.max(0, 1 - (p - 0.25) / 0.75)
      love.graphics.setColor(1, 1 - p * 0.6, 1 - p * 0.7, a)
    else
      love.graphics.setColor(0, 0, 0, p)
    end
    love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  end
end

-- ==================== 输入（设计坐标） ====================

function App.mousepressed(x, y, button)
  if App.state == 'MENU' then
    Menu.mousepressed(x, y, button)
  elseif App.state == 'PLAYING' or App.state == 'DEBRIEF' then
    if App.state == 'DEBRIEF' then
      Debrief.mousepressed(x, y, button)
      return
    end
    if Pause.isOpen() then Pause.mousepressed(x, y, button) return end
    if Menu.settingsOpen() then Menu.mousepressed(x, y, button) return end
    if Debrief.isOpen() then Debrief.mousepressed(x, y, button) return end
    if Hud.endlessPanelOpen() then Hud.endlessPanelMouse(x, y) return end
    Hud.mousepressed(App, x, y, button)
  end
end

function App.mousereleased(x, y, button)
  Hud.mousereleased(App, x, y, button)
end

function App.mousemoved(x, y)
  Hud.mousemoved(App, x, y)
end

function App.wheelmoved(dx, dy)
  Hud.wheelmoved(dy)
end

function App.keypressed(key, scancode, isRepeat)
  if App.state == 'MENU' then
    Menu.keypressed(key)
    return
  end
  if App.state == 'DEBRIEF' then
    if key == 'return' or key == 'kpenter' or key == 'escape' or key == 'space' then
      if Debrief.isOpen() then Debrief.confirm() end
    end
    return
  end
  -- PLAYING / ENDING
  if Pause.isOpen() then
    Pause.keypressed(key)
    return
  end
  if Menu.settingsOpen() then
    if key == 'escape' then Menu.closeSettings() end
    return
  end
  if Debrief.isOpen() then return end

  local S = Engine.S
  if App.endlessPanelLock then
    if key == 'return' or key == 'kpenter' or key == 'space' then
      Hud.closeEndlessPanel()
    end
    return
  end
  if App.floatShowing and (key == 'return' or key == 'kpenter' or key == 'space') then
    App.hideFloat()
    return
  end
  -- 教程引导（⏎ 推进无状态条件的步骤）
  do
    local okT, Tutorial = pcall(require, 'src.tutorial')
    if okT and Tutorial.isActive() then
      Tutorial.keypressed(key)
      if key == 'return' or key == 'kpenter' or key == 'space' then
        -- 教程已消费 ⏎：非条件步骤推进后仍允许继续（不 return，避免挡住其他键）
      end
    end
  end
  if key == 'escape' then
    -- 道具优先关闭（对齐 web：Esc 关道具；无道具时开暂停）
    if Props.isOpen() then
      Props.closeProp()
      return
    end
    App.openPause()
  elseif key == 'f12' then
    App.openEndConfirm()
  elseif key == 'up' or key == 'w' then
    if not S.meltdown and not S.rod_drive_overheat then
      Engine.beginRodMove(1)
      App.countOp()
    end
  elseif key == 'down' or key == 's' then
    if not S.meltdown and not S.rod_drive_overheat then
      Engine.beginRodMove(-1)
      App.countOp()
    end
  elseif key == 'a' or key == 'f2' then
    Hud.pressAZ5(App)
  elseif key == 'p' then
    Engine.setMode(S.mode == 'auto' and 'manual' or 'auto')
    App.countOp()
  elseif key == 'k' then
    Engine.toggleKey()
  elseif key >= '1' and key <= '8' then
    local idx = tonumber(key)
    if not S.meltdown then
      local wasOn = S.pumps[idx]
      Engine.togglePump(idx)
      if wasOn and App.stats then App.stats.pumpsStopped = App.stats.pumpsStopped + 1 end
      App.countOp()
    end
  elseif key == '+' or key == 'kp+' then
    local ts = S.timeScale * 2
    if ts > 60 then ts = 60 end
    Engine.setTimeScale(ts)
    if App.endless then
      local okE, Endless = pcall(require, 'src.endless')
      if okE and Endless.setSpeed then Endless.setSpeed(ts) end
    end
  elseif key == '-' or key == 'kp-' then
    local ts = S.timeScale / 2
    if ts < 1 then ts = 1 end
    Engine.setTimeScale(ts)
    if App.endless then
      local okE, Endless = pcall(require, 'src.endless')
      if okE and Endless.setSpeed then Endless.setSpeed(ts) end
    end
  end
end

function App.keyreleased(key)
  if key == 'up' or key == 'w' or key == 'down' or key == 's' then
    Engine.endRodMove()
  end
end

function App.textinput(t) end

function App.resize() end

-- ==================== 启动 ====================

function App.boot()
  Layout.calc(love.graphics.getWidth(), love.graphics.getHeight())
  Theme.loadFonts(Layout.scale)
  Props.setApp(App)
  Hud.setPanelCallbacks(
    function()  -- 面板打开：暂停 + 锁定（对齐 web showEndlessPanel）
      App.paused = true
      App.endlessPanelLock = true
    end,
    function()  -- 面板关闭：恢复（对齐 web closeEndlessPanel）
      if not App.endLock and App.state == 'PLAYING' then App.paused = false end
      App.endlessPanelLock = false
    end,
    function()  -- 破产最终结算
      App.endGame('BANKRUPT', {})
    end)
  local okA, Audio = pcall(require, 'src.audio.synth')
  if okA and Audio.init then pcall(Audio.init) end
  Menu.show(function(m) App.startGame(m) end)
end

return App
