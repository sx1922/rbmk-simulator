local Layout = {}

function Layout.calc(winW, winH)
  local baseW, baseH = 1600, 900
  local scale = math.min(winW / baseW, winH / baseH)
  local ox = (winW - baseW * scale) / 2
  local oy = (winH - baseH * scale) / 2
  Layout.scale = scale
  Layout.ox = ox
  Layout.oy = oy
  return scale, ox, oy
end

function Layout.toDesign(sx, sy)
  if not Layout.scale then return 0, 0 end
  return (sx - Layout.ox) / Layout.scale, (sy - Layout.oy) / Layout.scale
end

function Layout.push()
  love.graphics.push('all')
  love.graphics.scale(Layout.scale)
  love.graphics.translate(Layout.ox / Layout.scale, Layout.oy / Layout.scale)
end

function Layout.pop()
  love.graphics.pop()
end

return Layout
