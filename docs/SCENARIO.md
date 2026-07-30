# 场景脚本结构 — Структура Сценариев

## 设计哲学

场景不是"关卡"。场景是"值班"。

- 没有"开始游戏"按钮。你坐下来，面板亮了，你已经在值班了。
- 没有"任务目标"弹窗。你的任务在规程手册里。在电话里。在值班主任的嘴里。
- 没有"失败画面"。失败了就是失败了。爆炸了就是爆炸了。
- 没有"重玩"按钮。有。但它叫"重新值班"。

三个场景：
- 场景 1：降功率（教学）
- 场景 2：涡轮惰转试验（操作）
- 场景 3：事故（生存）

它们不是"难度递增"。它们是"同一天"。场景 1 是 4 月 25 日白班。场景 2 是 4 月 25 日夜班到 4 月 26 日凌晨。场景 3 是 4 月 26 日 01:23。

玩家可以单独玩任何一个。但按顺序玩，体验的是完整的一天。

## 事件系统架构

### 事件定义

```ts
interface ScenarioEvent {
  id: string;
  name: string;
  trigger: TriggerCondition;
  actions: EventAction[];
  oneShot: boolean;
  priority: number;
  tags: string[];
}

type TriggerCondition =
  | { type: 'time'; simTime: number }
  | { type: 'state'; check: (s: ReactorState) => boolean }
  | { type: 'player_action'; action: string }
  | { type: 'event_fired'; eventId: string; delay?: number }
  | { type: 'compound'; conditions: TriggerCondition[]; op: 'AND' | 'OR' };

type EventAction =
  | { type: 'dialogue'; speaker: string; lines: DialogueLine[] }
  | { type: 'alarm'; alarmId: string; level: 'warning' | 'danger' }
  | { type: 'alarm_clear'; alarmId: string }
  | { type: 'phone_call'; from: string; script: PhoneScript }
  | { type: 'sim_override'; override: Partial<ReactorState> }
  | { type: 'sim_lock'; param: string; locked: boolean }
  | { type: 'protection_disable'; param: string }
  | { type: 'screen_shake'; intensity: number; duration: number }
  | { type: 'sound'; soundId: string }
  | { type: 'light'; lightId: string; state: 'on' | 'off' | 'blink' }
  | { type: 'wait'; seconds: number }
  | { type: 'script'; fn: string }
  | { type: 'end'; result: 'success' | 'failure'; reason: string };
```

### 对话行

```ts
interface DialogueLine {
  speaker: string;
  text_ru: string;
  text_zh: string;
  delay: number;
  typing: boolean;
}
```

### 电话脚本

```ts
interface PhoneScript {
  from: string;
  greeting: DialogueLine[];
  options: PhoneOption[];
  endCondition: TriggerCondition;
}

interface PhoneOption {
  text_ru: string;
  text_zh: string;
  response: DialogueLine[];
  setsTag?: string;
  nextOptions?: PhoneOption[];
}
```

### 事件引擎

```js
class ScenarioEngine {
  private events: ScenarioEvent[] = [];
  private firedEvents: Set<string> = new Set();
  private pendingActions: { time: number; action: EventAction }[] = [];
  private tags: Set<string> = new Set();

  constructor(events: ScenarioEvent[]) {
    this.events = events.sort((a, b) => a.priority - b.priority);
  }

  update(state: ReactorState, simTime: number) {
    this.processPendingActions(simTime);
    for (const event of this.events) {
      if (event.oneShot && this.firedEvents.has(event.id)) continue;
      if (this.checkTrigger(event.trigger, state, simTime)) {
        this.fireEvent(event, simTime);
      }
    }
  }

  private checkTrigger(trigger: TriggerCondition, state: ReactorState, simTime: number): boolean {
    switch (trigger.type) {
      case 'time': return simTime >= trigger.simTime;
      case 'state': return trigger.check(state);
      case 'player_action': return this.lastPlayerAction === trigger.action;
      case 'event_fired':
        if (!this.firedEvents.has(trigger.eventId)) return false;
        if (trigger.delay) {
          return simTime >= this.firedTimes.get(trigger.eventId)! + trigger.delay;
        }
        return true;
      case 'compound':
        if (trigger.op === 'AND') {
          return trigger.conditions.every(c => this.checkTrigger(c, state, simTime));
        } else {
          return trigger.conditions.some(c => this.checkTrigger(c, state, simTime));
        }
    }
  }

  private fireEvent(event: ScenarioEvent, simTime: number) {
    this.firedEvents.add(event.id);
    this.firedTimes.set(event.id, simTime);
    for (const tag of event.tags) this.tags.add(tag);

    let accumulatedDelay = 0;
    for (const action of event.actions) {
      if (action.type === 'wait') {
        accumulatedDelay += action.seconds;
      } else {
        this.pendingActions.push({
          time: simTime + accumulatedDelay, action,
        });
      }
    }
  }

  notifyPlayerAction(action: string) {
    this.lastPlayerAction = action;
  }

  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }
}
```

## 场景 1：降功率

### 概述

- **时间**：1986-04-25 08:00（白班开始）
- **角色**：СИУР（高级反应堆控制工程师）— 玩家
- **背景**：机组满功率运行（3200 MW）。值班主任通知：电网调度要求降功率到 1600 MW（50%），为夜间检修做准备。这是一个"正常操作"。但"正常操作"有 47 步。每一步都有规程。每一步都可能出错。
- **教学目标**：学会操作控制棒/ГЦН 泵/仪表的读写/电话使用/记录板填写/手册查阅；理解氙和 OBR 的基本概念
- **时长**：真实 ~15 分钟（×5 加速），模拟 ~4 小时（08:00–12:00）

### 初始条件

100% 功率，平衡态，6 泵运行，OBR ≈ 42（详见 `REACTOR_SIM.md §10.1`）

### 事件时间线（核心事件）

| 事件 | 触发 | 内容 |
|------|------|------|
| s1_intro | t=0 | "交接班完毕。机组满功率运行。" |
| s1_phone_ns | t=30s | 值班主任来电：降功率到 1600 MW。玩家可选回应。 |
| s1_hint_manual | 接电话后 5s | 提示打开手册 4.2 节（辅助） |
| s1_report_2800 | 功率 ≤ 2800 MW | 提示电话汇报 |
| s1_xenon_warning | Xe > 1.3 且功率 < 80% | 氙积累警告 |
| s1_obr_warning | OBR < 30 | OBR 低下限警告 |
| s1_pump_hint | 功率 ≤ 2400 MW | 提示停泵（每环路保留 2 台） |
| s1_target_reached | 功率 1550–1650 MW 且周期稳定 | 目标达成，提示汇报及填写记录 |
| s1_final_report | 目标达成 + 玩家致电 НС | 最终汇报，值班主任确认 |
| s1_end | 最终汇报 + 记录完成 | 白班结束。"你回家了。" |

### 胜利条件

- 功率稳定在 1550–1650 MW
- 周期 > 100s（接近稳态）
- 已电话汇报 + 填写记录板
- OBR ≥ 26
- 无事故

### 失败条件

- 氙中毒（Xe > 3.0 且功率 < 30%）
- 功率超限（> 3840 MW）
- 燃料温度超限（> 1200°C）
- OBR < 10 持续超过 5 分钟（模拟时间）

### 评分要点

- 降功率速率是否合规（≤ 30 MW/min）
- 停泵顺序是否正确
- 汇报是否及时
- 记录板是否完整
- OBR 最低值

## 场景 2：涡轮惰转试验

### 概述

- **时间**：1986-04-25 23:10 → 1986-04-26 01:00
- **角色**：СИУР — 玩家，值班主任 Акимов
- **背景**：功率已从 1600 MW 降到 760 MW。任务：执行涡轮惰转试验，验证涡轮机在失去蒸汽供应后惰转产生的电力是否足够驱动 ГЦН 泵直到柴油发电机启动（~15s）。这是一个"计划性试验"。但它需要切除部分保护。它需要在低功率下进行。它需要精确的操作顺序。
- **教学目标**：理解涡轮-发电机-泵的关系；学会保护投/切（铅封开关）；与涡轮车间协调；理解切除保护的风险和低功率保护失效的含义
- **时长**：真实 ~20 分钟，模拟 ~2 小时

### 初始条件

760 MW，6 泵运行，OBR ≈ 35，САОР 在役

### 事件时间线（核心事件）

| 事件 | 触发 | 内容 |
|------|------|------|
| s2_intro | t=0 | "夜班。功率 760。准备惰转试验。" |
| s2_akimov_briefing | t=20s | Акимов 简报：降到 700→切 САОР→关涡轮阀→测惰转 |
| s2_ask_why | 玩家提问 | Акимов 解释 САОР 可能误动作 |
| s2_step1_target | 功率 ≤ 720 MW | 步骤 1 完成，提示切 САОР |
| s2_step2_saor | 玩家操作切除 САОР | САОР 已切除，铅封已破 |
| s2_step3_tc | 玩家电话联系 ТЦ | 涡轮车间就绪，等待命令关阀 |
| s2_rundown_start | 电话后 5s | 涡轮主汽阀关闭，惰转开始（提示观察泵电流） |
| s2_pump_coastdown | 惰转后 8s | 泵流量下降，柴油发电机应在 15s 内启动 |
| s2_diesel_start | 惰转后 15s | 柴油发电机启动，泵恢复供电 |
| s2_success | 柴油启动 + 流量恢复 | 试验成功，提示恢复 САОР |
| s2_restore_saor | 玩家操作恢复 | САОР 已恢复 |
| s2_end | 恢复后 20s + 记录完成 | 继续降功率。"凌晨 1 点。功率 200。OBR = 8。" |

### 胜利条件

- 功率降到 700 MW
- САОР 切除 → 惰转 → 柴油启动 → 泵恢复 → САОР 恢复
- 全程无事故
- 记录板已填

### 失败条件

- 柴油发电机 25s 内未启动
- 泵流量 < 5000 m³/h 持续 > 10s
- 功率超限
- 未切除 САОР 就开始惰转（САОР 误动作 → 紧急停堆）

## 场景 3：事故

### 概述

- **时间**：1986-04-26 01:03:00 → 01:23:47
- **角色**：СИУР — 玩家
- **背景**：功率 200 MW。OBR = 8。8 台泵全开。САОР 已切除。氙在积累。棒大部分提出。值班主任 Акимов/Дятлов 决定做一次"额外的"功率提升试验。这是游戏的核心道德选择：执行命令 → 走向事故；拒绝命令 → 被解除职务；执行但偷偷留裕度 → 可能成功，可能失败。没有"正确答案"。只有后果。
- **时长**：真实 ~25 分钟（事故模式强制 ×1）

### 初始条件

200 MW, OBR=8, 8 泵, САОР 切除（详见 `REACTOR_SIM.md §10.2`）

### 事件时间线（核心事件）

| 事件 | 触发 | 内容 |
|------|------|------|
| s3_intro | t=0 | "01:03。功率 200 MW。OBR = 8。" |
| s3_dyatlov_order | t=30s | Дятлов 命令："升到 700，然后开始惰转。" |
| s3_choice_obey | 玩家"服从" | "是。升到 700。" |
| s3_choice_question | 玩家"质疑" | 指出 OBR=8 低于规程 26。Дятлов 驳回。 |
| s3_choice_refuse | 玩家"拒绝" | 被解除职务，进入旁观模式（AI 操作） |
| s3_raise_power | 服从 + 功率 ≥ 650 MW | "功率 700。OBR 降到 6。" |
| s3_test_start | 玩家开始惰转试验 | 电话联系 ТЦ，关阀 |
| s3_valve_close | 试验后 5s | 01:23:04。涡轮主汽阀关闭。 |
| s3_power_rise | 功率 > 250 MW 且空泡 > 5% | 正反馈开始。"功率上升。250...300..." |
| s3_operator_compensate | 功率上升后 5s | Акимов："快，插棒！" |
| s3_az5_moment | 功率上升后 30s | Акимов："АЗ-5！按 АЗ-5！" 玩家有 ~5s 时间 |
| s3_player_az5 | 玩家按 AZ-5 | 所有棒开始插入。18s 全行程。 |
| s3_ai_az5 | 玩家没按则 5s 后 | Акимов 按下 AZ-5 |
| s3_tip_effect | AZ-5 后 2s | 末端效应。石墨进入堆芯。+1β 正反应性脉冲。 |
| s3_prompt_critical | ρ > β 且 n > 50% | 超瞬发临界。周期 < 1s。 |
| s3_power_excursion | 功率 > 10000 MW | 10,000...20,000...30,000 MW。燃料温度超限。 |
| s3_explosion | 功率 > 30000 MW 或 T 燃料 > 2000°C | 01:23:47。两次爆炸。 |
| s3_aftermath_akimov | 爆炸后 10s | "反应堆还在吗？" |
| s3_end_accident | 爆炸后 25s | 结局文字 |
| s3_end_refused | 爆炸 + 已拒绝 | 不同的结局文字："你说了不。" |

### 结局体系

| 结局 | 条件 | 类型 | 评分 |
|------|------|------|------|
| A 服从→爆炸 | 服从命令，正常操作 | failure | 基于响应速度/补偿尝试 |
| B 拒绝→爆炸 | 拒绝命令，旁观模式 | failure | 基于质疑方式/记录/是否尝试联系上级 |
| C 服从但留裕度 | OBR > 15，未切额外保护，立即 AZ-5 | failure（小） | 最高 |
| D 提前 AZ-5 | 在 200 MW 时直接按 AZ-5 | success | 特殊："抗命罪"但"活着的罪" |

### 旁观模式

玩家拒绝命令后进入旁观模式：面板仍可见，所有控件灰色不可操作，AI（Акимов）自动执行真实事故序列。屏幕底部显示"你已被解除操作权限"。

## 辅助系统（默认开）

辅助不是"提示"。辅助是"值班主任的指示"。形式：屏幕底部一行小字（白色 12px 半透明），出现 5 秒后淡出，不重复。可关闭。

| 提示 | 条件 | 文字 |
|------|------|------|
| 打开手册 | 确认命令后，未打开手册 | "打开手册，翻到 4.2 节。" |
| 检查氙 | Xe > 1.2 且功率 < 90% | "氙浓度上升。检查手册 4.2.2。" |
| 停泵 | 功率 < 2400 MW 且运行泵 > 4 台 | "功率低于 2400。应停泵。" |
| 汇报 | 目标达成后未汇报 | "打电话汇报值班主任。" |
| 填记录 | 汇报后未填记录板 | "填写记录板。" |
| OBR 警告 | OBR < 30 | "OBR 低于 30。停止提棒。" |

辅助关闭后：无提示。只有面板、仪表、手册、电话。玩家必须自己读规程。这是"真实模式"。

## 场景间连接

### 连续游玩（1 → 2 → 3）

- 场景 1 结束 → 显示"白班结束" → [继续] → 场景 2（状态继承）
- 场景 2 结束 → 显示"凌晨 1 点" → [继续] → 场景 3（状态继承）
- 状态继承意味着：场景 1 中 OBR 低会导致场景 2 更难，氙高会导致场景 2 降功率更困难

### 单独游玩

- 直接选场景 3：使用固定初始条件，开场补充背景文字

## 场景配置格式

```ts
interface ScenarioConfig {
  id: string;
  version: number;
  name_ru: string;
  name_zh: string;
  description_zh: string;
  startClock: string;
  startDate: string;
  initialState: string;
  events: ScenarioEvent[];
  hints: AuxiliaryHint[];
  scoring: ScoringConfig;
  endings: EndingConfig[];
}
```

## 验收标准

| # | 测试 | 通过条件 |
|---|------|----------|
| 1 | 场景 1 完整流程 | 降功率→汇报→记录→结束，~15min |
| 2 | 场景 1 氙中毒 | 降太快 → 氙警告 → 失败 |
| 3 | 场景 2 完整流程 | 降功率→切САОР→惰转→柴油→恢复→结束 |
| 4 | 场景 2 柴油失败 | 泵流量过低 → 失败 |
| 5 | 场景 3 服从路线 | 升功率→惰转→AZ-5→末端效应→爆炸 |
| 6 | 场景 3 拒绝路线 | 拒绝→旁观→AI操作→爆炸→不同结局文字 |
| 7 | 场景 3 提前 AZ-5 | 200MW时按AZ-5→安全停堆→特殊结局 |
| 8 | 场景 3 留裕度 | OBR>15→功率飙升但不爆→小failure |
| 9 | 辅助提示 | 默认开，5s淡出，不重复，可关 |
| 10 | 辅助关闭 | 无提示，纯面板操作 |
| 11 | 连续游玩 | 1→2→3 状态继承 |
| 12 | 单独游玩 | 直接选场景 3，固定初始条件 |
| 13 | 电话对话 | 选项→回应→嵌套→挂断 |
| 14 | 旁观模式 | 控件灰色不可操作，底部文字 |
| 15 | 事故时间线 | AZ-5后7s爆炸（±2s） |
| 16 | 屏幕震动 | 事故时震动，可关闭 |
| 17 | 结局文字 | 黑屏白字，3s/行，不可跳过 |

## 不做的事

- 不做分支剧情树。场景是线性的。分支只在"玩家选择"处。
- 不做多结局动画。结局是文字。黑屏白字。
- 不做"如果场景 1 失败了就不能玩场景 2"。可以。随时可以。
- 不做成就系统。
- 不做"完美通关"。没有完美。只有后果。
- 不做场景编辑器。
- 不做随机事件。每次玩都一样。因为历史只发生了一次。

## 参考文献

[1] INSAG-7, IAEA, 1992 — 事故时间线
[2] Dyatlov, A.S., "Chernobyl: How It Happened", 2006 — 操作员视角
[3] Akimov, A.F., 证词（1986 年调查）— 值班主任视角
[4] Toptunov, L.F., 证词 — СИУР 视角
[5] 苏联国家原子能监督局, "RBMK-1000 技术规程", 1984 — 操作步骤

---

**完成。**
