-- scoring.lua — 结算评分 · web/lib/scoring.js + app.js scoreInner + debrief MatchScorer 移植
--
-- Scoring.ratingFromScore(score) -> RATINGS 项 { min, rating, cn, meaning }
-- Scoring.evaluate(stats, mode, endType) -> { dimensions, ratings, remarks, outcome }
-- Scoring.generateReport(dims, ratings, remarks, context) -> ASCII 值班报告
-- Scoring.matchScore(decisions, flags) -> 历史匹配度（story 模式）

local Scoring = {}

-- ==================== 评级 ====================

local RATINGS = {
  { min = 0.95, rating = 'отлично', cn = '优秀', meaning = '无可匡也' },
  { min = 0.80, rating = 'хорошо', cn = '良好', meaning = '有小瑕疵' },
  { min = 0.60, rating = 'удовлетворительно', cn = '合格', meaning = '勉强通过' },
  { min = 0.40, rating = 'неудовлетворительно', cn = '不合格', meaning = '需要谈话' },
  { min = 0,    rating = 'аварийная ситуация', cn = '事故状态', meaning = '你被开除了' },
}
Scoring.RATINGS = RATINGS

function Scoring.ratingFromScore(score)
  for i = 1, #RATINGS do
    if score >= RATINGS[i].min then return RATINGS[i] end
  end
  return RATINGS[#RATINGS]
end

-- ==================== 运行统计（app.js collectStats） ====================

function Scoring.newStats()
  return {
    overPowerTime = 0,   -- n > 110% 累计（游戏秒）
    lowOprTime = 0,      -- OPR < 15 累计（游戏秒）
    alarmCount = 0,
    azPresses = 0,
    pumpsStopped = 0,
    rodMoves = 0,
    opCount = 0,
    meltdown = false,
  }
end

-- ==================== 五维评分（app.js scoreInner 1:1） ====================

local DIM_KEYS = { 'procedure', 'safety', 'response', 'equipment', 'completeness' }

function Scoring.evaluate(stats, mode, endType)
  local dims = {}
  dims.safety = stats.meltdown and 0.05 or math.max(0,
    1 - math.min(1, stats.overPowerTime / 300) * 0.7
      - math.min(1, stats.lowOprTime / 600) * 0.3)
  dims.procedure = math.max(0, 1 - math.min(1, stats.lowOprTime / 180) * 0.6 - stats.alarmCount * 0.03)
  dims.response = stats.alarmCount == 0 and 1 or math.max(0, 1 - stats.alarmCount * 0.15)
  dims.equipment = stats.meltdown and 0 or
    math.max(0, 1 - stats.azPresses * 0.25 - stats.pumpsStopped * 0.08)
  dims.completeness = 0.7 + math.min(0.3, stats.opCount / 50)

  local ratings = {}
  for i = 1, #DIM_KEYS do
    ratings[DIM_KEYS[i]] = Scoring.ratingFromScore(dims[DIM_KEYS[i]])
  end

  local remarks = {}
  if stats.meltdown then remarks[#remarks + 1] = '堆芯熔毁 — 四号机组不再存在' end
  if dims.safety < 0.6 then
    remarks[#remarks + 1] = '安全裕度不足: 超限运行 ' .. math.floor(stats.overPowerTime + 0.5) .. 's'
  end
  if dims.procedure < 0.6 then
    remarks[#remarks + 1] = '规程违反: ORM 低于阈值运行 ' .. math.floor(stats.lowOprTime + 0.5) .. 's'
  end
  if stats.azPresses > 0 then
    remarks[#remarks + 1] = 'АЗ-5 触发 ' .. stats.azPresses .. ' 次'
  end
  if #remarks == 0 then remarks[#remarks + 1] = 'Замечаний нет. · 无可比备注' end

  local outcome
  if stats.meltdown then outcome = 'accident'
  elseif endType == 'SAFE_SHUTDOWN' or endType == 'VOLUNTARY' then outcome = 'completed'
  else outcome = 'normal' end

  return {
    dimensions = dims,
    ratings = ratings,
    remarks = remarks,
    outcome = outcome,
  }
end

-- ==================== 值班报告（ASCII 框） ====================

-- JS 按 UTF-16 code unit 计宽，这里按 UTF-8 code point 计宽以对齐版式
local function cpLen(s)
  local n = 0
  local i = 1
  while i <= #s do
    local b = s:byte(i)
    if b < 0x80 then i = i + 1
    elseif b < 0xE0 then i = i + 2
    elseif b < 0xF0 then i = i + 3
    else i = i + 4 end
    n = n + 1
  end
  return n
end

local function pad(s, len)
  s = tostring(s)
  local n = cpLen(s)
  while n < len do s = s .. ' '; n = n + 1 end
  return s
end

local function rep(c, n)
  local out = {}
  for _ = 1, n do out[#out + 1] = c end
  return table.concat(out)
end

function Scoring.generateReport(dims, ratings, remarks, context)
  context = context or {}
  local lines = {}
  local function line(t) lines[#lines + 1] = t end

  line('╔' .. rep('═', 53) .. '╗')
  line('║  ЧЕРНОБЫЛЬСКАЯ ЭС им. В.И. Ленина' .. rep(' ', 6) .. '║')
  line('║  Блок №4' .. rep(' ', 39) .. '║')
  line('║' .. rep(' ', 53) .. '║')
  line('║  СМЕННЫЙ РАПОРТ' .. rep(' ', 22) .. '║')
  line('║  Дата: ' .. (context.date or '26.04.1986') .. '    Смена: ' .. (context.shift or '3') .. rep(' ', 17) .. '║')
  line('║  Оператор: ' .. (context.operator or 'Оператор БЩУ') .. rep(' ', 12) .. '║')
  line('║' .. rep(' ', 53) .. '║')
  line('║  ' .. rep('─', 51) .. '║')
  line('║' .. rep(' ', 53) .. '║')

  local dimNames = {
    procedure = 'Соблюдение регламента',
    safety = 'Запас безопасности',
    response = 'Время реакции',
    equipment = 'Состояние оборудования',
    completeness = 'Полнота записей',
  }
  for i = 1, #DIM_KEYS do
    local k = DIM_KEYS[i]
    if dims[k] ~= nil then
      local r = ratings[k]
      line('║  ' .. pad(dimNames[k], 34) .. pad(r and r.rating or '-', 18) .. '║')
    end
  end

  line('║' .. rep(' ', 53) .. '║')
  line('║  ' .. rep('─', 51) .. '║')
  line('║' .. rep(' ', 53) .. '║')
  line('║  ЗАМЕЧАНИЯ:' .. rep(' ', 30) .. '║')

  for j = 1, #remarks do
    local rText = '· ' .. remarks[j]
    while cpLen(rText) > 51 do
      -- 按 code point 截断到 51
      local out, n, i2 = {}, 0, 1
      while i2 <= #rText and n < 51 do
        local b = rText:byte(i2)
        local step = b < 0x80 and 1 or b < 0xE0 and 2 or b < 0xF0 and 3 or 4
        out[#out + 1] = rText:sub(i2, i2 + step - 1)
        i2 = i2 + step
        n = n + 1
      end
      local part = table.concat(out)
      local rest = rText:sub(i2)
      line('║  ' .. part .. rep(' ', math.max(0, 53 - 2 - cpLen(part))) .. '║')
      rText = '  ' .. rest
    end
    line('║  ' .. rText .. rep(' ', math.max(0, 53 - 2 - cpLen(rText))) .. '║')
  end

  line('║' .. rep(' ', 53) .. '║')
  line('║  Начальник смены: _______________' .. rep(' ', 8) .. '║')
  line('║' .. rep(' ', 53) .. '║')
  line('╚' .. rep('═', 53) .. '╝')

  return table.concat(lines, '\n')
end

-- ==================== 历史匹配度（debrief.js MatchScorer 1:1） ====================

local SCORE_TABLE = {
  xenon_pit = { ['continue'] = 20, shutdown = 10 },
  saor_disable = { obey = 15, refuse = 5 },
  az5_press = { press = 20, no_press = 0 },
  page47_found = { found = 10 },
}
local WEIGHTS = { xenon_pit = 1.5, saor_disable = 1.0, az5_press = 2.0, page47_found = 0.5 }

function Scoring.matchScore(decisions, flags)
  decisions = decisions or {}
  flags = flags or {}
  if #decisions == 0 then return nil end

  local base, weightSum = 0, 0
  local seen = {}
  local matched = 0
  for i = 1, #decisions do
    local d = decisions[i]
    local table_ = SCORE_TABLE[d.id]
    if table_ and table_[d.choice] ~= nil and not seen[d.id] then
      seen[d.id] = true
      base = base + table_[d.choice]
      weightSum = weightSum + (WEIGHTS[d.id] or 1)
      matched = matched + 1
    end
  end
  if weightSum == 0 then return nil end
  local score = base * (weightSum / matched) * (matched / math.max(1, 4))
  if score > 100 then score = 100 end

  if flags.discovered_page_47 and (flags.az5_pressed or flags.action_az_pressed) then score = score + 5 end
  if flags.all_phones_missed then score = score - 5 end
  if flags.voluntary_shutdown then score = math.min(score, 60) end

  return math.max(0, math.min(100, math.floor(score + 0.5)))
end

return Scoring
