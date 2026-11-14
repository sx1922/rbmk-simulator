-- menu.lua — 主菜单 + 整定设置
-- 左栏：ПУСК / АРХИВ(未开放) / НАСТРОЙКИ / ВЫХОД；右栏：模式列表或信息卡
-- 设置 6 分区（声音/画面/操作/工况/界面/系统），持久化到 rbmk_journal

local Theme = require('src.ui.theme')
local W = require('src.ui.widgets')
local Layout = require('src.ui.layout')
local Journal = require('src.journal')
local Engine = require('src.engine')

local Menu = {}

local onStartGame = nil
local open_ = false

local focus = { col = 'left', leftIdx = 1, rightIdx = 1, rightPowered = false, exitConfirm = false }

local clockSec = 0

-- 命中区缓存（draw 阶段收集，mouse 阶段消费）
local hitRows = {}      -- { x,y,w,h, cb }

local VERSION_STR = 'v0.1.0 · сб.2026.07.30 · РЭ-86/13'
local VERSION_CODENAME = 'Первый щит'

local LEFT_ITEMS = {
  { id = 'start', ru = 'ПУСК', cn = '开始值班', big = true },
  { id = 'archive', ru = 'АРХИВ', cn = '档案系统', disabled = true },
  { id = 'settings', ru = 'НАСТРОЙКИ', cn = '整定设置' },
  { id = 'exit', ru = 'ВЫХОД', cn = '退班退出' },
}

local MODE_ITEMS = {
  { id = 'story', ru = 'ХРОНИКА', cn = '历史重演', desc = '切尔诺贝利真实历史剧本', tag = '[сюжет 剧情]' },
  { id = 'challenge', ru = 'ВЫЗОВ', cn = '挑战模式', desc = '限时随机故障考验反应', tag = '[лимит 限时]' },
  { id = 'endless', ru = 'БЕСКОНЕЧНОСТЬ', cn = '无尽运营', desc = '核电站连续运营 · 逐月结算 · 直到破产或熔毁', tag = '[беск. 无尽]' },
}

-- ==================== 设置 ====================

local SETTINGS_TABS = {
  { id = 'audio', ru = 'ЗВУК', cn = '声音' },
  { id = 'video', ru = 'ЭКРАН', cn = '画面' },
  { id = 'controls', ru = 'УПРАВЛЕНИЕ', cn = '操作' },
  { id = 'difficulty', ru = 'РЕЖИМ', cn = '工况难度' },
  { id = 'interface', ru = 'ИНТЕРФЕЙС', cn = '界面语言' },
  { id = 'system', ru = 'СИСТЕМА', cn = '系统关于' },
}

local SETTINGS_DATA = {
  audio = { items = {
    { type = 'slider', id = 'masterVol', label = '主音量', min = 0, max = 100, val = 80, unit = '%' },
    { type = 'slider', id = 'ambient', label = '控制室底噪', min = 0, max = 100, val = 60, unit = '%' },
    { type = 'slider', id = 'alarmVol', label = '警报音量', min = 0, max = 100, val = 70, unit = '%' },
    { type = 'slider', id = 'voiceVol', label = '广播语音', min = 0, max = 100, val = 50, unit = '%' },
    { type = 'toggle', id = 'mute', label = '一键静音', val = false, opts = { '开', '关' } },
  } },
  video = { items = {
    { type = 'slider', id = 'crtIntensity', label = 'CRT 显示管强度', min = 0, max = 100, val = 70, unit = '%' },
    { type = 'toggle', id = 'fullscreen', label = '全屏', val = false, opts = { '开', '关' } },
    { type = 'toggle', id = 'vSync', label = '垂直同步', val = true, opts = { '开', '关' } },
  } },
  controls = { items = {
    { type = 'label', label = '键位绑定', info = '游戏内已内置: ↑↓ 棒 · 1-8 泵 · A АЗ-5 · P 模式' },
    { type = 'label', label = '鼠标灵敏度', info = '待实现 (v0.3+)' },
    { type = 'label', label = '手柄支持', info = '待实现' },
  } },
  difficulty = { items = {
    { type = 'slider', id = 'displayAid', label = '仪表数字辅助', min = 0, max = 100, val = 50, unit = '%' },
    { type = 'slider', id = 'warnLevel', label = '故障预警等级', min = 0, max = 100, val = 60, unit = '%' },
    { type = 'toggle', id = 'consequenceMode', label = '后果模式', val = true, opts = { '写实', '宽容' } },
    { type = 'slider', id = 'timeScale', label = '时间加速', min = 0, max = 200, val = 100, unit = '%' },
  } },
  interface = { items = {
    { type = 'toggle', id = 'lang', label = '语言', val = false, opts = { '中文', 'RU' } },
    { type = 'toggle', id = 'subtitles', label = '字幕/广播文本', val = true, opts = { '开', '关' } },
    { type = 'slider', id = 'fxIntensity', label = '环境动效强度', min = 0, max = 100, val = 80, unit = '%' },
    { type = 'toggle', id = 'highContrast', label = '色盲/高对比模式', val = false, opts = { '开', '关' } },
  } },
  system = { items = {
    { type = 'version', label = '版本信息' },
    { type = 'action', id = 'clearSave', label = '清除存档', danger = true },
    { type = 'action', id = 'resetSettings', label = '还原出厂设置', danger = true },
  } },
}

local SETTING_MAP = {
  masterVol       = { key = 'masterVolume', scale = 0.01 },
  ambient         = { key = 'busVolumes.ambient', scale = 0.01 },
  alarmVol        = { key = 'busVolumes.alarms', scale = 0.01 },
  voiceVol        = { key = 'busVolumes.narrative', scale = 0.01 },
  crtIntensity    = { key = 'crtIntensity' },
  fullscreen      = { key = 'fullscreen', bool = true },
  vSync           = { key = 'vSync', bool = true },
  displayAid      = { key = 'digitalAssist', scale = 0.01 },
  warnLevel       = { key = 'warningLevel', scale = 0.03 },
  consequenceMode = { key = 'consequenceMode', bool = true, trueVal = 'realistic', falseVal = 'forgiving' },
  timeScale       = { key = 'timeScale', apply = function(v)
    Engine.setTimeScale(math.max(1, math.floor(v / 100 * 10 + 0.5)))
  end },
  lang            = { key = 'language', bool = true, trueVal = 'zh', falseVal = 'ru' },
  subtitles       = { key = 'subtitles', bool = true },
  fxIntensity     = { key = 'ambientMotion' },
  mute            = { key = 'muted', bool = true },
  highContrast    = { key = 'highContrast', bool = true },
}

local settingsTabIdx = 1
local settingsOpen = false
local settingsCloseCb = nil

local function initSettingsValues()
  local s = Journal.loadJournal().settings or {}
  for _, tab in ipairs(SETTINGS_TABS) do
    local items = SETTINGS_DATA[tab.id] and SETTINGS_DATA[tab.id].items or {}
    for _, item in ipairs(items) do
      local m = SETTING_MAP[item.id]
      if m then
        local stored = Journal.getSetting({ settings = s }, m.key)
        if stored ~= nil then
          if m.bool then
            item.val = (m.trueVal ~= nil) and (stored == m.trueVal) or (stored == true)
          elseif item.type == 'slider' then
            item.val = m.scale and math.floor(stored / m.scale + 0.5) or math.floor(stored + 0.5)
          end
        end
      end
    end
  end
end

local function applySetting(id, raw)
  local m = SETTING_MAP[id]
  if not m then return end
  local j = Journal.loadJournal()
  local val
  if m.bool then
    if m.trueVal ~= nil then
      val = raw and m.trueVal or m.falseVal
    else
      val = raw == true
    end
  else
    val = m.scale and raw * m.scale or raw
  end
  Journal.setSetting(j, m.key, val)
  if m.apply then m.apply(val) end
  Journal.recordSettingsChange(j, j.settings)
end

function Menu.restoreStoredSettings()
  local s = Journal.loadJournal().settings or {}
  if type(s.timeScale) == 'number' then
    Engine.setTimeScale(math.max(1, math.floor(s.timeScale / 100 * 10 + 0.5)))
  end
  if love.window and type(s.fullscreen) == 'boolean' and s.fullscreen then
    pcall(love.window.setFullscreen, true)
  end
end

-- ==================== 绘制原语 ====================

local function rgba(c, a)
  return { c[1], c[2], c[3], a or 1 }
end

local function addHit(x, y, w, h, cb)
  hitRows[#hitRows + 1] = { x = x, y = y, w = w, h = h, cb = cb }
end

local function lampDot(x, y, color, on, breathing, t)
  love.graphics.setColor(Theme.panel4)
  love.graphics.circle('fill', x, y, 9)
  local a = on and 1 or 0.15
  if on and breathing then
    a = 0.55 + 0.45 * math.sin(t * 2.2)
  end
  love.graphics.setColor(rgba(color, a))
  love.graphics.circle('fill', x, y, 6)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.setLineWidth(1)
  love.graphics.circle('line', x, y, 9)
end

-- ==================== 主菜单绘制 ====================

local function drawLeftItems(t)
  local x, y = 200, 260
  for i, item in ipairs(LEFT_ITEMS) do
    if item.big then
      local focused = focus.col == 'left' and focus.leftIdx == i
      local h = 72
      love.graphics.setColor(focused and { 0.16, 0.19, 0.16 } or Theme.panel2)
      love.graphics.rectangle('fill', x, y, 420, h, 6)
      love.graphics.setColor(focused and rgba(Theme.amber) or Theme.edgeLo)
      love.graphics.setLineWidth(focused and 2 or 1)
      love.graphics.rectangle('line', x, y, 420, h, 6)
      love.graphics.setFont(Theme.getFont(26))
      love.graphics.setColor(focused and rgba(Theme.amber) or rgba(Theme.txtDim))
      love.graphics.print(item.ru, x + (focused and 44 or 40), y + 16)
      love.graphics.setFont(Theme.getFont(11))
      love.graphics.setColor(Theme.txtFaint)
      love.graphics.print(item.cn, x + 44, y + 48)
      addHit(x, y, 420, h, function()
        focus.leftIdx = i
        focus.col = 'left'
        Menu.confirmLeft()
      end)
      y = y + h + 14
    else
      local focused = focus.col == 'left' and focus.leftIdx == i
      local h = 56
      love.graphics.setColor(focused and Theme.panel2 or Theme.panel)
      love.graphics.rectangle('fill', x, y, 420, h, 6)
      love.graphics.setColor(focused and rgba(Theme.amber, 0.7) or Theme.edgeLo)
      love.graphics.setLineWidth(1)
      love.graphics.rectangle('line', x, y, 420, h, 6)
      love.graphics.setFont(Theme.getFont(11))
      love.graphics.setColor(focused and rgba(Theme.amber) or Theme.txtFaint)
      love.graphics.print(focused and '▶' or '·', x + 16, y + 10)
      love.graphics.setFont(Theme.getFont(16))
      love.graphics.setColor(focused and rgba(Theme.txt) or rgba(Theme.txtDim))
      love.graphics.print(item.ru, x + 44, y + 10)
      love.graphics.setFont(Theme.getFont(10))
      love.graphics.setColor(Theme.txtFaint)
      love.graphics.print(item.cn, x + 44, y + 34)
      if item.disabled then
        love.graphics.setFont(Theme.getFont(8))
        love.graphics.setColor(rgba(Theme.redDeep))
        love.graphics.print('НЕ ДОПУЩЕНО · 未获准', x + 250, y + 22)
      else
        addHit(x, y, 420, h, function()
          focus.leftIdx = i
          focus.col = 'left'
          Menu.confirmLeft()
        end)
      end
      y = y + h + 12
    end
  end
end

local function drawModeList(t)
  local x, y = 700, 220
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.print('ВЫБЕРИТЕ РЕЖИМ ДЛЯ ЗАПУСКА · 请选择运行模式', x, y - 34)
  for i, mode in ipairs(MODE_ITEMS) do
    local focused = focus.col == 'right' and focus.rightIdx == i
    local h = 110
    love.graphics.setColor(focused and Theme.panel2 or Theme.panel)
    love.graphics.rectangle('fill', x, y, 700, h, 6)
    love.graphics.setColor(focused and rgba(Theme.amber, 0.7) or Theme.edgeLo)
    love.graphics.setLineWidth(focused and 2 or 1)
    love.graphics.rectangle('line', x, y, 700, h, 6)
    love.graphics.setFont(Theme.getFont(12))
    love.graphics.setColor(focused and rgba(Theme.amber) or Theme.txtFaint)
    love.graphics.print(focused and '▸' or ' ', x + 16, y + 14)
    love.graphics.setFont(Theme.getFont(11))
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.print(string.format('%02d', i), x + 40, y + 16)
    love.graphics.setFont(Theme.getFont(20))
    love.graphics.setColor(focused and rgba(Theme.amber) or rgba(Theme.txt))
    love.graphics.print(mode.ru, x + 90, y + 14)
    love.graphics.setFont(Theme.getFont(11))
    love.graphics.setColor(Theme.txtDim)
    love.graphics.print(mode.cn .. ' · ' .. mode.desc, x + 90, y + 48)
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.print(mode.tag, x + 90, y + 74)
    addHit(x, y, 700, h, function()
      focus.col = 'right'
      focus.rightIdx = i
      focus.rightPowered = true
      Menu.confirmRight()
    end)
    -- 无尽继续按钮
    if mode.id == 'endless' then
      local okE, Endless = pcall(require, 'src.endless')
      if okE and Endless.hasSave and Endless.hasSave() then
        local info = Endless.saveInfo and Endless.saveInfo() or nil
        local bx, by = x + 480, y + 62
        love.graphics.setColor({ 0.14, 0.2, 0.14 })
        love.graphics.rectangle('fill', bx, by, 200, 36, 4)
        love.graphics.setColor(rgba(Theme.green, 0.8))
        love.graphics.setLineWidth(1)
        love.graphics.rectangle('line', bx, by, 200, 36, 4)
        love.graphics.setFont(Theme.getFont(10))
        love.graphics.setColor(rgba(Theme.green))
        local label = '继续上次运营' .. (info and (' · 第 ' .. info.month .. ' 月') or '')
        love.graphics.print(label, bx + 12, by + 11)
        addHit(bx, by, 200, 36, function()
          Menu.hideAll()
          if onStartGame then onStartGame('endless_resume') end
        end)
      end
    end
    y = y + h + 16
  end
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.print('↑↓ 选择模式  ⏎ 进入  Esc 返回', x, y + 4)
end

local function drawRightPanel(t)
  local active = LEFT_ITEMS[focus.leftIdx]
  if not active then return end
  if active.id == 'start' and focus.rightPowered then
    drawModeList(t)
    return
  end
  local x, y = 700, 300
  love.graphics.setColor(Theme.panel)
  love.graphics.rectangle('fill', x, y - 40, 700, 320, 6)
  love.graphics.setColor(Theme.edgeLo)
  love.graphics.rectangle('line', x, y - 40, 700, 320, 6)
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(12))
  if active.id == 'start' then
    love.graphics.print('┌────────────────────┐', x + 220, y + 20)
    love.graphics.print('│  子屏待命  │', x + 220, y + 48)
    love.graphics.print('└────────────────────┘', x + 220, y + 76)
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.print('ВЫБЕРИТЕ РЕЖИМ · 请选择运行模式（按 ⏎ 点亮）', x + 200, y + 120)
  elseif active.id == 'archive' then
    love.graphics.setFont(Theme.getFont(20))
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.print('АРХИВ · 档案系统', x + 250, y + 40)
    love.graphics.setFont(Theme.getFont(10))
    love.graphics.setColor(rgba(Theme.redDeep))
    love.graphics.print('НЕ ДОСТУПЕН · 未开放', x + 280, y + 80)
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.print('档案系统未就绪 · v0.6 «Память» 建设中', x + 240, y + 120)
  elseif active.id == 'settings' then
    love.graphics.setFont(Theme.getFont(14))
    love.graphics.setColor(Theme.txtDim)
    love.graphics.print('НАСТРОЙКИ · 整定设置', x + 260, y + 40)
    love.graphics.setFont(Theme.getFont(10))
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.print('整定参数 · 6 个分区 → 按 ⏎ 进入设置屏', x + 240, y + 80)
  elseif active.id == 'exit' then
    if focus.exitConfirm then
      love.graphics.setFont(Theme.getFont(16))
      love.graphics.setColor(rgba(Theme.amber))
      love.graphics.print('ПОКИНУТЬ СМЕНУ? · 退出当前班次?', x + 210, y + 40)
      love.graphics.setFont(Theme.getFont(10))
      love.graphics.setColor(Theme.txtFaint)
      love.graphics.print('确认退班?  ⏎ 是 · Esc 否', x + 270, y + 90)
    else
      love.graphics.setFont(Theme.getFont(12))
      love.graphics.setColor(Theme.txtDim)
      love.graphics.print('ВЫХОД · 退出', x + 290, y + 40)
      love.graphics.setFont(Theme.getFont(10))
      love.graphics.setColor(Theme.txtFaint)
      love.graphics.print('→ 按 ⏎ 确认退班', x + 290, y + 80)
    end
  end
end

local function drawMainMenu()
  if not open_ then return end
  hitRows = {}
  local t = love.timer.getTime()

  -- 背景
  love.graphics.setColor(0.07, 0.08, 0.07)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  -- CRT 外框
  love.graphics.setColor(Theme.panel)
  love.graphics.rectangle('fill', 80, 40, 1440, 800, 12)
  love.graphics.setColor(Theme.edge)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', 80, 40, 1440, 800, 12)
  -- 铆钉
  for _, pos in ipairs({ { 100, 60 }, { 1500, 60 }, { 100, 820 }, { 1500, 820 } }) do
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.circle('fill', pos[1], pos[2], 5)
  end

  -- 头部
  love.graphics.setColor(Theme.amber)
  love.graphics.setFont(Theme.getFont(30))
  love.graphics.print('ЩИТ', 140, 66)
  love.graphics.setFont(Theme.getFont(11))
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.print('主控培训模拟器 · Главный пульт тренажёра', 240, 80)

  lampDot(1100, 84, Theme.amber, true, false, t)
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.print('ПУСК 开始值班', 1084, 100)
  lampDot(1220, 84, Theme.green, true, true, t)
  love.graphics.print('ГОТОВ 就绪', 1202, 100)
  lampDot(1330, 84, Theme.red, false, false, t)
  love.graphics.print('АВАР 警报', 1314, 100)

  local cs = math.floor(clockSec)
  local function p2(n)
    n = math.floor(n)
    if n < 10 then return '0' .. n end
    return tostring(n)
  end
  love.graphics.setColor(Theme.txt)
  love.graphics.setFont(Theme.getFont(16))
  love.graphics.print(p2(cs / 3600 % 24) .. ':' .. p2(cs / 60 % 60) .. ':' .. p2(cs % 60), 1400, 74)

  love.graphics.setColor(Theme.edgeLo)
  love.graphics.line(100, 126, 1500, 126)

  drawLeftItems(t)
  drawRightPanel(t)

  -- 页脚
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(9))
  love.graphics.print(VERSION_STR .. ' · LÖVE 2D', 140, 828)
  love.graphics.print('↑↓ 移动 · ⏎ 确认 · Esc 返回', 1300, 828)
end

-- ==================== 设置绘制 ====================

local function drawSettings()
  local t = love.timer.getTime()
  love.graphics.setColor(0.07, 0.08, 0.07)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)
  love.graphics.setColor(Theme.panel)
  love.graphics.rectangle('fill', 80, 40, 1440, 800, 12)
  love.graphics.setColor(Theme.edge)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', 80, 40, 1440, 800, 12)

  love.graphics.setColor(Theme.amber)
  love.graphics.setFont(Theme.getFont(20))
  love.graphics.print('НАСТРОЙКИ · 整定设置', 140, 70)
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.print('[✕] ЗАКРЫТЬ · 关闭 (Esc)', 1330, 76)
  addHit(1320, 66, 180, 30, function() Menu.closeSettings() end)

  love.graphics.setColor(Theme.edgeLo)
  love.graphics.line(100, 120, 1500, 120)

  -- 左侧分区列表
  local y = 160
  for i, tab in ipairs(SETTINGS_TABS) do
    local focused = i == settingsTabIdx
    love.graphics.setColor(focused and Theme.panel2 or Theme.panel3)
    love.graphics.rectangle('fill', 120, y, 360, 56, 4)
    if focused then
      love.graphics.setColor(rgba(Theme.amber, 0.8))
      love.graphics.setLineWidth(1)
      love.graphics.rectangle('line', 120, y, 360, 56, 4)
    end
    love.graphics.setFont(Theme.getFont(10))
    love.graphics.setColor(focused and rgba(Theme.amber) or Theme.txtFaint)
    love.graphics.print(focused and '▶' or '·', 136, y + 20)
    love.graphics.setFont(Theme.getFont(15))
    love.graphics.setColor(focused and rgba(Theme.txt) or rgba(Theme.txtDim))
    love.graphics.print(tab.ru, 164, y + 10)
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.print(tab.cn, 164, y + 34)
    addHit(120, y, 360, 56, function()
      settingsTabIdx = i
    end)
    y = y + 64
  end

  -- 右侧内容
  local tab = SETTINGS_TABS[settingsTabIdx]
  local items = SETTINGS_DATA[tab.id].items
  local cx, cy = 540, 160
  love.graphics.setColor(Theme.txtDim)
  love.graphics.setFont(Theme.getFont(14))
  love.graphics.print(tab.ru .. ' · ' .. tab.cn, cx, cy - 26)
  local iy = cy + 16
  for _, item in ipairs(items) do
    if item.type == 'slider' then
      love.graphics.setFont(Theme.getFont(12))
      love.graphics.setColor(Theme.txtDim)
      love.graphics.print(item.label, cx, iy + 12)
      -- 滑杆
      local sx, sw = cx + 240, 380
      local frac = (item.val - item.min) / (item.max - item.min)
      love.graphics.setColor(Theme.panel4)
      love.graphics.rectangle('fill', sx, iy + 14, sw, 10, 4)
      love.graphics.setColor(Theme.amber)
      love.graphics.rectangle('fill', sx, iy + 14, math.max(1, sw * math.min(1, math.max(0, frac))), 10, 4)
      local kx = sx + sw * math.min(1, math.max(0, frac)) - 7
      love.graphics.setColor(Theme.txt)
      love.graphics.rectangle('fill', kx, iy + 8, 14, 22, 3)
      love.graphics.setFont(Theme.getFont(11))
      love.graphics.setColor(Theme.amber)
      local vt = item.val .. (item.unit or '%')
      love.graphics.print(vt, sx + sw + 16, iy + 12)
      -- 拖拽命中
      addHit(sx - 10, iy, sw + 20, 40, nil)
      local hIdx = #hitRows
      hitRows[hIdx].dragSlider = item
      iy = iy + 52
    elseif item.type == 'toggle' then
      love.graphics.setFont(Theme.getFont(12))
      love.graphics.setColor(Theme.txtDim)
      love.graphics.print(item.label, cx, iy + 12)
      local bx = cx + 240
      for oi, opt in ipairs(item.opts) do
        local active = (oi == 1) == (item.val == true or item.val == (SETTING_MAP[item.id] and SETTING_MAP[item.id].trueVal or true))
        local obx = bx + (oi - 1) * 100
        love.graphics.setColor(active and { 0.55, 0.4, 0.12 } or Theme.panel4)
        love.graphics.rectangle('fill', obx, iy, 92, 36, 3)
        love.graphics.setColor(active and rgba(Theme.amber) or Theme.edgeLo)
        love.graphics.rectangle('line', obx, iy, 92, 36, 3)
        love.graphics.setFont(Theme.getFont(11))
        love.graphics.setColor(active and rgba(Theme.amber) or Theme.txtFaint)
        local tw = love.graphics.getFont():getWidth(opt)
        love.graphics.print(opt, obx + 46 - tw / 2, iy + 11)
        local choiceIdx = oi
        addHit(obx, iy, 92, 36, function()
          applySetting(item.id, choiceIdx == 1)
          item.val = choiceIdx == 1
        end)
      end
      iy = iy + 52
    elseif item.type == 'label' then
      love.graphics.setFont(Theme.getFont(12))
      love.graphics.setColor(Theme.txtFaint)
      love.graphics.print(item.label, cx, iy + 12)
      love.graphics.setFont(Theme.getFont(10))
      love.graphics.setColor(Theme.txtFaint)
      love.graphics.print(item.info or '', cx + 240, iy + 14)
      iy = iy + 44
    elseif item.type == 'version' then
      love.graphics.setFont(Theme.getFont(12))
      love.graphics.setColor(Theme.txtDim)
      love.graphics.print(item.label, cx, iy + 12)
      love.graphics.setFont(Theme.getFont(10))
      love.graphics.setColor(Theme.txtFaint)
      love.graphics.print(VERSION_STR .. ' · «' .. VERSION_CODENAME .. '» · LÖVE 2D · sx1922', cx + 240, iy + 14)
      iy = iy + 44
    elseif item.type == 'action' then
      love.graphics.setFont(Theme.getFont(12))
      love.graphics.setColor(item.danger and rgba(Theme.redDeep) or Theme.txtFaint)
      love.graphics.print(item.label, cx, iy + 12)
      love.graphics.setColor(item.danger and rgba(Theme.redDeep) or Theme.edgeLo)
      love.graphics.setLineWidth(1)
      love.graphics.rectangle('line', cx + 240, iy + 4, 120, 30, 3)
      love.graphics.setFont(Theme.getFont(10))
      love.graphics.print('→', cx + 292, iy + 10)
      local actionId = item.id
      addHit(cx + 240, iy + 4, 120, 30, function()
        if actionId == 'clearSave' then
          Journal.clearAll()
          love.window.showMessageBox('ЩИТ', '存档已清除 · rbmk_journal', 'info')
        elseif actionId == 'resetSettings' then
          local j = Journal.loadJournal()
          Journal.recordSettingsChange(j, Journal.defaultSettings())
          initSettingsValues()
          Menu.restoreStoredSettings()
        end
      end)
      iy = iy + 48
    end
  end

  -- 页脚
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.setFont(Theme.getFont(10))
  love.graphics.print('← 恢复出厂整定', 140, 828)
  addHit(130, 818, 180, 26, function()
    local j = Journal.loadJournal()
    Journal.recordSettingsChange(j, Journal.defaultSettings())
    initSettingsValues()
    Menu.restoreStoredSettings()
  end)
  love.graphics.print('Esc 返回主菜单', 1330, 828)

  -- 滑杆拖拽（读取当前鼠标状态）
  for _, h in ipairs(hitRows) do
    if h.dragSlider and W.mouse.down then
      local mx = W.mouse.x
      if mx >= h.x and mx <= h.x + h.w then
        local item = h.dragSlider
        local frac = (mx - (h.x + 10)) / (h.w - 20)
        frac = math.max(0, math.min(1, frac))
        local v = item.min + frac * (item.max - item.min)
        v = math.floor(v + 0.5)
        if v ~= item.val then
          item.val = v
          applySetting(item.id, v)
        end
      end
    end
  end
end

-- ==================== 交互 ====================

function Menu.confirmLeft()
  local item = LEFT_ITEMS[focus.leftIdx]
  if not item or item.disabled then return end
  if item.id == 'start' then
    if not focus.rightPowered then
      focus.rightPowered = true
      focus.col = 'right'
      focus.rightIdx = 1
    else
      Menu.confirmRight()
    end
  elseif item.id == 'settings' then
    Menu.showSettings()
  elseif item.id == 'exit' then
    if focus.exitConfirm then
      love.event.quit()
      return
    end
    focus.exitConfirm = true
  end
end

function Menu.confirmRight()
  local mode = MODE_ITEMS[focus.rightIdx]
  if not mode then return end
  Menu.hideAll()
  if onStartGame then onStartGame(mode.id) end
end

function Menu.keypressed(key)
  if not open_ then return end
  if settingsOpen then
    if key == 'escape' then
      Menu.closeSettings()
    elseif key == 'up' or key == 'w' then
      settingsTabIdx = math.max(1, settingsTabIdx - 1)
    elseif key == 'down' or key == 's' then
      settingsTabIdx = math.min(#SETTINGS_TABS, settingsTabIdx + 1)
    end
    return
  end
  if focus.col == 'right' then
    if key == 'up' or key == 'w' then
      focus.rightIdx = math.max(1, focus.rightIdx - 1)
    elseif key == 'down' or key == 's' then
      focus.rightIdx = math.min(#MODE_ITEMS, focus.rightIdx + 1)
    elseif key == 'escape' then
      focus.col = 'left'
      focus.rightPowered = false
    elseif key == 'return' or key == 'kpenter' or key == 'space' then
      Menu.confirmRight()
    elseif key == '1' or key == '2' or key == '3' then
      focus.rightIdx = tonumber(key)
      Menu.confirmRight()
    end
  else
    if key == 'up' or key == 'w' then
      -- 跳过 disabled
      local i = focus.leftIdx
      for _ = 1, #LEFT_ITEMS do
        i = math.max(1, i - 1)
        if not LEFT_ITEMS[i].disabled then break end
      end
      focus.leftIdx = i
      focus.rightPowered = false
      focus.exitConfirm = false
    elseif key == 'down' or key == 's' then
      local i = focus.leftIdx
      for _ = 1, #LEFT_ITEMS do
        i = math.min(#LEFT_ITEMS, i + 1)
        if not LEFT_ITEMS[i].disabled then break end
      end
      focus.leftIdx = i
      focus.rightPowered = false
      focus.exitConfirm = false
    elseif key == 'return' or key == 'kpenter' or key == 'space' then
      Menu.confirmLeft()
    elseif key == 'escape' then
      local item = LEFT_ITEMS[focus.leftIdx]
      if item and item.id == 'exit' and focus.exitConfirm then
        focus.exitConfirm = false
      elseif item and item.id == 'start' and focus.rightPowered then
        focus.rightPowered = false
      end
    end
  end
end

function Menu.mousepressed(x, y)
  if not open_ then return end
  W.mouse.x, W.mouse.y = x, y
  W.mouse.pressed = true
  W.mouse.down = true
  for i = #hitRows, 1, -1 do
    local h = hitRows[i]
    if x >= h.x and x <= h.x + h.w and y >= h.y and y <= h.y + h.h and h.cb then
      h.cb()
      break
    end
  end
end

function Menu.mousereleased()
  W.mouse.down = false
  W.mouse.released = true
end

function Menu.mousemoved(x, y)
  W.mouse.x, W.mouse.y = x, y
end

function Menu.update(dt)
  if open_ then clockSec = clockSec + dt end
end

-- ==================== 开关 ====================

function Menu.show(cb)
  onStartGame = cb
  open_ = true
  settingsOpen = false
  focus = { col = 'left', leftIdx = 1, rightIdx = 1, rightPowered = false, exitConfirm = false }
  clockSec = 0
  initSettingsValues()
  Menu.restoreStoredSettings()
end

function Menu.hideAll()
  open_ = false
  settingsOpen = false
end

function Menu.showSettings()
  settingsTabIdx = 1
  initSettingsValues()
  settingsOpen = true
end

function Menu.closeSettings()
  settingsOpen = false
  if settingsCloseCb then
    local cb = settingsCloseCb
    settingsCloseCb = nil
    cb()
  end
end

function Menu.openSettings(cb)
  settingsCloseCb = cb or nil
  Menu.showSettings()
end

function Menu.settingsOpen() return settingsOpen end

function Menu.isOpen() return open_ end

function Menu.draw()
  if not open_ then return end
  if settingsOpen then
    drawSettings()
  else
    drawMainMenu()
  end
end

return Menu
