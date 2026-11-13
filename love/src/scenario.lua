-- scenario.lua — SCEN_ENGINE-01 场景事件运行时 · web/js/scenario.js 1:1 移植
-- 事件格式：{ id, time|condition, priority, once, actions[] }
-- 动作：log / flag / sim_override / phone / dialogue / branch / sound / pressure /
--       endgame / wait / mode / pumps / timescale / timeskip / az / az_reset / target / protections / act / objective
-- flag 特殊值：'@time' = 场景时间(ms)，'@stime' = 引擎时间(s)

local Engine = require('src.engine')

local Scenario = {}

-- ==================== 运行时 ====================

local Runtime = {}
Runtime.__index = Runtime

function Scenario.create(data)
  if type(data) == 'string' then data = Scenario.registry[data] end
  if not data then return nil end
  local self = setmetatable({}, Runtime)
  self.id = data.id
  self.name = data.name or ''
  self.events = {}
  for i, ev in ipairs(data.events or {}) do self.events[i] = ev end
  table.sort(self.events, function(a, b)
    local pa, pb = a.priority or 0, b.priority or 0
    if pa ~= pb then return pa < pb end
    local ta = (a.time == nil) and math.huge or a.time
    local tb = (b.time == nil) and math.huge or b.time
    return ta < tb
  end)
  self.fired = {}
  self.flags = {}
  for k, v in pairs(data.initialFlags or {}) do self.flags[k] = v end
  self.decisions = {}
  self.simTime = 0
  self.activeBranch = nil
  self.branchArmedAt = 0
  self.pending = {}
  self.finished = false
  self.endResult = nil
  self.overrides = {}
  self.log = {}
  self.listeners = {}
  self.lastState = nil
  self.currentObjective = nil
  return self
end

Scenario.new = Scenario.create

function Runtime:on(name, cb)
  self.listeners[name] = self.listeners[name] or {}
  table.insert(self.listeners[name], cb)
end

function Runtime:emit(name, a, b, c)
  local cbs = self.listeners[name]
  if not cbs then return end
  for _, cb in ipairs(cbs) do cb(a, b, c) end
end

function Runtime:pushLog(text)
  self.log[#self.log + 1] = { time = self.simTime, text = text }
  self:emit('log', text, self.simTime)
end

function Runtime:update(dt, simState)
  if self.finished then return end
  self.simTime = self.simTime + dt
  self.lastState = simState

  for i = #self.pending, 1, -1 do
    if self.pending[i].at <= self.simTime then
      local act = self.pending[i].action
      table.remove(self.pending, i)
      self:execAction(act)
    end
  end

  for _, ev in ipairs(self.events) do
    if not self.fired[ev.id] then
      local hit = ev.time == nil or self.simTime >= ev.time
      if hit and type(ev.condition) == 'function' then
        hit = ev.condition(simState, self.flags)
      end
      if hit then
        self.fired[ev.id] = true
        self:emit('event', ev.id, self.simTime)
        local delay = 0
        for _, a in ipairs(ev.actions or {}) do
          if a.type == 'wait' then
            delay = delay + (a.ms or (a.seconds and a.seconds * 1000) or 0)
          elseif delay > 0 then
            self.pending[#self.pending + 1] = { at = self.simTime + delay, action = a }
          else
            self:execAction(a)
          end
        end
      end
    end
  end

  if self.activeBranch and
     self.simTime - self.branchArmedAt >= (self.activeBranch.timeout or 180000) then
    self:resolveBranch(self.activeBranch.default)
  end

  local obj = self.currentObjective
  if obj and obj.complete and not obj.done then
    if obj.complete(simState, self.flags) then
      obj.done = true
      self:emit('objective_done', obj.text)
    end
  end
end

function Runtime:execAction(a)
  if a.type == 'log' then
    self:pushLog(a.text)
  elseif a.type == 'flag' then
    if a.value == '@time' then
      self.flags[a.key] = self.simTime
    elseif a.value == '@stime' then
      self.flags[a.key] = self.lastState and self.lastState.t or 0
    else
      self.flags[a.key] = a.value
    end
  elseif a.type == 'act' then
    self.flags.act = a.value
    self:emit('act', a.value)
  elseif a.type == 'objective' then
    self.currentObjective = { text = a.text or '', complete = a.completeWhen or nil }
    self:emit('objective', a)
  elseif a.type == 'sim_override' then
    for i = #self.overrides, 1, -1 do
      if self.overrides[i].target == a.target then table.remove(self.overrides, i) end
    end
    self.overrides[#self.overrides + 1] = { target = a.target, value = a.value, ramp = a.ramp or 1000, t = 0, hold = a.hold }
  elseif a.type == 'phone' then
    self:emit('phone', a)
  elseif a.type == 'dialogue' then
    self:emit('dialogue', a)
  elseif a.type == 'sound' then
    self:emit('sound', a)
  elseif a.type == 'pressure' then
    self.flags.pressureLevel = a.level
    self:emit('pressure', a)
  elseif a.type == 'branch' then
    self:armBranch(a)
  elseif a.type == 'protections' then
    local P = Engine.S.protections
    if a.p1 ~= nil then P.P1 = a.p1 end
    if a.p2 ~= nil then P.P2 = a.p2 end
    if a.p3 ~= nil then P.P3 = a.p3 end
    if a.p4 ~= nil then P.P4 = a.p4 end
    if a.p5 ~= nil then P.P5 = a.p5 end
  elseif a.type == 'mode' then
    self:emit('mode', a)
  elseif a.type == 'target' then
    self:emit('target', a)
  elseif a.type == 'pumps' then
    self:emit('pumps', a)
  elseif a.type == 'timescale' then
    self:emit('timescale', a)
  elseif a.type == 'timeskip' then
    local delta = a.to - self.simTime
    if delta > 0 then
      for _, p in ipairs(self.pending) do p.at = p.at + delta end
      self.simTime = a.to
      self:emit('timeskip', { to = a.to, delta = delta })
    end
  elseif a.type == 'az' then
    self:emit('az', a)
  elseif a.type == 'az_reset' then
    self:emit('az_reset', a)
  elseif a.type == 'endgame' then
    if (a.delay or 0) > 0 then
      self.pending[#self.pending + 1] = { at = self.simTime + a.delay,
        action = { type = 'endgame', endType = a.endType, epilogue = a.epilogue } }
    else
      self:emit('endgame', a)
    end
  end
end

function Runtime:applyOverrides(dt, S)
  local dts = dt / 1000
  for i = #self.overrides, 1, -1 do
    local o = self.overrides[i]
    if o.target == 'rod' and (S.rodHeld or 0) ~= 0 then
      table.remove(self.overrides, i)
      self:pushLog('[操作] 自动控制棒位中断 — 转手动操作')
    else
      o.t = o.t + dt
      local f = math.min(1, o.t / o.ramp)
      if o.target == 'power' then
        local targetNorm = o.value / Engine.N_NOM
        S.n = S.n + (targetNorm - S.n) * math.min(1, dts * 0.5) * f
        if S.n < 1e-4 then S.n = 1e-4 end
      end
      if o.target == 'rod' then
        if o.t >= o.ramp + (o.hold or 30000) then
          table.remove(self.overrides, i)
        else
          S.rodTarget = S.rodTarget + (o.value - S.rodTarget) * math.min(1, dts * 0.3) * f
          if S.rodTarget < 0 then S.rodTarget = 0 elseif S.rodTarget > 100 then S.rodTarget = 100 end
        end
      end
    end
  end
end

function Runtime:armBranch(b)
  self.activeBranch = b
  self.branchArmedAt = self.simTime
end

function Runtime:onPlayerAction(action)
  self.flags['action_' .. action] = true
  if not self.activeBranch then return end
  for _, rule in ipairs(self.activeBranch.rules or {}) do
    if rule['if'] == action then
      self:resolveBranch(rule.choice)
      return
    end
  end
end

function Runtime:resolveBranch(choice)
  if not self.activeBranch then return end
  local id = self.activeBranch.id
  self:playerDecision(id, choice)
  self.activeBranch = nil
end

function Runtime:playerDecision(id, choice)
  self.decisions[#self.decisions + 1] = { id = id, choice = choice, timestamp = self.simTime }
  self.flags['branch_' .. id] = choice
  self:emit('decision', id, choice, self.simTime)
  self:pushLog('[决策] ' .. id .. ' → ' .. tostring(choice))
end

function Runtime:isFinished() return self.finished end
function Runtime:getFlags() return self.flags end
function Runtime:getDecisions() return self.decisions end
function Runtime:getLog() return self.log end
function Runtime:getTime() return self.simTime end

function Runtime:finish(endType, epilogue)
  self.finished = true
  self.endResult = { endType = endType, epilogue = epilogue }
end

-- ==================== 时间：1986.04.25 08:00 起，支持跨日 ====================

local function t(h, m, day)
  if day == nil then day = h < 8 and 1 or 0 end
  return (((day * 24 + h) - 8) * 3600 + m * 60) * 1000
end

-- ==================== 场景数据：六幕 + 停堆线 + 隐藏结局 ====================

local CHRONICLE_EVENTS = {

  -- ———— 第一幕 «Смена» 08:00–14:00（×60 加速，约 6 分钟）————
  { id = 'a1_start', time = 0, priority = 1, actions = {
    { type = 'timescale', value = 60 },
    { type = 'log', text = '08:00 白班接班。机组满功率运行：N = 3200 МВт。' },
    { type = 'log', text = '控制盘上方三块面板：功率/周期表、控制棒深度、紧急保护。下方控制台：目标功率滑杆、提棒控制、主循环泵。' },
    { type = 'log', text = '桌面上的道具：运行规程、值班日志、计算器、剂量计、电话、茶炉。' },
    { type = 'dialogue', speaker = 'Акимов 值班长', text = '今天你白班。先确认三件事：功率 N = 3200 МВт，反应性 ОЗР 高于 15 根，控制棒在中间位置。不懂的去查运行规程。' },
    { type = 'objective', text = '接班检查：① 功率表 N ≈ 3200 МВт ② ОЗР ≥ 15 根 ③ 控制棒 ≈ 47%。',
      completeWhen = function(s) return math.abs(s.n - 1) < 0.05 and s.orm >= 15 and s.rodPositions > 40 and s.rodPositions < 55 end },
  } },

  { id = 'a1_inspect', time = t(8, 30), priority = 1, actions = {
    { type = 'log', text = '08:30 巡检提示：悬停鼠标在仪表上可读取数值。' },
    { type = 'objective', text = '反应性表 ρ 应接近 0。想得知更多？打开桌面上的《运行规程》。' },
  } },

  { id = 'a1_dispatch', time = t(9, 0), priority = 1, actions = {
    { type = 'phone', from = '调度', text = '今日计划检修，需将功率降至 1600 МВт。按规程执行。', duration = 4000 },
    { type = 'log', text = '09:00 调度来电：降功率至 1600 МВт。' },
    { type = 'flag', key = 'order_received', value = true },
    { type = 'objective', text = '降功率：把控制台上的「目标功率」滑杆从 62% 拖到 50%。自动调节会缓慢下插控制棒。',
      completeWhen = function(s) return s.power <= 1650 end },
  } },

  { id = 'a1_tea', time = t(10, 0), priority = 1, actions = {
    { type = 'dialogue', speaker = 'Акимов', text = '功率降得顺利。换班前喝口茶吧——右下角桌面上的茶炉。' },
    { type = 'log', text = '10:00 功率平稳下降中。' },
    { type = 'objective', text = '休息一下：点开右下角「茶炉」道具，倒一杯热茶并喝掉。',
      completeWhen = function(s, f) return f.action_tea_drunk == true end },
  } },

  { id = 'a1_pump', time = t(11, 0), priority = 1, actions = {
    { type = 'phone', from = '值班长', text = 'ГЦН-5 振动偏大。建议切换备用泵，你来定。', duration = 4000 },
    { type = 'log', text = '11:00 值班长来电：ГЦН-5 振动偏大。' },
    { type = 'objective', text = '查看控制台上的主循环泵按钮：8 台全开。持续监视功率下降。' },
  } },

  { id = 'a1_rods', time = t(12, 0), priority = 1, actions = {
    { type = 'log', text = '12:00 控制棒随功率降低而下插。' },
    { type = 'objective', text = '控制棒：棒位随功率下降而缓慢下插（→50%）。如需中断自动控制，点「手动」再住住提棒/降棒。' },
  } },

  { id = 'a1_delay', time = t(13, 30), priority = 1, actions = {
    { type = 'phone', from = '调度', text = '试验推迟到夜班。基辅那边还没批。', duration = 3000 },
    { type = 'log', text = '13:30 调度来电：试验推迟至夜班。' },
    { type = 'objective', text = '14:00 交班。确认功率已稳在 1600 МВт。',
      completeWhen = function(s) return s.t >= t(14, 0) / 1000 end },
  } },

  { id = 'a1_end', time = t(14, 0), priority = 2, actions = {
    { type = 'dialogue', speaker = '交班', text = '白班结束。夜班操作员列昂尼德·托普图诺夫接班。\n1986年4月25日 23:10。\n他25岁。这是他第一次独立值班。' },
    { type = 'log', text = '14:00 交班完成。' },
    { type = 'sim_override', target = 'rod', value = 46, ramp = 120000 },
    { type = 'timeskip', to = t(23, 10) },
    { type = 'act', value = 2 },
  } },

  -- ———— 第二幕 «Яма» 23:10–01:23（×10 加速）————
  { id = 'a2_start', time = t(23, 10), priority = 1, actions = {
    { type = 'timescale', value = 10 },
    { type = 'log', text = '23:10 夜班接班。功率 1600 МВт。' },
    { type = 'dialogue', speaker = '调度', text = '夜班任务：继续降至 700–1000 МВт，准备涡轮惰转试验。' },
  } },

  { id = 'a2_dispatch', time = t(23, 12), priority = 1, actions = {
    { type = 'phone', from = '调度', text = '继续降至 700–1000 МВт，准备涡轮惰转试验。', duration = 4000 },
    { type = 'log', text = '23:12 调度命令：降功率至 700–1000 МВт。' },
  } },

  { id = 'a2_crash', time = t(0, 0), priority = 2, condition = function(s, f)
    return not s.azFired
  end, actions = {
    { type = 'protections', p2 = false },
    { type = 'mode', value = 'manual' },
    { type = 'sim_override', target = 'power', value = 30, ramp = 120000 },
    { type = 'sim_override', target = 'rod', value = 38, ramp = 1000 },
    { type = 'sound', id = 'alarm_low', volume = 0.6 },
    { type = 'flag', key = 'xenon_pit_active', value = true },
    { type = 'log', text = '00:00 功率骤降至 30 МВт。氙坑正在加深。' },
    { type = 'dialogue', speaker = '托普图诺夫', text = '功率在石式下跌。' },
    { type = 'objective', text = '功率骤降至 30 МВт。等待氙坑反应性回升。',
      completeWhen = function(s) return s.n > 0.05 end },
  } },

  { id = 'a2_branch', time = t(0, 0), priority = 10, condition = function(s, f)
    return not s.azFired
  end, actions = {
    { type = 'objective', text = '决策：按 АЗ-5 停堆（安全线），或提棒恢复功率（30 分钟内未操作将自动继续）。' },
    { type = 'branch', id = 'xenon_pit', detectBy = 'action',
      rules = {
        { ['if'] = 'az_pressed', choice = 'shutdown' },
        { ['if'] = 'rod_withdrawn', choice = 'continue' },
      },
      timeout = 1800000,
      default = 'continue' },
  } },

  { id = 'a2_phone_kiev', time = t(0, 15), priority = 1, actions = {
    { type = 'phone', from = '不明', text = '基辅问试验什么时候开始。', duration = 3000 },
    { type = 'log', text = '00:15 来电：询问试验进度。' },
  } },

  { id = 'a2_dyatlov', time = t(0, 30), priority = 2, condition = function(s, f)
    return f.xenon_pit_active == true and s.n < 0.05
  end, actions = {
    { type = 'pressure', level = 2, behavior = 'stand_behind' },
    { type = 'dialogue', speaker = 'Дятлов', text = '功率多少了？' },
    { type = 'log', text = '00:30 副总工程师 Дятлов 进入主控室。' },
    { type = 'flag', key = 'dyatlov_present', value = true },
  } },

  { id = 'a2_dyatlov2', time = t(0, 45), priority = 2, condition = function(s, f)
    return f.xenon_pit_active == true and s.n < 0.04 and f.act == 2
  end, actions = {
    { type = 'dialogue', speaker = 'Дятлов', text = '快，把功率拉上来！' },
    { type = 'log', text = '00:45 Дятлов：拉功率。' },
  } },

  { id = 'a2_scrammed_early', time = t(0, 10), priority = 5, condition = function(s, f)
    return s.azFired and f.act == 2 and not f.voluntary_shutdown and not f.branch_xenon_pit
  end, actions = {
    { type = 'protections', p2 = true },
    { type = 'dialogue', speaker = 'Дятлов', text = '你停了。\n试验做不了了。明天调度会问。\n……他转身走了。' },
    { type = 'log', text = '00:10 你按下了 АЗ-5。反应堆安全停闭。' },
    { type = 'flag', key = 'voluntary_shutdown', value = true },
    { type = 'act', value = '2B' },
    { type = 'timeskip', to = t(8, 0, 1) },
    { type = 'timescale', value = 60 },
    { type = 'objective', text = '停堆完成。值守至白班，等待审核。',
      completeWhen = function(s) return s.t >= t(8, 0, 1) / 1000 end },
  } },

  -- —— 停堆线：第二幕B «Ожидание» → 第三幕B «Заново» ——
  { id = 'a2_shutdown', time = nil, priority = 20, condition = function(s, f)
    return f.branch_xenon_pit == 'shutdown'
  end, actions = {
    { type = 'protections', p2 = true },
    { type = 'dialogue', speaker = 'Дятлов', text = '你确定？\n你知道这意味着什么。试验做不了了。' },
    { type = 'flag', key = 'voluntary_shutdown', value = true },
    { type = 'act', value = '2B' },
    { type = 'log', text = '00:40 你按下了 АЗ-5。反应堆安全停闭。' },
    { type = 'dialogue', speaker = 'Дятлов', text = '……他转身走了。' },
    { type = 'timeskip', to = t(8, 0, 1) },
    { type = 'timescale', value = 60 },
  } },

  { id = 'a3b_start', time = t(8, 0, 1), priority = 1, condition = function(s, f)
    return f.act == '2B'
  end, actions = {
    { type = 'az_reset' },
    { type = 'protections', p2 = true },
    { type = 'phone', from = '调度', text = '氙毒已退化。恢复功率，试验可以做。', duration = 4000 },
    { type = 'log', text = '08:00 调度来电：恢复功率，准备试验。' },
    { type = 'mode', value = 'auto' },
    { type = 'target', value = 100 },
    { type = 'sim_override', target = 'power', value = 3200, ramp = 600000 },
    { type = 'sim_override', target = 'rod', value = 53.7, ramp = 600000 },
    { type = 'act', value = '3B' },
    { type = 'objective', text = '目标：自动恢复功率至 3200 МВт，等待 14:00 试验。',
      completeWhen = function(s) return s.n > 0.95 end },
  } },

  { id = 'a3b_test', time = t(14, 0, 1), priority = 1, condition = function(s, f)
    return f.act == '3B'
  end, actions = {
    { type = 'dialogue', speaker = '值班长', text = '功率到了。做试验。' },
    { type = 'log', text = '14:00 试验开始：汽轮机惰走 45 秒，柴油发电机启动。试验成功。' },
    { type = 'endgame', endType = 'SAFE_SHUTDOWN', epilogue = 'epilogue_quiet' },
  } },

  -- —— 继续线：第三幕 «Тяга» ——
  { id = 'a2_continue', time = nil, priority = 20, condition = function(s, f)
    return f.branch_xenon_pit == 'continue' and f.act == 2
  end, actions = {
    { type = 'protections', p2 = true },
    { type = 'log', text = '操作员开始拔棒。' },
    { type = 'sim_override', target = 'power', value = 200, ramp = 600000 },
    { type = 'act', value = 3 },
    { type = 'objective', text = '目标：缓慢提棒恢复功率至 ~200 МВт（注意周期）。',
      completeWhen = function(s) return s.n >= 0.05 end },
  } },

  { id = 'a3_pull', time = t(0, 40), priority = 1, condition = function(s, f)
    return f.act == 3 and not f.act3_done
  end, actions = {
    { type = 'dialogue', speaker = 'Дятлов', text = '拉功率。200 兆瓦，做试验。' },
    { type = 'log', text = '00:40 手动提棒，功率回升。' },
  } },

  { id = 'a3_recover', time = nil, priority = 2, condition = function(s, f)
    return f.act == 3 and s.n > 0.05 and not f.act3_done
  end, actions = {
    { type = 'dialogue', speaker = 'Дятлов', text = '200 够了。做试验。' },
    { type = 'log', text = '功率稳定在 ~200 МВт。' },
    { type = 'flag', key = 'act3_done', value = true },
    { type = 'act', value = 4 },
  } },

  { id = 'a3_stuck', time = t(1, 0), priority = 2, condition = function(s, f)
    return f.act == 3 and s.n < 0.03 and not s.azFired
  end, actions = {
    { type = 'dialogue', speaker = 'Дятлов', text = '功率还在 30 兆瓦。把棒拉出来！' },
    { type = 'log', text = '01:00 功率未回升。' },
  } },

  -- —— 继续线：第四幕 «Подготовка» 01:00–01:20 ——
  { id = 'a4_saor', time = t(1, 0), priority = 1, condition = function(s, f)
    return f.act == 4 and not f.saor_off
  end, actions = {
    { type = 'dialogue', speaker = 'Дятлов', text = '把 САОР 切了。试验期间不能让它误触发停堆。' },
    { type = 'log', text = '01:00 Дятлов 命令：关闭应急堆芯冷却系统。' },
    { type = 'objective', text = '准备试验：回应 САОР 命令（可拒绝）。',
      completeWhen = function(s, f) return f.saor_off == true end },
    { type = 'branch', id = 'saor_disable', detectBy = 'action',
      rules = {
        { ['if'] = 'az_pressed', choice = 'refuse' },
        { ['if'] = 'rod_withdrawn', choice = 'obey' },
      },
      timeout = 180000,
      default = 'obey' },
  } },

  { id = 'a4_obey', time = nil, priority = 10, condition = function(s, f)
    return f.branch_saor_disable == 'obey'
  end, actions = {
    { type = 'log', text = '01:03 САОР 已关闭。操作人：托普图诺夫。指令来源：Дятлов。' },
    { type = 'flag', key = 'saor_off', value = true },
    { type = 'dialogue', speaker = 'Акимов', text = '流量不够。再开两台泵。' },
    { type = 'pumps', value = 8 },
    { type = 'log', text = '01:05 主泵 7、8 启动。流量 100%。' },
  } },

  { id = 'a4_refuse', time = nil, priority = 10, condition = function(s, f)
    return f.branch_saor_disable == 'refuse'
  end, actions = {
    { type = 'dialogue', speaker = 'Дятлов', text = '这是命令。\n……好。那你自己跟调度解释。' },
    { type = 'log', text = '试验取消。你被记过。' },
    { type = 'endgame', endType = 'SAFE_SHUTDOWN', epilogue = 'epilogue_hidden' },
  } },

  { id = 'a4_turbine', time = t(1, 10), priority = 1, condition = function(s, f)
    return f.saor_off == true and not f.turbine_off
  end, actions = {
    { type = 'dialogue', speaker = 'Акимов', text = '断开汽轮机。试验要求：模拟失电。' },
    { type = 'log', text = '01:10 汽轮机与电网断开。' },
    { type = 'flag', key = 'turbine_off', value = true },
  } },

  { id = 'a4_test', time = t(1, 20), priority = 1, condition = function(s, f)
    return f.turbine_off == true and not f.act5
  end, actions = {
    { type = 'dialogue', speaker = 'Акимов', text = '开始吧。' },
    { type = 'log', text = '01:20 试验开始：汽轮机惰走，发电机失电。' },
    { type = 'act', value = 5 },
    { type = 'flag', key = 'act5', value = true },
    { type = 'objective', text = '试验开始：注意功率走向，准备 АЗ-5。',
      completeWhen = function(s) return s.azFired end },
  } },

  -- —— 继续线：第五幕 «АЗ-5» 01:23（实时 ×1）——
  { id = 'a5_rise', time = t(1, 23) + 4000, priority = 1, condition = function(s, f)
    return f.act5 == true and not s.azFired
  end, actions = {
    { type = 'timescale', value = 1 },
    { type = 'dialogue', speaker = 'Акимов', text = '功率在涨。' },
    { type = 'log', text = '01:23:04 功率开始上升。' },
    { type = 'objective', text = '功率上升中：等待自动 АЗ-5（01:23:47）或手动停堆。' },
    { type = 'branch', id = 'az5_press', detectBy = 'action',
      rules = {
        { ['if'] = 'az_pressed', choice = 'press' },
      },
      timeout = 43000,
      default = 'press' },
  } },

  { id = 'a5_press', time = t(1, 23) + 30000, priority = 1, condition = function(s, f)
    return f.act5 == true and not s.azFired
  end, actions = {
    { type = 'dialogue', speaker = 'Акимов', text = '按。' },
  } },

  { id = 'a5_autoaz', time = t(1, 23) + 47000, priority = 1, condition = function(s, f)
    return f.act5 == true and not s.azFired
  end, actions = {
    { type = 'az', reason = 'Акимов 按下了 АЗ-5' },
    { type = 'log', text = '01:23:47 阿基莫夫按下 АЗ-5。' },
  } },

  { id = 'a5_explosion', time = nil, priority = 10, condition = function(s, f)
    return f.act5 == true and s.azFired and (s.n > 0.6 or s.meltdown) and not f.exploded
  end, actions = {
    { type = 'flag', key = 'exploded', value = true },
    { type = 'sound', id = 'alarm_high', volume = 0.8 },
    { type = 'log', text = '01:23:45 功率突破 2000 МВт！' },
    { type = 'dialogue', speaker = '托普图诺夫', text = '功率在涨！' },
  } },

  { id = 'a5_saved', time = t(1, 26), priority = 10, condition = function(s, f)
    return f.act5 == true and s.azFired and not f.exploded and not s.meltdown and s.n < 0.2
  end, actions = {
    { type = 'dialogue', speaker = 'Акимов', text = '……停了。\n没有爆炸。' },
    { type = 'log', text = '01:26 功率平稳下降。没有爆炸。' },
    { type = 'endgame', endType = 'SAFE_SHUTDOWN', epilogue = 'epilogue_scram_saved' },
  } },

  { id = 'a5_nearmiss', time = t(1, 26), priority = 10, condition = function(s, f)
    return f.act5 == true and f.exploded == true and not f.a5_nearmiss_done and s.azFired and not s.meltdown and s.n < 0.2
  end, actions = {
    { type = 'flag', key = 'a5_nearmiss_done', value = true },
    { type = 'dialogue', speaker = 'Акимов', text = '……停了。\n刚才那一下，堆芯差点燃穿。' },
    { type = 'log', text = '01:26 功率落回安全区。堆芯未熔毁——千钧一发。' },
    { type = 'endgame', endType = 'SAFE_SHUTDOWN', epilogue = 'epilogue_scram_saved' },
  } },

  -- —— 第六幕 «После»：熔毁后的灾后阶段 ——
  { id = 'a0_meltdown_early', time = nil, priority = 30, condition = function(s, f)
    return s.meltdown and s.t < t(23, 10) / 1000
  end, actions = {
    { type = 'endgame', endType = 'EXPLOSION', epilogue = 'epilogue_blast' },
  } },

  { id = 'a6_start', time = nil, priority = 20, condition = function(s, f)
    return s.meltdown and s.t >= t(23, 10) / 1000 and not f.a6_done
  end, actions = {
    { type = 'flag', key = 'a6_done', value = true },
    { type = 'flag', key = 'meltdown_at', value = '@stime' },
    { type = 'act', value = 6 },
    { type = 'timescale', value = 60 },
    { type = 'sound', id = 'alarm_high', volume = 0.8 },
    { type = 'log', text = '01:24 应急灯。警报声重迭。辐射水平在跳。' },
    { type = 'dialogue', speaker = 'Акимов', text = '注水！手动注水！' },
    { type = 'objective', text = '灾后响应：继续注水，记录辐射读数。' },
  } },

  { id = 'a6_water', time = nil, priority = 20, condition = function(s, f)
    return f.a6_done == true and s.t >= (f.meltdown_at or 0) + 600 and not f.a6_water_done
  end, actions = {
    { type = 'flag', key = 'a6_water_done', value = true },
    { type = 'dialogue', speaker = '托普图诺夫', text = '水注不进去。流量为零。' },
    { type = 'log', text = '备用给水泵运行，流量为零。堆芯已损。' },
  } },

  { id = 'a6_walls', time = nil, priority = 20, condition = function(s, f)
    return f.a6_done == true and s.t >= (f.meltdown_at or 0) + 2400 and not f.a6_walls_done
  end, actions = {
    { type = 'flag', key = 'a6_walls_done', value = true },
    { type = 'dialogue', speaker = '值班员', text = '屋顶塌了。' },
    { type = 'log', text = '辐射读数持续上升。' },
  } },

  { id = 'a6_limit', time = nil, priority = 20, condition = function(s, f)
    return f.a6_done == true and s.t >= (f.meltdown_at or 0) + 4800 and not f.a6_limit_done
  end, actions = {
    { type = 'flag', key = 'a6_limit_done', value = true },
    { type = 'log', text = '03:00 辐射超过仪表量程：ЗАПРЕДЕЛ。' },
    { type = 'dialogue', speaker = 'Акимов', text = '继续注水。' },
  } },

  { id = 'a6_leave', time = nil, priority = 20, condition = function(s, f)
    return f.a6_done == true and s.t >= (f.meltdown_at or 0) + 9000 and not f.a6_leave_done
  end, actions = {
    { type = 'flag', key = 'a6_leave_done', value = true },
    { type = 'dialogue', speaker = 'Акимов', text = '出去吧。' },
  } },

  { id = 'a6_end', time = nil, priority = 20, condition = function(s, f)
    return f.a6_done == true and s.t >= (f.meltdown_at or 0) + 16200
  end, actions = {
    { type = 'endgame', endType = 'EXPLOSION', epilogue = 'epilogue_blast' },
  } },
}

local CHRONICLE = {
  id = 'chronicle_04',
  name = '1986.04.26 · 4号机组',
  initialFlags = { act = 1 },
  events = CHRONICLE_EVENTS,
  actMeta = {
    ['1']   = { ru = 'АКТ I · Смена', cn = '第一幕 · 白班' },
    ['2']   = { ru = 'АКТ II · Яма', cn = '第二幕 · 氙坑' },
    ['2B']  = { ru = 'АКТ II-Б · Ожидание', cn = '第二幕B · 等待' },
    ['3']   = { ru = 'АКТ III · Тяга', cn = '第三幕 · 提棒' },
    ['3B']  = { ru = 'АКТ III-Б · Заново', cn = '第三幕B · 重来' },
    ['4']   = { ru = 'АКТ IV · Подготовка', cn = '第四幕 · 准备' },
    ['5']   = { ru = 'АКТ V · АЗ-5', cn = '第五幕 · 试验' },
    ['6']   = { ru = 'АКТ VI · После', cn = '第六幕 · 灾后' },
  },
}

Scenario.registry = { chronicle_04 = CHRONICLE }

function Scenario.ids()
  local out = {}
  for k in pairs(Scenario.registry) do out[#out + 1] = k end
  return out
end

return Scenario
