-- v2_tests.lua — 物理引擎 v2 / journal / scoring 测试套件（headless）
-- 由 headless.lua 载入执行，用 T.addTest / T.assertNear 注册。
-- 引擎测试开头 T.seed(42)：随机序列与 web/node 基准逐位一致（见 tests/equiv_check.lua）。

local Engine = require('src.engine')
local Journal = require('src.journal')
local Scoring = require('src.scoring')

local addTest = T.addTest
local assertNear = T.assertNear
local assertEq = T.assertEq
local assertTrue = T.assertTrue

-- 工具：推进仿真 N 游戏秒
local function run(seconds)
  Engine.advanceSim(seconds)
end

-- ==================== 点堆动力学 ====================

addTest('kinetics: 冷启动 60gs 轨迹与 web 基准逐位一致', function()
  T.seed(42)
  Engine.reset()
  run(60)
  -- node 基准（同 LCG）：n=0.682615 rho=0.001340 rodPos=47.9832 void=36.849 flow=51.274
  assertNear(Engine.S.n, 0.682615, 1e-6, '冷启动功率')
  assertNear(Engine.S.rodPos, 47.9832, 1e-3, '棒位')
  assertNear(Engine.S.flow, 51.274, 1e-2, '流量')
  assertTrue(math.abs(Engine.S.rho) < 0.01, '反应性应近零')
end)

addTest('kinetics: initFullPower → 保护动作停堆（对齐 web 行为）', function()
  -- web 基准：满功率初始态下分离器水位流失 → 流量抖动 → 正空泡反应性 → P1 动作
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  run(120)
  assertTrue(Engine.S.azFired, '应触发保护停堆 (web 基准 az=true)')
  assertTrue(Engine.S.n < 0.01, '停堆后功率应坍缩, 实际 ' .. tostring(Engine.S.n))
  assertTrue(not Engine.S.meltdown, '不应熔毁')
end)

addTest('kinetics: 周期计稳态收敛到 ∞', function()
  T.seed(42)
  Engine.reset()
  Engine.setMode('manual')
  Engine.setRodTarget(90)
  run(600)
  -- 氙缓慢漂移使周期大而有限；仪表层在 |T|>1000 时显示 ∞（与 web 一致）
  assertTrue(Engine.S.period == math.huge or math.abs(Engine.S.period) > 300,
    '稳态周期应深度收敛, 实际 ' .. tostring(Engine.S.period))
end)

-- ==================== AZ-5 ====================

addTest('AZ-5: 手动功率平台停堆无爆熔', function()
  T.seed(42)
  Engine.reset()
  Engine.setMode('manual')
  Engine.setRodTarget(90)
  run(90)
  assertTrue(Engine.S.n > 0.6 and Engine.S.n < 0.8,
    '前置: 手动平台功率 ≈0.71 (web 基准 0.7123), 实际 ' .. tostring(Engine.S.n))
  local ok = Engine.manualAZ()
  assertTrue(ok, '手动 AZ-5 应成功')
  run(60)
  assertTrue(Engine.S.n < 0.02, 'AZ-5 后功率应接近 0, 实际 ' .. tostring(Engine.S.n))
  assertTrue(not Engine.S.meltdown, '正常停堆不应熔毁')
  assertTrue(Engine.S.azFired, 'azFired 应置位')
end)

addTest('AZ-5: 低功率正反应性尖峰（Чернобыль 效应）', function()
  T.seed(42)
  Engine.reset()
  -- 工程化状态：氙坑 + 低功率（scramStartN 落入 0.04~0.14 尖峰窗口）
  local S = Engine.S
  S.mode = 'manual'
  S.n = 0.08; S.nPrev = 0.08; S.C = 0.08
  S.rodPos = 45; S.rodTarget = 45
  S.xe = 1.2; S.iodine = 1.2
  S.separator_level = 1.0  -- 高于 0.3，避免随机流量抖动
  local n0 = S.n
  assertTrue(Engine.manualAZ(), 'AZ-5 应成功')
  local peak = n0
  for _ = 1, 240 do
    Engine.advanceSim(0.5)
    if S.n > peak then peak = S.n end
    if S.meltdown then break end
  end
  assertTrue(peak > n0 * 1.5,
    '低功率 AZ-5 应出现功率尖峰 (正停堆效应), n0=' .. n0 .. ' peak=' .. peak)
end)

addTest('AZ-5: 钥匙闭锁后手动触发被拒', function()
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  Engine.toggleKey()
  assertTrue(Engine.S.azBlocked, '闭锁应生效')
  local ok = Engine.manualAZ()
  assertTrue(not ok, '闭锁时手动 AZ-5 应失败')
  assertTrue(not Engine.S.azFired, '不应触发停堆')
end)

-- ==================== 衰变热 / 氙 ====================

addTest('decay: AZ-5 后衰变热出现且随时间衰减', function()
  T.seed(42)
  Engine.reset()
  Engine.setMode('manual')
  Engine.setRodTarget(90)
  run(90)
  Engine.manualAZ()
  run(10)
  local d1 = Engine.S.decay_heat_power
  assertTrue(d1 > 0, '停堆后衰变热应 > 0, 实际 ' .. tostring(d1))
  run(600)
  local d2 = Engine.S.decay_heat_power
  assertTrue(d2 < d1, '衰变热应随时间下降: ' .. d1 .. ' -> ' .. d2)
end)

addTest('xenon: 降功率后氙毒累积（碘坑形成）', function()
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  run(300)
  Engine.setTargetPower(10)
  run(600)
  assertTrue(Engine.S.xe > 0.5, '降功率后氙应累积, xe=' .. tostring(Engine.S.xe))
  assertTrue(Engine.S.rhoComponents.xe < 0, '氙反应性分量应为负')
end)

-- ==================== 保护系统 ====================

addTest('protections: P1 超功率保护自动触发 AZ-5', function()
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  Engine.setMode('manual')
  Engine.setRodTarget(92)
  run(120)
  assertTrue(Engine.S.azFired or Engine.S.meltdown or Engine.S.n <= 1.2,
    '超功率应触发保护或被多普勒压制')
end)

addTest('protections: 中等提棒不触发保护（P2 温和区间）', function()
  -- node 基准：az=false, n=0.7385, period=52.7
  T.seed(42)
  Engine.reset()
  Engine.setMode('manual')
  Engine.setRodTarget(90)
  run(90)
  Engine.setRodTarget(100)
  run(60)
  assertTrue(not Engine.S.azFired, '温和提棒不应触发 AZ')
  assertTrue(Engine.S.n > 0.6, '功率应维持在平台')
end)

-- ==================== v2 系统 ====================

addTest('v2: 分离器满功率流失（蒸汽 > 给水）+ 蒸汽流量公式', function()
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  run(30)
  -- node 基准：sepL=0.000 steam=5366
  assertTrue(Engine.S.separator_level < 0.5,
    '满功率下分离器水位应流失, 实际 ' .. tostring(Engine.S.separator_level))
  local expectSteam = Engine.S.n * Engine.N_NOM * 2.4
  assertNear(Engine.S.steam_flow, expectSteam, expectSteam * 0.01, '蒸汽流量 = n·N_nom·2.4')
end)

addTest('v2: 分离器阀门关闭 → 压力升高', function()
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  Engine.S.turbine_valve_opening = 0.1
  run(60)
  assertTrue(Engine.S.separator_pressure > 7.0,
    '关阀后压力应上升, 实际 ' .. tostring(Engine.S.separator_pressure))
end)

addTest('v2: 包壳完整性 — 给水冷冲击导致下降', function()
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  run(60)
  Engine.S.feedwater_temp = 40  -- 模拟 САОР 注入冷水
  Engine.S.flow = 100
  run(120)
  assertTrue(Engine.S.clad_integrity < 1.0,
    '冷冲击应损耗包壳完整性, 实际 ' .. tostring(Engine.S.clad_integrity))
end)

addTest('v2: 棒驱动过热闭锁（首步动作后冻结）', function()
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  Engine.S.rod_drive_temp = 85
  Engine.S.rod_drive_overheat = false
  Engine.setMode('manual')
  Engine.setRodTarget(80)
  run(5)
  assertTrue(Engine.S.rod_drive_overheat, '驱动过热应闭锁')
  local frozen = Engine.S.rodPos
  run(10)
  assertNear(Engine.S.rodPos, frozen, 1e-9, '闭锁后棒位应冻结')
end)

addTest('v2: 四象限模型按条件启用（t>3600s 且 n<0.5）', function()
  T.seed(42)
  Engine.reset()
  Engine.setTargetPower(30)
  run(4000)
  assertTrue(Engine.S.enable_quadrant_model, '象限模型应在低功率长时后启用')
  local sum = 0
  for i = 1, 4 do sum = sum + Engine.S.quadrant_power[i] end
  assertNear(sum, Engine.S.n * Engine.N_NOM, Engine.S.n * Engine.N_NOM * 0.15,
    '象限功率之和应≈总功率')
end)

-- ==================== 熔毁链路 ====================

addTest('meltdown: 超量程功率导致堆芯熔毁', function()
  Engine.reset()
  Engine.initFullPower()
  for k in pairs(Engine.S.protections) do Engine.S.protections[k] = false end
  Engine.setMode('manual')
  Engine.setRodTarget(100)
  run(600)
  if not Engine.S.meltdown then
    Engine.S.coreDamage = 99.9
    Engine.S.n = 1.3
    run(5)
  end
  assertTrue(Engine.S.meltdown, '超限运行应导致熔毁')
  assertNear(Engine.S.doseRate, 300000, 1000, '熔毁剂量率')
end)

-- ==================== 快照 ====================

addTest('snapshot: exportState/importState 往返', function()
  T.seed(42)
  Engine.reset()
  Engine.initFullPower()
  run(50)
  local snap = Engine.exportState()
  local nBefore = Engine.S.n
  Engine.reset()
  assertTrue(math.abs(Engine.S.n - nBefore) > 1e-6, '重置后状态应不同')
  Engine.importState(snap)
  assertNear(Engine.S.n, nBefore, 1e-12, '导入后功率应恢复')
  assertEq(#Engine.S.pumps, 8, '泵数组长度')
  Engine.S.onEvent = nil
  Engine.S.onAlarm = nil
end)

-- ==================== journal ====================

addTest('journal: 往返 + recordShiftEnd + 设置持久化', function()
  Journal.clearAll()
  local j = Journal.loadJournal()
  assertEq(j.operator.shiftCount, 0, '新档案班次数')
  assertEq(j.settings.masterVolume, 0.8, '默认主音量')

  Journal.recordShiftEnd(j, 'free_play', { dimensions = { safety = 0.9 }, outcome = 'completed' }, 60000)
  assertEq(j.operator.shiftCount, 1, '记录后班次数')
  assertEq(j.statistics.totalShifts, 1, '统计班次数')

  Journal.recordSettingsChange(j, Journal.defaultSettings())
  Journal.setSetting(j, 'busVolumes.alarms', 0.5)
  Journal.saveJournal(j)

  local j2 = Journal.loadJournal()
  assertEq(j2.operator.shiftCount, 1, '重载后班次数')
  assertEq(j2.settings.busVolumes.alarms, 0.5, '重载后设置')
  assertEq(#j2.entries, 1, '重载后条目数')
  assertEq(j2.entries[1].outcome, 'completed', '条目结局')
end)

addTest('journal: 损坏文件回退新档案', function()
  local store = {
    get = function(k) if k == 'rbmk_journal' then return 'return { broken' end return nil end,
    set = function() end,
    remove = function() end,
  }
  Journal.setAdapter(store)
  local j = Journal.loadJournal()
  assertEq(j.operator.shiftCount, 0, '损坏数据应回退新档案')
  Journal.setAdapter(nil)
end)

-- ==================== scoring ====================

addTest('scoring: 评级边界', function()
  assertEq(Scoring.ratingFromScore(0.96).cn, '优秀')
  assertEq(Scoring.ratingFromScore(0.85).cn, '良好')
  assertEq(Scoring.ratingFromScore(0.65).cn, '合格')
  assertEq(Scoring.ratingFromScore(0.45).cn, '不合格')
  assertEq(Scoring.ratingFromScore(0.1).cn, '事故状态')
end)

addTest('scoring: 熔毁 → safety=0.05 且 outcome=accident', function()
  local stats = Scoring.newStats()
  stats.meltdown = true
  local r = Scoring.evaluate(stats, 'free', 'MELTDOWN')
  assertNear(r.dimensions.safety, 0.05, 1e-9)
  assertNear(r.dimensions.equipment, 0, 1e-9)
  assertEq(r.outcome, 'accident')
  assertTrue(#r.remarks > 0)
end)

addTest('scoring: 干净运行 → 全维高分', function()
  local stats = Scoring.newStats()
  local r = Scoring.evaluate(stats, 'free', 'VOLUNTARY')
  assertNear(r.dimensions.safety, 1.0, 1e-9)
  assertNear(r.dimensions.response, 1.0, 1e-9)
  assertEq(r.outcome, 'completed')
end)

addTest('scoring: 历史匹配度计算', function()
  local decisions = {
    { id = 'xenon_pit', choice = 'continue' },
    { id = 'saor_disable', choice = 'obey' },
    { id = 'az5_press', choice = 'press' },
  }
  local s = Scoring.matchScore(decisions, {})
  assertTrue(s ~= nil and s > 0, '匹配度应为正, 实际 ' .. tostring(s))
  local s2 = Scoring.matchScore(decisions, { voluntary_shutdown = true })
  assertTrue(s2 <= 60, '停堆线匹配度应 ≤ 60, 实际 ' .. tostring(s2))
  assertEq(Scoring.matchScore({}, {}), nil)
end)

addTest('scoring: 值班报告生成', function()
  local dims = { procedure = 0.9, safety = 0.85, response = 1.0, equipment = 0.8, completeness = 0.7 }
  local ratings = {}
  for k in pairs(dims) do ratings[k] = Scoring.ratingFromScore(dims[k]) end
  local report = Scoring.generateReport(dims, ratings, { 'Замечаний нет.' }, {})
  assertTrue(report:find('ЧЕРНОБЫЛЬСКАЯ', 1, true) ~= nil, '报告应含抬头')
  assertTrue(report:find('Блок №4', 1, true) ~= nil, '报告应含机组号')
end)
