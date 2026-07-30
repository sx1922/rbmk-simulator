# 存档与进度系统 — Система Сохранения

## 设计哲学

存档的 diegetic 形式：值班日志（Вахтенный журнал）。每个核电站都有。每次操作都记录在案。你不能"删除存档"——你只能"归档"。你不能"覆盖"——你只能"新增一条记录"。

核心原则：
- 存档是记录，不是状态快照。不存"游戏进行到哪里了"。存"发生了什么事"。
- 没有"自动存档"。只有"记录"。记录在事件发生时自动写入（像真实日志）。
- 没有"存档槽位"。只有一本日志。按时间顺序排列。
- 数据极小。全部是文本和数字。没有截图。没有缩略图。
- 玩家可以"查看档案"但不能"读取存档"。没有"Continue"按钮。只有"开始新班次"。

## 存储位置

### Web 端

```js
const STORAGE_KEY = 'rbmk_journal';
```

为什么不用 IndexedDB：
- 数据量极小（< 50KB）
- 不需要结构化查询
- localStorage 更简单、更可靠
- 玩家清除浏览器数据 = "日志丢失"（可以接受）

### Love2D 端

```
-- love.filesystem.getSaveDirectory()
-- 文件：journal.json
-- 路径：~/.local/share/love/rbmk/journal.json (Linux)
--       ~/Library/Application Support/love/rbmk/journal.json (macOS)
--       %APPDATA%/love/rbmk/journal.json (Windows)
```

### 导出 / 导入

玩家可以"导出日志"（下载 JSON 文件）。可以"导入日志"（上传 JSON 文件）。

Diegetic 理由："交接记录"。你调到另一个电站，带走你的日志。
实际理由：换电脑、备份、浏览器清除数据后恢复。

## 数据结构

### 顶层结构

```ts
interface Journal {
  version: number;           // 数据格式版本，当前 = 1
  created: number;           // 日志创建时间（Unix ms）
  lastModified: number;      // 最后写入时间

  operator: OperatorRecord;  // 操作员信息
  settings: Settings;        // 游戏设置
  entries: Entry[];          // 所有记录（按时间排序）
  campaign: CampaignState;   // 战役状态
  statistics: Statistics;    // 累计统计
}
```

### 操作员

```ts
interface OperatorRecord {
  callsign: string;          // 玩家输入的名字，默认 "Оператор БЩУ"
  shiftCount: number;        // 总班次数（= 总游玩次数）
  firstShift: number;        // 第一次值班时间
  lastShift: number;         // 最后一次值班时间
}
```

### 设置

```ts
interface Settings {
  masterVolume: number;      // 0–1, default 0.8
  busVolumes: {
    ambient: number;         // 0–1
    equipment: number;
    events: number;
    alarms: number;
    narrative: number;
  };
  language: 'ru' | 'zh' | 'en';
  textSpeed: number;         // 打字机速度，1–5, default 3
  screenShake: boolean;      // 事故时屏幕震动，default true
  showTooltips: boolean;     // 鼠标悬停提示，default true
}
```

### 记录条目（核心）

```ts
interface Entry {
  id: string;                // UUID
  timestamp: number;         // Unix ms
  type: EntryType;
  scenarioId: string;        // 'scenario_1' | 'scenario_2' | 'scenario_3'
  data: ScenarioScore;       // 见 SCORING.md
  duration: number;          // 场景持续时长（ms）
  outcome: 'normal' | 'accident_prevented' | 'accident';
}

type EntryType = 'shift_report';
// 预留扩展：
// | 'incident_report'   // 事故报告（场景 3 失败）
// | 'note'              // 玩家手动笔记（未来功能）
```

### 战役状态

```ts
interface CampaignState {
  active: boolean;
  currentScenario: number;
  scenarioResults: {
    scenarioId: string;
    outcome: 'normal' | 'accident_prevented' | 'accident';
    score: ScenarioScore | null;
  }[];
  completed: boolean;
  overallRating: Rating | null;
  recommendation: string | null;
}
```

### 累计统计

```ts
interface Statistics {
  totalShifts: number;
  totalPlayTime: number;
  scenariosCompleted: {
    scenario_1: number;
    scenario_2: number;
    scenario_3: number;
  };
  accidentsPrevented: number;
  accidents: number;
  bestScores: {
    scenario_1: DimensionScores | null;
    scenario_2: DimensionScores | null;
    scenario_3: DimensionScores | null;
  };
  totalAlarmsTriggered: number;
  totalAZ5Presses: number;
  totalPumpsStopped: number;
  totalRodsMoved: number;
}

interface DimensionScores {
  procedure: number;
  safety: number;
  response: number;
  equipment: number;
  completeness: number;
}
```

## 读写 API

### Web 端

```js
// save/journal.js

const STORAGE_KEY = 'rbmk_journal';
const CURRENT_VERSION = 1;

/**
 读取日志。不存在则创建新的。
 */
export function loadJournal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createNewJournal();

    const journal = JSON.parse(raw);

    if (journal.version < CURRENT_VERSION) {
      return migrate(journal, CURRENT_VERSION);
    }

    return journal;
  } catch (e) {
    console.error('[save] Failed to load journal:', e);
    return createNewJournal();
  }
}

/**
 写入日志。每次写入都是全量序列化（数据小，无所谓）。
 */
export function saveJournal(journal) {
  journal.lastModified = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
  } catch (e) {
    console.error('[save] Failed to save journal:', e);
    if (e.name === 'QuotaExceededError') {
      journal.entries = journal.entries.slice(-20);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
      } catch (e2) {
        console.error('[save] Still failed after trim:', e2);
      }
    }
  }
}

function createNewJournal() {
  return {
    version: CURRENT_VERSION,
    created: Date.now(),
    lastModified: Date.now(),
    operator: {
      callsign: 'Оператор БЩУ',
      shiftCount: 0,
      firstShift: null,
      lastShift: null,
    },
    settings: defaultSettings(),
    entries: [],
    campaign: {
      active: false,
      currentScenario: 0,
      scenarioResults: [],
      completed: false,
      overallRating: null,
      recommendation: null,
    },
    statistics: emptyStatistics(),
  };
}

function defaultSettings() {
  return {
    masterVolume: 0.8,
    busVolumes: { ambient: 1, equipment: 1, events: 1, alarms: 1, narrative: 1 },
    language: 'zh',
    textSpeed: 3,
    screenShake: true,
    showTooltips: true,
  };
}

function emptyStatistics() {
  return {
    totalShifts: 0,
    totalPlayTime: 0,
    scenariosCompleted: { scenario_1: 0, scenario_2: 0, scenario_3: 0 },
    accidentsPrevented: 0,
    accidents: 0,
    bestScores: { scenario_1: null, scenario_2: null, scenario_3: null },
    totalAlarmsTriggered: 0,
    totalAZ5Presses: 0,
    totalPumpsStopped: 0,
    totalRodsMoved: 0,
  };
}
```

### 写入时机

```js
/**
 场景结束时调用
 */
export function recordShiftEnd(journal, scenarioId, score, duration) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: 'shift_report',
    scenarioId,
    data: score,
    duration,
    outcome: score.outcome,
  };

  journal.entries.push(entry);
  journal.operator.shiftCount++;
  journal.operator.lastShift = Date.now();
  if (!journal.operator.firstShift) {
    journal.operator.firstShift = Date.now();
  }

  updateStatistics(journal.statistics, entry);

  if (journal.campaign.active) {
    updateCampaign(journal.campaign, entry);
  }

  saveJournal(journal);
}

/**
 设置变更时调用
 */
export function recordSettingsChange(journal, newSettings) {
  journal.settings = newSettings;
  saveJournal(journal);
}

/**
 导出
 */
export function exportJournal(journal) {
  const name = '\u0432\u0430\u0445\u0442\u0435\u043d\u043D\u044B\u0436\u0443\u0440\u043D\u0430\u043B' +
    new Date().toISOString().slice(0,10) + '.json';
  const blob = new Blob([JSON.stringify(journal, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 导入
 */
export function importJournal(jsonString) {
  try {
    const journal = JSON.parse(jsonString);
    if (journal.version !== CURRENT_VERSION) {
      throw new Error('Unsupported version: ' + journal.version);
    }
    if (!journal.entries || !journal.settings || !journal.operator) {
      throw new Error('Invalid journal structure');
    }
    saveJournal(journal);
    return journal;
  } catch (e) {
    console.error('[save] Import failed:', e);
    return null;
  }
}
```

### 统计更新

```js
function updateStatistics(stats, entry) {
  stats.totalShifts++;
  stats.totalPlayTime += entry.duration;
  stats.scenariosCompleted[entry.scenarioId]++;

  if (entry.scenarioId === 'scenario_3') {
    if (entry.outcome === 'accident_prevented') stats.accidentsPrevented++;
    if (entry.outcome === 'accident') stats.accidents++;
  }

  if (entry.outcome !== 'accident' && entry.data) {
    const best = stats.bestScores[entry.scenarioId];
    const avg = averageScore(entry.data.dimensions);
    if (!best || avg > averageScore(best)) {
      stats.bestScores[entry.scenarioId] = { ...entry.data.dimensions };
    }
  }
}

function averageScore(dimensions) {
  const vals = Object.values(dimensions);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
```

### 战役更新

```js
function updateCampaign(campaign, entry) {
  campaign.scenarioResults.push({
    scenarioId: entry.scenarioId,
    outcome: entry.outcome,
    score: entry.outcome === 'accident' ? null : entry.data,
  });

  if (entry.scenarioId === 'scenario_3' && entry.outcome === 'accident') {
    campaign.completed = true;
    campaign.active = false;
    campaign.overallRating = null;
    campaign.recommendation = null;
    return;
  }

  campaign.currentScenario++;
  if (campaign.currentScenario >= 3) {
    campaign.completed = true;
    campaign.active = false;

    const scores = campaign.scenarioResults
      .filter(r => r.score !== null)
      .map(r => averageScore(r.score.dimensions));
    const overall = scores.reduce((a, b) => a + b, 0) / scores.length;

    campaign.overallRating = scoreToRating(overall);
    campaign.recommendation = getRecommendation(overall);
  }
}

function scoreToRating(score) {
  if (score >= 0.95) return 'отлично';
  if (score >= 0.80) return 'хорошо';
  if (score >= 0.60) return 'удовлетворительно';
  if (score >= 0.40) return 'неудовлетворительно';
  return 'аварийная';
}

function getRecommendation(score) {
  if (score >= 0.80) return 'Допустить к самостоятельной работе на БЩУ.';
  if (score >= 0.60) return 'Допустить к работе под наблюдением начальника смены.';
  return 'Направить на повторное обучение.';
}
```

## 版本迁移

```js
/**
 数据格式迁移
 当 journal.version < targetVersion 时逐步升级
 */
function migrate(journal, targetVersion) {
  let j = { ...journal };

  // v0 → v1（示例，目前只有 v1）
  // if (j.version === 0) {
  //   j.statistics = emptyStatistics();
  //   j.version = 1;
  // }

  j.version = targetVersion;
  saveJournal(j);
  return j;
}
```

## 数据完整性

### 校验

```js
/**
 简单校验（不做加密——这不是防作弊游戏）
 */
export function validateJournal(journal) {
  const errors = [];

  if (typeof journal.version !== 'number') errors.push('missing version');
  if (!Array.isArray(journal.entries)) errors.push('entries not array');
  if (!journal.settings) errors.push('missing settings');
  if (!journal.operator) errors.push('missing operator');

  for (let i = 1; i < journal.entries.length; i++) {
    if (journal.entries[i].timestamp < journal.entries[i-1].timestamp) {
      errors.push('entry ' + i + ' out of order');
    }
  }

  return { valid: errors.length === 0, errors };
}
```

### 损坏恢复

```js
/**
 备份策略：每次写入前，将上一版本存入 'rbmk_journal_bak'
 */
export function saveJournalWithBackup(journal) {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) {
    localStorage.setItem(STORAGE_KEY + '_bak', current);
  }
  saveJournal(journal);
}

export function recoverFromBackup() {
  const bak = localStorage.getItem(STORAGE_KEY + '_bak');
  if (bak) {
    try {
      const journal = JSON.parse(bak);
      const { valid } = validateJournal(journal);
      if (valid) {
        localStorage.setItem(STORAGE_KEY, bak);
        return journal;
      }
    } catch (e) {}
  }
  return null;
}
```

## UI 呈现

### 主菜单

主菜单不是"菜单"。是值班室的门。

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│         ЧЕРНОБЫЛЬСКАЯ АЭС им. В.И. Ленина          │
│         Блок №4. БЩУ.                              │
│                                                     │
│         ┌─────────────────────────────┐             │
│         │  НАЧАТЬ СМЕНУ               │  ← 新班次  │
│         │  (Начать новую смену)       │             │
│         └─────────────────────────────┘             │
│                                                     │
│         ┌─────────────────────────────┐             │
│         │  ВАХТЕННЫЙ ЖУРНАЛ           │  ← 查看档案│
│         │  (Просмотр записей)         │             │
│         └─────────────────────────────┘             │
│                                                     │
│         ┌─────────────────────────────┐             │
│         │  НАСТРОЙКИ                  │  ← 设置    │
│         └─────────────────────────────┘             │
│                                                     │
│         Оператор: Оператор БЩУ                      │
│         Смен отработано: 12                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

没有"Continue"。没有"Load Game"。你每次都是"开始新班次"。过去的记录在日志里。你不能"回到过去"。

### 日志查看

```
┌─────────────────────────────────────────────────────┐
│  ВАХТЕННЫЙ ЖУРНАЛ                                   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  №12  26.04.1986 03:41   Блок 4   Смена 3         │
│  Исход: Авария предотвращена                        │
│  Регламент: Хорошо | Безопасность: Отлично          │
│  [Подробнее →]                                      │
│  ─────────────────────────────────────────────────  │
│  №11  26.04.1986 02:15   Блок 4   Смена 2         │
│  Исход: Штатный                                     │
│  Регламент: Удовл. | Безопасность: Хорошо           │
│  [Подробнее →]                                      │
│  ─────────────────────────────────────────────────  │
│  №10  25.04.1986 23:00   Блок 4   Смена 1         │
│  Исход: Авария                                      │
│  [Нет рапорта]                                      │
│  ─────────────────────────────────────────────────  │
│  ...                                                │
│                                                     │
│  [Экспорт]  [Импорт]                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

点击 [Подробнее] → 显示完整报告（同 SCORING.md §5.1 格式）。事故条目没有报告。只有"Нет рапорта"（无报告）。

### 设置面板

```
┌─────────────────────────────────────────────────────┐
│  НАСТРОЙКИ                                          │
│                                                     │
│  Громкость                                          │
│  ├─ Общая .............. [████████░░] 80%           │
│  ├─ Окружение .......... [██████████] 100%          │
│  ├─ Оборудование ....... [██████████] 100%          │
│  ├─ Сигнализация ....... [██████████] 100%          │
│  └─ Переговоры ......... [██████████] 100%          │
│                                                     │
│  Язык: [Русский | 中文 | English]                   │
│                                                     │
│  Скорость текста: [1] [2] [3●] [4] [5]             │
│                                                     │
│  Тряска экрана: [✓]                                 │
│  Подсказки: [✓]                                     │
│                                                     │
│  Оператор: [Оператор БЩУ        ]                   │
│                                                     │
│  [Сохранить]                                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Love2D 端实现

```lua
-- save/journal.lua

local json = require('lib/json')

local Journal = {}
Journal.__index = Journal

local SAVE_FILE = 'journal.json'
local BACKUP_FILE = 'journal_bak.json'

function Journal.load()
  local content = love.filesystem.read(SAVE_FILE)
  if not content then
    return Journal.new()
  end

  local ok, data = pcall(json.decode, content)
  if not ok then
    local bak = love.filesystem.read(BACKUP_FILE)
    if bak then
      ok, data = pcall(json.decode, bak)
      if ok then return data end
    end
    return Journal.new()
  end

  return data
end

function Journal.save(journal)
  journal.lastModified = os.time() * 1000

  local current = love.filesystem.read(SAVE_FILE)
  if current then
    love.filesystem.write(BACKUP_FILE, current)
  end

  local ok, encoded = pcall(json.encode, journal)
  if ok then
    love.filesystem.write(SAVE_FILE, encoded)
  end
end

function Journal.new()
  return {
    version = 1,
    created = os.time() * 1000,
    lastModified = os.time() * 1000,
    operator = {
      callsign = 'Оператор БЩУ',
      shiftCount = 0,
      firstShift = nil,
      lastShift = nil,
    },
    settings = {
      masterVolume = 0.8,
      busVolumes = { ambient = 1, equipment = 1, events = 1, alarms = 1, narrative = 1 },
      language = 'zh',
      textSpeed = 3,
      screenShake = true,
      showTooltips = true,
    },
    entries = {},
    campaign = {
      active = false,
      currentScenario = 1,
      scenarioResults = {},
      completed = false,
      overallRating = nil,
      recommendation = nil,
    },
    statistics = {
      totalShifts = 0,
      totalPlayTime = 0,
      scenariosCompleted = { scenario_1 = 0, scenario_2 = 0, scenario_3 = 0 },
      accidentsPrevented = 0,
      accidents = 0,
      bestScores = { scenario_1 = nil, scenario_2 = nil, scenario_3 = nil },
      totalAlarmsTriggered = 0,
      totalAZ5Presses = 0,
      totalPumpsStopped = 0,
      totalRodsMoved = 0,
    },
  }
end

function Journal.export(journal)
  local encoded = json.encode(journal)
  local name = 'export_' .. os.date('%Y%m%d') .. '.json'
  love.filesystem.write(name, encoded)
  return love.filesystem.getSaveDirectory() .. '/' .. name
end

return Journal
```

## 数据量估算

| 项目 | 大小 |
|------|------|
| 单条 entry | ~500 bytes（JSON） |
| 100 次游玩 | ~50 KB |
| 1000 次游玩 | ~500 KB |
| localStorage 限制 | 5–10 MB |
| Love2D 文件系统 | 无实际限制 |

结论：永远不需要清理。但保留 trim 逻辑作为防御性编程。

## 隐私

- 不收集任何数据。
- 不发送任何请求。
- 不存 IP。不存设备信息。
- 所有数据在本地。
- 导出文件是纯 JSON，玩家可以用文本编辑器打开。
- 没有加密。没有混淆。如果玩家想改自己的成绩——随便。这不是竞技游戏。没有人在意。

## 边界情况

| 情况 | 处理 |
|------|------|
| 首次打开（无存档） | 创建新日志，operator.callsign = 默认值 |
| localStorage 被禁用 | 游戏正常运行，但不保存。提示一次。 |
| JSON 解析失败 | 尝试备份 → 失败则新建 |
| 版本不匹配 | 迁移函数处理 |
| 导入格式错误 | 拒绝导入，提示错误 |
| 导入版本过旧 | 迁移后导入 |
| 场景中途关闭浏览器 | 不保存。下次是新班次。没有"断点续传"。 |
| 同时打开两个标签页 | 后写入的覆盖先写入的。可接受。 |

### 为什么没有"断点续传"

因为值班不能"暂停后继续"。你离开了控制室，班次就结束了。下次来是新的班次。这是设计决策，不是技术限制。

## 验收标准

| # | 测试 | 通过条件 |
|---|------|----------|
| 1 | 首次启动 | 创建新日志，主菜单显示"Смен отработано: 0" |
| 2 | 完成场景 1 | 日志新增一条 entry，shiftCount = 1 |
| 3 | 关闭重开 | 日志持久化，主菜单显示正确班次 |
| 4 | 导出 | 下载 JSON 文件，可被文本编辑器打开 |
| 5 | 导入 | 上传有效 JSON，日志恢复 |
| 6 | 导入无效文件 | 拒绝，显示错误提示 |
| 7 | 损坏恢复 | 手动破坏 localStorage → 从备份恢复 |
| 8 | 备份也损坏 | 创建新日志，不崩溃 |
| 9 | 战役完成 | campaign.completed = true，总评正确 |
| 10 | 战役失败（场景 3 事故） | overallRating = null，无 recommendation |
| 11 | 设置持久化 | 改音量 → 关闭 → 重开 → 音量保持 |
| 12 | 100 次游玩 | 日志大小 < 100KB，无性能问题 |
| 13 | Love2D 端 | 同样的读写逻辑，文件在正确路径 |
| 14 | 场景中途退出 | 不写入 entry，不崩溃 |

## 不做的事

- 不做云存档。没有服务器。
- 不做多存档槽位。一本日志就够了。
- 不做"删除存档"。你可以导出后清空 localStorage。但 UI 里不提供"删除"按钮。日志不应该被删除。这是原则。
- 不做截图 / 缩略图。纯文本。
- 不做回放。不记录操作序列（太大了，也没必要）。
- 不做成就解锁通知。统计在日志里，但不弹窗。
- 不做"新纪录！"提示。最佳成绩静默更新。
