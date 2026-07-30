local Theme = {
  bg = {0.18, 0.20, 0.23},
  panel = {0.16, 0.18, 0.21},
  panel2 = {0.20, 0.22, 0.25},
  edge = {0.227, 0.255, 0.294},
  edgeLo = {0.12, 0.14, 0.16},
  amber = {1, 0.706, 0.227},
  amberDim = {0.541, 0.384, 0.125},
  red = {1, 0.267, 0.22},
  redDeep = {0.761, 0.165, 0.125},
  green = {0.263, 0.851, 0.482},
  cyan = {0.31, 0.847, 0.878},
  blue = {0.29, 0.62, 1},
  txt = {0.95, 0.94, 0.91},
  txtDim = {0.75, 0.76, 0.78},
  txtFaint = {0.58, 0.60, 0.62},
  panel3 = {0.14, 0.16, 0.18},
  panel4 = {0.10, 0.12, 0.14},
}

Theme.fontSizes = {}
local baseScale = 1
local primaryData = nil
local Layout = nil

function Theme.loadFonts(scale)
  baseScale = scale or 1
  local paths = {'assets/fonts/simhei_fb.ttf', 'simhei_fb.ttf', 'assets/fonts/simhei.ttf', 'simhei.ttf'}
  for _, p in ipairs(paths) do
    local info = love.filesystem.getInfo(p)
    if info then
      local ok, content = pcall(love.filesystem.read, p)
      if ok and content and #content > 0 then
        primaryData = love.filesystem.newFileData(content, 'simhei.ttf')
        local ok2, font = pcall(love.graphics.newFont, primaryData, 14)
        if ok2 and font then font:release(); break end
      end
    end
  end
end

function Theme.getFont(size)
  if not Layout then Layout = require('src.ui.layout') end
  local invScale = (Layout.scale and Layout.scale > 0) and (1 / Layout.scale) or 1
  if invScale > 3 then invScale = 3 end
  if invScale < 1 then invScale = 1 end
  local sz = math.floor(size * baseScale * invScale + 0.5)
  if sz < 6 then sz = 6 end
  if Theme.fontSizes[sz] then return Theme.fontSizes[sz] end
  local font
  if primaryData then
    local ok, f = pcall(love.graphics.newFont, primaryData, sz)
    if ok then font = f end
  end
  if not font then font = love.graphics.newFont(sz) end
  Theme.fontSizes[sz] = font
  return font
end

function Theme.text(str, size, align)
  love.graphics.setFont(Theme.getFont(size))
  if align == 'center' then
    local w = love.graphics.getFont():getWidth(str)
    love.graphics.print(str, -w/2, 0)
  elseif align == 'right' then
    local w = love.graphics.getFont():getWidth(str)
    love.graphics.print(str, -w, 0)
  else
    love.graphics.print(str, 0, 0)
  end
end



return Theme
