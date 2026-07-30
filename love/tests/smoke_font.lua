local M = {}

-- Smoke test: verify all special characters, CJK, and emoji render

function M.run()
  Theme = require('src.ui.theme')
  Layout = require('src.ui.layout')
  Theme.loadFonts(1)

  local winW, winH = love.graphics.getDimensions()
  Layout.calc(winW, winH)

  local canvas = love.graphics.newCanvas(256, 32)
  local allPass = true

  local function testChar(ch, name, category)
    local font = Theme.getFont(12)
    love.graphics.setCanvas(canvas)
    love.graphics.clear(0, 0, 0, 0)
    love.graphics.setColor(1, 1, 1)
    love.graphics.setFont(font)
    love.graphics.printf(ch, 0, 0, 256)
    love.graphics.setCanvas()
    local w = font:getWidth(ch)
    local h = font:getHeight()
    local status = '[PASS]'
    if w == 0 then status = '[FAIL]'; allPass = false end
    local prefix = category and (category .. ' ') or ''
    print(string.format('  %s %s%s w=%d h=%d', status, prefix, name, w, h))
  end

  local specialChars = {
    {'₽', 'rub sign'}, {'✓', 'check mark'}, {'−', 'minus'},
    {'«', 'laquo'}, {'»', 'raquo'},
    {'→', 'arrow r'}, {'↑', 'arrow u'}, {'↓', 'arrow d'},
    {'●', 'bullet'}, {'▲', 'triangle u'}, {'▼', 'triangle d'},
    {'°', 'degree'}, {'≥', 'geq'},
    {'α', 'alpha'}, {'ρ', 'rho'}, {'β', 'beta'},
    {'·', 'middot'}, {'—', 'emdash'}, {'…', 'hellip'}, {'´', 'acute'},
    {'★', 'star'}, {'⚡', 'high voltage'}, {'⏻', 'power symbol'},
  }
  for _, entry in ipairs(specialChars) do
    testChar(entry[1], entry[2], nil)
  end

  local cjk = {
    {'中', 'center'}, {'国', 'country'},
    {'资金', 'money'}, {'反应堆', 'reactor'},
  }
  for _, entry in ipairs(cjk) do
    testChar(entry[1], entry[2], 'CJK')
  end

  local emoji = {
    {'🧪', 'test tube'}, {'⚠', 'warning'}, {'☢', 'radioactive'},
    {'☣', 'biohazard'}, {'🔴', 'red circle'}, {'🟢', 'green circle'},
    {'🟡', 'yellow circle'}, {'⬆', 'up arrow'}, {'⬇', 'down arrow'},
    {'🔥', 'fire'}, {'💀', 'skull'},
  }
  for _, entry in ipairs(emoji) do
    testChar(entry[1], entry[2], 'emoji')
  end

  print('---')
  if allPass then
    print('[PASS] 所有字符渲染正常')
  else
    print('[WARN] 部分字符可能显示为方格（回退字体缺字形）')
  end

  canvas:release()
  for _, f in pairs(Theme.fontSizes) do f:release() end
  Theme.fontSizes = {}

  return allPass
end

return M
