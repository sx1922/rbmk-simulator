local C = require('src.config')
local RNG = require('src.physics.rng')
local G = require('src.state')

local uiScale = 2
local fontM, fontS, fontL, fontLogo
local colors = {
  bg = {0.10,0.10,0.12}, panel = {0.15,0.16,0.19}, panelLight = {0.20,0.21,0.25},
  text = {0.90,0.90,0.95}, dim = {0.55,0.58,0.65}, accent = {0.24,0.58,0.90},
  green = {0.20,0.78,0.35}, yellow = {0.95,0.75,0.20}, red = {0.90,0.25,0.25},
  orange = {1.0,0.55,0.0}, cyan = {0.0,0.85,0.85}, violet = {0.65,0.35,0.95},
  white = {1,1,1}, black = {0,0,0}, panelLine = {0.27,0.28,0.32},
  gaugeTrack = {0.18,0.19,0.22}, gaugeFill = {0.24,0.58,0.90},
  danger = {0.90,0.15,0.15}, warnBg = {0.38,0.20,0.10},
}
local btnState = {}
local scrollY = 0; local scrollTarget = 0
local sliderState = {}
local timeAcc = 0

local function rgba(c, a) return c[1], c[2], c[3], a end
local function lerp(a, b, t) return a + (b - a) * t end
local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end

local function gPrint(s, x, y, r, g, b, a, align)
  if not s or s == '' then return end
  local f = fontM
  if type(r) == 'table' and not g then
    local c = r; r, g, b, a = c[1], c[2], c[3], c[4] or 1
  end
  love.graphics.setColor(r or 1, g or 1, b or 1, a or 1)
  if align == 'center' or align == 'c' then
    love.graphics.printf(s, x, y, 800, 'center')
  elseif align == 'right' or align == 'r' then
    love.graphics.printf(s, x, y, 800, 'right')
  else
    love.graphics.print(s, math.floor(x), math.floor(y))
  end
end

local function rect(x, y, w, h, r, g, b, a)
  if type(r) == 'table' then local c = r; love.graphics.setColor(c[1], c[2], c[3], c[4] or 1)
  else love.graphics.setColor(r or 1, g or 1, b or 1, a or 1) end
  love.graphics.rectangle('fill', math.floor(x), math.floor(y), math.floor(w), math.floor(h))
end

local function outline(x, y, w, h, r, g, b, a, thick)
  love.graphics.setColor(r or 1, g or 1, b or 1, a or 1)
  love.graphics.setLineWidth(thick or 1)
  love.graphics.rectangle('line', math.floor(x), math.floor(y), math.floor(w), math.floor(h))
end

local function panel(x, y, w, h, title)
  rect(x, y, w, h, colors.panel)
  outline(x, y, w, h, colors.panelLine, 0.6)
  if title then
    gPrint(title, x + 6, y + 4, colors.accent)
    love.graphics.line(x + 4, y + 18, x + w - 4, y + 18)
  end
end

local function gauge(x, y, w, h, val, lo, hi, clr, label, showVal, fg)
  rect(x, y, w, h, colors.gaugeTrack)
  local pct = clamp((val - lo) / (hi - lo), 0, 1)
  if pct > 0.01 then
    rect(x + 1, y + 1, (w - 2) * pct, h - 2, clr or colors.gaugeFill)
  end
  if showVal then
    local txt = label and (label .. ' ' .. showVal) or showVal
    gPrint(txt, x + 3, y + 1, fg or colors.text)
  elseif label then
    gPrint(label, x + 3, y + 1, colors.dim)
  end
end

local function btn(x, y, w, h, txt, active, danger, small, disabled)
  local key = txt .. x .. y
  local st = btnState[key] or {hover = false, click = false, held = 0}
  local mx, my = love.mouse.getPosition()
  local hit = mx >= x and mx <= x + w and my >= y and my <= y + h
  if disabled then
    rect(x, y, w, h, {0.18, 0.18, 0.22, 0.5})
    outline(x, y, w, h, {0.3, 0.3, 0.35, 0.4})
    gPrint(txt, x + 3, y + (small and 2 or 3), {0.5,0.5,0.55,0.6})
    return false
  end
  st.hover = hit
  if hit and love.mouse.isDown(1) then
    st.held = math.min(st.held + 0.05, 1)
    if st.held > 0.3 and active then active = false end
  else
    st.held = math.max(st.held - 0.08, 0)
  end
  if active then
    rect(x, y, w, h, danger and colors.danger or colors.accent)
  elseif st.held > 0.1 then
    rect(x, y, w, h, {0.25, 0.26, 0.30})
  elseif hit then
    rect(x, y, w, h, {0.22, 0.23, 0.27})
  else
    rect(x, y, w, h, colors.panelLight)
  end
  outline(x, y, w, h, hit and colors.text or colors.panelLine, 0.5)
  local sz = small and 1 or 2
  gPrint(txt, x + 3, y + (small and 2 or 3), hit and colors.white or colors.text)
  if active and st.held > 0.1 then
    local pct = clamp(st.held / 0.4, 0, 1)
    rect(x, y + h - 3, w * pct, 3, colors.red)
  end
  btnState[key] = st
  if st.click then
    st.click = false
    return true
  end
  if hit and love.mouse.isDown(1) and st.held < 0.05 then
    st.primary = true
  end
  return false
end

local function resetButtons()
  btnState = {}
end

local function slider(x, y, w, val, lo, hi, label, showVal, fmt)
  local key = 'sl' .. x .. y
  local st = sliderState[key] or {val = val}
  local pct = clamp((val - lo) / (hi - lo), 0, 1)
  rect(x, y, w, 10, colors.gaugeTrack)
  local thumbX = x + 4 + (w - 8) * pct
  rect(thumbX - 4, y - 2, 8, 14, colors.accent)
  if label then
    gPrint(label, x, y - 12, colors.dim)
  end
  if showVal then
    local str = fmt and string.format(fmt, val) or tostring(math.floor(val * 10 + 0.5) / 10)
    gPrint(str, x + w + 4, y - 1, colors.text)
  end
  local mx, my = love.mouse.getPosition()
  local hit = mx >= x - 4 and mx <= x + w + 4 and my >= y - 6 and my <= y + 16
  if hit and love.mouse.isDown(1) then
    local npct = clamp((mx - x) / w, 0, 1)
    local nv = lo + (hi - lo) * npct
    val = clamp(nv, lo, hi)
    pct = clamp((val - lo) / (hi - lo), 0, 1)
    thumbX = x + 4 + (w - 8) * pct
  end
  sliderState[key] = {val = val}
  return val
end

local function hotbar(x, y, w, h, val, lo, hi, warnLo, warnHi, dangerLo, dangerHi, clr)
  local pct = clamp((val - lo) / (hi - lo), 0, 1)
  rect(x, y, w, h, colors.gaugeTrack)
  if pct > 0.01 then
    if dangerHi and val > dangerHi then
      rect(x + 1, y + 1, (w - 2) * pct, h - 2, colors.red)
    elseif dangerLo and val < dangerLo then
      rect(x + 1, y + 1, (w - 2) * pct, h - 2, colors.violet)
    elseif warnHi and val > warnHi then
      rect(x + 1, y + 1, (w - 2) * pct, h - 2, colors.yellow)
    elseif warnLo and val < warnLo then
      rect(x + 1, y + 1, (w - 2) * pct, h - 2, colors.orange)
    else
      rect(x + 1, y + 1, (w - 2) * pct, h - 2, clr or colors.green)
    end
  end
end

local function initFonts()
  if fontS then return end
  fontS = love.graphics.newFont(11 * uiScale)
  fontM = love.graphics.newFont(13 * uiScale)
  fontL = love.graphics.newFont(17 * uiScale)
  fontLogo = love.graphics.newFont(28 * uiScale)
  love.graphics.setFont(fontM)
end

local page = 0
local pages = {'反应堆','热工','汽轮机','仪表','任务','运营','值班','概况'}

local function drawChart(x, y, w, h, data, clr, lo, hi)
  if #data < 2 then return end
  rect(x, y, w, h, {0.08,0.08,0.10})
  outline(x, y, w, h, colors.panelLine, 0.4)
  local n = #data
  local yLo = lo or 0; local yHi = hi or 3200
  local pts = {}
  for i = 1, n do
    local px = x + (i - 1) / (n - 1) * w
    local py = y + h - (clamp((data[i] - yLo) / (yHi - yLo), 0, 1)) * h
    table.insert(pts, px); table.insert(pts, py)
  end
  love.graphics.setColor(clr and clr[1] or 0.24, clr and clr[2] or 0.58, clr and clr[3] or 0.90, 0.7)
  love.graphics.setLineWidth(1.5)
  love.graphics.line(unpack(pts))
end

local function drawIntroScreen(dt)
  love.graphics.setColor(0.08, 0.08, 0.10, 1)
  love.graphics.rectangle('fill', 0, 0, 800, 600)
  love.graphics.setColor(0.95, 0.92, 0.80, 0.12)
  love.graphics.setFont(fontLogo)
  love.graphics.printf('RBMK-1000', 0, 80, 800, 'center')
  love.graphics.setFont(fontM)
  love.graphics.setColor(0.55, 0.58, 0.65, 1)
  love.graphics.printf('列宁核电站·第四机组', 0, 158, 800, 'center')
  love.graphics.printf('Реактор Большой Мощности Канальный', 0, 184, 800, 'center')
  love.graphics.setColor(0.40, 0.43, 0.50, 1)
  local ver = 'v1.0 — 1986年4月'
  love.graphics.printf(ver, 0, 560, 800, 'center')
  local bx, by = 260, 340
  local bw, bh = 280, 42
  btn(bx, by, bw, bh, '新游戏', page == -1)
  btn(bx, by + 50, bw, bh, '载入存档', page == -2)
  btn(bx, by + 100, bw, bh, '退出', page == -3)
end

local function drawGameOver(dt)
  love.graphics.setColor(0.05, 0.05, 0.06, 1)
  love.graphics.rectangle('fill', 0, 0, 800, 600)
  love.graphics.setFont(fontL)
  gPrint('切尔诺贝利核电站', 400, 50, colors.red, nil, nil, 'c')
  gPrint('第四机组运行报告', 400, 80, colors.dim, nil, nil, 'c')
  love.graphics.setFont(fontM)
  gPrint(G.overReason or '原因未知', 400, 140, colors.text, nil, nil, 'c')
  love.graphics.line(200, 170, 600, 170)
  local stats = G.overStats or {}
  local lines = {
    '运行天数', tostring(stats.daysOp or 0),
    '总发电量 MWh', tostring(stats.totalGen or 0),
    '故障停堆', tostring(stats.scrams or 0),
    '事件/事故', tostring(stats.incidents or 0),
    '剩余资金 ₽', stats.money and G:fmt(stats.money) or '0',
    '成就', tostring(stats.ach or 0),
  }
  for i = 1, #lines, 2 do
    local ly = 190 + (i / 2) * 28
    gPrint(lines[i], 210, ly, colors.dim)
    gPrint(lines[i + 1], 500, ly, colors.text, nil, nil, 'r')
  end
  gPrint('评分', 210, 362, colors.accent)
  gPrint(tostring(G.overScore or 0), 500, 362, colors.accent, nil, nil, 'r')
  gPrint(G.overRating or '', 400, 392, colors.yellow, nil, nil, 'c')
  love.graphics.line(200, 430, 600, 430)
  btn(280, 450, 240, 40, '返回主菜单', false)
  btn(280, 500, 240, 40, '退出游戏', false)
end

local function drawReactorPanel(dt)
  panel(8, 28, 784, 168, '反应堆状态')
  local r = G.r
  local pct = r.power / C.RATED_T * 100
  local pctStr = string.format('%.1f%%', pct)
  hotbar(18, 48, 760, 18, r.power, 0, C.MELT_T * 1.5, C.RATED_T * 0.8, nil, C.MELT_T, nil, colors.green)
  gPrint('功率 ' .. pctStr .. ' (' .. G:fmt(r.power) .. '/' .. C.RATED_T .. ' MWt)', 22, 48, colors.text)
  local stateColors = {POWER = 'green', SHUTDOWN = 'violet', SCRAM = 'red', LOWPOW = 'yellow', EXPLOSION = 'red', MELTDOWN = 'red'}
  local sc = stateColors[r.state] or 'dim'
  gPrint('状态: ' .. (C.STATE_NAMES[r.state] or r.state), 22, 70, colors[sc])
  gPrint('ORM: ' .. string.format('%.1f', r:orm()) .. ' 根当量', 22, 90, colors.text)
  local voidPct = (r.void or 0) * 100
  local voidClr = voidPct > 30 and 'yellow' or voidPct > 15 and 'orange' or 'dim'
  gPrint('空泡: ' .. string.format('%.1f', voidPct) .. '%', 240, 90, colors[voidClr])
  gPrint('反应性: ' .. string.format('%+.4f', r.reactivity or 0), 400, 90, colors.text)
  gPrint('氙: ' .. string.format('%.4f', r.xenon or 0), 560, 90, colors.text)
  gPrint('碘: ' .. string.format('%.4f', r.iodine or 0), 560, 110, colors.dim)
  gPrint('燃料温度: ' .. G:fmt(r.fuelT) .. ' °C', 22, 110, colors.text)
  local fClr = r.fuelT > 1600 and 'red' or r.fuelT > 1000 and 'yellow' or 'text'
  gPrint('石墨温度: ' .. G:fmt(r.graphiteT) .. ' °C', 240, 110, colors.dim)
  gPrint('冷却剂入口: ' .. G:fmt(r.coolIn) .. ' °C', 22, 130, colors.dim)
  gPrint('冷却剂出口: ' .. G:fmt(r.coolOut) .. ' °C', 240, 130, colors.text)
  gPrint('流量: ' .. G:fmt(r.flow) .. ' m³/h', 480, 130, colors.text)
  gPrint('ГЦН: ' .. r.pumpsOn .. '/8', 660, 130, r.pumpsOn <= 4 and colors.red or colors.text)

  local sx = 18; local sy = 160
  gPrint('控制棒组 (ORM=' .. string.format('%.1f', r:orm()) .. ')', sx, sy, colors.dim)
  local bw = 5; local bh = 30; local gap = 3
  for i = 1, 8 do
    local ax = sx + (i - 1) * (bw + gap) * 4
    for j = 0, 3 do
      local idx = i + j * 8
      if idx <= C.NUM_RODS then
        local rodPct = (r.rods[idx] or 100) / 100
        local rx = ax + j * (bw + gap)
        local ry = sy + bh + 4 - bh * rodPct
        rect(rx, ry, bw, bh * rodPct, rodPct > 0.5 and colors.green or colors.violet)
        outline(rx, ry, bw, bh * rodPct, colors.panelLine, 0.3)
      end
    end
  end
  drawChart(18, 200, 380, 90, G.trend, colors.green, nil, C.MELT_T * 1.5)
  gPrint('功率趋势', 20, 198, colors.dim)
  drawChart(412, 200, 380, 90, G.xenonTrend, colors.cyan, 0, 5)
  gPrint('氙趋势', 414, 198, colors.dim)

  panel(8, 296, 784, 142, '操作')
  local by = 318
  local rem = (r.rods[1] or 100)
  btn(18, by, 100, 28, '提棒 ↑', false, false, true)
  btn(128, by, 100, 28, '插棒 ↓', false, false, true)
  gPrint('手动步进', 250, by + 5, colors.dim)
  btn(18, by + 34, 100, 28, '±400 MW', false, false, true)
  btn(128, by + 34, 100, 28, '降 400 MW', false, false, true)
  btn(18, by + 68, 100, 28, '+1 台泵', false)
  btn(128, by + 68, 100, 28, '-1 台泵', false)
  btn(238, by + 68, 100, 28, '恢复 8 台泵', false, false, true)
  btn(378, by, 120, 28, '启动反应堆', G.r.state ~= 'POWER', false, false, G.r.state ~= 'SHUTDOWN')
  btn(378, by + 34, 120, 28, 'AZ-5 紧急停堆', false, true)
  btn(378, by + 68, 120, 28, '换料操作', false, false, false, G.money < 15000)
  btn(548, by, 120, 28, '保存游戏', false)
  btn(548, by + 34, 120, 28, '推进 8h', false, false, true)
  gPrint('机组日历: ' .. G.year .. '年' .. G.month .. '月' .. G.day .. '日 ' .. G.hour .. ':00', 548, by + 76, colors.dim)
  gPrint('当值: ' .. G.shiftNames[G.shift + 1] .. '班', 548, by + 94, colors.accent)
end

local function drawThermalPanel(dt)
  panel(8, 28, 784, 168, '热工水力 — 五区模型')
  local th = G.thermal
  if not th or not th.zones then
    gPrint('热工数据不可用', 20, 60, colors.dim)
    return
  end
  local labels = {'下堆芯(N4)','下活性区(N5)',' 核心(N6)','上活性区(N7)','上堆芯(N8)'}
  local bw = 148
  for i, z in ipairs(th.zones) do
    local bx = 12 + (i - 1) * (bw + 10)
    rect(bx, 50, bw, 140, colors.panelLight)
    outline(bx, 50, bw, 140, colors.panelLine, 0.5)
    gPrint(labels[i] or '区' .. i, bx + 4, 54, colors.accent)
    local fuelClr = z.tFuel > 1600 and colors.red or z.tFuel > 1000 and colors.yellow or colors.text
    gPrint('燃料 ' .. G:fmt(z.tFuel) .. '°C', bx + 4, 72, fuelClr)
    gPrint('包壳 ' .. G:fmt(z.tClad) .. '°C', bx + 4, 90, colors.text)
    local tOutClr = z.tOut > 290 and colors.red or z.tOut > 280 and colors.yellow or colors.text
    gPrint('出口 ' .. G:fmt(z.tOut) .. '°C', bx + 4, 108, tOutClr)
    gPrint('入口 ' .. G:fmt(z.tIn) .. '°C', bx + 4, 126, colors.dim)
    local voidPct = (z.void or 0) * 100
    gPrint('空泡 ' .. string.format('%.1f', voidPct) .. '%', bx + 4, 144, colors.cyan)
    local dnbrClr = z.dnbr and z.dnbr < 1.3 and colors.red or z.dnbr and z.dnbr < 2.0 and colors.yellow or colors.green
    gPrint('DNBR ' .. (z.dnbr and string.format('%.2f', z.dnbr) or 'N/A'), bx + 4, 162, dnbrClr)
  end

  local sy = 204
  panel(8, sy, 784, 50, '系统参数')
  gPrint('总空泡: ' .. string.format('%.1f%%', (th.totalVoid or 0) * 100), 20, sy + 22, colors.cyan)
  gPrint('冷却剂流量: ' .. G:fmt(th.coolantFlow or 0) .. ' m³/h', 260, sy + 22, colors.text)
  gPrint('ГЦН: ' .. (th.pumpsOn or 0) .. '/8', 540, sy + 22, (th.pumpsOn or 0) <= 4 and colors.red or colors.text)

  panel(8, 260, 784, 170, '各 区 功率 及 出口温度')
  local zlabels = {'#1','#2','#3','#4','#5'}
  local barW = 140; local barH = 14
  for i, z in ipairs(th.zones) do
    local bx = 14 + (i - 1) * (barW + 12)
    local powPct = (z.power or 0) / math.max(0.1, th.zones[3].power or 1) * 100
    rect(bx, 280, barW, barH, colors.gaugeTrack)
    rect(bx + 1, 281, (barW - 2) * clamp(powPct / 100, 0, 1), barH - 2, colors.accent)
    gPrint(zlabels[i] .. ' 功率', bx, 276, colors.dim)
    gPrint(string.format('%.1f%%', powPct), bx + barW - 50, 276, colors.text)
    local tPct = (z.tOut - 250) / 70
    rect(bx, 302, barW, barH, colors.gaugeTrack)
    local tClr = z.tOut > 290 and colors.red or z.tOut > 280 and colors.yellow or colors.green
    rect(bx + 1, 303, (barW - 2) * clamp(tPct, 0, 1), barH - 2, tClr)
    gPrint('出口 ' .. G:fmt(z.tOut) .. '°C', bx + 2, 302, colors.text)
  end
end

local function drawTurbinePanel(dt)
  local t = G.turbine
  if not t then
    gPrint('汽轮机数据不可用', 20, 60, colors.dim)
    return
  end
  panel(8, 28, 784, 130, '汽轮机 К-500-240/3000')
  local spdRpm = t.speed or 0
  local spdClr = spdRpm > 3100 and colors.red or spdRpm > 3050 and colors.yellow or colors.text
  gPrint('转速: ' .. string.format('%.0f', spdRpm) .. ' rpm', 20, 52, spdClr)
  local spdPct = clamp((spdRpm - 2850) / 300, 0, 1)
  gauge(130, 54, 200, 14, spdPct, 0, 1, spdClr, nil, nil)
  gPrint('蒸汽压力: ' .. string.format('%.2f', t.steamPressure or 0) .. ' MPa', 20, 72, colors.text)
  gPrint('蒸汽温度: ' .. G:fmt(t.steamTemp or 0) .. ' °C', 20, 92, colors.text)
  gPrint('蒸汽流量: ' .. string.format('%.1f', t.steamFlow or 0) .. ' t/h', 260, 52, colors.text)
  gPrint('给水流量: ' .. string.format('%.1f', t.fwFlow or 0) .. ' t/h', 260, 72, colors.text)
  gPrint('电功率: ' .. string.format('%.1f', t.electricPower or 0) .. ' MWe', 260, 92, colors.green)
  gPrint('凝汽器真空: ' .. string.format('%.4f', t.condenserVacuum or 0) .. ' MPa', 480, 52, colors.dim)
  local onlineClr = t.online and colors.green or colors.red
  gPrint('状态: ' .. (t.online and '在线' or '离线'), 480, 72, onlineClr)
  gPrint('健康: ' .. string.format('%.0f', t.health or 0) .. '%', 480, 92, t.health and t.health < 40 and colors.red or colors.text)
  if t.tripped then
    gPrint('⚠ 跳闸！', 648, 52, colors.red)
  end
  gPrint('振动: ' .. string.format('%.4f', t.vibration or 0) .. ' mm', 648, 72, t.vibration and t.vibration > 0.5 and colors.red or colors.dim)
  gPrint('轴向位移: ' .. string.format('%.2f', t.axialShift or 0) .. ' mm', 648, 92, t.axialShift and math.abs(t.axialShift or 0) > 0.5 and colors.red or colors.dim)
  gPrint('阀门旁路: ' .. string.format('%.0f', t.bypassValve or 0) .. '%', 648, 112, colors.text)

  panel(8, 164, 784, 90, '操作')
  btn(18, 186, 120, 28, '汽轮机在线', t.online, false, false, t.tripped)
  btn(148, 186, 120, 28, '重置跳闸', false, false, false, not t.tripped)
  btn(278, 186, 120, 28, '检修涡轮机', false, false, false, G.money < 60000)
  gPrint('旁路阀控制', 430, 186, colors.dim)
  local bv = t.bypassValve or 0
  local nv = slider(430, 200, 200, bv, 0, 100, nil, true, '%.0f%%')
  t.bypassValve = nv

  panel(8, 258, 784, 100, '跳闸条件监测')
  local tripData = {
    {'超速 > 3150 rpm', (t.speed or 0) > 3150, (t.speed or 0), 3150},
    {'低真空 < 0.003 MPa', (t.condenserVacuum or 0) < 0.003, (t.condenserVacuum or 0), 0.003},
    {'高振动 > 1.0 mm', (t.vibration or 0) > 1.0, (t.vibration or 0), 1.0},
    {'轴向位移 > 0.8 mm', math.abs(t.axialShift or 0) > 0.8, math.abs(t.axialShift or 0), 0.8},
  }
  for i, td in ipairs(tripData) do
    local ty = 280 + (i - 1) * 18
    gPrint(td[1], 20, ty, td[2] and colors.red or colors.dim)
    gPrint((td[3] and string.format('当前: %.3f', td[3]) or ''), 320, ty, td[2] and colors.red or colors.dim)
  end
end

local function drawInstrumentsPanel(dt)
  local inst = G.instruments
  if not inst or not inst.list then
    gPrint('仪表系统不可用', 20, 60, colors.dim)
    return
  end
  panel(8, 28, 784, 60, '仪表盘 — 读数')
  local defs = {
    {'功率表', 'power_meter', 'MWt'},
    {'中子通量', 'neutron_flux', '%'},
    {'热电偶', 'thermocouple', '°C'},
    {'压力计', 'pressure_p', 'MPa'},
    {'流量计', 'flow_meter', 'm³/h'},
    {'空泡计', 'void_meter', '%'},
    {'辐射计', 'rad_meter', 'mSv'},
    {'转速表', 'tachometer', 'rpm'},
    {'蒸汽压力', 'steam_p', 'MPa'},
    {'给水流量', 'fw_meter', 't/h'},
  }
  for i, d in ipairs(defs) do
    local col = (i - 1) % 2
    local row = math.floor((i - 1) / 2)
    local ix = 14 + col * 380
    local iy = 52 + row * 18
    local id = d[2]
    local v = inst:read(id)
    gPrint(d[1] .. ':', ix, iy, colors.dim)
    gPrint((v ~= nil and string.format('%.1f', v) or '---') .. ' ' .. d[3], ix + 110, iy, colors.text)
    local fault = inst:getFault(id)
    if fault then
      gPrint('⚡ ' .. fault, ix + 260, iy, colors.red)
    end
  end

  panel(8, 230, 784, 90, '校准')
  btn(18, 252, 100, 28, '校准全部', false)
  btn(128, 252, 100, 28, '更换全部', false, false, false, G.money < 20000)
  gPrint('—— 仪表读数已受老化及模拟元件影响 ——', 260, 258, colors.dim)
  btn(18, 290, 140, 28, '注入故障(测试)', false, false, true)
end

local function drawMissionPanel(dt)
  local m = G.mission
  if not m then
    gPrint('任务系统不可用', 20, 60, colors.dim)
    return
  end
  panel(8, 28, 784, 100, '安全试验任务链')
  if not m.active and m.completed then
    gPrint('✅ 安全试验已完成', 20, 56, colors.green)
    return
  end
  if not m.active and m.failed then
    gPrint('❌ 安全试验失败', 20, 56, colors.red)
    return
  end
  if not m.active then
    gPrint('等待触发条件 (运行≥1天, 功率≥80%, 信任≥30)', 20, 56, colors.dim)
    gPrint('状态: 待命', 20, 80, colors.dim)
    return
  end
  local phases = {'idle','order_received','power_reduction','dispatch_call','low_power_wait','power_drop','decision','rod_withdraw','experiment_prep','turbine_trip','power_rise','final_choice','completed','failed'}
  local phaseNames = {'待命中','收到指令','降功率','调度通知','低功率等待','功率下降','决策点','提棒准备','试验准备','汽轮机跳闸','功率上升','最终选择','已完成','失败'}
  local curIdx = 1
  for i, p in ipairs(phases) do
    if p == m.phase then curIdx = i; break end
  end
  for i, pn in ipairs(phaseNames) do
    local px = 14 + (i - 1) * 58
    local py = 54
    local isDone = i < curIdx
    local isCur = i == curIdx
    rect(px, py, 50, 18, isDone and colors.green or isCur and colors.accent or colors.panelLight)
    gPrint(pn, px + 2, py + 1, isCur and colors.white or isDone and colors.white or colors.dim)
  end
  gPrint('当前阶段: ' .. (phaseNames[curIdx] or m.phase), 20, 80, colors.accent)
  if m.phase == 'decision' then
    btn(200, 80, 100, 28, '继续实验', false)
    btn(310, 80, 100, 28, '中止实验', false, true)
  elseif m.phase == 'final_choice' then
    btn(200, 80, 100, 28, '继续提升', false)
    btn(310, 80, 100, 28, '紧急停堆', false, true)
  end
  local curPhase = m.phase
  local statusMap = {
    order_received = '等待降功率指令执行',
    power_reduction = '功率降至700MWt以下',
    dispatch_call = '等待调度确认',
    low_power_wait = '功率~700MWt, 等待进一步下降',
    power_drop = '功率快速下降中',
    rod_withdraw = '提棒维持功率',
    experiment_prep = '准备跳闸实验条件',
    turbine_trip = '汽轮机跳闸执行',
    power_rise = '功率上升(正空泡系数!)',
  }
  gPrint(statusMap[curPhase] or '', 20, 100, colors.text)
end

local function drawOperationsPanel(dt)
  panel(8, 28, 784, 120, '运营')
  gPrint('资金: ' .. G:fmt(G.money) .. ' ₽', 20, 52, G.money < 0 and colors.red or colors.green)
  gPrint('上级信任: ' .. G:fmt(G.politics) .. ' / 100', 260, 52, G.politics < 30 and colors.red or colors.text)
  gPrint('累计发电: ' .. G:fmt(G.totalGen) .. ' MWh', 20, 72, colors.text)
  gPrint('计划进度: ' .. G:fmt(G.quotaDone) .. ' / ' .. G:fmt(G.quota), 260, 72, colors.text)
  gPrint('安全系统: ', 20, 94, colors.dim)
  local avg = 0
  for _, s in ipairs(G.safety) do avg = avg + s.status end
  avg = avg / #G.safety
  gPrint(string.format('平均 %.0f%%', avg), 120, 94, avg < 50 and colors.red or avg < 70 and colors.yellow or colors.green)

  panel(8, 154, 784, 100, '安全系统维护')
  for i, s in ipairs(G.safety) do
    local sx = 14 + (i - 1) % 3 * 250
    local sy = 176 + math.floor((i - 1) / 3) * 30
    gPrint(s.name, sx, sy, colors.dim)
    hotbar(sx + 130, sy + 1, 80, 14, s.status, 0, 100, 50, nil, 30, nil)
    gPrint(string.format('%.0f%%', s.status), sx + 218, sy, colors.text)
    btn(sx + 230, sy - 2, 22, 18, '修', false, false, true, G.money < 30000)
  end

  panel(8, 260, 784, 90, '人员')
  local onDuty = {}
  for _, s in ipairs(G.staff) do
    if s.alive and s.shift == G.shift then table.insert(onDuty, s) end
  end
  gPrint('当班: ' .. #onDuty .. ' 人', 20, 284, colors.text)
  btn(140, 284, 100, 24, '招聘 50k₽', false, false, true, G.money < 50000)
  btn(248, 284, 100, 24, '训练当班', false, false, true)
  for i, s in ipairs(onDuty) do
    local sy = 306 + (i - 1) * 18
    if sy < 340 then
      gPrint(s.name, 14, sy, colors.text)
      gPrint(s.spec, 140, sy, colors.dim)
      gPrint(s.skill .. '/' .. math.floor(s.exp) .. 'exp', 260, sy, colors.text)
    end
  end
end

local function drawDutyPanel(dt)
  panel(8, 28, 784, 100, '辐射环境')
  gPrint('环境辐射: ' .. string.format('%.3f', G.rad) .. ' mSv/h', 20, 52, G.rad > 0.5 and colors.red or G.rad > 0.1 and colors.yellow or colors.text)
  local bk = C.BACKGROUND_RAD
  gPrint('本底: ' .. string.format('%.3f', bk) .. ' mSv/h', 260, 52, colors.dim)

  panel(8, 134, 784, 180, '值班日志')
  for i, lg in ipairs(G.logs) do
    if i > 10 then break end
    local ly = 158 + (i - 1) * 16
    local clr = lg.typ == 'danger' and colors.red or lg.typ == 'warn' and colors.yellow or lg.typ == 'good' and colors.green or lg.typ == 'achieve' and colors.violet or lg.typ == 'system' and colors.cyan or colors.dim
    gPrint(lg.time, 14, ly, colors.dim)
    gPrint(lg.msg, 80, ly, clr)
  end
end

local function drawOverviewPanel(dt)
  panel(8, 28, 784, 120, '概览')
  local r = G.r
  gPrint('ORM: ' .. string.format('%.1f', r:orm()), 20, 52, colors.accent)
  gPrint('功率: ' .. string.format('%.0f', r.power) .. ' MWt', 160, 52, colors.text)
  gPrint('3d氙: ' .. string.format('%.4f', r.xenon or 0), 320, 52, colors.text)
  gPrint('燃料: ' .. G:fmt(r.fuelT) .. '°C', 460, 52, colors.text)
  gPrint('平均燃耗: ' .. string.format('%.1f', G.fuelBurn and #G.fuelBurn > 0 and (function() local s=0; for _,v in ipairs(G.fuelBurn) do s=s+v end; return s/#G.fuelBurn end)() or 0) .. ' MWd/t', 20, 72, colors.dim)
  local safeRank = G.safety and #G.safety > 0 and (function() local s=0; for _,v in ipairs(G.safety) do s=s+v.status end; return s/#G.safety end)() or 0
  gPrint('安全评级: ' .. string.format('%.0f', safeRank) .. '%', 20, 92, safeRank < 50 and colors.red or safeRank < 70 and colors.yellow or colors.green)
  gPrint('成就: ' .. #G.achievements .. ' / ' .. #G.ACH, 260, 72, colors.violet)
  gPrint('事件: ' .. G.incidents .. ' / 停堆次数: ' .. G.scrams, 260, 92, colors.text)
  gPrint('涡轮健康: ' .. string.format('%.0f%%', G.turbineHealth or 0), 460, 72, (G.turbineHealth or 0) < 40 and colors.red or colors.text)

  panel(8, 154, 384, 80, '汽轮机')
  local t = G.turbine
  if t then
    gPrint('转速 ' .. string.format('%.0f', t.speed or 0) .. ' rpm', 20, 178, colors.text)
    gPrint('蒸汽 ' .. string.format('%.2f', t.steamPressure or 0) .. ' MPa / ' .. string.format('%.1f', t.steamFlow or 0) .. ' t/h', 20, 196, colors.text)
    gPrint('电功率 ' .. string.format('%.1f', t.electricPower or 0) .. ' MWe', 240, 178, t.online and colors.green or colors.red)
    gPrint('旁路 ' .. string.format('%.0f', t.bypassValve or 0) .. '%', 240, 196, colors.text)
  end

  panel(406, 154, 386, 80, '热工')
  local th = G.thermal
  if th then
    gPrint('总空泡 ' .. string.format('%.1f%%', (th.totalVoid or 0) * 100), 418, 178, colors.cyan)
    gPrint('流量 ' .. G:fmt(th.coolantFlow or 0) .. ' m³/h', 418, 196, colors.text)
  end

  panel(8, 240, 784, 200, '任务链状态 & 仪表健康')
  local m = G.mission
  if m then
    if m.active then
      gPrint('安全试验: 进行中 — ' .. (m.phase or '?'), 20, 264, colors.yellow)
    elseif m.completed then
      gPrint('安全试验: ✅ 已完成', 20, 264, colors.green)
    elseif m.failed then
      gPrint('安全试验: ❌ 失败', 20, 264, colors.red)
    else
      gPrint('安全试验: 待触发', 20, 264, colors.dim)
    end
  end
  local inst = G.instruments
  if inst then
    local faultCount = 0
    for id, _ in pairs(inst.list or {}) do
      local f = inst:getFault(id)
      if f then faultCount = faultCount + 1 end
    end
    gPrint('仪表故障: ' .. faultCount .. ' / 10', 20, 284, faultCount > 0 and colors.yellow or colors.green)
  end
end

function drawFrame(Gref, dt)
  initFonts()
  if not pcall(drawFrame, Gref, dt) then
    love.graphics.setColor(1,1,1,1)
    love.graphics.setFont(fontS)
    love.graphics.print('render error', 400, 300)
  end
end

function draw(Gref, dt)
  G = Gref
  if not G then return end
  timeAcc = timeAcc + dt
  if G.screen == 'intro' then
    drawIntroScreen(dt); return
  end
  if G.screen == 'over' then
    drawGameOver(dt); return
  end
  love.graphics.setColor(0.08, 0.08, 0.10, 1)
  love.graphics.rectangle('fill', 0, 0, 800, 600)

  local tabsX = 8
  local tabY = 2
  page = clamp(page, 0, #pages - 1)
  for i, p in ipairs(pages) do
    local tw = 82
    local tx = tabsX + (i - 1) * (tw + 4)
    if i == page + 1 then
      rect(tx, tabY, tw, 24, colors.accent)
      gPrint(p, tx + 4, tabY + 3, colors.white)
    else
      rect(tx, tabY, tw, 24, colors.panel)
      outline(tx, tabY, tw, 24, colors.panelLine, 0.4)
      gPrint(p, tx + 4, tabY + 3, colors.dim)
    end
  end

  if page == 0 then drawReactorPanel(dt)
  elseif page == 1 then drawThermalPanel(dt)
  elseif page == 2 then drawTurbinePanel(dt)
  elseif page == 3 then drawInstrumentsPanel(dt)
  elseif page == 4 then drawMissionPanel(dt)
  elseif page == 5 then drawOperationsPanel(dt)
  elseif page == 6 then drawDutyPanel(dt)
  elseif page == 7 then drawOverviewPanel(dt)
  end

  local tw, th = 80, 20
  local butX, butY = 8, 500
  local butW, butH = 100, 28
  rect(butX - 4, butY - 4, 788, 100, colors.panel)
  outline(butX - 4, butY - 4, 788, 100, colors.panelLine, 0.4)
  btn(butX, butY, butW, butH, '推进8h', false)
  btn(butX + 110, butY, butW, butH, '保存', false)
  btn(butX + 220, butY, butW, butH, '读档', false)
  btn(butX + 330, butY, butW, butH, '硬重启', false, true)
  btn(butX + 440, butY, butW, butH, '提棒 ↑', false)
  btn(butX + 550, butY, butW, butH, '插棒 ↓', false)
  btn(butX, butY + 34, butW, butH, '+1泵', false)
  btn(butX + 110, butY + 34, butW, butH, '-1泵', false)
  btn(butX + 220, butY + 34, butW, butH, '恢复8泵', false)
  btn(butX + 330, butY + 34, butW, butH, 'AZ-5', false, true)
  btn(butX + 440, butY + 34, butW, butH, '启动', G.r and G.r.state ~= 'POWER', false, false, G.r and G.r.state ~= 'SHUTDOWN')
  btn(butX + 550, butY + 34, butW, butH, '检修涡轮', false, false, false, G.money < 60000)
  btn(butX, butY + 68, butW, butH, '换料', false, false, false, G.money < 15000)
  btn(butX + 110, butY + 68, butW, butH, '培训', false)
  btn(butX + 220, butY + 68, butW, butH, '招聘', false, false, false, G.money < 50000)

  if G.shakeTime > 0 then
    G.shakeX = (math.random() - 0.5) * 20 * (G.shakeTime / 0.7)
    G.shakeY = (math.random() - 0.5) * 12 * (G.shakeTime / 0.7)
  else
    G.shakeX = 0; G.shakeY = 0
  end

  if G.flashAlpha > 0 then
    love.graphics.setColor(1, 1, 1, G.flashAlpha * 0.3)
    love.graphics.rectangle('fill', 0, 0, 800, 600)
    G.flashAlpha = math.max(0, G.flashAlpha - dt * 2)
  end

  if G.toastTimer > 0 then
    local ta = math.min(1, G.toastTimer)
    local tClr = G.toastType == 'danger' and colors.red or G.toastType == 'warn' and colors.yellow or G.toastType == 'good' and colors.green or G.toastType == 'achieve' and colors.violet or colors.accent
    local bx, by = 160, 540
    rect(bx - 8, by - 6, 496, 36, {0.10, 0.10, 0.12, ta * 0.95})
    outline(bx - 8, by - 6, 496, 36, tClr, ta * 0.8)
    love.graphics.setColor(tClr[1], tClr[2], tClr[3], ta)
    gPrint(G.toastMsg, bx, by, tClr[1], tClr[2], tClr[3], ta)
  end
  G.toastTimer = math.max(0, G.toastTimer - dt)
end

function mousemoved(x, y, dx, dy, Gref)
  G = Gref
  love.mouse.setRelativeMode(false)
end

function mousepressed(x, y, button, isTouch, Gref)
  G = Gref
  if not G then return end
  local bw = 100; local bh = 28; local butX = 4; local butY = 496
  local hb = function(rx, ry, rw, rh)
    return x >= rx and x <= rx + rw and y >= ry and y <= ry + rh
  end
  if G.screen == 'intro' then
    if hb(260, 340, 280, 42) then page = -1; return end
    if hb(260, 390, 280, 42) then page = -2; return end
    if hb(260, 440, 280, 42) then page = -3; return end
    return
  end
  if G.screen == 'over' then
    if hb(280, 450, 240, 40) then G:hardReset(); G.screen = 'intro'; page = 0; resetButtons(); return end
    if hb(280, 500, 240, 40) then love.event.quit() end
    return
  end

  if hb(butX, butY, bw, bh) then G:cmdAdvanceShift(); return end
  if hb(butX + 110, butY, bw, bh) then G:cmdSave(); return end
  if hb(butX + 220, butY, bw, bh) then
    if G:cmdLoad() then
      page = 0
      G.screen = 'game'
      G:toast('存档已加载', 'good')
    else
      G:toast('无存档', 'warn')
    end
    return
  end
  if hb(butX + 330, butY, bw, bh) then G:hardReset(); resetButtons(); return end
  if hb(butX + 440, butY, bw, bh) then G:cmdMoveRods(4); return end
  if hb(butX + 550, butY, bw, bh) then G:cmdMoveRods(-4); return end
  if hb(butX, butY + 34, bw, bh) then G:cmdPumpDelta(1); return end
  if hb(butX + 110, butY + 34, bw, bh) then G:cmdPumpDelta(-1); return end
  if hb(butX + 220, butY + 34, bw, bh) then G:cmdPumpReset(); return end
  if hb(butX + 330, butY + 34, bw, bh) then
    if G.r and G.r.state ~= 'SHUTDOWN' and G.r.state ~= 'SCRAM' then
      G:cmdAz5Fire()
    end
    return
  end
  if hb(butX + 440, butY + 34, bw, bh) then G:cmdStartup(); return end
  if hb(butX + 550, butY + 34, bw, bh) then G:cmdRepairTurbine(); return end
  if hb(butX, butY + 68, bw, bh) then G:cmdRefuel(); return end
  if hb(butX + 110, butY + 68, bw, bh) then G:cmdTrain(); return end
  if hb(butX + 220, butY + 68, bw, bh) then G:cmdHire(); return end

  for i, p in ipairs(pages) do
    local tw = 82
    local tx = 8 + (i - 1) * (tw + 4)
    if hb(tx, 2, tw, 24) then page = i - 1; return end
  end

  if page == 2 then
    local t = G.turbine
    if hb(18, 186, 120, 28) then
      if not t.tripped then
        t.online = not t.online
        G:log(t.online and 'good' or 'warn', '汽轮机 ' .. (t.online and '在线' or '离线') .. '。')
      end
      return
    end
    if hb(148, 186, 120, 28) then
      t.tripped = false; t.health = math.max(40, t.health)
      G:log('good', '汽轮机跳闸复位。')
      return
    end
    if hb(278, 186, 120, 28) then
      G:cmdRepairTurbine()
      return
    end
  end

  if page == 3 then
    if hb(18, 252, 100, 28) then
      G.instruments:calibrateAll(function(a, b) return G.rng:range(a, b) end)
      G:log('info', '全部仪表已校准。')
      return
    end
    if hb(128, 252, 100, 28) then
      for id, _ in pairs(G.instruments.list) do
        G.instruments.list[id].calAge = 0
        G.instruments.list[id].fault = nil
      end
      G.money = G.money - 20000
      G:log('info', '全部仪表已更换。')
      return
    end
    if hb(18, 290, 140, 28) then
      G.instruments:injectFault(function(a, b) return G.rng:range(a, b) end)
      G:log('warn', '注入随机仪表故障(测试)。')
      return
    end
  end

  if page == 4 then
    local m = G.mission
    if m and m.active then
      if m.phase == 'decision' then
        if hb(200, 80, 100, 28) then m:handleDecision(G, 'continue') end
        if hb(310, 80, 100, 28) then m:handleDecision(G, 'abort') end
      elseif m.phase == 'final_choice' then
        if hb(200, 80, 100, 28) then m:handleDecision(G, 'continue') end
        if hb(310, 80, 100, 28) then G:cmdAz5Fire() end
      end
    end
  end
end

function keypressed(key, scancode, isRepeat, Gref)
  G = Gref
  if not G then return end
  if G.screen == 'intro' then
    if key == 'return' or key == 'space' then page = -1 end
    return
  end
  if key == 'escape' then
    if G.screen == 'over' then G:hardReset(); G.screen = 'intro'; page = 0; resetButtons() end
    return
  end
  if key == 'tab' then page = (page + 1) % #pages end
  if key == 'f5' then G:cmdSave() end
  if key == 'f9' then
    if G:cmdLoad() then page = 0; G.screen = 'game'; G:toast('存档已加载', 'good')
    else G:toast('无存档', 'warn') end
  end
  if key == 'up' or key == 'w' then G:cmdMoveRods(4) end
  if key == 'down' or key == 's' then G:cmdMoveRods(-4) end
  if key == 'space' then G:cmdAdvanceShift() end
  if key == 'a' then G:cmdPumpDelta(1) end
  if key == 'z' then G:cmdPumpDelta(-1) end
  if key == 'r' then G:cmdPumpReset() end
  if key == '1' then G:cmdStartup() end
  if key == '2' and G.r and G.r.state ~= 'SHUTDOWN' and G.r.state ~= 'SCRAM' then G:cmdAz5Fire() end
  if key == '3' then G:cmdRefuel() end
  if key == '4' then G:cmdRepairTurbine() end
  if key == '5' then G:cmdTrain() end
  if key == '6' then G:cmdHire() end
end

function resize(w, h)
  local s = math.min(w / 800, h / 600)
  uiScale = s * 2
  fontS = nil; fontM = nil; fontL = nil; fontLogo = nil
  initFonts()
end
