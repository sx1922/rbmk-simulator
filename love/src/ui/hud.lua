-- hud.lua — 主控室 HUD · Web 版控制室的 LÖVE 复刻
-- 布局坐标来自 1600×900 视口下 web/index.html 元素实测（见 webtheme.lua WEB.L）
-- 配色/字体规格来自 web/style.css :root 与组件样式

local WEB = require('src.ui.webtheme')
local R2 = require('src.ui.render2')
local W = require('src.ui.widgets')
local Engine = require('src.engine')
local Instrument = require('src.instrument')

local Hud = {}

local S = nil
local AppRef = nil

-- ==================== 输入状态 ====================

local rodHold = 0
local azCoverOpen = false
local azCoverShake = 0
local logScroll = 0
local logZoomOpen = false
local kvitPressed = 0
local hitRows = {}

local story = { act = nil, actRu = '', actCn = '', obj = '', objDone = false }
local endlessHudVisible = false
local panel = nil
local panelOpenCb, panelCloseCb, bankruptCb = nil, nil, nil

-- ==================== 通用原语 ====================

local function addHit(x, y, w, h, cb)
  hitRows[#hitRows + 1] = { x = x, y = y, w = w, h = h, cb = cb }
end

local function hitbox(x, y, w, h)
  local mx, my = W.mouse.x, W.mouse.y
  return mx >= x and mx <= x + w and my >= y and my <= y + h
end

local function hover(x, y, w, h) return hitbox(x, y, w, h) end

-- 设计坐标 → 屏幕坐标的剪裁（本机 LÖVE 的 scissor API 按屏幕坐标解释，
-- 在 Layout 变换内直接传设计坐标会整体错位，需手动换算）
local Layout = require('src.ui.layout')
local function setScissorD(x, y, w, h)
  local s = Layout.scale or 1
  love.graphics.setScissor(x * s + (Layout.ox or 0), y * s + (Layout.oy or 0), w * s, h * s)
end

local function utf8chars(s)
  local chars = {}
  local i = 1
  while i <= #s do
    local b = s:byte(i)
    local n = b < 0x80 and 1 or (b < 0xE0 and 2 or (b < 0xF0 and 3 or 4))
    chars[#chars + 1] = s:sub(i, i + n - 1)
    i = i + n
  end
  return chars
end

local function drawSpaced(text, x, y, spacing)
  local cx = x
  local f = love.graphics.getFont()
  for _, ch in ipairs(utf8chars(text)) do
    love.graphics.print(ch, cx, y)
    cx = cx + f:getWidth(ch) + spacing
  end
  return cx - x
end

local function spacedWidth(text, spacing)
  local f = love.graphics.getFont()
  local w = 0
  for _, ch in ipairs(utf8chars(text)) do w = w + f:getWidth(ch) + spacing end
  return math.max(0, w - spacing)
end

local function vgrad(x, y, w, h, c1, c2, bands)
  bands = bands or 6
  for i = 0, bands - 1 do
    local t = i / (bands - 1)
    love.graphics.setColor(
      c1[1] + (c2[1] - c1[1]) * t,
      c1[2] + (c2[2] - c1[2]) * t,
      c1[3] + (c2[3] - c1[3]) * t)
    love.graphics.rectangle('fill', x, y + h * i / bands, w, h / bands + 1)
  end
end

local function radialCircle(cx, cy, r, hi, mid)
  love.graphics.setColor(mid)
  love.graphics.circle('fill', cx, cy, r)
  love.graphics.setColor(hi)
  love.graphics.circle('fill', cx - r * 0.18, cy - r * 0.14, r * 0.62)
end

local function drawPanelBox(x, y, w, h, ru, cn)
  vgrad(x, y, w, h, WEB.panelFace, WEB.panelFace2, 4)
  love.graphics.setColor(WEB.panelFrame)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', x + 1, y + 1, w - 2, h - 2, 4)
  love.graphics.setColor(1, 1, 1, 0.5)
  love.graphics.line(x + 2, y + 2, x + w - 2, y + 2)
  for _, sx in ipairs({ x + 9, x + w - 9 }) do
    love.graphics.setColor(WEB.screw)
    love.graphics.circle('fill', sx, y + 9, 4)
    love.graphics.setColor({ 0.659, 0.635, 0.565 })
    love.graphics.circle('fill', sx - 1, y + 8, 2.5)
  end
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('display', 13))
  local rw = spacedWidth(ru, 2)
  drawSpaced(ru, x + w / 2 - rw / 2, y + 8, 2)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 10))
  local cw = love.graphics.getFont():getWidth(cn)
  love.graphics.print(cn, x + w / 2 - cw / 2, y + 25)
  love.graphics.setColor(WEB.panelEdge)
  love.graphics.setLineWidth(1)
  love.graphics.line(x + 8, y + 40, x + w - 8, y + 40)
end

local function readoutCard(x, y, w, h, ru, cn, value, unit, vcolor)
  love.graphics.setColor(WEB.panelFace2)
  love.graphics.rectangle('fill', x, y, w, h, 2)
  love.graphics.setColor(WEB.panelEdge)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 2)
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('sans', 10))
  love.graphics.print(ru, x + w / 2 - love.graphics.getFont():getWidth(ru) / 2, y + 3)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 9))
  love.graphics.print(cn, x + w / 2 - love.graphics.getFont():getWidth(cn) / 2, y + 15)
  love.graphics.setColor(vcolor or WEB.ink)
  love.graphics.setFont(WEB.getFont('mono', 15))
  local vw = love.graphics.getFont():getWidth(value)
  love.graphics.print(value, x + w / 2 - vw / 2, y + 27)
  if unit and unit ~= '' then
    love.graphics.setColor(WEB.inkFaint)
    love.graphics.setFont(WEB.getFont('sans', 9))
    love.graphics.print(unit, x + w / 2 + vw / 2 + 2, y + 31)
  end
end

local function lampUnit(x, y, w, h, ru, cn, on, color, blink)
  love.graphics.setColor(WEB.panelFace2)
  love.graphics.rectangle('fill', x, y, w, h, 3)
  love.graphics.setColor(WEB.panelEdge)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 3)
  local cx, cy = x + w / 2, y + 14
  local r = 10
  if on then
    radialCircle(cx, cy, r, { color[1] * 1.35, color[2] * 1.3, color[3] * 1.25 }, color)
    if blink then
      love.graphics.setColor(0, 0, 0, (math.sin(love.timer.getTime() * 8) > 0) and 0 or 0.55)
      love.graphics.circle('fill', cx, cy, r)
    end
  else
    radialCircle(cx, cy, r, { 0.933, 0.914, 0.855 }, WEB.lampOff)
  end
  love.graphics.setColor({ 0.604, 0.580, 0.518 })
  love.graphics.setLineWidth(2)
  love.graphics.circle('line', cx, cy, r)
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('display', 11))
  local rw = love.graphics.getFont():getWidth(ru)
  love.graphics.print(ru, x + w / 2 - rw / 2, y + 28)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 8))
  local cw = love.graphics.getFont():getWidth(cn)
  love.graphics.print(cn, x + w / 2 - cw / 2, y + 43)
end

local function rockerBtn(x, y, w, h, ru, cn, active, held)
  if active then
    vgrad(x, y, w, h, { 0.290, 0.275, 0.227 }, { 0.180, 0.173, 0.149 }, 3)
    love.graphics.setColor(WEB.ledAmber)
  elseif held then
    vgrad(x, y, w, h, { 0.478, 0.455, 0.345 }, { 0.361, 0.341, 0.290 }, 3)
    love.graphics.setColor(WEB.ledAmber)
  else
    vgrad(x, y, w, h, WEB.btnCream, { 0.659, 0.635, 0.565 }, 3)
    love.graphics.setColor(WEB.engraved)
  end
  love.graphics.setColor(WEB.inkSoft)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x + 0.5, y + 0.5, w - 1, h - 1, 3)
  if not active then
    love.graphics.setColor(WEB.screw)
    love.graphics.setLineWidth(2)
    love.graphics.line(x + 1, y + h - 1, x + w - 1, y + h - 1)
  end
  love.graphics.setFont(WEB.fontFor('sans', ru, 10))
  local rw = love.graphics.getFont():getWidth(ru)
  local cnw = cn and (love.graphics.getFont():getWidth(cn) + 3) or 0
  local tx = x + w / 2 - (rw + cnw) / 2
  love.graphics.print(ru, tx, y + h / 2 - 8)
  if cn then
    love.graphics.setFont(WEB.getFont('cn', 8))
    love.graphics.print(cn, tx + rw + 3, y + h / 2 - 6)
  end
end

function rockerBtnThen(x, y, w, h, label, danger)
  local mx, my = W.mouse.x, W.mouse.y
  local hov = mx >= x and mx <= x + w and my >= y and my <= y + h
  local pressed = hov and W.mouse.pressed
  vgrad(x, y, w, h, danger and WEB.btnRed or WEB.btnCream,
    danger and { 0.588, 0.078, 0.039 } or { 0.659, 0.635, 0.565 }, 3)
  love.graphics.setColor(WEB.inkSoft)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x + 0.5, y + 0.5, w - 1, h - 1, 3)
  love.graphics.setColor(danger and { 1, 1, 1 } or WEB.ink)
  love.graphics.setFont(WEB.fontFor('cn', label, 12))
  local tw = love.graphics.getFont():getWidth(label)
  love.graphics.print(label, x + w / 2 - tw / 2, y + h / 2 - 8)
  return pressed
end

local function ledReadout(x, y, text)
  love.graphics.setColor(WEB.btnBlack)
  love.graphics.setFont(WEB.getFont('mono', 12))
  love.graphics.rectangle('fill', x, y, love.graphics.getFont():getWidth(text) + 16, 20, 2)
  love.graphics.setColor(WEB.ledAmber)
  love.graphics.print(text, x + 8, y + 3)
end

-- ==================== 墙面 / 厂牌 / 挂钟 ====================

local function drawRoom()
  vgrad(0, 0, 1600, 900, WEB.wallHi, WEB.wallLo, 10)
  vgrad(0, 620, 1600, 280, WEB.wallMid, WEB.wallLo, 6)
  for _, fx in ipairs({ 0.12, 0.48, 0.84 }) do
    local x = 1600 * fx - 112
    love.graphics.setColor(WEB.fluor)
    love.graphics.rectangle('fill', x, 0, 224, 10, 0, 4)
    love.graphics.setColor(1, 1, 1, 0.18)
    love.graphics.rectangle('fill', x - 20, 0, 264, 26, 0, 8)
  end
end

local function drawPlantSign()
  local L = WEB.L.plantSign
  vgrad(L[1], L[2], L[3], L[4], { 0.541, 0.122, 0.078 }, { 0.431, 0.094, 0.063 }, 3)
  love.graphics.setColor({ 0.290, 0.063, 0.039 })
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', L[1] + 1, L[2] + 1, L[3] - 2, L[4] - 2, 3)
  love.graphics.setColor({ 0.949, 0.910, 0.847 })
  love.graphics.setFont(WEB.getFont('display', 14))
  local ru = 'ЧЕРНОБЫЛЬСКАЯ АЭС ИМ. В.И. ЛЕНИНА'
  local rw = spacedWidth(ru, 3)
  drawSpaced(ru, L[1] + L[3] / 2 - rw / 2, L[2] + 7, 3)
  love.graphics.setFont(WEB.getFont('cn', 9))
  local cn = '切尔诺贝利核电站 · 4号机组 · РБМК-1000'
  local cw = love.graphics.getFont():getWidth(cn)
  love.graphics.print(cn, L[1] + L[3] / 2 - cw / 2, L[2] + 34)
end

local function drawClock()
  local L = WEB.L.wallClock
  R2.drawClock(L[1], L[2], 120, S.t)
  local d = WEB.L.datePlate
  love.graphics.setColor(WEB.btnBlack)
  love.graphics.rectangle('fill', d[1], d[2], d[3], d[4], 2)
  love.graphics.setColor(WEB.ledAmber)
  love.graphics.setFont(WEB.getFont('mono', 10))
  local txt = os.date('%d.%m.1986')
  love.graphics.print(txt, d[1] + (d[3] - love.graphics.getFont():getWidth(txt)) / 2, d[2] + 2)
end

-- ==================== 上排面板 ====================

local function drawPanelPower()
  local L = WEB.L.panelPower
  drawPanelBox(L[1], L[2], L[3], L[4], 'МОЩНОСТЬ И ПЕРИОД', '功率与周期')
  for _, dial in ipairs({
      { WEB.L.dialPower, 'N, МВт(т)', '热功率', 'power' },
      { WEB.L.dialPeriod, 'ПЕРИОД, с', '周期', 'period' } }) do
    local d = dial[1]
    if dial[4] == 'power' then
      R2.drawPower(d[1], d[2], d[3], d[4], S.n)
    else
      R2.drawPeriod(d[1], d[2], d[3], d[4], S.period)
    end
    love.graphics.setColor(WEB.engraved)
    love.graphics.setFont(WEB.getFont('sans', 10))
    love.graphics.print(dial[2], d[1] + d[3] / 2 - love.graphics.getFont():getWidth(dial[2]) / 2, d[2] + d[4] + 2)
    love.graphics.setColor(WEB.inkFaint)
    love.graphics.setFont(WEB.getFont('cn', 8))
    love.graphics.print(dial[3], d[1] + d[3] / 2 - love.graphics.getFont():getWidth(dial[3]) / 2, d[2] + d[4] + 14)
    local val
    if dial[4] == 'power' then
      val = tostring(math.floor(S.n * Engine.N_NOM + 0.5))
    else
      local T = S.period
      if T == math.huge or T ~= T or T == -math.huge then val = '∞'
      else val = (T > 0 and '+' or '') .. string.format('%.1f', T) end
    end
    love.graphics.setColor(WEB.readoutBg)
    love.graphics.rectangle('fill', d[1] + d[3] / 2 - 35, d[2] + d[4] + 26, 70, 22, 2)
    love.graphics.setColor(WEB.panelEdge)
    love.graphics.setLineWidth(1)
    love.graphics.rectangle('line', d[1] + d[3] / 2 - 35, d[2] + d[4] + 26, 70, 22, 2)
    love.graphics.setColor(dial[4] == 'period' and S.period > 0 and S.period < 10
      and S.period ~= math.huge and WEB.dialNeedle or WEB.ink)
    love.graphics.setFont(WEB.getFont('mono', 14))
    love.graphics.print(val, d[1] + d[3] / 2 - love.graphics.getFont():getWidth(val) / 2, d[2] + d[4] + 28)
  end
  local lb = WEB.L.lampBank
  local defs = {
    { 'П1', '功率', S.alarms.P1 }, { 'П2', '周期', S.alarms.P2 },
    { 'П3', '压力', S.alarms.P3 }, { 'П4', '水位', S.alarms.P4 },
    { 'П5', '破损', S.alarms.P5 }, { 'АЗ', '动作', S.alarms.AZ },
  }
  local uw = (lb[3] - 30) / 6
  for i, def in ipairs(defs) do
    local x = lb[1] + 15 + (i - 1) * uw
    local acked = Instrument.lampIsAcked(def[1])
    local on = def[3] and not acked
    lampUnit(x, lb[2], uw - 6, 68, def[1], def[2], on, WEB.lampRed, false)
    addHit(x, lb[2], uw - 6, 68, function()
      if def[3] then Instrument.lampAck(def[1]) end
    end)
  end
end

local function drawPanelCore()
  local L = WEB.L.panelCore
  drawPanelBox(L[1], L[2], L[3], L[4], 'РАЗРЕЗ АКТИВНОЙ ЗОНЫ', '堆芯轴向剖面')
  local c = WEB.L.coreCanvas
  love.graphics.push('all')
  setScissorD(L[1] + 2, L[2] + 2, L[3] - 4, L[4] - 4)
  R2.drawCore(c[1], c[2], c[3], c[4], S)
  love.graphics.pop()
  local ro = {
    { 'ОЗР', '操作裕度', tostring(S.opr), 'ст.',
      S.opr < 15 and ((math.sin(love.timer.getTime() * 6) > 0) and WEB.dialNeedle or WEB.panelFace2) or WEB.ink },
    { 'Xe-135', '氙浓度', string.format('%.2f', S.xe), 'отн.', WEB.ink },
    { 'α', '空泡', tostring(math.floor(S.voidFrac + 0.5)), '%', WEB.ink } }
  local cw = 84
  for i, r in ipairs(ro) do
    readoutCard(L[1] + 14 + (i - 1) * (cw + 8), L[2] + L[4] - 66, cw, 52, r[1], r[2], r[3], r[4], r[5])
  end
end

local function drawPanelRods()
  local L = WEB.L.panelRods
  drawPanelBox(L[1], L[2], L[3], L[4], 'ПОЛОЖЕНИЕ СТЕРЖНЕЙ', '控制棒棒位')
  local c = WEB.L.rodsCanvas
  love.graphics.push('all')
  setScissorD(L[1] + 2, L[2] + 2, L[3] - 4, L[4] - 4)
  R2.drawRods(c[1], c[2], c[3], c[4], S)
  love.graphics.pop()
  local moving = math.abs(S.rodTarget - S.rodPos) > 0.5
  local ro = {
    { 'СРЕДНЕЕ', '平均棒位', tostring(math.floor(S.rodPos + 0.5)), '%', WEB.ink },
    { 'ВВЕРХ', '提升中', (moving and S.rodTarget > S.rodPos) and '▲' or '0', '', WEB.ink },
    { 'ВНИЗ', '下插中', ((moving and S.rodTarget < S.rodPos) or S.scramming) and '▼' or '0', '', WEB.ink },
  }
  local cw = 78
  for i, r in ipairs(ro) do
    readoutCard(L[1] + 10 + (i - 1) * (cw + 6), L[2] + L[4] - 66, cw, 52, r[1], r[2], r[3], r[4], r[5])
  end
end

local function drawPanelReactivity()
  local L = WEB.L.panelReactivity
  drawPanelBox(L[1], L[2], L[3], L[4], 'БАЛАНС РЕАКТИВНОСТИ', '反应性平衡')
  local rc = WEB.L.rhoCanvas
  R2.drawRho(rc[1], rc[2], rc[3], rc[4], S)
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('display', 12))
  local ru = 'РЕГИСТРАТОР'
  local rw = spacedWidth(ru, 2)
  drawSpaced(ru, L[1] + L[3] / 2 - rw / 2, L[2] + 244, 2)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 9))
  local cn = '纸带记录仪'
  love.graphics.print(cn, L[1] + L[3] / 2 - love.graphics.getFont():getWidth(cn) / 2, L[2] + 260)
  local ch = WEB.L.chartCanvas
  love.graphics.push('all')
  setScissorD(L[1] + 2, L[2] + 2, L[3] - 4, L[4] - 4)
  R2.drawChart(ch[1], ch[2], ch[3], ch[4], S)
  love.graphics.pop()
  love.graphics.setFont(WEB.getFont('mono', 10))
  local legend = { { 'N(t)', { 0.690, 0.125, 0.063 } }, { 'T', { 0.102, 0.290, 0.604 } },
    { 'Xe', { 0.416, 0.165, 0.541 } }, { 'ρ', { 0.102, 0.102, 0.102 } } }
  local lx = L[1] + L[3] / 2 - 60
  for _, lg in ipairs(legend) do
    love.graphics.setColor(lg[2])
    love.graphics.rectangle('fill', lx, L[2] + 262, 8, 8)
    love.graphics.setColor(WEB.inkSoft)
    love.graphics.print(lg[1], lx + 10, L[2] + 260)
    lx = lx + 34
  end
end

local function drawPanelAz()
  local L = WEB.L.panelAz
  drawPanelBox(L[1], L[2], L[3], L[4], 'АВАРИЙНАЯ ЗАЩИТА', '紧急保护')
  local az = WEB.L.azCover
  local shakeX = azCoverShake > 0 and math.sin(love.timer.getTime() * 40) * 4 or 0
  azCoverShake = math.max(0, azCoverShake - 0.016)
  vgrad(az[1] + shakeX, az[2], az[3], az[4], { 0.216, 0.200, 0.165 }, { 0.149, 0.141, 0.122 }, 3)
  love.graphics.setColor({ 0.102, 0.094, 0.078 })
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', az[1] + shakeX, az[2], az[3], az[4], 6)
  local bcx, bcy, br = az[1] + az[3] / 2 + shakeX, az[2] + az[4] / 2, 38
  radialCircle(bcx, bcy, br, WEB.btnRedHi, WEB.btnRed)
  love.graphics.setColor({ 0.588, 0.078, 0.039 })
  love.graphics.setLineWidth(2)
  love.graphics.circle('line', bcx, bcy, br)
  love.graphics.setColor(1, 1, 1)
  love.graphics.setFont(WEB.getFont('display', 16))
  love.graphics.print('АЗ-5', bcx - love.graphics.getFont():getWidth('АЗ-5') / 2, bcy - 10)
  if not azCoverOpen then
    love.graphics.setColor(1, 1, 1, 0.14)
    love.graphics.rectangle('fill', az[1] + shakeX + 4, az[2] + 4, az[3] - 8, az[4] - 8, 4)
    love.graphics.setColor(1, 1, 1, 0.35)
    love.graphics.setLineWidth(1)
    love.graphics.rectangle('line', az[1] + shakeX + 4, az[2] + 4, az[3] - 8, az[4] - 8, 4)
  else
    love.graphics.setColor(1, 1, 1, 0.04)
    love.graphics.rectangle('fill', az[1] + shakeX + 4, az[2] - 6, az[3] - 8, 8, 4)
  end
  addHit(az[1], az[2], az[3], az[4], function()
    azCoverOpen = not azCoverOpen
    local okA, Audio = pcall(require, 'src.audio.synth')
    if okA and Audio.click then Audio.click() end
  end)
  love.graphics.setColor(azCoverOpen and WEB.amber or WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('mono', 8))
  local st = azCoverOpen and 'КОЛПАК ПОДНЯТ · 玻璃罩已开' or 'КОЛПАК ЗАКРЫТ · 点击玻璃打开'
  love.graphics.print(st, L[1] + 10, az[2] + az[4] + 4)
  local sy = az[2] + az[4] + 18
  for i = 0, 9 do
    love.graphics.setColor(i % 2 == 0 and { 0.831, 0.643, 0.094 } or WEB.btnBlack)
    love.graphics.polygon('fill', L[1] + 24 + i * 20, sy, L[1] + 44 + i * 20, sy,
      L[1] + 34 + i * 20, sy + 10, L[1] + 14 + i * 20, sy + 10)
  end
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('display', 11))
  love.graphics.print('КНОПКА АЗ-5', L[1] + L[3] / 2 - 46, sy + 14)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 8))
  love.graphics.print('全部控制棒下插', L[1] + L[3] / 2 - 42, sy + 30)
  local ks = WEB.L.keySwitch
  radialCircle(ks[1] + ks[3] / 2, ks[2] + ks[4] / 2, 28,
    { 0.847, 0.824, 0.753 }, { 0.596, 0.580, 0.518 })
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setLineWidth(1)
  love.graphics.circle('line', ks[1] + ks[3] / 2, ks[2] + ks[4] / 2, 28)
  love.graphics.setColor(WEB.btnBlack)
  love.graphics.rectangle('fill', ks[1] + 20, ks[2] + ks[4] / 2 - 4, 16, 8, 2)
  love.graphics.setColor(S.azBlocked and WEB.dialNeedle or { 0.847, 0.824, 0.753 })
  love.graphics.rectangle('fill', ks[1] + 24, ks[2] + (S.azBlocked and 6 or 16), 8, 14, 2)
  addHit(ks[1], ks[2], ks[3], ks[4], function() Engine.toggleKey() end)
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('display', 10))
  love.graphics.print('БЛОКИРОВКА АЗ', ks[1] + ks[3] / 2 - 44, ks[2] + ks[4] + 4)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 8))
  love.graphics.print('保护闭锁钥匙', ks[1] + ks[3] / 2 - 36, ks[2] + ks[4] + 18)
end

-- ==================== 下排面板 ====================

local function drawPanelQuadrants()
  local L = WEB.L.panelQuadrants
  drawPanelBox(L[1], L[2], L[3], L[4], 'КВАДРАНТЫ', '象限功率')
  local c = WEB.L.canvasQuadrants
  R2.drawQuadrants(c[1], c[2], c[3], c[4], S)
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('sans', 10))
  love.graphics.print('МОЩНОСТЬ КВАДРАНТОВ', L[1] + 16, L[2] + L[4] - 60)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 8))
  love.graphics.print('象限功率分布', L[1] + 16, L[2] + L[4] - 46)
end

local function drawPanelSep()
  local L = WEB.L.panelSep
  drawPanelBox(L[1], L[2], L[3], L[4], 'СЕПАРАТОР', '汽水分离器')
  local c = WEB.L.canvasSepLevel
  R2.drawSepLevel(c[1], c[2], c[3], c[4], S, love.timer.getTime())
  readoutCard(L[1] + 20, L[2] + 190, 100, 52, 'УРОВЕНЬ ДС', '分离器水位',
    string.format('%.2f', S.separator_level), 'm', WEB.ink)
  readoutCard(L[1] + 130, L[2] + 190, 100, 52, 'P ДС', '分离器压力',
    string.format('%.1f', S.separator_pressure), 'MPa', WEB.ink)
  love.graphics.setColor(WEB.amber)
  love.graphics.setFont(WEB.getFont('mono', 10))
  love.graphics.print(tostring(math.floor(S.decay_heat_power + 0.5)) .. ' MW',
    L[1] + 20, L[2] + 258)
end

local function drawPanelRodDrive()
  local L = WEB.L.panelRodDrive
  drawPanelBox(L[1], L[2], L[3], L[4], 'ПРИВОД СТЕРЖНЕЙ', '棒驱动机构')
  local c = WEB.L.canvasRodDrive
  R2.drawRodDrive(c[1], c[2], c[3], c[4], S)
end

local function drawPanelRecorder()
  local L = WEB.L.panelRecorder
  drawPanelBox(L[1], L[2], L[3], L[4], 'КСУ-120', '自记记录仪')
  local c = WEB.L.canvasRecorder
  R2.drawRecorder(c[1], c[2], c[3], c[4], S)
end

local function drawPanelRadiation()
  local L = WEB.L.panelRadiation
  drawPanelBox(L[1], L[2], L[3], L[4], 'РАДИАЦИЯ', '辐射监测')
  local dose = S.containment_dose_rate
  readoutCard(L[1] + 12, L[2] + 50, 110, 52, 'ДОЗА', '剂量率',
    dose >= 100 and tostring(math.floor(dose)) or
    (dose >= 1 and string.format('%.1f', dose) or string.format('%.2f', dose)),
    'mR/h', WEB.ink)
  readoutCard(L[1] + 130, L[2] + 50, 110, 52, 'ОБ. ЦЕЛ.', '包壳',
    tostring(math.floor(S.clad_integrity * 100 + 0.5)), '%', WEB.ink)
  local ln = WEB.L.lampBankNew
  local defs = {
    { 'СЕП', '水位低', Instrument.lampState('SEP_LO') ~= 'OFF', WEB.lampAmber },
    { 'СЕП', '水位高', Instrument.lampState('SEP_HI') ~= 'OFF', WEB.lampAmber },
    { 'ПИТ', '给水低温', Instrument.lampState('FW_COLD') ~= 'OFF', { 0.910, 0.816, 0.251 } },
    { 'ОБ.', '包壳损伤', Instrument.lampState('CLAD') ~= 'OFF', WEB.lampRed },
    { 'ПЕР', '周期警', Instrument.lampState('PERIOD_W') ~= 'OFF', { 0.910, 0.816, 0.251 } },
    { 'ПЕР', '周期危', Instrument.lampState('PERIOD_C') ~= 'OFF', WEB.lampRed },
    { 'ТЕП', '衰变热', Instrument.lampState('DECAY') ~= 'OFF', WEB.lampAmber },
    { 'РАД', '辐射高', Instrument.lampState('RAD') ~= 'OFF', WEB.lampRed },
  }
  local uw = ln[3] / 4
  for i, def in ipairs(defs) do
    local x = ln[1] + ((i - 1) % 4) * uw
    local y = ln[2] + math.floor((i - 1) / 4) * 62
    lampUnit(x, y, uw - 4, 58, def[1], def[2], def[3], def[4], false)
  end
  local kv = WEB.L.btnKvit
  kvitPressed = math.max(0, kvitPressed - 0.016)
  radialCircle(kv[1] + 24, kv[2] + 24, 24,
    kvitPressed > 0 and { 1, 1, 1 } or WEB.dialFace,
    kvitPressed > 0 and { 0.910, 0.894, 0.847 } or { 0.722, 0.706, 0.659 })
  love.graphics.setColor({ 0.541, 0.518, 0.455 })
  love.graphics.setLineWidth(2)
  love.graphics.circle('line', kv[1] + 24, kv[2] + 24, 24)
  love.graphics.setColor(WEB.ink)
  love.graphics.setFont(WEB.getFont('display', 11))
  love.graphics.print('КВИТ', kv[1] + 24 - love.graphics.getFont():getWidth('КВИТ') / 2, kv[2] + 17)
  addHit(kv[1], kv[2], 48, 48, function()
    Instrument.kvit()
    kvitPressed = 0.2
    local okA, Audio = pcall(require, 'src.audio.synth')
    if okA and Audio.click then Audio.click() end
  end)
end

-- ==================== 控制台 ====================

local function drawConsoleDesk()
  local D = WEB.L.consoleDesk
  vgrad(D[1], D[2], D[3], D[4], WEB.deskTop, WEB.desk, 5)
  love.graphics.setColor({ 0.361, 0.341, 0.290 })
  love.graphics.rectangle('fill', D[1], D[2], D[3], 3)
  love.graphics.setColor(1, 1, 1, 0.12)
  love.graphics.rectangle('fill', D[1], D[2] + 3, D[3], 2)

  local U = WEB.L.consoleUnits

  -- ① 目标功率
  do
    local u = U[1]
    love.graphics.setColor(WEB.consoleText)
    love.graphics.setFont(WEB.getFont('sans', 9))
    love.graphics.print('ЗАДАННАЯ МОЩНОСТЬ', u[1] + 8, u[2] + 6)
    love.graphics.setColor(WEB.consoleDim)
    love.graphics.setFont(WEB.getFont('cn', 8))
    love.graphics.print('目标功率 %', u[1] + 8, u[2] + 17)
    local sx, sy, sw = u[1] + 10, u[2] + 36, u[3] - 24
    love.graphics.setColor({ 0.227, 0.216, 0.180 })
    love.graphics.rectangle('fill', sx, sy, sw, 8, 4)
    love.graphics.setColor(WEB.inkSoft)
    love.graphics.rectangle('line', sx, sy, sw, 8, 4)
    local frac = S.targetPower / 120
    love.graphics.setColor(0.5, 0.3, 0.1, 0.4)
    love.graphics.rectangle('fill', sx, sy, sw * frac, 8, 4)
    local knobX = sx + sw * frac
    vgrad(knobX - 10, sy - 9, 20, 26, WEB.consoleText, WEB.panelEdge, 3)
    love.graphics.setColor(WEB.inkSoft)
    love.graphics.setLineWidth(2)
    love.graphics.rectangle('line', knobX - 10, sy - 9, 20, 26, 3)
    love.graphics.setColor(WEB.consoleDim)
    love.graphics.setFont(WEB.getFont('mono', 8))
    for i = 0, 4 do
      love.graphics.print(tostring(i * 30), sx - 4 + (sw - 12) * i / 4, sy + 12)
    end
    love.graphics.setColor(WEB.btnBlack)
    love.graphics.rectangle('fill', u[1] + 10, u[2] + 68, 76, 22, 2)
    love.graphics.setColor(WEB.ledAmber)
    love.graphics.setFont(WEB.getFont('mono', 12))
    love.graphics.print(math.floor(S.targetPower + 0.5) .. ' %', u[1] + 18, u[2] + 71)
    addHit(sx - 8, sy - 12, sw + 16, 34, nil)
    hitRows[#hitRows].dragSlider = {
      set = function(v) Engine.setTargetPower(v); if AppRef then AppRef.countOp() end end,
      min = 0, max = 120, x = sx, w = sw }
  end

  -- ② 提棒速率 + 提插棒
  do
    local u = U[2]
    love.graphics.setColor(WEB.consoleText)
    love.graphics.setFont(WEB.getFont('sans', 9))
    love.graphics.print('СКОРОСТЬ ПОДЪЁМА', u[1] + 8, u[2] + 6)
    love.graphics.setColor(WEB.consoleDim)
    love.graphics.setFont(WEB.getFont('cn', 8))
    love.graphics.print('提棒速率', u[1] + 8, u[2] + 17)
    local speeds = { { 'МЕДЛ.', '慢', 0.1 }, { 'РАБОЧ.', '工', 0.4 }, { 'БЫСТР.', '快', 1.0 } }
    for i, sp in ipairs(speeds) do
      local bx = u[1] + 8 + (i - 1) * 68
      rockerBtn(bx, u[2] + 30, 64, 26, sp[1], sp[2], math.abs(S.rodSpeed - sp[3]) < 0.01)
      addHit(bx, u[2] + 30, 64, 26, function() Engine.setRodSpeed(sp[3]) end)
    end
    rockerBtn(u[1] + 8, u[2] + 62, 100, 26, 'ПОДЪЁМ', '提', false, rodHold > 0)
    rockerBtn(u[1] + 112, u[2] + 62, 100, 26, 'ОПУСК', '降', false, rodHold < 0)
    if hover(u[1] + 8, u[2] + 62, 100, 26) and W.mouse.pressed then
      Engine.beginRodMove(1); rodHold = 1; if AppRef then AppRef.countOp() end
    elseif hover(u[1] + 112, u[2] + 62, 100, 26) and W.mouse.pressed then
      Engine.beginRodMove(-1); rodHold = -1; if AppRef then AppRef.countOp() end
    elseif rodHold ~= 0 and not W.mouse.down then
      Engine.endRodMove(); rodHold = 0
    end
    ledReadout(u[1] + 8, u[2] + 92, string.format('%.1f %%/с', S.rodSpeed))
  end

  -- ③ 运行模式
  do
    local u = U[3]
    love.graphics.setColor(WEB.consoleText)
    love.graphics.setFont(WEB.getFont('sans', 9))
    love.graphics.print('РЕЖИМ', u[1] + 8, u[2] + 6)
    love.graphics.setColor(WEB.consoleDim)
    love.graphics.setFont(WEB.getFont('cn', 8))
    love.graphics.print('运行模式', u[1] + 8, u[2] + 17)
    rockerBtn(u[1] + 8, u[2] + 30, 62, 26, 'АВТО', '自', S.mode == 'auto')
    rockerBtn(u[1] + 74, u[2] + 30, 62, 26, 'РУЧН.', '手', S.mode == 'manual')
    addHit(u[1] + 8, u[2] + 30, 62, 26, function()
      if S.mode ~= 'auto' then Engine.setMode('auto'); if AppRef then AppRef.countOp() end end
    end)
    addHit(u[1] + 74, u[2] + 30, 62, 26, function()
      if S.mode ~= 'manual' then Engine.setMode('manual'); if AppRef then AppRef.countOp() end end
    end)
    ledReadout(u[1] + 8, u[2] + 66, S.mode == 'auto' and '自动' or '手动')
  end

  -- ④ ГЦН
  do
    local u = U[4]
    love.graphics.setColor(WEB.consoleText)
    love.graphics.setFont(WEB.getFont('sans', 9))
    love.graphics.print('ГЦН', u[1] + 8, u[2] + 6)
    love.graphics.setColor(WEB.consoleDim)
    love.graphics.setFont(WEB.getFont('cn', 8))
    love.graphics.print('主循环泵', u[1] + 40, u[2] + 6)
    for i = 1, 8 do
      local bx = u[1] + 8 + (i - 1) * 30
      local by = u[2] + 30
      if S.pumps[i] then
        radialCircle(bx + 13, by + 13, 13, { 0.353, 0.753, 0.416 }, WEB.lampGreen)
      else
        radialCircle(bx + 13, by + 13, 13, { 0.431, 0.416, 0.361 }, { 0.227, 0.216, 0.180 })
      end
      love.graphics.setColor({ 0.227, 0.216, 0.180 })
      love.graphics.setLineWidth(2)
      love.graphics.circle('line', bx + 13, by + 13, 13)
      love.graphics.setColor(WEB.consoleText)
      love.graphics.setFont(WEB.getFont('mono', 9))
      love.graphics.print(tostring(i), bx + 9, by + 7)
      love.graphics.setColor(WEB.screw)
      love.graphics.setLineWidth(2)
      love.graphics.line(bx + 1, by + 26, bx + 25, by + 26)
      addHit(bx, by, 26, 26, function()
        local wasOn = S.pumps[i]
        Engine.togglePump(i)
        if wasOn and AppRef and AppRef.stats then
          AppRef.stats.pumpsStopped = AppRef.stats.pumpsStopped + 1
        end
        if AppRef then AppRef.countOp() end
      end)
    end
    local onCount = 0
    for i = 1, 8 do if S.pumps[i] then onCount = onCount + 1 end end
    ledReadout(u[1] + 8, u[2] + 66, onCount .. '/8 · ' .. math.floor(S.flow) .. '%')
  end

  -- ⑤ 量程
  do
    local u = U[5]
    love.graphics.setColor(WEB.consoleText)
    love.graphics.setFont(WEB.getFont('sans', 9))
    love.graphics.print('ДИАПАЗОН КИП', u[1] + 8, u[2] + 6)
    love.graphics.setColor(WEB.consoleDim)
    love.graphics.setFont(WEB.getFont('cn', 8))
    love.graphics.print('量程切换', u[1] + 8, u[2] + 17)
    local names = { 'С', 'П', '1', '2', '3' }
    local cur = Instrument.currentRangeId()
    for i, nm in ipairs(names) do
      local bx = u[1] + 8 + (i - 1) * 32
      rockerBtn(bx, u[2] + 30, 28, 26, nm, nil, cur == i - 1)
      addHit(bx, u[2] + 30, 28, 26, function()
        if cur ~= i - 1 then
          Instrument.switchRange(i - 1)
          if AppRef then
            AppRef.logEvent('info', '切换功率量程至 [' .. Instrument.rangeName() .. ']')
            AppRef.countOp()
          end
        end
      end)
    end
    ledReadout(u[1] + 8, u[2] + 66, Instrument.rangeName())
  end

  -- ⑥ 时间
  do
    local u = U[6]
    love.graphics.setColor(WEB.consoleText)
    love.graphics.setFont(WEB.getFont('sans', 9))
    love.graphics.print('ВРЕМЯ', u[1] + 8, u[2] + 6)
    love.graphics.setColor(WEB.consoleDim)
    love.graphics.setFont(WEB.getFont('cn', 8))
    love.graphics.print('仿真时间', u[1] + 8, u[2] + 17)
    local opts = { 1, 10, 60, 300 }
    for i, ts in ipairs(opts) do
      local bx = u[1] + 8 + (i - 1) * 40
      rockerBtn(bx, u[2] + 30, 36, 26, '×' .. ts, nil, S.timeScale == ts)
      addHit(bx, u[2] + 30, 36, 26, function()
        Engine.setTimeScale(ts)
        if AppRef and AppRef.endless then
          local okE, Endless = pcall(require, 'src.endless')
          if okE and Endless.setSpeed then Endless.setSpeed(ts) end
        end
      end)
    end
    local function p2(n)
      n = math.floor(n)
      if n < 10 then return '0' .. n end
      return tostring(n)
    end
    ledReadout(u[1] + 8, u[2] + 66,
      p2((S.t / 3600) % 24) .. ':' .. p2((S.t / 60) % 60) .. ':' .. p2(S.t % 60))
  end
end

-- ==================== 日志纸片 / 道具条 ====================

local function drawMachineLog()
  local L = WEB.L.machineLog
  love.graphics.setColor(WEB.logPaper)
  love.graphics.rectangle('fill', L[1], L[2], L[3], L[4], 2)
  love.graphics.setColor({ 0.784, 0.761, 0.682 })
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', L[1], L[2], L[3], L[4], 2)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 8))
  love.graphics.print('ПЕЧАТЬ СОБЫТИЙ · 事件记录', L[1] + 6, L[2] + 4)
  love.graphics.setColor(WEB.btnBlack)
  love.graphics.rectangle('fill', L[1] + L[3] - 54, L[2] + 3, 50, 16, 2)
  love.graphics.setColor(WEB.consoleText)
  love.graphics.setFont(WEB.getFont('cn', 8))
  love.graphics.print('⤢ 放大', L[1] + L[3] - 50, L[2] + 5)
  addHit(L[1] + L[3] - 54, L[2] + 3, 50, 16, function()
    logZoomOpen = not logZoomOpen
    local okA, Audio = pcall(require, 'src.audio.synth')
    if okA and Audio.zoom then Audio.zoom() end
  end)
  local entries = AppRef and AppRef.logEntries or {}
  love.graphics.push('all')
  setScissorD(L[1] + 2, L[2] + 22, L[3] - 4, L[4] - 24)
  local lineH = 13
  local maxLines = math.floor((L[4] - 26) / lineH)
  local total = #entries
  local startIdx = math.max(1, total - maxLines - math.floor(logScroll / lineH) + 1)
  local y = L[2] + 24
  love.graphics.setFont(WEB.fontFor('mono', '[00:00:00]', 9))
  for i = startIdx, total do
    local e = entries[i]
    love.graphics.setColor(e.typ == 'alarm' and WEB.logAlarm
      or e.typ == 'warn' and WEB.logWarn or WEB.logInk)
    love.graphics.print(e.line, L[1] + 6, y)
    love.graphics.setColor(0.867, 0.839, 0.761)
    love.graphics.line(L[1] + 6, y + lineH - 2, L[1] + L[3] - 6, y + lineH - 2)
    y = y + lineH
    if y > L[2] + L[4] - 4 then break end
  end
  love.graphics.pop()
end

local function drawLogZoom()
  love.graphics.setColor(0, 0, 0, 0.6)
  love.graphics.rectangle('fill', 0, 0, 1600, 900)
  local w, h = 900, 640
  local x, y = 800 - w / 2, 450 - h / 2
  love.graphics.setColor(WEB.logPaper)
  love.graphics.rectangle('fill', x, y, w, h, 4)
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('cn', 11))
  love.graphics.print('ПЕЧАТЬ СОБЫТИЙ · ПОЛНЫЙ ЖУРНАЛ 事件记录 · 全量', x + 16, y + 10)
  love.graphics.setColor(WEB.btnBlack)
  love.graphics.rectangle('fill', x + w - 40, y + 8, 28, 24, 2)
  love.graphics.setColor(WEB.consoleText)
  love.graphics.print('✕', x + w - 32, y + 10)
  addHit(x + w - 40, y + 8, 28, 24, function() logZoomOpen = false end)
  love.graphics.push('all')
  setScissorD(x + 8, y + 36, w - 16, h - 44)
  local entries = AppRef and AppRef.logEntries or {}
  local lineH = 18
  local yOff = 0
  love.graphics.setFont(WEB.fontFor('mono', '[00:00:00]', 10))
  for i = math.max(1, #entries - 60), #entries do
    local e = entries[i]
    love.graphics.setColor(e.typ == 'alarm' and WEB.logAlarm
      or e.typ == 'warn' and WEB.logWarn or WEB.logInk)
    love.graphics.print(e.line, x + 16, y + 40 + yOff - logScroll)
    yOff = yOff + lineH
  end
  love.graphics.pop()
end

local function drawDeskProps()
  local D = WEB.L.deskProps
  vgrad(D[1], D[2], D[3], D[4], WEB.desk, WEB.floor, 3)
  local icons = {
    { id = 'manual', icon = '规', name = '运行规程', ru = 'РЕГЛАМЕНТ' },
    { id = 'clipboard', icon = '志', name = '值班日志', ru = 'ЖУРНАЛ' },
    { id = 'calculator', icon = '算', name = '计算器', ru = 'МК-61' },
    { id = 'dosimeter', icon = '量', name = '剂量计', ru = 'ДП-5' },
    { id = 'phone', icon = '话', name = '高频电话', ru = 'ВЧ' },
    { id = 'phonebook', icon = '簿', name = '电话号码簿', ru = 'ТЕЛ.КНИГА' },
    { id = 'coffee', icon = '茶', name = '茶炊', ru = 'ЧАЙ' },
    { id = 'about', icon = '关', name = '关于', ru = 'О ПРОГРАММЕ' },
  }
  local x0 = WEB.L.propsX0
  for i, p in ipairs(icons) do
    local x = x0 + (i - 1) * 82
    local y = D[2] + 8
    local hov = hover(x, y, WEB.L.propSize[1], WEB.L.propSize[2])
    local lift = hov and -4 or 0
    vgrad(x, y + lift, WEB.L.propSize[1], WEB.L.propSize[2],
      { 0.604, 0.580, 0.518 }, { 0.478, 0.459, 0.408 }, 3)
    love.graphics.setColor(WEB.inkSoft)
    love.graphics.setLineWidth(1)
    love.graphics.rectangle('line', x, y + lift, WEB.L.propSize[1], WEB.L.propSize[2], 4)
    love.graphics.setFont(WEB.getFont('cn', 17))
    local iw = love.graphics.getFont():getWidth(p.icon)
    love.graphics.print(p.icon, x + WEB.L.propSize[1] / 2 - iw / 2, y + lift + 6)
    love.graphics.setColor(WEB.consoleText)
    love.graphics.setFont(WEB.getFont('cn', 9))
    local nw = love.graphics.getFont():getWidth(p.name)
    love.graphics.print(p.name, x + WEB.L.propSize[1] / 2 - nw / 2, y + lift + 34)
    love.graphics.setColor(WEB.consoleDim)
    love.graphics.setFont(WEB.getFont('sans', 7))
    local rw = love.graphics.getFont():getWidth(p.ru)
    love.graphics.print(p.ru, x + WEB.L.propSize[1] / 2 - rw / 2, y + lift + 48)
    addHit(x, y, WEB.L.propSize[1], WEB.L.propSize[2], function()
      if p.id == 'about' then
        if AppRef and AppRef.showAbout then AppRef.showAbout() end
      else
        local Props = require('src.props')
        Props.openProp(p.id)
      end
    end)
  end
  local vs = WEB.L.versionStamp
  love.graphics.setColor(WEB.consoleDim)
  love.graphics.setFont(WEB.getFont('mono', 8))
  love.graphics.print('v0.1.0', vs[1], vs[2])
  love.graphics.print('сб.2026.11.14', vs[1], vs[2] + 13)
  love.graphics.print('РЭ-86/16', vs[1], vs[2] + 26)
end

-- ==================== story / endless HUD ====================

local function drawStoryHud()
  if not story.act then return end
  local L = WEB.L.storyHud
  love.graphics.setColor(0.047, 0.055, 0.047, 0.82)
  love.graphics.rectangle('fill', L[1], L[2], L[3], L[4], 4)
  love.graphics.setColor(0.839, 0.710, 0.376, 0.45)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', L[1], L[2], L[3], L[4], 4)
  love.graphics.setColor(0.839, 0.710, 0.376)
  love.graphics.rectangle('fill', L[1], L[2], 4, L[4])
  love.graphics.setColor(WEB.amber)
  love.graphics.setFont(WEB.getFont('display', 13))
  love.graphics.print(story.actRu, L[1] + 14, L[2] + 3)
  love.graphics.setColor(WEB.consoleText)
  love.graphics.setFont(WEB.getFont('cn', 10))
  love.graphics.print(story.actCn, L[1] + 90, L[2] + 6)
  if story.obj ~= '' then
    love.graphics.setColor(story.objDone and { 0.180, 0.620, 0.267 } or WEB.consoleText)
    love.graphics.setFont(WEB.fontFor('cn', story.obj, 11))
    love.graphics.print((story.objDone and '✓ ' or '') .. story.obj, L[1] + 190, L[2] + 9)
  end
  local okP, Props = pcall(require, 'src.props')
  if okP then
    local bx, by = 1496, 160
    love.graphics.setColor(0.047, 0.055, 0.047, 0.85)
    love.graphics.rectangle('fill', bx, by, 96, 46, 4)
    love.graphics.setColor(0.839, 0.710, 0.376, 0.5)
    love.graphics.rectangle('line', bx, by, 96, 46, 4)
    love.graphics.setColor(WEB.consoleText)
    love.graphics.setFont(WEB.getFont('sans', 9))
    love.graphics.print('КАЛЕНДАРЬ', bx + 10, by + 6)
    love.graphics.setFont(WEB.getFont('cn', 9))
    love.graphics.print('📅 日历', bx + 10, by + 22)
    addHit(bx, by, 96, 46, function()
      local modeKey = (AppRef and AppRef.mode == 'endless') and 'endless' or 'story'
      Props.toggleCalendar(modeKey)
    end)
  end
end

local function drawEndlessHud()
  if not endlessHudVisible or not AppRef or not AppRef.endless then return end
  local okE, Endless = pcall(require, 'src.endless')
  if not okE or not Endless.getHud then return end
  local h = Endless.getHud()
  if not h then return end
  local x, y = 440, 0
  love.graphics.setColor(0.047, 0.055, 0.047, 0.82)
  love.graphics.rectangle('fill', x, y, 560, 64, 4)
  love.graphics.setColor(0.839, 0.710, 0.376, 0.45)
  love.graphics.rectangle('line', x, y, 560, 64, 4)
  love.graphics.setColor(WEB.amber)
  love.graphics.setFont(WEB.getFont('sans', 11))
  love.graphics.print('МЕСЯЦ ' .. h.month, x + 12, y + 4)
  love.graphics.setColor(WEB.consoleText)
  love.graphics.setFont(WEB.getFont('cn', 10))
  love.graphics.print('第' .. h.month .. '月 · 第' .. h.day .. '天 · 班次 ' .. h.shift, x + 90, y + 6)
  love.graphics.setFont(WEB.getFont('mono', 13))
  love.graphics.print('₽ ' .. tostring(h.money), x + 12, y + 34)
  love.graphics.setFont(WEB.getFont('cn', 10))
  love.graphics.print('燃耗 ' .. string.format('%.1f', h.burnup), x + 180, y + 37)
  local opts = { 1, 4, 10, 60, 240 }
  for i, ts in ipairs(opts) do
    local bx = x + 290 + (i - 1) * 44
    rockerBtn(bx, y + 8, 40, 22, '×' .. ts, nil, S.timeScale == ts)
    addHit(bx, y + 8, 40, 22, function() Endless.setSpeed(ts) end)
  end
  local actions = { { 'save', '存档' }, { 'crew', '班组' }, { 'goals', '目标' }, { 'ach', '成就' } }
  for i, a in ipairs(actions) do
    local bx = x + 290 + (i - 1) * 62
    rockerBtn(bx, y + 34, 58, 22, a[2], nil, false)
    addHit(bx, y + 34, 58, 22, function()
      if a[1] == 'save' then
        Endless.saveGame()
        if AppRef then AppRef.logEvent('info', '已保存进度。') end
      else
        Hud.showEndlessPanelKind(a[1])
      end
    end)
  end
end

function Hud.showEndlessPanelKind(kind)
  local okE, Endless = pcall(require, 'src.endless')
  if not okE then return end
  if kind == 'crew' then
    local crew = Endless.getCrew()
    local ov = Endless.getOverview()
    local lines = { '工作班组 · СМЕНА（能力影响事件处理，士气低于 55% 有误操作风险）' }
    for _, m in ipairs(crew) do
      lines[#lines + 1] = m.name .. ' · ' .. m.role .. '  能 ' ..
        math.floor(m.competence * 100 + 0.5) .. '%  士 ' .. math.floor(m.morale * 100 + 0.5) .. '%'
    end
    if ov then
      lines[#lines + 1] = '平均能力 ' .. math.floor(ov.avgComp * 100 + 0.5) ..
        '% · 平均士气 ' .. math.floor(ov.avgMorale * 100 + 0.5) .. '% · 奖金 ₽50K / 解雇 ₽60K'
    end
    panel = { kind = 'crew', title = 'СМЕНА · 班组', lines = lines, crew = crew }
  elseif kind == 'goals' then
    local lines = {}
    for _, g in ipairs(Endless.getGoals()) do
      lines[#lines + 1] = (g.done and '✓ ' or '○ ') .. g.text .. '  ₽' .. tostring(g.reward)
    end
    panel = { kind = 'list', title = 'ЦЕЛИ · 经营目标', lines = lines }
  elseif kind == 'ach' then
    local lines = {}
    for _, a in ipairs(Endless.getAchList()) do
      lines[#lines + 1] = (a.unlocked and '✓ ' or '○ ') .. a.text
    end
    panel = { kind = 'list', title = 'НАГРАДЫ · 成就', lines = lines }
  end
  if panel then
    panel.kind = 'list'
    if panelOpenCb then panelOpenCb() end
  end
end

-- ==================== 浮层 / 演出 / 面板 ====================

local function drawFloat(f)
  local w, h = 560, 110
  local x = 800 - w / 2
  local y = 900 - h - 130
  local a = math.min(1, f.timer * 5)
  love.graphics.setColor(0.047, 0.055, 0.047, 0.82 * a)
  love.graphics.rectangle('fill', x, y, w, h, 4)
  love.graphics.setColor(0.839, 0.710, 0.376, 0.45 * a)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 4)
  love.graphics.setColor(0.839, 0.710, 0.376)
  love.graphics.rectangle('fill', x, y, 4, h)
  love.graphics.setFont(WEB.getFont('cn', 9))
  love.graphics.setColor(WEB.consoleDim, a)
  love.graphics.print(f.kind == 'phone' and '☎ ВЧ 电话 · 高频电话' or 'Вызов · 对话', x + 16, y + 8)
  love.graphics.setFont(WEB.getFont('cn', 13))
  love.graphics.setColor(WEB.amber, a)
  love.graphics.print((f.data.from or f.data.speaker or ''):gsub('\n', ' '), x + 16, y + 26)
  love.graphics.setColor(WEB.consoleText, a)
  love.graphics.print((f.data.text or ''):gsub('\n', ' '), x + 16, y + 54, w - 32)
  love.graphics.setFont(WEB.getFont('cn', 9))
  love.graphics.setColor(WEB.consoleDim, a)
  love.graphics.print('⏎ 关闭', x + w - 60, y + h - 22)
end

local function drawIgnition(fx)
  local p = fx.t / fx.dur
  love.graphics.setColor(0.008, 0.012, 0.02, math.min(1, p * 3))
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  local glow = p < 0.5 and p * 2 or 1
  local r = 60 + p * 180
  love.graphics.setColor(0.4, 0.7, 1, 0.9 * glow)
  love.graphics.circle('fill', 800, 450, r * 0.5)
  love.graphics.setColor(0.75, 0.9, 1, 0.55 * glow)
  love.graphics.circle('fill', 800, 450, r * 0.32)
  love.graphics.setColor(1, 1, 1, 0.9 * glow)
  love.graphics.circle('fill', 800, 450, r * 0.14)
  for i = 1, 3 do
    local rp = ((p * 1.4 - (i - 1) * 0.18) % 1)
    if rp > 0 then
      love.graphics.setColor(0.5, 0.8, 1, (1 - rp) * 0.5)
      love.graphics.setLineWidth(3 - i)
      love.graphics.circle('line', 800, 450, rp * 320)
    end
  end
  love.graphics.setFont(WEB.getFont('display', 26))
  love.graphics.setColor(1, 1, 1, glow)
  love.graphics.print('ПУСК', 800 - love.graphics.getFont():getWidth('ПУСК') / 2, 700)
  love.graphics.setFont(WEB.getFont('cn', 14))
  love.graphics.setColor(0.31, 0.847, 0.878, glow)
  local t2 = '点火 · 反应堆临界'
  love.graphics.print(t2, 800 - love.graphics.getFont():getWidth(t2) / 2, 740)
end

local function drawMeltdownFx()
  local a = math.min(0.35, love.timer.getTime() % 2 * 0.2)
  love.graphics.setColor(1, 0.15, 0.1, a)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
end

local function drawEndlessPanel()
  local d = panel
  local okE, Endless = pcall(require, 'src.endless')
  local pw, ph = 640, 460
  local px, py = 800 - pw / 2, 450 - ph / 2
  love.graphics.setColor(0.118, 0.110, 0.086, 0.75)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  vgrad(px, py, pw, ph, WEB.panelFace, WEB.panelFace2, 4)
  love.graphics.setColor(WEB.panelFrame)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', px + 1, py + 1, pw - 2, ph - 2, 6)
  local y = py + 24
  if d.kind == 'settle' then
    love.graphics.setColor(WEB.engraved)
    love.graphics.setFont(WEB.getFont('cn', 18))
    local t1 = '第 ' .. d.data.month .. ' 月结算'
    love.graphics.print(t1, px + pw / 2 - love.graphics.getFont():getWidth(t1) / 2, y)
    y = y + 34
    local function mrow(label, value, color)
      love.graphics.setColor(WEB.inkSoft)
      love.graphics.setFont(WEB.getFont('cn', 12))
      love.graphics.print(label, px + 48, y)
      love.graphics.setFont(WEB.getFont('mono', 13))
      love.graphics.setColor(color or WEB.ink)
      love.graphics.print(value, px + pw - 48 - love.graphics.getFont():getWidth(value), y)
      y = y + 28
    end
    mrow('售电收入', '+' .. tostring(math.floor(d.data.income + 0.5)) .. ' ₽', { 0.180, 0.620, 0.267 })
    mrow('日常维护', '-' .. tostring(math.floor(d.data.maint + 0.5)) .. ' ₽')
    mrow('人员工资', '-' .. tostring(math.floor(d.data.wages + 0.5)) .. ' ₽')
    mrow('事件 / 罚款', '-' .. tostring(math.floor(d.data.fines + 0.5)) .. ' ₽')
    mrow('本月净利润: ', (d.data.profit >= 0 and '+' or '') ..
      tostring(math.floor(d.data.profit + 0.5)) .. ' ₽',
      d.data.profit >= 0 and { 0.180, 0.620, 0.267 } or WEB.dialNeedle)
    mrow('现金', tostring(math.floor(d.data.money + 0.5)) .. ' ₽' ..
      (d.data.lossStreak > 0 and (' · 连续亏损 ' .. d.data.lossStreak .. '/6 月') or ''))
    if d.data.bankrupt then
      love.graphics.setColor(WEB.dialNeedle)
      love.graphics.setFont(WEB.getFont('cn', 11))
      love.graphics.print('连续 6 个月净亏损 — 电站被上级部门接管。您被罢职。', px + 48, y)
      y = y + 46
      if rockerBtnThen(px + pw / 2 - 80, y, 160, 38, '最终结算', true) then
        Hud.closeEndlessPanel()
        if bankruptCb then bankruptCb() end
      end
    else
      if rockerBtnThen(px + pw / 2 - 80, y + 16, 160, 38, '继续运营 · ⏎', false) then
        Hud.closeEndlessPanel()
      end
    end
  elseif d.kind == 'event' then
    love.graphics.setColor(WEB.engraved)
    love.graphics.setFont(WEB.getFont('cn', 16))
    local t1 = d.data.title or '事件'
    love.graphics.print(t1, px + pw / 2 - love.graphics.getFont():getWidth(t1) / 2, y)
    y = y + 40
    love.graphics.setColor(WEB.inkSoft)
    love.graphics.setFont(WEB.getFont('cn', 12))
    love.graphics.printf(d.data.desc or '', px + 48, y, pw - 96)
    y = y + 80
    for _, opt in ipairs(d.data.options or {}) do
      if rockerBtnThen(px + 48, y, pw - 96, 40, opt.label, false) then
        if d.router then d.router(d.data.id, opt.id)
        else
          local okE, Endless = pcall(require, 'src.endless')
          if okE and Endless.choose then Endless.choose(d.data.id, opt.id) end
        end
        Hud.closeEndlessPanel()
        return
      end
      y = y + 48
    end
    love.graphics.setColor(WEB.inkFaint)
    love.graphics.setFont(WEB.getFont('cn', 9))
    love.graphics.print('延迟不响应将按默认方式处理', px + 48, py + ph - 36)
  elseif d.kind == 'list' or d.kind == 'crew' then
    love.graphics.setColor(WEB.engraved)
    love.graphics.setFont(WEB.getFont('cn', 16))
    love.graphics.print(d.title, px + pw / 2 - love.graphics.getFont():getWidth(d.title) / 2, y)
    y = y + 44
    love.graphics.push('all')
    setScissorD(px + 24, y, pw - 48, py + ph - y - 50)
    love.graphics.setFont(WEB.fontFor('cn', d.lines and d.lines[1] or '', 12))
    love.graphics.setColor(WEB.ink)
    for i, line in ipairs(d.lines or {}) do
      love.graphics.print(line, px + 40, y + (i - 1) * 22)
      if d.kind == 'crew' and i > 1 then
        local m = d.crew[i - 1]
        if m then
          if rockerBtnThen(px + pw - 190, y + (i - 1) * 22 - 2, 50, 20, '奖金', false) then
            Endless.crewBonus(m.id)
            Hud.showEndlessPanelKind('crew')
          end
          if rockerBtnThen(px + pw - 134, y + (i - 1) * 22 - 2, 50, 20, '解雇', true) then
            Endless.crewFire(m.id)
            Hud.showEndlessPanelKind('crew')
          end
        end
      end
    end
    love.graphics.pop()
    if d.kind == 'crew' then
      if rockerBtnThen(px + 48, py + ph - 54, 130, 34, '招聘 ₽120K', false) then
        Endless.crewHire()
        Hud.showEndlessPanelKind('crew')
      end
    end
    if rockerBtnThen(px + pw / 2 - 80, py + ph - 54, 160, 36, '关闭 · ⏎', false) then
      Hud.closeEndlessPanel()
    end
  end
end

-- ==================== 主绘制 ====================

function Hud.draw(App)
  S = Engine.S
  AppRef = App
  hitRows = {}
  drawRoom()
  drawPlantSign()
  drawClock()
  drawPanelPower()
  drawPanelCore()
  drawPanelRods()
  drawPanelReactivity()
  drawPanelAz()
  drawPanelQuadrants()
  drawPanelSep()
  drawPanelRodDrive()
  drawPanelRecorder()
  drawPanelRadiation()
  drawConsoleDesk()
  drawMachineLog()
  drawStoryHud()
  drawEndlessHud()
  Hud.drawChallengeHud()
  Hud.drawAbout()
  drawDeskProps()

  if S.meltdown then drawMeltdownFx() end
  if App.ignitionFx then drawIgnition(App.ignitionFx) end
  if App.floatShowing then drawFloat(App.floatShowing) end
  if panel then drawEndlessPanel() end
  if logZoomOpen then drawLogZoom() end

  if W.mouse.pressed then
    for i = #hitRows, 1, -1 do
      local hh = hitRows[i]
      if hitbox(hh.x, hh.y, hh.w, hh.h) and hh.cb then hh.cb() break end
    end
    for _, hh in ipairs(hitRows) do
      if hh.dragSlider and W.mouse.down then
        local ds = hh.dragSlider
        local mx = W.mouse.x
        if mx >= ds.x - 10 and mx <= ds.x + ds.w + 10 then
          local frac = math.max(0, math.min(1, (mx - ds.x) / ds.w))
          ds.set(ds.min + frac * (ds.max - ds.min))
        end
      end
    end
  end
  W.endFrame()
end

function Hud.beginFrame(App)
  W.beginFrame(W.mouse.x, W.mouse.y, W.mouse.down, W.mouse.pressed, W.mouse.released, W.mouse.wheel)
end

-- ==================== 对外接口 ====================

function Hud.pressAZ5(App)
  if not azCoverOpen then
    azCoverShake = 0.35
    App.logEvent('warn', 'АЗ-5 заблокирован колпаком — 请先点击玻璃罩打开')
    return
  end
  if Engine.manualAZ() then
    if App.stats then App.stats.azPresses = App.stats.azPresses + 1 end
    if App.endless then
      local okE, Endless = pcall(require, 'src.endless')
      if okE and Endless.scramHook then Endless.scramHook() end
    end
    if App.scenario then App.scenario:onPlayerAction('az_pressed') end
    App.countOp()
  end
end

function Hud.storyAct(v)
  story.act = v
  local meta = {
    ['1'] = { ru = 'АКТ I', cn = '第一幕' }, ['2'] = { ru = 'АКТ II', cn = '第二幕' },
    ['2B'] = { ru = 'АКТ II-Б', cn = '第二幕B' }, ['3'] = { ru = 'АКТ III', cn = '第三幕' },
    ['3B'] = { ru = 'АКТ III-Б', cn = '第三幕B' }, ['4'] = { ru = 'АКТ IV', cn = '第四幕' },
    ['5'] = { ru = 'АКТ V', cn = '第五幕' }, ['6'] = { ru = 'АКТ VI', cn = '第六幕' },
  }
  local m = meta[tostring(v)] or { ru = 'АКТ', cn = '第·幕' }
  story.actRu, story.actCn = m.ru, m.cn
end

function Hud.storyObjective(text)
  story.obj = text or ''
  story.objDone = false
end

function Hud.initStoryHud()
  endlessHudVisible = false
  if AppRef and AppRef.scenario then Hud.storyAct(AppRef.scenario.flags.act or 1) end
end

function Hud.clearStoryHud()
  story = { act = nil, actRu = '', actCn = '', obj = '', objDone = false }
  endlessHudVisible = false
  logZoomOpen = false
end

function Hud.showEndlessHud() endlessHudVisible = true end
function Hud.hideEndlessHud() endlessHudVisible = false end

function Hud.setPanelCallbacks(onOpen, onClose, onBankrupt)
  panelOpenCb, panelCloseCb, bankruptCb = onOpen, onClose, onBankrupt
end

function Hud.showEndlessSettle(d)
  panel = { kind = 'settle', data = d }
  if panelOpenCb then panelOpenCb() end
end

function Hud.showEndlessEvent(evt, router)
  panel = { kind = 'event', data = evt, router = router }
  if panelOpenCb then panelOpenCb() end
end

function Hud.closeEndlessPanel()
  panel = nil
  if panelCloseCb then panelCloseCb() end
end

function Hud.endlessPanelOpen() return panel ~= nil end

function Hud.mousepressed(App, x, y, button)
  if button ~= 1 then return end
  W.mouse.pressed = true
  W.mouse.down = true
  W.mouse.x, W.mouse.y = x, y
  if App.floatShowing then
    local w, h = 560, 110
    local fx, fy = 800 - w / 2, 900 - h - 130
    if x >= fx and x <= fx + w and y >= fy and y <= fy + h then App.hideFloat() end
  end
end

function Hud.mousereleased(App, x, y, button)
  W.mouse.down = false
  W.mouse.released = true
  if rodHold ~= 0 then Engine.endRodMove(); rodHold = 0 end
end

function Hud.mousemoved(App, x, y)
  W.mouse.x, W.mouse.y = x, y
end

function Hud.wheelmoved(dy)
  W.mouse.wheel = dy
  if logZoomOpen then
    logScroll = logScroll + dy * 24
    if logScroll < 0 then logScroll = 0 end
  end
end

function Hud.reset()
  rodHold = 0
  azCoverOpen = false
  azCoverShake = 0
  logScroll = 0
  logZoomOpen = false
  panel = nil
  story = { act = nil, actRu = '', actCn = '', obj = '', objDone = false }
  endlessHudVisible = false
  Instrument.init()
  Instrument.initLamps()
end


-- ==================== 挑战 HUD / 关于铭牌（Web 对齐） ====================

local challengeHudVisible = false
local aboutOpen = false

function Hud.showChallengeHud() challengeHudVisible = true end
function Hud.hideChallengeHud() challengeHudVisible = false end

function Hud.drawChallengeHud()
  if not challengeHudVisible or not AppRef then return end
  local okC, Challenge = pcall(require, 'src.challenge')
  if not okC or not Challenge.getHud then return end
  local h = Challenge.getHud()
  if not h then return end
  local x, y = 440, 0
  love.graphics.setColor(0.047, 0.055, 0.047, 0.82)
  love.graphics.rectangle('fill', x, y, 560, 64, 4)
  love.graphics.setColor(0.839, 0.710, 0.376, 0.45)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, 560, 64, 4)
  -- ВРЕМЯ 倒计时
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('sans', 9))
  love.graphics.print('ВРЕМЯ', x + 16, y + 6)
  love.graphics.setFont(WEB.getFont('mono', 20))
  love.graphics.setColor(h.time <= '01:00' and WEB.dialNeedle or WEB.ledAmber)
  love.graphics.print(h.time, x + 16, y + 18)
  -- ОЧКИ 得分
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('sans', 9))
  love.graphics.print('ОЧКИ', x + 140, y + 6)
  love.graphics.setFont(WEB.getFont('mono', 20))
  love.graphics.setColor(WEB.ledAmber)
  love.graphics.print(tostring(h.score), x + 140, y + 18)
  -- 消息
  love.graphics.setColor(WEB.consoleText)
  love.graphics.setFont(WEB.fontFor('cn', h.msg, 11))
  love.graphics.print(h.msg, x + 260, y + 22)
end

function Hud.showAbout()
  aboutOpen = true
  local okA, Audio = pcall(require, 'src.audio.synth')
  if okA and Audio.paper then Audio.paper() end
end

function Hud.drawAbout()
  if not aboutOpen then return end
  love.graphics.setColor(0, 0, 0, 0.55)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  local w, h = 520, 470
  local x, y = 800 - w / 2, 450 - h / 2
  vgrad(x, y, w, h, WEB.panelFace, WEB.panelFace2, 4)
  love.graphics.setColor(WEB.panelFrame)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', x + 1, y + 1, w - 2, h - 2, 8)
  -- 四角螺丝
  for _, sp in ipairs({ { 14, 14 }, { w - 14, 14 }, { 14, h - 14 }, { w - 14, h - 14 } }) do
    love.graphics.setColor(WEB.screw)
    love.graphics.circle('fill', x + sp[1], y + sp[2], 5)
    love.graphics.setColor({ 0.659, 0.635, 0.565 })
    love.graphics.circle('fill', x + sp[1] - 1, y + sp[2] - 1, 3)
  end
  -- 品牌
  love.graphics.setColor(WEB.engraved)
  love.graphics.setFont(WEB.getFont('display', 24))
  local brand = 'ТРЕНАЖЁР «ЩИТ»'
  local bw = spacedWidth(brand, 3)
  drawSpaced(brand, x + w / 2 - bw / 2, y + 36, 3)
  love.graphics.setColor(WEB.inkFaint)
  love.graphics.setFont(WEB.getFont('cn', 11))
  local cn = '主控室训练模拟器'
  love.graphics.print(cn, x + w / 2 - love.graphics.getFont():getWidth(cn) / 2, y + 68)
  love.graphics.setColor(WEB.panelEdge)
  love.graphics.line(x + 40, y + 96, x + w - 40, y + 96)

  local rows = {
    { 'ВЕРСИЯ', '版本', 'v0.1.0 «Первый щит»' },
    { 'СБОРКА', '构建', 'сб.2026.11.14' },
    { 'РЕВИЗИЯ', '修订', 'РЭ-86/16' },
    { 'РАЗРАБОТКА', '开发', 'sx1922' },
    { 'ПЛАТФОРМА', '平台', 'LÖVE 2D' },
  }
  local ry = y + 116
  for _, r in ipairs(rows) do
    love.graphics.setColor(WEB.engraved)
    love.graphics.setFont(WEB.getFont('sans', 12))
    love.graphics.print(r[1], x + 60, ry)
    love.graphics.setColor(WEB.inkFaint)
    love.graphics.setFont(WEB.getFont('cn', 9))
    love.graphics.print(r[2], x + 60, ry + 16)
    love.graphics.setColor(WEB.ink)
    love.graphics.setFont(WEB.getFont('mono', 13))
    love.graphics.print(r[3], x + 200, ry + 8)
    ry = ry + 54
    if r[1] == 'РЕВИЗИЯ' then
      love.graphics.setColor(WEB.panelEdge)
      love.graphics.line(x + 40, ry - 10, x + w - 40, ry - 10)
    end
  end
  love.graphics.setColor(WEB.inkSoft)
  love.graphics.setFont(WEB.getFont('cn', 9))
  love.graphics.print('LÖVE 2D 移植版 · Web v0.2.3 全功能对齐', x + 60, y + h - 44)
  -- 关闭按钮
  love.graphics.setColor(WEB.btnBlack)
  love.graphics.rectangle('fill', x + w - 56, y + 14, 34, 30, 3)
  love.graphics.setColor(WEB.consoleText)
  love.graphics.setFont(WEB.getFont('cn', 13))
  love.graphics.print('✕', x + w - 46, y + 18)
  addHit(x + w - 56, y + 14, 34, 30, function() aboutOpen = false end)
end

return Hud
