# ЩИТ-DOC-SCEN-01 · 场景引擎接入规格书

| 字段 | 值 |
|------|-----|
| 文档编号 | ЩИТ-DOC-SCEN-01 |
| 对应版本 | v0.2.0 «Коридор» |
| 状态 | 已定稿 |
| 定稿时间 | 2026-07-31 00:31 CST |
| 前置文档 | ЩИТ-DOC-FLOW-01（生命周期）、GDD §14（六幕设计） |

---

## 1 · 问题陈述

lib/scenario.js 存在完整的 ScenarioEngine 类（事件队列、条件判断、动作工厂），但 App.startGame() 从未实例化它。故事模式启动后等同于沙盒——无事件、无电话、无 Дятлов、无分支。

本文档定义场景引擎如何接入 App 主循环，使故事模式"有东西发生"。

---

## 2 · 接入架构

```
App.startGame('story', scenarioId)
  │
  ├─ 创建 Simulation（已有）
  ├─ 创建 ScenarioEngine（新增）
  │     └─ 加载 scenarioId 对应的事件数据
  │
  └─ 主循环 tick(dt):
        ├─ Simulation.step(dt)          ← 已有
        ├─ ScenarioEngine.update(dt, simState)  ← 新增
        │     └─ 返回 Action[]
        └─ ActionExecutor.execute(actions)      ← 新增
              ├─ 修改 simState（拔棒、降功率等）
              ├─ 触发 UI 事件（电话浮层、对话浮层）
              ├─ 触发 App.endGame()（终局事件）
              └─ 记录决策日志
```

---

## 3 · ScenarioEngine 接口

### 3.1 初始化

```js
const engine = new ScenarioEngine(scenarioData, config);
// scenarioData: { id, name, events[], initialState, endConditions[] }
// config: { timeScale, flags }
```

### 3.2 每帧更新

```js
const actions = engine.update(dt, simState);
// dt: 游戏内毫秒（已经过 timeScale 缩放）
// simState: { power, orm, xenon, voidFraction, rodPositions, ... }
// 返回: Action[]（本帧需要执行的动作列表）
```

### 3.3 玩家决策注入

```js
engine.playerDecision(decisionId, choice);
// 当玩家在分支点做出选择时调用
// 例: engine.playerDecision('xenon_pit', 'continue')
```

### 3.4 状态查询

```js
engine.getFlags()       // → { discoveredPage47: true, dyatlovPresent: true, ... }
engine.getDecisions()   // → [{ id, choice, timestamp }, ...]
engine.isFinished()     // → boolean
```

---

## 4 · 事件数据格式

### 4.1 事件结构

```json
{
  "id": "evt_phone_01",
  "time": 83700000,
  "condition": null,
  "priority": 1,
  "once": true,
  "actions": [
    { "type": "phone", "from": "调度", "text": "基辅问试验什么时候开始。" },
    { "type": "log", "text": "23:15 调度来电，询问试验进度。" },
    { "type": "flag", "key": "phone_01_done", "value": true }
  ]
}
```

### 4.2 动作类型清单

| type | 参数 | 效果 |
|------|------|------|
| phone | { from, text, duration } | 触发电话浮层 UI |
| dialogue | { speaker, text, choices[] } | 触发对话浮层 UI |
| log | { text } | 写入操作日志 |
| flag | { key, value } | 设置全局 flag |
| sim_override | { target, value, ramp } | 强制修改仿真状态（如功率骤降） |
| sound | { id, volume } | 播放音效 |
| wait | { ms } | 延迟后续动作 |
| endgame | { endType, delay, epilogue } | 触发终局（调用 App.endGame） |
| branch | { id, choices[], timeout, default } | 分支点，等待玩家决策 |
| pressure | { level, behavior } | 设置压力层级（见 FLOW-01 关联） |

### 4.3 分支事件详细格式

```json
{
  "id": "evt_xenon_decision",
  "time": null,
  "condition": "(s, f) => s.power < 50 && f.xenon_pit_active",
  "priority": 10,
  "once": true,
  "actions": [
    {
      "type": "branch",
      "id": "xenon_pit",
      "prompt": null,
      "detectBy": "action",
      "rules": [
        { "if": "az_pressed", "choice": "shutdown" },
        { "if": "rod_withdrawn", "choice": "continue" },
        { "if": "idle_3min", "choice": "continue" }
      ],
      "timeout": 180000,
      "default": "continue"
    }
  ]
}
```

**关键设计**：分支不弹 UI 选择框。玩家通过"按了 AZ"或"拔了棒"来表达选择。引擎监听玩家操作来判定分支走向。

---

## 5 · ActionExecutor

新增模块 `lib/action-executor.js`。职责：把 ScenarioEngine 返回的 Action[] 翻译成实际效果。

```js
class ActionExecutor {
  constructor(simulation, uiManager, app) {}

  execute(actions) {
    for (const action of actions) {
      switch (action.type) {
        case 'phone':
          this.uiManager.showPhone(action);
          break;
        case 'dialogue':
          this.uiManager.showDialogue(action);
          break;
        case 'sim_override':
          this.simulation.override(action.target, action.value, action.ramp);
          break;
        case 'endgame':
          this.app.endGame('SCENARIO_END', action);
          break;
        case 'branch':
          this.uiManager.armBranch(action);
          break;
        // ...
      }
    }
  }
}
```

---

## 6 · App.startGame() 修改

### 当前（断裂）

```js
startGame(mode) {
  this.simulation = new Simulation();
  this.state = 'PLAYING';
  this.loop();
}
```

### 修改后

```js
startGame(mode, scenarioId) {
  this.simulation = new Simulation();
  this.mode = mode;

  if (mode === 'story') {
    const data = ScenarioLibrary.get(scenarioId);
    this.scenario = new ScenarioEngine(data, {
      timeScale: this.settings.timeScale,
      flags: {}
    });
    this.executor = new ActionExecutor(this.simulation, this.ui, this);

    if (data.initialState) {
      this.simulation.applyState(data.initialState);
    }
  }

  this.state = 'PLAYING';
  this.loop();
}
```

### 主循环修改

```js
tick(dt) {
  const gameDt = dt * this.timeScale;

  this.simulation.step(gameDt);

  if (this.scenario && !this.scenario.isFinished()) {
    const actions = this.scenario.update(gameDt, this.simulation.getState());
    if (actions.length > 0) {
      this.executor.execute(actions);
    }
  }

  this.render();
}
```

---

## 7 · 场景数据：六幕 → 事件列表

GDD §14 的六幕设计需要转化为事件数据。以第二幕为例：

### 第二幕 «Яма» 事件列表（骨架）

```js
const act2_events = [
  // 接班
  { id: 'a2_start', time: 83400000, actions: [
    { type: 'log', text: '23:10 夜班接班。功率 1600 MW。' },
    { type: 'flag', key: 'act', value: 2 }
  ]},

  // 调度命令
  { id: 'a2_dispatch', time: 83460000, actions: [
    { type: 'phone', from: '调度', text: '继续降至 700-1000，准备试验。' },
    { type: 'log', text: '23:11 调度命令：降功率至 700-1000 MW。' }
  ]},

  // 功率骤降（脚本强制）
  { id: 'a2_crash', time: 84600000, condition: (s) => s.power < 1600, actions: [
    { type: 'sim_override', target: 'power', value: 30, ramp: 5000 },
    { type: 'sound', id: 'alarm_low' },
    { type: 'flag', key: 'xenon_pit_active', value: true },
    { type: 'log', text: '23:30 功率骤降至 30 MW。' }
  ]},

  // 电话：基辅在问
  { id: 'a2_phone_kiev', time: 85500000, actions: [
    { type: 'phone', from: '不明', text: '基辅问试验什么时候开始。', duration: 3000 },
    { type: 'log', text: '23:45 调度来电，询问试验进度。' }
  ]},

  // Дятлов 进入（条件触发）
  { id: 'a2_dyatlov_enter', time: null,
    condition: (s, f) => f.xenon_pit_active && s.power < 100 && !f.dyatlov_present,
    delay_after: 180000,
    actions: [
      { type: 'sound', id: 'footsteps' },
      { type: 'flag', key: 'dyatlov_present', value: true },
      { type: 'log', text: '00:10 副总工程师 Дятлов 进入主控室。' },
      { type: 'pressure', level: 2, behavior: 'stand_behind' }
    ]
  },

  // Дятлов 说话
  { id: 'a2_dyatlov_speak', time: null,
    condition: (s, f) => f.dyatlov_present && !f.dyatlov_spoke,
    delay_after: 30000,
    actions: [
      { type: 'dialogue', speaker: 'Дятлов', text: '功率多少了？',
        choices: [
          { label: '30 兆瓦。', next: 'a2_dyatlov_pull' },
          { label: '（沉默）', next: 'a2_dyatlov_repeat' }
        ]
      },
      { type: 'flag', key: 'dyatlov_spoke', value: true }
    ]
  },

  // 分支点
  { id: 'a2_branch', time: null,
    condition: (s, f) => f.xenon_pit_active && s.power < 100,
    actions: [
      { type: 'branch', id: 'xenon_pit',
        detectBy: 'action',
        rules: [
          { if: 'az_pressed', choice: 'shutdown' },
          { if: 'rod_withdrawn', choice: 'continue' }
        ],
        timeout: 180000,
        default: 'continue'
      }
    ]
  },

  // 分支结果：停堆
  { id: 'a2_shutdown', time: null,
    condition: (s, f) => f.branch_xenon_pit === 'shutdown',
    actions: [
      { type: 'dialogue', speaker: 'Дятлов', text: '你确定？' },
      { type: 'endgame', endType: 'SAFE_SHUTDOWN', delay: 2000,
        epilogue: 'epilogue_quiet', nextScene: 'act2b' }
    ]
  },

  // 分支结果：继续
  { id: 'a2_continue', time: null,
    condition: (s, f) => f.branch_xenon_pit === 'continue',
    actions: [
      { type: 'log', text: '操纵员开始拔棒。' },
      { type: 'flag', key: 'act', value: 3 },
      { type: 'scene_transition', next: 'act3_events' }
    ]
  }
];
```

---

## 8 · 场景切换机制

六幕不是六个独立场景文件。是一个连续时间线上的事件集合，通过 flag.act 区分幕次。

```js
const scenario_chernobyl = {
  id: 'chronicle_04',
  name: '1986.04.26 · 4号机组',
  initialState: { power: 3200, orm: 30, xenon: 0.2 },
  timeScale: 60,
  events: [
    ...act1_events,
    ...act2_events,
    ...act2b_events,
    ...act3_events,
    ...act4_events,
    ...act5_events,
    ...act6_events
  ],
  endConditions: [
    { type: 'meltdown' },
    { type: 'flag', key: 'act', value: 7 }
  ]
};
```

条件系统保证：同一时刻只有当前幕的事件活跃（通过 `condition: (s,f) => f.act === N`）。

---

## 9 · 玩家操作监听（分支判定）

ActionExecutor 需要监听玩家操作来判定分支：

```js
armBranch(branchConfig) {
  this.activeBranch = branchConfig;
  this.branchTimer = branchConfig.timeout;
}

onPlayerAction(action) {
  if (!this.activeBranch) return;
  const rule = this.activeBranch.rules.find(r => r.if === action);
  if (rule) {
    this.scenario.playerDecision(this.activeBranch.id, rule.choice);
    this.activeBranch = null;
  }
}

// 超时：
if (this.branchTimer <= 0 && this.activeBranch) {
  this.scenario.playerDecision(this.activeBranch.id, this.activeBranch.default);
  this.activeBranch = null;
}
```

### 监听的操作类型

| 玩家操作 | 对应 if 值 |
|----------|-----------|
| 按下 AZ-5 按钮 | 'az_pressed' |
| 拔出任何控制棒 | 'rod_withdrawn' |
| 关闭 САОР | 'saor_disabled' |
| 断开汽轮机 | 'turbine_disconnected' |
| 无操作（超时） | 'idle' |

---

## 10 · 与 FLOW-01 的衔接

| FLOW-01 终局类型 | 场景引擎触发方式 |
|------------------|-----------------|
| SCENARIO_END | 事件 type: 'endgame' 被消费 |
| MELTDOWN | 不由场景引擎触发；由 simulation 物理检测触发 |
| VOLUNTARY | 不由场景引擎触发；由玩家 F12/Esc 触发 |

场景引擎只负责 SCENARIO_END。其余两种终局绕过场景引擎直接调 App.endGame()。

---

## 11 · 实现顺序

| 步 | 任务 | 产出 |
|----|------|------|
| 1 | App.startGame() 中实例化 ScenarioEngine + ActionExecutor | 故事模式有引擎在跑 |
| 2 | 主循环 tick 中调用 engine.update() + executor.execute() | 事件能被消费 |
| 3 | 实现 log + flag + sim_override 三个最简动作 | 能改仿真状态、能写日志 |
| 4 | 填入第二幕事件数据（§7 骨架） | 氙坑能发生 |
| 5 | 实现 branch 动作 + 玩家操作监听 | 分支能判定 |
| 6 | 实现 phone + dialogue UI 浮层 | 电话和对话能显示 |
| 7 | 实现 endgame 动作 → 调 App.endGame() | 场景能结束 |
| 8 | 填入第一幕 + 第三至六幕事件数据 | 完整六幕 |

步 1-5 完成后，故事模式即可"有东西发生并且能走到分支"。

---

## 12 · 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-31 | 初版定稿。定义接入架构、事件格式、动作类型、分支判定、场景切换、实现顺序。 |
