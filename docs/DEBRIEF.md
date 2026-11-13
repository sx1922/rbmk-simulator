# ЩИТ-DOC-DEBRIEF-01 · 结算画面与评分规格书

| 字段 | 值 |
|------|-----|
| 文档编号 | ЩИТ-DOC-DEBRIEF-01 |
| 对应版本 | v0.2.0 «Коридор» |
| 状态 | 已定稿 |
| 定稿时间 | 2026-07-31 00:33 CST |
| 前置文档 | ЩИТ-DOC-FLOW-01（生命周期）、ЩИТ-DOC-SCEN-01（场景引擎） |

---

## 1 · 范围

ENDING → DEBRIEF 过渡完成后，玩家看到的结算画面。以及背后的评分算法。

评分沿用现有 5 维度系统（`lib/scoring.js`）：规程遵守、安全裕度、响应速度、设备状态、记录完整性。各维度独立评级。

历史匹配度作为故事模式的附加指标，叠加在 5 维度评分之上。

---

## 2 · 结算画面布局

### 2.1 通用结构

复用主菜单双栏逻辑（MENU-01 §2）。左栏 = 数据 + 评分，右栏 = 评语。

```
┌─●──────────────────────────────────────────────────────────●─┐
│  СМЕНА ЗАВЕРШЕНА / 值班结束                    [终局类型灯]  │
├────────────────────────────┬─────────────────────────────────┤
│                            │                                 │
│  运行时长    04:23:17      │                                 │
│  终局类型    安全停堆       │  （右栏内容因模式而异，         │
│  最终功率    0 MW          │    见 §2.2-2.4）                │
│  ORM         22 根         │                                 │
│  操作次数    47            │                                 │
│                            │                                 │
│  ─── 评分 ───              │                                 │
│  规程遵守    良好          │                                 │
│  安全裕度    合格          │                                 │
│  响应速度    优秀          │                                 │
│  设备状态    良好          │                                 │
│  记录完整性  合格          │                                 │
│                            │                                 │
│  ─── 关键决策 ──           │                                 │
│  00:32  继续/停堆 → 继续  │                                 │
│  01:03  САОР → 服从       │                                 │
│                            │                                 │
├────────────────────────────┴─────────────────────────────────┤
│  ⏎ 返回菜单             历史匹配度: 95% (仅故事模式)        │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 自由操作（СМЕНА）右栏

一句话评语。根据终局类型：

| 终局类型 | 评语 |
|----------|------|
| VOLUNTARY（正常停堆） | "你做了正确的事。没有人感谢你。" |
| VOLUNTARY（中途退出） | "控制台还温着。下一班会接手。" |
| MELTDOWN | "四号机组不再存在。" |

无关键决策列表（自由模式无剧本分支）。

### 2.3 历史重演（ХРОНИКА）右栏

尾声文本 + 历史匹配度。

```
│                                 │
│  历史匹配度: 95%                │
│                                 │
│  "01:23:45，你按下了 АЗ-5。     │
│   和 Топтунов 一样。            │
│   和规程一样。                  │
│   和所有人一样。                │
│                                 │
│   功率没有降下来。              │
│   它开始上升。"                 │
│                                 │
│  [!] 你看到了第 47 页。         │
│      但你还是按了。             │
│                                 │
```

尾声文本逐行淡入（每行间隔 800ms）。

### 2.4 挑战模式（ВЫЗОВ）右栏

得分 + 达标状态 + 本地排名。

```
│                                 │
│  得分: 7,840                    │
│  目标: 稳定运行 120s            │
│  状态: ✓ 达标                   │
│                                 │
│  本地排名:                      │
│  1. 9,200  2026-07-28          │
│  2. 8,100  2026-07-29          │
│  3. 7,840  今天 ← 你           │
│                                 │
```

---

## 3 · 评分算法

### 3.1 通用评分（所有模式）

沿用 `lib/scoring.js` 的 5 维度系统：

| 维度 | 俄语名 | 权重 | 评什么 |
|------|--------|------|--------|
| 规程遵守 | Соблюдение регламента | 30% | 是否按正确顺序操作 |
| 安全裕度 | Запас безопасности | 25% | 参数是否保持在安全范围内 |
| 响应速度 | Время реакции | 15% | 报警后多快采取正确行动 |
| 设备状态 | Состояние оборудования | 20% | 有没有损坏设备 / 触发保护 |
| 记录完整性 | Полнота записей | 10% | 剪贴板是否填写完整 |

各维度独立评级（优秀/良好/合格/不合格/事故状态），不设总分。

调用 `Scoring.evaluate()` 生成 `ScoreReport`，包含各维度分数 + 评语。

### 3.2 历史匹配度（故事模式附加）

在 5 维度评分之上，故事模式额外计算"历史匹配度"，作为独立百分比显示在底栏。

**基础分（100 分制）**

| 事件 | 历史选择 | 玩家选择 | 得分 |
|------|----------|----------|------|
| 氙坑后继续/停堆 | 继续 | 继续 | +20 |
| | | 停堆 | +10（合理但非历史） |
| САОР 断开 | 服从 | 服从 | +15 |
| | | 拒绝 | +5（正确但非历史） |
| AZ-5 按下 | 执行 | 执行 | +20 |
| | | 不按 | +0 |
| 发现规程线索 | — | 发现 | +10（额外） |
| 最终结果匹配 | 爆炸 | 爆炸 | +25 |
| | | 安全停堆 | +15 |

**决策权重**

每个分支点有权重（重要决策权重高）：

```js
const weights = {
  'xenon_pit': 1.5,
  'saor_disable': 1.0,
  'az5_press': 2.0,
  'page47_found': 0.5
};
```

**时间权重**

玩家在关键决策点的犹豫时间影响权重：

| 犹豫时间 | 权重修正 |
|----------|----------|
| < 10s | ×1.0（果断） |
| 10-60s | ×0.9 |
| 60-180s | ×0.8（犹豫） |
| 超时 | ×0.7 |

**修正**

| 条件 | 修正 |
|------|------|
| 发现第 47 页但仍按 AZ-5 | 额外 +5（"你知道了，但你还是做了"） |
| 全程未接任何电话 | -5 |
| 主动停堆（非历史线） | 匹配度上限 60%（你改变了历史） |

**最终公式**

```js
function calcMatchScore(decisions, flags, duration) {
  let base = 0;
  for (const d of decisions) {
    base += scoreTable[d.id][d.choice];
  }
  const weightAvg = average(decisions.map(d => weights[d.id]));
  const timeFactor = calcTimeFactor(decisions);
  let score = base * weightAvg * timeFactor;

  if (flags.discovered_page_47 && flags.az5_pressed) score += 5;
  if (flags.all_phones_missed) score -= 5;
  if (flags.voluntary_shutdown) score = Math.min(score, 60);

  return Math.round(clamp(score, 0, 100));
}
```

### 3.3 挑战模式评分

得分 = 时间分 + 稳定分 + 操作效率分 - 惩罚

| 分项 | 计算 |
|------|------|
| 时间分 | 存活秒数 × 10 |
| 稳定分 | 功率在目标范围内的秒数 × 5 |
| 操作效率分 | (最优操作数 / 实际操作数) × 1000 |
| 惩罚：警报 | 每次警报 -50 |
| 惩罚：超量程 | 每次 -200 |
| 惩罚：熔毁 | 直接 0 分 |

---

## 4 · 存档写入

### 4.1 时机

DEBRIEF 画面渲染前，App.endGame() 内部调用：

```js
async endGame(type, payload) {
  this.state = 'ENDING';
  this.simulation.stop();
  this.scenario?.stop();

  await this.ui.playEnding(type);

  // 评分（沿用现有 scoring.js 5 维度系统）
  const report = Scoring.evaluate({
    mode: this.mode,
    endType: type,
    duration: this.elapsed,
    finalState: this.simulation.getState(),
    decisions: this.scenario?.getDecisions() || [],
    flags: this.scenario?.getFlags() || {}
  });

  // 历史匹配度（故事模式附加）
  const matchScore = (this.mode === 'story')
    ? calcMatchScore(this.scenario?.getDecisions() || [], this.scenario?.getFlags() || {}, this.elapsed)
    : null;

  // 存档（沿用现有 save.js 格式，追加 entry）
  Save.recordShiftEnd({
    scenarioId: this.scenarioId || 'free_play',
    outcome: type === 'MELTDOWN' ? 'accident' : 'completed',
    duration: this.elapsed,
    data: {
      dimensions: report.dimensions,
      matchScore: matchScore,
      decisions: this.scenario?.getDecisions() || [],
      flags: this.scenario?.getFlags() || {}
    }
  });

  // 渲染结算
  this.state = 'DEBRIEF';
  this.ui.showDebrief(report, matchScore);
}
```

### 4.2 存储格式（沿用 `lib/save.js`）

localStorage key 统一为 `'rbmk_journal'`（`save.js` 已使用此键）。

Entry 格式扩展 `decisions` 和 `flags` 字段：

```json
{
  "version": 1,
  "created": 1753893240000,
  "lastModified": 1753893240000,
  "operator": {
    "callsign": "Оператор БЩУ",
    "shiftCount": 12,
    "firstShift": 1753893240000,
    "lastShift": 1753893240000
  },
  "settings": { "...": "..." },
  "entries": [
    {
      "scenarioId": "chronicle_04",
      "outcome": "completed",
      "duration": 15797000,
      "data": {
        "dimensions": {
          "procedure": 0.85,
          "safety": 0.70,
          "response": 0.95,
          "equipment": 0.80,
          "records": 0.60
        },
        "matchScore": 95,
        "decisions": [
          { "id": "xenon_pit", "choice": "continue", "timestamp": 83700000 },
          { "id": "saor_disable", "choice": "obey", "timestamp": 84660000 }
        ],
        "flags": {
          "discovered_page_47": true,
          "az5_pressed": true
        }
      }
    }
  ],
  "campaign": { "...": "..." },
  "statistics": {
    "totalShifts": 12,
    "totalPlayTime": 189560400,
    "scenariosCompleted": { "scenario_1": 5, "scenario_2": 4, "scenario_3": 3, "chronicle_04": 2 },
    "accidentsPrevented": 7,
    "accidents": 3,
    "bestScores": { "scenario_1": { "procedure": 0.95 }, "scenario_2": null, "scenario_3": null },
    "totalAlarmsTriggered": 23,
    "totalAZ5Presses": 2,
    "totalPumpsStopped": 8,
    "totalRodsMoved": 147
  }
}
```

### 4.3 键名统一

| 旧键名（废弃） | 新键名 |
|----------------|--------|
| `rbmk_save` | `rbmk_journal` |

`menu.js` 中所有引用 `rbmk_save` 的代码改为 `rbmk_journal`。

---

## 5 · DEBRIEF → MENU 返回

| 按键 | 行为 |
|------|------|
| ⏎ / Esc | App.setState('MENU') → 主菜单重新渲染 |

返回后主菜单状态：
- 焦点回到「开始游戏」大按钮
- 右栏回到待命暗屏
- 顶栏时钟继续走（真实时间）
- 底栏版本号不变

---

## 6 · 实现顺序

| 步 | 任务 | 依赖 |
|----|------|------|
| 1 | App.endGame() 骨架（停 tick → 过渡 → 渲染最简结算） | FLOW-01 步 0 |
| 2 | 最简 DEBRIEF UI（终局类型 + 时长 + ⏎ 返回） | 步 1 |
| 3 | DEBRIEF → MENU 返回逻辑 | 步 2 |
| 4 | 接 scoring.js（自由模式记录 + 挑战模式分数） | 步 1 |
| 5 | 接 save.js（统一键名 + 写入 journal） | 步 4 |
| 6 | 历史匹配度算法 | SCEN-01 步 5（分支判定） |
| 7 | DEBRIEF 完整版（决策列表 + 尾声 + 匹配度） | 步 6 |
| 8 | 本地排名（挑战模式） | 步 4 |

步 1-3 完成后游戏闭环。步 4-5 完成后有持久化。步 6-7 完成后叙事有回响。

---

## 7 · 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-31 | 初版定稿。定义结算布局、三模式评分算法（5 维度通用 + 历史匹配度附加）、存档格式（扩展现有 save.js）、返回逻辑。 |
