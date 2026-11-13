-- journal.lua — 值班日志 / 设置持久化 · web/lib/save.js 移植
-- 键名与 web 版统一：rbmk_journal / rbmk_journal_bak
-- LÖVE 下落盘到 love.filesystem（identity 见 conf.lua）；headless 测试可注入 adapter。

local Journal = {}

local CURRENT_VERSION = 1
local STORAGE_KEY = 'rbmk_journal'
local BACKUP_KEY = STORAGE_KEY .. '_bak'

local DEFAULT_CALLSIGN = 'Оператор БЩУ'

-- ==================== 存储适配器 ====================

-- adapter: { get(k)->str|nil, set(k,v), remove(k) }
local adapter = nil

function Journal.setAdapter(a) adapter = a end

local function defaultAdapter()
  if love and love.filesystem then
    return {
      get = function(k)
        if not love.filesystem.getInfo(k) then return nil end
        return love.filesystem.read(k)
      end,
      set = function(k, v) love.filesystem.write(k, v) end,
      remove = function(k)
        if love.filesystem.getInfo(k) then love.filesystem.remove(k) end
      end,
    }
  end
  return nil
end

-- ==================== 序列化（Lua 表 <-> 字符串） ====================

local function serializeVal(v, indent)
  indent = indent or ''
  local t = type(v)
  if t == 'number' then
    if v ~= v or v == math.huge or v == -math.huge then return '0' end
    return tostring(v)
  elseif t == 'boolean' then
    return tostring(v)
  elseif t == 'string' then
    return string.format('%q', v)
  elseif t == 'table' then
    local parts, n = {}, 0
    local inner = indent .. '  '
    for i, vv in ipairs(v) do
      n = n + 1
      parts[n] = serializeVal(vv, inner)
    end
    for k, vv in pairs(v) do
      if type(k) ~= 'number' or k % 1 ~= 0 or k < 1 or k > n then
        local key = type(k) == 'string' and
          (k:match('^[%a_][%w_]*$') and k or string.format('[%q]', k)) or
          string.format('[%d]', k)
        n = n + 1
        parts[n] = key .. ' = ' .. serializeVal(vv, inner)
      end
    end
    return '{\n' .. inner .. table.concat(parts, ',\n' .. inner) .. '\n' .. indent .. '}'
  end
  return 'nil'
end

local function deserialize(str)
  if not str or str == '' then return nil end
  local fn, err
  if loadstring then
    fn, err = loadstring(str)
  else
    fn, err = load(str)
  end
  if not fn then return nil, err end
  if setfenv then setfenv(fn, {}) end
  local ok, result = pcall(fn)
  if not ok then return nil, result end
  return result
end

-- ==================== 数据结构 ====================

function Journal.defaultSettings()
  return {
    masterVolume = 0.8,
    busVolumes = { ambient = 1, equipment = 1, events = 1, alarms = 1, narrative = 1 },
    language = 'zh',
    textSpeed = 3,
    screenShake = true,
    showTooltips = true,
  }
end

function Journal.emptyStatistics()
  return {
    totalShifts = 0,
    totalPlayTime = 0,
    scenariosCompleted = {},
    accidentsPrevented = 0,
    accidents = 0,
    bestScores = {},
    totalAlarmsTriggered = 0,
    totalAZ5Presses = 0,
    totalPumpsStopped = 0,
    totalRodsMoved = 0,
  }
end

function Journal.createNewJournal()
  return {
    version = CURRENT_VERSION,
    created = os.time(),
    lastModified = os.time(),
    operator = {
      callsign = DEFAULT_CALLSIGN,
      shiftCount = 0,
      firstShift = nil,
      lastShift = nil,
    },
    settings = Journal.defaultSettings(),
    entries = {},
    campaign = {
      active = false,
      currentScenario = 0,
      scenarioResults = {},
      completed = false,
      overallRating = nil,
      recommendation = nil,
    },
    statistics = Journal.emptyStatistics(),
  }
end

local function averageScore(dimensions)
  local total, count = 0, 0
  for _, v in pairs(dimensions) do total = total + v; count = count + 1 end
  if count > 0 then return total / count end
  return 0
end

-- ================= CRUD ====================

function Journal.loadJournal()
  local store = adapter or defaultAdapter()
  if not store then return Journal.createNewJournal() end
  local raw = store.get(STORAGE_KEY)
  if not raw then return Journal.createNewJournal() end
  local j = deserialize(raw)
  if not j or type(j) ~= 'table' or j.version ~= CURRENT_VERSION then
    return Journal.createNewJournal()
  end
  return j
end

function Journal.saveJournal(j)
  local store = adapter or defaultAdapter()
  if not store then return end
  j.lastModified = os.time()
  store.set(STORAGE_KEY, 'return ' .. serializeVal(j))
end

function Journal.saveJournalWithBackup(j)
  local store = adapter or defaultAdapter()
  if not store then return end
  local current = store.get(STORAGE_KEY)
  if current then store.set(BACKUP_KEY, current) end
  Journal.saveJournal(j)
end

function Journal.recoverFromBackup()
  local store = adapter or defaultAdapter()
  if not store then return nil end
  local bak = store.get(BACKUP_KEY)
  if bak then
    local j = deserialize(bak)
    if j and j.version == CURRENT_VERSION and type(j.entries) == 'table' then
      store.set(STORAGE_KEY, bak)
      return j
    end
  end
  return nil
end

function Journal.clearAll()
  local store = adapter or defaultAdapter()
  if not store then return end
  store.remove(STORAGE_KEY)
  store.remove(BACKUP_KEY)
end

function Journal.recordShiftEnd(j, scenarioId, score, duration)
  local entry = {
    id = tostring(os.time()) .. '-' .. tostring(math.random(1000, 9999)),
    timestamp = os.time(),
    type = 'shift_report',
    scenarioId = scenarioId,
    data = score,
    duration = duration or 0,
    outcome = score and score.outcome or 'normal',
  }
  table.insert(j.entries, entry)
  j.operator.shiftCount = j.operator.shiftCount + 1
  j.operator.lastShift = os.time()
  if not j.operator.firstShift then j.operator.firstShift = os.time() end

  local stats = j.statistics
  stats.totalShifts = stats.totalShifts + 1
  stats.totalPlayTime = stats.totalPlayTime + (entry.duration or 0)
  stats.scenariosCompleted[scenarioId] = (stats.scenariosCompleted[scenarioId] or 0) + 1
  if entry.outcome == 'accident' then
    stats.accidents = stats.accidents + 1
  elseif entry.data and entry.data.dimensions then
    local best = stats.bestScores[scenarioId]
    local avg = averageScore(entry.data.dimensions)
    if not best or avg > averageScore(best) then
      stats.bestScores[scenarioId] = {}
      for k, v in pairs(entry.data.dimensions) do stats.bestScores[scenarioId][k] = v end
    end
  end
  Journal.saveJournal(j)
  return entry
end

function Journal.recordSettingsChange(j, newSettings)
  j.settings = newSettings
  Journal.saveJournal(j)
end

function Journal.getSetting(journal, key)
  local s = journal and journal.settings or nil
  if not s then return nil end
  local parts = {}
  for part in key:gmatch('[^.]+') do parts[#parts + 1] = part end
  local o = s
  for i = 1, #parts do
    if type(o) ~= 'table' then return nil end
    o = o[parts[i]]
  end
  return o
end

function Journal.setSetting(journal, key, val)
  if not journal.settings then journal.settings = Journal.defaultSettings() end
  local parts = {}
  for part in key:gmatch('[^.]+') do parts[#parts + 1] = part end
  local o = journal.settings
  for i = 1, #parts - 1 do
    if type(o[parts[i]]) ~= 'table' then o[parts[i]] = {} end
    o = o[parts[i]]
  end
  o[parts[#parts]] = val
end

return Journal
