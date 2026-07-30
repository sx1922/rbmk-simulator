local C = require('src.config')

local Reactor = {}
Reactor.__index = Reactor

function Reactor.new(rngFn)
  local self = setmetatable({}, Reactor)
  self.rng = rngFn
  self:reset()
  return self
end

function Reactor:reset()
  self.power = 0
  self.state = 'SHUTDOWN'
  self.rods = {}
  for i = 1, C.NUM_RODS do self.rods[i] = 99 end
  self.void = 0
  self.xenon = 0
  self.iodine = 0
  self.fuelT = 20
  self.coolOut = 270
  self.coolIn = 270
  self.graphiteT = 20
  self.flow = C.FLOW_RATED
  self.pumpsOn = 8
  self.reactivity = 0
  self.hours = 0
  self.az5Done = false
  self.az5Phase = 0
  self.az5Timer = 0
  self.refuelBonus = 0
end

function Reactor:orm()
  local n = 0
  for i = 1, C.NUM_RODS do
    if self.rods[i] < 90 then n = n + 1 end
  end
  return n
end

function Reactor:avgRod()
  local s = 0
  for i = 1, C.NUM_RODS do s = s + self.rods[i] end
  return s / C.NUM_RODS
end

function Reactor:moveRods(cnt)
  local d = cnt > 0 and -15 or 15
  local n = math.min(math.abs(cnt), C.NUM_RODS)
  local idx = {}
  for i = 1, C.NUM_RODS do idx[i] = i end
  if cnt > 0 then
    table.sort(idx, function(a, b) return self.rods[a] < self.rods[b] end)
  else
    table.sort(idx, function(a, b) return self.rods[a] > self.rods[b] end)
  end
  for i = 1, n do
    self.rods[idx[i]] = math.max(0, math.min(100, self.rods[idx[i]] + d))
  end
end

function Reactor:rodReactivity()
  local w = 0
  for i = 1, C.NUM_RODS do
    local p = self.rods[i]
    if p >= 99 then
    elseif p >= 80 then
      w = w + ((100 - p) / 20) * 0.0000167 / C.BETA
    else
      w = w + ((80 - p) / 80) * 0.0001 / C.BETA
    end
  end
  return w
end

function Reactor:voidReactivity()
  return self.void * 0.002 / C.BETA
end

function Reactor:xenonReactivity()
  return -self.xenon * 0.03 / C.BETA
end

function Reactor:tempReactivity()
  return -(self.fuelT - 300) * 0.00001 / C.BETA + (self.graphiteT - 300) * 0.000005 / C.BETA
end

function Reactor:step(dtH, skill)
  local out = {alarms = {}, warnings = {}}
  if self.state == 'MELTDOWN' or self.state == 'EXPLOSION' then
    return out
  end
  local pf = self.power / C.RATED_T
  self.iodine = math.max(0, self.iodine + (pf * 0.06 - self.iodine * 0.104) * dtH)
  self.xenon = math.max(0, self.xenon + (self.iodine * 0.104 + pf * 0.003 - self.xenon * 0.0757 - self.xenon * pf * 0.5) * dtH)
  if self.state == 'SCRAM' then
    self.az5Timer = self.az5Timer + dtH * 3600
    if self.az5Phase == 0 and self.az5Timer > 2 then
      self.az5Phase = 1; self:moveRods(-163)
    end
    if self.az5Phase == 1 and self.az5Timer > 8 then
      self.az5Phase = 2; self:moveRods(-163)
    end
    if self.az5Phase == 2 and self.az5Timer > 18 then
      self.az5Phase = 3; self:moveRods(-142)
    end
    if self.az5Phase >= 3 then
      self.power = self.power * math.pow(0.1, dtH * 4)
      if self.power < 1 then
        self.power = 0; self.state = 'SHUTDOWN'
        self.az5Done = false; self.az5Phase = 0; self.az5Timer = 0
      end
    else
      self.power = self.power * math.pow(0.5, dtH * 2)
    end
  end
  self.reactivity = self:rodReactivity() + self:voidReactivity() + self:xenonReactivity() + self:tempReactivity() + self.refuelBonus
  if self.state == 'SHUTDOWN' then
    self.power = self.power * math.pow(0.3, dtH)
    if self.power < 0.1 then self.power = 0 end
  elseif self.state ~= 'SCRAM' then
    if self.reactivity > 1 then
      local period = 0.1 / (self.reactivity - 1 + 0.001)
      self.power = self.power * math.min(10, 1 + dtH * 3600 / period)
      table.insert(out.alarms, '超临界！功率指数上升！')
    elseif self.reactivity > 0 then
      self.power = self.power * (1 + self.reactivity * dtH * 10)
    else
      self.power = math.max(0, self.power * (1 + self.reactivity * dtH * 5))
    end
  end
  if self.power > C.MELT_T then
    table.insert(out.alarms, '功率>3840MW(120%)！堆芯熔毁！')
    self.state = 'MELTDOWN'
    return out
  end
  local pf2 = self.power / C.RATED_T
  local tgt = 20 + pf2 * 350
  if self.power > C.RATED_T then
    tgt = tgt + (self.power - C.RATED_T) * 2
  end
  self.fuelT = self.fuelT + (tgt - self.fuelT) * math.min(1, dtH * 5)
  if self.flow > 0 then
    self.coolOut = self.coolIn + math.min(50, self.power * 1000 / (self.flow * 1.2))
  else
    self.coolOut = self.coolOut + pf2 * 50 * dtH
  end
  self.graphiteT = self.graphiteT + (20 + pf2 * 250 - self.graphiteT) * dtH * 0.1
  if self.coolOut >= C.SAT_T then
    self.void = math.min(0.8, (self.coolOut - C.SAT_T) / 50)
  else
    self.void = math.max(0, self.void - 0.02 * dtH * 10)
  end
  local pct = self.power / C.RATED_T * 100
  if pct > 0 and pct < C.LOW_PCT and self.state == 'POWER' then
    self.state = 'LOWPOW'
    table.insert(out.warnings, '进入低功率不稳定区(<20%)！功率剧烈波动！')
  elseif pct >= C.LOW_PCT and self.state == 'LOWPOW' then
    self.state = 'POWER'
  end
  if self.state == 'LOWPOW' then
    self.power = math.max(0, self.power * (1 + self.rng(-1, 1) * 0.12 * (1 - skill)))
  end
  if self.fuelT > 1200 then
    table.insert(out.alarms, '燃料温度>1200°C！锆水反应风险！')
  end
  if self.fuelT > 2800 then
    self.state = 'MELTDOWN'
    table.insert(out.alarms, '燃料熔化！堆芯熔毁！')
  end
  self.hours = self.hours + dtH
  return out
end

function Reactor:az5()
  if self.az5Done then return 'OK' end
  self.az5Done = true
  self.state = 'SCRAM'
  self.az5Phase = 0
  self.az5Timer = 0
  if self.void > 0.3 and self.power > C.RATED_T * 0.5 then
    self.power = self.power * (1 + self.void * 2)
    return 'SPIKE'
  end
  self.power = self.power * 0.7
  return 'OK'
end

return Reactor
