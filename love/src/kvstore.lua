-- kvstore.lua — 通用键值持久化（无尽存档 / 成就 / 最高分）
-- 与 web 的 localStorage 键名对应：rbmk_endless_save / rbmk_endless_achievements / rbmk_endless_best
-- 底层 love.filesystem；headless 测试可注入 adapter。

local Journal = require('src.journal')

local KvStore = {}

local adapter = nil

function KvStore.setAdapter(a) adapter = a end

local function store()
  if adapter then return adapter end
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

function KvStore.get(key)
  local s = store()
  if not s then return nil end
  local raw = s.get(key)
  if not raw then return nil end
  return Journal.deserializeValue(raw)
end

function KvStore.set(key, value)
  local s = store()
  if not s then return false end
  local ok, err = pcall(s.set, key, 'return ' .. Journal.serializeValue(value))
  return ok
end

function KvStore.remove(key)
  local s = store()
  if s then s.remove(key) end
end

return KvStore
