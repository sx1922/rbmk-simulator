-- conf.lua — LÖVE 引导配置
function love.conf(t)
  t.identity = 'rbmk-simulator'
  t.version = '11.5'
  t.window.title = 'ЩИТ · РБМК-1000 主控培训模拟器'
  t.window.width = 1280
  t.window.height = 800
  t.window.minwidth = 960
  t.window.minheight = 600
  t.window.resizable = true
  t.window.vsync = 1
  t.console = false
end
