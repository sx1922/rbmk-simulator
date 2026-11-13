/* test-engine-v2.js — v2.0 物理引擎验证 */
const fs = require('fs');
const path = require('path');

// 模拟浏览器环境
global.window = global;
global.document = { createElement: function() { return { style: {}, getContext: function() { return {}; } }; }, body: { appendChild: function() {} }, addEventListener: function() {} };
global.AudioContext = function() { return { createOscillator: function() { return { start: function() {}, stop: function() {}, connect: function() { return this; }, frequency: { value: 0 }, type: '' }; }, createGain: function() { return { gain: { value: 0, setValueAtTime: function() {}, exponentialRampToValueAtTime: function() {} }, connect: function() { return this; } }; }, createBiquadFilter: function() { return { frequency: { value: 0 }, Q: { value: 0 }, type: '', connect: function() { return this; } }; }, createBuffer: function() { return { getChannelData: function() { return []; }, sampleRate: 44100 }; }, createBufferSource: function() { return { buffer: null, connect: function() { return this; }, start: function() {}, stop: function() {} }; }, destination: {} }; };

const CODE = fs.readFileSync(path.resolve(__dirname, 'web/js/engine.js'), 'utf8');
eval(CODE);
const RBMK = window.RBMK;
const V2 = RBMK.V2;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.log('  FAIL:', msg); }
}

// 用 V2 内部函数
const { updateSeparator, updateFeedwater, updateCladIntegrity,
        updateDecayHeat, updatePeriod, updateQuadrants,
        updateRadiation, updateRodDrives } = V2;

// ====== 1. 稳态验证 ======
console.log('\n=== 1. 稳态验证 ===');
RBMK.initFullPower();
const S = RBMK.S;

assert(S.n === 1.0, 'initFullPower: n=1.0');
assert(S.rodPos === 53.7, 'initFullPower: rodPos=53.7');
assert(S.separator_level === 1.0, 'v2: separator_level=1.0');
assert(S.separator_pressure === 6.9, 'v2: separator_pressure=6.9');
assert(S.feedwater_temp === 270, 'v2: feedwater_temp=270');
assert(S.clad_integrity === 1.0, 'v2: clad_integrity=1.0');
assert(S.rod_drive_temp === 20, 'v2: rod_drive_temp=20');
assert(S.scram_time === null, 'v2: scram_time=null');
assert(S.decay_heat_power === 0, 'v2: decay_heat_power=0');
assert(S.reactor_period === Infinity, 'v2: reactor_period=Infinity');
assert(S.quadrant_power[0] === 800, 'v2: quadrant_power[0]=800');
assert(S.coolant_activity === 1e3, 'v2: coolant_activity=1e3');
assert(S.containment_dose_rate === 0.1, 'v2: containment_dose_rate=0.1');

// ====== 2. 汽水分离器 ======
console.log('\n=== 2. 汽水分离器 ===');
RBMK.initFullPower();
// 直接调用 updateSeparator 测试水位模型
S.n = 1.0;
S.feedwater_flow = 10378; // 匹配 7680 t/h 蒸汽的 m³/h 值
S.separator_level = 1.0;
S.separator_pressure = 6.9;
S.turbine_valve_opening = 1.0;
// 先执行一次让 steam_flow 同步
updateSeparator(0.1);
const level0 = S.separator_level;
for (let i = 0; i < 200; i++) updateSeparator(0.1);
assert(Math.abs(S.separator_level - level0) < 0.005, 'feedwater=steam: 水位变化 < 0.005 (' + (S.separator_level - level0).toFixed(4) + ')');
assert(S.steam_flow > 7000, '全功率 steam_flow > 7000 (' + S.steam_flow.toFixed(0) + ')');

// 低功率 steam_flow 降低
RBMK.initFullPower();
S.n = 0.1;
for (let i = 0; i < 20; i++) updateSeparator(0.1);
assert(S.steam_flow < 1000, '低功率 steam_flow 降低 (' + S.steam_flow.toFixed(0) + ')');

// ====== 3. 衰变热 ======
console.log('\n=== 3. 衰变热 ===');
RBMK.reset();
S.n = 1.0;
S.pre_scram_power = 3200;
S.scram_time = 0;
S.t = 1;
updateDecayHeat(0.1);
assert(S.decay_heat_power > 200 && S.decay_heat_power < 250, '停堆后 1s 衰变热 ~224 MW (' + S.decay_heat_power.toFixed(0) + ')');

S.t = 300;
updateDecayHeat(0.1);
assert(S.decay_heat_power > 60 && S.decay_heat_power < 75, '停堆后 5min 衰变热 ~68 MW (' + S.decay_heat_power.toFixed(0) + ')');

S.t = 3600;
updateDecayHeat(0.1);
assert(S.decay_heat_power > 35 && S.decay_heat_power < 55, '停堆后 1h 衰变热 ~45 MW (' + S.decay_heat_power.toFixed(0) + ')');

RBMK.reset();
assert(S.decay_heat_power === 0, '未停堆: decay_heat_power=0');

// ====== 4. 反应堆周期 ======
console.log('\n=== 4. 反应堆周期 ===');
RBMK.reset();
S.n = 1.0;
S.prev_P_thermal = 3200;
updatePeriod(0.1);
assert(S.reactor_period === Infinity, '功率不变: reactor_period=Infinity');

S.n = 1.05;
S.prev_P_thermal = 3200;
updatePeriod(0.1);
assert(S.reactor_period > 0 && S.reactor_period < 1000, '功率上升: 周期正 (' + S.reactor_period.toFixed(1) + 's)');

S.n = 0.95;
S.prev_P_thermal = 3200;
updatePeriod(0.1);
assert(S.reactor_period < 0, '功率下降: 周期负 (' + S.reactor_period.toFixed(1) + 's)');

// ====== 5. 四象限模型 ======
console.log('\n=== 5. 四象限模型 ===');
RBMK.reset();
S.n = 0.3;
S.t = 4000;
S.enable_quadrant_model = true;
for (let i = 0; i < 4; i++) {
  S.quadrant_power[i] = 240;
  S.quadrant_xenon[i] = 0;
  S.quadrant_rods[i] = 0.5;
}
updateQuadrants(0.1);
const totalQ = S.quadrant_power.reduce((a, b) => a + b, 0);
const totalP = S.n * RBMK.N_NOM;
assert(Math.abs(totalQ - totalP) < 1, '四象限功率之和 = 总功率 (' + totalQ.toFixed(0) + ' vs ' + totalP.toFixed(0) + ')');

const xe0 = S.quadrant_xenon[0];
for (let i = 0; i < 600; i++) updateQuadrants(1);
assert(S.quadrant_xenon[0] !== xe0, '象限氙随时间变化 (' + xe0.toFixed(4) + ' → ' + S.quadrant_xenon[0].toFixed(4) + ')');

// 拔某象限棒 → 该象限功率上升
S.quadrant_rods = [0.3, 0.5, 0.5, 0.5];
S.quadrant_xenon = [0, 0, 0, 0];
for (let i = 0; i < 10; i++) updateQuadrants(0.1);
assert(S.quadrant_power[0] > S.quadrant_power[1], '拔 Q1 棒: Q1 功率 > Q2 功率 (' + S.quadrant_power[0].toFixed(0) + ' vs ' + S.quadrant_power[1].toFixed(0) + ')');

// ====== 6. 辐射模型 ======
console.log('\n=== 6. 辐射模型 ===');
RBMK.reset();
S.n = 1.0;
S.clad_integrity = 1.0;
S.coolant_activity = 1e3;
for (let i = 0; i < 50; i++) updateRadiation(0.1);
assert(S.coolant_activity > 0, '辐射模型: 活度 > 0 (' + S.coolant_activity.toFixed(0) + ')');

S.clad_integrity = 0.5;
S.coolant_activity = 1e3;
for (let i = 0; i < 100; i++) updateRadiation(0.1);
assert(S.coolant_activity > 1e5, '包壳破损: 活度上升 (' + S.coolant_activity.toFixed(0) + ')');

S.clad_integrity = 0.3;
updateRadiation(0.1);
assert(S.containment_dose_rate > 1, '包壳破损: 剂量率 > 1 mR/h (' + S.containment_dose_rate.toFixed(2) + ')');

// ====== 7. 棒驱动机构 ======
console.log('\n=== 7. 棒驱动机构 ===');
RBMK.reset();
S.rod_drive_temp = 20;
S.rod_drive_overheat = false;
S.active_rod_drives = 20;
for (let i = 0; i < 200; i++) updateRodDrives(0.1);
assert(S.rod_drive_temp > 20, '棒运动: 温度上升 (' + S.rod_drive_temp.toFixed(1) + '°C)');
assert(S.rod_drive_overheat === true, '过热闭锁已触发');

S.active_rod_drives = 0;
S.rod_drive_temp = 40;
for (let i = 0; i < 200; i++) updateRodDrives(0.1);
assert(S.rod_drive_overheat === false, '冷却后闭锁恢复');

// ====== 8. 包壳完整性 ======
console.log('\n=== 8. 包壳完整性 ===');
RBMK.reset();
S.feedwater_temp = 270;
S.clad_temp_max = 350;
S.flow = 100;
updateCladIntegrity(1);
assert(S.clad_integrity === 1.0, '温和热冲击: 包壳完好');

S.feedwater_temp = 40;
S.clad_temp_max = 350;
S.flow = 100;
for (let i = 0; i < 10; i++) updateCladIntegrity(1);
assert(S.clad_integrity < 1.0, '严重热冲击: 包壳损伤 (' + S.clad_integrity.toFixed(4) + ')');

// ====== 9. step() 完整循环不崩溃 ======
console.log('\n=== 9. 完整循环 ===');
RBMK.reset();
for (let i = 0; i < 1000; i++) {
  try { RBMK.step(0.1); } catch (e) {
    assert(false, 'step() 抛出异常: ' + e.message);
    break;
  }
}
assert(true, '1000 步 step() 无异常');
assert(S.t > 0, '模拟时间推进 (' + S.t.toFixed(0) + 's)');
assert(isFinite(S.n), 'n 有限 (' + S.n + ')');
assert(isFinite(S.rho), 'rho 有限 (' + S.rho + ')');

// ====== 10. 给水温度 ======
console.log('\n=== 10. 给水温度 ===');
RBMK.reset();
S.feedwater_temp = 100;
for (let i = 0; i < 600; i++) updateFeedwater(1);
assert(S.feedwater_temp > 250, '给水温度恢复 (' + S.feedwater_temp.toFixed(1) + '°C)');

// ====== 11. fireAZ 记录停堆时刻 ======
console.log('\n=== 11. scrams ===');
RBMK.reset();
assert(S.scram_time === null, 'scram_time 初始 null');
RBMK.manualAZ();
assert(S.scram_time === 0, 'manualAZ: scram_time=0 (' + S.scram_time + ')');
assert(S.pre_scram_power > 0, 'manualAZ: pre_scram_power > 0 (' + S.pre_scram_power + ')');

// ====== 12. 过热闭锁时 stepRods 不移动 ======
console.log('\n=== 12. 过热闭锁 ===');
RBMK.reset();
S.rod_drive_overheat = true;
S.rodPos = 50;
S.rodTarget = 30;
RBMK.step(0.1);
assert(S.rodPos === 50, '过热闭锁: rodPos 不变 (' + S.rodPos + ')');

// ====== 结果 ======
console.log('\n=== 结果: ' + passed + '/' + (passed + failed) + ' 通过, ' + failed + ' 失败 ===');
process.exit(failed > 0 ? 1 : 0);