-- run2.lua — LÖVE 端测试入口（`love . test` 时由 main.lua 调用）
-- 与 headless.lua 共用 v2_tests.lua 用例；journal 走真实 love.filesystem。

local tests = {}

_G.T = {
  addTest = function(name, fn) tests[#tests + 1] = { name = name, fn = fn } end,
  assertNear = function(a, b, tol, msg)
    tol = tol or 1e-6
    if math.abs(a - b) > tol then
      error((msg or 'assertNear') .. string.format(' 期望 %s±%s, 实际 %s',
        tostring(b), tostring(tol), tostring(a)), 2)
    end
  end,
  assertEq = function(a, b, msg)
    if a ~= b then
      error((msg or 'assertEq') .. ' 期望 ' .. tostring(b) .. ', 实际 ' .. tostring(a), 2)
    end
  end,
  assertTrue = function(v, msg)
    if not v then error(msg or 'assertTrue 失败', 2) end
  end,
  seed = function(x)
    _seedState = x or 42
    math.random = function()
      _seedState = (_seedState * 1103515245 + 12345) % 2147483648
      return _seedState / 2147483648
    end
  end,
}

T.seed(42)
dofile(love.filesystem.getSource() .. '/tests/v2_tests.lua')

return function()
  local passed, failed = 0, 0
  for _, t in ipairs(tests) do
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
  return failed == 0
end
