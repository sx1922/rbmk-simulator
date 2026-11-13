-- equiv_check.lua — 与 web 引擎的种子化等价性对照（临时验证脚本，可随时重跑）
-- 用法：lua love/tests/equiv_check.lua
-- node 基准（同 LCG）：见 docs 或 tools；A/C 案例 web 与 lua 应逐位一致。

local scriptDir = arg and arg[0]:match('^(.*)[/\\]') or '.'
local root = scriptDir:match('^(.*)[/\\]love[/\\]tests$') or (scriptDir .. '/../..')
package.path = root .. '/love/?.lua;' .. root .. '/love/?/init.lua;' .. package.path

local s = 42
math.random = function()
  s = (s * 1103515245 + 12345) % 2147483648
  return s / 2147483648
end

local Engine = require('src.engine')

-- B 案例逐块对照：reset → advanceSim(60) → reset+initFullPower → 每 2 游戏秒采样 ×10
Engine.reset(); Engine.advanceSim(60)
Engine.reset(); Engine.initFullPower()
for i = 1, 10 do
  Engine.advanceSim(2)
  print(i - 1, string.format('n=%.6f void=%.4f flow=%.4f rho=%.6f sepL=%.4f t=%.1f',
    Engine.S.n, Engine.S.voidFrac, Engine.S.flow, Engine.S.rho, Engine.S.separator_level, Engine.S.t))
end
