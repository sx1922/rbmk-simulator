-- main.lua — ЩИТ LÖVE 端入口 · 四态状态机 + 实时仿真循环
-- FLOW-01 §2: MENU → PLAYING → ENDING → DEBRIEF → MENU

local Layout = require('src.ui.layout')
local App = require('src.app')

local headlessTest = false

function love.load()
  -- headless 测试钩子: love . test
  if arg and arg[2] == 'test' then
    headlessTest = true
    local ok, run = pcall(require, 'tests.run2')
    if ok and run then
      local passed = run()
      love.event.quit(passed and 0 or 1)
      return
    end
  end
  Layout.calc(love.graphics.getWidth(), love.graphics.getHeight())
  App.boot()
end

function love.update(dt)
  if dt <= 0 then return end
  if dt > 0.5 then dt = 0.5 end
  App.lastDt = dt
  App.update(dt)
end

function love.draw()
  if headlessTest then return end
  Layout.push()
  App.draw()
  Layout.pop()
end

local function toDesign(x, y)
  return Layout.toDesign(x, y)
end

function love.mousepressed(x, y, button, isTouch, presses)
  local dx, dy = toDesign(x, y)
  App.mousepressed(dx, dy, button)
end

function love.mousereleased(x, y, button, isTouch, presses)
  local dx, dy = toDesign(x, y)
  App.mousereleased(dx, dy, button)
end

function love.mousemoved(x, y, dx, dy, isTouch)
  local mdx, mdy = toDesign(x, y)
  App.mousemoved(mdx, mdy)
end

function love.wheelmoved(dx, dy)
  App.wheelmoved(dx, dy)
end

function love.keypressed(key, scancode, isRepeat)
  App.keypressed(key, scancode, isRepeat)
end

function love.keyreleased(key, scancode)
  App.keyreleased(key, scancode)
end

function love.textinput(t)
  App.textinput(t)
end

function love.resize(w, h)
  Layout.calc(w, h)
  App.resize()
end
