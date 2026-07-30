-- golden-master checkpoints
-- Lua side: run ops, print checkpoints, compare with node output
local M = {}

local function fmt(v) return string.format('%.12g', v) end

function M.run()
  local RNG = require('src.physics.rng')
  local Reactor = require('src.physics.reactor')

  local function opScript(seed)
    local rng = RNG.new(seed)
    local r = Reactor.new(function(a,b) return rng:range(a,b) end)
    local out = {}
    local function cp(tag)
      table.insert(out, string.format('%s|%s|%s|%s|%s|%d', tag, fmt(r.power), fmt(r.xenon), fmt(r.void), fmt(r.fuelT), r:orm()))
    end
    r:moveRods(10); r.power = 50; r.state = 'POWER'
    cp('start')
    for i = 1, 40 do r:moveRods(15); r:step(0.25, 0.8) end
    cp('raise')
    for i = 1, 20 do r:step(0.5, 0.8) end
    cp('run')
    r:moveRods(-20)
    for i = 1, 10 do r:step(0.5, 0.8) end
    cp('down')
    local res = r:az5()
    table.insert(out, 'az5|' .. res)
    for i = 1, 20 do r:step(0.25, 0.8) end
    cp('scram')
    return table.concat(out, '\n')
  end

  local luaOut = opScript(42)
  print(luaOut)
  print('---GM_SPLIT---')
  -- node side will print similarly with same seed; compare manually
end

return M
