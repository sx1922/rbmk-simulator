# ЩИТ-DOC-SETTINGS-01 · 设置落地规格书

| 字段 | 值 |
|------|-----|
| 文档编号 | ЩИТ-DOC-SETTINGS-01 |
| 对应版本 | v0.2.0 «Коридор» |
| 状态 | 已定稿 |
| 定稿时间 | 2026-07-31 00:34 CST |
| 前置文档 | ЩИТ-DOC-MENU-01 §5（设置屏结构）、GDD §18（视觉规格） |

---

## 1 · 问题陈述

menu.js 中设置屏的滑条和开关已渲染，但不影响任何游戏状态。滑条是装饰。

本文档定义每个设置项如何实际生效，重点是五个"灵魂旋钮"。

所有设置项扩展自 `lib/save.js` 的 `defaultSettings()` 的扁平结构，不新建独立存储。

---

## 2 · 设置存储

### 2.1 存储位置

```js
// localStorage key: 'rbmk_journal' → settings 字段
{
  masterVolume: 0.8,
  busVolumes: { ambient: 1, equipment: 1, events: 1, alarms: 1, narrative: 1 },
  language: 'zh',
  textSpeed: 3,
  screenShake: true,
  showTooltips: true,
  // ↓ 以下为新增字段
  crtIntensity: 75,
  ambientNoise: 60,
  digitalAssist: true,
  warningLevel: 2,
  consequenceMode: 'realistic',
  ambientMotion: 70
}
```

设置存储在 `save.js` 的 journal 结构中（`journal.settings`），与现有设置字段并列，不新建独立 key。

### 2.2 读写接口

```js
const Settings = {
  _journal: null,

  load() {
    this._journal = Save.loadJournal();
    return this._journal.settings;
  },

  get(path) {
    // path: 'crtIntensity' → this._journal.settings.crtIntensity
    return this._journal?.settings?.[path] ?? this.defaults()[path];
  },

  set(path, value) {
    if (this._journal) {
      this._journal.settings[path] = value;
      Save.saveJournal(this._journal);
      this.emit(path, value);
    }
  },

  defaults() {
    return {
      masterVolume: 0.8,
      busVolumes: { ambient: 1, equipment: 1, events: 1, alarms: 1, narrative: 1 },
      language: 'zh',
      textSpeed: 3,
      screenShake: true,
      showTooltips: true,
      crtIntensity: 75,
      ambientNoise: 60,
      digitalAssist: true,
      warningLevel: 2,
      consequenceMode: 'realistic',
      ambientMotion: 70
    };
  },

  reset() {
    if (this._journal) {
      this._journal.settings = this.defaults();
      Save.saveJournal(this._journal);
      this.emitAll();
    }
  },

  _listeners: {},
  on(path, fn) { (this._listeners[path] ||= []).push(fn); },
  emit(path, value) { (this._listeners[path] || []).forEach(fn => fn(value)); },
  emitAll() { /* 遍历所有路径 emit */ }
};
```

### 2.3 生效时机

| 设置类型 | 生效时机 |
|----------|----------|
| 声音 | 即时（下一个音频帧） |
| 画面（CRT 强度、亮度） | 即时（下一渲染帧） |
| 全屏 / 分辨率 | 即时（调 canvas / window API） |
| 操作（键位） | 即时（更新输入映射表） |
| 工况 / 难度 | 下次 startGame() 时生效（不改当前局） |
| 界面 / 语言 | 即时（重新渲染文本） |
| 环境动效强度 | 即时 |

---

## 3 · 五个灵魂旋钮：落地细节

### 3.1 CRT 显像管强度（crtIntensity）

| 范围 | 默认 |
|------|------|
| 0–100 | 75 |

影响：

| 值 | 效果 |
|----|------|
| 0 | 干净平面。无扫描线、无暗角、无磷光余晖、无雪花。像现代液晶屏。 |
| 25 | 轻微扫描线（opacity 0.1）+ 轻微暗角 |
| 50 | 明显扫描线（opacity 0.3）+ 暗角 + 轻微磷光拖尾 |
| 75 | 完整 CRT 感：扫描线 0.5 + 暗角 + 磷光余晖 + 极淡雪花 |
| 100 | 过度：扫描线 0.7 + 重暗角 + 强磷光 + 明显雪花 + 轻微几何畸变 |

实现：

```js
Settings.on('crtIntensity', (value) => {
  const t = value / 100;
  CRTShader.setUniforms({
    scanlineOpacity: lerp(0, 0.7, t),
    vignetteStrength: lerp(0, 0.8, t),
    phosphorDecay: lerp(0, 0.4, t),
    snowDensity: lerp(0, 0.15, t),
    curvature: lerp(0, 0.03, t)
  });
});
```

关键约束：CRT 强度为 0 时，游戏仍然完全可玩。不依赖 CRT 效果传达任何关键信息。

### 3.2 控制室底噪（ambientNoise）

| 范围 | 默认 |
|------|------|
| 0–100 | 60 |

影响：

| 值 | 效果 |
|----|------|
| 0 | 完全静音（环境层）。只保留操作音效和警报。 |
| 30 | 隐约嗡鸣，几乎听不见 |
| 60 | 正常控制室氛围：变压器嗡鸣 + 偶尔继电器咔 + 远处通风 |
| 100 | 沉浸感拉满：嗡鸣明显 + 继电器频繁 + 盖革计数咔咔 + 通风管道 |

实现：

```js
Settings.on('ambientNoise', (value) => {
  const t = value / 100;
  AudioManager.setAmbientGain(t);
  AudioManager.setLayerGain('hum', t * 0.8);
  AudioManager.setLayerGain('relay', t * 0.5);
  AudioManager.setLayerGain('geiger', t * 0.3);
  AudioManager.setLayerGain('ventilation', t * 0.6);
});
```

与主音量的关系：最终音量 = masterVolume × ambientNoise/100。masterVolume 是总闸，ambientNoise 是环境层子闸。

### 3.3 仪表数字辅助（digitalAssist）

| 范围 | 默认 |
|------|------|
| boolean | true（开） |

影响：

| 状态 | 仪表表现 |
|------|----------|
| 开 | 每个指针仪表旁边显示数字读数（如 "3200 MW"） |
| 关 | 只有指针和刻度。你自己读。 |

```js
Settings.on('digitalAssist', (value) => {
  GaugeRenderer.setDigitalOverlay(value);
});
```

设计意图：一个开关分出两种玩家。开着 = 教学辅助，关了 = 硬核模拟。不影响游戏逻辑，只影响信息呈现。

### 3.4 故障预警等级（warningLevel）

| 范围 | 默认 |
|------|------|
| 0–3 | 2 |

影响：

| 等级 | 行为 |
|------|------|
| 0（无） | 无任何预警。故障发生就是发生了。你自己看仪表判断。 |
| 1（低） | 只在即将发生不可逆事故时闪红灯（如熔毁前 10s） |
| 2（中） | 异常参数偏离正常范围时，对应仪表边框变琥珀色 |
| 3（高） | 异常时仪表边框变琥珀 + 文字提示"注意：空泡份额偏高" |

实现：

```js
Settings.on('warningLevel', (value) => {
  WarningSystem.setLevel(value);
});

class WarningSystem {
  update(simState) {
    if (this.level === 0) return;

    for (const param of MONITORED_PARAMS) {
      const deviation = this.calcDeviation(simState[param.name], param.normal);

      if (this.level >= 2 && deviation > param.warnThreshold) {
        this.ui.highlightGauge(param.gaugeId, 'amber');
      }
      if (this.level >= 3 && deviation > param.warnThreshold) {
        this.ui.showTextWarning(param.message);
      }
      if (this.level >= 1 && deviation > param.criticalThreshold) {
        this.ui.flashRed(param.gaugeId);
      }
    }
  }
}
```

关键约束：预警等级不影响物理仿真本身。堆该炸还是炸。只是"你提前多久知道"。

### 3.5 后果模式（consequenceMode）

| 范围 | 默认 |
|------|------|
| 'realistic' \| 'forgiving' | 'realistic' |

影响：

| 模式 | 行为 |
|------|------|
| realistic | 物理仿真无修正。ORM 低于 15 根 + 正空泡系数 = 功率骤增 = 可能熔毁。一次失误可能不可逆。 |
| forgiving | 物理仿真加"安全网"：功率超量程时自动插入保护棒（模拟"如果安全系统没被断开"）；熔毁阈值提高 20%；给玩家额外 5s 反应时间。 |

```js
Settings.on('consequenceMode', (value) => {
  Simulation.setConsequenceMode(value);
});

// Simulation 内部：
step(dt) {
  if (this.consequenceMode === 'forgiving') {
    if (this.power > this.ratedPower * 1.5) {
      this.autoInsertRods(4);
      this.log('保护系统自动介入');
    }
    if (this.fuelTemp > this.meltdownThreshold * 1.2) {
      this.scram();
    }
  }
}
```

设计意图：不是"简单/困难"。是"这个世界有没有人替你兜底"。realistic = 你断开了 САОР，没人救你。forgiving = 假设你没断开。

---

## 4 · 通用设置项落地

### 4.1 声音分区

| 项 | 键 | 范围 | 生效方式 |
|----|-----|------|----------|
| 主音量 | masterVolume | 0-1 | AudioManager.setMasterGain(v) |
| 控制室底噪 | ambientNoise | 0-100 | 见 §3.2 |
| 警报音量 | busVolumes.alarms | 0-1 | AudioManager.setLayerGain('alarms', v) |
| 广播语音 | busVolumes.narrative | 0-1 | AudioManager.setLayerGain('narrative', v) |
| 一键静音 | — | bool | AudioManager.setMute(v) |

### 4.2 画面分区

| 项 | 键 | 范围 | 生效方式 |
|----|-----|------|----------|
| CRT 显像管强度 | crtIntensity | 0-100 | 见 §3.1 |
| 全屏 | — | bool | document.fullscreenElement / exitFullscreen |
| 分辨率 | — | enum | canvas.width/height + CSS scale |
| 亮度 | — | 0-100 | CSS filter: brightness(0.5 + v/100) |
| 垂直同步 | — | bool | requestAnimationFrame vs setInterval(16) |

### 4.3 操作分区

| 项 | 键 | 范围 | 生效方式 |
|----|-----|------|----------|
| 键位绑定 | — | object | InputManager.remap(bindings) |
| 鼠标灵敏度 | — | 0-100 | InputManager.setSensitivity(v/50) |

### 4.4 工况 / 难度分区

| 项 | 键 | 范围 | 生效方式 |
|----|-----|------|----------|
| 仪表数字辅助 | digitalAssist | bool | 见 §3.3 |
| 故障预警等级 | warningLevel | 0-3 | 见 §3.4 |
| 后果模式 | consequenceMode | enum | 见 §3.5 |
| 时间加速 | — | 1-120 | Simulation.setTimeScale(v)（仅自由模式） |

### 4.5 界面 / 语言分区

| 项 | 键 | 范围 | 生效方式 |
|----|-----|------|----------|
| 语言 | language | 'zh'/'ru'/'en' | i18n.setLocale(v) → 重新渲染所有文本 |
| 字幕/广播文本 | — | bool | 对话浮层是否显示文本（关 = 只有语音） |
| 环境动效强度 | ambientMotion | 0-100 | 见 §4.8 |
| 高对比模式 | — | bool | 配色切换为高对比方案（白底黑字 + 粗边框） |

### 4.6 系统 / 关于分区

| 项 | 行为 |
|----|------|
| 清除存档 | confirm → `localStorage.removeItem('rbmk_journal')` |
| 恢复出厂整定 | confirm → Settings.reset() |
| 版本号 | 读 version.json 三层显示 |
| 制作信息 | 静态文本 |

### 4.7 文字速度（textSpeed）

| 范围 | 默认 |
|------|------|
| 1-5 | 3 |

控制对话浮层逐字打出速度。对应 UI-01 §4.3 中的 TYPING 阶段：

| 值 | 间隔 |
|----|------|
| 1 | 60ms/字（慢） |
| 3 | 25ms/字（标准） |
| 5 | 10ms/字（快） |

### 4.8 环境动效强度（ambientMotion）

| 范围 | 默认 |
|------|------|
| 0–100 | 70 |

控制 MENU-01 §7.2 中所有环境动效：

| 值 | 效果 |
|----|------|
| 0 | 所有环境动效关闭。灯不呼吸、雪花不出现、读数不跳。静态画面。 |
| 30 | 灯呼吸幅度减半、雪花频率减半、读数跳动幅度减半 |
| 70 | 默认。完整环境感。 |
| 100 | 灯呼吸幅度 ×1.5、雪花频率 ×2、读数跳动明显 |

```js
Settings.on('ambientMotion', (value) => {
  const t = value / 100;
  AmbientController.setIntensity(t);
  // breathAmplitude = lerp(0, 0.4, t)
  // snowInterval = lerp(Infinity, 30000, t)
  // jitterAmplitude = lerp(0, 1, t)
});
```

---

## 5 · 设置屏与游戏的交互

### 5.1 从主菜单进入设置

MENU-01 §3.1：左栏焦点在「设置」→ ⏎ → 进入设置屏。

### 5.2 从游戏内暂停进入设置

UI-01 §5.3：暂停菜单 → "整定" → 打开设置屏。

### 5.3 设置屏 Esc 返回

| 来源 | Esc 返回到 |
|------|-----------|
| 主菜单 → 设置 | 主菜单 |
| 游戏暂停 → 设置 | 暂停菜单 |

### 5.4 工况/难度设置的特殊规则

游戏内修改工况/难度设置（数字辅助、预警等级、后果模式）：

| 设置 | 游戏内可改？ | 说明 |
|------|-------------|------|
| 数字辅助 | ✓ 即时生效 | 只是信息呈现 |
| 预警等级 | ✓ 即时生效 | 只是信息呈现 |
| 后果模式 | ✗ 灰掉 | 显示"下次值班生效"。不能中途从 realistic 切 forgiving 来救命。 |
| 时间加速 | ✓ 即时生效 | 仅自由模式 |

---

## 6 · 实现顺序

| 步 | 任务 | 依赖 |
|----|------|------|
| 1 | Settings 模块（load/get/set/reset/emit，基于 save.js journal） | 无 |
| 2 | menu.js 设置屏接入 Settings（滑条 onChange → Settings.set） | 步 1 |
| 3 | 声音落地（AudioManager 订阅 masterVolume/ambientNoise/alarms） | 步 1 |
| 4 | CRT 强度落地（渲染层订阅 crtIntensity） | 步 1 |
| 5 | 数字辅助 + 预警等级落地 | 步 1 |
| 6 | 后果模式落地（Simulation 订阅 consequenceMode） | 步 1 |
| 7 | 环境动效强度落地 | 步 1 |
| 8 | 语言切换（i18n 基础框架） | 步 1 |
| 9 | 全屏 / 分辨率 / 亮度 / vsync | 步 1 |
| 10 | 键位绑定 | 步 1 |

步 1-2 完成后设置不再是装饰。步 3-6 完成后五个灵魂旋钮全部生效。

---

## 7 · 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-31 | 初版定稿。定义存储格式（扩展现有 save.js 扁平结构，不新建独立 key）、五灵魂旋钮落地细节、通用项生效方式、实现顺序。 |
