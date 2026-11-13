-- headless.lua — 无 LÖVE 二进制的 headless 测试引导
-- 运行：lua love/tests/headless.lua   （Lua 5.1 / LuaJIT）
-- 原理：注入 love.* 最小 stub（filesystem 落盘到临时目录），然后跑测试套件。

local scriptDir = arg and arg[0] and arg[0]:match('^(.*)[/\\]') or '.'
local root = scriptDir:match('^(.*)[/\\]love[/\\]tests$') or (scriptDir .. '/../..')
-- require('src.engine') 解析为 src/engine.lua，因此模板挂在 love/ 目录层
package.path = root .. '/love/?.lua;' .. root .. '/love/?/init.lua;' .. package.path

-- ---- love.filesystem stub（临时目录） ----
local fsDir = (os.getenv('TEMP') or os.getenv('TMP') or '/tmp')
  .. '/rbmk_love_test_fs_' .. tostring(os.time()) .. '_' .. tostring(math.random(1000, 9999))
os.execute('mkdir "' .. fsDir:gsub('/', '\\') .. '" 2>nul')

_G.love = {
  filesystem = {
    getInfo = function(p)
      local f = io.open(fsDir .. '/' .. p, 'rb')
      if f then f:close() return {} end
      return nil
    end,
    read = function(p)
      local f = io.open(fsDir .. '/' .. p, 'rb')
      if not f then return nil end
      local d = f:read('*a')
      f:close()
      return d
    end,
    write = function(p, d)
      local f = assert(io.open(fsDir .. '/' .. p, 'wb'))
      f:write(d)
      f:close()
      return true
    end,
    remove = function(p) os.remove(fsDir .. '/' .. p) end,
  },
}

-- ---- 微型测试框架 ----
local tests, failed = {}, 0

local function addTest(name, fn)
  tests[#tests + 1] = { name = name, fn = fn }
end

local function assertNear(a, b, tol, msg)
  tol = tol or 1e-6
  if math.abs(a - b) > tol then
    error((msg or 'assertNear') .. string.format(' 期望 %s±%s, 实际 %s', tostring(b), tostring(tol), tostring(a)), 2)
  end
end

local function assertEq(a, b, msg)
  if a ~= b then
    error((msg or 'assertEq') .. ' 期望 ' .. tostring(b) .. ', 实际 ' .. tostring(a), 2)
  end
end

local function assertTrue(v, msg)
  if not v then error(msg or 'assertTrue 失败', 2) end
end

_G.T = {
  addTest = addTest,
  assertNear = assertNear,
  assertEq = assertEq,
  assertTrue = assertTrue,
}

-- 种子化随机（与 web 基准同 LCG；每个引擎测试开头 T.seed(42) 保证确定性）
local seedState = 42
function T.seed(x)
  seedState = x or 42
  math.random = function()
    seedState = (seedState * 1103515245 + 12345) % 2147483648
    return seedState / 2147483648
  end
end
T.seed(42)

-- ---- 载入测试套件 ----
dofile(root .. '/love/tests/v2_tests.lua')

-- ---- 执行 ----
local passed = 0
for i = 1, #tests do
  local t = tests[i]
  local ok, err = pcall(t.fn)
  if ok then
    passed = passed + 1
    print('[PASS] ' .. t.name)
  else
    failed = failed + 1
    print('[FAIL] ' .. t.name)
    print('       ' .. tostring(err))
  end
end

print(string.format('%d passed, %d failed out of %d', passed, failed, #tests))
os.exit(failed == 0 and 0 or 1)
