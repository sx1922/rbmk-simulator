-- hud.lua — 主控室 HUD · web/index.html + render.js + REACTOR_UI_ADAPT 的 LÖVE 适配
-- 设计坐标 1600×900（Layout letterbox）。
-- 区域：1 反应堆面板 | 2 汽机/给水 | 3 辅助/辐射 | 4 报警灯阵+КВИТ | 底部日志
-- 浮层：story HUD（幕次/任务/日历）、endless HUD、电话/对话、点火/熔毁演出、无尽面板。

local Theme = require('src.ui.theme')
local W = require('src.ui.widgets')
local Engine = require('src.engine')
local Instrument = require('src.instrument')
local Journal = require('src.journal')

local Hud = {}

local S = nil -- Engine.S 快捷引用（draw 时取）

-- ==================== 输入状态 ====================

local drag = nil            -- { kind='target'|'valve', ... }
local rodHold = 0           -- -1/0/1（鼠标按住提插棒）
local azCoverOpen = false
local kvitPressed = 0
local logScroll = 0
local quadModeSplit = false
local floatClicked = false

-- story HUD 状态
local story = { act = nil, actRu = '', actCn = '', obj = '', objDone = false }

-- 无尽 HUD 状态
local endlessHudVisible = false

-- 无尽面板（结算/事件/班组等）状态
local panel = nil           -- { kind, data, buttons = { {x,y,w,h,id} } }

-- ==================== 常量 ====================

local LOG_X, LOG_Y, LOG_W, LOG_H = 16, 762, 1568, 128
local TS_OPTIONS = { 1, 10, 60 }

local LAMP_DEFS = {
  { key = 'P1', label = 'П1', color = 'red' },
  { key = 'P2', label = 'П2', color = 'red' },
  { key = 'P3', label = 'П3', color = 'red' },
  { key = 'P4', label = 'П4', color = 'red' },
  { key = 'P5', label = 'П5', color = 'red' },
  { key = 'AZ', label = 'АЗ-5', color = 'red' },
  { key = 'SEP_LO', label = '水位低', color = 'orange', state = true },
  { key = 'SEP_HI', label = '水位高', color = 'orange', state = true },
  { key = 'FW_COLD', label = '给水低温', color = 'yellow', state = true },
  { key = 'THERMAL_SH', label = '热冲击', color = 'orange', state = true },
  { key = 'CLAD', label = '包壳', color = 'red', state = true },
  { key = 'PERIOD_W', label = '周期警', color = 'yellow', state = true },
  { key = 'PERIOD_C', label = '周期危', color = 'red', state = true },
  { key = 'DECAY', label = '衰变热', color = 'orange', state = true },
  { key = 'RAD', label = '辐射', color = 'red', state = true },
}

local LAMP_COLORS = {
  red = { 0.95, 0.2, 0.14 },
  orange = { 1, 0.55, 0.15 },
  yellow = { 1, 0.85, 0.25 },
}

-- ==================== 绘制原语 ====================

local function panel(x, y, w, h, title)
  love.graphics.setColor(Theme.panel2)
  love.graphics.rectangle('fill', x, y, w, h, 6)
  love.graphics.setColor(Theme.edge)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 6)
  if title then
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.setFont(Theme.getFont(10))
    love.graphics.print(title, x + 10, y + 6)
    love.graphics.setColor(Theme.edgeLo)
    love.graphics.line(x + 6, y + 24, x + w - 6, y + 24)
  end
end

local function readout(x, y, w, h, label, value, unit, color, alarm)
  W.readout(x, y, w, h, label, value, unit, color, alarm)
end

-- 圆表盘
local function gauge(x, y, r, frac, label, sub, redFrom)
  frac = math.max(0, math.min(1, frac or 0))
  love.graphics.setColor(Theme.panel4)
  love.graphics.circle('fill', x, y, r)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.setLineWidth(2)
  love.graphics.circle('line', x, y, r)
  -- 刻度
  for i = 0, 10 do
    local a = math.pi * 0.75 + math.pi * 1.5 * (i / 10)
    local x1 = x + math.cos(a) * (r - 6)
    local y1 = y + math.sin(a) * (r - 6)
    local x2 = x + math.cos(a) * (r - (i % 5 == 0 and 14 or 10))
    local y2 = y + math.sin(a) * (r - (i % 5 == 0 and 14 or 10))
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.setLineWidth(i % 5 == 0 and 2 or 1)
    love.graphics.line(x1, y1, x2, y2)
  end
  -- 红区
  if redFrom then
    local a0 = math.pi * 0.75 + math.pi * 1.5 * redFrom
    love.graphics.setColor(0.95, 0.2, 0.14, 0.35)
    love.graphics.setLineWidth(5)
    love.graphics.arc('line', x, y, r - 9, a0, math.pi * 0.75 + math.pi * 1.5)
  end
  -- 指针
  local na = math.pi * 0.75 + math.pi * 1.5 * frac
  love.graphics.setColor(Theme.red)
  love.graphics.setLineWidth(2)
  love.graphics.line(x, y, x + math.cos(na) * (r - 16), y + math.sin(na) * (r - 16))
  love.graphics.setColor(Theme.txtDim)
  love.graphics.circle('fill', x, y, 3)
  -- 标签
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(9))
  local lw = love.graphics.getFont():getWidth(label)
  love.graphics.print(label, x - lw / 2, y + r / 2 - 4)
  if sub then
    love.graphics.setColor(Theme.amber)
    love.graphics.setFont(Theme.getFont(11))
    local sw = love.graphics.getFont():getWidth(sub)
    love.graphics.print(sub, x - sw / 2, y + 8)
  end
end

-- 竖条液位计
local function vbar(x, y, w, h, frac, bands)
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', x, y, w, h, 3)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.rectangle('line', x, y, w, h, 3)
  if bands then
    for _, b in ipairs(bands) do
      local by = y + h * (1 - b.hi)
      local bh = h * (b.hi - b.lo)
      love.graphics.setColor(b.color[1], b.color[2], b.color[3], 0.25)
      love.graphics.rectangle('fill', x + 1, by, w - 2, bh)
    end
  end
  local fh = (h - 4) * math.max(0, math.min(1, frac))
  love.graphics.setColor(Theme.blue)
  love.graphics.rectangle('fill', x + 2, y + h - 2 - fh, w - 4, fh, 2)
end

-- 滑杆（水平）
local function slider(id, x, y, w, val, lo, hi, label, fmt)
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', x, y + 8, w, 8, 4)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.rectangle('line', x, y + 8, w, 8, 4)
  local frac = (val - lo) / (hi - lo)
  love.graphics.setColor(Theme.amber)
  love.graphics.rectangle('fill', x, y + 8, math.max(1, w * math.min(1, math.max(0, frac))), 8, 4)
  local knobX = x + w * math.min(1, math.max(0, frac)) - 7
  love.graphics.setColor(Theme.txt)
  love.graphics.rectangle('fill', knobX, y + 2, 14, 20, 3)
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.print(label, x, y - 4)
  local vt = fmt and fmt(val) or tostring(math.floor(val + 0.5))
  love.graphics.setColor(Theme.amber)
  love.graphics.setFont(Theme.getFont(11))
  love.graphics.print(vt, x + w - love.graphics.getFont():getWidth(vt), y - 6)
  return knobX
end

-- rocker 按钮组
local function rocker(id, x, y, options, activeIdx, w, h)
  w = w or 64
  h = h or 26
  local clicked = 0
  for i, opt in ipairs(options) do
    local bx = x + (i - 1) * (w + 4)
    local active = i == activeIdx
    love.graphics.setColor(active and { 0.55, 0.4, 0.12 } or Theme.panel4)
    love.graphics.rectangle('fill', bx, y, w, h, 3)
    love.graphics.setColor(active and Theme.amber or Theme.edgeLo)
    love.graphics.setLineWidth(1)
    love.graphics.rectangle('line', bx, y, w, h, 3)
    love.graphics.setColor(active and Theme.amber or Theme.txtFaint)
    love.graphics.setFont(Theme.getFont(10))
    local tw = love.graphics.getFont():getWidth(opt)
    love.graphics.print(opt, bx + w / 2 - tw / 2, y + h / 2 - 6)
    local mx, my = W.mouse.x, W.mouse.y
    if mx >= bx and mx <= bx + w and my >= y and my <= y + h and W.mouse.pressed then
      clicked = i
    end
  end
  return clicked
end

local function hitbox(x, y, w, h)
  local mx, my = W.mouse.x, W.mouse.y
  return mx >= x and mx <= x + w and my >= y and my <= y + h
end

local function button(x, y, w, h, label, opts)
  opts = opts or {}
  local hover = hitbox(x, y, w, h)
  local pressed = hover and W.mouse.pressed
  local bg = opts.active and { 0.55, 0.4, 0.12 } or Theme.panel4
  if hover then
    bg = { bg[1] + 0.07, bg[2] + 0.07, bg[3] + 0.07 }
  end
  love.graphics.setColor(bg)
  love.graphics.rectangle('fill', x, y, w, h, 3)
  love.graphics.setColor(opts.danger and Theme.redDeep or Theme.edgeLo)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 3)
  love.graphics.setColor(opts.color or (opts.active and Theme.amber or Theme.txtDim))
  love.graphics.setFont(Theme.getFont(opts.size or 10))
  local tw = love.graphics.getFont():getWidth(label)
  love.graphics.print(label, x + w / 2 - tw / 2, y + h / 2 - (opts.size or 10) * 0.62)
  return pressed
end

local function formatClock(t)
  local function p2(n)
    n = math.floor(n)
    if n < 10 then return '0' .. n end
    return tostring(n)
  end
  return p2((t / 3600) % 24) .. ':' .. p2((t / 60) % 60) .. ':' .. p2(t % 60)
end

-- ==================== 区域绘制 ====================

local function drawZone1(App)
  panel(16, 56, 584, 592, 'РЕАКТОР · 反应堆控制')
  local S = Engine.S
  local cx = 136

  -- 功率表
  local disp = Instrument.update('power', Instrument.truncatePower(S.n), App.lastDt or 0.016)
  local mw = math.floor(S.n * Engine.N_NOM + 0.5)
  gauge(cx, 150, 78, disp / 1.2, 'N %Ном', mw .. ' МВт', 110 / 120)
  -- 周期表（对数：中心 ∞，右正左负）
  local per = S.period
  local pfrac = 0.5
  if per ~= math.huge and per ~= -per and math.abs(per) < 1000 then
    -- 对数映射：-10..+10 秒 → 0..1（中心 0.5）
    local lg = math.log10(math.abs(per)) / 3 -- 1..1000 → 0..1
    pfrac = 0.5 + (per > 0 and lg * 0.5 or -lg * 0.5)
    pfrac = math.max(0, math.min(1, pfrac))
  end
  gauge(cx, 300, 60, pfrac, 'ПЕРИОД, с', per == math.huge and '∞' or
    (math.abs(per) >= 1000 and '∞' or string.format('%.0f', per)), nil)

  -- ORM / 氙 / 空泡 读数
  readout(232, 96, 160, 44, 'ОЗР / ОРМ 根', tostring(S.opr), '安全裕度',
    S.opr < 15 and Theme.red or (S.opr < 26 and Theme.amber or Theme.green), S.opr < 15)
  readout(404, 96, 176, 44, 'XE-135 氙毒', string.format('%.2f', S.xe), '碘坑风险',
    S.xe > 1.2 and Theme.red or (S.xe > 0.8 and Theme.amber or Theme.txt))
  readout(232, 148, 160, 44, 'α 空泡份额 %', string.format('%.1f', S.voidFrac), 'RBMK 正反馈核心',
    S.voidFrac > 45 and Theme.red or Theme.txt)
  readout(404, 148, 176, 44, 'T топл 燃料 K', string.format('%.0f', S.fuelTemp), '熔毁阈值 2800',
    S.fuelTemp > 1000 and Theme.red or Theme.txt)

  -- 象限 2×2
  local qActive = S.enable_quadrant_model and quadModeSplit
  for i = 1, 4 do
    local qx = 244 + ((i - 1) % 2) * 92
    local qy = 216 + math.floor((i - 1) / 2) * 76
    local v = qActive and S.quadrant_power[i] or S.n * Engine.N_NOM / 4
    gauge(qx + 36, qy + 30, 28, v / 1000, tostring(i), math.floor(v + 0.5) .. '', 0.9)
  end
  local modeSwitch = button(430, 240, 150, 24, quadModeSplit and '分 · РАЗДЕЛЬНО' or '总 · СУММА', { active = quadModeSplit })
  if modeSwitch then quadModeSplit = not quadModeSplit end
  W.label(430, 270, '象限显示', 9, Theme.txtFaint)

  -- 棒位条 + 目标功率
  local rodFrac = S.rodPos / 100
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', 40, 396, 360, 26, 3)
  love.graphics.setColor(Theme.cyan)
  love.graphics.rectangle('fill', 40, 396, 360 * rodFrac, 26, 3)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.rectangle('line', 40, 396, 360, 26, 3)
  love.graphics.setColor(Theme.txt)
  love.graphics.setFont(Theme.getFont(11))
  love.graphics.print(string.format('棒位 %.1f%%', S.rodPos), 412, 402)
  W.label(40, 380, '控制棒 · СТЕРЖНИ', 9, Theme.txtFaint)

  local knob = slider('target', 40, 448, 360, S.targetPower, 0, 120, '目标功率 · ЗАДАННАЯ МОЩНОСТЬ',
    function(v) return math.floor(v + 0.5) .. ' %' end)
  if hitbox(40, 436, 360, 40) and W.mouse.down then
    local v = (W.mouse.x - 40) / 360 * 120
    if v < 0 then v = 0 elseif v > 120 then v = 120 end
    Engine.setTargetPower(v)
    App.countOp()
  end

  -- 模式 rocker + 提插棒
  local m = rocker('mode', 40, 496, { 'АВТО 自动', 'РУЧН 手动' }, S.mode == 'auto' and 1 or 2, 110, 28)
  if m == 1 and S.mode ~= 'auto' then Engine.setMode('auto'); App.countOp() end
  if m == 2 and S.mode ~= 'manual' then Engine.setMode('manual'); App.countOp() end

  local upPressed = button(280, 492, 90, 34, '▲ 提棒', { active = rodHold > 0 })
  local dnPressed = button(376, 492, 90, 34, '▼ 插棒', { active = rodHold < 0 })
  if upPressed then
    Engine.beginRodMove(1); rodHold = 1; App.countOp()
  elseif dnPressed then
    Engine.beginRodMove(-1); rodHold = -1; App.countOp()
  elseif rodHold ~= 0 and not (W.mouse.down and (hitbox(280, 492, 90, 34) or hitbox(376, 492, 90, 34))) then
    Engine.endRodMove(); rodHold = 0
  end
  if S.rod_drive_overheat then
    W.label(280, 530, '⚠ 驱动过热闭锁', 10, Theme.red)
  elseif S.active_rod_drives > 0 then
    W.label(280, 530, '在动 ' .. S.active_rod_drives .. ' / 40', 10, Theme.amber)
  end

  -- AZ-5 组件
  local azx, azy = 480, 380
  panel(azx, azy, 108, 256, 'АЗ-5')
  -- 钥匙
  local keyOn = S.azBlocked
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', azx + 24, azy + 34, 60, 40, 4)
  love.graphics.setColor(keyOn and Theme.red or Theme.green)
  love.graphics.rectangle('fill', azx + 44, keyOn and azy + 38 or azy + 52, 20, 14, 2)
  W.label(azx + 12, azy + 78, keyOn and '闭锁 ЗАПРЕТ' or '允许 РАЗРЕШЕН', 8,
    keyOn and Theme.red or Theme.green)
  if hitbox(azx + 24, azy + 34, 60, 40) and W.mouse.pressed then
    Engine.toggleKey()
  end
  -- 玻璃罩
  love.graphics.setColor(azCoverOpen and { 0.12, 0.16, 0.14 } or { 0.14, 0.18, 0.2 })
  love.graphics.rectangle('fill', azx + 14, azy + 100, 80, 60, 6)
  love.graphics.setColor(azCoverOpen and Theme.green or Theme.txtFaint)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', azx + 14, azy + 100, 80, 60, 6)
  W.labelCenter(azx + 54, azy + 124, azCoverOpen and '罩已开' or '玻璃罩', 9,
    azCoverOpen and Theme.green or Theme.txtFaint)
  if hitbox(azx + 14, azy + 100, 80, 60) and W.mouse.pressed then
    azCoverOpen = not azCoverOpen
  end
  -- AZ-5 按钮
  local azReady = azCoverOpen and not S.azFired and not S.azBlocked
  local azPressed = button(azx + 14, azy + 170, 80, 44, 'АЗ-5',
    { danger = true, active = false, color = azReady and { 1, 1, 1 } or Theme.txtFaint, size = 14 })
  if azPressed and azCoverOpen then
    Hud.pressAZ5(App)
  elseif azPressed then
    App.logEvent('warn', 'АЗ-5 заблокирован колпаком — 请先打开玻璃罩')
  end
end

local function drawZone2(App)
  panel(616, 56, 384, 592, 'ТУРБИНА / ПИТАНИЕ · 汽机与给水')
  local S = Engine.S

  -- 分离器液位
  vbar(648, 96, 34, 220, S.separator_level / 2, {
    { lo = 0.4, hi = 0.6, color = Theme.green },
    { lo = 0.15, hi = 0.25, color = Theme.amber },
  })
  W.label(640, 322, 'УРОВЕНЬ ДС', 8, Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.setColor(Theme.amber)
  love.graphics.print(string.format('%.2f м', S.separator_level), 640, 336)

  -- 分离器压力表
  local dispP = Instrument.update('sep_press', S.separator_pressure, App.lastDt or 0.016)
  gauge(790, 160, 64, dispP / 8, 'ДАВЛ. МПа', string.format('%.1f', S.separator_pressure), 7.25 / 8)

  -- 给水温度 / 蒸汽流量 / 给水流量
  local dispT = Instrument.update('fw_temp', S.feedwater_temp, App.lastDt or 0.016)
  gauge(790, 300, 52, dispT / 300, 'T ПИТ. °C', string.format('%.0f', S.feedwater_temp), nil)
  readout(870, 96, 110, 40, 'G пар т/ч', tostring(math.floor(S.steam_flow + 0.5)))
  readout(870, 144, 110, 40, 'G пит м³/ч', tostring(math.floor(S.feedwater_flow + 0.5)))

  -- 衰变热
  local dhColor = S.decay_heat_power > 200 and Theme.red or (S.decay_heat_power > 100 and Theme.amber or Theme.txt)
  readout(648, 380, 200, 44, 'ОСТ. ТЕПЛ 衰变热',
    S.decay_heat_power > 0 and (math.floor(S.decay_heat_power + 0.5) .. ' МВт') or '0', '停堆后热源', dhColor)
  readout(860, 380, 120, 44, 'КВИТ 阀位', math.floor(S.turbine_valve_opening * 100 + 0.5) .. ' %')

  -- 汽机阀滑杆
  local knob = slider('valve', 648, 452, 330, S.turbine_valve_opening * 100, 0, 100,
    '汽轮机调节阀 · КЛАПАН', function(v) return math.floor(v + 0.5) .. ' %' end)
  if hitbox(648, 440, 330, 40) and W.mouse.down then
    local v = (W.mouse.x - 648) / 330 * 100
    if v < 0 then v = 0 elseif v > 100 then v = 100 end
    S.turbine_valve_opening = v / 100
    App.countOp()
  end

  -- 主循环泵 8 台
  W.label(648, 496, 'ГЦН 主循环泵 · 停泵需操作票', 9, Theme.txtFaint)
  for i = 1, 8 do
    local px = 648 + ((i - 1) % 4) * 88
    local py = 514 + math.floor((i - 1) / 4) * 44
    local running = S.pumps[i]
    if button(px, py, 80, 36, 'ГЦН-' .. i, { active = running,
      color = running and Theme.green or Theme.txtFaint }) then
      local wasOn = S.pumps[i]
      Engine.togglePump(i)
      if wasOn and App.stats then App.stats.pumpsStopped = App.stats.pumpsStopped + 1 end
      App.countOp()
    end
  end
  local onCount = 0
  for i = 1, 8 do if S.pumps[i] then onCount = onCount + 1 end end
  W.label(648, 606, '运行 ' .. onCount .. ' / 8 · 流量 ' .. math.floor(S.flow) .. '%', 10, Theme.txtDim)
end

local function drawZone3(App)
  panel(1016, 56, 190, 592, 'ДОЗА /辅助')
  local S = Engine.S

  local dispDose = Instrument.update('dose', S.containment_dose_rate, App.lastDt or 0.016)
  local doseText = dispDose >= 100 and string.format('%.0f', dispDose)
    or (dispDose >= 1 and string.format('%.1f', dispDose) or string.format('%.2f', dispDose))
  readout(1030, 92, 162, 52, 'ДП-5В 剂量率', doseText, 'mR/h',
    dispDose > 10 and Theme.red or (dispDose > 1 and Theme.amber or Theme.green),
    dispDose > 10)

  readout(1030, 152, 162, 44, '包壳完整性',
    math.floor(S.clad_integrity * 100 + 0.5) .. ' %', nil,
    S.clad_integrity < 0.5 and Theme.red or (S.clad_integrity < 0.8 and Theme.amber or Theme.green))

  local act = S.coolant_activity
  local actText = act >= 1000 and string.format('%.1e', act) or tostring(math.floor(act + 0.5))
  readout(1030, 204, 162, 44, '冷却剂活度', actText, 'Бк/см³',
    act > 1e5 and Theme.amber or Theme.txt)

  -- 量程 rocker
  W.label(1030, 264, 'ДИАПАЗОН КИП 量程', 9, Theme.txtFaint)
  local names = { 'С', 'П', '1', '2', '3' }
  local r = rocker('range', 1030, 280, names, Instrument.currentRangeId() + 1, 32, 26)
  if r > 0 and r - 1 ~= Instrument.currentRangeId() then
    Instrument.switchRange(r - 1)
    App.logEvent('info', '切换功率量程至 [' .. Instrument.rangeName() .. ']')
    App.countOp()
  end
  W.label(1030, 312, Instrument.rangeName() .. (Instrument.switching() and ' · 切换中' or ''), 9, Theme.txtDim)

  -- 时间倍率
  W.label(1030, 340, '时间倍率 · УСКОР.', 9, Theme.txtFaint)
  local tsLabels = {}
  for i = 1, #TS_OPTIONS do tsLabels[i] = '×' .. TS_OPTIONS[i] end
  local tsIdx = 1
  for i = 1, #TS_OPTIONS do
    if TS_OPTIONS[i] == S.timeScale then tsIdx = i end
  end
  local ts = rocker('ts', 1030, 356, tsLabels, tsIdx, 52, 26)
  if ts > 0 then
    Engine.setTimeScale(TS_OPTIONS[ts])
    if App.endless then
      local okE, Endless = pcall(require, 'src.endless')
      if okE and Endless.setSpeed then Endless.setSpeed(TS_OPTIONS[ts]) end
    end
  end

  -- 操作统计
  readout(1030, 404, 162, 44, '操作次数', tostring(App.stats and App.stats.opCount or 0))
  readout(1030, 456, 162, 44, '运行时长', formatClock(S.t))
end

local function drawZone4(App)
  panel(1222, 56, 362, 592, 'СИГНАЛИЗАЦИЯ · 报警与记录')
  local S = Engine.S

  -- 报警灯阵
  local lampW, lampH = 68, 30
  local cols = 5
  for i, def in ipairs(LAMP_DEFS) do
    local lx = 1240 + ((i - 1) % cols) * (lampW + 3)
    local ly = 92 + math.floor((i - 1) / cols) * (lampH + 6)
    local on
    if def.state then
      on = Instrument.lampState(def.key) ~= 'OFF'
    else
      on = S.alarms[def.key]
    end
    local blink = false
    if def.state then
      local st = Instrument.lampState(def.key)
      blink = st == 'FAST_BLINK' or st == 'SLOW_BLINK'
    end
    local col = LAMP_COLORS[def.color] or LAMP_COLORS.red
    local lit = on
    if blink then
      local speed = Instrument.lampState(def.key) == 'FAST_BLINK' and 8 or 2
      lit = on and (math.sin(love.timer.getTime() * speed) > -0.2)
    end
    love.graphics.setColor(lit and col or { 0.1, 0.08, 0.08 })
    love.graphics.rectangle('fill', lx, ly, lampW, lampH, 3)
    love.graphics.setColor(Theme.edgeLo)
    love.graphics.rectangle('line', lx, ly, lampW, lampH, 3)
    love.graphics.setColor(lit and { 0.05, 0.03, 0.03 } or col)
    love.graphics.setFont(Theme.getFont(10))
    local tw = love.graphics.getFont():getWidth(def.label)
    love.graphics.print(def.label, lx + lampW / 2 - tw / 2, ly + lampH / 2 - 7)
  end

  -- КВИТ
  kvitPressed = kvitPressed > 0 and kvitPressed - (App.lastDt or 0.016) or 0
  love.graphics.setColor(kvitPressed > 0 and { 0.9, 0.9, 0.85 } or { 0.75, 0.75, 0.7 })
  love.graphics.circle('fill', 1400, 292, 24)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.circle('line', 1400, 292, 24)
  love.graphics.setColor(0.1, 0.1, 0.1)
  love.graphics.setFont(Theme.getFont(11))
  local kw = love.graphics.getFont():getWidth('КВИТ')
  love.graphics.print('КВИТ', 1400 - kw / 2, 287)
  if hitbox(1376, 268, 48, 48) and W.mouse.pressed then
    Instrument.kvit()
    kvitPressed = 0.2
    local okA, Audio = pcall(require, 'src.audio.synth')
    if okA and Audio.click then Audio.click() end
  end

  -- 日志条
  W.label(1240, 330, 'ПЕЧАТЬ СОБЫТИЙ · 值班日志', 9, Theme.txtFaint)
  local entries = App.logEntries
  local lineH = 16
  local maxLines = math.floor(300 / lineH)
  local total = #entries
  local contentH = total * lineH
  if contentH > 300 then
    if logScroll > contentH - 300 then logScroll = contentH - 300 end
  else
    logScroll = 0
  end
  local startIdx = math.max(1, total - maxLines + 1 - math.floor(logScroll / lineH))
  love.graphics.push('all')
  love.graphics.setScissor(1240, 348, 328, 300)
  local y = 348
  for i = startIdx, total do
    if y > 648 then break end
    local e = entries[i]
    local c = e.typ == 'alarm' and Theme.red or e.typ == 'warn' and Theme.amber or Theme.cyan
    love.graphics.setColor(c)
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.print(e.line, 1240, y)
    y = y + lineH
  end
  love.graphics.pop()
end

-- ==================== 顶栏与 story/endless HUD ====================

local function drawTopBar(App)
  local S = Engine.S
  love.graphics.setColor(Theme.panel)
  love.graphics.rectangle('fill', 0, 0, 1600, 48)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.line(0, 48, 1600, 48)

  love.graphics.setColor(Theme.amber)
  love.graphics.setFont(Theme.getFont(16))
  love.graphics.print('ЩИТ · РБМК-1000 БЛОК №4', 16, 12)
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.print(App.mode == 'free' and 'СВОБОДНАЯ СМЕНА · 自由操作'
    or (App.mode == 'story' and 'ХРОНИКА · 历史重演')
    or (App.mode == 'endless' and 'БЕСКОНЕЧНОСТЬ · 无尽运营')
    or 'ВЫЗОВ · 挑战模式', 16, 32)

  -- 时钟
  love.graphics.setColor(Theme.txt)
  love.graphics.setFont(Theme.getFont(14))
  local clk = formatClock(S.t)
  love.graphics.print(clk, 1470, 10)
  love.graphics.setColor(Theme.cyan)
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.print('×' .. S.timeScale, 1500, 30)
  W.label(1350, 14, 'Esc 暂停 · F12 结束值班', 9, Theme.txtFaint)

  -- story HUD（幕次 + 任务）
  if App.mode == 'story' and story.act then
    love.graphics.setColor(Theme.panel2)
    love.graphics.rectangle('fill', 420, 6, 200, 36, 4)
    love.graphics.setColor(Theme.amber)
    love.graphics.setFont(Theme.getFont(12))
    love.graphics.print(story.actRu, 432, 10)
    love.graphics.setColor(Theme.txt)
    love.graphics.setFont(Theme.getFont(10))
    love.graphics.print(story.actCn, 432, 26)
    if story.obj ~= '' then
      local txt = story.obj
      love.graphics.setColor(story.objDone and Theme.green or Theme.cyan)
      love.graphics.setFont(Theme.getFont(10))
      love.graphics.print((story.objDone and '✓ ' or '◈ ') .. txt, 640, 18)
    end
  end

  -- endless HUD
  if App.mode == 'endless' and endlessHudVisible and App.endless then
    local okE, Endless = pcall(require, 'src.endless')
    if okE and Endless.getHud then
      local h = Endless.getHud()
      if h then
        love.graphics.setColor(Theme.panel2)
        love.graphics.rectangle('fill', 420, 6, 560, 36, 4)
        love.graphics.setColor(Theme.amber)
        love.graphics.setFont(Theme.getFont(11))
        love.graphics.print('МЕСЯЦ ' .. h.month .. ' · ' .. h.dateStr .. ' · 班次 ' .. h.shift, 432, 10)
        love.graphics.setColor(Theme.txt)
        love.graphics.setFont(Theme.getFont(10))
        love.graphics.print(string.format('₽ %s · 燃耗 %.1f/40 · 士气 %d%%',
          tostring(h.money), h.burnup, h.crewMorale), 432, 26)
      end
    end
  end
end

-- ==================== 浮层：电话/对话 ====================

local function rgba(c, a)
  return c[1], c[2], c[3], a
end

local function drawFloat(f)
  local w, h = 560, 120
  local x = 800 - w / 2
  local y = 900 - h - 110
  local a = math.min(1, f.timer * 5)
  love.graphics.setColor(0.05, 0.06, 0.05, 0.92 * a)
  love.graphics.rectangle('fill', x, y, w, h, 8)
  love.graphics.setColor(rgba(f.kind == 'phone' and Theme.amber or Theme.cyan, 0.9 * a))
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 8)
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.setColor(rgba(Theme.txtFaint, a))
  love.graphics.print(f.kind == 'phone' and '☎ ВЧ 电话 · 高频电话' or 'Вызов · 对话', x + 16, y + 8)
  love.graphics.setFont(Theme.getFont(12))
  love.graphics.setColor(rgba(Theme.amber, a))
  love.graphics.print((f.data.from or f.data.speaker or ''):gsub('\n', ' '), x + 16, y + 26)
  love.graphics.setFont(Theme.getFont(12))
  love.graphics.setColor(rgba(Theme.txt, a))
  love.graphics.print((f.data.text or ''):gsub('\n', ' '), x + 16, y + 50, w - 32, 'left')
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.setColor(rgba(Theme.txtFaint, a))
  love.graphics.print('⏎ 关闭', x + w - 60, y + h - 20)
end

-- ==================== 演出：点火 / 熔毁 ====================

local function drawIgnition(fx)
  local p = fx.t / fx.dur
  love.graphics.setColor(0, 0, 0, math.min(1, p * 3))
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  -- 堆芯光核
  local glow = p < 0.5 and p * 2 or 1
  local r = 60 + p * 180
  love.graphics.setColor(0.4, 0.7, 1, 0.9 * glow)
  love.graphics.circle('fill', 800, 450, r * 0.5)
  love.graphics.setColor(0.75, 0.9, 1, 0.55 * glow)
  love.graphics.circle('fill', 800, 450, r * 0.32)
  love.graphics.setColor(1, 1, 1, 0.9 * glow)
  love.graphics.circle('fill', 800, 450, r * 0.14)
  -- 冲击环
  for i = 1, 3 do
    local rp = ((p * 1.4 - (i - 1) * 0.18) % 1)
    if rp > 0 then
      love.graphics.setColor(0.5, 0.8, 1, (1 - rp) * 0.5)
      love.graphics.setLineWidth(3 - i)
      love.graphics.circle('line', 800, 450, rp * 320)
    end
  end
  love.graphics.setFont(Theme.getFont(26))
  love.graphics.setColor(1, 1, 1, glow)
  local t1 = 'ПУСК'
  love.graphics.print(t1, 800 - love.graphics.getFont():getWidth(t1) / 2, 700)
  love.graphics.setFont(Theme.getFont(14))
  love.graphics.setColor(rgba(Theme.cyan, glow))
  local t2 = '点火 · 反应堆临界'
  love.graphics.print(t2, 800 - love.graphics.getFont():getWidth(t2) / 2, 740)
end

local function drawMeltdownFx()
  -- 红光渐入 + 震动
  local a = math.min(0.35, love.timer.getTime() % 2 * 0.2)
  love.graphics.setColor(1, 0.15, 0.1, a)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
end

-- ==================== 无尽面板（结算/事件，切片3 完善） ====================

-- App 状态联动（避免循环 require：app.boot 时注册）
local panelOpenCb, panelCloseCb, bankruptCb = nil, nil, nil
function Hud.setPanelCallbacks(onOpen, onClose, onBankrupt)
  panelOpenCb = onOpen
  panelCloseCb = onClose
  bankruptCb = onBankrupt
end

function Hud.showEndlessSettle(d)
  panel = {
    kind = 'settle',
    data = d,
    buttons = {},
  }
  if panelOpenCb then panelOpenCb() end
end

function Hud.showEndlessEvent(evt, router)
  panel = {
    kind = 'event',
    data = evt,
    router = router,
    buttons = {},
  }
  if panelOpenCb then panelOpenCb() end
end

function Hud.closeEndlessPanel()
  panel = nil
  if panelCloseCb then panelCloseCb() end
end

function Hud.endlessPanelOpen() return panel ~= nil end

local function drawEndlessPanel()
  local d = panel.data
  local pw, ph = 640, 460
  local px, py = 800 - pw / 2, 450 - ph / 2
  love.graphics.setColor(0, 0, 0, 0.7)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  love.graphics.setColor(Theme.panel2)
  love.graphics.rectangle('fill', px, py, pw, ph, 8)
  love.graphics.setColor(Theme.edge)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', px, py, pw, ph, 8)

  panel.buttons = {}
  local y = py + 24
  if panel.kind == 'settle' then
    W.labelCenter(px + pw / 2, y, '第 ' .. d.month .. ' 月结算', 18, Theme.amber); y = y + 22
    W.labelCenter(px + pw / 2, y, 'МЕСЯЧНЫЙ РАСЧЁТ · 月度经济报表', 10, Theme.txtFaint); y = y + 34
    local function mrow(label, value, color)
      W.label(px + 48, y, label, 12, Theme.txtDim)
      local f = Theme.getFont(13)
      W.label(px + pw - 48 - f:getWidth(value), y, value, 13, color or Theme.txt)
      y = y + 28
    end
    mrow('售电收入', '+' .. tostring(math.floor(d.income + 0.5)) .. ' ₽', Theme.green)
    mrow('日常维护', '-' .. tostring(math.floor(d.maint + 0.5)) .. ' ₽')
    mrow('人员工资', '-' .. tostring(math.floor(d.wages + 0.5)) .. ' ₽')
    mrow('事件 / 罚款', '-' .. tostring(math.floor(d.fines + 0.5)) .. ' ₽')
    mrow('本月净利润: ', (d.profit >= 0 and '+' or '') .. tostring(math.floor(d.profit + 0.5)) .. ' ₽',
      d.profit >= 0 and Theme.green or Theme.red)
    y = y + 8
    mrow('现金', tostring(math.floor(d.money + 0.5)) .. ' ₽' ..
      (d.lossStreak > 0 and (' · 连续亏损 ' .. d.lossStreak .. '/6 月') or ' · 财务健康'))
    if d.bankrupt then
      W.label(px + 48, y, '连续 6 个月净亏损 — 电站被上级部门接管。您被罢职。', 11, Theme.red)
      y = y + 40
      if button(px + pw / 2 - 80, y, 160, 38, '最终结算', { danger = true }) then
        Hud.closeEndlessPanel()
        if bankruptCb then bankruptCb() end
      end
    else
      if button(px + pw / 2 - 80, y + 16, 160, 38, '继续运营 · ⏎', {}) then
        Hud.closeEndlessPanel()
      end
    end
  elseif panel.kind == 'event' then
    W.labelCenter(px + pw / 2, y, d.title or '事件', 16, Theme.amber); y = y + 36
    W.textBlock(px + 48, y, pw - 96, d.desc or ''); y = y + 76
    for _, opt in ipairs(d.options or {}) do
      if button(px + 48, y, pw - 96, 40, opt.label, {}) then
        if panel.router then
          panel.router(d.id, opt.id)
        else
          local okE, Endless = pcall(require, 'src.endless')
          if okE and Endless.choose then Endless.choose(d.id, opt.id) end
        end
        Hud.closeEndlessPanel()
        return
      end
      y = y + 48
    end
    W.label(px + 48, py + ph - 36, '延迟不响应将按默认方式处理 · ⏎ 无默认跳过', 9, Theme.txtFaint)
  end
end

function Hud.endlessPanelMouse(x, y)
  -- 按钮命中在 drawEndlessPanel 内通过 W.mouse 处理（IMM），此处仅阻止穿透
end

-- ==================== story HUD 状态接口 ====================

function Hud.storyAct(v)
  story.act = v
  local meta = {
    ['1'] = { ru = 'АКТ I', cn = '第一幕 · 白班' },
    ['2'] = { ru = 'АКТ II', cn = '第二幕 · 氙坑' },
    ['2B'] = { ru = 'АКТ II-Б', cn = '第二幕B · 等待' },
    ['3'] = { ru = 'АКТ III', cn = '第三幕 · 提棒' },
    ['3B'] = { ru = 'АКТ III-Б', cn = '第三幕B · 重来' },
    ['4'] = { ru = 'АКТ IV', cn = '第四幕 · 准备' },
    ['5'] = { ru = 'АКТ V', cn = '第五幕 · 试验' },
    ['6'] = { ru = 'АКТ VI', cn = '第六幕 · 灾后' },
  }
  local m = meta[tostring(v)] or { ru = 'АКТ', cn = '第·幕' }
  story.actRu = m.ru
  story.actCn = m.cn
end

function Hud.storyObjective(text)
  story.obj = text or ''
  story.objDone = false
end

function Hud.storyObjectiveDone()
  story.objDone = true
end

function Hud.initStoryHud()
  endlessHudVisible = false
  if App and App.scenario then Hud.storyAct(App.scenario.flags.act or 1) end
end

function Hud.clearStoryHud()
  story = { act = nil, actRu = '', actCn = '', obj = '', objDone = false }
  endlessHudVisible = false
end

function Hud.showEndlessHud()
  endlessHudVisible = true
end

function Hud.hideEndlessHud()
  endlessHudVisible = false
end

-- ==================== 主绘制 ====================

function Hud.draw(App)
  S = Engine.S
  drawTopBar(App)
  drawZone1(App)
  drawZone2(App)
  drawZone3(App)
  drawZone4(App)

  -- 熔毁演出
  if S.meltdown then
    drawMeltdownFx()
  end

  -- 点火演出
  if App.ignitionFx then
    drawIgnition(App.ignitionFx)
  end

  -- 电话/对话浮层
  if App.floatShowing then
    drawFloat(App.floatShowing)
  end

  -- 无尽面板
  if panel then
    drawEndlessPanel()
  end

  -- 帧尾：清 pressed/released 边沿
  W.endFrame()
end

function Hud.beginFrame(App)
  W.beginFrame(W.mouse.x, W.mouse.y, W.mouse.down, W.mouse.pressed, W.mouse.released, W.mouse.wheel)
end

-- ==================== 输入 ====================

function Hud.pressAZ5(App)
  local S = Engine.S
  if not azCoverOpen then
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

function Hud.mousepressed(App, x, y, button)
  if button ~= 1 then return end
  W.mouse.pressed = true
  W.mouse.down = true
  W.mouse.x, W.mouse.y = x, y
  -- 电话浮层点击关闭
  if App.floatShowing then
    local w, h = 560, 120
    local fx, fy = 800 - w / 2, 900 - h - 110
    if x >= fx and x <= fx + w and y >= fy and y <= fy + h then
      App.hideFloat()
    end
  end
end

function Hud.mousereleased(App, x, y, button)
  W.mouse.down = false
  W.mouse.released = true
  if rodHold ~= 0 then
    Engine.endRodMove()
    rodHold = 0
  end
  drag = nil
end

function Hud.mousemoved(App, x, y)
  W.mouse.x, W.mouse.y = x, y
end

function Hud.wheelmoved(dy)
  W.mouse.wheel = dy
  logScroll = logScroll + dy * 24
  if logScroll < 0 then logScroll = 0 end
end

function Hud.reset()
  drag = nil
  rodHold = 0
  azCoverOpen = false
  logScroll = 0
  quadModeSplit = false
  panel = nil
  story = { act = nil, actRu = '', actCn = '', obj = '', objDone = false }
  endlessHudVisible = false
  Instrument.init()
  Instrument.initLamps()
end

return Hud
