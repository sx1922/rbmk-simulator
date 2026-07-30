# 音频引擎开发文档 — Audio Engine

## 约束

- 零外部音频文件。全部 Web Audio API 合成。
- 目标体积：0 KB 音频资源。
- 目标性能：≤ 20 个同时活跃节点，CPU < 5%。
- 浏览器兼容：Chrome 90+, Firefox 90+, Safari 15+。
- 首次交互前 AudioContext 处于 suspended 状态（浏览器策略）。

## 模块结构

```
src/audio/
├── engine.js          # AudioContext 管理、bus 路由、主音量
├── synth.js           # 基础合成工具函数（噪声、脉冲、扫频）
├── ambient.js         # Layer 1: 环境层
├── equipment.js       # Layer 2: 设备层（泵、盖革、继电器）
├── events.js          # Layer 3: 事件层（按钮、开关、纸张）
├── alarms.js          # Layer 4: 报警层
├── narrative.js       # Layer 5: 叙事层（电话铃、纸条打印）
└── mixer.js           # Ducking 逻辑、优先级管理
```

## engine.js — 核心

### 职责

- 创建 / 恢复 AudioContext
- 建立 bus 树
- 暴露全局 API：`init()`, `resume()`, `setMasterVolume()`, `suspend()`
- 提供 `getBus(name)` 给其他模块用

### Bus 树

```
AudioContext.destination
└── limiter (DynamicsCompressorNode, threshold=-1dB, ratio=20)
    └── masterGain (GainNode, default 0.8)
        ├── busAmbient   (GainNode, default 1.0)
        ├── busEquipment (GainNode, default 1.0)
        ├── busEvents    (GainNode, default 1.0)
        ├── busAlarms    (GainNode, default 1.0)
        └── busNarrative (GainNode, default 1.0)
```

### API

```js
// engine.js

let ctx = null;
const buses = {};

export function init() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(limiter);

  const busNames = ['ambient', 'equipment', 'events', 'alarms', 'narrative'];
  for (const name of busNames) {
    const g = ctx.createGain();
    g.gain.value = 1.0;
    g.connect(master);
    buses[name] = g;
  }

  return ctx;
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function getBus(name) {
  return buses[name];
}

export function getCtx() {
  return ctx;
}

export function setMasterVolume(v) {
  // v: 0–1
  buses.master?.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}
```

### 初始化时机

```js
// 在游戏入口（main.js）
document.addEventListener('pointerdown', () => {
  if (!audioInitialized) {
    init();
    audioInitialized = true;
    // 启动环境层
    ambient.start();
  }
}, { once: false });
// 注意：不用 { once: true }，因为每次交互都要 resume()
```

## synth.js — 基础合成工具

### 噪声生成器

```js
/**
 创建白噪声 buffer（1s，可循环）
 */
export function createNoiseBuffer(ctx, duration = 1) {
  const length = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 创建粉噪声 buffer（更自然的"嘶"声）
 */
export function createPinkNoiseBuffer(ctx, duration = 2) {
  const length = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}
```

### 一次性脉冲

```js
/**
 短脉冲（用于按钮"嗒"、继电器"咔"）
 */
export function playPulse(bus, { freq = 1000, decay = 0.02, type = 'square', volume = 0.3 }) {
  const ctx = bus.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);
  osc.connect(gain).connect(bus);
  osc.start();
  osc.stop(ctx.currentTime + decay + 0.01);
}
```

### 噪声爆发（用于"嘶"声、纸张）

```js
/**
 滤波噪声爆发
 */
export function playNoiseBurst(bus, noiseBuffer, {
  duration = 0.1,
  filterFreq = 4000,
  filterType = 'highpass',
  filterQ = 1,
  volume = 0.2,
  attack = 0.005,
  release = 0.05
}) {
  const ctx = bus.context;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = duration > noiseBuffer.duration;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  filter.Q.value = filterQ;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);
  gain.gain.setValueAtTime(volume, now + duration - release);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  src.connect(filter).connect(gain).connect(bus);
  src.start();
  src.stop(now + duration + 0.01);
}
```

### 扫频（用于 sirena）

```js
/**
 频率扫描
 */
export function playSweep(bus, {
  freqStart = 400,
  freqEnd = 800,
  duration = 1,
  type = 'sawtooth',
  volume = 0.25
}) {
  const ctx = bus.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
  gain.gain.value = volume;
  osc.connect(gain).connect(bus);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.01);
  return { osc, gain }; // 返回引用以便外部停止
}
```

## ambient.js — 环境层

### 50Hz 工频嗡鸣

```js
export function startHum(bus) {
  const ctx = bus.context;

  // 基频 50Hz + 谐波 100Hz + 150Hz
  const freqs = [50, 100, 150];
  const gains = [0.06, 0.03, 0.015]; // 谐波递减
  const nodes = [];

  for (let i = 0; i < freqs.length; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freqs[i];
    g.gain.value = gains[i];
    osc.connect(g).connect(bus);
    osc.start();
    nodes.push({ osc, gain: g });
  }

  return {
    nodes,
    setPower(fraction) {
      // fraction: 0–1（功率百分比）
      // 功率越高，嗡鸣越重
      const boost = 1 + fraction * 0.5; // 最大 +50%
      for (const n of nodes) {
        n.gain.gain.setTargetAtTime(
          n.gain.gain.value * boost, ctx.currentTime, 0.5
        );
      }
    },
    stop() {
      for (const n of nodes) {
        n.osc.stop();
      }
    }
  };
}
```

### 通风噪声

```js
export function startVentilation(bus, noiseBuffer) {
  const ctx = bus.context;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 250;
  filter.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.value = 0.04; // -28dB 左右

  src.connect(filter).connect(gain).connect(bus);
  src.start();

  return {
    src, gain,
    setLevel(v) {
      gain.gain.setTargetAtTime(v * 0.04, ctx.currentTime, 1.0);
    },
    stop() {
      // 渐弱 3s 后停止
      gain.gain.setTargetAtTime(0, ctx.currentTime, 1.5);
      src.stop(ctx.currentTime + 5);
    }
  };
}
```

### 随机管道声

```js
export function startPipeSounds(bus, noiseBuffer) {
  const ctx = bus.context;
  let timer = null;

  function scheduleNext() {
    const delay = 30000 + Math.random() * 60000; // 30–90s
    timer = setTimeout(() => {
      // 随机选择：金属敲击 或 水流
      if (Math.random() > 0.5) {
        // 金属敲击：短正弦 + 快速衰减
        playPulse(bus, { freq: 800 + Math.random() * 600, decay: 0.08, type: 'sine', volume: 0.02 });
        // 二次回声
        setTimeout(() => {
          playPulse(bus, { freq: 600 + Math.random() * 400, decay: 0.05, type: 'sine', volume: 0.01 });
        }, 80 + Math.random() * 40);
      } else {
        // 水流：短噪声爆发，低通
        playNoiseBurst(bus, noiseBuffer, {
          duration: 0.3 + Math.random() * 0.5,
          filterFreq: 400,
          filterType: 'lowpass',
          volume: 0.015
        });
      }
      scheduleNext();
    }, delay);
  }

  scheduleNext();

  return {
    stop() { clearTimeout(timer); }
  };
}
```

## equipment.js — 设备层

### 主循环泵

```js
export class PumpSound {
  constructor(bus) {
    this.bus = bus;
    this.ctx = bus.context;
    this.pumps = []; // 每个泵一组节点
  }

  /**
   启动一个泵的声音
   @returns {object} pump handle
   */
  startPump() {
    const ctx = this.ctx;

    // 基频 ~30Hz 锯齿波（机械感）
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 28 + Math.random() * 4; // 每台泵略有差异

    // 低通滤波去掉高频尖锐
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    osc.connect(filter).connect(gain).connect(this.bus);
    osc.start();

    // 渐入 0.5s
    gain.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 0.5);

    const pump = { osc, filter, gain, running: true, cavitating: false };
    this.pumps.push(pump);
    return pump;
  }

  /**
   停止一个泵（减速 3s）
   */
  stopPump(pump) {
    if (!pump.running) return;
    pump.running = false;
    const ctx = this.ctx;

    // 频率下降（减速）
    pump.osc.frequency.linearRampToValueAtTime(10, ctx.currentTime + 3);
    // 音量渐弱
    pump.gain.gain.setTargetAtTime(0, ctx.currentTime, 1.0);
    // 3.5s 后彻底停止
    pump.osc.stop(ctx.currentTime + 3.5);

    this.pumps = this.pumps.filter(p => p !== pump);
  }

  /**
   气蚀效果（流量不足时）
   */
  setCavitation(pump, active) {
    if (active && !pump.cavitating) {
      pump.cavitating = true;
      // 叠加高频噪声
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      const g = this.ctx.createGain();
      g.gain.value = 0.008;
      noise.connect(hp).connect(g).connect(this.bus);
      noise.start();
      pump._cavNoise = { noise, gain: g };
    } else if (!active && pump.cavitating) {
      pump.cavitating = false;
      if (pump._cavNoise) {
        pump._cavNoise.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
        pump._cavNoise.noise.stop(this.ctx.currentTime + 1);
      }
    }
  }

  setNoiseBuffer(buf) {
    this.noiseBuffer = buf;
  }
}
```

### 盖革计数器

```js
export class GeigerCounter {
  constructor(bus) {
    this.bus = bus;
    this.ctx = bus.context;
    this.rate = 2; // clicks/s
    this.running = false;
    this._timer = null;
  }

  start() {
    this.running = true;
    this._schedule();
  }

  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
  }

  /**
   设置剂量率（мР/ч），自动映射到咔哒频率
   */
  setDoseRate(mR) {
    if (mR < 0.1)       this.rate = 1 + Math.random() * 2;
    else if (mR < 1)    this.rate = 5 + mR * 10;
    else if (mR < 10)   this.rate = 30 + mR * 5;
    else if (mR < 100)  this.rate = 150 + mR * 2.5;
    else if (mR < 1000) this.rate = 400;
    else                this.rate = 800;
  }

  _schedule() {
    if (!this.running) return;

    const interval = 1000 / this.rate;
    const jitter = interval * 0.6 * (Math.random() - 0.5);
    const delay = Math.max(3, interval + jitter);

    this._timer = setTimeout(() => {
      this._click();
      this._schedule();
    }, delay);
  }

  _click() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = 700 + Math.random() * 500;

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.004);

    osc.connect(gain).connect(this.bus);
    osc.start();
    osc.stop(ctx.currentTime + 0.006);
  }
}
```

### 继电器

```js
/**
 单次继电器"咔"
 @param {'light'|'heavy'|'contactor'} variant
 */
export function playRelay(bus, variant = 'light') {
  const specs = {
    light:     { freq: 2000, decay: 0.015, volume: 0.15 },
    heavy:     { freq: 1200, decay: 0.025, volume: 0.25 },
    contactor: { freq: 800,  decay: 0.04,  volume: 0.3 },
  };
  const s = specs[variant];
  playPulse(bus, { ...s, type: 'square' });

  // 弹簧回弹（contactor 有第二次轻响）
  if (variant === 'contactor') {
    setTimeout(() => {
      playPulse(bus, { freq: 1500, decay: 0.01, type: 'square', volume: 0.08 });
    }, 30);
  }
}

/**
 多组继电器连续动作（保护触发时）
 */
export function playRelayCascade(bus, count = 6, interval = 80) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      playRelay(bus, i % 2 === 0 ? 'heavy' : 'light');
    }, i * interval + Math.random() * 20);
  }
}
```

### 阀门

```js
/**
 电动阀门动作
 @param {number} duration - 动作时长（秒），2–5
 */
export function playValve(bus, noiseBuffer, duration = 3) {
  const ctx = bus.context;

  // 电机嗡鸣
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 120;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.06, ctx.currentTime + duration - 0.3);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  osc.connect(filter).connect(gain).connect(bus);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.1);

  // 到位"咚"
  setTimeout(() => {
    playPulse(bus, { freq: 150, decay: 0.08, type: 'sine', volume: 0.2 });
  }, duration * 1000);
}

/**
 安全阀起跳（蒸汽释放）
 */
export function playSafetyValve(bus, noiseBuffer, duration = 2) {
  playNoiseBurst(bus, noiseBuffer, {
    duration,
    filterFreq: 6000,
    filterType: 'highpass',
    filterQ: 0.7,
    volume: 0.2,
    attack: 0.02,
    release: duration * 0.4
  });
}
```

## events.js — 事件层

### 按钮

```js
export function playButtonSmall(bus) {
  playPulse(bus, { freq: 3000, decay: 0.012, type: 'square', volume: 0.12 });
}

export function playButtonLarge(bus) {
  // 护盖翻开
  playPulse(bus, { freq: 600, decay: 0.03, type: 'square', volume: 0.2 });
  // 按钮到底（延迟 100ms）
  setTimeout(() => {
    playPulse(bus, { freq: 200, decay: 0.05, type: 'sine', volume: 0.3 });
  }, 100);
}

export function playButtonWithLamp(bus) {
  playButtonSmall(bus);
  setTimeout(() => playRelay(bus, 'light'), 30);
}
```

### 开关 / 钥匙

```js
export function playToggleSwitch(bus, direction = 'right') {
  const freq = direction === 'right' ? 2500 : 2200;
  playPulse(bus, { freq, decay: 0.015, type: 'square', volume: 0.15 });
}

export function playKeyInsert(bus) {
  // 金属"嚓"：高通噪声
  playNoiseBurst(bus, noiseBuffer, {
    duration: 0.06, filterFreq: 5000, filterType: 'highpass', volume: 0.1
  });
}

export function playKeyTurn(bus) {
  playPulse(bus, { freq: 1800, decay: 0.02, type: 'square', volume: 0.12 });
  setTimeout(() => {
    playPulse(bus, { freq: 1600, decay: 0.015, type: 'square', volume: 0.08 });
  }, 60);
}
```

### 纸张 / 手册

```js
export function playPageTurn(bus, noiseBuffer) {
  playNoiseBurst(bus, noiseBuffer, {
    duration: 0.15,
    filterFreq: 3000,
    filterType: 'bandpass',
    filterQ: 0.8,
    volume: 0.08,
    attack: 0.01,
    release: 0.08
  });
}

export function playPageTurnFast(bus, noiseBuffer, pages = 3) {
  for (let i = 0; i < pages; i++) {
    setTimeout(() => playPageTurn(bus, noiseBuffer), i * 80);
  }
}

export function playBookPickup(bus, noiseBuffer) {
  playNoiseBurst(bus, noiseBuffer, {
    duration: 0.08, filterFreq: 2000, filterType: 'bandpass', volume: 0.05
  });
}

export function playBookDrop(bus) {
  playPulse(bus, { freq: 200, decay: 0.06, type: 'sine', volume: 0.15 });
}

export function playClipboardClip(bus) {
  playPulse(bus, { freq: 4000, decay: 0.01, type: 'square', volume: 0.1 });
}

export function playPenWrite(bus, noiseBuffer) {
  // 极轻的摩擦声
  playNoiseBurst(bus, noiseBuffer, {
    duration: 0.3, filterFreq: 2500, filterType: 'bandpass', filterQ: 2, volume: 0.015
  });
}
```

### 电话

```js
export class PhoneSound {
  constructor(bus) {
    this.bus = bus;
    this.ctx = bus.context;
    this.ringing = false;
    this._ringInterval = null;
  }

  startRing() {
    if (this.ringing) return;
    this.ringing = true;

    const ring = () => {
      // 双音铃：25Hz 调制两个正弦
      const ctx = this.ctx;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const modGain = ctx.createGain();
      const outGain = ctx.createGain();

      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      osc1.type = 'sine';
      osc2.type = 'sine';

      // 25Hz 调制（机械铃特征）
      const mod = ctx.createOscillator();
      mod.frequency.value = 25;
      mod.type = 'square';
      mod.connect(modGain.gain);
      modGain.gain.value = 0;

      osc1.connect(modGain);
      osc2.connect(modGain);
      modGain.connect(outGain).connect(this.bus);
      outGain.gain.value = 0.15;

      osc1.start(); osc2.start(); mod.start();
      // 响 2s
      setTimeout(() => {
        osc1.stop(); osc2.stop(); mod.stop();
      }, 2000);
    };

    ring();
    this._ringInterval = setInterval(ring, 3000); // 响2s 停1s
  }

  stopRing() {
    this.ringing = false;
    if (this._ringInterval) clearInterval(this._ringInterval);
  }

  playPickup() {
    this.stopRing();
    playPulse(this.bus, { freq: 800, decay: 0.03, type: 'sine', volume: 0.12 });
  }

  playHangup() {
    playPulse(this.bus, { freq: 600, decay: 0.04, type: 'sine', volume: 0.15 });
  }

  playBusyTone() {
    // 425Hz，0.5s 通 / 0.5s 断
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 425;
    osc.type = 'sine';
    gain.gain.value = 0;
    osc.connect(gain).connect(this.bus);
    osc.start();

    this._busyInterval = setInterval(() => {
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.setValueAtTime(0, now + 0.5);
    }, 1000);

    this._busyOsc = osc;
  }

  stopBusyTone() {
    if (this._busyInterval) clearInterval(this._busyInterval);
    if (this._busyOsc) this._busyOsc.stop();
  }
}
```

### 计算尺

```js
export function playSlideRule(bus, noiseBuffer) {
  playNoiseBurst(bus, noiseBuffer, {
    duration: 0.2,
    filterFreq: 1500,
    filterType: 'bandpass',
    filterQ: 3,
    volume: 0.02 // 极轻
  });
}
```

## alarms.js — 报警层

### 报警规格表

```js
export const ALARM_SPECS = {
  П1:  { waveform: 'square', freq: 800,  pattern: 'continuous', level: 'авария' },
  П2:  { waveform: 'square', freq: 800,  pattern: 'continuous', level: 'авария' },
  П3:  { waveform: 'square', freq: 1200, pattern: 'pulse', onMs: 500, offMs: 500, level: 'авария' },
  П4:  { waveform: 'square', freq: 600,  pattern: 'pulse', onMs: 1000, offMs: 1000, level: 'сигнал' },
  П5:  { waveform: 'square', freq: 600,  pattern: 'pulse', onMs: 1000, offMs: 1000, level: 'сигнал' },
  П6:  { waveform: 'square', freq: 800,  pattern: 'pulse', onMs: 2000, offMs: 1000, level: 'авария' },
  П7:  { waveform: 'sine',   freq: 440,  pattern: 'pulse', onMs: 2000, offMs: 2000, level: 'сигнал' },
  П8:  { waveform: 'sine',   freq: 520,  pattern: 'pulse', onMs: 2000, offMs: 2000, level: 'сигнал' },
  П9:  { waveform: 'sine',   freq: [440, 660], pattern: 'alternate', onMs: 500, level: 'авария' },
  П10: { waveform: 'square', freq: 1000, pattern: 'triple', count: 3, periodMs: 333, level: 'сигнал' },
  AZ5: { waveform: 'sawtooth', freq: [400, 800], pattern: 'sweep', sweepMs: 1500, level: 'авария' },
};
```

### AlarmSynth 类

```js
export class AlarmSynth {
  constructor(bus) {
    this.bus = bus;
    this.ctx = bus.context;
    this.active = new Map(); // code → controller
  }

  /**
   启动报警音响
   */
  start(code) {
    if (this.active.has(code)) return; // 已在响

    const spec = ALARM_SPECS[code];
    const ctx = this.ctx;
    let controller;

    switch (spec.pattern) {
      case 'continuous':
        controller = this._startContinuous(spec);
        break;
      case 'pulse':
        controller = this._startPulse(spec);
        break;
      case 'alternate':
        controller = this._startAlternate(spec);
        break;
      case 'triple':
        controller = this._startTriple(spec);
        break;
      case 'sweep':
        controller = this._startSweep(spec);
        break;
    }

    this.active.set(code, controller);
  }

  /**
   确认（停止音响）
   */
  acknowledge(code) {
    const ctrl = this.active.get(code);
    if (!ctrl) return;
    ctrl.stop();
    this.active.delete(code);
  }

  /**
   全部停止
   */
  acknowledgeAll() {
    for (const [code, ctrl] of this.active) {
      ctrl.stop();
    }
    this.active.clear();
  }

  // --- 内部实现 ---

  _startContinuous(spec) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.waveform;
    osc.frequency.value = spec.freq;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(this.bus);
    osc.start();
    return {
      stop() {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        osc.stop(ctx.currentTime + 0.1);
      }
    };
  }

  _startPulse(spec) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.waveform;
    osc.frequency.value = spec.freq;
    gain.gain.value = 0;
    osc.connect(gain).connect(this.bus);
    osc.start();

    let running = true;
    const cycle = () => {
      if (!running) return;
      gain.gain.setTargetAtTime(0.2, ctx.currentTime, 0.01);
      setTimeout(() => {
        if (!running) return;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
        setTimeout(cycle, spec.offMs);
      }, spec.onMs);
    };
    cycle();

    return {
      stop() {
        running = false;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        osc.stop(ctx.currentTime + 0.1);
      }
    };
  }

  _startAlternate(spec) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.waveform;
    osc.frequency.value = spec.freq[0];
    gain.gain.value = 0.2;
    osc.connect(gain).connect(this.bus);
    osc.start();

    let idx = 0;
    const interval = setInterval(() => {
      idx = 1 - idx;
      osc.frequency.setTargetAtTime(spec.freq[idx], ctx.currentTime, 0.01);
    }, spec.onMs);

    return {
      stop() {
        clearInterval(interval);
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        osc.stop(ctx.currentTime + 0.1);
      }
    };
  }

  _startTriple(spec) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.waveform;
    osc.frequency.value = spec.freq;
    gain.gain.value = 0;
    osc.connect(gain).connect(this.bus);
    osc.start();

    let running = true;
    const cycle = () => {
      if (!running) return;
      for (let i = 0; i < spec.count; i++) {
        setTimeout(() => {
          if (!running) return;
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.setTargetAtTime(0, ctx.currentTime + 0.03, 0.01);
        }, i * 80);
      }
      setTimeout(cycle, spec.periodMs * spec.count + 200);
    };
    cycle();

    return {
      stop() {
        running = false;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        osc.stop(ctx.currentTime + 0.1);
      }
    };
  }

  _startSweep(spec) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.waveform;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(this.bus);
    osc.start();

    let running = true;
    const sweep = () => {
      if (!running) return;
      osc.frequency.setValueAtTime(spec.freq[0], ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(spec.freq[1], ctx.currentTime + spec.sweepMs / 1000);
      osc.frequency.linearRampToValueAtTime(spec.freq[0], ctx.currentTime + spec.sweepMs * 2 / 1000);
      setTimeout(sweep, spec.sweepMs * 2);
    };
    sweep();

    return {
      stop() {
        running = false;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        osc.stop(ctx.currentTime + 0.1);
      }
    };
  }
}
```

## narrative.js — 叙事层

### Phase 1：无语音

Phase 1 中叙事层只有：
- 电话铃声（已在 events.js 的 PhoneSound 中）
- 纸条打印声（打字机效果）
- 忙音

没有语音。电话内容通过面板上的文字显示。

### 纸条打印

```js
/**
 打字机 / 点阵打印效果
 @param {number} chars - 字符数（决定时长）
 */
export function playPrint(bus, chars = 20) {
  const ctx = bus.context;
  const charTime = 60; // ms per char

  for (let i = 0; i < chars; i++) {
    setTimeout(() => {
      // 每个字符：短脉冲
      playPulse(bus, {
        freq: 3000 + Math.random() * 1000,
        decay: 0.008,
        type: 'square',
        volume: 0.04
      });
    }, i * charTime + Math.random() * 10);
  }

  // 打印结束：回车"咔"
  setTimeout(() => {
    playPulse(bus, { freq: 500, decay: 0.03, type: 'square', volume: 0.1 });
  }, chars * charTime + 100);
}
```

### Phase 2 预留接口

```js
/**
 播放语音（Phase 2）
 目前为空实现。后续接入 TTS 生成的 .ogg 文件。
 */
export function playVoice(bus, id) {
  // TODO Phase 2:
  // const src = ctx.createBufferSource();
  // src.buffer = voiceBuffers[id];
  // const filter = ctx.createBiquadFilter();
  // filter.type = 'bandpass';
  // filter.frequency.value = 1800;
  // filter.Q.value = 0.8;
  // src.connect(filter).connect(bus);
  // src.start();
  console.warn('[audio] voice "' + id + '" not available in Phase 1');
}
```

## mixer.js — Ducking 与优先级

```js
export class Mixer {
  constructor(buses) {
    this.buses = buses; // { ambient, equipment, events, alarms, narrative }
    this.duckRules = [
      { trigger: 'narrative', targets: ['ambient', 'equipment', 'events'], amount: 0.25, release: 1.0 },
      { trigger: 'alarms',    targets: ['ambient', 'equipment'],           amount: 0.5,  release: 0.5 },
    ];
    this._activeDucks = new Map();
  }

  /**
   当某层激活时调用
   */
  onLayerActive(layerName) {
    for (const rule of this.duckRules) {
      if (rule.trigger === layerName) {
        for (const target of rule.targets) {
          const bus = this.buses[target];
          bus.gain.setTargetAtTime(rule.amount, bus.context.currentTime, 0.1);
          this._activeDucks.set(layerName + '->' + target, rule);
        }
      }
    }
  }

  /**
   当某层停止时调用
   */
  onLayerInactive(layerName) {
    for (const [key, rule] of this._activeDucks) {
      if (key.startsWith(layerName)) {
        const target = key.split('->')[1];
        const bus = this.buses[target];
        bus.gain.setTargetAtTime(1.0, bus.context.currentTime, rule.release);
        this._activeDucks.delete(key);
      }
    }
  }
}
```

## 与游戏状态的接口

### 反应堆状态 → 音频

```js
// 在 game loop 或状态变化回调中：

function onReactorStateChange(state) {
  // 功率 → 环境层
  ambient.hum.setPower(state.power / 3200);

  // 泵数量 → 泵声
  // （由操作触发，不在这里）

  // 剂量率 → 盖革
  geiger.setDoseRate(state.doseRate);

  // 超功率 → 管道振动
  if (state.power > 3200) {
    ambient.startPipeVibration(); // 金属共振，不规则
  }
}
```

### 保护触发 → 报警

```js
function onProtectionTrigger(code) {
  alarmSynth.start(code);
  mixer.onLayerActive('alarms');
  // 灯闪烁由 UI 层处理
}

function onProtectionAcknowledge(code) {
  alarmSynth.acknowledge(code);
  // 如果没有其他活跃报警：
  if (alarmSynth.active.size === 0) {
    mixer.onLayerInactive('alarms');
  }
}
```

### 事故序列

```js
function onAccidentSequence() {
  const t = (ms, fn) => setTimeout(fn, ms);

  t(0,    () => { events.playButtonLarge(busEvents); alarmSynth.start('AZ5'); });
  t(2000, () => { equipment.playRelayCascade(busEquipment, 8, 100); });
  t(4000, () => { /* 功率仪表电机加速 — 由 UI 动画驱动 */ });
  t(6000, () => {
    equipment.playSafetyValve(busEquipment, noiseBuffer, 3);
    equipment.playSafetyValve(busEquipment, noiseBuffer, 2.5);
    // 管道撞击
    playPulse(busEvents, { freq: 100, decay: 0.15, type: 'sine', volume: 0.4 });
  });
  t(8000, () => {
    // 结构破坏
    playPulse(busEvents, { freq: 40, decay: 0.5, type: 'sine', volume: 0.5 });
    // 断电：所有电子音停止
    ambient.stopAll();
    equipment.stopAll();
    alarmSynth.acknowledgeAll();
  });
  t(9000, () => {
    // 只剩蒸汽泄漏（渐弱）和盖革
    equipment.playSafetyValve(busEquipment, noiseBuffer, 8); // 长嘶声
    geiger.setDoseRate(5000); // 连续啸叫
  });
  t(15000, () => {
    // 渐入寂静
    geiger.setDoseRate(50); // 慢下来
  });
  t(30000, () => {
    geiger.stop();
    // 完全静音
  });
}
```

## 性能约束

| 指标 | 限制 | 理由 |
|------|------|------|
| 同时活跃 OscillatorNode | ≤ 12 | 每个报警 1 个 + 环境 3 个 + 泵 8 个 = 最多 ~19，但泵共享滤波 |
| 同时活跃 BufferSource | ≤ 4 | 噪声循环（环境 1 + 通风 1）+ 临时 one-shot |
| setTimeout 调度 | 盖革用递归 setTimeout，不用 setInterval | 避免堆积 |
| 节点创建/销毁 | one-shot 音效用完即 stop + disconnect | 防止内存泄漏 |
| 总 CPU | < 5%（Chrome DevTools Performance） | Web Audio 在音频线程跑，但调度在主线程 |

### 节点回收

```js
// 所有 one-shot 音效必须自动清理：
function playOneShot(bus, setupFn) {
  const ctx = bus.context;
  const nodes = setupFn(ctx, bus);
  // 最后一个节点 stop 后 disconnect
  const lastNode = nodes[nodes.length - 1];
  lastNode.onended = () => {
    for (const n of nodes) {
      try { n.disconnect(); } catch(e) {}
    }
  };
}
```

## 测试清单

| # | 测试 | 方法 | 通过条件 |
|---|------|------|----------|
| 1 | AudioContext 启动 | 首次 pointerdown 后检查 ctx.state | `'running'` |
| 2 | 主音量 = 0 | 设置后触发所有音源 | 无声音 |
| 3 | 盖革频率映射 | 设 doseRate = 0.01, 1, 100, 1000 | 咔哒频率符合 §5.2 表 |
| 4 | 报警叠加 | 同时 start П1 + П3 + П9 | 三个音色可分辨 |
| 5 | 报警确认 | start → acknowledge | 50ms 内静音 |
| 6 | 泵减速 | stopPump | 3s 内频率降至 10Hz 后停 |
| 7 | 断电 | 调用 accident 序列 T+8s | 所有电子音 0.5s 内消失 |
| 8 | 内存 | 触发 100 次 one-shot 音效 | 无节点泄漏（DevTools Memory） |
| 9 | 性能 | 8 泵 + 3 报警 + 盖革 + 环境 | CPU < 5% |
| 10 | Ducking | 报警触发时 | 环境层音量降至 50% |
| 11 | 电话铃 | startRing → 3s 后 stopRing | 铃声响 2 次后停 |
| 12 | Safari 兼容 | Safari 15 打开 | AudioContext 正常（需 webkit 前缀） |

## 文件依赖

```
audio/engine.js     ← 无依赖
audio/synth.js      ← 无依赖
audio/ambient.js    ← engine, synth
audio/equipment.js  ← engine, synth
audio/events.js     ← engine, synth
audio/alarms.js     ← engine, synth
audio/narrative.js  ← engine, synth
audio/mixer.js      ← engine
```

外部依赖：无。
音频文件：无。
npm 包：无。
