local S = {}

local function serialize(v)
  local t = type(v)
  if t == 'number' or t == 'boolean' then
    return tostring(v)
  elseif t == 'string' then
    return string.format('%q', v)
  elseif t == 'table' then
    local parts = {}
    local arr = true
    for k in pairs(v) do
      if type(k) ~= 'number' or k < 1 or k > #v or k ~= math.floor(k) then
        arr = false; break
      end
    end
    for k, val in pairs(v) do
      local sval = serialize(val)
      if arr then
        table.insert(parts, sval)
      else
        table.insert(parts, '[' .. serialize(k) .. ']=' .. sval)
      end
    end
    return '{' .. table.concat(parts, ',') .. '}'
  else
    return 'nil'
  end
end

local function migrate(save)
  local v = save.v or 1
  if v < 1 then
  end
  if v < 2 then
    save.turb = save.turb or {online=false,speed=0,steamPressure=0,steamTemp=0,steamFlow=0,fwFlow=0,bypassValve=0,condenserVacuum=0.005,electricPower=0,tripped=false,health=95,vibration=0,axialShift=0}
    save.therm = save.therm or {totalVoid=0,coolantFlow=48000,pumpsOn=8,zones={}}
    for i = 1, 5 do
      save.therm.zones[i] = save.therm.zones[i] or {power=0,tIn=265,tOut=265,void=0,tFuel=300,tClad=280,dnbr=5.0,boiling=false}
    end
    save.mission = save.mission or {active=false,phase='idle',completed=false,failed=false}
  end
  save.v = 2
  return save
end

function S.save(G)
  local data = {
    v=2, money=G.money, politics=G.politics, diff=G.diff,
    day=G.day, hour=G.hour, month=G.month, year=G.year,
    daysOp=G.daysOp, totalGen=G.totalGen, scrams=G.scrams, incidents=G.incidents,
    quotaDone=G.quotaDone, rad=G.rad, shift=G.shift,
    trend=G.trend, xenonTrend=G.xenonTrend,
    staff=G.staff, safety=G.safety, fuelBurn=G.fuelBurn,
    achievements={}, totalCrits=G.totalCrits, maxPowerPct=G.maxPowerPct,
    survivedXenonPeak=G.survivedXenonPeak, az5Survived=G.az5Survived,
    survivedOverpower=G.survivedOverpower, winterQuotaDone=G.winterQuotaDone,
    turbineHealth=G.turbineHealth, turbineFault=G.turbineFault,
    daysSinceEvent=G.daysSinceEvent,
    r={power=G.r.power, state=G.r.state, rods=G.r.rods, void=G.r.void,
       xenon=G.r.xenon, iodine=G.r.iodine, fuelT=G.r.fuelT, coolOut=G.r.coolOut,
       coolIn=G.r.coolIn, graphiteT=G.r.graphiteT, flow=G.r.flow, pumpsOn=G.r.pumpsOn,
       hours=G.r.hours, az5Done=G.r.az5Done, az5Phase=G.r.az5Phase, az5Timer=G.r.az5Timer},
    turb={online=G.turbine.online,speed=G.turbine.speed,steamPressure=G.turbine.steamPressure,steamTemp=G.turbine.steamTemp,steamFlow=G.turbine.steamFlow,fwFlow=G.turbine.fwFlow,bypassValve=G.turbine.bypassValve,condenserVacuum=G.turbine.condenserVacuum,electricPower=G.turbine.electricPower,tripped=G.turbine.tripped,health=G.turbine.health,vibration=G.turbine.vibration,axialShift=G.turbine.axialShift},
    therm={totalVoid=G.thermal.totalVoid,coolantFlow=G.thermal.coolantFlow,pumpsOn=G.thermal.pumpsOn,zones={}},
    mission={active=G.mission.active,phase=G.mission.phase,completed=G.mission.completed,failed=G.mission.failed},
  }
  for i, z in ipairs(G.thermal.zones) do
    data.therm.zones[i] = {power=z.power,tIn=z.tIn,tOut=z.tOut,void=z.void,tFuel=z.tFuel,tClad=z.tClad,dnbr=z.dnbr,boiling=z.boiling}
  end
  for _, v in ipairs(G.achievements) do table.insert(data.achievements, v) end
  local str = 'return ' .. serialize(data)
  local ok, err = love.filesystem.write('save1', str)
  if ok then return true else return false, err end
end

function S.load(G)
  local ok, raw = pcall(love.filesystem.read, 'save1')
  if not ok or not raw then return false end
  local fn, err = loadstring(raw)
  if not fn then return false, err end
  setfenv(fn, {})
  local ok2, data = pcall(fn)
  if not ok2 or type(data) ~= 'table' then return false end
  data = migrate(data)
  G.money=data.money; G.politics=data.politics; G.diff=data.diff or 2
  G.day=data.day; G.hour=data.hour; G.month=data.month; G.year=data.year
  G.daysOp=data.daysOp; G.totalGen=data.totalGen; G.scrams=data.scrams; G.incidents=data.incidents
  G.quotaDone=data.quotaDone; G.rad=data.rad; G.shift=data.shift
  G.trend=data.trend or {}; G.xenonTrend=data.xenonTrend or {}
  G.staff=data.staff; G.safety=data.safety; G.fuelBurn=data.fuelBurn
  G.achievements={}
  for _, v in ipairs(data.achievements or {}) do table.insert(G.achievements, v) end
  G.totalCrits=data.totalCrits or 0; G.maxPowerPct=data.maxPowerPct or 0
  G.survivedXenonPeak=data.survivedXenonPeak or false; G.az5Survived=data.az5Survived or false
  G.survivedOverpower=data.survivedOverpower or false; G.winterQuotaDone=data.winterQuotaDone or false
  G.turbineHealth=data.turbineHealth or 95; G.turbineFault=data.turbineFault or false
  G.daysSinceEvent=data.daysSinceEvent or 0
  if data.r then
    local C = require('src.config')
    local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end
    G.r.power = clamp(data.r.power or 0, 0, C.MELT_T * 1.5)
    G.r.state = data.r.state or 'SHUTDOWN'
    if data.r.rods then for i=1,C.NUM_RODS do G.r.rods[i] = clamp(data.r.rods[i] or 100, 0, 100) end end
    G.r.void = clamp(data.r.void or 0, 0, 1)
    G.r.xenon = clamp(data.r.xenon or 0, 0, 5)
    G.r.iodine = clamp(data.r.iodine or 0, 0, 5)
    G.r.fuelT = clamp(data.r.fuelT or 20, 0, 3000)
    G.r.coolOut = clamp(data.r.coolOut or 270, 0, 400)
    G.r.coolIn = clamp(data.r.coolIn or 270, 0, 400)
    G.r.graphiteT = clamp(data.r.graphiteT or 20, 0, 3000)
    G.r.flow = clamp(data.r.flow or C.FLOW_RATED, 0, C.FLOW_RATED)
    G.r.pumpsOn = math.floor(clamp(data.r.pumpsOn or 8, 0, 8))
    G.r.hours = data.r.hours or 0
    G.r.az5Done = data.r.az5Done or false
    G.r.az5Phase = data.r.az5Phase or 0
    G.r.az5Timer = data.r.az5Timer or 0
    G.r.refuelBonus = data.r.refuelBonus or 0
    G.r.reactivity = 0
  end
  if data.turb then
    local t = data.turb
    G.turbine.online = t.online or false; G.turbine.speed = t.speed or 0
    G.turbine.steamPressure = t.steamPressure or 0; G.turbine.steamTemp = t.steamTemp or 0
    G.turbine.steamFlow = t.steamFlow or 0; G.turbine.fwFlow = t.fwFlow or 0
    G.turbine.bypassValve = t.bypassValve or 0; G.turbine.condenserVacuum = t.condenserVacuum or 0.005
    G.turbine.electricPower = t.electricPower or 0; G.turbine.tripped = t.tripped or false
    G.turbine.health = t.health or 95; G.turbine.vibration = t.vibration or 0
    G.turbine.axialShift = t.axialShift or 0
  end
  if data.therm then
    G.thermal.totalVoid = data.therm.totalVoid or 0
    G.thermal.coolantFlow = data.therm.coolantFlow or C.FLOW_RATED
    G.thermal.pumpsOn = data.therm.pumpsOn or 8
    for i, zd in ipairs(data.therm.zones or {}) do
      if G.thermal.zones[i] then
        G.thermal.zones[i].power = zd.power or 0; G.thermal.zones[i].tIn = zd.tIn or 265
        G.thermal.zones[i].tOut = zd.tOut or 265; G.thermal.zones[i].void = zd.void or 0
        G.thermal.zones[i].tFuel = zd.tFuel or 300; G.thermal.zones[i].tClad = zd.tClad or 280
        G.thermal.zones[i].dnbr = zd.dnbr or 5.0; G.thermal.zones[i].boiling = zd.boiling or false
      end
    end
  end
  if data.mission then
    G.mission.active = data.mission.active or false
    G.mission.phase = data.mission.phase or 'idle'
    G.mission.completed = data.mission.completed or false
    G.mission.failed = data.mission.failed or false
  end
  G:log('system', '[载] 已载入存档。')
  return true
end

return S
