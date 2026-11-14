-- render2.lua — Web render.js 的 canvas 绘制移植（表盘 / 堆芯剖面 / 棒位 / 平衡图 /
-- 纸带图 / 挂钟 / 四象限 / 分离器 / 棒驱动 / 自记仪），供 hud.lua 按实测坐标调用。

local WEB = require('src.ui.webtheme')

local R2 = {}

local chartBuf = {}
local CHART_MAX = 280
local recorderCols = {}
local RECORDER_MAX = 404   -- 202*2（与 web 缓冲宽度一致）

local function fontFor(kind, text, size)
  return WEB.fontFor(kind, text, size)
end

local function setText(kind, text, size)
  love.graphics.setFont(fontFor(kind, text, size))
end

-- ==================== 表盘（drawDial 1:1） ====================

-- x,y,w,h: 显示矩形；value 0-100 标量；opts {min,max,majors,unit,redFrom,fmt}
-- web 以 220px 内部分辨率绘制后 CSS 缩放显示，这里全部偏移按 sc = w/220 折算
function R2.drawDial(x, y, w, h, value, opts)
  opts = opts or {}
  local cx, cy = x + w / 2, y + h / 2
  local sc = w / 220
  local R = w / 2 - 8 * sc

  -- 黑色外圈
  love.graphics.setColor(WEB.dialBezel)
  love.graphics.circle('fill', cx, cy, R + 6 * sc)
  -- 白表盘面（径向渐变近似：外圈 → 内圈）
  love.graphics.setColor(WEB.dialFaceLo)
  love.graphics.circle('fill', cx, cy, R)
  love.graphics.setColor(WEB.dialFaceHi)
  love.graphics.circle('fill', cx, cy, R * 0.62)

  local a0 = math.pi * 0.75
  local a1 = math.pi * 2.083
  local span = a1 - a0

  -- 红区
  if opts.redFrom then
    love.graphics.setColor(0.761, 0.141, 0.063, 0.18)
    love.graphics.arc('fill', cx, cy, R - 4 * sc, a0 + span * opts.redFrom, a1)
  end

  -- 刻度
  local nMajor = opts.majors or 8
  local markSize = math.max(6, math.floor(R * 0.14))
  for i = 0, nMajor do
    local f = i / nMajor
    local a = a0 + span * f
    local cos, sin = math.cos(a), math.sin(a)
    love.graphics.setColor(WEB.dialMark)
    love.graphics.setLineWidth(2.5 * sc)
    love.graphics.line(cx + cos * (R - 6 * sc), cy + sin * (R - 6 * sc),
      cx + cos * (R - 20 * sc), cy + sin * (R - 20 * sc))
    local val = opts.min + (opts.max - opts.min) * f
    setText('mono', '', markSize)
    local label = opts.fmt and opts.fmt(val) or tostring(math.floor(val + 0.5))
    local tw = love.graphics.getFont():getWidth(label)
    love.graphics.print(label, cx + cos * (R - 34 * sc) - tw / 2,
      cy + sin * (R - 34 * sc) - markSize / 2)
    if i < nMajor then
      love.graphics.setLineWidth(1)
      for j = 1, 4 do
        local a2 = a0 + span * (f + j / (nMajor * 5))
        love.graphics.line(cx + math.cos(a2) * (R - 6 * sc), cy + math.sin(a2) * (R - 6 * sc),
          cx + math.cos(a2) * (R - 13 * sc), cy + math.sin(a2) * (R - 13 * sc))
      end
    end
  end

  -- 单位
  if opts.unit then
    love.graphics.setColor(WEB.inkSoft)
    setText('cn', opts.unit, math.max(7, math.floor(R * 0.11)))
    local uw = love.graphics.getFont():getWidth(opts.unit)
    love.graphics.print(opts.unit, cx - uw / 2, cy + R * 0.42)
  end

  -- 指针（多边形，端点按角度计算）
  local f = math.max(0, math.min(1, (value - opts.min) / (opts.max - opts.min)))
  local a = a0 + span * f
  local ca, sa = math.cos(a), math.sin(a)
  local tipX, tipY = cx + ca * (R - 18 * sc), cy + sa * (R - 18 * sc)
  local bx, by = cx - ca * R * 0.18, cy - sa * R * 0.18
  local px, py = -sa * 3.5 * sc, ca * 3.5 * sc
  love.graphics.setColor(WEB.dialNeedle)
  love.graphics.polygon('fill', tipX, tipY, bx + px, by + py, bx - px, by - py)

  -- 中心销
  love.graphics.setColor(WEB.dialMark)
  love.graphics.circle('fill', cx, cy, 6 * sc)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.circle('fill', cx, cy, 2.5 * sc)

  -- 玻璃反光（椭圆高光）
  love.graphics.setColor(1, 1, 1, 0.14)
  love.graphics.ellipse('fill', cx - R * 0.25, cy - R * 0.35, R * 0.55, R * 0.3, -0.5)
end

-- 功率表：0-120%，12 大刻度，红区 110/120
function R2.drawPower(x, y, w, h, n)
  R2.drawDial(x, y, w, h, n * 100, {
    min = 0, max = 120, majors = 12, unit = '% Nном', redFrom = 110 / 120,
  })
end

-- 周期表：对数映射（drawPeriod 1:1）
function R2.periodFrac(T)
  if T ~= T or T == math.huge or T == -math.huge then return 0.5 end
  local a = math.abs(T)
  if a <= 10 then return T >= 0 and 0.5 + 0.045 * (a / 10) or 0.5 - 0.045 * (a / 10) end
  if a <= 1000 then
    local l = (math.log10(a) - 1) / 2
    return T > 0 and (0.5 + 0.045 + 0.455 * l) or (0.5 - 0.045 - 0.455 * l)
  end
  return 0.5
end

function R2.drawPeriod(x, y, w, h, T)
  local f = R2.periodFrac(T)
  R2.drawDial(x, y, w, h, f * 100, {
    min = 0, max = 100, majors = 8, unit = 'с',
    fmt = function(v)
      local p = v / 100
      if math.abs(p - 0.5) < 0.045 then return '∞' end
      if p > 0.5 then return '+' .. tostring(math.floor(10 ^ (1 + (p - 0.545) / 0.455 * 2) + 0.5)) end
      return '−' .. tostring(math.floor(10 ^ (1 + (0.545 - p) / 0.455 * 2) + 0.5))
    end,
  })
end

-- ==================== 堆芯轴向剖面（drawCore 1:1） ====================

function R2.drawCore(x, y, w, h, S)
  love.graphics.setColor(WEB.coreBg)
  love.graphics.rectangle('fill', x, y, w, h)
  local cx = x + w / 2
  local top = y + 30
  local bot = y + h - 40
  local coreH = bot - top
  local coreW = 120

  love.graphics.setColor(WEB.coreFrame)
  love.graphics.rectangle('fill', cx - coreW / 2 - 14, top - 10, coreW + 28, coreH + 20)
  love.graphics.setColor({ 0.290, 0.282, 0.251 })
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', cx - coreW / 2 - 14, top - 10, coreW + 28, coreH + 20)

  -- 发光热区（正弦轮廓；线性渐变近似为分带纯色）
  local amp = math.min(1, S.n * 1.2)
  local pts = {}
  for yy = 0, coreH, 2 do
    local xx = math.sin(math.pi * yy / coreH) * amp
    pts[#pts + 1] = cx - coreW / 2 + xx * coreW * 0.42
    pts[#pts + 1] = top + yy
  end
  for yy = coreH, 0, -2 do
    local xx = math.sin(math.pi * yy / coreH) * amp
    pts[#pts + 1] = cx + coreW / 2 - xx * coreW * 0.42
    pts[#pts + 1] = top + yy
  end
  local midColor = S.n > 1.1 and { 0.878, 0.314, 0.078, 0.95 } or { 0.910, 0.643, 0.094, 0.85 }
  -- 整体填充 + 中段亮色叠加（渐变近似）
  love.graphics.setColor({ 0.314, 0.235, 0.078, 0.5 })
  love.graphics.polygon('fill', pts)
  love.graphics.setColor(midColor)
  local bandH = coreH / 3
  love.graphics.polygon('fill',
    cx - coreW / 2 + coreW * 0.20, top + bandH,
    cx + coreW / 2 - coreW * 0.20, top + bandH,
    cx + coreW / 2 - coreW * 0.20, top + 2 * bandH,
    cx - coreW / 2 + coreW * 0.20, top + 2 * bandH)

  -- 控制棒 ×5
  local rodX = { cx - 45, cx - 22, cx, cx + 22, cx + 45 }
  local rodLen = coreH * 0.75
  local absorber = rodLen * 0.55
  local displacer = rodLen * 0.35
  for _, rx in ipairs(rodX) do
    local rodBottom = top + coreH * (1 - S.rodPos / 100) + 20
    local y0 = math.max(top - 15, rodBottom - rodLen)
    love.graphics.setColor(0.353, 0.549, 0.784, 0.35)
    love.graphics.setLineWidth(6)
    love.graphics.line(rx, y0 + rodLen, rx, math.min(bot + 10, y0 + rodLen + 25))
    love.graphics.setColor(WEB.rodGray)
    love.graphics.setLineWidth(7)
    love.graphics.line(rx, y0 + absorber, rx, y0 + absorber + displacer)
    love.graphics.setColor(WEB.rodDark)
    love.graphics.line(rx, y0, rx, y0 + absorber)
    love.graphics.setColor(WEB.inkSoft)
    love.graphics.rectangle('fill', rx - 5, y0 - 4, 10, 4)
  end

  love.graphics.setColor(WEB.inkFaint)
  setText('mono', 'ВВЕРХ', 10)
  love.graphics.print('ВВЕРХ ↑ 上', x + 8, y + 8)
  love.graphics.print('ВНИЗ ↓ 下', x + 8, y + h - 18)
end

-- ==================== 棒位阵列（drawRods 1:1） ====================

function R2.drawRods(x, y, w, h, S)
  love.graphics.setColor(WEB.coreBg)
  love.graphics.rectangle('fill', x, y, w, h)
  local groups = 7
  local gw = (w - 40) / groups
  for i = 1, groups do
    local gx = x + 20 + (i - 1) * gw + gw / 2
    love.graphics.setColor({ 0.180, 0.173, 0.149 })
    love.graphics.rectangle('fill', gx - 8, y + 20, 16, h - 60)
    local offset = math.sin((i - 1) * 1.7) * 6
    local pos = math.max(0, math.min(100, S.rodPos + offset))
    local rodH = (h - 60) * (1 - pos / 100)
    love.graphics.setColor(S.scramming and WEB.dialNeedle or WEB.rodGray)
    love.graphics.rectangle('fill', gx - 5, y + 20, 10, rodH)
    love.graphics.setColor(WEB.rodDark)
    love.graphics.rectangle('fill', gx - 5, y + 20 + rodH, 10, 8)
    love.graphics.setColor(WEB.inkFaint)
    setText('mono', '', 9)
    local num = tostring(i)
    local tw = love.graphics.getFont():getWidth(num)
    love.graphics.print(num, gx - tw / 2, y + h - 34)
  end
  love.graphics.setColor(WEB.inkSoft)
  love.graphics.setLineWidth(1)
  love.graphics.line(x + 10, y + 20, x + 10, y + h - 40)
  love.graphics.setColor(WEB.inkFaint)
  setText('mono', '', 9)
  for p = 0, 100, 25 do
    local yy = y + 20 + (h - 60) * (1 - p / 100)
    love.graphics.line(x + 6, yy, x + 14, yy)
    love.graphics.print(tostring(p), x + 16, yy - 4)
  end
end

-- ==================== 反应性平衡（drawRho 1:1） ====================

function R2.drawRho(x, y, w, h, S)
  love.graphics.setColor(WEB.panelFace)
  love.graphics.rectangle('fill', x, y, w, h)
  local comps = {
    { 'СТЕРЖНИ 棒', S.rhoComponents.rod, { 0.290, 0.275, 0.227 } },
    { 'КОНЦ. 端部', S.rhoComponents.tip, WEB.dialNeedle },
    { 'α 空泡', S.rhoComponents.void, { 0.102, 0.290, 0.604 } },
    { 'Xe 氙', S.rhoComponents.xe, { 0.416, 0.165, 0.541 } },
    { 'T 多普勒', S.rhoComponents.doppler, { 0.180, 0.478, 0.290 } },
  }
  local rowH, y0, barW, x0 = 22, y + 12, w - 130, x + 100
  for i, comp in ipairs(comps) do
    local yy = y0 + (i - 1) * rowH
    love.graphics.setColor(WEB.engraved)
    setText('mono', '', 9)
    local lw = love.graphics.getFont():getWidth(comp[1])
    love.graphics.print(comp[1], x0 - 8 - lw, yy + 4)
    love.graphics.setColor(WEB.panelEdge)
    love.graphics.line(x0 + barW / 2, yy, x0 + barW / 2, yy + 14)
    local val = comp[2] or 0
    local bw = math.max(-barW / 2, math.min(barW / 2, val * 400))
    love.graphics.setColor(comp[3])
    love.graphics.rectangle('fill', x0 + barW / 2, yy + 2, bw, 10)
    love.graphics.setColor(WEB.inkSoft)
    setText('mono', '', 8)
    love.graphics.print((val >= 0 and '+' or '') .. string.format('%.3f', val), x0 + barW + 6, yy + 4)
  end
  local yT = y0 + #comps * rowH + 6
  love.graphics.setColor(WEB.ink)
  setText('sans', '', 11)
  local sw = love.graphics.getFont():getWidth('Σρ')
  love.graphics.print('Σρ', x0 - 8 - sw, yT - 2)
  setText('mono', '', 12)
  love.graphics.setColor(S.rho > 0.1 and WEB.dialNeedle or WEB.ink)
  love.graphics.print((S.rho >= 0 and '+' or '') .. string.format('%.3f', S.rho) .. ' ', x0 + 4, yT - 2)
end

-- ==================== 纸带趋势图（drawChart 1:1） ====================

function R2.pushChart(S)
  chartBuf[#chartBuf + 1] = { n = S.n, T = S.period, xe = S.xe, rho = S.rho }
  if #chartBuf > CHART_MAX then table.remove(chartBuf, 1) end
end

function R2.drawChart(x, y, w, h, S)
  love.graphics.setColor(WEB.chartPaper)
  love.graphics.rectangle('fill', x, y, w, h)
  love.graphics.setColor(0.659, 0.549, 0.392, 0.25)
  love.graphics.setLineWidth(1)
  for gx = w, 0, -20 do love.graphics.line(x + gx, y, x + gx, y + h) end
  for gy = 0, h, 24 do love.graphics.line(x, y + gy, x + w, y + gy) end

  local lines = {
    { function(d) return d.n end, { 0.690, 0.125, 0.063 }, function(v) return h - 8 - math.min(1.2, v) / 1.2 * (h - 16) end },
    { function(d) return d.xe end, { 0.416, 0.165, 0.541 }, function(v) return h - 8 - math.min(2, v) / 2 * (h - 16) end },
    { function(d) return d.rho end, { 0.102, 0.102, 0.102 }, function(v) return h / 2 - math.max(-0.5, math.min(0.5, v)) * (h * 0.8) end },
    { function(d) return d.T end, { 0.102, 0.290, 0.604 }, function(v)
        if v ~= v or v == math.huge or v == -math.huge then return h * 0.3 end
        local lv = (v < 0 and -1 or 1) * math.log10(math.max(1, math.abs(v)))
        return h / 2 - lv / 3 * (h * 0.7)
      end },
  }
  love.graphics.setLineWidth(1.4)
  for _, ln in ipairs(lines) do
    local pts = {}
    for i, d in ipairs(chartBuf) do
      pts[#pts + 1] = x + (w - (#chartBuf - i))
      pts[#pts + 1] = y + ln[3](ln[1](d))
    end
    if #pts >= 4 then
      love.graphics.setColor(ln[2])
      love.graphics.line(pts)
    end
  end
  love.graphics.setColor(WEB.inkSoft)
  love.graphics.rectangle('fill', x, y, 6, h)
end

-- ==================== 挂钟（drawClock 1:1） ====================

function R2.drawClock(x, y, size, simT)
  local cx, cy = x + size / 2, y + size / 2
  local R = size / 2 - 6
  love.graphics.setColor(WEB.dialBezel)
  love.graphics.circle('fill', cx, cy, R + 4)
  love.graphics.setColor(WEB.dialFace)
  love.graphics.circle('fill', cx, cy, R)
  for i = 0, 59 do
    local a = i / 60 * math.pi * 2 - math.pi / 2
    local major = i % 5 == 0
    love.graphics.setColor(WEB.dialMark)
    love.graphics.setLineWidth(major and 2.5 or 1)
    local r1 = R - 4
    local r2 = R - (major and 14 or 8)
    love.graphics.line(cx + math.cos(a) * r1, cy + math.sin(a) * r1,
      cx + math.cos(a) * r2, cy + math.sin(a) * r2)
  end
  local t = simT + (1 * 3600 + 23 * 60 + 40)
  local hh = (t / 3600) % 24
  local mm = (t / 60) % 60
  local ss = t % 60
  local function hand(frac, len, lw, color)
    local a = frac * math.pi * 2 - math.pi / 2
    love.graphics.setColor(color)
    love.graphics.setLineWidth(lw)
    love.graphics.line(cx, cy, cx + math.cos(a) * len, cy + math.sin(a) * len)
  end
  hand((hh % 12) / 12 + mm / 720, R * 0.5, 4, WEB.dialMark)
  hand(mm / 60 + ss / 3600, R * 0.72, 3, WEB.dialMark)
  hand(ss / 60, R * 0.8, 1.2, WEB.dialNeedle)
  love.graphics.setColor(WEB.dialNeedle)
  love.graphics.circle('fill', cx, cy, 3)
end

-- ==================== 四象限小表（drawQuadrants 1:1） ====================

function R2.drawQuadrants(x, y, w, h, S)
  love.graphics.setColor(WEB.panelFace)
  love.graphics.rectangle('fill', x, y, w, h)
  local qw = (w - 24) / 2
  local qh = (h - 24) / 2
  local R = math.min(qw, qh) / 2 - 4
  local a0 = math.pi * 0.75
  local a1 = math.pi * 2.083
  local span = a1 - a0
  for i = 1, 4 do
    local col = (i - 1) % 2
    local row = math.floor((i - 1) / 2)
    local cx = x + 10 + col * (qw + 4) + qw / 2
    local cy = y + 10 + row * (qh + 4) + qh / 2
    love.graphics.setColor(WEB.dialBezel)
    love.graphics.circle('fill', cx, cy, R + 5)
    love.graphics.setColor(WEB.dialFaceLo)
    love.graphics.circle('fill', cx, cy, R)
    love.graphics.setColor(WEB.dialFaceHi)
    love.graphics.circle('fill', cx, cy, R * 0.62)
    love.graphics.setColor(0.761, 0.141, 0.063, 0.18)
    love.graphics.arc('fill', cx, cy, R - 4, a0 + span * 0.9, a1)
    for t = 0, 4 do
      local f = t / 4
      local a = a0 + span * f
      local cos, sin = math.cos(a), math.sin(a)
      love.graphics.setColor(WEB.dialMark)
      love.graphics.setLineWidth(2.5)
      love.graphics.line(cx + cos * (R - 4), cy + sin * (R - 4),
        cx + cos * (R - 14), cy + sin * (R - 14))
      setText('mono', '', math.max(8, math.floor(R * 0.14)))
      local lbl = tostring(t * 250)
      local tw = love.graphics.getFont():getWidth(lbl)
      love.graphics.print(lbl, cx + cos * (R - 24) - tw / 2, cy + sin * (R - 24) - R * 0.07)
      if t < 4 then
        love.graphics.setLineWidth(1)
        for j = 1, 4 do
          local a2 = a0 + span * (f + j / 20)
          love.graphics.line(cx + math.cos(a2) * (R - 4), cy + math.sin(a2) * (R - 4),
            cx + math.cos(a2) * (R - 10), cy + math.sin(a2) * (R - 10))
        end
      end
    end
    love.graphics.setColor(WEB.inkSoft)
    setText('sans', 'MW', math.max(8, math.floor(R * 0.11)))
    local uw = love.graphics.getFont():getWidth('MW')
    love.graphics.print('MW', cx - uw / 2, cy + R * 0.42)
    local p = math.max(0, math.min(1, (S.quadrant_power[i] or 0) / 1000))
    local a = a0 + span * p
    local ca, sa = math.cos(a), math.sin(a)
    local tipX, tipY = cx + ca * (R - 14), cy + sa * (R - 14)
    local bx, by = cx - ca * R * 0.18, cy - sa * R * 0.18
    local px, py = -sa, ca
    love.graphics.setColor(WEB.dialNeedle)
    love.graphics.polygon('fill', tipX, tipY, bx + px * 3, by + py * 3, bx - px * 3, by - py * 3)
    love.graphics.setColor(WEB.dialMark)
    love.graphics.circle('fill', cx, cy, 5)
    love.graphics.setColor(WEB.inkFaint)
    love.graphics.circle('fill', cx, cy, 2)
    love.graphics.setColor(1, 1, 1, 0.14)
    love.graphics.ellipse('fill', cx - R * 0.25, cy - R * 0.35, R * 0.55, R * 0.3, -0.5)
    love.graphics.setColor(WEB.inkSoft)
    setText('sans', 'Q' .. i, 8)
    love.graphics.print('Q' .. i, cx - 5, cy - R - 6)
  end
end

-- ==================== 分离器液位（drawSepLevel 1:1） ====================

function R2.drawSepLevel(x, y, w, h, S, now)
  love.graphics.setColor(WEB.dialBezel)
  love.graphics.rectangle('fill', x, y, w, h)
  local barW, barH, barY = 24, h - 30, 6
  local barX = x + (w - barW) / 2
  love.graphics.setColor({ 0.102, 0.102, 0.086 })
  love.graphics.rectangle('fill', barX, y + barY, barW, barH)
  local level = math.max(0, math.min(2.0, S.separator_level))
  local fillH = (level / 2.0) * barH
  local fillC
  if level < 0.3 then
    fillC = (math.floor(now * 5) % 2 == 0) and WEB.dialNeedle or { 0.102, 0.290, 0.604 }
  elseif level < 0.5 then
    fillC = { 0.831, 0.627, 0.125 }
  else
    fillC = { 0.102, 0.290, 0.604 }
  end
  love.graphics.setColor(fillC)
  love.graphics.rectangle('fill', barX, y + barY + barH - fillH, barW, fillH)
  love.graphics.setColor(WEB.inkSoft)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', barX, y + barY, barW, barH)
  for _, m in ipairs({ 0.3, 0.5, 0.8, 1.2, 1.5 }) do
    local yy = y + barY + barH - (m / 2.0) * barH
    love.graphics.setColor(m < 0.5 and WEB.dialNeedle or (m > 1.5 and { 0.831, 0.627, 0.125 } or WEB.inkSoft))
    love.graphics.line(barX - 4, yy, barX + barW + 4, yy)
  end
  love.graphics.setColor(WEB.inkFaint)
  setText('mono', '', 9)
  local txt = string.format('%.2f m', level)
  love.graphics.print(txt, x + w / 2 - love.graphics.getFont():getWidth(txt) / 2, y + h - 14)
end

-- ==================== 棒驱动机构（drawRodDrive 1:1） ====================

function R2.drawRodDrive(x, y, w, h, S)
  love.graphics.setColor(WEB.coreBg)
  love.graphics.rectangle('fill', x, y, w, h)
  love.graphics.setColor(WEB.inkFaint)
  setText('mono', '', 9)
  love.graphics.print('В двиż: ' .. tostring(S.active_rod_drives) .. '/40', x + 6, y + 6)
  if S.rod_drive_overheat then
    love.graphics.setColor(WEB.dialNeedle)
    love.graphics.print('ПЕРЕГРЕВ! 过热!', x + 6, y + 20)
  end
  local temp = math.max(0, math.min(100, S.rod_drive_temp))
  local barW, barH, barY = w - 12, 8, 36
  love.graphics.setColor({ 0.165, 0.157, 0.133 })
  love.graphics.rectangle('fill', x + 6, y + barY, barW, barH)
  local color = temp > 80 and WEB.dialNeedle or (temp > 60 and { 0.831, 0.627, 0.125 } or { 0.290, 0.541, 0.290 })
  love.graphics.setColor(color)
  love.graphics.rectangle('fill', x + 6, y + barY, barW * (temp / 100), barH)
  love.graphics.setColor(WEB.inkFaint)
  setText('mono', '', 8)
  local txt = tostring(math.floor(temp + 0.5)) .. '°C'
  love.graphics.print(txt, x + w / 2 - love.graphics.getFont():getWidth(txt) / 2, y + barY + barH + 4)
end

-- ==================== 自记记录仪（drawRecorder 1:1，数组缓冲） ====================

function R2.pushRecorder(S)
  local pNorm = math.max(0, math.min(1, S.n))
  local yPower = pNorm
  local yPeriod = nil
  if S.period ~= math.huge and S.period ~= -S.period and S.period > 0 then
    yPeriod = math.min(1, math.log10(S.period) / 3)
  end
  recorderCols[#recorderCols + 1] = { yPower, yPeriod }
  if #recorderCols > RECORDER_MAX then table.remove(recorderCols, 1) end
end

function R2.drawRecorder(x, y, w, h, S)
  love.graphics.setColor({ 0.949, 0.925, 0.847 })
  love.graphics.rectangle('fill', x, y, w, h)
  love.graphics.setColor(0.784, 0.741, 0.627)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h)
  for i, col in ipairs(recorderCols) do
    local px = x + (w - 1) - (#recorderCols - i)
    if px >= x then
      love.graphics.setColor({ 0.690, 0.125, 0.063 })
      love.graphics.rectangle('fill', px, y + 4 + (1 - col[1]) * (h - 8), 1, 1)
      if col[2] then
        love.graphics.setColor(WEB.rodDark)
        love.graphics.rectangle('fill', px, y + 4 + (1 - col[2]) * (h - 8), 1, 1)
      end
    end
  end
end

return R2
