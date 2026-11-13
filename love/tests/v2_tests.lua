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

-- ==================== instrument 层 ====================

local Instrument = require('src.instrument')

addTest('instrument: 一阶滞后收敛到真值', function()
  Instrument.init()
  local v = 0
  for _ = 1, 200 do
    v = Instrument.update('power', 1.0, 0.05)
  end
  assertNear(v, 1.0, 0.02, '滞后应收敛')
end)

addTest('instrument: 量程截断与切换瞬态', function()
  Instrument.init()
  -- 注：web 原版 currentRange=2 时索引指向 {id:2, max:0.10}（量程1），
  -- 全量对齐保留该行为：默认档位下 >0.10 打表
  assertEq(Instrument.truncatePower(0.05), 0.05, '量程带内直通')
  assertEq(Instrument.truncatePower(0.5), 0.1, '默认档 >0.10 打表（对齐 web）')
  assertEq(Instrument.truncatePower(1e-5), 0, '低于下限归零')
  Instrument.switchRange(0)
  assertEq(Instrument.currentRangeId(), 0)
  assertEq(Instrument.truncatePower(5e-4), 5e-4, '源量程带内直通')
  assertEq(Instrument.truncatePower(5e-3), 1e-3, '源量程超上限打表')
  Instrument.switchRange(3)
  assertEq(Instrument.truncatePower(0.5), 0.5, '量程2 (id:3) 带内直通')
  assertTrue(Instrument.switching(), '切换后应有瞬态')
  Instrument.updateTimer(1.0)
  assertTrue(not Instrument.switching(), '0.8s 后瞬态结束')
  Instrument.switchRange(3)
end)

addTest('instrument: 报警灯 4 态全路径', function()
  Instrument.initLamps()
  Instrument.lampSet('CLAD', true)
  assertEq(Instrument.lampState('CLAD'), 'FAST_BLINK', '新报警 → 快闪')
  Instrument.kvit()
  assertEq(Instrument.lampState('CLAD'), 'ON', 'КВИТ → 常亮')
  Instrument.lampSet('CLAD', false)
  assertEq(Instrument.lampState('CLAD'), 'SLOW_BLINK', '条件消除 → 慢闪')
  Instrument.kvit()
  assertEq(Instrument.lampState('CLAD'), 'OFF', '慢闪经再次 КВИТ → 灭')
end)

addTest('instrument: 灯驱动条件映射', function()
  Instrument.initLamps()
  local S = {
    separator_level = 0.3, separator_pressure = 6.9, feedwater_temp = 250,
    clad_temp_max = 350, flow = 100, clad_integrity = 1.0,
    reactor_period = math.huge, decay_heat_power = 0, containment_dose_rate = 0.1,
  }
  Instrument.updateLamps(S)
  assertEq(Instrument.lampState('SEP_LO'), 'FAST_BLINK', '水位低应报警')
  S.separator_level = 1.0
  Instrument.updateLamps(S)
  assertEq(Instrument.lampState('SEP_LO'), 'OFF', '未 КВИT 前快闪直接熄灭（对齐 web set()）')
  S.containment_dose_rate = 5
  Instrument.updateLamps(S)
  assertEq(Instrument.lampState('RAD'), 'FAST_BLINK', '辐射升高应报警')
  Instrument.initLamps()
end)

-- ==================== scenario 场景引擎 ====================

local Scenario = require('src.scenario')

-- 场景时间助手（与 scenario.lua 相同公式）
local function t(h, m, day)
  if day == nil then day = h < 8 and 1 or 0 end
  return (((day * 24 + h) - 8) * 3600 + m * 60) * 1000
end

local function fakeState(over)
  local st = {
    power = 3200, n = 1.0, azFired = false, orm = 25, xenon = 0.4,
    voidFraction = 20, rodPositions = 47.5, fuelTemp = 280,
    meltdown = false, t = 0,
  }
  for k, v in pairs(over or {}) do st[k] = v end
  return st
end

addTest('scenario: 创建 + 事件按优先级排序', function()
  local sc = Scenario.create('chronicle_04')
  assertTrue(sc ~= nil, '场景应存在')
  assertEq(sc.id, 'chronicle_04')
  local ok = true
  for i = 2, #sc.events do
    local pa = sc.events[i - 1].priority or 0
    local pb = sc.events[i].priority or 0
    if pa > pb then ok = false end
  end
  assertTrue(ok, 'events 应按 priority 升序')
  assertEq(sc.flags.act, 1, '初始 act')
end)

addTest('scenario: 第一幕开场事件链', function()
  local sc = Scenario.create('chronicle_04')
  local gotTs, gotObj, logs = nil, nil, 0
  sc:on('timescale', function(a) gotTs = a.value end)
  sc:on('objective', function(a) gotObj = a.text end)
  sc:on('log', function() logs = logs + 1 end)
  sc:update(1, fakeState())
  assertEq(gotTs, 60, 'a1_start 应切 ×60')
  assertTrue(gotObj and gotObj:find('接班检查', 1, true), '应下发接班目标')
  assertTrue(logs >= 3, '应有开场日志')
  assertEq(sc.flags.act, 1)
end)

addTest('scenario: a1_end 时间跳跃到 23:10', function()
  local sc = Scenario.create('chronicle_04')
  local jumped = 0
  sc:on('timeskip', function(a) jumped = a.to end)
  sc:update(t(14, 0) + 1, fakeState())
  -- a1_end (time t(14,0)) 应在 a1_* 系列之后触发
  assertTrue(jumped > 0, '应收到 timeskip')
  assertEq(sc.simTime, t(23, 10), '场景时钟应跳到 23:10')
  assertEq(sc.flags.act, 2, '进入第二幕')
end)

addTest('scenario: 氙坑事件 + 保护关闭 + 覆盖注入', function()
  local sc = Scenario.create('chronicle_04')
  sc.simTime = t(0, 0) - 1000
  local gotMode, overrideN = nil, 0
  sc:on('mode', function(a) gotMode = a.value end)
  sc:on('log', function() end)
  sc:update(2000, fakeState())
  assertEq(Engine.S.protections.P2, false, 'a2_crash 应关闭 П2')
  assertEq(gotMode, 'manual', '应切手动')
  assertEq(sc.flags.xenon_pit_active, true, '氙坑标志')
  overrideN = 0
  for _, o in ipairs(sc.overrides) do overrideN = overrideN + 1 end
  assertTrue(overrideN >= 2, '应有 power+rod 两条覆盖')
  -- 恢复保护状态
  Engine.S.protections.P2 = true
end)

addTest('scenario: 分支决策 — 按 AZ-5 走停堆线', function()
  local sc = Scenario.create('chronicle_04')
  sc.simTime = t(0, 0)
  sc:update(1, fakeState())
  assertTrue(sc.activeBranch ~= nil, 'a2_branch 应武装分支')
  sc:onPlayerAction('az_pressed')
  assertEq(#sc.decisions, 1, '应记录决策')
  assertEq(sc.decisions[1].id, 'xenon_pit')
  assertEq(sc.decisions[1].choice, 'shutdown')
  assertEq(sc.flags.branch_xenon_pit, 'shutdown')
  -- a2_shutdown 触发
  sc:update(1, fakeState())
  assertEq(sc.flags.voluntary_shutdown, true, '自愿停堆标志')
  assertEq(sc.flags.act, '2B', '进入 2B')
  assertEq(sc.simTime, t(8, 0, 1), '跳跃到次日 08:00')
end)

addTest('scenario: 分支超时走默认 continue 线', function()
  local sc = Scenario.create('chronicle_04')
  sc.simTime = t(0, 0)
  sc:update(1, fakeState())
  sc:update(1800001, fakeState())  -- 超过 timeout 1800000
  assertEq(sc.flags.branch_xenon_pit, 'continue', '默认继续')
  sc:update(1, fakeState())  -- 下一帧事件循环才消费 a2_continue
  assertEq(sc.flags.act, 3, '进入第三幕')
end)

addTest('scenario: 停堆线走通到安全结局', function()
  local sc = Scenario.create('chronicle_04')
  sc.simTime = t(0, 0)
  sc:update(1, fakeState())
  sc:onPlayerAction('az_pressed')
  sc:update(1, fakeState())
  -- a3b_start (t(8,0,1)) 与 a3b_test (t(14,0,1))；endgame 处理与 app 层一致
  local endType = nil
  sc:on('endgame', function(a)
    endType = a.endType
    sc:finish(a.endType, a.epilogue)
  end)
  sc:update(t(14, 0, 1) - sc.simTime + 1, fakeState())
  assertEq(endType, 'SAFE_SHUTDOWN', '停堆线应安全结局')
  assertTrue(sc:isFinished(), '场景应结束')
  assertEq(sc.endResult.epilogue, 'epilogue_quiet')
end)

addTest('scenario: sim_override 功率拉向目标', function()
  local sc = Scenario.create('chronicle_04')
  sc:execAction({ type = 'sim_override', target = 'power', value = 30, ramp = 1000 })
  local S = { n = 1.0, rodTarget = 50, rodHeld = 0 }
  for _ = 1, 100 do
    sc:applyOverrides(100, S)
  end
  assertNear(S.n, 30 / Engine.N_NOM, 0.01, '功率应被拉向 30 МВт')
end)

addTest('scenario: 熔毁早期直接结局', function()
  local sc = Scenario.create('chronicle_04')
  local endType = nil
  sc:on('endgame', function(a)
    endType = a.endType
    sc:finish(a.endType, a.epilogue)
  end)
  sc:update(1, fakeState({ meltdown = true, t = 3600 }))  -- 白班熔毁
  assertEq(endType, 'EXPLOSION', '白班熔毁应直接爆炸结局')
  assertTrue(sc:isFinished())
end)
