local M = {}

local function sandboxEnv()
  return {
    pairs=pairs, ipairs=ipairs, next=next,
    tostring=tostring, tonumber=tonumber, type=type,
    math=math, string=string, table=table,
    print=print, unpack=unpack, select=select,
    error=error, pcall=pcall,
    _VERSION=_VERSION,
  }
end

function M.scan(G)
  local ok, items = pcall(love.filesystem.getDirectoryItems, 'mods')
  if not ok or not items then return end
  for _, f in ipairs(items) do
    if f:match('%.lua$') then
      local chunk, err = love.filesystem.load('mods/' .. f)
      if not chunk then
        G:log('system', 'Mod 加载失败: ' .. f .. ' - ' .. tostring(err))
      else
        setfenv(chunk, sandboxEnv())
        local ok2, res = pcall(chunk)
        if ok2 and type(res) == 'table' then
          M.apply(G, res, f)
        else
          G:log('system', 'Mod 无效: ' .. f .. ' - ' .. tostring(ok2))
        end
      end
    end
  end
end

function M.apply(G, m, fname)
  if m.events then
    for _, e in ipairs(m.events) do
      table.insert(G.EVENTS, e)
    end
  end
  if m.achievements then
    for _, a in ipairs(m.achievements) do
      table.insert(G.ACH, a)
    end
  end
  if m.constants then
    for k, v in pairs(m.constants) do
      G.C[k] = v
    end
  end
  G:log('good', 'Mod 已加载: ' .. (m.name or fname))
end

return M
