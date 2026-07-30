local Theme = require('src.ui.theme')
local W = {mouse={x=0,y=0,down=false,pressed=false,released=false,wheel=0}}

function W.beginFrame(mx, my, mdown, mpressed, mreleased, mwheel)
  W.mouse.x = mx; W.mouse.y = my
  W.mouse.down = mdown; W.mouse.pressed = mpressed; W.mouse.released = mreleased
  W.mouse.wheel = mwheel
end

function W.endFrame()
  W.mouse.pressed = false; W.mouse.released = false; W.mouse.wheel = 0
end

local function hit(x, y, w, h)
  local mx, my = W.mouse.x, W.mouse.y
  return mx >= x and mx <= x + w and my >= y and my <= y + h
end

function W.button(id, x, y, w, h, label, sub, style)
  local hover = hit(x, y, w, h)
  local clicked = hover and W.mouse.pressed
  local bg
  if style == 'amber' then bg = {0.788, 0.541, 0.165, 1}
  elseif style == 'green' then bg = {0.165, 0.541, 0.322, 1}
  elseif style == 'cyan' then bg = {0.165, 0.478, 0.541, 1}
  elseif style == 'danger' then bg = {0.627, 0.188, 0.157, 1}
  else bg = {0.227, 0.255, 0.294, 1} end
  if hover then
    bg[1] = bg[1] + 0.08; bg[2] = bg[2] + 0.08; bg[3] = bg[3] + 0.08
  end
  love.graphics.setColor(bg)
  love.graphics.rectangle('fill', x, y, w, h, 4)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 4)
  love.graphics.setColor(Theme.txt)
  local tx = x + w/2; local ty = y + h/2 - 4
  if sub then ty = y + h/2 - 7 end
  love.graphics.setFont(Theme.getFont(11))
  local tw = love.graphics.getFont():getWidth(label)
  love.graphics.print(label, tx - tw/2, ty)
  if sub then
    love.graphics.setFont(Theme.getFont(8))
    love.graphics.setColor(Theme.txtFaint[1], Theme.txtFaint[2], Theme.txtFaint[3], 0.7)
    local sw = love.graphics.getFont():getWidth(sub)
    love.graphics.print(sub, tx - sw/2, y + h/2 + 1)
  end
  return clicked
end

function W.bigButton(id, x, y, w, h, label, style)
  local hover = hit(x, y, w, h)
  local clicked = hover and W.mouse.pressed
  local bg
  if style == 'amber' then bg = {0.788, 0.541, 0.165}
  else bg = {0.627, 0.188, 0.157} end
  if hover then bg[1] = bg[1] + 0.1; bg[2] = bg[2] + 0.1; bg[3] = bg[3] + 0.1 end
  love.graphics.setColor(bg)
  love.graphics.rectangle('fill', x, y, w, h, 8)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', x, y, w, h, 8)
  love.graphics.setColor(1, 1, 1)
  love.graphics.setFont(Theme.getFont(15))
  local tw = love.graphics.getFont():getWidth(label)
  love.graphics.print(label, x + w/2 - tw/2, y + h/2 - 8)
  return clicked
end

function W.closeButton(x, y, s)
  local hover = hit(x, y, s, s) and W.mouse.pressed
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setLineWidth(2)
  local m = s * 0.25
  love.graphics.line(x + m, y + m, x + s - m, y + s - m)
  love.graphics.line(x + s - m, y + m, x + m, y + s - m)
  return hover
end

function W.panel(x, y, w, h, title, tag)
  love.graphics.setColor(Theme.panel2)
  love.graphics.rectangle('fill', x, y, w, h, 6)
  love.graphics.setColor(Theme.edge)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 6)
  if title then
    love.graphics.setColor(Theme.panel)
    love.graphics.rectangle('fill', x + 1, y + 1, w - 2, 30, 6)
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.circle('fill', x + 10, y + 15, 4)
    love.graphics.setColor(Theme.txtDim)
    love.graphics.setFont(Theme.getFont(11))
    love.graphics.print(title, x + 20, y + 8)
    if tag then
      love.graphics.setFont(Theme.getFont(8))
      love.graphics.setColor(Theme.txtFaint)
      local tw = love.graphics.getFont():getWidth(tag)
      love.graphics.print(tag, x + w - tw - 10, y + 9)
    end
  end
end

function W.readout(x, y, w, h, label, value, unit, color, alarm)
  local c = color or Theme.amber
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', x, y, w, h, 4)
  love.graphics.setColor(alarm and {1,0,0} or Theme.edgeLo)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 4)
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(8))
  love.graphics.print(label, x + 6, y + 5)
  love.graphics.setColor(c)
  love.graphics.setFont(Theme.getFont(20))
  local vs = tostring(value)
  local vw = love.graphics.getFont():getWidth(vs)
  love.graphics.print(vs, x + w - vw - 6, y + h/2 - 11)
  if unit then
    love.graphics.setFont(Theme.getFont(8))
    love.graphics.setColor(Theme.txtDim)
    love.graphics.print(unit, x + 6, y + h - 15)
  end
end

function W.hbar(x, y, w, h, frac, color)
  local c = color or Theme.green
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', x, y, w, h, 3)
  love.graphics.setColor(c)
  love.graphics.rectangle('fill', x + 1, y + 1, math.max(1, (w - 2) * math.min(1, math.max(0, frac))), h - 2, 2)
end

function W.progressBar(x, y, w, h, pct, markPct)
  love.graphics.setColor({0.047, 0.055, 0.067})
  love.graphics.rectangle('fill', x, y, w, h, 4)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 4)
  local fw = math.max(1, (w - 2) * math.min(1, math.max(0, pct / 100)))
  love.graphics.setColor(Theme.green[1], Theme.green[2], Theme.green[3], 0.6)
  love.graphics.rectangle('fill', x + 1, y + 1, fw, h - 2, 2)
  if markPct then
    for _, mp in ipairs(markPct) do
      local mx = x + 1 + (w - 2) * mp / 100
      love.graphics.setColor(1, 1, 1, 0.25)
      love.graphics.rectangle('fill', mx, y, 2, h)
    end
  end
  love.graphics.setColor(1, 1, 1)
  love.graphics.setFont(Theme.getFont(12))
  local ts = string.format('%.1f%%', pct)
  local tw = love.graphics.getFont():getWidth(ts)
  love.graphics.print(ts, x + w - tw - 6, y + h/2 - 7)
end

function W.label(x, y, text, size, color)
  love.graphics.setColor(color or Theme.txt)
  love.graphics.setFont(Theme.getFont(size or 11))
  love.graphics.print(text, x, y)
end

function W.labelCenter(x, y, text, size, color)
  love.graphics.setColor(color or Theme.txt)
  love.graphics.setFont(Theme.getFont(size or 11))
  local w = love.graphics.getFont():getWidth(text)
  love.graphics.print(text, x - w/2, y)
end

local scrollOffsets = {}
function W.scrollRegion(id, x, y, w, h, contentH)
  if hit(x, y, w, h) then
    local dy = W.mouse.wheel
    if dy ~= 0 then
      if not scrollOffsets[id] then scrollOffsets[id] = 0 end
      scrollOffsets[id] = scrollOffsets[id] - dy
      if scrollOffsets[id] > contentH - h then scrollOffsets[id] = contentH - h end
      if scrollOffsets[id] < 0 then scrollOffsets[id] = 0 end
    end
  end
  local off = scrollOffsets[id] or 0
  if contentH <= h then off = 0 end
  love.graphics.push('all')
  love.graphics.setScissor(x, y, w, h)
  love.graphics.translate(0, -off)
  return off, h
end

function W.endScrollRegion()
  love.graphics.setScissor()
  love.graphics.pop()
end

function W.textBlock(x, y, maxW, text)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.setColor(Theme.txtDim)
  love.graphics.printf(text, x, y, maxW)
end

function W.logEntry(x, y, w, entry)
  local colors = {
    info = Theme.cyan, good = Theme.green, warn = Theme.amber,
    danger = Theme.red, system = Theme.txtFaint, achieve = {1, 0.843, 0},
  }
  local c = colors[entry.typ] or Theme.cyan
  love.graphics.setColor(c)
  love.graphics.rectangle('fill', x, y, 3, 18)
  love.graphics.setColor({0.1, 0.1, 0.12, 0.15})
  love.graphics.rectangle('fill', x + 3, y, w - 3, 18)
  love.graphics.setFont(Theme.getFont(8))
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.print(entry.time, x + 7, y + 2)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.setColor(Theme.txt)
  love.graphics.print(entry.msg, x + 55, y + 1)
end

function W.alarmLamp(x, y, r, on)
  local bg = on and {1, 0, 0} or {0.1, 0.05, 0.05}
  local glow = on and (math.sin(love.timer.getTime() * 8) * 0.5 + 0.5) * 20 or 0
  love.graphics.setColor(bg)
  love.graphics.circle('fill', x, y, r)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.setLineWidth(2)
  love.graphics.circle('line', x, y, r)
  if glow > 0.5 then
    love.graphics.setColor(1, 0, 0, glow / 20)
    love.graphics.circle('fill', x, y, r + 8)
  end
end

function W.tab(x, y, w, h, label, active, badge)
  local c = active and Theme.amber or Theme.txtFaint
  love.graphics.setColor(Theme.panel)
  love.graphics.rectangle('fill', x, y, w, h)
  love.graphics.setColor(c)
  love.graphics.setFont(Theme.getFont(10))
  local tw = love.graphics.getFont():getWidth(label)
  love.graphics.print(label, x + w/2 - tw/2, y + h/2 - 5)
  if badge > 0 then
    love.graphics.setColor(Theme.red)
    love.graphics.circle('fill', x + w/2 + tw/2 + 6, y + h/2 - 2, 7)
    love.graphics.setColor(1, 1, 1)
    love.graphics.setFont(Theme.getFont(7))
    love.graphics.print(tostring(badge), x + w/2 + tw/2 + 4, y + h/2 - 5)
  end
  if active then
    love.graphics.setColor(Theme.amber)
    love.graphics.rectangle('fill', x + w * 0.2, y + h - 2, w * 0.6, 2)
  end
  return hit(x, y, w, h) and W.mouse.pressed
end

function W.safetyItem(x, y, w, name, status, canMaintain, idx, G)
  local col = status > 70 and Theme.green or (status > 40 and Theme.amber or Theme.red)
  love.graphics.setColor({0.1, 0.1, 0.12, 0.15})
  love.graphics.rectangle('fill', x, y, w, 28, 4)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.setColor(Theme.txt)
  love.graphics.print(name, x + 6, y + 6)
  love.graphics.setColor(col)
  love.graphics.rectangle('fill', x + w - 120, y + 6, 80, 10, 3)
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.setColor(col)
  love.graphics.print(string.format('%.0f%%', status), x + w - 100, y + 6)
  if canMaintain then
    local bx = x + w - 36
    if W.button('mnt' .. idx, bx, y + 4, 32, 18, '修', nil, 'cyan') then
      if G then G:cmdMaintain(idx) end
    end
  end
end

return W
