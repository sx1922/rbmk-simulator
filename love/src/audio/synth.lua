local SFX = {}

local _boomRng = {s = 1}
local function boomRandom()
  _boomRng.s = (_boomRng.s * 1664525 + 1013904223) % 4294967296
  return _boomRng.s / 4294967296
end

local function genTone(freq, dur, shape, vol)
  local sr = 22050
  local n = math.floor(sr * dur)
  local sd = love.sound.newSoundData(n, sr, 16, 1)
  for i = 0, n - 1 do
    local t = i / sr
    local ph = (t * freq) % 1
    local v
    if shape == 'square' then
      v = ph < 0.5 and 1 or -1
    elseif shape == 'saw' then
      v = 2 * ph - 1
    else
      v = math.sin(2 * math.pi * freq * t)
    end
    local env = 1 - i / n
    sd:setSample(i, v * env * (vol or 0.2))
  end
  return love.audio.newSource(sd)
end

local function genBoom()
  local sr = 44100
  local n = math.floor(sr * 1.2)
  local sd = love.sound.newSoundData(n, sr, 16, 1)
  for i = 0, n - 1 do
    local t = i / sr
    local noise = (boomRandom() * 2 - 1) * math.pow(1 - i / n, 2)
    local low = math.sin(2 * math.pi * 55 * t) * math.pow(1 - i / n, 3)
    sd:setSample(i, (noise * 0.35 + low * 0.25))
  end
  return love.audio.newSource(sd)
end

local function concatTones(tones, vol)
  local sr = 22050
  local totalN = 0
  for _, t in ipairs(tones) do
    totalN = totalN + math.floor(sr * t[2])
  end
  local sd = love.sound.newSoundData(totalN, sr, 16, 1)
  local pos = 0
  for _, t in ipairs(tones) do
    local freq, dur, shape = t[1], t[2], t[3] or 'square'
    local n = math.floor(sr * dur)
    for i = 0, n - 1 do
      local ph = ((pos + i) / sr * freq) % 1
      local v
      if shape == 'square' then v = ph < 0.5 and 1 or -1
      elseif shape == 'saw' then v = 2 * ph - 1
      else v = math.sin(2 * math.pi * freq * (pos + i) / sr) end
      local env = 1 - i / n
      if pos + i < totalN then
        sd:setSample(pos + i, v * env * (vol or 0.2))
      end
    end
    pos = pos + n
  end
  return love.audio.newSource(sd)
end

function SFX.init()
  SFX.click = genTone(800, 0.04, 'square', 0.03)
  SFX.good = concatTones({{660, 0.08, 'sine'}, {880, 0.1, 'sine'}}, 0.04)
  SFX.warn = genTone(440, 0.12, 'saw', 0.04)
  SFX.alarm = genTone(520, 0.18, 'square', 0.06)
  SFX.az5 = concatTones({{200, 0.5, 'saw'}, {150, 0.6, 'saw'}}, 0.08)
  SFX.achieve = concatTones({{523, 0.1, 'sine'}, {659, 0.1, 'sine'}, {784, 0.15, 'sine'}}, 0.05)
  SFX.boom = genBoom()
end


-- ==================== v0.2 扩展：完整音效 API  ====================

local masterVolume = 0.8
local muted = false
local humSource = nil
local rumbleSource = nil
local geiger = { running = false, doseRate = 0.1, timer = 0 }
local toneCache = {}

local function sfxPlay(src, volMul)
  if not src or not love.audio then return end
  local v = muted and 0 or masterVolume * (volMul or 1)
  if v <= 0 then return end
  src:setVolume(math.min(1, v))
  src:stop()
  src:play()
end

function SFX.setMasterVolume(v)
  masterVolume = v or 0.8
  if humSource then humSource:setVolume(muted and 0 or masterVolume * 0.35) end
end

function SFX.setMuted(m)
  muted = m and true or false
  if humSource then humSource:setVolume(muted and 0 or masterVolume * 0.35) end
end

function SFX.getMasterVolume() return masterVolume end
function SFX.isMuted() return muted end

-- 短音（参数缓存）
function SFX.beep(freq, dur, shapeOrVol, vol)
  local shape = 'sine'
  local v = vol
  if type(shapeOrVol) == 'number' then v = shapeOrVol else shape = shapeOrVol or 'sine' end
  v = v or 0.05
  local key = string.format('%d_%.2f_%s_%.3f', freq, dur, shape, v)
  if not toneCache[key] then
    toneCache[key] = genTone(freq, dur, shape, v)
  end
  sfxPlay(toneCache[key])
end

-- 告警音（场景 sound 动作）
function SFX.alarmTone(freq, dur, vol)
  SFX.beep(freq, dur or 0.5, 'square', vol or 0.08)
end

-- 控制室底噪（循环）
local function genHum()
  local sr = 22050
  local n = sr * 2
  local sd = love.sound.newSoundData(n, sr, 16, 1)
  local lp = 0
  for i = 0, n - 1 do
    local t = i / sr
    local white = boomRandom() * 2 - 1
    lp = lp * 0.96 + white * 0.04  -- 低通棕噪
    local v = lp * 0.5 + math.sin(2 * math.pi * 50 * t) * 0.15
      + math.sin(2 * math.pi * 100 * t) * 0.08
    sd:setSample(i, v * 0.6)
  end
  return love.audio.newSource(sd)
end

function SFX.startHum()
  if humSource then humSource:stop() end
  humSource = genHum()
  humSource:setLooping(true)
  humSource:setVolume(muted and 0 or masterVolume * 0.35)
  humSource:play()
end

function SFX.stopHum()
  if humSource then humSource:stop() end
end

function SFX.setHumVolume(v)
  if humSource then
    humSource:setVolume(muted and 0 or masterVolume * (v or 0.35) * 40)
  end
end

-- 熔毁轰鸣（循环）
function SFX.rumble()
  if rumbleSource then rumbleSource:stop() end
  local sr = 22050
  local n = sr * 3
  local sd = love.sound.newSoundData(n, sr, 16, 1)
  local lp = 0
  for i = 0, n - 1 do
    local t = i / sr
    local white = boomRandom() * 2 - 1
    lp = lp * 0.985 + white * 0.015
    sd:setSample(i, (lp * 1.6 + math.sin(2 * math.pi * 40 * t) * 0.2))
  end
  rumbleSource = love.audio.newSource(sd)
  rumbleSource:setLooping(true)
  rumbleSource:setVolume(muted and 0 or masterVolume)
  rumbleSource:play()
end

-- 结算金币音
function SFX.coin()
  SFX.beep(880, 0.08, 'sine', 0.06)
  SFX.beep(1320, 0.12, 'sine', 0.05)
end

-- 纸张（日历/手册）
function SFX.paper()
  SFX.beep(220, 0.06, 'saw', 0.03)
end

-- 日志展开
function SFX.zoom()
  SFX.beep(160, 0.1, 'saw', 0.04)
end

-- 喝茶/倒茶
function SFX.sip() SFX.beep(300, 0.08, 'sine', 0.04) end
function SFX.pour() SFX.beep(180, 0.3, 'sine', 0.05) end

-- 电话拨号/接通
function SFX.playKeyTurn() SFX.beep(425, 0.2, 'sine', 0.05) end
function SFX.voice(freq, dur, vol) SFX.beep(freq or 700, dur or 0.3, 'sine', vol or 0.06) end

-- 盖格计数器（剂量率驱动；带通白噪声双击）
function SFX.geigerClick(strong)
  local key = strong and 'g_strong' or 'g_norm'
  if not toneCache[key] then
    local sr = 22050
    local n = math.floor(sr * 0.02)
    local sd = love.sound.newSoundData(n, sr, 16, 1)
    for i = 0, n - 1 do
      local env = 1 - i / n
      sd:setSample(i, (boomRandom() * 2 - 1) * env * (strong and 0.2 or 0.13))
    end
    toneCache[key] = love.audio.newSource(sd)
  end
  sfxPlay(toneCache[key])
end

function SFX.setDoseRate(v) geiger.doseRate = v or 0.1 end

-- 每帧调度：剂量率 → 咔哒频率（<0.2: 3-5s 一次 … 100+: 连续）
function SFX.update(dt)
  if muted or masterVolume <= 0 then return end
  if not geiger.running then return end
  local d = geiger.doseRate
  local rate -- 每秒咔哒次数
  if d < 0.2 then rate = 0.25
  elseif d < 1 then rate = 0.8
  elseif d < 10 then rate = 4
  elseif d < 100 then rate = 12
  else rate = 25 end
  geiger.timer = geiger.timer + dt * rate
  while geiger.timer >= 1 do
    geiger.timer = geiger.timer - 1
    SFX.geigerClick(d >= 10)
  end
end

function SFX.setGeigerRunning(r) geiger.running = r and true or false end


-- 统一播放入口：成员可能是函数（alarmTone 等）或预生成 Source（click/boom 等）
function SFX.play(name, volMul)
  local src = SFX[name]
  if type(src) == 'function' then return src(SFX) end
  if src and src.play then
    local v = muted and 0 or masterVolume * (volMul or 1)
    if v <= 0 then return end
    src:setVolume(math.min(1, v))
    src:stop()
    src:play()
  end
end


-- ==================== 警铃循环（web 5.4：FAST_BLINK 连续响 / 周期<5s 紧急 / КВИТ 停） ====================

local bellSource, bellUrgent = nil, nil

local function genBell(freq)
  local sr = 22050
  local n = sr
  local sd = love.sound.newSoundData(n, sr, 16, 1)
  for i = 0, n - 1 do
    local t = i / sr
    local gate = (math.floor(t * 4) % 2 == 0) and 1 or 0
    local ph = (t * freq) % 1
    sd:setSample(i, (ph < 0.5 and 1 or -1) * gate * 0.12)
  end
  return love.audio.newSource(sd)
end

-- mode: 'off' | 'normal' | 'urgent'
function SFX.setAlarmBell(mode)
  if not love.audio then return end
  if not bellSource then
    bellSource = genBell(800); bellSource:setLooping(true)
    bellUrgent = genBell(1200); bellUrgent:setLooping(true)
  end
  bellSource:stop()
  bellUrgent:stop()
  local v = muted and 0 or masterVolume
  if mode == 'normal' and v > 0 then
    bellSource:setVolume(v * 0.5); bellSource:play()
  elseif mode == 'urgent' and v > 0 then
    bellUrgent:setVolume(v * 0.6); bellUrgent:play()
  end
end

return SFX
