local C = require('src.config')

local Mission = {}
Mission.__index = Mission

local PHASES = {
  {id='idle', label='等待触发'},
  {id='order_received', label='接到试验指令'},
  {id='power_reduction', label='降功率至700-1000MWt'},
  {id='dispatch_call', label='调度来电：延迟到明日'},
  {id='low_power_wait', label='低功率等待（氙毒积累）'},
  {id='power_drop', label='功率跌至<200MWt'},
  {id='decision', label='决策：停堆或提功率'},
  {id='rod_withdraw', label='抽出控制棒补偿氙毒'},
  {id='experiment_prep', label='试验准备：切备用泵'},
  {id='turbine_trip', label='执行试验：切断汽轮机'},
  {id='power_rise', label='异常：功率开始上升'},
  {id='final_choice', label='最终决策：AZ-5或手动'},
  {id='completed', label='试验完成'},
  {id='failed', label='试验失败'},
}

local DISPATCH_SCRIPT = {
  '基辅调度：4号机组，明天白天电网需要满负荷供电。你们的试验推迟到25日23:00后进行。',
  '服从调度，试验推迟。',
  '拒绝调度。试验按原计划进行。',
}

function Mission.new()
  local self = setmetatable({}, Mission)
  self:reset()
  return self
end

function Mission:reset()
  self.active = false
  self.phase = 'idle'
  self.phaseIdx = 1
  self.started = false
  self.completed = false
  self.failed = false
  self.dispatchDelayed = false
  self.turbineCut = false
  self.powerTargetHit = false
  self.lowPowerRecovery = false
  self.az5Used = false
  self.stats = {
    peakXenon = 0,
    minORM = 211,
    powerAtTrip = 0,
    voidAtTrip = 0,
  }
end

function Mission:checkTrigger(G)
  if self.active or self.completed then return false end
  if G.daysOp < 1 then return false end
  local pct = G.r.power / C.RATED_T * 100
  if pct < 80 then return false end
  if G.politics < 30 then return false end
  local diff = C.DIFFS[G.diff]
  if diff.missionDay and diff.missionDay > 0 and G.daysOp < diff.missionDay then return false end
  if diff.missionDay == -1 then return false end
  return true
end

function Mission:start(G)
  self.active = true
  self.phase = 'order_received'
  self.phaseIdx = 2
  G:log('system', '[任] 安全试验任务链启动！')
  G:log('info', '莫斯科要求进行"汽轮机惰转供电试验"。')
  G:log('warn', '目标：降至700-1000MWt，切断汽轮机，验证惰转泵供电能力。')
  G:toast('[任] 安全试验任务开始！', 'system')
end

function Mission:advancePhase(G, newPhase)
  self.phase = newPhase
  for i, p in ipairs(PHASES) do
    if p.id == newPhase then self.phaseIdx = i; break end
  end
end

function Mission:checkProgress(G)
  if not self.active or self.completed or self.failed then return end
  local pct = G.r.power / C.RATED_T * 100

  if self.phase == 'order_received' then
    G:log('info', '请将功率降至700-1000MWt（22-31%）。')
    G:toast('[任] 降功率至700-1000MWt', 'info')
    self:advancePhase(G, 'power_reduction')
  end

  if self.phase == 'power_reduction' then
    if pct < 32 then
      G:log('good', '[任] 功率已降至目标范围。等待调度指令。')
      self:advancePhase(G, 'dispatch_call')
    end
  end

  if self.phase == 'dispatch_call' then
    if not self.dispatchDelayed then
      G:log('warn', DISPATCH_SCRIPT[1])
      G:log('info', '选择：1)服从 2)拒绝')
      G:toast('[任] 调度来电：延迟试验', 'warn')
      self.dispatchDelayed = true
    end
  end

  if self.phase == 'low_power_wait' then
    if G.r.xenon > self.stats.peakXenon then self.stats.peakXenon = G.r.xenon end
    if pct < 6.25 then
      G:log('danger', '[任] 功率跌至<200MWt！低功率不稳定区！')
      G:toast('[任] 功率过低！', 'danger')
      self:advancePhase(G, 'power_drop')
    end
    if self.rPowerBelow200 and pct >= 6.25 then
      self.lowPowerRecovery = true
    end
    if pct < 6.25 then
      self.rPowerBelow200 = true
    end
  end

  if self.phase == 'power_drop' then
    G:log('info', '当前氙毒=' .. string.format('%.2f', G.r.xenon) .. '。')
    G:log('warn', '选择：1)停堆等待氙衰变 2)强行提功率')
    G:toast('[任] 决策：停堆或提功率？', 'warn')
    self:advancePhase(G, 'decision')
  end

  if self.phase == 'rod_withdraw' then
    if pct > 6.25 then
      G:log('good', '[任] 功率恢复到>200MWt。准备试验。')
      G:log('warn', 'ORM=' .. G.r:orm() .. '根。注意：不要为补偿氙毒而过度抽棒！')
      self:advancePhase(G, 'experiment_prep')
    end
  end

  if self.phase == 'experiment_prep' then
    G:log('info', '试验准备：减少运行泵数至4台。')
    G:toast('[任] 切至4台ГЦН', 'info')
    if G.r.pumpsOn <= 4 then
      G:log('good', '[任] 泵已切换。执行试验：切断汽轮机。')
      self:advancePhase(G, 'turbine_trip')
    end
  end

  if self.phase == 'turbine_trip' then
    if not self.turbineCut then
      self.stats.powerAtTrip = G.r.power
      self.stats.voidAtTrip = G.r.void
      G:log('danger', '[任] 汽轮机切断！蒸汽无处可去→旁路阀排凝汽器。')
      G:log('warn', '功率开始上升提示：正空泡反馈回路启动。')
      G:toast('[任] 汽轮机惰转中', 'danger')
      self.turbineCut = true
      self:advancePhase(G, 'power_rise')
    end
  end

  if self.phase == 'power_rise' then
    local pRise = G.r.power / self.stats.powerAtTrip
    if pRise > 1.1 then
      G:log('danger', '[任] 功率持续上升！空泡=' .. string.format('%.2f', G.r.void))
      G:log('danger', '选择：1)AZ-5紧急停堆 2)手动插棒 3)等待')
    end
  end
end

function Mission:handleDecision(G, choice)
  if not self.active or self.completed then return end

  if self.phase == 'dispatch_call' and self.dispatchDelayed then
    if choice == 1 then
      G:log('warn', '调度同意推迟。继续低功率运行。氙毒将积累。')
      G.politics = math.min(100, G.politics + 2)
      self:advancePhase(G, 'low_power_wait')
    elseif choice == 2 then
      G:log('danger', '拒绝调度！信任-8。')
      G.politics = G.politics - 8
      self:advancePhase(G, 'low_power_wait')
    end
    return
  end

  if self.phase == 'decision' then
    if choice == 1 then
      G:log('info', '停堆等待。氙峰约10h后，消减约40-50h。')
      G.r.state = 'SCRAM'
      G.r.az5Done = true
      self.az5Used = true
      self:advancePhase(G, 'low_power_wait')
    elseif choice == 2 then
      G:log('warn', '强行提功率！注意ORM下降。')
      self:advancePhase(G, 'rod_withdraw')
    end
    return
  end

  if self.phase == 'power_rise' then
    if choice == 1 then
      G:log('danger', '[任] AZ-5触发！')
      G:cmdAz5Fire()
      self.az5Used = true
      self.failed = true
      G:log('system', '[任] 试验失败：AZ-5中断试验。')
      self:advancePhase(G, 'failed')
    elseif choice == 2 then
      G:log('warn', '手动插入控制棒。')
      G.r:moveRods(-30)
      self:advancePhase(G, 'completed')
      self:complete(G)
    elseif choice == 3 then
      G:log('warn', '等待观察。功率持续上升中！')
    end
    return
  end
end

function Mission:complete(G)
  self.completed = true
  self.active = false
  G:log('good', '[任] 安全试验成功完成！惰转泵供电验证通过。')
  G:log('achieve', '[成] 试验完成！核心内容通过。')
  G:toast('[成] 安全试验完成！', 'achieve')
  G.politics = math.min(100, G.politics + 20)
  G.money = G.money + 500000
end

function Mission:getPhaseLabel()
  for _, p in ipairs(PHASES) do
    if p.id == self.phase then return p.label end
  end
  return '未知'
end

Mission.PHASES = PHASES

return Mission
