local Turbine = {}
Turbine.__index = Turbine

local RATED_STEAM_FLOW = 5400
local RATED_PRESSURE = 6.5
local RATED_TEMP = 280
local RATED_SPEED = 3000
local FW_TEMP = 220
local EFF = 0.3125

function Turbine.new()
  local self = setmetatable({}, Turbine)
  self:reset()
  return self
end

function Turbine:reset()
  self.online = false
  self.speed = 0
  self.steamPressure = 0
  self.steamTemp = 0
  self.steamFlow = 0
  self.fwFlow = 0
  self.fwTemp = FW_TEMP
  self.bypassValve = 0
  self.condenserVacuum = 0.005
  self.electricPower = 0
  self.tripped = false
  self.tripLockout = false

  self.health = 95
  self.vibration = 0
  self.axialShift = 0

  self._steamGenRate = 0
end

function Turbine:trip()
  if self.tripped then return end
  self.tripped = true
  self.tripLockout = true
  self.online = false
  self.electricPower = 0
end

function Turbine:resetTrip()
  self.tripped = false
  self.tripLockout = false
  self.speed = 0
end

function Turbine:step(reactorPower, dtH, rngFn)
  local rng = rngFn or function(a, b) return a + math.random() * (b - a) end

  if self.tripLockout and not self.tripped then
    self.tripLockout = false
  end

  if self.tripped then
    self.speed = math.max(0, self.speed - 100 * dtH)
    self.electricPower = 0
    self.steamFlow = 0
    self.steamPressure = math.max(0, self.steamPressure - 0.5 * dtH)
    return
  end

  local steamGen = reactorPower * EFF * 0.8
  self._steamGenRate = steamGen
  self.steamFlow = steamGen * 5.4
  self.steamPressure = RATED_PRESSURE * math.min(1.2, math.max(0.1, self.steamFlow / RATED_STEAM_FLOW))
  self.steamTemp = RATED_TEMP + (self.steamPressure - RATED_PRESSURE) * 10

  local toTurbine = self.steamFlow * (1 - self.bypassValve / 100)
  self.electricPower = math.max(0, toTurbine / RATED_STEAM_FLOW * reactorPower * EFF)
  self.fwFlow = self.steamFlow * 0.95

  self.condenserVacuum = 0.005 + math.max(0, (1 - self.fwFlow / RATED_STEAM_FLOW)) * 0.015
  if self.online then
    self.speed = RATED_SPEED
  else
    self.speed = math.min(RATED_SPEED, self.speed + 200 * dtH)
  end

  if reactorPower > 100 then
    self.health = math.max(0, self.health - (0.05 + rng(0, 0.2)) * dtH)
    self.vibration = self.vibration + (rng(-0.5, 0.5) + math.max(0, self.health - 50) * 0.01) * dtH
    self.vibration = math.max(0, math.min(15, self.vibration))
    self.axialShift = math.max(0, self.axialShift + (rng(-0.02, 0.02) + (1 - self.health / 100) * 0.005) * dtH)
  end

  if self.online then
    if self.speed > 3300 then self:trip() end
    if self.condenserVacuum > 0.02 then self:trip() end
    if self.vibration > 7 then self:trip() end
    if self.axialShift > 1.2 then self:trip() end
  end

  if self.health < 20 and not self.tripped then
    if rng(0, 1) < 0.05 * dtH then self:trip() end
  end
end

return Turbine
