-- pause.lua — FLOW-01 §8-9 暂停菜单 + 结束值班确认（LÖVE 绘制版）
-- 覆盖层：半透明遮罩 + 中央卡片；键盘 ↑↓/⏎/Esc，鼠标可点。

local Theme = require('src.ui.theme')
local W = require('src.ui.widgets')

local Pause = {}

local open = false
local confirmMode = false
local confirmOnly = false
local focusIdx = 1
local items = {}
local onEndShift, onResume, onSettings = nil, nil, nil
local statsFn = nil

local CARD_W, CARD_H = 420, 300
local CONFIRM_W, CONFIRM_H = 420, 220

local function cardX() return 800 - CARD_W / 2 end
local function cardY() return 450 - CARD_H / 2 end
local function confirmX() return 800 - CONFIRM_W / 2 end
local function confirmY() return 450 - CONFIRM_H / 2 end

local function itemRect(i)
  return cardX() + 40, cardY() + 90 + (i - 1) * 52, CARD_W - 80, 42
end

function Pause.show(opts)
  items = opts.items or {
    { id = 'resume', ru = 'ПРОДОЛЖИТЬ', cn = '继续值班' },
    { id = 'settings', ru = 'НАСТРОЙКИ', cn = '整定设置' },
    { id = 'end', ru = 'КОНЕЦ СМЕНЫ', cn = '结束值班' },
  }
  onEndShift = opts.onEndShift
  onResume = opts.onResume
  onSettings = opts.onSettings
  statsFn = opts.stats or nil
  focusIdx = 1
  confirmMode = false
  confirmOnly = opts.confirmOnly or false
  open = true
  if opts.confirmOnly then confirmMode = true end
end

function Pause.hide() open = false; confirmMode = false end
function Pause.isOpen() return open end

local function activate()
  local it = items[focusIdx]
  if not it then return end
  if it.id == 'resume' then
    if onResume then onResume() end
  elseif it.id == 'settings' then
    if onSettings then onSettings() end
  elseif it.id == 'end' then
    confirmMode = true
  end
end

local function doEnd()
  Pause.hide()
  if onEndShift then onEndShift() end
end

function Pause.keypressed(key)
  if not open then return end
  if confirmMode then
    if key == 'escape' then
      if confirmOnly then
        Pause.hide()
        if onResume then onResume() end
      else
        confirmMode = false
      end
    elseif key == 'return' or key == 'kpenter' or key == 'space' then
      doEnd()
    end
    return
  end
  if key == 'escape' then
    Pause.hide()
    if onResume then onResume() end
  elseif key == 'up' or key == 'w' then
    focusIdx = (focusIdx - 2) % #items + 1
  elseif key == 'down' or key == 's' then
    focusIdx = focusIdx % #items + 1
  elseif key == 'return' or key == 'kpenter' or key == 'space' then
    activate()
  end
end

function Pause.mousepressed(x, y)
  if not open then return end
  if confirmMode then
    -- 确认框：点卡片外取消
    local cx, cy = confirmX(), confirmY()
    if x < cx or x > cx + CONFIRM_W or y < cy or y > cy + CONFIRM_H then
      if confirmOnly then
        Pause.hide()
        if onResume then onResume() end
      else
        confirmMode = false
      end
    end
    return
  end
  for i = 1, #items do
    local ix, iy, iw, ih = itemRect(i)
    if x >= ix and x <= ix + iw and y >= iy and y <= iy + ih then
      focusIdx = i
      activate()
      return
    end
  end
end

function Pause.draw()
  if not open then return end
  love.graphics.setColor(0, 0, 0, 0.72)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)

  if confirmMode then
    local cx, cy = confirmX(), confirmY()
    love.graphics.setColor(Theme.panel2)
    love.graphics.rectangle('fill', cx, cy, CONFIRM_W, CONFIRM_H, 8)
    love.graphics.setColor(Theme.redDeep)
    love.graphics.setLineWidth(2)
    love.graphics.rectangle('line', cx, cy, CONFIRM_W, CONFIRM_H, 8)
    W.labelCenter(cx + CONFIRM_W / 2, cy + 34, '确认结束值班？', 18, Theme.amber)
    if statsFn then
      W.textBlock(cx + 40, cy + 78, CONFIRM_W - 80, statsFn() or '')
    end
    W.labelCenter(cx + CONFIRM_W / 2, cy + CONFIRM_H - 56,
      '⏎ 确认   ·   Esc 取消', 12, Theme.txtDim)
  else
    local cx, cy = cardX(), cardY()
    love.graphics.setColor(Theme.panel2)
    love.graphics.rectangle('fill', cx, cy, CARD_W, CARD_H, 8)
    love.graphics.setColor(Theme.edge)
    love.graphics.setLineWidth(2)
    love.graphics.rectangle('line', cx, cy, CARD_W, CARD_H, 8)
    W.labelCenter(cx + CARD_W / 2, cy + 28, 'ПАУЗА / 暂停', 18, Theme.amber)
    for i = 1, #items do
      local ix, iy, iw, ih = itemRect(i)
      local focused = i == focusIdx
      love.graphics.setColor(focused and { 0.13, 0.15, 0.17 } or Theme.panel4)
      love.graphics.rectangle('fill', ix, iy, iw, ih, 4)
      if focused then
        love.graphics.setColor(Theme.amber)
        love.graphics.setLineWidth(1)
        love.graphics.rectangle('line', ix, iy, iw, ih, 4)
      end
      W.label(ix + 18, iy + 11, focused and '▶' or '·', 12,
        focused and Theme.amber or Theme.txtFaint)
      W.label(ix + 44, iy + 10, items[i].ru, 13, focused and Theme.txt or Theme.txtDim)
      W.label(ix + 44, iy + 25, items[i].cn, 9, Theme.txtFaint)
    end
    W.labelCenter(cx + CARD_W / 2, cy + CARD_H - 30, 'Esc 继续 · ↑↓ 选择 · ⏎ 确认', 10, Theme.txtFaint)
  end
end

return Pause
