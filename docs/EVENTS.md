# 事件系统 — Система Событий

## 概述

无尽模式的事件系统。事件是游戏的核心驱动力——没有事件时玩家管理日常运营，事件打破平衡迫使决策。

---

## 事件结构

每个事件由以下字段定义：

```
id: string
name: string
category: equipment | external | human | regulatory | political | cascade
severity: 1-5
trigger_condition: expression
delay: seconds  # 从触发到玩家必须响应的时间
options:
  - id: string
    label: string
    requirement: string  # 需要什么条件才能选
    delay: seconds  # 执行需要的时间
    outcome:
      success_rate: float  # 受人员技能影响
      effects: []
escalation:  # 不响应或失败后
  next_event: string
  time_limit: seconds
```

## 严重度定义

| 等级 | 含义 | 时间压力 | 示例 |
|------|------|----------|------|
| 1 | 提示 | 无，可忽略 | 仪表读数轻微偏移 |
| 2 | 注意 | 分钟级 | 单台泵振动偏高 |
| 3 | 警告 | 秒到分钟 | 泵故障、阀门泄漏 |
| 4 | 紧急 | 秒级 | 管道破裂、失电 |
| 5 | 灾难 | 即时 | 堆芯失控、安全壳失效 |

---

## 一、设备故障事件

### EQ-001 主循环泵振动异常

```
severity: 2
trigger: 泵运行时间 > 阈值 AND 维护质量 < 0.7
delay: 无（渐进发展）
description: "2号主循环泵振动值升至 7.1 mm/s（正常 < 4.5）"
options:
  - id: monitor
    label: "继续监测"
    delay: 0
    outcome:
      success_rate: 1.0
      effects: [无即时效果]
      risk: 40%概率在24h内升级为EQ-002
  - id: reduce_power
    label: "降功率至70%"
    delay: 120s
    outcome:
      success_rate: 1.0
      effects: [发电量-30%, 泵负荷降低, 升级概率降至10%]
  - id: switch_pump
    label: "切换备用泵"
    delay: 300s
    requirement: 备用泵可用
    outcome:
      success_rate: 0.95
      effects: [故障泵隔离, 需安排维修]
      failure: [备用泵启动失败 → 升级EQ-002]
  - id: repair_online
    label: "在线抢修"
    delay: 600s
    requirement: 维修班可用
    outcome:
      success_rate: 0.6 + 维修技能×0.08
      effects: [泵恢复, 维修费用]
      failure: [抢修失败, 泵彻底损坏 → EQ-002]
escalation: EQ-002
```

### EQ-002 主循环泵故障停转

```
severity: 3
trigger: EQ-001升级 / 泵寿命到期 / 维护极差
delay: 0（突发）
description: "2号主循环泵跳闸！该环路流量骤降。"
options:
  - id: scram
    label: "紧急停堆"
    delay: 3s
    outcome:
      success_rate: 1.0
      effects: [反应堆停堆, 发电归零, 安全]
  - id: compensate
    label: "其余泵补偿，降功率运行"
    delay: 30s
    requirement: 剩余泵容量足够
    outcome:
      success_rate: 0.8
      effects: [功率降至60%, 燃料温度上升, 裕度收窄]
      failure: [补偿不足 → 局部过热 → EQ-005]
  - id: restart
    label: "尝试重启故障泵"
    delay: 60s
    outcome:
      success_rate: 0.3
      effects: [泵恢复]
      failure: [重启失败, 浪费60s]
escalation: EQ-005（若功率未降且补偿失败）
```

### EQ-003 蒸汽发生器传热管泄漏

```
severity: 3
trigger: 设备老化 > 阈值 AND 水质控制差
delay: 0
description: "蒸汽发生器辐射监测报警。一回路冷却剂漏入二回路。"
options:
  - id: isolate_sg
    label: "隔离故障蒸汽发生器"
    delay: 180s
    outcome:
      success_rate: 0.9
      effects: [该环路停运, 功率降至75%, 放射性释放到二回路]
      secondary: 二回路污染 → 汽轮机检修需求
  - id: reduce_and_monitor
    label: "降功率观察"
    delay: 60s
    outcome:
      success_rate: 0.5
      effects: [泄漏可能减缓]
      failure: [泄漏扩大 → EQ-006]
  - id: scram
    label: "停堆"
    delay: 3s
    outcome:
      success_rate: 1.0
      effects: [安全停堆, 需检修后重启]
escalation: EQ-006
```

### EQ-004 控制棒驱动机构卡涩

```
severity: 3
trigger: 维护不足 / 辐照变形
delay: 0
description: "37号控制棒下插指令无响应。棒位指示不动。"
options:
  - id: manual_rod
    label: "派人现场手动插入"
    delay: 900s（15分钟）
    requirement: 现场操作员可用
    outcome:
      success_rate: 0.7
      effects: [棒插入, 人员受照]
      failure: [手动也卡死 → 该棒永久失效]
  - id: compensate_rods
    label: "用相邻棒补偿"
    delay: 30s
    outcome:
      success_rate: 0.9
      effects: [功率分布畸变, 局部功率峰因子上升]
      risk: 长期运行 → 局部过热风险
  - id: ignore
    label: "记录，继续运行"
    delay: 0
    outcome:
      effects: [可用控制棒-1, 安全裕度下降]
      risk: 若需紧急停堆，该棒不插入 → 后果加重
```

### EQ-005 燃料通道局部过热

```
severity: 4
trigger: 流量不足 / 功率分布畸变 / 冷却剂沸腾
delay: 0
description: "燃料通道出口温度超限！通道内可能发生沸腾危机。"
options:
  - id: scram
    label: "紧急停堆"
    delay: 3s
    outcome:
      success_rate: 1.0
      effects: [安全, 但需检查燃料完整性]
  - id: reduce_power_fast
    label: "快速降功率"
    delay: 15s
    outcome:
      success_rate: 0.6
      effects: [温度回落]
      failure: [温度继续上升 → EQ-007 燃料破损]
  - id: increase_flow
    label: "增大该环路流量"
    delay: 30s
    requirement: 泵有裕度
    outcome:
      success_rate: 0.7
      effects: [冷却改善, 温度回落]
      failure: [泵已达极限, 无效]
escalation: EQ-007
```

### EQ-006 一回路管道破裂（LOCA）

```
severity: 5
trigger: EQ-003升级 / 管道腐蚀 / 极端外部事件
delay: 0
description: "一回路主管道破裂！冷却剂大量流失，安全壳压力骤升。"
options:
  - id: scram_and_eccs
    label: "停堆 + 启动应急堆芯冷却"
    delay: 3s（自动）+ 10s（确认）
    outcome:
      success_rate: 0.85（取决于ECCS维护状态）
      effects: [堆芯冷却, 安全壳内高放射, 长期停堆]
      failure: [ECCS故障 → EQ-008 堆芯熔毁]
  - id: manual_isolation
    label: "手动隔离破口段"
    delay: 300s
    requirement: 现场人员 + 辐射剂量允许
    outcome:
      success_rate: 0.4
      effects: [减少冷却剂流失]
      failure: [人员受照超限, 隔离失败]
escalation: EQ-008
```

### EQ-007 燃料棒破损

```
severity: 3
trigger: EQ-005升级 / 燃耗过高 / 制造缺陷
delay: 0
description: "一回路放射性活度异常升高。判断为燃料包壳破损。"
options:
  - id: locate_and_plan
    label: "定位破损组件，计划换料时处理"
    delay: 0
    outcome:
      effects: [一回路放射性升高, 需增加净化, 人员剂量上升]
      risk: 继续运行 → 破损扩大
  - id: reduce_power
    label: "降功率运行至换料"
    delay: 60s
    outcome:
      effects: [功率-30%, 减缓破损扩展]
  - id: scram_inspect
    label: "停堆检查"
    delay: 3s
    outcome:
      effects: [安全, 但停堆损失大]
```

### EQ-008 堆芯熔毁

```
severity: 5（终局）
trigger: EQ-006 ECCS失败 / 长时间失去冷却
delay: 0
description: "堆芯温度不可控上升。燃料开始熔化。"
options:
  - id: flood
    label: "一切手段注水"
    delay: 60s
    outcome:
      success_rate: 0.2
      effects: [可能部分缓解, 但堆芯已毁]
  - id: evacuate
    label: "撤离人员"
    delay: 30s
    outcome:
      effects: [人员安全, 电站报废]
outcome: 游戏结束。评分计算。
```

### EQ-009 汽轮机跳闸

```
severity: 3
trigger: 振动超限 / 叶片损伤 / 电网故障
delay: 0
description: "汽轮机保护动作跳闸！发电机解列。"
options:
  - id: turbine_bypass
    label: "蒸汽旁路排放，维持反应堆运行"
    delay: 15s
    outcome:
      success_rate: 0.85
      effects: [反应堆维持低功率, 蒸汽排大气, 热损失]
      risk: 旁路阀故障 → 必须停堆
  - id: scram
    label: "停堆"
    delay: 3s
    outcome:
      effects: [安全停堆, 检修汽轮机]
  - id: quick_resync
    label: "尝试快速重新并网"
    delay: 120s
    requirement: 跳闸原因为瞬态（非机械故障）
    outcome:
      success_rate: 0.5
      effects: [恢复发电]
      failure: [重新并网失败, 必须停堆]
```

### EQ-010 仪表/传感器故障

```
severity: 1-2
trigger: 老化 / 辐照 / 随机
delay: 无
description: "[某参数] 指示异常。可能为仪表故障，也可能为真实异常。"
options:
  - id: cross_check
    label: "用其他仪表交叉验证"
    delay: 60s
    outcome:
      effects: [确认真实值, 消除不确定性]
  - id: assume_real
    label: "按真实异常处理"
    delay: 0
    outcome:
      effects: [可能过度响应, 浪费资源]
  - id: assume_false
    label: "判定为仪表故障，忽略"
    delay: 0
    outcome:
      risk: 若为真实异常 → 延误处理 → 升级
```

---

## 二、外部事件

### EX-001 电网频率偏移

```
severity: 2
trigger: 随机（每月1-2次）
delay: 0
description: "电网频率降至 49.5 Hz。调度要求增出力。"
options:
  - id: increase_power
    label: "增功率响应调度"
    delay: 60s
    outcome:
      effects: [功率+10%, 获得调峰补贴, 设备负荷增加]
      risk: 若设备状态差 → 触发设备故障
  - id: refuse
    label: "以设备限制为由拒绝"
    delay: 0
    outcome:
      effects: [无补贴, 与调度关系恶化]
      risk: 多次拒绝 → 政治事件
  - id: partial
    label: "部分响应"
    delay: 60s
    outcome:
      effects: [功率+5%, 少量补贴]
```

### EX-002 极端天气（暴风雪/热浪）

```
severity: 2-3
trigger: 季节 + 随机
delay: 提前6h预警
description: "气象预警：[暴风雪/热浪]将在6小时后到达。"
options:
  - id: prepare
    label: "启动应急预案（加固、备品、人员待命）"
    delay: 3600s
    outcome:
      effects: [准备费用, 但事件影响减半]
  - id: reduce_power
    label: "预防性降功率"
    delay: 60s
    outcome:
      effects: [发电损失, 安全裕度增大]
  - id: normal
    label: "不做特殊准备"
    delay: 0
    outcome:
      risk: 事件到来时 → 可能触发设备故障（概率×2）
```

### EX-003 外部电源丧失（LOOP）

```
severity: 4
trigger: 电网故障 / 极端天气 / 随机
delay: 0
description: "外部电源全部丧失！厂用电切换至柴油发电机。"
options:
  - id: scram_auto
    label: "确认自动停堆已动作"
    delay: 3s
    outcome:
      success_rate: 0.99
      effects: [反应堆停堆, 柴发供电冷却]
  - id: check_diesel
    label: "确认柴油发电机状态"
    delay: 30s
    outcome:
      success_rate: 取决于维护
      effects: [柴发正常 → 安全]
      failure: [柴发故障 → EQ-011 全厂失电]
escalation: EQ-011
```

### EX-004 地震

```
severity: 3-5（取决于震级）
trigger: 随机（极低概率）/ 电站选址相关
delay: 0
description: "地震！震级 [X]。厂房结构响应中。"
options:
  - id: scram
    label: "确认停堆"
    delay: 3s（自动）
    outcome:
      effects: [停堆, 检查结构完整性]
  - id: inspect
    label: "全面巡检"
    delay: 3600s
    outcome:
      effects: [发现损伤 → 触发对应设备事件]
```

### EX-005 冷却水源异常

```
severity: 2-3
trigger: 季节（枯水期）/ 污染 / 冰冻
delay: 提前预警或突发
description: "循环水进水温度升高 / 水位下降 / 检测到异物。"
options:
  - id: reduce_power
    label: "降功率减少热负荷"
    delay: 60s
    outcome:
      effects: [功率-20%, 安全]
  - id: alternate_source
    label: "切换备用水源"
    delay: 300s
    requirement: 备用水源可用
    outcome:
      success_rate: 0.8
      effects: [恢复正常]
  - id: continue
    label: "继续运行，加强监测"
    delay: 0
    outcome:
      risk: 冷凝器效率下降 → 功率自动降低 → 若恶化 → 被迫停堆
```

---

## 三、人为事件

### HU-001 操纵员操作失误

```
severity: 2-4（取决于操作类型）
trigger: 疲劳 > 70 OR 技能 < 2 OR 士气 < 30
delay: 0
description: "操纵员 [姓名] 在执行 [操作] 时发生错误：[具体描述]。"
options:
  - id: correct
    label: "立即纠正"
    delay: 10-60s
    outcome:
      success_rate: 0.9
      effects: [恢复正常, 记录事件]
  - id: reassign
    label: "换人操作"
    delay: 120s
    outcome:
      effects: [该操纵员离岗, 需要人手]
  - id: investigate
    label: "暂停操作，调查原因"
    delay: 300s
    outcome:
      effects: [发现根因（疲劳/培训不足/规程缺陷）, 可针对性改善]
```

### HU-002 巡检遗漏

```
severity: 1（本身）→ 可能升级
trigger: 疲劳高 / 士气低 / 人手不足
delay: 无（隐性）
description: "（无即时提示。某设备异常未被发现。）"
mechanic:
  巡检遗漏 → 设备故障的早期预警被跳过
  玩家不会收到"巡检遗漏"的通知
  后果：设备故障直接以更高严重度出现（跳过1-2级预警）
```

### HU-003 隐瞒异常

```
severity: 1（本身）→ 可能升级
trigger: 士气 < 20
delay: 无（隐性）
description: "（无即时提示。某人员发现异常但未上报。）"
mechanic:
  低士气人员有概率不上报1-2级事件
  玩家看不到该事件
  直到升级为3级以上才暴露
  暴露后 → 追责 → 士气进一步下降（恶性循环）
```

### HU-004 违规操作

```
severity: 2-3
trigger: 玩家下达违规指令 / 人员自主违规
delay: 0
description: "[人员] 未按规程执行 [操作]。"
options:
  - id: stop
    label: "立即制止"
    delay: 10s
    outcome:
      effects: [操作中止, 人员纪律处分]
  - id: allow
    label: "默许（赶进度）"
    delay: 0
    outcome:
      effects: [操作完成, 但留下安全隐患]
      risk: 监管检查发现 → 罚款 + 处罚
```

---

## 四、监管事件

### RG-001 例行安全检查

```
severity: 1
trigger: 每季度一次（固定）
delay: 提前7天通知
description: "国家核安全局将于 [日期] 进行例行检查。"
options:
  - id: prepare
    label: "全面自查整改"
    delay: 7天
    outcome:
      effects: [费用, 但检查顺利通过]
  - id: minimal
    label: "最小准备"
    delay: 0
    outcome:
      success_rate: 0.6
      effects: [可能发现问题 → 整改要求]
      failure: [发现问题 → RG-002]
```

### RG-002 整改通知

```
severity: 2
trigger: RG-001失败 / 事件后调查
delay: 0
description: "监管局下达整改通知：[具体问题]。限期 [X] 天。"
options:
  - id: comply_fast
    label: "立即整改（停堆/降功率）"
    delay: 取决于问题
    outcome:
      effects: [发电损失, 但合规]
  - id: comply_slow
    label: "在期限内慢慢改"
    delay: 0
    outcome:
      risk: 期限内若再出事 → 加重处罚
  - id: negotiate
    label: "申请延期"
    delay: 0
    outcome:
      success_rate: 0.4
      effects: [延期30天]
      failure: [拒绝延期, 印象恶化]
escalation: 逾期未改 → RG-003
```

### RG-003 停堆整顿令

```
severity: 4
trigger: RG-002逾期 / 重大事故后
delay: 0
description: "监管局下令：立即停堆整顿。恢复时间待定。"
options:
  - id: comply
    label: "执行"
    delay: 3s
    outcome:
      effects: [强制停堆, 零收入, 每日罚款, 直到完成整改]
  - id: appeal
    label: "申诉"
    delay: 0
    outcome:
      success_rate: 0.1
      effects: [可能减为降功率运行]
      failure: [维持原判 + 额外罚款]
```

### RG-004 新法规颁布

```
severity: 1-2
trigger: 随机（每年1-2次）
delay: 提前90天生效
description: "新安全法规：[具体要求]。90天后生效。"
options:
  - id: upgrade
    label: "按期改造"
    delay: 90天内
    outcome:
      effects: [改造费用, 合规]
  - id: delay
    label: "拖到最后一刻"
    delay: 0
    outcome:
      risk: 若期间出事 → 罪加一等
  - id: ignore
    label: "不执行"
    delay: 0
    outcome:
      risk: 生效后 → RG-003
```

---

## 五、政治事件

### PL-001 领导视察

```
severity: 1
trigger: 随机 / 事故后
delay: 提前3天通知
description: "[上级] 将于 [日期] 来电站视察。"
options:
  - id: showcase
    label: "精心准备，展示成绩"
    delay: 3天
    outcome:
      effects: [费用, 但上级满意度+, 可能获得预算倾斜]
  - id: normal
    label: "正常接待"
    delay: 0
    outcome:
      effects: [无特殊影响]
  - id: hide_problems
    label: "掩盖问题"
    delay: 0
    outcome:
      risk: 若被发现 → 信任崩溃 → PL-003
```

### PL-002 发电指标加压

```
severity: 2
trigger: 月度 / 上级要求
delay: 0
description: "上级下达新指标：下月发电量不低于 [X] GWh。（高于当前能力）"
options:
  - id: accept
    label: "接受"
    delay: 0
    outcome:
      effects: [必须高功率运行, 设备压力增大, 维护时间被压缩]
      risk: 完不成 → 评价下降
  - id: negotiate
    label: "据理力争"
    delay: 0
    outcome:
      success_rate: 0.3 + 上级关系×0.2
      effects: [指标降低]
      failure: [指标不变 + 上级不满]
  - id: refuse
    label: "拒绝"
    delay: 0
    outcome:
      effects: [上级关系大幅恶化]
      risk: 多次拒绝 → PL-003
```

### PL-003 信任危机

```
severity: 3
trigger: 多次指标未完成 / 隐瞒被发现 / 重大事故
delay: 0
description: "上级对你的管理能力表示严重质疑。"
options:
  - id: promise
    label: "立下军令状"
    delay: 0
    outcome:
      effects: [最后机会，3个月内必须达标]
      risk: 再失败 → 被撤职
  - id: scapegoat
    label: "推卸给下属"
    delay: 0
    outcome:
      success_rate: 0.5
      effects: [暂时过关, 但团队士气崩溃]
      failure: [上级不买账 → 被撤职]
  - id: resign
    label: "主动辞职"
    delay: 0
    outcome:
      effects: [游戏结束，但评分保留]
```

### PL-004 预算削减

```
severity: 2
trigger: 经济不景气 / 上级决策 / 事故后
delay: 0
description: "下季度运营预算削减 [X]%。"
options:
  - id: cut_maintenance
    label: "削减维护费用"
    delay: 0
    outcome:
      effects: [省钱, 但设备老化加速, 故障率上升]
  - id: cut_staff
    label: "裁员"
    delay: 0
    outcome:
      effects: [省钱, 但人手不足 → 疲劳 → 失误]
  - id: cut_training
    label: "取消培训"
    delay: 0
    outcome:
      effects: [省钱, 但技能停滞]
  - id: absorb
    label: "压缩利润空间，不削减运营"
    delay: 0
    outcome:
      effects: [利润降低, 但运营不受影响]
      risk: 若已亏损 → 加速破产
```

### PL-005 媒体关注

```
severity: 1-3
trigger: 事故后 / 随机 / 环保组织
delay: 0
description: "媒体开始关注电站：[报道内容]。"
options:
  - id: transparent
    label: "公开信息，主动沟通"
    delay: 0
    outcome:
      effects: [短期舆论压力, 长期信任+]
  - id: stonewall
    label: "不予回应"
    delay: 0
    outcome:
      risk: 舆论发酵 → 监管介入 → RG-001提前
  - id: spin
    label: "公关处理"
    delay: 0
    outcome:
      success_rate: 0.6
      effects: [舆论平息]
      failure: [被揭穿 → 信任崩溃]
```

---

## 六、级联事件

级联事件不是独立触发的，而是前置事件处理失败后的升级链。

### 典型级联路径

```
EQ-001（泵振动）
  → 忽略 → EQ-002（泵跳闸）
    → 补偿失败 → EQ-005（局部过热）
      → 降功率失败 → EQ-007（燃料破损）
        → 继续运行 → EQ-006（LOCA）
          → ECCS失败 → EQ-008（堆芯熔毁）→ 游戏结束

HU-003（隐瞒异常）
  → 未发现的EQ-001 → 直接以EQ-002出现（跳过预警）
    → 措手不及 → 响应延迟 → 升级

PL-002（指标加压）
  → 玩家压缩维护 → 设备老化加速
    → EQ故障频率×2 → 更多停堆 → 完不成指标
      → PL-003（信任危机）→ 被撤职
```

### 级联规则

```
cascade_rules:
  每个事件有 escalation 字段指向下一级
  升级条件：超时未响应 / 响应失败 / 主动选择忽略
  升级时严重度 +1（至少）
  级联中每步给玩家响应时间（递减）
  到达 severity 5 → 游戏结束
```

---

## 七、事件频率与难度曲线

### 基础频率

| 月份 | 1级/周 | 2级/周 | 3级/周 | 4级/月 | 5级 |
|------|--------|--------|--------|--------|-----|
| 1-3 | 5-8 | 2-3 | 0-1 | 0 | 0 |
| 4-6 | 4-6 | 3-4 | 1-2 | 0-1 | 0 |
| 7-12 | 3-5 | 3-5 | 2-3 | 1 | 极低 |
| 12+ | 3-5 | 4-6 | 3-4 | 1-2 | 低 |

### 修正系数

```
实际频率 = 基础频率 × 设备老化系数 × 维护质量倒数 × 人员状态系数

设备老化系数 = 1 + (运行月数 / 设计寿命) × 0.5
维护质量倒数 = 1 / (0.5 + 维护投入比)  // 维护投入比 = 实际维护费/推荐维护费
人员状态系数 = 1 + (1 - 平均士气/100) × 0.5 + (平均疲劳/100) × 0.3
```

### 保护机制

- 前3个月不出现 severity 4+（除非玩家主动作死）
- 同一系统不会同时出两个 severity 3+（避免不公平）
- severity 5 事件必有至少2步前置警告（除非是外部事件如地震）

---

## 八、事件与模式的交互

### 历史模式

- 不使用此事件系统
- 事件由 SCENARIO.md 脚本固定触发
- 但共用事件的数据结构和表现层

### 无尽模式

- 完全使用此系统
- 事件生成器按频率表 + 修正系数随机抽取
- 玩家决策影响后续事件概率（维护好 → 少出事）
