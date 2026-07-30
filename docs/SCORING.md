# 评分系统 — Система Оценки

## 设计哲学

这不是街机。没有"SCORE: 99999"。

评分的 diegetic 形式：值班主任的班次报告（Сменный рапорт）。每个场景结束后，面板上的打印机吐出一张纸。上面是对你这次操作的"评价"。

核心原则：
- 不奖励速度。奖励正确。
- 不惩罚慢。惩罚错。
- 沉默是最好的评价。如果一切正常，报告上只写"Замечаний нет"（无异常）。
- 评分不是给玩家看的分数——是给"上级"看的报告。玩家是在被审视。这本身就是压力。

## 评分维度

不设单一总分。设 5 个独立维度，每个维度独立评级。

| 维度 | 俄语名 | 权重 | 评什么 |
|------|--------|------|--------|
| 规程遵守 | Соблюдение регламента | 30% | 是否按正确顺序操作 |
| 安全裕度 | Запас безопасности | 25% | 参数是否保持在安全范围内 |
| 响应速度 | Время реакции | 15% | 报警后多快采取正确行动 |
| 设备状态 | Состояние оборудования | 20% | 有没有损坏设备 / 触发保护 |
| 记录完整性 | Полнота записей | 10% | 剪贴板是否填写完整 |

### 为什么没有"总分"

因为现实中没有。值班主任不会给你打 87 分。他会说："规程遵守良好，但响应慢了，设备有两次不必要的保护触发。"这比一个数字更有信息量，也更让人不安。

## 各维度细则

### 规程遵守（Соблюдение регламента）

评估方法：将玩家的操作序列与"标准操作序列"对比。

#### 标准操作序列（以场景 1 为例）

1. 确认初始状态（检查灯阵）
2. 接到降功率指令
3. 按规程顺序降功率：
   - a. 先减棒（控制棒下插）
   - b. 再减泵（逐台停 ГЦН）
   - c. 监控氙浓度
4. 到达目标功率
5. 稳定
6. 记录

#### 评分规则

| 条件 | 扣分 |
|------|------|
| 顺序正确 | 满分 |
| 顺序错误但结果安全 | 扣 20% |
| 顺序错误且触发保护 | 扣 50% |
| 跳过关键步骤（如未检查氙就降功率） | 扣 80% |
| 完全无视规程（直接拉棒到底） | 0% |

#### 实现：操作日志对比

```js
// 每个场景定义 expectedSequence
const SCENARIO_1_EXPECTED = [
  { action: 'CHECK_LIGHTS',    required: true,  order: 1 },
  { action: 'RECEIVE_ORDER',   required: true,  order: 2 },
  { action: 'INSERT_RODS',     required: true,  order: 3 },
  { action: 'STOP_PUMPS',      required: true,  order: 4, maxCount: 4 },
  { action: 'MONITOR_XENON',   required: true,  order: 5, minDuration: 10 },
  { action: 'REACH_TARGET',    required: true,  order: 6 },
  { action: 'STABILIZE',       required: true,  order: 7, minDuration: 30 },
  { action: 'LOG_ENTRY',       required: false, order: 8 },
];

// 玩家操作记录
class OperationLog {
  constructor() {
    this.entries = [];
  }
  record(action, params = {}) {
    this.entries.push({ action, timestamp: Date.now(), params });
  }
}

// 对比
function evaluateProcedure(log, expected) {
  let score = 1.0;
  const playerActions = log.entries.map(e => e.action);

  for (const step of expected) {
    if (step.required && !playerActions.includes(step.action)) {
      score -= 0.8 / expected.filter(s => s.required).length;
    }
  }

  const indices = expected
    .filter(s => playerActions.includes(s.action))
    .map(s => playerActions.indexOf(s.action));
  if (!isSorted(indices)) {
    score -= 0.2;
  }

  return Math.max(0, score);
}
```

### 安全裕度（Запас безопасности）

评估方法：追踪关键参数在整个场景中的历史。

#### 关键参数与安全包络

| 参数 | 正常范围 | 警告范围 | 危险范围 |
|------|----------|----------|----------|
| 功率 | 0–3200 МВт | 3200–3600 | >3600 |
| 反应性 | -2β – +0.5β | +0.5β – +1β | >+1β |
| 温度 | 265–280°C | 280–300 | >300 |
| 氙 | 0–0.8 | 0.8–1.0 | >1.0（碘坑） |
| 周期 | >20s | 10–20s | <10s |

#### 评分公式

```
评分 = 1.0 - (在警告范围的时间占比 × 0.3) - (在危险范围的时间占比 × 1.0)
```

如果任何参数进入危险范围超过 5s → 该维度直接 0。

#### 实现：参数采样器

```js
class SafetyEnvelopeTracker {
  constructor(paramDefs) {
    this.defs = paramDefs;
    this.samples = [];
    this.sampleInterval = 500;
    this._timer = null;
  }

  start(getState) {
    this._timer = setInterval(() => {
      const state = getState();
      this.samples.push({ time: Date.now(), values: { ...state } });
    }, this.sampleInterval);
  }

  stop() {
    clearInterval(this._timer);
  }

  evaluate() {
    const total = this.samples.length;
    if (total === 0) return 1.0;

    let warnTicks = 0;
    let dangerTicks = 0;
    let dangerSustained = {};

    for (const sample of this.samples) {
      for (const def of this.defs) {
        const v = sample.values[def.name];
        if (v === undefined) continue;

        if (this._inRange(v, def.danger)) {
          dangerTicks++;
          dangerSustained[def.name] = (dangerSustained[def.name] || 0) + 1;
          if (dangerSustained[def.name] * this.sampleInterval > 5000) {
            return 0;
          }
        } else {
          dangerSustained[def.name] = 0;
          if (this._inRange(v, def.warn)) {
            warnTicks++;
          }
        }
      }
    }

    const warnRatio = warnTicks / (total * this.defs.length);
    const dangerRatio = dangerTicks / (total * this.defs.length);

    return Math.max(0, 1.0 - warnRatio * 0.3 - dangerRatio * 1.0);
  }

  _inRange(v, [min, max]) {
    return v >= min && v <= max;
  }
}
```

### 响应速度（Время реакции）

评估方法：从报警触发到玩家采取正确行动的时间。

注意：
- 不是"越快越好"。是"在合理时间内"。
- 过快（< 2s）不扣分，但也不加分。
- 过慢（> 30s）扣分。
- 完全无响应 → 0。

#### 评分规则

| 响应时间 | 得分 |
|----------|------|
| < 5s | 1.0 |
| 5–15s | 0.9 |
| 15–30s | 0.7 |
| 30–60s | 0.4 |
| > 60s | 0.1 |
| 无响应 | 0.0 |

维度得分 = 所有报警事件得分的平均值

特殊：如果报警是玩家自己造成的（如操作失误触发 П3），响应速度权重翻倍。

#### 实现

```js
class ResponseTracker {
  constructor() {
    this.events = [];
  }

  onAlarmTrigger(code, selfCaused = false) {
    this.events.push({
      code, triggerTime: Date.now(), responseTime: null, selfCaused
    });
  }

  onCorrectAction(code) {
    const event = this.events
      .filter(e => e.code === code && e.responseTime === null)
      .pop();
    if (event) {
      event.responseTime = Date.now();
    }
  }

  evaluate() {
    if (this.events.length === 0) return 1.0;

    let totalScore = 0;
    let totalWeight = 0;

    for (const e of this.events) {
      const weight = e.selfCaused ? 2 : 1;
      let score;

      if (e.responseTime === null) {
        score = 0;
      } else {
        const dt = (e.responseTime - e.triggerTime) / 1000;
        if (dt < 5)       score = 1.0;
        else if (dt < 15) score = 0.9;
        else if (dt < 30) score = 0.7;
        else if (dt < 60) score = 0.4;
        else              score = 0.1;
      }

      totalScore += score * weight;
      totalWeight += weight;
    }

    return totalScore / totalWeight;
  }
}
```

### 设备状态（Состояние оборудования）

评估方法：追踪设备损坏 / 不必要保护触发。

#### 扣分表

| 事件 | 扣分 |
|------|------|
| 不必要的保护触发（П1–П10） | -0.15 / 次 |
| 安全阀起跳 | -0.2 / 次 |
| 泵气蚀（持续 > 10s） | -0.1 / 次 |
| 燃料通道损坏 | -0.5 / 次 |
| AZ-5 触发（非紧急） | -0.3 |
| AZ-5 触发（紧急，正确决策） | 0 |
| 设备完全损坏 | -1.0（维度直接 0） |

维度得分 = max(0, 1.0 - 总扣分)

判断 AZ-5 是否"正确"：如果触发时功率 > 3600 或周期 < 5s → 正确（不扣分）；否则 → 不必要（扣分）。

#### 实现

```js
class EquipmentTracker {
  constructor() {
    this.penalties = 0;
    this.events = [];
  }

  record(type, params = {}) {
    const PENALTIES = {
      'PROTECTION_UNNECESSARY': 0.15,
      'SAFETY_VALVE': 0.2,
      'PUMP_CAVITATION': 0.1,
      'FUEL_CHANNEL_DAMAGE': 0.5,
      'AZ5_UNNECESSARY': 0.3,
      'AZ5_CORRECT': 0,
      'EQUIPMENT_DESTROYED': 1.0,
    };

    const penalty = PENALTIES[type] || 0;
    this.penalties += penalty;
    this.events.push({ type, penalty, time: Date.now(), params });

    if (type === 'EQUIPMENT_DESTROYED') {
      this.penalties = 1.0;
    }
  }

  evaluate() {
    return Math.max(0, 1.0 - this.penalties);
  }
}
```

### 记录完整性（Полнота записей）

评估方法：检查剪贴板上的必填项。

#### 场景必填项

场景 1：
- 初始功率
- 目标功率
- 停泵数量
- 最终氙浓度
- 班次时间

场景 2：
- 试验开始时间
- 试验结束时间
- 惰转时间
- 泵状态

场景 3：
- AZ-5 触发时间
- 最终功率读数
- 辐射水平

#### 评分规则

```
维度得分 = 已填项数 / 必填项数
```

注意：
- 不检查数值是否正确（那是规程遵守的事）。
- 只检查"有没有写"。
- 写了但写错了 → 不扣分（这个维度只管完整性）。
- 这是最低权重维度。因为现实中很多人也不写。但不写的人会被值班主任骂。

#### 实现

```js
class LogCompleteness {
  constructor(requiredFields) {
    this.required = requiredFields;
    this.filled = new Set();
  }

  onFieldWritten(fieldId) {
    this.filled.add(fieldId);
  }

  evaluate() {
    if (this.required.length === 0) return 1.0;
    const filledCount = this.required.filter(f => this.filled.has(f)).length;
    return filledCount / this.required.length;
  }
}
```

## 评级映射

每个维度的 0–1 分数映射到苏联式评级：

| 分数范围 | 评级（俄语） | 评级（中文） | 含义 |
|----------|--------------|--------------|------|
| 0.95–1.00 | Отлично | 优秀 | 无懈可击 |
| 0.80–0.94 | Хорошо | 良好 | 有小瑕疵 |
| 0.60–0.79 | Удовлетворительно | 合格 | 勉强通过 |
| 0.40–0.59 | Неудовлетворительно | 不合格 | 需要谈话 |
| 0.00–0.39 | Аварийная ситуация | 事故状态 | 你被开除了 |

注意：
- 没有"完美"。0.95 以上就是 Отлично。因为真实操作中永远有小瑕疵。
- "不合格"不是游戏结束。是值班主任会找你谈话。谈话内容 = 叙事层的一部分。

## 报告生成

### 报告格式

场景结束后，打印机吐出：

```
┌─────────────────────────────────────────────────────┐
│  ЧЕРНОБЫЛЬСКАЯ АЭС им. В.И. Ленина                 │
│  Блок №4                                            │
│                                                     │
│  СМЕННЫЙ РАПОРТ                                     │
│  Дата: 26.04.1986    Смена: 3                       │
│  Оператор: [玩家名/默认"Оператор БЩУ"]              │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Соблюдение регламента .... Хорошо                  │
│  Запас безопасности ....... Отлично                 │
│  Время реакции ............ Удовлетворительно       │
│  Состояние оборудования ... Хорошо                  │
│  Полнота записей .......... Неудовлетворительно     │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ЗАМЕЧАНИЯ:                                         │
│  · 停泵顺序与规程不符（先停了 7 号泵，应先停 6 号） │
│  · П4 报警响应时间 42 秒，超出标准                   │
│  · 剪贴板未记录最终氙浓度                            │
│                                                     │
│  Начальник смены: _______________                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 评语生成规则

```js
function generateRemarks(scores, trackers) {
  const remarks = [];

  if (scores.procedure < 0.8) {
    const orderErrors = trackers.procedure.getOrderErrors();
    for (const err of orderErrors) {
      remarks.push('操作顺序错误：' + err.description);
    }
  }

  if (scores.safety < 0.8) {
    const violations = trackers.safety.getWorstViolations(3);
    for (const v of violations) {
      remarks.push(v.paramName + ' 超出正常范围 ' + v.duration + 's');
    }
  }

  if (scores.response < 0.8) {
    const slowResponses = trackers.response.getSlowResponses(30);
    for (const r of slowResponses) {
      remarks.push(r.code + ' 报警响应时间 ' + r.seconds + 'с，超出标准');
    }
  }

  if (scores.equipment < 0.9) {
    for (const e of trackers.equipment.events) {
      remarks.push(EQUIPMENT_REMARK_TEXT[e.type]);
    }
  }

  if (scores.completeness < 1.0) {
    const missing = trackers.completeness.getMissing();
    for (const m of missing) {
      remarks.push('未记录：' + FIELD_NAMES[m]);
    }
  }

  if (remarks.length === 0) {
    remarks.push('Замечаний нет.');
  }

  return remarks;
}
```

### 报告呈现

- 报告以动画形式"打印"出来（逐行出现，配合 playPrint 音效）。
- 玩家可以保留报告（存入"档案"——见存档系统）。
- 报告不消失。它留在面板上，直到下一个场景开始。
- 没有"重试"按钮。报告就是结果。你可以重新开始场景，但旧报告留在档案里。

## 场景特殊评分

### 场景 3（事故场景）

场景 3 有两种结局，评分逻辑完全不同：

**结局 A：事故未能阻止（历史结局）**
- 所有维度 = 0
- 报告不打印。
- 打印机沉默。
- 只有盖革计数器的声音。
- 这比任何差评都可怕。

**结局 B：事故被阻止（架空结局）**
- 正常评分。
- 但额外维度："Авария предотвращена"（事故已阻止）
- 这一行单独印在报告最上方。不加评级。只是一句陈述。这本身就是最高评价。

### 隐藏评价

不显示给玩家，但记录在存档中：

- **"碘坑深度"**：你降功率时氙浓度到了多少？如果 < 0.5 → 说明你降得很稳。如果 > 0.9 → 你差点掉进碘坑。
- **"不必要的操作数"**：你按了多少个实际上不需要的按钮？新手会乱按。这记录下来了。
- **"犹豫时间"**：报警后你有多久没动？不是"响应速度"（那是从报警到正确行动）。这是"你愣了多久"。

这些数据不在报告上显示。但如果玩家查看"详细档案"，可以看到。

## 跨场景评价（战役模式）

如果玩家连续完成所有场景（战役模式），最终报告不是单个场景的，而是整个"班次"的：

```
┌─────────────────────────────────────────────────────┐
│  ИТОГОВЫЙ РАПОРТ ЗА СМЕНУ                          │
│                                                     │
│  Сценарий 1: Снижение мощности .... Хорошо          │
│  Сценарий 2: Испытание выбега ..... Удовл.          │
│  Сценарий 3: Авария ............... Отлично          │
│                                                     │
│  Общая оценка смены: Хорошо                         │
│                                                     │
│  Рекомендация: Допустить к самостоятельной          │
│  работе на БЩУ.                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

如果场景 3 失败：没有 итоговый рапорт。没有推荐。只有空白。

## 数据结构

```ts
interface ScenarioScore {
  scenarioId: string;
  timestamp: number;
  dimensions: {
    procedure: number;
    safety: number;
    response: number;
    equipment: number;
    completeness: number;
  };
  ratings: {
    procedure: Rating;
    safety: Rating;
    response: Rating;
    equipment: Rating;
    completeness: Rating;
  };
  remarks: string[];
  hidden: {
    iodinePitDepth: number;
    unnecessaryActions: number;
    hesitationTime: number;
  };
  outcome: 'normal' | 'accident_prevented' | 'accident';
}

type Rating = 'отлично' | 'хорошо' | 'удовлетворительно' | 'неудовлетворительно' | 'аварийная';
```

## 与存档系统的接口

评分结果写入存档：

```
save.scenarios[scenarioId] = ScenarioScore;
```

战役模式额外字段：

```
save.campaign = {
  completed: boolean;
  scenarioScores: ScenarioScore[];
  overallRating: Rating | null;
  recommendation: string | null;
};
```

## 验收标准

| # | 测试 | 通过条件 |
|---|------|----------|
| 1 | 完美操作（场景 1） | 所有维度 ≥ 0.95，评语"Замечаний нет" |
| 2 | 顺序错误 | 规程维度扣分，评语指出具体错误 |
| 3 | 参数超限 3s | 安全维度扣分，但不归零 |
| 4 | 参数超限 6s | 安全维度 = 0 |
| 5 | 报警后 45s 才响应 | 响应维度得分 0.4 |
| 6 | 无报警的场景 | 响应维度 = 1.0 |
| 7 | 不填剪贴板 | 完整性 = 0，其他维度不受影响 |
| 8 | 事故结局 | 无报告打印，所有维度 = 0 |
| 9 | 事故阻止 | 报告顶部有"Авария предотвращена" |
| 10 | 报告打印动画 | 逐行出现，配合音效，总时长 < 5s |
| 11 | 重复游玩 | 新报告覆盖旧报告，旧报告存入档案 |
| 12 | 战役总结 | 三个场景都完成后出现 итоговый рапорт |

## 不做的事

- 不做排行榜。这不是竞技游戏。
- 不做成就系统。"Ачивка：触发 AZ-5！"是对主题的侮辱。
- 不做星级评价（⭐⭐⭐）。苏联不用星星。用文字评级。
- 不做"重玩提示"（"再试一次获得更好成绩！"）。报告打完就完了。你要重玩是你自己的事。
- 不做在线比较。没有服务器。
