-- props.lua — 桌面道具
-- 道具：规程手册 / 值班日志 / 计算器 / 剂量计 / 电话 / 号码簿 / 茶炉 / 日历
-- 旗标联动：喝完茶 → scenario action_tea_drunk；翻到第11页 → discovered_page_47

local Theme = require('src.ui.theme')
local W = require('src.ui.widgets')
local Engine = require('src.engine')
local KvStore = require('src.kvstore')

local Props = {}

local openProp = nil          -- 'manual'|'clipboard'|'calculator'|'dosimeter'|'phone'|'phonebook'|'coffee'
local calendarOpen = false
local calendarModeKey = 'story'
local hitRows = {}

local AppRef = nil            -- 由 App.startGame 注入

function Props.setApp(app) AppRef = app end

-- ==================== 电话线路 ====================

local PHONE_LINES = {
  { num = '0701', from = '调度员', text = '四号机组，正在听。今晚营官已经明确：维持台上功率，无论如何不得低于上级要求。有事随时报。' },
  { num = '0702', from = '调度员', text = '今晚你们哪里怎么样？注意六号机组今晚也在转试，线路要求已发。等你们传合闸合格。' },
  { num = '0703', from = '调度员', text = '板南输电工档𨑾？我这边可以的叙，你先把功率拉上去再说。' },
  { num = '0704', from = '供应科', text = '新一批沸腾管明天下午到。你们小心点用，积压塘已经挂了两个月的账。' },
  { num = '0705', from = 'Семёнов · 谢苗诺夫', text = '我上一班，给你留了证据在日志里。今晚揿簊操贱风，手底下注意。' },
}

local PHONE_BOOK = {
  { num = '0701', name = '调度台 · ДИСПЕТЧЕР' },
  { num = '0702', name = '汽轮机车间 · ТУРБИННЫЙ ЦЕХ' },
  { num = '0703', name = '电气车间 · ЭЛЕКТРОЦЕХ' },
  { num = '0704', name = '消防队 · ПОЖАРНАЯ ЧАСТЬ' },
  { num = '0705', name = '医疗点 · МЕДПУНКТ' },
}

local phoneLifted = false
local phoneLineText = ''
local phoneStatus = '— 线路空闲 —'
local phoneRespFrom, phoneRespText = nil, nil

-- ==================== 茶炉 ====================

local teaState = 0   -- 0 凉茶 · 1 热茶（3 口）· 2 已喝完
local teaSips = 0

-- ==================== 计算器 ====================

local calcDisp = '0'
local calcAcc, calcOp = nil, nil
local calcNew = true
local calcMem = 0

-- ==================== 剂量计 ====================

local dosiRange = 1

-- ==================== 手册 ====================

local manualPage = 0

local function sfx(fn, ...)
  local okA, Audio = pcall(require, 'src.audio.synth')
  if okA and Audio[fn] then Audio[fn](...) end
end

-- ==================== 通用绘制 ====================

local function rgba(c, a)
  return { c[1], c[2], c[3], a or 1 }
end

local function addHit(x, y, w, h, cb)
  hitRows[#hitRows + 1] = { x = x, y = y, w = w, h = h, cb = cb }
end

local function button(x, y, w, h, label, opts)
  opts = opts or {}
  local mx, my = W.mouse.x, W.mouse.y
  local hover = mx >= x and mx <= x + w and my >= y and my <= y + h
  local pressed = hover and W.mouse.pressed
  local bg = opts.active and { 0.55, 0.4, 0.12 } or Theme.panel4
  if hover then bg = { bg[1] + 0.07, bg[2] + 0.07, bg[3] + 0.07 } end
  love.graphics.setColor(bg)
  love.graphics.rectangle('fill', x, y, w, h, 3)
  love.graphics.setColor(opts.danger and Theme.redDeep or Theme.edgeLo)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 3)
  love.graphics.setColor(opts.color or (opts.active and Theme.amber or Theme.txtDim))
  love.graphics.setFont(Theme.getFont(11))
  local tw = love.graphics.getFont():getWidth(label)
  love.graphics.print(label, x + w / 2 - tw / 2, y + h / 2 - 7)
  return pressed
end

-- ==================== 道具条 ====================

local PROP_ICONS = {
  { id = 'manual', icon = '📘', label = '规程' },
  { id = 'clipboard', icon = '📋', label = '日志' },
  { id = 'calculator', icon = '🔢', label = 'МК-61' },
  { id = 'dosimeter', icon = '☢', label = 'ДП-5В' },
  { id = 'phone', icon = '☎', label = '电话' },
  { id = 'phonebook', icon = '📒', label = '号码簿' },
  { id = 'coffee', icon = '☕', label = '茶炉' },
  { id = 'calendar', icon = '📅', label = '日历' },
}

function Props.drawPropBar(App)
  local x0 = 1600 - #PROP_ICONS * 66 - 20
  for i, p in ipairs(PROP_ICONS) do
    local px = x0 + (i - 1) * 66
    local py = 900 - 58
    local active = openProp == p.id
    button(px, py, 60, 44, p.icon .. '\n' .. p.label, { active = active })
    -- button 不支持换行：补画标签
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.setFont(Theme.getFont(8))
    local lw = love.graphics.getFont():getWidth(p.label)
    love.graphics.print(p.label, px + 30 - lw / 2, py + 28)
    addHit(px, py, 60, 44, function()
      if p.id == 'calendar' then
        local modeKey = (AppRef and AppRef.mode == 'endless') and 'endless' or 'story'
        Props.toggleCalendar(modeKey)
      elseif openProp == p.id then
        Props.closeProp()
      else
        Props.openProp(p.id)
      end
    end)
  end
end

-- ==================== 面板骨架 ====================

local PANEL_W, PANEL_H = 920, 620
local function panelXY()
  return 800 - PANEL_W / 2, 450 - PANEL_H / 2
end

local function drawShell(title, subtitle)
  local px, py = panelXY()
  love.graphics.setColor(0, 0, 0, 0.55)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  love.graphics.setColor(Theme.panel2)
  love.graphics.rectangle('fill', px, py, PANEL_W, PANEL_H, 8)
  love.graphics.setColor(Theme.edge)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', px, py, PANEL_W, PANEL_H, 8)
  love.graphics.setColor(Theme.amber)
  love.graphics.setFont(Theme.getFont(16))
  love.graphics.print(title, px + 24, py + 16)
  if subtitle then
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.setFont(Theme.getFont(10))
    love.graphics.print(subtitle, px + 24, py + 42)
  end
  -- 放回按钮
  if button(px + PANEL_W - 120, py + 14, 96, 34, '✕ 放回', { danger = true }) then
    Props.closeProp()
    sfx('click')
  end
  return px, py
end

-- ==================== 规程手册 ====================

local MANUAL_PAGES = {
  { tab = '封面', title = 'РБМК-1000 · 运行规程', body = {
    '苏联中型机械工业部',
    '',
    'РБМК-1000 反应堆装置 · 运行规程',
    'ЭКСПЛУАТАЦИОННЫЙ РЕГЛАМЕНТ',
    '',
    '文件编号 РБМК-1000.00.00.000 РЭ',
    '1986 年修订版 · 密级 ДСП',
    '',
    '批准 12.10.1983 · 修改 №12 15.03.1984',
    '',
    '切尔诺贝利核电站 · 4号机组',
  } },
  { tab = '目录', title = 'ОГЛАВЛЕНИЕ · 目录', body = {
    '1 反应堆装置简述        7 紧急保护系统',
    '2 反应性与控制棒        8 运行限制与 ОЗР',
    '3 功率、周期与氙中毒    9 仪表与监测系统',
    '4 汽水分离器与给水     10 辐射监测',
    '5 热工水力与燃料包壳   11 正常操作程序',
    '6 衰变热与停堆后冷却   12 异常工况与事故处理',
    '附录 A 保护定值表 · 附录 B 缩略语 · 附录 C 修改通知',
  } },
  { tab = '1 简述', title = '第1章 装置简述', body = {
    '1.1 总体特征',
    'РБМК-1000 是石墨慢化、轻水冷却的沸水堆。石墨砌体作为慢化剂，',
    '堆芯 Ø11.8 × 7 м，1661 根工艺管，4 台卧式汽水分离器，8 台主循环泵。',
    '',
    '1.2 主要参数',
    '额定热功率 3200 МВт · 电功率 1000 МВт',
    '工艺管/控制棒 1661 / 211 根',
    '分离器压力 6.9 МПа · 给水流量 ~5000 м³/ч · 蒸汽流量 ~7680 т/ч',
  } },
  { tab = '2 反应性', title = '第2章 反应性与控制棒', body = {
    '2.1 控制棒结构',
    'B₄C 吸收体 / 石墨置换体 (~4.5 м) / 水柱 (~1.25 м)。驱动速度 0.4 м/с。',
    '',
    '2.2 端部效应',
    '提棒初期可能引入正反应性。低功率 / 低 ОЗР 时显著。',
    '',
    '2.4 驱动限制',
    '同时最多 40 根，过热 80°C 闭锁，АЗ-5 豁免。',
    '',
    '2.5 量程',
    'С/П/1/2/3 五档，切换 0.8s 归零。',
  } },
  { tab = '3 功率', title = '第3章 功率、周期与氙', body = {
    '3.1 功率与周期',
    'T = N/(dN/dt)。П2 定值：周期 < 10 с → АЗ-5。',
    '',
    '3.2 氙-135',
    '截面 ~2.6×10⁶ 靶恩。碘坑峰值 6–10h。',
    '',
    '3.4 空泡效应',
    '正反馈。功率升 → 沸腾增 → 空泡增 → 反应性增 → 功率升。',
  } },
  { tab = '4 分离器', title = '第4章 汽水分离器与给水', body = {
    '4.1 汽水分离器',
    '水位 0.8–1.2 m。< 0.5 m 泵降流量，< 0.3 m 气蚀，< 0.2 m 干烧。',
    '',
    '4.2 给水温度',
    '正常 270°C。САОР → 40°C。热冲击 ΔT×流量 > 150 损伤。',
  } },
  { tab = '5 热工', title = '第5章 热工水力与包壳', body = {
    '5.1 包壳完整性',
    '100–80% 正常，80–50% 微损，< 10% 燃料损坏事故。',
  } },
  { tab = '6 衰变热', title = '第6章 衰变热与停堆冷却', body = {
    '6.1 衰变热',
    '1s: 224 MW / 1min: 134 / 5min: 96 / 1h: 45。',
    '',
    '⚠ 功率表归零 ≠ 没有热。保持冷却。',
  } },
  { tab = '7 保护', title = '第7章 紧急保护系统', body = {
    '7.1 保护通道',
    'П1 功率 > 110%        П2 周期 < 10 с',
    'П3 压力 > 7.25 МПа    П4 水位超限',
    'П5 工艺管破损',
    '',
    '7.6 报警确认',
    '快闪 2Гц → КВИТ → 常亮 → 慢闪 0.5Гц → 灭。',
  } },
  { tab = '8 ОЗР', title = '第8章 运行限制与ОЗР', body = {
    '8.2 限值',
    'ОЗР ≥ 15: 允许运行。ОЗР < 15: 降功率/停堆。ОЗР < 8: 立即停堆。',
    '',
    '⚠ 低功率 + 高氙 + 高棒位 = ОЗР 最小化。',
  } },
  { tab = '9 仪表', title = '第9章 仪表与监测系统', body = {
    '9.1 仪表动态',
    'τ: 功率0.5s / 周期1.0 / 水温3.0 / 分离器压力2.0 / 水位1.5 / ОЗР0.2 / 剂量仪5.0。',
    '',
    '9.2 故障模式',
    '卡死 / 漂移 / 打表 / 跳动 / 反向 / 死表。',
  } },
  { tab = '10 辐射', title = '第10章 辐射监测', body = {
    '10.1 正常本底',
    '主控室剂量率 ~0.1 мР/ч。冷却剂活度 ~10³ Бк/м³。',
    '',
    '10.3 剂量仪 ДП-5В',
    '量程 ×1–×10000。响应时间 5s。',
  } },
  { tab = '11 操作', title = '第11章 正常操作程序', body = {
    '11.1 启动序列',
    '□ ОЗР ≥ 15          □ 保护全部投入',
    '□ 泵 ≥ 6 台         □ 水位 0.8–1.2 м',
    '□ 给水温度 > 250 °C □ 驱动温度 < 60 °C',
    '□ 选择量程          □ 0.4 %/с 提棒',
    '□ 周期 T > 60 с     □ 10% 稳定',
  } },
  { tab = '12 事故', title = '第12章 异常工况与事故', body = {
    '12.1 氙振荡',
    '停止提棒。功率 > 110% 确认 П1。',
    '',
    '12.5 驱动过热+功率上升',
    '保护旁路时 → 手动 АЗ-5。',
  } },
  { tab = 'A 定值', title = '附录A · 保护定值表', body = {
    '通道   参数         定值            动作',
    'П1     中子功率     > 110%          АЗ-5',
    'П2     周期         < 10 с          АЗ-5',
    'П3     分离器压力   > 7.25 МПа      АЗ-5',
    'П4     分离器水位   超限            АЗ-5',
    'П5     工艺管破损   放射性 ↑        АЗ-5',
    'ОЗР    操作裕度     < 15 根         降功率/停堆',
    'ОЗР    操作裕度     < 8 根          立即停堆',
    '水位   分离器       < 0.2 м 且 P>10% 事故停堆',
    '包壳   完整性       < 10%           燃料损坏',
    '驱动   温度         > 80 °C         闭锁',
  } },
  { tab = 'B 缩略', title = '附录B · 缩略语', body = {
    'АЗ    Аварийная Защита            紧急保护',
    'ГЦН   Главный Цирк. Насос         主循环泵',
    'ОЗР   Оперативный Запас Реактивности  操作反应性裕度',
    'ТК    Технологический Канал       工艺管',
    'ДС    Дренажный Сепаратор         汽水分离器',
    'САОР  Система Авар. Охлаждения    应急堆芯冷却',
    'КВИТ  Квитирование                报警确认',
    'КСУ   Комплексная Система Управления  自记记录仪',
  } },
  { tab = 'C 修改', title = '附录C · 修改通知', body = {
    '──────────────────────────────',
    '修改通知 №12 · 15.03.1984',
    '████████████████████████████████',
    '████ 正性慢化负在停止时 ████████',
    '████ 按上级指示 ████████ 不予公布 ████████',
    '操作员应严格遵守 ОЗР 限值规定。',
    '──────────────────────────────',
    '修改通知 №13 · 02.08.1986',
    '新增：第4–6、9–10章；§2.4、§2.5、§3.5；§7.2、§7.6',
    '',
    '"01:03 — 值长说继续。ОЗР 只剩 8 根。',
    '我提了反对，记录在日志里。"',
    '',
    '"规程 4.3 被涂掉了。没人告诉我们 АЗ-5 会先升功率。"',
    '',
    '"如果你看到这本手册：永远不要在 ОЗР < 15 时运行。永远不要。"',
    '— А. · 26.04.1986 00:45',
  } },
}

local function drawManual()
  local px, py = drawShell('РЕГЛАМЕНТ · 运行规程', 'РБМК-1000.00.00.000 РЭ')
  local page = MANUAL_PAGES[manualPage + 1]
  -- 页签
  local tx, ty = px + 24, py + 66
  for i, p in ipairs(MANUAL_PAGES) do
    local w = love.graphics.getFont():getWidth(p.tab) + 12
    local active = i - 1 == manualPage
    love.graphics.setColor(active and { 0.55, 0.4, 0.12 } or Theme.panel4)
    love.graphics.rectangle('fill', tx, ty, w, 24, 3)
    love.graphics.setColor(active and rgba(Theme.amber) or Theme.txtFaint)
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.print(p.tab, tx + 6, ty + 6)
    addHit(tx, ty, w, 24, function() Props.gotoPage(i - 1) end)
    tx = tx + w + 4
    if tx > px + PANEL_W - 130 then
      tx = px + 24
      ty = ty + 28
    end
  end
  -- 正文
  love.graphics.setFont(Theme.getFont(13))
  local by = ty + 40
  love.graphics.setColor(Theme.txt)
  for i, line in ipairs(page.body) do
    if line:find('^████') then
      love.graphics.setColor(Theme.txtFaint)
    elseif line:find('^⚠') or line:find('^"') then
      love.graphics.setColor(Theme.cyan)
    else
      love.graphics.setColor(Theme.txt)
    end
    love.graphics.print(line, px + 32, by + (i - 1) * 22)
    if by + (i - 1) * 22 > py + PANEL_H - 60 then break end
  end
  -- 页码/翻页
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(10))
  local pt = (manualPage + 1) .. ' / ' .. #MANUAL_PAGES
  love.graphics.print(pt, px + PANEL_W / 2 - 20, py + PANEL_H - 46)
  if button(px + PANEL_W - 220, py + PANEL_H - 54, 60, 34, '←', {}) then
    Props.gotoPage(math.max(0, manualPage - 1))
    sfx('paper')
  end
  if button(px + PANEL_W - 152, py + PANEL_H - 54, 60, 34, '→', {}) then
    Props.gotoPage(math.min(#MANUAL_PAGES - 1, manualPage + 1))
    sfx('paper')
  end
end

function Props.gotoPage(i)
  manualPage = i
  -- 第11页（0 基 10）= 操作程序 · 第47页彩蛋
  if manualPage == 10 and AppRef and AppRef.scenario then
    AppRef.scenario.flags.discovered_page_47 = true
  end
end

-- ==================== 值班日志（只读视图） ====================

local function drawClipboard()
  local px, py = drawShell('ОПЕРАТИВНЫЙ ЖУРНАЛ · 值班日志', 'ЧЕРНОБЫЛЬСКАЯ АЭС · БЛОК №4 · 26.04.1986')
  love.graphics.setFont(Theme.getFont(11))
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.print('操作员: Оператор БЩУ · 自动记录（本版为只读副本）', px + 32, py + 66)
  local entries = AppRef and AppRef.logEntries or {}
  local n = #entries
  local y = py + 96
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', px + 24, y, PANEL_W - 48, PANEL_H - 150, 4)
  love.graphics.setFont(Theme.getFont(11))
  for i = 0, 17 do
    local e = entries[n - i]
    if not e then break end
    love.graphics.setColor(e.typ == 'alarm' and rgba(Theme.red) or
      e.typ == 'warn' and rgba(Theme.amber) or rgba(Theme.cyan))
    love.graphics.print(e.line, px + 36, y + 10 + i * 22)
  end
end

-- ==================== 计算器 ====================

local function calcEquals()
  if calcAcc == nil or not calcOp then return end
  local b = tonumber(calcDisp) or 0
  local r = 0
  if calcOp == '+' then r = calcAcc + b
  elseif calcOp == '−' then r = calcAcc - b
  elseif calcOp == '×' then r = calcAcc * b
  elseif calcOp == '÷' then r = b == 0 and 0 / 0 or calcAcc / b end
  if r ~= r then calcDisp = 'ERROR' else calcDisp = tostring(math.floor(r * 1e8 + 0.5) / 1e8) end
  calcAcc = nil
  calcOp = nil
  calcNew = true
end

local function calcKey(k)
  if k >= '0' and k <= '9' then
    if calcNew then calcDisp = k; calcNew = false
    else calcDisp = calcDisp == '0' and k or calcDisp .. k end
  elseif k == '.' then
    if calcNew then calcDisp = '0.'; calcNew = false
    elseif not calcDisp:find('.', 1, true) then calcDisp = calcDisp .. '.' end
  elseif k == 'C' then
    calcDisp = '0'; calcAcc = nil; calcOp = nil; calcNew = true
  elseif k == '±' then
    calcDisp = tostring(-(tonumber(calcDisp) or 0))
  elseif k == '√' then
    calcDisp = tostring(math.sqrt(tonumber(calcDisp) or 0))
    calcNew = true
  elseif k == 'OPR' then
    calcDisp = tostring(Engine.S.opr); calcNew = true
  elseif k == 'Xe' then
    calcDisp = string.format('%.3f', Engine.S.xe); calcNew = true
  elseif k == 'M+' then
    calcMem = calcMem + (tonumber(calcDisp) or 0)
  elseif k == 'MR' then
    calcDisp = tostring(calcMem); calcNew = true
  elseif k == '+' or k == '−' or k == '×' or k == '÷' then
    if calcAcc ~= nil and calcOp and not calcNew then calcEquals() end
    calcAcc = tonumber(calcDisp) or 0
    calcOp = k
    calcNew = true
  elseif k == '=' then
    calcEquals()
  end
end

local CALC_ROWS = {
  { '7', '8', '9', '÷', 'C' },
  { '4', '5', '6', '×', '√' },
  { '1', '2', '3', '−', 'OPR' },
  { '0', '.', '±', '+', 'Xe' },
  { 'M+', 'MR', '', '', '' },
}

local function drawCalculator()
  local px, py = drawShell('ЭЛЕКТРОНИКА · МК-61', '计算器')
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', px + 260, py + 66, 400, 44, 4)
  love.graphics.setColor(Theme.green)
  love.graphics.setFont(Theme.getFont(20))
  local show = #calcDisp > 10 and calcDisp or calcDisp
  love.graphics.printf(show, px + 268, py + 74, 384, 'right')
  local kx, ky = px + 260, py + 128
  for r, row in ipairs(CALC_ROWS) do
    for c, k in ipairs(row) do
      if k ~= '' then
        local bx, by = kx + (c - 1) * 82, ky + (r - 1) * 66
        local isOpr = k == '÷' or k == '×' or k == '−' or k == '+' or k == '='
        if button(bx, by, 76, 58, k, { color = isOpr and Theme.amber or (k == 'OPR' and Theme.cyan or (k == 'Xe' and Theme.green or Theme.txt)) }) then
          calcKey(k)
          sfx('click')
        end
      end
    end
  end
end

-- ==================== 剂量计 ====================

local function fmtDose(v)
  if v >= 1e6 then return string.format('%.2f Зв/ч', v / 1e6) end
  if v >= 1e3 then return string.format('%.2f мЗв/ч', v / 1e3) end
  return string.format('%.2f мкЗв/ч', v)
end

local function drawDosimeter()
  local px, py = drawShell('ИМД · ДП-5В', '剂量计')
  local S = Engine.S
  sfx('setGeigerRunning', true)
  sfx('setDoseRate', S.doseRate)
  -- 表盘
  local cx, cy, R = px + 460, py + 320, 200
  love.graphics.setColor(0.92, 0.9, 0.78)
  love.graphics.circle('fill', cx, cy, R)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.setLineWidth(3)
  love.graphics.circle('line', cx, cy, R)
  for i = 0, 10 do
    local a = math.pi + (i / 10) * math.pi
    love.graphics.setColor(0.2, 0.2, 0.15)
    love.graphics.setLineWidth(i % 5 == 0 and 2 or 1)
    love.graphics.line(cx + math.cos(a) * (R - 14), cy + math.sin(a) * (R - 14),
      cx + math.cos(a) * (R - 24), cy + math.sin(a) * (R - 24))
  end
  love.graphics.setColor(0.76, 0.14, 0.06)
  love.graphics.setLineWidth(6)
  love.graphics.arc('line', cx, cy, R - 18, math.pi * 1.7, math.pi * 2)
  local maxVal = 10 ^ (dosiRange * 1.2)
  local f = math.log10(math.max(0.01, S.doseRate)) / math.log10(maxVal)
  f = math.max(0, math.min(1.02, f))
  local na = math.pi + f * math.pi
  love.graphics.setColor(0.76, 0.14, 0.06)
  love.graphics.setLineWidth(2)
  love.graphics.line(cx, cy, cx + math.cos(na) * (R - 16), cy + math.sin(na) * (R - 16))
  -- 读数
  love.graphics.setColor(S.doseRate > 1000 and rgba(Theme.redDeep) or rgba({ 0.18, 0.18, 0.1 }))
  love.graphics.setFont(Theme.getFont(18))
  love.graphics.print(fmtDose(S.doseRate), px + 300, py + 400)
  love.graphics.setFont(Theme.getFont(11))
  love.graphics.setColor(Theme.txtDim)
  love.graphics.print('累积: ' .. (S.doseTotal >= 1000 and
    string.format('%.2f мЗв', S.doseTotal / 1000) or string.format('%.2f мкЗв', S.doseTotal)),
    px + 300, py + 430)
  -- 量程
  local labels = { '×1', '×10', '×100', '×1k', '×10k' }
  for r = 1, 5 do
    if button(px + 240 + (r - 1) * 116, py + 466, 108, 38, labels[r], { active = r == dosiRange }) then
      dosiRange = r
      sfx('click')
    end
  end
  -- 咔哒行
  local rate = math.min(20, math.log10(S.doseRate + 1) * 4)
  local clicks = string.rep('咔哒 ', math.max(1, math.floor(rate + 0.5)))
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(11))
  love.graphics.print(clicks, px + 240, py + 520)
end

-- ==================== 电话 ====================

local function phoneCall()
  if not phoneLifted then return end
  local digits = phoneLineText:gsub('%D', '')
  if #digits == 0 then
    phoneStatus = '«请先拨号再按通话键» · наберите номер'
    sfx('beep', 330, 0.18, 'sine', 0.05)
    return
  end
  phoneStatus = '«拨号中» · вызов...'
  sfx('playKeyTurn')
  local resp = nil
  for _, l in ipairs(PHONE_LINES) do
    if l.num == digits then resp = l end
  end
  if not resp then
    phoneStatus = '«空号 · 无法接通» номер не существует'
    phoneRespFrom, phoneRespText = nil, '拨打的号码不存在。请核对桌上的电话号码簿。'
    sfx('beep', 425, 0.22, 'sine', 0.05)
    return
  end
  phoneStatus = '«已接通 · соединено»'
  phoneRespFrom = resp.from
  phoneRespText = resp.text
  sfx('voice', 900, 0.5, 'sine', 0.06)
end

local function drawPhone()
  local px, py = drawShell('ВЧ · АЭС-4 · ДИСПЕТЧЕР', '高频电话')
  -- 听筒
  if button(px + 32, py + 70, 180, 60, phoneLifted and '☎ 挂回听筒' or '☎ 拿起听筒',
    { active = phoneLifted }) then
    phoneLifted = not phoneLifted
    if not phoneLifted then
      phoneStatus = '— 线路空闲 —'
      phoneLineText = ''
      phoneRespFrom, phoneRespText = nil, nil
    else
      phoneStatus = '«Блок четыре, диспетчер. Доложите мощность.» · 《四号机组，这里是调度。报告功率。》'
    end
    sfx('click')
  end
  -- 拨号盘
  local keys = { '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#' }
  for i, k in ipairs(keys) do
    local bx = px + 240 + ((i - 1) % 3) * 76
    local by = py + 70 + math.floor((i - 1) / 3) * 62
    if button(bx, by, 68, 54, k, {}) then
      if phoneLifted then
        phoneLineText = phoneLineText .. k
        phoneRespFrom, phoneRespText = nil, nil
        sfx('click')
      end
    end
  end
  -- 拨出显示
  love.graphics.setColor(Theme.panel4)
  love.graphics.rectangle('fill', px + 560, py + 70, 320, 44, 4)
  love.graphics.setColor(Theme.amber)
  love.graphics.setFont(Theme.getFont(18))
  love.graphics.print(phoneLineText == '' and '—' or phoneLineText, px + 572, py + 78)
  -- 拨号/挂断
  if button(px + 560, py + 128, 152, 44, '☎ 拨号', { active = true }) then
    phoneCall()
  end
  if button(px + 728, py + 128, 152, 44, '✕ 挂断', { danger = true }) then
    phoneLifted = false
    phoneStatus = '— 线路空闲 —'
    phoneLineText = ''
    phoneRespFrom, phoneRespText = nil, nil
    sfx('click')
  end
  -- 状态
  love.graphics.setColor(Theme.txtDim)
  love.graphics.setFont(Theme.getFont(12))
  love.graphics.print(phoneStatus, px + 32, py + 210, 480)
  -- 应答内容
  if phoneRespText then
    love.graphics.setColor(Theme.amber)
    love.graphics.setFont(Theme.getFont(13))
    if phoneRespFrom then love.graphics.print(phoneRespFrom, px + 32, py + 300) end
    love.graphics.setColor(Theme.txt)
    love.graphics.setFont(Theme.getFont(13))
    love.graphics.printf(phoneRespText, px + 32, py + 330, PANEL_W - 64)
  end
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.print('号码请查阅桌上的电话号码簿', px + 32, py + PANEL_H - 60)
end

local function drawPhonebook()
  local px, py = drawShell('ТЕЛЕФОННАЯ КНИГА · 电话号码簿', 'АЭС-4 · 内部总机：0 → 4')
  for i, pb in ipairs(PHONE_BOOK) do
    local ey = py + 80 + (i - 1) * 56
    love.graphics.setColor(Theme.panel4)
    love.graphics.rectangle('fill', px + 32, ey, PANEL_W - 64, 48, 4)
    love.graphics.setColor(Theme.edgeLo)
    love.graphics.rectangle('line', px + 32, ey, PANEL_W - 64, 48, 4)
    love.graphics.setColor(Theme.amber)
    love.graphics.setFont(Theme.getFont(16))
    love.graphics.print(pb.num, px + 48, ey + 13)
    love.graphics.setColor(Theme.txt)
    love.graphics.setFont(Theme.getFont(13))
    love.graphics.print(pb.name, px + 160, ey + 15)
    addHit(px + 32, ey, PANEL_W - 64, 48, function()
      openProp = 'phone'
      if not phoneLifted then
        phoneLifted = true
        phoneStatus = '«Блок четыре, диспетчер. Доложите мощность.» · 《四号机组，这里是调度。报告功率。》'
      end
      phoneLineText = pb.num
      phoneRespFrom, phoneRespText = nil, nil
      phoneCall()
    end)
  end
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.print('拨打前请先拿起调度台电话。已不在服务的端口不会接通。', px + 32, py + PANEL_H - 60)
end

-- ==================== 茶炉 ====================

local function teaSipDesc()
  if teaSips == 0 then return '热气腾腾。赶紧喝一口。' end
  if teaSips == 1 then return '温度恰到好处。还剩 2 口。' end
  if teaSips == 2 then return '快见底了。最后 1 口。' end
  return ''
end

local function drawCoffee()
  local px, py = drawShell('ЧАЙ · 茶炉', '夜班的命根子')
  local cup = teaState == 2 and '☕' or '🫖'
  local steam = teaState == 1 and '〰〰〰' or '· · ·'
  love.graphics.setFont(Theme.getFont(40))
  love.graphics.setColor(Theme.txt)
  love.graphics.print(cup, px + PANEL_W / 2 - 20, py + 120)
  love.graphics.setFont(Theme.getFont(16))
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.print(steam, px + PANEL_W / 2 - 30, py + 80)
  love.graphics.setFont(Theme.getFont(14))
  love.graphics.setColor(Theme.txt)
  local desc = teaState == 0 and '夜班的茶已经凉了。倒一杯热的吧。'
    or (teaState == 1 and teaSipDesc()
      or '咕咚。精神拉满。茶叶没光了——明天再泡。')
  love.graphics.print(desc, px + 40, py + 220)
  -- 叶子
  love.graphics.setFont(Theme.getFont(13))
  love.graphics.setColor(Theme.green)
  local leaves = teaState == 2 and '🍃 🍃 🍃 🍃 🍃' or (teaSips >= 2 and '🍃 🍃 🍃' or '🍃 🍃 🍃 🍃 🍃 🍃 🍃')
  love.graphics.print(leaves, px + 40, py + 250)
  -- 动作
  if teaState == 0 then
    if button(px + PANEL_W / 2 - 110, py + 300, 220, 44, '🔥 倒一杯热茶', {}) then
      teaState = 1
      teaSips = 0
      sfx('pour')
      if AppRef then AppRef.logEvent('info', '热茶倒好了。') end
    end
  elseif teaState == 1 then
    if button(px + PANEL_W / 2 - 110, py + 300, 220, 44, '☕ 喝一口 (' .. (3 - teaSips) .. '/3)', {}) then
      teaSips = teaSips + 1
      sfx('sip')
      if teaSips >= 3 then
        teaState = 2
        if AppRef then
          AppRef.logEvent('info', '你喝了一口热茶 — 精神拉满。')
          if AppRef.scenario then AppRef.scenario:onPlayerAction('tea_drunk') end
        end
      end
    end
  else
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.setFont(Theme.getFont(12))
    love.graphics.print('☕ 已喝完', px + PANEL_W / 2 - 30, py + 314)
  end
end

-- ==================== 日历（涂画） ====================

local calStrokes = {}     -- { tool, x1,y1,x2,y2 }（面板内坐标）
local calDrawing = false
local calLast = nil
local calTool = 'pen'     -- pen | pencil | eraser

local function calKey()
  return 'rbmk_cal_draw_' .. calendarModeKey
end

function Props.loadCalendarStrokes(modeKey)
  calendarModeKey = modeKey
  calStrokes = KvStore.get(calKey()) or {}
end

local function saveCalendarStrokes()
  KvStore.set(calKey(), calStrokes)
end

function Props.toggleCalendar(modeKey)
  if calendarOpen then
    saveCalendarStrokes()
    calendarOpen = false
  else
    Props.loadCalendarStrokes(modeKey)
    calendarOpen = true
  end
  sfx('paper')
end

function Props.calendarOpen() return calendarOpen end

local CAL_X, CAL_Y, CAL_W, CAL_H = 1080, 120, 480, 460

local function drawCalendar(App)
  love.graphics.setColor(0.93, 0.89, 0.75)
  love.graphics.rectangle('fill', CAL_X, CAL_Y, CAL_W, CAL_H, 6)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.rectangle('line', CAL_X, CAL_Y, CAL_W, CAL_H, 6)
  -- 头
  love.graphics.setColor({ 0.2, 0.2, 0.15 })
  love.graphics.setFont(Theme.getFont(12))
  local title = calendarModeKey == 'endless' and '无尽模式 · 1986 年 5 月' or '历史模式 · 1986 年 4 月'
  love.graphics.print(title, CAL_X + 16, CAL_Y + 10)
  -- 今日
  local day = 1
  if calendarModeKey == 'endless' then
    local okE, Endless = pcall(require, 'src.endless')
    if okE and Endless.getHud then
      local h = Endless.getHud()
      day = h and math.max(1, math.min(30, h.day)) or 1
    end
  else
    day = math.min(26, 25 + math.floor((Engine.S.t + 8 * 3600) / 86400))
  end
  -- 网格
  local gx, gy = CAL_X + 16, CAL_Y + 40
  local cell = 38
  love.graphics.setFont(Theme.getFont(10))
  for i, wd in ipairs({ '一', '二', '三', '四', '五', '六', '日' }) do
    love.graphics.setColor({ 0.45, 0.42, 0.32 })
    love.graphics.print(wd, gx + (i - 1) * cell + 12, gy)
  end
  for d = 1, 30 do
    local cxi = (d - 1) % 7
    local cyi = math.floor((d - 1) / 7)
    local cx, cy = gx + cxi * cell, gy + 20 + cyi * cell
    love.graphics.setColor(d == day and { 0.85, 0.3, 0.15 } or { 0.25, 0.24, 0.18 })
    love.graphics.rectangle('line', cx + 4, cy + 4, cell - 8, cell - 8, 3)
    if d == day then
      love.graphics.setColor({ 0.85, 0.3, 0.15 })
      love.graphics.printf(tostring(d), cx + 4, cy + 12, cell - 8, 'center')
    else
      love.graphics.setColor({ 0.25, 0.24, 0.18 })
      love.graphics.printf(tostring(d), cx + 4, cy + 12, cell - 8, 'center')
    end
  end
  -- 涂画层（点击拖动添加笔画）
  local mx, my = W.mouse.x, W.mouse.y
  local inGrid = mx >= gx and mx <= gx + 7 * cell and my >= gy + 20 and my <= gy + 20 + 5 * cell
  if inGrid and W.mouse.down then
    if not calDrawing then
      calDrawing = true
      calLast = { x = mx, y = my }
    end
    if calLast and (math.abs(calLast.x - mx) > 1 or math.abs(calLast.y - my) > 1) then
      calStrokes[#calStrokes + 1] = { tool = calTool,
        x1 = calLast.x - CAL_X, y1 = calLast.y - CAL_Y,
        x2 = mx - CAL_X, y2 = my - CAL_Y }
      calLast = { x = mx, y = my }
    end
  elseif calDrawing then
    calDrawing = false
    saveCalendarStrokes()
  end
  -- 渲染笔画
  love.graphics.push('all')
  love.graphics.setScissor(CAL_X, CAL_Y, CAL_W, CAL_H)
  for _, s in ipairs(calStrokes) do
    if s.tool == 'eraser' then
      love.graphics.setColor(0.93, 0.89, 0.75)
      love.graphics.setLineWidth(14)
    elseif s.tool == 'pencil' then
      love.graphics.setColor(0.3, 0.3, 0.3, 0.7)
      love.graphics.setLineWidth(2)
    else
      love.graphics.setColor({ 0.1, 0.29, 0.6 })
      love.graphics.setLineWidth(2)
    end
    love.graphics.line(s.x1 + CAL_X, s.y1 + CAL_Y, s.x2 + CAL_X, s.y2 + CAL_Y)
  end
  love.graphics.pop()
  -- 工具条
  local ty2 = CAL_Y + CAL_H + 8
  if button(CAL_X, ty2, 70, 30, '钢笔', { active = calTool == 'pen' }) then calTool = 'pen' end
  if button(CAL_X + 76, ty2, 70, 30, '铅笔', { active = calTool == 'pencil' }) then calTool = 'pencil' end
  if button(CAL_X + 152, ty2, 70, 30, '橡皮', { active = calTool == 'eraser' }) then calTool = 'eraser' end
  if button(CAL_X + 228, ty2, 70, 30, '清空', { danger = true }) then
    calStrokes = {}
    saveCalendarStrokes()
  end
  if button(CAL_X + 304, ty2, 90, 30, '收起 ▸', {}) then
    Props.toggleCalendar(calendarModeKey)
  end
end

-- ==================== 主绘制 / 输入 ====================

function Props.draw(App)
  hitRows = {}
  -- 日历（不遮罩）
  if calendarOpen then
    drawCalendar(App)
  end
  -- 道具条（常驻）
  Props.drawPropBar(App)
  -- 道具面板
  if openProp == 'manual' then drawManual()
  elseif openProp == 'clipboard' then drawClipboard()
  elseif openProp == 'calculator' then drawCalculator()
  elseif openProp == 'dosimeter' then drawDosimeter()
  elseif openProp == 'phone' then drawPhone()
  elseif openProp == 'phonebook' then drawPhonebook()
  elseif openProp == 'coffee' then drawCoffee() end
  -- 命中消费
  if W.mouse.pressed then
    for i = #hitRows, 1, -1 do
      local h = hitRows[i]
      local mx, my = W.mouse.x, W.mouse.y
      if mx >= h.x and mx <= h.x + h.w and my >= h.y and my <= h.y + h.h and h.cb then
        h.cb()
        break
      end
    end
  end
end

function Props.openProp(id)
  openProp = id
  if id == 'manual' then manualPage = manualPage or 0 end
  sfx('click')
end

function Props.closeProp()
  if openProp == 'dosimeter' then sfx('setGeigerRunning', false) end
  openProp = nil
end

function Props.isOpen() return openProp end
function Props.isCalendarOpen() return calendarOpen end

function Props.resetTea()
  teaState = 0
  teaSips = 0
  phoneLifted = false
  phoneLineText = ''
  phoneStatus = '— 线路空闲 —'
  phoneRespFrom, phoneRespText = nil, nil
  calcDisp = '0'
  calcAcc, calcOp = nil, nil
  calcNew = true
  calcMem = 0
end

function Props.mousepressed(App, x, y)
  W.mouse.pressed = true
  W.mouse.down = true
  W.mouse.x, W.mouse.y = x, y
end

function Props.mousereleased(App, x, y)
  W.mouse.down = false
  W.mouse.released = true
  if calDrawing then
    calDrawing = false
    saveCalendarStrokes()
  end
end

function Props.mousemoved(App, x, y)
  W.mouse.x, W.mouse.y = x, y
end

return Props
