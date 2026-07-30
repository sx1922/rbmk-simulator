local Instruments = {}
Instruments.__index = Instruments

local INST_DEFS = {
  {id='power_meter',  name='热功率计', delay=2.0, accuracy=0.02, faultRate=0.03, range={0, 5000}},
  {id='neutron_flux', name='中子通量计', delay=1.0, accuracy=0.05, faultRate=0.05, range={0, 150}},
  {id='thermocouple', name='堆芯热电偶', delay=5.0, accuracy=10, faultRate=0.08, range={0, 3000}},
  {id='pressure_p',  name='一回路压力表', delay=1.0, accuracy=0.1, faultRate=0.02, range={0, 12}},
  {id='flow_meter',  name='冷却剂流量计', delay=3.0, accuracy=0.03, faultRate=0.04, range={0, 60000}},
  {id='void_meter',  name='空泡计', delay=4.0, accuracy=0.05, faultRate=0.06, range={0, 1}},
  {id='rad_meter',   name='辐射计', delay=2.0, accuracy=0.1, faultRate=0.03, range={0, 10000}},
  {id='tachometer',  name='汽轮机转速表', delay=0.5, accuracy=10, faultRate=0.01, range={0, 4000}},
  {id='steam_p',     name='蒸汽压力表', delay=1.0, accuracy=0.05, faultRate=0.02, range={0, 10}},
  {id='fw_meter',    name='给水流量计', delay=2.0, accuracy=0.03, faultRate=0.03, range={0, 7000}},
}

local FAULT_MODES = {'stuck', 'drift', 'spike', 'dead'}

function Instruments.new()
  local self = setmetatable({}, Instruments)
  self:reset()
  return self
end

function Instruments:reset()
  self.insts = {}
  for _, def in ipairs(INST_DEFS) do
    self.insts[def.id] = {
      def = def,
      raw = 0,
      displayed = 0,
      delayed = 0,
      buffer = {},
      fault = nil,
      faultTimer = 0,
      driftOffset = 0,
      lastCalibration = 0,
    }
  end
  self.hoursSinceCal = 0
end

function Instruments:step(realValues, dtH, rngFn, faultMul)
  local rng = rngFn or function(a, b) return a + math.random() * (b - a) end
  local fm = faultMul or 1
  self.hoursSinceCal = self.hoursSinceCal + dtH

  for id, inst in pairs(self.insts) do
    local def = inst.def
    local real = realValues[id] or 0
    inst.raw = real

    if inst.fault then
      inst.faultTimer = inst.faultTimer - dtH
      if inst.faultTimer <= 0 then
        inst.fault = nil
        inst.driftOffset = 0
      end
      if inst.fault == 'stuck' then
      elseif inst.fault == 'drift' then
        inst.driftOffset = inst.driftOffset + rng(-0.5, 0.5) * dtH * 2
      elseif inst.fault == 'spike' then
        if rng(0, 1) < 0.3 * dtH then
          inst.displayed = real + (rng(0, 1) > 0.5 and 1 or -1) * def.range[2] * 0.5
        end
      elseif inst.fault == 'dead' then
        inst.displayed = -1
      end
      if inst.fault ~= 'dead' and inst.fault ~= 'spike' then
        inst.displayed = inst.delayed + inst.driftOffset
      end
    else
      table.insert(inst.buffer, real)
      if #inst.buffer > math.ceil(def.delay / 0.5) then
        table.remove(inst.buffer, 1)
      end
      if #inst.buffer > 0 then
        inst.delayed = inst.buffer[math.ceil(#inst.buffer / 2)]
      else
        inst.delayed = real
      end

      local acc = def.accuracy
      local noise = real * rng(-acc, acc) * 0.3
      inst.displayed = inst.delayed + noise
      inst.displayed = math.max(def.range[1], math.min(def.range[2], inst.displayed))
    end

    if not inst.fault then
      local faultProb = def.faultRate * fm * (1 + self.hoursSinceCal / 720) * dtH / 8
      if rng(0, 1) < faultProb then
        inst.fault = FAULT_MODES[rng(0, 0.999) * #FAULT_MODES + 1]
        inst.faultTimer = rng(1, 6)
        inst.driftOffset = 0
      end
    end
  end
end

function Instruments:calibrate()
  for _, inst in pairs(self.insts) do
    inst.fault = nil
    inst.driftOffset = 0
    inst.buffer = {}
  end
  self.hoursSinceCal = 0
end

function Instruments:getDisplay(id)
  local inst = self.insts[id]
  if not inst then return nil end
  if inst.fault == 'dead' then return nil end
  return inst.displayed
end

function Instruments:hasFault(id)
  local inst = self.insts[id]
  return inst and inst.fault ~= nil
end

function Instruments:getFault(id)
  local inst = self.insts[id]
  return inst and inst.fault
end

function Instruments:getRaw(id)
  local inst = self.insts[id]
  return inst and inst.raw
end

return Instruments
