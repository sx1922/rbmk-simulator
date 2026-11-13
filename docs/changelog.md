# Changelog

## [v0.2.3] · сб.2026.08.01 · РЭ-86/15 (continued)

### 修复
- `web/js/app.js`：点火动画期间教程/教学 UI 露出——`Tutorial.start()` 延后到 `playIgnition()` 回调（2.6s 后）执行；点火层 `z-index: 950` 盖过 tutorial-box (940) 与 ring (930)
- `web/js/app.js`：画画/擦除不再播放划痕音效（`Audio.scratch` 调用全部移除）
- `web/style.css`：熔毁动画 `mfx-drive` 关键帧缺 `from { opacity: 1 }` 导致容器整段透明度 0、子动画不可见 → 补全 `from { opacity: 1 } to { opacity: 0 }`
- `web/js/audio.js`：盖格计数器 `_click` 重做——方波 700 Hz → 带通白噪声 2.2-4 kHz + 20% 概率双击高频音，音量 0.25→0.13，更接近真实计数管且不刺耳
- `web/js/props.js` + `web/index.html`：电话号码簿拆为独立桌面道具（`data-prop="phonebook"`，图标 📒），原电话面板移除内嵌号码簿；点击号码条目自动打开电话、拿起话筒、填入号码并拨号
- `web/js/props.js`：电话乱拨不再随机接通——未匹配 `PHONE_LINES` 号码（含空号）给出「空号 · 无法接通」+ 忙音双短促 beep；仅 0701-0705 定向应答
- `web/js/props.js` + `web/js/endless.js`：去除中国人名——`PHONE_LINES[4] from: '刘辛木'` → `'Семёнов · 谢苗诺夫'`；`endless.js CREW_NAMES` 16 人全改为苏联常见姓氏音译（伊万诺夫、彼得罗夫、西多罗夫……）
- `web/js/tutorial.js`：历史模式引导细化“打开→阅读→关闭”全流程——前 5 步道具新增 `openSel` 字段（manual 看 `#manual-overlay`，其余看 `#prop-overlay`），仅当检测到「打开过后又关闭」才推进；文案明确「点「✕ 放回」或按 Esc 关闭」；键盘 Enter/Space 仅推进无 `openSel` 的步骤
- `web/js/app.js` + `web/index.html`：日历/手册新增橡皮擦工具（`data-tool="eraser"`，`globalCompositeOperation='destination-out'`，笔触 16px 圆形），钢笔/铅笔/橡皮擦三选一
- `web/js/app.js`：无尽模式日历涂画持久化——`localStorage` 分模式键（`rbmk_cal_draw_story` / `rbmk_cal_draw_endless`），收起/切换模式/回菜单时保存 dataURL，打开时拉伸恢复；`initCalCanvas` 恢复逻辑改为始终拉伸绘制（去除尺寸相等判断），防御宽高变化
- `web/js/app.js`：ESC 暂停菜单“设置”按钮修正——点击后隐藏暂停菜单 → 打开设置 → 关闭设置时回调 `openPause()` 返回暂停菜单，而非直接 `paused=false` 复课

## [v0.2.2] · сб.2026.08.01 · РЭ-86/15

### 修复
- `web/js/challenge.js`：挑战模式"突然卡死"根因——事件面板按钮绑定回调被当作 `App.showPanel` 的 `onClose`（仅在面板**关闭时**执行），按钮从未绑定点击，面板冻结模拟（paused=true）且无法操作；改为 `showPanel` 返回后立即在 `#endless-panel` 上绑定 `button[data-opt]`（与 showEndlessEvent 同模式）；另修复 `steam_leak` 抢修 `repairUntil` 负值（timeLeft<60 时永不结束检修）加 `Math.max(0, …)` 夹取
- `web/js/app.js` + `web/index.html`：手册涂画擦不掉/钢笔切换无效——涂画工具按钮在 `.manual-controls`，而 click 委托挂在 `.manual-pages`（事件冒泡到不了）；委托改挂 `#manual-book`（两区公共祖先）
- `web/js/app.js`：手册翻页串画——`resizeManualCanvas` 无条件保留上一页画布；改为按页存储（`manualBuffers[page]`，翻页时快照当前页→清空→恢复目标页），擦除只清当前页
- `web/js/props.js`：手册语言按钮无效——`manualLang` 只赋值从不生效（页面正文固定中文）；`renderManual` 现在写 `#manual-page[data-lang]`，CSS 按 zh/ru/both 显隐俄中标题（ru 放大俄文标题、zh 放大中文标题、both 双显）；绑定防重复（`document._manualLangBound`）
- `web/js/app.js`：日历涂画收起重开后消失——`initCalCanvas` 每次打开重置 `cv.width` 清空画布；新增离屏 `cv._buf` 快照，同尺寸打开时恢复
- `web/js/app.js`：无尽模式没有日历——`showCalendarToggle()` 在 endless 分支接入（复用同一日历，标题 1986 年 5 月，今日=无尽当前日，起始日=1）；切换模式时重建日历头部/网格并保留 canvas 节点
- `web/js/audio.js`：事件记录（ПЕЧАТЬ СОБЫТИЙ）展开音效过大——`zoom` 噪声 0.2→0.09、提示音 0.05→0.03
- `web/style.css`：教学引导框 `#tutorial-box` 底部居中压在桌面道具条（`#desk-props`）上，遮挡道具列表——下边距 26px→88px 上移避让

### 新增
- 熔毁爆炸演出（`web/index.html` + `web/style.css`）：`#meltdown-fx` 新增黑色核电站剪影（厂房/烟囱/反应堆厂房，纯 CSS），淡入后整体炸飞、屋顶与烟囱单独抛出旋转；z-index 760→830 压过终局白闪（800），黑剪影在白屏上爆炸可见
- 点火启动过程（`web/index.html` + `web/style.css` + `web/js/app.js`）：`#ignition-overlay` 全屏点火动画（堆芯蓝白光核由暗转亮 + 冲击环扩散 + `ПУСК`/「点火 · 反应堆临界」字幕，2.6s），每次开始班次播放
- 电话号码簿（`web/js/props.js` + `web/style.css`）：电话机上方号码簿（调度台 0701 / 汽轮机车间 0702 / 电气车间 0703 / 消防队 0704 / 医疗点 0705），点击自动拿起话筒、填入号码并拨号；`phoneCall` 按号码定向应答（匹配 `PHONE_LINES[].num`），未知号码随机应答；导出 `Props.phoneBook(i)`
- 文档：`docs/LORE.md` 世界设定与内容实现（世界观/时间线/人物/模式/道具/机制设定）；日历、涂画、点火、熔毁演出等新机制入档

## [v0.2.1] · сб.2026.07.31 · РЭ-86/14

### 修复
- `web/js/menu.js`：设置页脚「恢复出厂整定」（sf-reset）按钮无效——原 handler 只重渲染当前分区，从不重置数据；现改为与系统分区「还原出厂设置」一致：写回 `defaultSettings` + 重载数值 + 重应用侧效果
- `web/index.html`：脚本标签加 `?v=` 缓存破坏参数（python http.server 无 Cache-Control，启发式缓存会导致改代码后浏览器仍跑旧版 JS）
- `web/js/menu.js`：设置改动不保存的 bug——`SETTING_DATA_MAP` 双重声明（196 行 `var` 重新赋空对象清空了 124-127 行填充好的表），`initSettingsValues()` 永远读空表，重开设置一律显示默认值；删除重复声明并补 `var`；`applySetting` 同步回写 `item.val`（重渲染/切分区不回跳）
- `web/js/menu.js`：新增 `restoreStoredSettings()`，菜单启动时恢复已存的主音量与时间加速（此前改完刷新浏览器即还原）
- `web/js/engine.js` + `web/js/render.js`：周期计（ПЕРИОД）数据失真——瞬时差分无滤波导致稳态读数在 ±75 ~ ±900000 间乱跳；新增 3 秒一阶滤波（模拟 РП-16 响应）+ |T|>1000 s 死区显示 ∞；表盘 |T|<10 s 指针不再贴中心 ∞ 刻度（П2 阈值 10 s 时指针在 +10 刻度附近），刻度标签重算（+22/+80/+282/+1000）

### 双语
- 主控面板速率/模式按钮（МЕДЛ./РАБОЧ./БЫСТР. + АВТО/РУЧН.）、about 铭牌（ВЕРСИЯ/СБОРКА/РЕВИЗИЯ/РАЗРАБОТКА/ПЛАТФОРМА）、菜单品牌 ЩИТ、运行规程封面/日志导出头/ВЧ 电话语音、菜单页脚版本行 全部俄中双语

## [v0.2.0] · сб.2026.07.31 · РЭ-86/13 — Коридор

### 文档同步
- `docs/GDD.md` → v6.1：§13.5 历史模式改引用场景引擎；§14 任务链 3 场景改为六幕 «Испытание» 结构（分支线 + 隐藏结局）；§15 终局体系对齐 FLOW-01 四类触发源（MELTDOWN/SCENARIO_END/VOLUNTARY/CHALLENGE_END）+ 撤职/破产标注为无尽模式远期功能；§16.3 补充与 SETTINGS 的关系；§17 成就按幕更新；§18.9 新增界面文档索引；新增 §19 存档系统（原 19-21 顺延为 20-22）；货币单位统一为卢布（₽）
- 经济系统货币：GDD §8 与 ENDLESS_MODE.md 电价模型由 0.04 $/kWh 改为 0.02 ₽/kWh（2 戈比/kWh，1986 年苏联工业电价水平）

### 新增
- 游戏循环闭环（`web/js/` 新增 4 模块 + 桥接）：
  - `web/js/bridge.js`：ESM 桥接层，`window.Core = {Scoring, Save}`（导入 `lib/scoring.js` + `lib/save.js`）
  - `web/js/scenario.js`：场景运行时（事件/动作/分支判定/模拟覆盖/终止动作，`window.Scenario`），内置 ХРОНИКА-04 第一幕 Смена 与第二幕 氙坑事件链（分支点 00:40 继续/停堆两线，终局动作触发 SCENARIO_END）
  - `web/js/pause.js`：暂停菜单（`window.Pause`，统计摘要/F12 结束班次确认/暂停态设置入口）
  - `web/js/debrief.js`：结算画面（`window.Debrief` 双栏布局 + 终局文本 + 评级，`window.MatchScorer` 历史匹配度评分，接入 DEBRIEF-01）
- `web/js/app.js` 重写：四态状态机（МЕНЮ/РАБОТА/КОНЕЦ/РАЗБОР）、全参数统计收集、5 维度评分→评级→报告生成、终局过渡（3s 闪白 / 2s 淡出）、存档（`Save.recordShiftEnd` 值班日志）、Esc 暂停 + F12 结束班次
- `web/js/menu.js`：设置落地（`SETTINGS_DATA` 全部绑定 `Core.Save`，滑杆/开关/还原出厂实时持久化到 `rbmk_journal`，清档改为清除 `rbmk_journal`/`rbmk_journal_bak`，`Menu.openSettings()` 供游戏内暂停调用）
- `web/index.html`：`#ending-overlay` 终局过渡层 + 新脚本加载顺序
- `web/style.css`：`#scn-float`（电话/对话浮层）、`#pause-overlay` 暂停面板（确认框警示红）、`#ending-overlay` 闪白/淡出动画、`#debrief-overlay` 结算双栏布局（含移动端降级）

### 修复
- `web/js/engine.js` 反应堆动力学重构（修复"开局即熔毁/终局"致命 bug）：
  - `stepKinetics` 显式欧拉 → 半隐式标准点堆方程（`dn = ((ρ-β)n + βC)/λ` 形式），消除数值发散；稳态 ρ=0 成立
  - 反应性基准重校：控制棒 50→54（开局 ρ≈0）；空泡系数 0.0028→0.0009（正反馈可被多普勒压住）；氙系数 0.22→0.004（氙毒峰值 ~1.5 美元，接近真实）；提棒正端 0.35→0.04、停堆正端 0.9→0.02（正常 OPR 停堆必安全，低 OPR 氙坑停堆必事故）
  - auto 调节速度 2×→0.25×（消除降功率过冲振荡：原 25 秒内棒全插→功率崩塌→回提过冲到 138%→熔毁）；棒速 0.4→1.2/s
  - AZ-5 后禁止 auto 恢复（`azFired` 时调节器冻结）且 `rodTarget` 归零（原 scram 结束后棒自动回提恢复功率）
- `web/js/scenario.js`：`sim_override` 支持 `rod` 目标；`a2_crash`（00:00 功率骤降）同时把棒提到 92（复现历史操作，使 OPR 跌破 15、氙坑事故条件成立）
- `web/js/app.js`：非法转义序列 `\u01:23:45` 语法错误；`Props.closeAll` → `Props.closeProp`
- `web/js/scenario.js`：时间换算单位错误（毫秒 vs 秒，跨午夜换算）；分支超时改墙钟判定（原基于模拟时间，timeScale=10 下永不会触发）
- `web/js/menu.js`：还原出厂回调中未定义的 `tabId` → `SETTINGS_TABS[settingsTabIdx].id`

### 主菜单系统（上一轮完成，存档至此）
- 主菜单系统（`web/js/menu.js`）：4 区仪表盘布局（顶栏状态灯+时钟/左栏操作列/右栏反馈面板/底栏版本铭牌），ПУСК 大按钮通电展开 3 模式子屏（СМЕНА/ХРОНИКА/ВЫЗОВ），设置屏 6 分区+5 灵魂旋钮，键盘/鼠标全操作，琥珀色/冷绿/警示红三色体系，Oswald+IBM Plex Mono+Noto Sans SC 字体
- 启动动画（`web/js/boot.js`）：3.5s 磷光文字面板通电序列，首次启动不可跳过
- 音频引擎（`web/js/audio.js`）：Web Audio API 纯合成，0KB 外部资源，5 层 bus 路由 + ducking
- 桌面道具系统（`web/js/props.js`）：运行规程手册 11 页（完整交互内容）、值班日志（钢笔/铅笔/导出）、МК-61 计算器（OPR/Xe 读数）、ДП-5В 剂量仪（5 档量程）、ВЧ 电话、茶杯
- 值班日志模板（`docs/LOG_TEMPLATE.md`）

### 项目重构
- `core/` + ESM `physics/systems` → `lib/`（8 个文件）
- 废弃全局模块 → `legacy/`（7 个文件）
- 删除 `src/`（损坏的旧版游戏）
- `examples/` → `tests/scenarios/`
- 测试文件重命名为 `*.test.js`
- 全部导入路径修复，105/105 测试通过

### 文档
- `docs/MENU.md`：完整主菜单设计规格 ЩИТ-DOC-MENU-01
- `docs/FLOW.md`：游戏生命周期与终局规格 ЩИТ-DOC-FLOW-01（四态状态机、四类终局触发、结算画面、模块接口、实现顺序）
- `docs/SCEN_ENGINE.md`：场景引擎接入规格 ЩИТ-DOC-SCEN-01（接入架构、事件格式、动作类型、分支判定、六幕事件骨架）
- `docs/UI.md`：UI 浮层规格 ЩИТ-DOC-UI-01（电话/对话/暂停/日志/规程/分支/终局过渡，z-order 400-700）
- `docs/DEBRIEF.md`：结算画面与评分规格 ЩИТ-DOC-DEBRIEF-01（5 维度通用评分 + 历史匹配度附加，存档扩展现有 save.js）
- `docs/SETTINGS.md`：设置落地规格 ЩИТ-DOC-SETTINGS-01（扩展现有扁平 settings 结构，五灵魂旋钮实现细节）
- `docs/FLOW.md`：游戏生命周期与终局规格 ЩИТ-DOC-FLOW-01（四态状态机、四类终局触发、结算画面、模块接口、实现顺序）（4 区仪表盘/ПУСК 通电交互/3 模式子屏/设置 6 分区+5 灵魂旋钮/琥珀色三色体系/Oswald+IBM Plex Mono+Noto Sans SC 字体/铝框铆钉 CRT 屏体）
- `docs/GDD.md` §11.3：桌面道具表与交互规则
- `docs/dev/AUDIO_IMPL.md`：音频引擎实现文档（模块结构/API/性能约束/测试清单）
- `docs/SCORING.md`：评分系统设计文档（5 维度/评级映射/报告生成/场景特殊规则）
- `docs/SAVE.md`：存档与进度系统文档（值班日志/数据结构/读写 API/备份恢复/UI 呈现）
- `docs/UI_INTERACTION.md`：交互设计文档（视角系统/面板分区/控件交互/手持物件/渲染方案/移动端适配）
- `docs/REACTOR_SIM.md`：反应堆物理模型升级至 v2.0——新增汽水分离器模型、给水温度动态、热冲击、控制棒驱动限制、中子探测器量程、仪表动态响应（含故障模式）、衰变热、反应堆周期、空间四象限模型、辐射模型；v1.0 所有方程与参数保持不变；新增状态量带默认值保证向后兼容
- `web/js/engine.js`：实现 v2.0 物理引擎——新增 `updateSeparator`(汽水分离器水位/压力/蒸汽流量)、`updateFeedwater`(给水温度动态)、`updateCladIntegrity`(热冲击/包壳完整性)、`updateDecayHeat`(Way-Wigner 衰变热)、`updatePeriod`(反应堆周期)、`updateQuadrants`(四象限功率分配/氙振荡)、`updateRadiation`(冷却剂活度/主控室剂量率)、`updateRodDrives`(驱动机构过热闭锁)；`stepThermal` 热源项改为裂变+衰变热；`fireAZ` 记录停堆时刻与停堆前功率；`stepRods` 受过热闭锁限制；`reset`/`initFullPower`/`exportState`/`importState` 覆盖全部 v2 状态量
- `web/js/app.js` + `web/js/render.js` + `web/index.html` + `web/style.css`：实现 REACTOR_UI_ADAPT.md 控制台 UI 适配——新增仪表中间层（instLayer，量程截断/一阶滞后/噪声叠加/故障注入）、4 态报警灯状态机（alarmLamps，FAST_BLINK→ON→SLOW_BLINK→OFF + КВИТ 按钮）、新渲染函数（四象限功率表、汽水分离器液位计、棒驱动温度/状态、КСУ-120 自记笔、8 个新报警灯）、量程旋钮（5 档 С/П/1/2/3）、新 HTML 面板与 CSS 样式
- `docs/REACTOR_UI_ADAPT.md`：新增控制台 UI 适配新物理引擎文档（区域 1-4 新增仪表清单、量程系统 UI、仪表动态响应/故障视觉、报警灯阵 4 态升级+КВИТ、自记笔/象限/辐射/衰变热/周期表/液位计/给水温度 UI 规格、输入层适配、难度适配表、验收标准）
- `docs/SCENARIO.md`：场景脚本结构（3 场景完整事件时间线/事件引擎/对话系统/电话脚本/4 种结局/旁观模式/辅助系统/状态继承）
- `web/js/audio.js`：音频引擎完整实现（8 模块：engine/synth/ambient/equipment/events/alarms/narrative/mixer；5 层 bus 树；alarm 规格 П1-П10+AZ5；泵/盖革/电话音效；混合器 ducking；事故音序）
- `lib/scoring.js`：评分系统（5 维度评分/评级映射/报告生成/战役总结/评语生成）
- `lib/save.js`：存档系统（Vakhtennyy Zhurnal 格式/带备份的 localStorage/导入导出/校验/恢复/统计追踪）
- `lib/scenario.js`：场景引擎（ScenarioEngine 事件引擎/Trigger 条件系统/对话系统/场景注册表/场景配置默认值）
- `docs/ENDLESS_MODE.md`：无尽模式设计（经济系统/燃料循环/人员编制/政治监管/事件系统/失败条件/评分）
- `docs/EVENTS.md`：无尽模式事件系统（10设备/5外部/4人为/4监管/5政治事件 + 级联规则/频率曲线）
- `docs/EVENTS_POLITICAL_EXTENDED.md`：政治事件补充 PL-006~015（换届/腐败/IAEA/把柄/抗议/改制/甩锅/亲信/政策突变/举报）
- `docs/SCENARIO_ISPYTANIE.md`：历史场景«Испытание»六幕叙事脚本（交班/氙坑/拉功率/试验准备/АЗ-5/之后，含停堆线分支、隐藏结局、信息不对称机制、压力系统）
- `docs/GDD.md`：更新 §7 汽轮机、§8 经济、§9 政治信任、§10 人员、§13 事件系统、§14 任务链、§17 成就、§18 UI/UX、§19 音频

### 后续
- [ ] 音频层接入游戏状态（环境嗡鸣随功率变化、报警/盖革联动）
- [ ] 场景 JSON 动态加载
- [ ] LÖVE 移植对应模块

---

## [v0.1.0] · сб.2026.07.30 · РЭ-86/12 — Первый щит

### 新增
- 项目初始化，完整目录结构
- 物理引擎：中子动力学、反应性合成、热工水力(5区)、氙毒、汽轮机、AZ-5、保护逻辑
- 游戏系统：经济、信任、人员、维护、随机事件、安全试验任务链
- UI 层：仪表盘、面板、弹窗、趋势图
- 验证测试：4 个单元测试 + 3 个场景 JSON

### 版本号系统
- 制定三层版本号规范（语义版本 · 构建日期 · 修订代号）
- 统一项目名称为「ЩИТ」
- 规划 v0.1 ~ v1.0 版本轨迹与代号
- 制定跨平台版本同步规则（Web / LÖVE 同号异平台）

### Web 版本
- 独立 HTML/CSS/JS 控制室仿真器，纯前端无后端依赖
- 物理引擎：点堆动力学 + 单组缓发中子 + 空泡反馈 + 氙/碘模型 + 棒端效应 + П1–П5 保护 + 熔毁
- 苏联控制室主题样式（拉丝铝面板、螺丝、指针表盘、AZ-5 按钮、报警灯）
- Canvas 渲染：仪表盘、堆芯轴向剖面、棒位条、反应性平衡、四线记录仪、挂钟
- 桌面道具系统
- 版本信息单一来源（version.json）

### LÖVE 移植
- HTML5 游戏移植至 LÖVE2D (Lua)
- 14 个源文件目录结构设计
- 测试套件：单元测试全部通过
- 各种 LÖVE 修复（字体、编码、布局、emoji 替换）

---

## 2026-07-29 V2 UI/字体修复

### 字体正方形方块修复
- 字体加载增加 `io.open` 备用 fallback

### 字体大小自适应窗口缩放
- `getFont()` 根据 `Layout.scale` 反算字体大小

### 最小窗口尺寸提升
- 960x540 → 1280x720

### UTF-8 截断崩溃修复
- 新增 `utf8First(s)` 函数正确截取 UTF-8 字符

### Emoji 替换
- 所有界面 emoji 替换为文本标签 `[xxx]`

---

## 2026-07-29 V1 UI修复与字体优化

### 配色提亮
- 面板背景色、文字色全面提亮

### 关键修复
- 启动死锁修复
- save.lua 序列化修复
- 氙毒积累测试重写
- 确定性 RNG 替代 math.random
- 多个 Lua 5.1 兼容性修复

---

## 初始版本 (初始移植)

### 项目搭建
- 从 HTML5 游戏移植至 LÖVE2D (Lua)
- 模组系统框架
- 确定性物理
- 移动端触控兼容
