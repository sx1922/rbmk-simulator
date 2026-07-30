local C = require('src.config')
local Reactor = require('src.physics.reactor')
local RNG = require('src.physics.rng')
local Thermal = require('src.physics.thermal')
local Turbine = require('src.physics.turbine')
local Instruments = require('src.systems.instruments')
local Mission = require('src.systems.mission')
local EV = require('src.systems.events')
local ACH = require('src.systems.achievements')
local Save = require('src.save.save')
local ModLoader = require('src.systems.mods')

local G = {}

function G:init(seed)
  self.rng = RNG.new(seed)
  local simrng = RNG.new(seed + 1)
  self.r = Reactor.new(function(a, b) return simrng:range(a, b) end)
  self.C = C
  self.money = 5000000
  self.politics = 70
  self.diff = 2
  self.day = 25; self.hour = 8; self.month = 4; self.year = 1986
  self.daysOp = 0; self.totalGen = 0; self.scrams = 0; self.incidents = 0
  self.quota = C.QUOTA; self.quotaDone = 0; self.rad = 0.012
  self.gameOver = false; self.started = false
  self.shift = 0
  self.shiftNames = {'白班 А','中班 Б','夜班 В'}
  self.trend = {}; self.xenonTrend = {}; self.trendMax = 200
  self.logs = {}; self.logUnread = 0
  self.lastEventDay = 0; self.daysSinceEvent = 0
  self.staff = {}; self.safety = {}; self.fuelBurn = {}
  self.achievements = {}
  self.totalCrits = 0; self.maxPowerPct = 0
  self.survivedXenonPeak = false; self.az5Survived = false
  self.survivedOverpower = false; self.winterQuotaDone = false
  self.wasOverpower = false; self.xenonPeakSeen = false
  self.turbineHealth = 95; self.turbineFault = false
  self.seasonCoolIn = 270
  self.thermal = Thermal.new()
  self.turbine = Turbine.new()
  self.instruments = Instruments.new()
  self.mission = Mission.new()
  self.pendingEvent = nil
  self.screen = 'intro'
  self.toastMsg = ''; self.toastTimer = 0; self.toastType = ''
  self.flashAlpha = 0; self.shakeTime = 0; self.shakeX = 0; self.shakeY = 0
  self.animClock = 0
  self.bubbles = {}
  self.tickerX = 0
  self.diffSelected = 2
  self.EVENTS = {}
  for _, e in ipairs(EV.EVENTS) do table.insert(self.EVENTS, e) end
  self.ACH = {}
  for _, a in ipairs(ACH.ACHIEVEMENTS) do table.insert(self.ACH, a) end
  self:initStaff()
  self:initSafety()
  self:initFuel()
end

function G:initStaff()
  local names = {'阿纳托利','鲍里斯','维克多','德米特里','叶夫根尼','伊戈尔','尤里','列昂尼德','米哈伊尔','尼古拉','谢尔盖','瓦西里','彼得','安德烈'}
  local specs = {'反应堆控制','热工水力','辐射防护','电气系统','化学水处理','涡轮机'}
  local patr = {'维奇','诺夫','斯基'}
  for i = 1, 12 do
    local name = names[(i - 1) % #names + 1] .. '·' .. patr[(i - 1) % 3 + 1]
    table.insert(self.staff, {
      name=name, skill=self.rng:int(3,8), exp=0, fatigue=self.rng:range(0,30),
      morale=self.rng:int(50,80), shift=(i - 1) % 3, spec=specs[(i - 1) % #specs + 1],
      alive=true, dose=0,
    })
  end
end

function G:initSafety()
  local sys = {'紧急冷却 САОР','应急柴油机','辐射监测 КИП','消防系统','通风过滤','应急硼注入'}
  self.safety = {}
  for _, n in ipairs(sys) do
    table.insert(self.safety, {name=n, status=self.rng:range(82, 96)})
  end
end

function G:initFuel()
  self.fuelBurn = {}
  for _ = 1, 100 do table.insert(self.fuelBurn, self.rng:range(5, 18)) end
end

function G:begin()
  local d = C.DIFFS[self.diff]
  self.money = d.money
  self.screen = 'game'
  self.started = true
  self:log('good', '难度：' .. d.name .. '。初始资金 ' .. self:fmt(self.money) .. '₽。值班开始。')
  self:log('info', '反应堆处于停堆状态。ORM=' .. self.r:orm() .. '≥26，可以启动。')
end

function G:log(typ, msg)
  local timeStr = string.format('%d/%d %02d:00', self.month, self.day, self.hour)
  table.insert(self.logs, 1, {typ=typ, msg=msg, time=timeStr})
  if #self.logs > 80 then table.remove(self.logs) end
  self.logUnread = self.logUnread + 1
end

function G:toast(msg, typ)
  self.toastMsg = msg; self.toastType = typ or ''; self.toastTimer = 2.8
end

function G:fmt(n)
  local s = tostring(math.floor(math.abs(n) + 0.5))
  local sign = n < 0 and '-' or ''
  local k; repeat s, k = s:gsub('^(%d+)(%d%d%d)', '%1,%2') until k == 0
  return sign .. s
end

function G:checkAchievements()
  for _, a in ipairs(self.ACH) do
    local has = false
    for _, v in ipairs(self.achievements) do if v == a.id then has = true; break end end
    if not has and a.check(self) then
      table.insert(self.achievements, a.id)
      self:log('achieve', '[成就] 解锁：' .. a.icon .. ' ' .. a.name .. ' — ' .. a.desc)
      self:toast('[成就] ' .. a.name, 'achieve')
    end
  end
end

function G:cmdMoveRods(delta)
  if self.gameOver or not self.started then return end
  if self.r.state == 'SHUTDOWN' or self.r.state == 'SCRAM' then self:toast('反应堆未运行', 'warn'); return end
  local before = self.r:orm()
  self.r:moveRods(delta)
  local after = self.r:orm()
  if delta > 0 then
    self:log('info', '抽出控制棒。ORM: ' .. before .. '→' .. after .. '根。')
    if after < C.ORM_CRIT then
      self:log('danger', '[急] ORM=' .. after .. '(<15)！极度危险！')
      self:toast('ORM<15！极度危险！', 'danger')
    elseif after < C.ORM_MIN then
      self:log('warn', '[警] ORM=' .. after .. '(<26)，低于规程。')
      self:toast('ORM低于规程', 'warn')
    end
  else
    self:log('info', '插入控制棒。ORM: ' .. before .. '→' .. after .. '根。')
  end
  local rep = self.r:step(0.25, self:shiftSkill())
  self:processRep(rep)
  self:checkEnd()
end

function G:cmdPumpDelta(n)
  if self.gameOver or not self.started then return end
  self.r.pumpsOn = math.max(0, math.min(8, self.r.pumpsOn + n))
  self.r.flow = self.r.pumpsOn * C.FLOW_PER_PUMP
  if self.thermal then self.thermal:setPumps(self.r.pumpsOn) end
  self:log(self.r.pumpsOn < 6 and 'warn' or 'info', 'ГЦН: ' .. self.r.pumpsOn .. '/8台，流量' .. self:fmt(self.r.flow) .. 'm³/h。')
  if self.r.pumpsOn <= 4 and self.r.power > 500 then
    self:log('danger', '[警] 泵少功率高！沸腾加剧！')
  end
  local rep = self.r:step(0.25, self:shiftSkill())
  self:processRep(rep)
  self:checkEnd()
end

function G:cmdPumpReset()
  if self.gameOver or not self.started then return end
  self.r.pumpsOn = 8; self.r.flow = C.FLOW_RATED
  if self.thermal then self.thermal:setPumps(8) end
  self:log('good', '恢复8台ГЦН全运，48,000m³/h。')
end

function G:cmdStartup()
  if self.gameOver or not self.started then return end
  if self.r.state ~= 'SHUTDOWN' then self:toast('反应堆不在停堆状态', 'warn'); return end
  local orm = self.r:orm()
  if orm < C.ORM_MIN then
    self:toast('ORM不足(' .. orm .. '<26)，禁止启动', 'danger')
    self:log('danger', '启动拒绝：ORM ' .. orm .. '<26。')
    return
  end
  self.r:moveRods(30)
  self.r.power = 50; self.r.state = 'POWER'
  if self.turbine then
    self.turbine.online = true
    self.turbine.bypassValve = 0
  end
  self.totalCrits = self.totalCrits + 1
  self:log('good', '[临界] 反应堆达临界！初始功率50MWt。')
  self:log('warn', '提示：尽快越过20%不稳定区。')
  self:checkAchievements()
end

function G:cmdAz5Ask()
  if self.gameOver or not self.started then return end
  if self.r.state == 'SHUTDOWN' or self.r.state == 'SCRAM' then self:toast('已停堆', 'warn'); return end
  self.az5ModalVoid = self.r.void
  self.az5ModalPower = self.r.power
  self.az5ModalOpen = true
end

function G:cmdAz5Cancel()
  self.az5ModalOpen = false
end

function G:cmdAz5Fire()
  self.az5ModalOpen = false
  local res = self.r:az5()
  self.scrams = self.scrams + 1
  if res == 'SPIKE' then
    self:log('danger', '[尖峰] AZ-5正尖峰！石墨棒端排挤冷却水→功率飙升！')
    self:toast('AZ-5正尖峰！功率飙升！', 'danger')
    if self.r.power > C.MELT_T then
      self.r.state = 'EXPLOSION'
      self:disaster('AZ-5后功率失控，蒸汽爆炸。')
      return
    end
  else
    self:log('warn', '[AZ5] AZ-5触发，棒组插入中(18s)。')
    self:toast('AZ-5已触发', 'warn')
  end
  self:checkEnd()
end

function G:cmdAdvanceShift()
  if self.gameOver or not self.started then return end
  self:tick(8)
end

function G:cmdEventChoice(idx)
  if not self.pendingEvent then return end
  local ev = self.pendingEvent
  local ch = ev.choices[idx]
  if ch then
    ch.fx(self)
    self:checkEnd()
  end
  self.pendingEvent = nil
end

function G:cmdHire()
  if self.gameOver or not self.started then return end
  if self.money < 50000 then self:toast('资金不足', 'warn'); return end
  self.money = self.money - 50000
  local names = {'彼得','安德烈','马克西姆','弗拉基米尔','斯坦尼斯拉夫','阿尔乔姆'}
  local specs = {'反应堆控制','热工水力','辐射防护','电气系统','化学水处理','涡轮机'}
  local patr = {'维奇','诺夫','斯基'}
  local op = {
    name = names[self.rng:int(1, #names)] .. '·' .. patr[self.rng:int(1,3)],
    skill = self.rng:int(2,5), exp = 0, fatigue = 0, morale = 70,
    shift = 0, spec = specs[self.rng:int(1, #specs)], alive = true, dose = 0,
  }
  table.insert(self.staff, op)
  self:log('good', '招聘 ' .. op.name .. '(技能' .. op.skill .. ',' .. op.spec .. ')。-50k₽。')
  self:checkAchievements()
end

function G:cmdTrain()
  if self.gameOver or not self.started then return end
  local on = {}
  for _, s in ipairs(self.staff) do
    if s.alive and s.shift == self.shift then table.insert(on, s) end
  end
  if #on == 0 then self:toast('当班无人', 'warn'); return end
  for _, s in ipairs(on) do
    s.exp = s.exp + 10
    if s.exp >= 50 then
      s.skill = math.min(10, s.skill + 1); s.exp = 0
      self:log('good', '[教] ' .. s.name .. '技能→' .. s.skill .. '！')
    end
  end
  self:log('info', #on .. '人完成培训。')
end

function G:cmdMaintain(i)
  if self.gameOver or not self.started then return end
  if self.money < 30000 then self:toast('资金不足(30k₽)', 'warn'); return end
  self.money = self.money - 30000
  self.safety[i].status = math.min(100, self.safety[i].status + 30)
  self:log('good', self.safety[i].name .. '维护→' .. string.format('%.0f', self.safety[i].status) .. '%。-30k₽。')
end

function G:cmdRefuel()
  if self.gameOver or not self.started then return end
  if self.r.state ~= 'POWER' and self.r.state ~= 'LOWPOW' then self:toast('需功率运行', 'warn'); return end
  if self.money < 15000 then self:toast('资金不足(15k₽)', 'warn'); return end
  self.money = self.money - 15000
  local maxI = 1
  for i = 2, #self.fuelBurn do
    if self.fuelBurn[i] > self.fuelBurn[maxI] then maxI = i end
  end
  self.fuelBurn[maxI] = 0.5
  self.r.refuelBonus = self.r.refuelBonus + 0.0001
  self:log('good', '[换] 换料完成。新组件入堆，微正反应性+0.0001。')
end

function G:cmdRepairTurbine()
  if self.gameOver or not self.started then return end
  if self.money < 60000 then self:toast('资金不足(60k₽)', 'warn'); return end
  self.money = self.money - 60000
  if self.turbine then
    self.turbine.health = math.min(100, self.turbine.health + 30)
    self.turbine.tripped = false
    self.turbine.vibration = 0
    self.turbine.axialShift = 0
  end
  self.turbineHealth = math.min(100, (self.turbine and self.turbine.health or self.turbineHealth) + 30)
  self.turbineFault = false
  self:log('good', '涡轮机检修。健康→' .. string.format('%.0f', self.turbineHealth) .. '%。')
end

function G:cmdSave()
  if not self.started then return end
  local ok, err = Save.save(self)
  if ok then
    self:toast('已保存', 'good')
    self:log('system', '[存] 进度已保存。')
  else
    self:toast('保存失败: ' .. tostring(err), 'danger')
  end
end

function G:cmdLoad()
  return Save.load(self)
end

function G:tick(hours)
  local skill = self:shiftSkill()
  local steps = math.ceil(hours / 0.5)
  local dtH = hours / steps
  for _ = 1, steps do
    local rep = self.r:step(dtH, skill)
    self:processRep(rep)
    if self.gameOver then return end

    self.thermal:step(self.r.power, self.seasonCoolIn, dtH)
    self.r.void = self.thermal.totalVoid

    self.turbine:step(self.r.power, dtH, function(a, b) return self.rng:range(a, b) end)
    if self.turbine.tripped then
      self.turbineFault = true
    end

    self.instruments:step({
      power_meter = self.r.power,
      neutron_flux = self.r.power / C.RATED_T * 100,
      thermocouple = self.thermal.zones[1].tFuel,
      pressure_p = self.thermal.pressure,
      flow_meter = self.thermal.coolantFlow,
      void_meter = self.thermal.totalVoid,
      rad_meter = self.rad,
      tachometer = self.turbine.speed,
      steam_p = self.turbine.steamPressure,
      fw_meter = self.turbine.fwFlow,
    }, dtH, function(a, b) return self.rng:range(a, b) end, C.DIFFS[self.diff].eventMul)

    if self.mission.active then
      self.mission:checkProgress(self)
    end
  end
  table.insert(self.trend, self.r.power)
  table.insert(self.xenonTrend, self.r.xenon)
  if #self.trend > self.trendMax then table.remove(self.trend, 1) end
  if #self.xenonTrend > self.trendMax then table.remove(self.xenonTrend, 1) end
  local pct = self.r.power / C.RATED_T * 100
  if pct > self.maxPowerPct then self.maxPowerPct = pct end
  if pct > 110 then self.wasOverpower = true end
  if self.wasOverpower and pct < 100 and pct > 0 then self.survivedOverpower = true; self.wasOverpower = false end
  if self.r.xenon > 0.8 then self.xenonPeakSeen = true end
  if self.xenonPeakSeen and self.r.xenon < 0.3 and self.r.state == 'POWER' then self.survivedXenonPeak = true; self.xenonPeakSeen = false end
  if self.r.state == 'SHUTDOWN' and self.scrams > 0 and not self.az5Survived then self.az5Survived = true end
  if self.turbine.tripped and not self.turbineFault then
    self.turbineFault = true
    self:log('danger', '[炸] 汽轮机跳闸！ТГ-4！电功率丧失！')
  end
  self.hour = self.hour + hours
  while self.hour >= 24 do
    self.hour = self.hour - 24
    self:newDay()
  end
  self.shift = (self.shift + math.floor(hours / 8)) % 3
  self:staffShift()
  self:dailyEcon(hours)
  self:degradeSafety()
  self:randomEvent()
  self:checkAchievements()
  self:checkEnd()
  if not self.mission.active and not self.mission.completed and self.mission:checkTrigger(self) then
    self.mission:start(self)
  end
end

function G:newDay()
  self.day = self.day + 1; self.daysOp = self.daysOp + 1; self.daysSinceEvent = self.daysSinceEvent + 1
  local season = C.SEASONS[self.month]
  if season == '冬' then self.seasonCoolIn = 255
  elseif season == '春' then self.seasonCoolIn = 265
  elseif season == '夏' then self.seasonCoolIn = 280
  else self.seasonCoolIn = 270 end
  self.r.coolIn = self.seasonCoolIn
  if self.day > 30 then
    self.day = 1; self.month = self.month + 1
    if self.month > 12 then self.month = 1; self.year = self.year + 1 end
    self:monthlyCheck()
  end
end

function G:shiftSkill()
  local on = {}
  for _, s in ipairs(self.staff) do
    if s.alive and s.shift == self.shift then table.insert(on, s) end
  end
  if #on == 0 then return 0.3 end
  local sum = 0
  for _, s in ipairs(on) do
    local eff = (s.skill / 10) * (1 - s.fatigue / 200) + ((s.morale - 50) / 200)
    sum = sum + math.max(0.1, math.min(1, eff))
  end
  return sum / #on
end

function G:staffShift()
  for _, s in ipairs(self.staff) do
    if not s.alive then goto continue end
    if s.shift == self.shift then
      s.fatigue = math.max(0, s.fatigue - 25)
      s.morale = math.min(100, s.morale + 4)
    else
      s.fatigue = math.min(100, s.fatigue + 12)
      if s.fatigue > 70 then s.morale = math.max(0, s.morale - 4) end
    end
    if self.rad > 0.1 and s.shift == self.shift then s.dose = s.dose + self.rad * 0.5 end
    if s.dose > 100 then
      s.alive = false
      self:log('danger', '[辐] ' .. s.name .. ' 累积剂量超标(' .. string.format('%.0f', s.dose) .. 'mSv)，强制离岗！')
    end
    ::continue::
  end
end

function G:dailyEcon(hours)
  local elec = self.turbine.electricPower
  local gen = elec * hours
  self.totalGen = self.totalGen + gen; self.quotaDone = self.quotaDone + gen
  local rev = gen * 1000 * 0.02
  local alive = 0; for _, s in ipairs(self.staff) do if s.alive then alive = alive + 1 end end
  local staffCost = alive * 800 / 30 * (hours / 24)
  local hasBad = false
  for _, s in ipairs(self.safety) do if s.status < 50 then hasBad = true break end end
  local maintCost = (hasBad and 5000 or 1000) * (hours / 24)
  local cost = gen * 3 + staffCost + maintCost + 20000 * (hours / 24)
  self.money = self.money + rev - cost
  if hours >= 8 then
    self:log('system', '结算：发电' .. self:fmt(gen) .. 'MWh，+' .. self:fmt(rev) .. '₽，-' .. self:fmt(cost) .. '₽。')
  end
end

function G:monthlyCheck()
  local season = C.SEASONS[self.month]
  if self.quotaDone >= self.quota then
    self.money = self.money + 500000
    self.politics = math.min(100, self.politics + 10)
    self:log('good', '[奖] 月度计划完成！+500,000₽，信任+10。')
    self:toast('月度计划完成！', 'good')
    if season == '冬' then self.winterQuotaDone = true end
  else
    self.politics = self.politics - C.DIFFS[self.diff].politicsDecay
    self:log('warn', '[未] 计划未完成(' .. self:fmt(self.quotaDone) .. '/' .. self:fmt(self.quota) .. ')。信任-' .. C.DIFFS[self.diff].politicsDecay .. '。')
    self:toast('月度计划未完成', 'warn')
    if self.politics < 30 then self:log('danger', '[急] 上级极度不满！可能被撤职！') end
  end
  self.quotaDone = 0
end

function G:degradeSafety()
  for _, s in ipairs(self.safety) do
    s.status = math.max(0, s.status - self.rng:range(0.3, 1.5))
  end
end

function G:randomEvent()
  if self.day == self.lastEventDay then return end
  local p = 0.1 * C.DIFFS[self.diff].eventMul
  local pct = self.r.power / C.RATED_T * 100
  if pct > 100 then p = p + 0.15 elseif pct > 80 then p = p + 0.05 end
  local orm = self.r:orm()
  if orm < C.ORM_CRIT then p = p + 0.2 elseif orm < C.ORM_MIN then p = p + 0.08 end
  local safetyAvg = 0
  for _, s in ipairs(self.safety) do safetyAvg = safetyAvg + s.status end
  safetyAvg = safetyAvg / #self.safety
  if safetyAvg < 50 then p = p + 0.12 end
  if self.turbineHealth < 40 then p = p + 0.08 end
  if self.rng:next() > p then return end
  self.lastEventDay = self.day; self.daysSinceEvent = 0
  local idx = self.rng:int(1, #self.EVENTS)
  self.pendingEvent = self.EVENTS[idx]
  self.incidents = self.incidents + 1
  self:processRep({alarms={}, warnings={'[讯] ' .. self.pendingEvent.title}})
end

function G:processRep(rep)
  for _, w in ipairs(rep.warnings or {}) do self:log('warn', '[警] ' .. w) end
  for _, a in ipairs(rep.alarms or {}) do self:log('danger', '[急] ' .. a) end
end

function G:checkEnd()
  if self.gameOver then return end
  if self.r.state == 'EXPLOSION' then
    self:disaster('AZ-5后功率失控，蒸汽爆炸掀翻2000吨屏蔽盖。')
  elseif self.r.state == 'MELTDOWN' then
    self:disaster('燃料>2800°C熔化，石墨燃烧，放射性直排。')
  elseif self.politics <= 0 then
    self.gameOver = true; self:showGameOver('上级信任归零。你被撤职，调往西伯利亚燃煤电厂。', 'normal')
  elseif self.money < -1000000 then
    self.gameOver = true; self:showGameOver('资金严重透支。财政部接管运营。', 'normal')
  end
end

function G:disaster(reason)
  self.gameOver = true
  self.rad = 5000
  self.flashAlpha = 1
  self.shakeTime = 0.7
  self.overReason = reason
  self.overType = 'disaster'
  self.overStats = {
    daysOp = self.daysOp,
    totalGen = self.totalGen,
    scrams = self.scrams,
    incidents = self.incidents,
    money = self.money,
    ach = #self.achievements,
  }
  self.screen = 'over'
end

function G:showGameOver(reason, typ)
  self.overReason = reason
  self.overType = typ
  self.screen = 'over'
  self.overStats = {
    daysOp = self.daysOp,
    totalGen = self.totalGen,
    scrams = self.scrams,
    incidents = self.incidents,
    money = self.money,
    ach = #self.achievements,
  }
  local score = self.daysOp * 10 + math.floor(self.totalGen / 100) + self.politics * 5 - self.incidents * 50 - self.scrams * 100 + #self.achievements * 100
  if score > 5000 then self.overRating = '[冠] 传奇站长'
  elseif score > 2000 then self.overRating = '[星] 优秀站长'
  elseif score > 500 then self.overRating = '[赞] 合格站长'
  elseif score > 0 then self.overRating = '[平] 平庸站长'
  else self.overRating = '[败] 失败站长' end
  self.overScore = score
  self.screen = 'over'
end

function G:hardReset()
  local seed = os.time()
  self:init(seed)
  self.thermal = Thermal.new()
  self.turbine = Turbine.new()
  self.instruments = Instruments.new()
  self.mission = Mission.new()
  local ok, info = pcall(love.filesystem.getInfo, 'save1')
  if ok and info then
    self._hasSave = true
  end
end

return G
