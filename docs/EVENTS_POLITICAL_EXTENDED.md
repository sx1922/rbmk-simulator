# 政治事件（补充）

以下为 PL-006 至 PL-015，补充无尽模式的政治生态。

## PL-006 领导换届

```
severity: 2
trigger: 每3-5年一次（固定周期）/ 上级事故后被撤
delay: 提前14天传闻 → 正式任命
description: "上级主管部门换帅。新任 [姓名] 即将到任。"
phases:
  id: rumor
    label: "传闻阶段"
    duration: 14天
    effects: [不确定性, 旧领导不再管事, 决策真空]
  id: arrival
    label: "新领导到任"
    outcome:
      new_boss_trait: 随机抽取 ↓
traits:
  id: technocrat
    name: "技术派"
    effects: [重视安全指标, 容忍发电不足, 要求详细报告]
    pressure: 安全 > 发电
  id: economist
    name: "经济派"
    effects: [压利润, 砍成本, 容忍小违规]
    pressure: 利润 > 安全
  id: politician
    name: "政治派"
    effects: [要面子工程, 怕出事, 出事就甩锅]
    pressure: 不出事 > 一切
  id: reformer
    name: "改革派"
    effects: [推新制度, 要求透明, 初期混乱长期利好]
    pressure: 合规 > 效率（短期）
  id: corrupt
    name: "贪腐派"
    effects: [索贿, 安插亲信, 抽取维护预算]
    pressure: 上供 > 运营
options:
  id: align
    label: "主动靠拢，表忠心"
    outcome:
      effects: [关系+, 但被绑定——该领导倒台时连坐]
  id: professional
    label: "保持专业距离"
    outcome:
      effects: [关系中性, 不受领导变动影响]
  id: resist
    label: "抵触新政策"
    outcome:
      effects: [关系-, 被穿小鞋]
      risk: 若领导为politician/corrupt → PL-003加速
```

## PL-007 腐败索贿

```
severity: 2
trigger: 领导trait=corrupt / 采购环节 / 检查环节
delay: 0
description: "[某人] 暗示：[采购合同/检查通过/指标调整] 需要'表示'。金额：[X]。"
options:
  id: pay
    label: "支付（走账外资金）"
    delay: 0
    outcome:
      effects: [问题暂时解决, 资金减少]
      risk: 留下把柄 → 未来被要挟 → PL-009
  id: refuse
    label: "拒绝"
    delay: 0
    outcome:
      effects: [问题未解决, 对方记恨]
      risk: 被穿小鞋 → 指标加压 / 检查加严
  id: report
    label: "向上级/纪检举报"
    delay: 0
    outcome:
      success_rate: 0.3（取决于对方关系网）
      effects: [对方被调查, 你获得正义加分]
      failure: [举报被压下, 你被标记为"不合作" → 全面打压]
  id: negotiate
    label: "讨价还价"
    delay: 0
    outcome:
      success_rate: 0.5
      effects: [金额减半, 问题部分解决]
      failure: [对方认为你不给面子 → 关系恶化]
```

## PL-008 国际原子能机构（IAEA）检查

```
severity: 2-3
trigger: 随机（每2-3年）/ 事故后强制
delay: 提前30天通知
description: "IAEA 安全评审团将于 [日期] 到访，进行 [OSART/专项] 检查。"
options:
  id: full_prepare
    label: "全面准备（英文材料、整改、演练）"
    delay: 30天
    outcome:
      effects: [费用高, 但通过概率95%]
      bonus: 好评 → 国际声誉 → 技术合作机会
  id: selective
    label: "选择性展示（藏问题）"
    delay: 7天
    outcome:
      success_rate: 0.5
      effects: [费用低]
      failure: [被发现 → 国际丑闻 → PL-005×3 + RG-003]
  id: minimal
    label: "最小准备"
    delay: 0
    outcome:
      success_rate: 0.4
      failure: [问题暴露 → 整改清单 + 跟踪检查]
special:
  IAEA检查员会随机进入任何区域
  若期间恰好发生事件 → 无法掩盖 → 严重度×2
```

## PL-009 把柄被握

```
severity: 3
trigger: PL-007选择pay后 / 违规操作被记录
delay: 随机（1-12月后）
description: "[某人] 联系你：'上次的事，我需要你帮个忙。'"
requests:
  "安插一个人进你的团队"（→ 人员系统加入一个低技能高关系的人）
  "把某份报告改一下"（→ 数据造假，风险累积）
  "下次检查时放行某批不合格设备"（→ 设备隐患）
  "给某供应商开绿灯"（→ 维护质量下降）
options:
  id: comply
    label: "照做"
    outcome:
      effects: [对方满意, 但埋下隐患]
      risk: 隐患未来以设备事件形式爆发
  id: refuse
    label: "拒绝"
    outcome:
      effects: [对方威胁公开]
      risk: 50%真的公开 → 调查 → 可能撤职
  id: preempt
    label: "先下手为强，主动坦白"
    outcome:
      success_rate: 0.4
      effects: [处分但保留职位, 对方也被查]
      failure: [双方一起完蛋]
```

## PL-010 社区抗议

```
severity: 2
trigger: 辐射泄漏事件后 / 媒体曝光后 / 随机（环保运动）
delay: 0
description: "电站周边居民聚集抗议：'[口号]'。人数：[X]。"
options:
  id: meet
    label: "出面沟通，公开数据"
    delay: 3600s
    outcome:
      success_rate: 0.6 + 透明度×0.2
      effects: [情绪缓解, 但承诺了额外监测费用]
      failure: [沟通失败, 抗议升级]
  id: ignore
    label: "不理会"
    delay: 0
    outcome:
      risk: 媒体介入 → PL-005 → 监管介入 → RG-001
  id: security
    label: "请求安保驱散"
    delay: 7200s
    outcome:
      effects: [抗议暂时解散]
      risk: 画面曝光 → 舆论爆炸 → PL-005 severity+2
  id: compensate
    label: "宣布补偿方案"
    delay: 0
    outcome:
      effects: [大额支出, 抗议平息, 但开了先例]
      risk: 未来每次出事都被要求补偿
```

## PL-011 私有化/改制

```
severity: 3
trigger: 游戏进行到一定年份 / 政治环境变化
delay: 提前90天通知
description: "上级宣布：电站将进行 [私有化/公司化改制/合并]。"
options:
  id: support
    label: "积极配合改制"
    delay: 90天
    outcome:
      effects: [短期混乱, 长期经济压力增大（股东要利润）]
      change: 经济系统参数变化（电价市场化, 成本硬约束）
  id: resist
    label: "联合职工抵制"
    delay: 0
    outcome:
      success_rate: 0.2
      effects: [改制推迟]
      failure: [被标记为保守派 → 边缘化]
  id: exploit
    label: "利用改制浑水摸鱼"
    delay: 0
    outcome:
      risk: 若被发现 → 撤职 + 法律后果
      success: [短期获利]
special:
  改制后经济系统难度+1（利润压力更大）
  改制后安全投入更可能被砍（股东压力）
```

## PL-012 上级甩锅

```
severity: 3
trigger: 重大事故后 / 指标严重未完成
delay: 事故后7天内
description: "上级在公开场合将 [事故/问题] 的责任指向你：'这是电站管理层的失职。'"
options:
  id: accept
    label: "默默承受"
    delay: 0
    outcome:
      effects: [你被处分, 但上级欠你人情（可能未来还）]
      risk: 若处分过重 → 撤职
  id: defend
    label: "公开申辩，摆事实"
    delay: 0
    outcome:
      success_rate: 0.4
      effects: [责任分摊, 上级丢脸]
      failure: [被认为"态度有问题" → 加重处分]
  id: counter
    label: "反击：揭露上级此前的违规指令"
    delay: 0
    outcome:
      success_rate: 0.3
      effects: [两败俱伤, 但你可能保住职位]
      failure: [你被彻底清除]
  id: leak
    label: "向媒体/纪检泄露内部文件"
    delay: 0
    outcome:
      success_rate: 0.5
      effects: [上级倒台, 但你也因泄密被处分]
      risk: 若失败 → PL-009式报复
```

## PL-013 安插亲信

```
severity: 1-2
trigger: 领导换届后 / 腐败领导在任
delay: 0
description: "上级通知：[姓名] 将调入你的团队担任 [岗位]。"
person_trait:
  id: incompetent
    name: "关系户（无能）"
    effects: [技能1, 不可培训, 占编制, 拖后腿]
  id: spy
    name: "眼线"
    effects: [你的所有决策被上报, 无法隐瞒任何问题]
  id: actually_good
    name: "真有本事的人"
    effects: [技能4, 但忠诚度归上级不归你]
options:
  id: accept
    label: "接受"
    outcome:
      effects: [人员+1, 但上述trait生效]
  id: refuse
    label: "以编制满为由拒绝"
    delay: 0
    outcome:
      success_rate: 0.3
      failure: [上级强塞 → 关系恶化]
  id: marginalize
    label: "接受但边缘化（安排闲职）"
    delay: 0
    outcome:
      effects: [该人不干活也不碍事]
      risk: 若为spy → 上报你"排挤上级派人" → 政治后果
```

## PL-014 政策突变

```
severity: 2-3
trigger: 随机（每年0-1次）/ 国际事件后
delay: 0（立即生效）或提前30天
examples:
  "国家宣布：所有RBMK堆型必须在2年内完成安全改造。"
  "电力市场改革：电价从固定改为竞价上网。"
  "新环保标准：热排放限值收紧50%。"
  "出口管制：某关键备件无法进口。"
  "强制并网：必须接入区域电网，失去独立调度权。"
options:
  id: comply
    label: "执行"
    outcome:
      effects: [改造费用 / 运营限制 / 收入变化]
  id: lobby
    label: "联合其他电站游说"
    delay: 30天
    outcome:
      success_rate: 0.3
      effects: [政策放宽或延期]
      failure: [无效, 浪费时间和政治资本]
  id: circumvent
    label: "打擦边球"
    delay: 0
    outcome:
      risk: 被发现 → RG-003 + PL-003
```

## PL-015 内部举报（吹哨人）

```
severity: 2
trigger: 你做了违规操作 / 团队中有人士气极低 / 随机
delay: 0
description: "你收到消息：[某人] 正在向 [监管局/媒体/纪检] 举报电站问题。"
options:
  id: talk
    label: "私下沟通，了解诉求"
    delay: 3600s
    outcome:
      success_rate: 0.5 + 该人 morale×0.003
      effects: [了解其不满, 可能解决根源, 举报撤回]
      failure: [对方不信任你, 加速举报]
  id: silence
    label: "施压让其闭嘴"
    delay: 0
    outcome:
      success_rate: 0.4
      effects: [暂时安静]
      failure: [对方加速举报 + 增加"打压举报人"罪名]
      risk: 即使成功 → 其他人看到 → 全员士气-20
  id: preempt_report
    label: "抢先自查自纠，主动上报"
    delay: 7200s
    outcome:
      effects: [监管局认为你态度好, 从轻处理]
      bonus: 若举报内容属实且你已整改 → 举报无效化
  id: fire
    label: "找理由开除"
    delay: 0
    outcome:
      effects: [人走了]
      risk: 若对方已提交材料 → 开除举报人 = 罪加一等
      risk: 团队恐慌 → 士气-30
```

---

## 政治事件间的关联网络

```
PL-006（换届）
  ├→ 新领导 corrupt → PL-007（索贿）→ PL-009（把柄）
  ├→ 新领导 politician → PL-012（甩锅）概率↑
  ├→ 新领导 economist → PL-004（预算削减）频率↑
  └→ 新领导 reformer → PL-014（政策突变）概率↑

PL-007（索贿）
  ├→ pay → PL-009（把柄）
  ├→ refuse → 被穿小鞋 → PL-002（指标加压）
  └→ report → 成功则解除 / 失败则全面打压

PL-005（媒体）
  ├→ PL-010（社区抗议）
  ├→ RG-001（提前检查）
  └→ PL-008（IAEA介入）

PL-012（甩锅）
  ├→ accept → 欠人情 → 未来被要求做PL-007的事
  ├→ counter → 可能触发PL-006（领导倒台→换届）
  └→ leak → PL-005（媒体）

PL-011（改制）
  ├→ 经济系统重置
  ├→ PL-004（预算削减）永久化
  └→ PL-013（安插亲信）频率↑（新股东塞人）
```

---

## 政治压力总表

| 事件 | 核心张力 | 玩家困境 |
|------|----------|----------|
| PL-001 视察 | 面子 vs 真实 | 展示成绩还是暴露问题 |
| PL-002 指标 | 发电 vs 安全 | 完成指标就要压裕度 |
| PL-003 信任 | 生存 vs 尊严 | 低头还是硬刚 |
| PL-004 预算 | 省钱 vs 安全 | 砍哪里都要命 |
| PL-005 媒体 | 透明 vs 控制 | 说多少说多快 |
| PL-006 换届 | 适应 vs 坚持 | 站队还是不站队 |
| PL-007 腐败 | 合规 vs 生存 | 同流合污还是被排挤 |
| PL-008 IAEA | 国际压力 | 藏不住的 |
| PL-009 把柄 | 过去 vs 未来 | 被要挟的代价 |
| PL-010 抗议 | 公众 vs 运营 | 花钱消灾还是硬扛 |
| PL-011 改制 | 体制变化 | 适应新规则 |
| PL-012 甩锅 | 责任归属 | 背锅还是反杀 |
| PL-013 亲信 | 团队 vs 上级 | 忍还是拒 |
| PL-014 政策 | 外部不可控 | 只能适应 |
| PL-015 举报 | 内部裂痕 | 堵还是疏 |

## 设计原则

1. **没有纯好选项。** 每个选择都有代价，区别只是代价的形式。
2. **政治事件不直接杀你。** 它们通过改变约束条件（预算、人员、指标）间接制造技术风险。
3. **可累积。** 单次政治事件可忍，但多个叠加 → 系统性崩溃。
4. **与时代背景挂钩。** 苏联/后苏联体制下的特有压力（上级指令、计划指标、信息管控）是核心风味。
5. **玩家有 agency。** 不是纯被动挨打——可以选择站队、结盟、反击、妥协，形成自己的政治策略。
