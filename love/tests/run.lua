local M = {}

local function assertNear(a, b, tol)
  tol = tol or 1e-12
  if math.abs(a - b) > tol then
    error(string.format('断言失败: %s != %s (tol=%s)', tostring(a), tostring(b), tostring(tol)), 2)
  end
end

local function assertEq(a, b)
  if a ~= b then
    error(string.format('断言失败: %s != %s', tostring(a), tostring(b)), 2)
  end
end

local tests = {}
local passed = 0; local failed = 0

local function addTest(name, fn)
  table.insert(tests, {name=name, fn=fn})
end

addTest('确定性与重放', function()
  local RNG = require('src.physics.rng')
  local Reactor = require('src.physics.reactor')
  -- 两次相同种子得到相同结果
  local function run(seed)
    local rng = RNG.new(seed)
    local r = Reactor.new(function(a,b) return rng:range(a,b) end)
    r:moveRods(10); r.power = 50; r.state = 'POWER'
    for _ = 1, 20 do r:moveRods(15); r:step(0.25, 0.8) end
    for _ = 1, 10 do r:step(0.5, 0.8) end
    r:az5()
    for _ = 1, 10 do r:step(0.25, 0.8) end
    return {r.power, r.xenon, r.void, r.fuelT, r:orm(), r.reactivity}
  end
  local a = run(42)
  local b = run(42)
  for i = 1, #a do
    assertNear(a[i], b[i], 1e-12)
  end
end)

addTest('氙毒积累', function()
  local Reactor = require('src.physics.reactor')
  local r = Reactor.new(function(a,b) return 0 end)
  r.iodine = 1.0; r.xenon = 0.1
  r.power = 50; r.state = 'POWER'
  r.void = 0.8; r.flow = 48000; r.coolOut = 290
  for i = 1, 211 do r.rods[i] = 95 end
  for _ = 1, 30 do r:step(0.5, 0.8) end
  assertEq(r.xenon > 0.2, true)
  for _ = 1, 60 do r:step(0.5, 0.8) end
  assertEq(r.xenon < 0.5, true)
end)

addTest('AZ-5 正尖峰', function()
  local Reactor = require('src.physics.reactor')
  local r = Reactor.new(function(a,b) return a + 0.5 * (b - a) end) -- deterministic no-range
  r.power = 2000; r.void = 0.5
  local res = r:az5()
  assertEq(res, 'SPIKE')
  assertEq(r.power > 2000, true) -- 尖峰后功率更高
  assertEq(r.state, 'SCRAM')
end)

addTest('AZ-5 正常停堆(无尖峰)', function()
  local Reactor = require('src.physics.reactor')
  local r = Reactor.new(function(a,b) return 0.5 end)
  r.power = 500; r.void = 0.1
  local res = r:az5()
  assertEq(res, 'OK')
  assertEq(r.power < 500, true)
end)

addTest('熔毁阈值', function()
  local Reactor = require('src.physics.reactor')
  local r = Reactor.new(function(a,b) return 0.5 end)
  r.power = 3900; r.state = 'POWER'
  local out = r:step(0.1, 0.8)
  assertEq(r.state, 'MELTDOWN')
  local hasAlarm = false
  for _, a in ipairs(out.alarms) do if a:find('熔毁') then hasAlarm = true end end
  assertEq(hasAlarm, true)
end)

addTest('ORM 计数', function()
  local Reactor = require('src.physics.reactor')
  local r = Reactor.new(nil)
  for i = 1, 211 do r.rods[i] = 100 end
  assertEq(r:orm(), 0)
  r.rods[1] = 89; r.rods[2] = 50
  assertEq(r:orm(), 2)
end)

addTest('存档/读档 回环', function()
  local G = require('src.state')
  local Save = require('src.save.save')
  G:init(12345)
  G:begin()
  G:cmdMoveRods(15)
  G:cmdMoveRods(15)
  G:cmdAdvanceShift()
  local saveOk = Save.save(G)
  assertEq(saveOk, true)
  local G2 = require('src.state')
  G2:init(99999)
  assertEq(G2.money, 5000000)
  local loadOk = Save.load(G2)
  assertEq(loadOk, true)
  assertEq(G2.money, G.money)
  assertEq(G2.r.power, G.r.power)
  assertEq(G2.r.xenon, G.r.xenon)
  assertEq(G2.r:orm(), G.r:orm())
end)

addTest('模组加载', function()
  -- create temp mod file in save dir
  local modContent = [[return {
    name = 'test_mod',
    events = {{
      icon='🧪', title='测试事件', desc='test',
      choices={{label='ok',fx=function(G) G:log('info','test ok') end}}
    }},
  }]]
  love.filesystem.createDirectory('mods')
  love.filesystem.write('mods/_test_mod.lua', modContent)
  local G = require('src.state')
  G:init(1)
  local origCount = #G.EVENTS
  pcall(require('src.systems.mods').scan, G)
  assertEq(#G.EVENTS, origCount + 1)
  love.filesystem.remove('mods/_test_mod.lua')
end)

function M.run()
  for _, t in ipairs(tests) do
    local ok, err = pcall(t.fn)
    if ok then
      print('[PASS] ' .. t.name)
      passed = passed + 1
    else
      print('[FAIL] ' .. t.name .. ': ' .. tostring(err))
      failed = failed + 1
    end
  end
  print(string.format('\n%d passed, %d failed out of %d', passed, failed, #tests))
  return failed == 0
end

return M
