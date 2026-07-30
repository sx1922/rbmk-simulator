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

return SFX
