var STORAGE_KEY = 'rbmk_journal';
var BACKUP_KEY = STORAGE_KEY + '_bak';
var CURRENT_VERSION = 1;

var DEFAULT_CALLSIGN = '\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0411\u0429\u0423';

export function setStorageKey(k) { STORAGE_KEY = k; }
export function getStorageKey() { return STORAGE_KEY; }

export function defaultSettings() {
  return {
    masterVolume: 0.8,
    busVolumes: { ambient: 1, equipment: 1, events: 1, alarms: 1, narrative: 1 },
    language: 'zh',
    textSpeed: 3,
    screenShake: true,
    showTooltips: true,
  };
}

export function emptyStatistics() {
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

export function createNewJournal() {
  return {
    version: CURRENT_VERSION,
    created: Date.now(),
    lastModified: Date.now(),
    operator: {
      callsign: DEFAULT_CALLSIGN,
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

function averageScore(dimensions) {
  var total = 0, count = 0;
  for (var k in dimensions) {
    if (dimensions.hasOwnProperty(k)) { total += dimensions[k]; count++; }
  }
  return count > 0 ? total / count : 0;
}

function scoreToRating(score) {
  if (score >= 0.95) return '\u043E\u0442\u043B\u0438\u0447\u043D\u043E';
  if (score >= 0.80) return '\u0445\u043E\u0440\u043E\u0448\u043E';
  if (score >= 0.60) return '\u0443\u0434\u043E\u0432\u043B\u0435\u0442\u0432\u043E\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E';
  if (score >= 0.40) return '\u043D\u0435\u0443\u0434\u043E\u0432\u043B\u0435\u0442\u0432\u043E\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E';
  return '\u0430\u0432\u0430\u0440\u0438\u0439\u043D\u0430\u044F';
}

function getRecommendation(score) {
  if (score >= 0.80) return '\u0414\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043A \u0441\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u0435 \u043D\u0430 \u0411\u0429\u0423.';
  if (score >= 0.60) return '\u0414\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043A \u0440\u0430\u0431\u043E\u0442\u0435 \u043F\u043E\u0434 \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u0435\u043C \u043D\u0430\u0447\u0430\u043B\u044C\u043D\u0438\u043A\u0430 \u0441\u043C\u0435\u043D\u044B.';
  return '\u041D\u0430\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0435 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435.';
}

function updateStatistics(stats, entry) {
  stats.totalShifts++;
  stats.totalPlayTime += entry.duration || 0;
  stats.scenariosCompleted[entry.scenarioId] = (stats.scenariosCompleted[entry.scenarioId] || 0) + 1;

  if (entry.scenarioId === 'scenario_3') {
    if (entry.outcome === 'accident_prevented') stats.accidentsPrevented++;
    if (entry.outcome === 'accident') stats.accidents++;
  }

  if (entry.outcome !== 'accident' && entry.data && entry.data.dimensions) {
    var best = stats.bestScores[entry.scenarioId];
    var avg = averageScore(entry.data.dimensions);
    if (!best || avg > averageScore(best)) {
      stats.bestScores[entry.scenarioId] = Object.assign({}, entry.data.dimensions);
    }
  }
}

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
    var scores = campaign.scenarioResults
      .filter(function(r) { return r.score !== null; })
      .map(function(r) { return averageScore(r.score.dimensions); });
    var overall = scores.reduce(function(a, b) { return a + b; }, 0) / scores.length;
    campaign.overallRating = scoreToRating(overall);
    campaign.recommendation = getRecommendation(overall);
  }
}

// ================== Storage adapter ==================

var storageAdapter = null;

export function setStorageAdapter(adapter) {
  storageAdapter = adapter;
}

export function getDefaultAdapter() {
  if (typeof localStorage !== 'undefined') {
    return {
      getItem: function(k) { return localStorage.getItem(k); },
      setItem: function(k, v) { localStorage.setItem(k, v); },
      removeItem: function(k) { localStorage.removeItem(k); },
    };
  }
  return null;
}

// ================== CRUD ==================

export function loadJournal() {
  var storage = storageAdapter || getDefaultAdapter();
  if (!storage) return createNewJournal();
  try {
    var raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createNewJournal();
    var journal = JSON.parse(raw);
    if (journal.version < CURRENT_VERSION) {
      return migrate(journal, CURRENT_VERSION);
    }
    return journal;
  } catch (e) {
    console.error('[save] Failed to load journal:', e);
    return createNewJournal();
  }
}

export function saveJournal(journal) {
  var storage = storageAdapter || getDefaultAdapter();
  if (!storage) return;
  journal.lastModified = Date.now();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(journal));
  } catch (e) {
    console.error('[save] Failed to save journal:', e);
    if (e.name === 'QuotaExceededError') {
      journal.entries = journal.entries.slice(-20);
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(journal));
      } catch (e2) {
        console.error('[save] Still failed after trim:', e2);
      }
    }
  }
}

export function saveJournalWithBackup(journal) {
  var storage = storageAdapter || getDefaultAdapter();
  if (!storage) return;
  var current = storage.getItem(STORAGE_KEY);
  if (current) {
    storage.setItem(BACKUP_KEY, current);
  }
  saveJournal(journal);
}

export function recoverFromBackup() {
  var storage = storageAdapter || getDefaultAdapter();
  if (!storage) return null;
  var bak = storage.getItem(BACKUP_KEY);
  if (bak) {
    try {
      var journal = JSON.parse(bak);
      var result = validateJournal(journal);
      if (result.valid) {
        storage.setItem(STORAGE_KEY, bak);
        return journal;
      }
    } catch (e) {}
  }
  return null;
}

export function recordShiftEnd(journal, scenarioId, score, duration) {
  var entry = {
    id: generateId(),
    timestamp: Date.now(),
    type: 'shift_report',
    scenarioId: scenarioId,
    data: score,
    duration: duration || 0,
    outcome: score ? score.outcome : 'normal',
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
  return entry;
}

export function recordSettingsChange(journal, newSettings) {
  journal.settings = newSettings;
  saveJournal(journal);
}

export function validateJournal(journal) {
  var errors = [];
  if (!journal || typeof journal !== 'object') { errors.push('not an object'); return { valid: false, errors: errors }; }
  if (typeof journal.version !== 'number') errors.push('missing version');
  if (!Array.isArray(journal.entries)) errors.push('entries not array');
  if (!journal.settings) errors.push('missing settings');
  if (!journal.operator) errors.push('missing operator');

  if (Array.isArray(journal.entries)) {
    for (var i = 1; i < journal.entries.length; i++) {
      if (journal.entries[i].timestamp < journal.entries[i - 1].timestamp) {
        errors.push('entry ' + i + ' out of order');
      }
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

export function importJournal(jsonString) {
  try {
    var journal = JSON.parse(jsonString);
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

export function exportJournalData(journal) {
  return JSON.stringify(journal, null, 2);
}

// ================== Migration ==================

function migrate(journal, targetVersion) {
  var j = Object.assign({}, journal);
  j.version = targetVersion;
  saveJournal(j);
  return j;
}

// ================== ID generation ==================

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
