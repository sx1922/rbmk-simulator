local C = require('src.config')

local Thermal = {}
Thermal.__index = Thermal

local ZONE_COUNT = 5
local POWER_DIST = {0.30, 0.25, 0.22, 0.15, 0.08}
local ZONE_NAMES = {'中心区','内环','外环','边缘区','反射层'}
local R_FUEL = 0.5
local R_CLAD = 0.2
local CP = 4.2
local RHO = 700

function Thermal.new()
  local self = setmetatable({}, Thermal)
  self:reset()
  return self
end

function Thermal:reset()
  self.zones = {}
  for i = 1, ZONE_COUNT do
    self.zones[i] = {
      name = ZONE_NAMES[i],
      power = 0,
      tIn = 265,
      tOut = 265,
      void = 0,
      tFuel = 300,
      tClad = 280,
      dnbr = 5.0,
      boiling = false,
    }
  end
  self.totalVoid = 0
  self.coolantFlow = C.FLOW_RATED
  self.pumps = {}
  for i = 1, 8 do self.pumps[i] = true end
  self.pumpsOn = 8
  self.pressure = 7.0
  self.highestDnbr = 5.0
  self.lowestDnbr = 5.0
  self.boilingCrisis = false
  self.crisisTimer = 0
  self.flowPerZone = {}
  for i = 1, ZONE_COUNT do
    self.flowPerZone[i] = C.FLOW_RATED * POWER_DIST[i]
  end
end

function Thermal:setPumps(n)
  self.pumpsOn = math.max(0, math.min(8, n))
  self.coolantFlow = self.pumpsOn * C.FLOW_PER_PUMP
  for i = 1, ZONE_COUNT do
    self.flowPerZone[i] = self.coolantFlow * POWER_DIST[i]
  end
end

function Thermal:step(totalPower, coolIn, dtH)
  self.boilingCrisis = false
  self.highestDnbr = 0
  self.lowestDnbr = 99

  for i = 1, ZONE_COUNT do
    local z = self.zones[i]
    z.power = totalPower * POWER_DIST[i]
    local zoneFlow = self.flowPerZone[i]
    z.tIn = coolIn

    if zoneFlow > 0 and z.power > 0 then
      local deltaT = z.power * 3600 / (zoneFlow * RHO * CP / 1000)
      z.tOut = coolIn + math.min(100, deltaT)
    else
      z.tOut = coolIn + z.power * 0.05 * dtH
    end

    if z.tOut > C.SAT_T then
      z.void = math.min(1.0, (z.tOut - C.SAT_T) / 50)
    else
      z.void = math.max(0, z.void - 0.02 * dtH * 10)
    end
    z.boiling = z.void > 0.01

    z.tClad = (z.tIn + z.tOut) / 2 + z.power * R_CLAD / 10
    z.tFuel = z.tClad + z.power * R_FUEL / 10

    local qDNB = 1.5
    local qActual = math.max(0.01, z.power / 10)
    z.dnbr = qDNB / qActual

    if z.dnbr > self.highestDnbr then self.highestDnbr = z.dnbr end
    if z.dnbr < self.lowestDnbr then self.lowestDnbr = z.dnbr end

    if z.dnbr < 1.0 then
      self.boilingCrisis = true
    end
  end

  local sum = 0
  for i = 1, ZONE_COUNT do sum = sum + self.zones[i].void end
  self.totalVoid = sum / ZONE_COUNT
end

function Thermal:getZone(i)
  return self.zones[i]
end

function Thermal:getBoilingZones()
  local result = {}
  for i = 1, ZONE_COUNT do
    if self.zones[i].boiling then table.insert(result, i) end
  end
  return result
end

Thermal.ZONE_COUNT = ZONE_COUNT
Thermal.ZONE_NAMES = ZONE_NAMES

return Thermal
