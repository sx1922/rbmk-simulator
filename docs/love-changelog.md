# 更新日志

## [v0.1.0] · сб.2026.07.30 · РЭ-86/12 �?Первый щит

### 版本号系统建�?- 制定三层版本号规范（语义版本 · 构建日期 · 修订代号�?- 统一项目名称为「ЩИТ�?- 规划 v0.1 ~ v1.0 版本轨迹与代�?- 制定跨平台版本同步规则（Web / LÖVE 同号异平台）

### Web 版本（`rbmk-sim/`）独立发�?- 独立 HTML/CSS/JS 控制室仿真器，纯前端无后端依�?- 物理引擎：点堆动力学 + 单组缓发中子 + 空泡反馈 + �?碘模�?+ 棒端效应 + П1–�? 保护 + 熔毁
- 苏联控制室主题样式（拉丝铝面板、螺丝、指针表盘、AZ-5 按钮、报警灯�?- Canvas 渲染：仪表盘、堆芯轴向剖面、棒位条、反应性平衡、四线记录仪、挂�?- 桌面道具系统�?1 页运行规程手册（含修订通知/红黑条）、值班日志（可编辑导出）、MK-61 计算器（OPR/Xe 直读）、DP-5 剂量计（量程切换）、VCh 电话、茶�?- 版本信息单一来源（version.json），控制台输�?+ 右下角戳�?+ 关于面板覆盖

---

## 2026-07-29 V2 UI/字体修复

### 字体正方形方块修复（font loading fallback�?- 字体加载方式�?`love.filesystem.read` + `love.filesystem.write` 复制�?save 目录改为直接 `love.filesystem.getInfo` 检�?+ `pcall(love.graphics.newFont, path, sz)` 直接加载
- 添加 `io.open` 备用 fallback：当 `love.filesystem` 找不到字体文件时，通过标准 Lua 文件 IO 读取并构�?`FileData` 传给 `newFont`
- 修复源文件：`src/ui/theme.lua:29-59`

### 字体大小自适应窗口缩放�?看不清字"�?- `getFont()` 现在根据 `Layout.scale` 反算字体大小：`sz = math.floor(size * baseScale * invScale + 0.5)`，其�?`invScale = 1/Layout.scale`
- 确保在任何窗口尺寸下，文字的实际渲染大小与设计尺寸一致（不再随窗口缩小而缩到不可读�?- `baseScale` 限定�?[1, 3] 区间�?- 修复源文件：`src/ui/theme.lua:78-82`

### 最小窗口尺寸提�?- �?960x540 提升�?1280x720，避免过小窗口下 UI 元素严重重叠
- 修复源文件：`conf.lua:8-9`

### UTF-8 截断崩溃修复
- `screens.lua:423` �?`s.name:sub(1,1)` 对中文名（如 `阿纳托利·维奇`）按字节截断产生非法 UTF-8 �?LÖVE �?`UTF-8 decoding error`
- 新增 `utf8First(s)` 函数，根据首字节高位标识正确截取 1~4 字节完整 UTF-8 字符
- 修复源文件：`src/ui/screens.lua:9-17, 433`

### 右侧面板超出底部重叠修复�?重叠"�?- 右侧面板高度 `rh` �?840 改为 804，使面板底部�?4+804=868）与底部状态栏（y=872）之间保留间�?- 修复源文件：`src/ui/screens.lua:374`

### Emoji 替换补充
- `src/game/save.lua:108`：`📂` �?`[载]`

### `textW` UTF-8 安全截断
- `Theme.textW()` �?`str:sub(1, -2)` 按字节截断可能破�?UTF-8 字符，改为检查末字节是否�?continuation byte�?x80~0xBF），若是则多截一字节
- 修复源文件：`src/ui/theme.lua:108-115`

---

## 2026-07-29 V1 UI修复与字体优�?
### 字体/UI 修复�?蒙了一层布"�?- 大幅提亮所有背景色：`bg`/`panel`/`panel2`/`panel3`/`panel4` 移除暗化乘数系数，提高基准亮�?- 提高 `txtFaint` 亮度：`{0.37,0.44,0.47}` �?`{0.58,0.60,0.62}`
- 提高 `txtDim` 亮度：`{0.60,0.63,0.66}` �?`{0.75,0.76,0.78}`
- 提高 `txt` 亮度：`{0.91,0.89,0.85}` �?`{0.95,0.94,0.91}`
- 同时更新 `main.lua` �?`setBackgroundColor` 以匹配新配色
- 修复源文件：`src/ui/theme.lua`

### Emoji 替换（无 emoji 字体时的可读性）
将所有界面中�?emoji 替换为文本标�?`[xxx]` 格式�?- `src/game/state.lua`：`🎓`→`[教]`、`🔄`→`[换]`、`💾`→`[存]`、`🎉`→`[奖]`、`📉`→`[未]`、`⚠`→`[急]`、评分标�?`🏆⭐👍😐💀`→`[冠][星][赞][平][败]`
- `src/game/data_events.lua`：事件图�?`🔧☢📞🎛👔💨⚡🧑‍🔧🔥`→`[泵][辐][话][棒][官][蒸][电][员][火]`，效果文�?`💥`→`[爆]`
- `src/ui/screens.lua`：`🔄`→`[换]`、`📢`→`[讯]`

---

## 初始版本 (初始移植)

### 项目搭建
- �?HTML5 游戏 `penbl.html` 移植�?LÖVE2D (Lua)
- 14 个源文件目录结构设计
- 测试套件�? 单元测试全部通过�?
### 关键修复
- **启动死锁**：修�?reactor 初始 100% 抽棒 �?ORM=0 �?无法启动的死锁（`state.lua:85` 初始插入 -11 根，ORM�?11�?- **save.lua 序列�?*：数组分�?`{=val1,=val2}` 修正�?`{val1,val2}`
- **state.lua:232** 父名后缀数组访问：`{'维奇','诺夫','斯基'}[self.rng:int(1,3)]` �?使用本地变量 `patr`
- **氙毒积累测试**：重写测试逻辑，初始注碘并满棒插入
- **mods 测试**：将 `sample_gridstorm.lua` �?`mods/` 移到 `mods_examples/` 避免重复计数
- **layout.lua:14** `Layout.toDesign` 添加 `nil` 守卫
- **screens.lua**: `rectangle('fill', ..., {10,10,0,0})` �?修复 LÖVE `rectangle` 标量参数�? 处）
- **screens.lua:68** `str:split('\n')` �?Lua �?`string.split`，替换为 `string.gmatch`
- **screens.lua:73** `hit()` 前移定义（原定义在第742行后才出现）
- **screens.lua:270** `math.round` �?Lua 5.1 无此函数，替换为 `math.floor(v+0.5)`
- **state.lua:326** `math.random()` �?`self.rng:next()` 确定性衰�?- **hardReset 存档检�?*：`pcall` 返回 `ok, info`，修�?`ok and ok` �?`ok and info`
- **Theme.panel3/panel4** 移除回退 `or {...}`�? 处）
- **sfx.lua:30** `math.random()` �?确定�?LCG `boomRandom()`
- **state.lua:380** 死亡员工处理：空 `if not s.alive then end` �?`goto continue`
- **cmdRefuel**：添加持�?`self.r.refuelBonus` 字段（原写入 `reactivity` 会被覆盖�?- **save.lua:87** reactor 加载添加数值范围钳�?- **theme.lua** 字体加载：`io.open` �?`love.filesystem` 跨平台复�?
