-- main.lua — LÖVE 移植入口 (Phase 2)
-- 当前为占位文件
function love.load()
end

function love.update(dt)
end

function love.draw()
  love.graphics.setColor(1, 1, 1)
  love.graphics.print('RBMK-1000 — LÖVE port (Phase 2)', 20, 20)
  love.graphics.print('Web version available at src/index.html', 20, 40)
end

function love.keypressed(key)
  if key == 'escape' then love.event.quit() end
end
