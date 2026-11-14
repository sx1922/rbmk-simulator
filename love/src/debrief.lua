-- debrief.lua — 结算画面 + 历史匹配度（LÖVE 绘制版）
-- 双栏：左 = 数据行，右 = 尾声/评语/结算细分；⏎ / Esc 返回主菜单。

local Theme = require('src.ui.theme')
local W = require('src.ui.widgets')

local Debrief = {}

local data = nil
local open = false
local epiLines = {}
local epiShown = 0
local epiTimer = 0

local DIM_CN = {
  procedure = '规程遵守',
  safety = '安全裕度',
  response = '响应速度',
  equipment = '设备状态',
  completeness = '记录完整性',
}

local END_TYPE_CN = {
  MELTDOWN = '堆芯熔毁',
  EXPLOSION = '爆炸',
  SAFE_SHUTDOWN = '安全停堆',
  VOLUNTARY = '主动退班',
  TIMEOUT = '超时',
  OBJECTIVE_COMPLETE = '目标达成',
  BANKRUPT = '破产接管',
}

local FREE_QUOTE = {
  VOLUNTARY = '你做了正确的事。没有人感谢你。',
  MELTDOWN = '四号机组不再存在。',
  SAFE_SHUTDOWN = '你做了正确的事。没有人感谢你。',
}

local DIM_KEYS = { 'procedure', 'safety', 'response', 'equipment', 'completeness' }

local FRAME_X, FRAME_Y = 200, 70
local FRAME_W, FRAME_H = 1200, 760
local COL_SPLIT = FRAME_X + 620

local function pad2(n)
  n = math.floor(n)
  if n < 10 then return '0' .. n end
  return tostring(n)
end

local function fmtDur(ms)
  local s = math.floor((ms or 0) / 1000)
  return pad2(s / 3600 % 24) .. ':' .. pad2(s / 60 % 60) .. ':' .. pad2(s % 60)
end

local function fmtMoney(v)
  local s = tostring(math.floor(v + 0.5))
  local out = s:reverse():gsub('(%d%d%d)', '%1,'):reverse()
  return (out:gsub('^,', ''))
end

local function row(y, label, value, vColor)
  W.label(FRAME_X + 36, y, label, 12, Theme.txtDim)
  local f = Theme.getFont(14)
  local vw = f:getWidth(tostring(value))
  W.label(COL_SPLIT - 36 - vw, y - 2, tostring(value), 14, vColor or Theme.txt)
end

local function sep(y, text)
  W.labelCenter(FRAME_X + 310, y, text or '─────', 10, Theme.txtFaint)
end

function Debrief.show(d)
  data = d
  open = true
  epiLines = {}
  epiShown = 0
  epiTimer = 0
  if d.mode == 'story' and d.epilogue then
    for line in (d.epilogue .. '\n'):gmatch('([^\n]*)\n') do
      epiLines[#epiLines + 1] = line
    end
  end
end

function Debrief.hide() open = false; data = nil end
function Debrief.isOpen() return open end

function Debrief.confirm()
  if not open then return end
  local cb = data and data.onReturn or nil
  Debrief.hide()
  if cb then cb() end
end

local function drawLeft(d)
  local y = FRAME_Y + 86
  row(y, '运行时长', fmtDur(d.duration)); y = y + 34
  local danger = d.endType == 'MELTDOWN'
  row(y, '终局类型', END_TYPE_CN[d.endType] or d.endType,
    danger and Theme.red or Theme.green); y = y + 40

  if d.mode == 'endless' and d.endlessStats then
    local st = d.endlessStats
    row(y, '运营时间', st.months .. ' 个月 / ' .. st.days .. ' 天'); y = y + 30
    row(y, '累计发电量', string.format('%.2f GWh', st.gwh)); y = y + 30
    row(y, '平均功率', string.format('%.1f %%', st.avgPower)); y = y + 30
    row(y, '换料次数', tostring(st.refuels)); y = y + 30
    row(y, '大修次数', tostring(st.overhauls)); y = y + 30
    row(y, '班组平均能力', string.format('%d %%', math.floor(st.crewComp * 100 + 0.5))); y = y + 30
    row(y, 'АЗ-5 停堆', tostring(st.scrams)); y = y + 30
    row(y, '警报', tostring(st.alarms)); y = y + 30
    row(y, '燃耗', string.format('%.1f / 40', st.burnup)); y = y + 30
    if st.best and st.best > st.score then
      row(y, '最佳记录', tostring(st.best) .. ' 分'); y = y + 30
    end
  elseif d.mode == 'challenge' and d.challengeStats then
    local cs = d.challengeStats
    local mm = pad2(cs.survived / 60)
    local ss = pad2(cs.survived % 60)
    row(y, '坚持时间', mm .. ':' .. ss .. ' / 15:00'); y = y + 30
    row(y, '处置事件', cs.eventsOk .. ' / ' .. cs.events); y = y + 30
    row(y, '警报次数', tostring(cs.alarms)); y = y + 30
    row(y, 'АЗ-5 停堆', tostring(cs.scrams)); y = y + 30
    if cs.best and cs.best > cs.score then
      row(y, '最佳记录', tostring(cs.best) .. ' 分'); y = y + 30
    end
  else
    local S = d.finalState or {}
    row(y, '最终功率', tostring(math.floor((S.n or 0) * 3200 + 0.5)) .. ' MW'); y = y + 30
    row(y, 'ORM', (S.opr ~= nil and tostring(S.opr) or '--') .. ' 根'); y = y + 34
    row(y, '操作次数', tostring(d.opCount or 0)); y = y + 34
    sep(y, '─── 评分 ───'); y = y + 30
    local dims = (d.report and d.report.dimensions) or {}
    local ratings = (d.report and d.report.ratings) or {}
    for i = 1, #DIM_KEYS do
      local k = DIM_KEYS[i]
      if dims[k] ~= nil then
        local r = ratings[k]
        W.label(FRAME_X + 36, y, DIM_CN[k], 12, Theme.txtDim)
        if r then
          W.label(FRAME_X + 220, y - 2, r.rating, 12, Theme.txt)
          W.label(FRAME_X + 420, y, r.cn, 10, Theme.txtFaint)
          W.label(COL_SPLIT - 90, y, string.format('%d%%', math.floor(dims[k] * 100 + 0.5)), 12,
            dims[k] >= 0.8 and Theme.green or (dims[k] >= 0.6 and Theme.amber or Theme.red))
        end
        y = y + 28
      end
    end
  end

  if d.decisions and #d.decisions > 0 then
    y = y + 12
    sep(y, '─── 关键决策 ───'); y = y + 26
    for i = 1, #d.decisions do
      local dc = d.decisions[i]
      W.label(FRAME_X + 36, y, dc.id, 11, Theme.txtDim)
      W.label(FRAME_X + 260, y, '→ ' .. tostring(dc.choice), 11, Theme.cyan)
      y = y + 22
    end
  end
end

local function drawRight(d)
  local rx = COL_SPLIT + 36
  local rw = FRAME_X + FRAME_W - rx - 36
  if d.mode == 'story' then
    -- 尾声逐行淡入
    local y = FRAME_Y + 100
    for i = 1, math.min(epiShown, #epiLines) do
      local line = epiLines[i]
      if line == '' then
        y = y + 18
      else
        W.label(rx, y, line, 12, Theme.txt)
        y = y + 26
      end
    end
  elseif d.mode == 'endless' and d.endlessStats then
    local st = d.endlessStats
    local bd = st.breakdown or {}
    local y = FRAME_Y + 86
    sep(y, '─── 无尽运营结算 ───'); y = y + 34
    local function rrow(yy, label, value)
      W.label(rx, yy, label, 11, Theme.txtDim)
      local f = Theme.getFont(12)
      local vw = f:getWidth(tostring(value))
      W.label(FRAME_X + FRAME_W - 36 - vw, yy, tostring(value), 12, Theme.txt)
    end
    rrow(y, '运营时间', st.months .. ' 个月 / ' .. st.days .. ' 天'); y = y + 28
    rrow(y, '获利总额 ' .. fmtMoney(st.profitTotal) .. ' ₽', '+' .. (bd.profit or 0)); y = y + 24
    rrow(y, '发电 ' .. string.format('%.1f GWh', st.gwh), '+' .. (bd.generation or 0)); y = y + 24
    rrow(y, '运行 ' .. st.days .. ' 天', '+' .. (bd.survival or 0)); y = y + 24
    rrow(y, '安全 (停堆/警报扣分)', '+' .. (bd.safety or 0)); y = y + 24
    rrow(y, '效率 ' .. string.format('%.1f %%', st.avgPower), '+' .. (bd.efficiency or 0)); y = y + 40
    local color = st.letter == 'S' and Theme.amber or st.letter == 'A' and Theme.green
      or st.letter == 'B' and Theme.cyan or Theme.txtFaint
    W.labelCenter(rx + rw / 2, y, tostring(st.score) .. ' 分', 26, Theme.txt)
    W.labelCenter(rx + rw / 2, y + 40, '评级 ' .. st.letter, 20, color)
  elseif d.mode == 'challenge' and d.challengeStats then
    local cs = d.challengeStats
    local y = FRAME_Y + 86
    sep(y, '─── 挑战结算 ───'); y = y + 34
    local function rrow(yy, label, value)
      W.label(rx, yy, label, 11, Theme.txtDim)
      local f = Theme.getFont(12)
      local vw = f:getWidth(tostring(value))
      W.label(FRAME_X + FRAME_W - 36 - vw, yy, tostring(value), 12, Theme.txt)
    end
    rrow(y, '处置事件', cs.eventsOk .. ' / ' .. cs.events .. ' 起'); y = y + 24
    rrow(y, 'АЗ-5 停堆', tostring(cs.scrams) .. ' 次'); y = y + 24
    rrow(y, '警报', tostring(cs.alarms) .. ' 次'); y = y + 24
    if cs.best and cs.best > cs.score then
      rrow(y, '最佳记录', tostring(cs.best) .. ' 分'); y = y + 24
    end
    y = y + 40
    local letter = cs.score >= 3000 and 'S' or cs.score >= 2000 and 'A' or cs.score >= 1200 and 'B' or 'C'
    local color = letter == 'S' and Theme.amber or letter == 'A' and Theme.green
      or letter == 'B' and Theme.cyan or Theme.txtFaint
    W.labelCenter(rx + rw / 2, y, tostring(cs.score) .. ' 分', 26, Theme.txt)
    W.labelCenter(rx + rw / 2, y + 40, '评级 ' .. letter, 20, color)
  else
    local quote = FREE_QUOTE[d.endType] or FREE_QUOTE.VOLUNTARY
    W.labelCenter(rx + rw / 2, FRAME_Y + 200, '“', 30, Theme.txtFaint)
    W.textBlock(rx, FRAME_Y + 250, rw, quote)
  end
end

function Debrief.draw()
  if not open or not data then return end
  local d = data

  love.graphics.setColor(0, 0, 0, 0.86)
  love.graphics.rectangle('fill', -50, -50, 1700, 1000)

  love.graphics.setColor(Theme.panel2)
  love.graphics.rectangle('fill', FRAME_X, FRAME_Y, FRAME_W, FRAME_H, 8)
  love.graphics.setColor(Theme.edge)
  love.graphics.setLineWidth(2)
  love.graphics.rectangle('line', FRAME_X, FRAME_Y, FRAME_W, FRAME_H, 8)

  -- 头部
  W.label(FRAME_X + 32, FRAME_Y + 24, 'СМЕНА ЗАВЕРШЕНА / 值班结束', 16, Theme.amber)
  local danger = d.endType == 'MELTDOWN'
  local et = END_TYPE_CN[d.endType] or d.endType
  local f = Theme.getFont(16)
  local etw = f:getWidth(et)
  W.label(FRAME_X + FRAME_W - 32 - etw, FRAME_Y + 24, et, 16,
    danger and Theme.red or Theme.green)

  drawLeft(d)
  drawRight(d)

  -- 尾声逐行推进
  if d.mode == 'story' and #epiLines > 0 then
    epiTimer = epiTimer + love.timer.getDelta() * 8 -- draw 内推进（简化：每 0.125s 一行）
    if epiTimer >= 1 then
      epiTimer = epiTimer - 1
      if epiShown < #epiLines then epiShown = epiShown + 1 end
    end
  end

  -- 页脚
  W.label(FRAME_X + 32, FRAME_Y + FRAME_H - 34, '⏎ / Esc 返回主菜单', 11, Theme.txtDim)
  if d.mode == 'story' and d.matchScore then
    local mt = '历史匹配度: ' .. tostring(d.matchScore) .. '%'
    local mf = Theme.getFont(11)
    W.label(FRAME_X + FRAME_W - 32 - mf:getWidth(mt), FRAME_Y + FRAME_H - 34, mt, 11, Theme.cyan)
  end
end

function Debrief.mousepressed()
  -- 点击任意处 = 确认（结算画面是终点）
  if open then Debrief.confirm() end
end

return Debrief
