-- main.lua — ЩИТ LÖVE 端入口 · 四态状态机 + 实时仿真循环
-- MENU → PLAYING → ENDING → DEBRIEF → MENU

local Layout = require('src.ui.layout')
local App = require('src.app')

local headlessTest = false
local smokeFrames = nil
local smokeStep = 0

function love.load()
  -- headless 测试钩子: love <dir> test
  if arg and arg[2] == 'test' then
    headlessTest = true
    local ok, run = pcall(require, 'tests.run2')
    if ok and run then
      local passed = run()
      love.event.quit(passed and 0 or 1)
      return
    end
  end
  -- 渲染冒烟自检: love <dir> smoke（自动遍历主要绘制路径，崩溃即退出非 0）
  if arg and arg[2] == 'smoke' then
    smokeFrames = 0
  end
  Layout.calc(love.graphics.getWidth(), love.graphics.getHeight())
  App.boot()
end

function love.update(dt)
  if dt <= 0 then return end
  if dt > 0.5 then dt = 0.5 end
  App.lastDt = dt
  App.update(dt)
  -- 冒烟自检（状态驱动）：menu → 值班(点火结束截图) → 终局 → 结算 → 回菜单 → 无尽(截图)
  if smokeFrames then
    smokeFrames = smokeFrames + 1
    local f = smokeFrames
    local S1 = smokeStep or 0
    local advance = nil
    if S1 == 0 and f == 2 then
      local WEB = require('src.ui.webtheme')
      print('FONTS: ' .. WEB._debug())
      smokeStep = 1
    elseif S1 == 1 and f == 8 then
      love.graphics.captureScreenshot('smoke_menu.png', true)
      smokeStep = 2
    elseif S1 == 2 and f >= 10 then
      App.startGame('free')
      smokeStep = 3
    elseif S1 == 3 and App.state == 'PLAYING' and not App.ignitionFx then
      love.graphics.captureScreenshot('smoke_free.png', true)
      smokeStep = 4
    elseif S1 == 4 then
      App.endGame('VOLUNTARY', {})
      smokeStep = 5
    elseif S1 == 5 and App.state == 'DEBRIEF' then
      smokeStep = 6
    elseif S1 == 6 and App.state == 'DEBRIEF' then
      require('src.debrief').confirm()
      smokeStep = 7
    elseif S1 == 7 and App.state == 'MENU' then
      App.startGame('endless')
      smokeStep = 8
    elseif S1 == 8 and App.state == 'PLAYING' and not App.ignitionFx then
      love.graphics.captureScreenshot('smoke_endless.png', true)
      smokeStep = 9
    elseif S1 == 9 then
      print('SMOKE OK')
      love.event.quit(0)
    end
    if f > 900 then
      print('SMOKE TIMEOUT step=' .. tostring(smokeStep) .. ' state=' .. App.state)
      love.event.quit(1)
    end
  end
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
  if smokeFrames then return end
  local dx, dy = toDesign(x, y)
  App.mousepressed(dx, dy, button)
end

function love.mousereleased(x, y, button, isTouch, presses)
  if smokeFrames then return end
  local dx, dy = toDesign(x, y)
  App.mousereleased(dx, dy, button)
end

function love.mousemoved(x, y, dx, dy, isTouch)
  if smokeFrames then return end
  local mdx, mdy = toDesign(x, y)
  App.mousemoved(mdx, mdy)
end

function love.wheelmoved(dx, dy)
  if smokeFrames then return end
  App.wheelmoved(dx, dy)
end

function love.keypressed(key, scancode, isRepeat)
  if smokeFrames then return end
  App.keypressed(key, scancode, isRepeat)
end

function love.keyreleased(key, scancode)
  if smokeFrames then return end
  App.keyreleased(key, scancode)
end

function love.textinput(t)
  App.textinput(t)
end

function love.resize(w, h)
  Layout.calc(w, h)
  App.resize()
end
