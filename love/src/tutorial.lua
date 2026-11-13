-- tutorial.lua — 第一幕教学引导 · web/js/tutorial.js 的 LÖVE 适配
-- 步骤：道具教学（⏎ 推进）+ 仪表讲解（⏎ 推进）+ 操作任务（状态条件自动推进）
-- 启动：App.startGame (story 模式) 点火动画结束后 Tutorial.start(ctx)

local Theme = require('src.ui.theme')
local W = require('src.ui.widgets')

local Tutorial = {}

local idx = -1
local ctx = nil
local advancing = false

local STEPS = {
  { msg = '从运行规程手册开始。\n它收录了机组参数、操作规程和保护定值。\n值班时遇到拿不准的地方，翻它。\n· Начните с регламента — в нём все нормы и режимы.\n\n① 以后点击桌面道具打开 → ② 阅读 → ③ 按 ✕ 放回或 Esc 关闭。' },
  { msg = '这是值班日志。每班开始和结束都要记录机组状态、功率和交接事项。\n换班时上级会来抽查，填写不完整会被记过。\n· Журнал вахты — плановые записи обязательны.' },
  { msg = '计算器（МК-61）用来快速核算功率裕度、控制棒余量等参数。\n需要精确计算时拿出来用，避免心算出错。\n· МК-61 — для точных расчётов запаса реактивности.' },
  { msg = '剂量计（ДП-5В）测量控制室与堆芯附近的辐射水平。\n读数升高说明屏障出现问题。听它的咔哒声——越密越危险。\n· ДП-5В: стук счётчика чаще — радиация выше.' },
  { msg = '高频电话（ВЧ）直通调度台。\n拿起听筒，拨个号，按「拨号」呼叫调度。\n号码可以在桌上的「电话号码簿」里查阅。\n剧情中上级的指示会经由它传来，务必应答。\n· ВЧ — связь с диспетчером. Отвечайте всегда.' },
  { msg = '这是热功率表。\n左侧是功率表盘（% Nном），右侧数字是实际功率（MW）。\n红色区域 = 110% 以上，超过会触发 П1 保护。\n· Это прибор тепловой мощности.' },
  { msg = '这是周期表。\n周期 = 功率变化的速度。指针在中央 = 功率稳定。\n偏右 = 功率在升，偏左 = 功率在降。\n当指针进入红色区域（T < 10s）时，必须立即停堆。\n· Период — скорость изменения мощности.' },
  { msg = '这是操作反应性裕度（ОЗР / OPR）。\n它表示还有多少控制棒可以插入。\n安全规程要求 OPR ≥ 26 根。低于 15 红色警告，低于 8 必须停堆。\n· ОЗР — запас реактивности.' },
  { msg = '这是氙浓度。\n氙-135 是最强的中子吸收体。功率降低时氙会累积，反应性下降。\n这就是「碘坑」——降功率后不能立即再升。\n· Ксенон-135 — сильнейший поглотитель.' },
  { msg = '仪表盘上还有其他重要信息：\n• ОЗР = 操作裕度（剩余插入能力）\n• Xe-135 = 氙浓度（中毒程度）\n• α = 空泡份额（RBMK 正反馈的核心）\n这三个数值决定了反应堆的安全状态。\n· Эти три параметра определяют безопасность.' },
  { cond = function(S) return S.n >= 0.07 end,
    msg = '现在把目标功率推到 7% 以上：拖动「目标功率」滑杆。\n目标功率决定控制棒插深，反应堆功率随之爬升。\n低功率区（ORM 远远低于 30 根）操作要特别小心。\n· Задайте мощность не ниже 7%.' },
  { cond = function(S) return S.pumps and (S.pumps[1] or S.pumps[2] or S.pumps[3] or S.pumps[4] or S.pumps[5] or S.pumps[6] or S.pumps[7] or S.pumps[8]) end,
    msg = '启动主循环泵（点击 ГЦН 按钮，或按 1-8）。\n冷却剂循环一旦停止，堆芯温度会迅速上升，可能烧穿燃料。\n至少保持 4 台泵运转（含 2 台备用）。\n· Включите главные циркуляционные насосы.' },
  { msg = '最后是 АЗ-5 紧急停堆按钮——整个控制台最重要的按钮。\n只有在危急时刻才能按下：功率失控、周期过短、堆芯参数超限。\n记住它：这可能是你最后的保命手段。\n教学结束。祝你好运，值班长。\n· АЗ-5: последняя защита реактора.' },
}

function Tutorial.isActive() return idx >= 0 end

local function current()
  if idx >= 1 and idx <= #STEPS then return STEPS[idx] end
  return nil
end

local function advance()
  if advancing then return end
  advancing = true
  idx = idx + 1
  if idx > #STEPS then
    Tutorial.stop()
    return
  end
end

function Tutorial.start(c)
  if idx >= 0 then return end
  ctx = c or nil
  idx = 1
end

function Tutorial.stop()
  idx = -1
  ctx = nil
  advancing = false
end

function Tutorial.update(dt)
  if idx < 0 then return end
  local s = current()
  if not s then return end
  if s.cond and ctx and ctx.getState then
    if s.cond(ctx.getState()) then advance() end
  end
  advancing = false
end

function Tutorial.keypressed(key)
  if idx < 0 then return end
  local s = current()
  if not s or s.cond then return end
  if key == 'return' or key == 'kpenter' or key == 'space' then
    advance()
  end
end

function Tutorial.draw()
  if idx < 0 then return end
  local s = current()
  if not s then return end
  local w, h = 640, 168
  local x = 800 - w / 2
  local y = 900 - h - 210
  love.graphics.setColor(0.05, 0.06, 0.05, 0.94)
  love.graphics.rectangle('fill', x, y, w, h, 8)
  love.graphics.setColor(Theme.cyan[1], Theme.cyan[2], Theme.cyan[3], 0.9)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle('line', x, y, w, h, 8)

  love.graphics.setFont(Theme.getFont(10))
  love.graphics.setColor(Theme.txtFaint)
  love.graphics.print('第 ' .. idx .. ' 步 / ' .. #STEPS .. ' · ОБУЧЕНИЕ', x + 16, y + 8)

  love.graphics.setFont(Theme.getFont(12))
  love.graphics.setColor(Theme.txt)
  love.graphics.printf((s.msg:gsub('<br>', '\n')), x + 16, y + 28, w - 32)

  if s.cond then
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.setColor(Theme.amber)
    love.graphics.print('→ 完成上述操作后自动继续', x + 16, y + h - 20)
  else
    love.graphics.setFont(Theme.getFont(9))
    love.graphics.setColor(Theme.txtFaint)
    love.graphics.print('→ 按 ⏎ 继续', x + w - 80, y + h - 20)
  end
end

return Tutorial
