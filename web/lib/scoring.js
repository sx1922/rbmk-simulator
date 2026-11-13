export var RATINGS = [
  { min: 0.95, rating: '\u043E\u0442\u043B\u0438\u0447\u043D\u043E',   cn: '\u4F18\u79C0',   meaning: '\u65E0\u53EF\u5A49\u4E5F' },
  { min: 0.80, rating: '\u0445\u043E\u0440\u043E\u0448\u043E',      cn: '\u826F\u597D',   meaning: '\u6709\u5C0F\u7455\u75B5' },
  { min: 0.60, rating: '\u0443\u0434\u043E\u0432\u043B\u0435\u0442\u0432\u043E\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E', cn: '\u5408\u683C',   meaning: '\u52C9\u5F3A\u901A\u8FC7' },
  { min: 0.40, rating: '\u043D\u0435\u0443\u0434\u043E\u0432\u043B\u0435\u0442\u0432\u043E\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E', cn: '\u4E0D\u5408\u683C', meaning: '\u9700\u8981\u8C08\u8BDD' },
  { min: 0,    rating: '\u0430\u0432\u0430\u0440\u0438\u0439\u043D\u0430\u044F \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044F', cn: '\u4E8B\u6545\u72B6\u6001', meaning: '\u4F60\u88AB\u5F00\u9664\u4E86' },
];

export function ratingFromScore(score) {
  for (var i = 0; i < RATINGS.length; i++) {
    if (score >= RATINGS[i].min) return RATINGS[i];
  }
  return RATINGS[RATINGS.length - 1];
}

// ================== OperationLog ==================

export function OperationLog() {
  this.entries = [];
}

OperationLog.prototype.record = function(action, params) {
  params = params || {};
  this.entries.push({ action: action, time: Date.now(), params: params });
};

OperationLog.prototype.getActions = function() {
  return this.entries.map(function(e) { return e.action; });
};

OperationLog.prototype.hasAction = function(action) {
  return this.entries.some(function(e) { return e.action === action; });
};

function isSorted(arr) {
  for (var i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) return false;
  }
  return true;
}

// ================== evaluateProcedure ==================

export function evaluateProcedure(log, expected) {
  var score = 1.0;
  var playerActions = log.getActions();
  var required = expected.filter(function(s) { return s.required; });
  var requiredCount = required.length;

  for (var i = 0; i < required.length; i++) {
    if (!playerActions.includes(required[i].action)) {
      score -= 0.8 / requiredCount;
    }
  }

  var indices = [];
  for (var j = 0; j < required.length; j++) {
    var idx = playerActions.indexOf(required[j].action);
    if (idx >= 0) indices.push(idx);
  }
  if (indices.length > 1 && !isSorted(indices)) {
    score -= 0.2;
  }

  return Math.max(0, score);
}

// ================== SafetyEnvelopeTracker ==================

export function SafetyEnvelopeTracker(paramDefs) {
  this.defs = paramDefs || [];
  this.samples = [];
  this.sampleInterval = 500;
  this._timer = null;
}

SafetyEnvelopeTracker.prototype._inRange = function(v, range) {
  return v >= range[0] && v <= range[1];
};

SafetyEnvelopeTracker.prototype.start = function(getState) {
  var self = this;
  this._timer = setInterval(function() {
    var state = getState();
    self.samples.push({ time: Date.now(), values: Object.assign({}, state) });
  }, this.sampleInterval);
};

SafetyEnvelopeTracker.prototype.stop = function() {
  if (this._timer) { clearInterval(this._timer); this._timer = null; }
};

SafetyEnvelopeTracker.prototype.evaluate = function() {
  var total = this.samples.length;
  if (total === 0) return 1.0;
  var warnTicks = 0;
  var dangerTicks = 0;
  var dangerSustained = {};

  for (var i = 0; i < this.samples.length; i++) {
    var sample = this.samples[i];
    for (var j = 0; j < this.defs.length; j++) {
      var def = this.defs[j];
      var v = sample.values[def.name];
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

  var warnRatio = warnTicks / (total * this.defs.length);
  var dangerRatio = dangerTicks / (total * this.defs.length);
  return Math.max(0, 1.0 - warnRatio * 0.3 - dangerRatio * 1.0);
};

// ================== ResponseTracker ==================

export function ResponseTracker() {
  this.events = [];
}

ResponseTracker.prototype.onAlarmTrigger = function(code, selfCaused) {
  this.events.push({
    code: code, triggerTime: Date.now(), responseTime: null, selfCaused: !!selfCaused
  });
};

ResponseTracker.prototype.onCorrectAction = function(code) {
  var events = this.events.filter(function(e) { return e.code === code && e.responseTime === null; });
  if (events.length > 0) {
    events[events.length - 1].responseTime = Date.now();
  }
};

ResponseTracker.prototype.evaluate = function() {
  if (this.events.length === 0) return 1.0;
  var totalScore = 0;
  var totalWeight = 0;

  for (var i = 0; i < this.events.length; i++) {
    var e = this.events[i];
    var weight = e.selfCaused ? 2 : 1;
    var score;
    if (e.responseTime === null) {
      score = 0;
    } else {
      var dt = (e.responseTime - e.triggerTime) / 1000;
      if (dt < 5)       score = 1.0;
      else if (dt < 15) score = 0.9;
      else if (dt < 30) score = 0.7;
      else if (dt < 60) score = 0.4;
      else              score = 0.1;
    }
    totalScore += score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? totalScore / totalWeight : 1.0;
};

// ================== EquipmentTracker ==================

var PENALTY_MAP = {
  'PROTECTION_UNNECESSARY': 0.15,
  'SAFETY_VALVE': 0.2,
  'PUMP_CAVITATION': 0.1,
  'FUEL_CHANNEL_DAMAGE': 0.5,
  'AZ5_UNNECESSARY': 0.3,
  'AZ5_CORRECT': 0,
  'EQUIPMENT_DESTROYED': 1.0,
};

export function EquipmentTracker() {
  this.penalties = 0;
  this.events = [];
}

EquipmentTracker.prototype.record = function(type, params) {
  params = params || {};
  var penalty = PENALTY_MAP[type] || 0;
  this.penalties += penalty;
  this.events.push({ type: type, penalty: penalty, time: Date.now(), params: params });
  if (type === 'EQUIPMENT_DESTROYED') {
    this.penalties = 1.0;
  }
};

EquipmentTracker.prototype.evaluate = function() {
  return Math.max(0, 1.0 - this.penalties);
};

// ================== LogCompleteness ==================

export function LogCompleteness(requiredFields) {
  this.required = requiredFields || [];
  this.filled = {};
}

LogCompleteness.prototype.onFieldWritten = function(fieldId) {
  this.filled[fieldId] = true;
};

LogCompleteness.prototype.isFilled = function(fieldId) {
  return !!this.filled[fieldId];
};

LogCompleteness.prototype.getMissing = function() {
  var self = this;
  return this.required.filter(function(f) { return !self.filled[f]; });
};

LogCompleteness.prototype.evaluate = function() {
  if (this.required.length === 0) return 1.0;
  var self = this;
  var filledCount = this.required.filter(function(f) { return self.filled[f]; }).length;
  return filledCount / this.required.length;
};

// ================== Remarks Generation ==================

var EQUIPMENT_REMARK_TEXT = {
  'PROTECTION_UNNECESSARY': '\u4FDD\u62A4\u4E0D\u5FC5\u8981\u89E6\u53D1',
  'SAFETY_VALVE': '\u5B89\u5168\u9600\u8D77\u8DF3',
  'PUMP_CAVITATION': '\u6CF5\u6C14\u8680',
  'FUEL_CHANNEL_DAMAGE': '\u71C3\u6599\u901A\u9053\u635F\u574F',
  'AZ5_UNNECESSARY': '\u975E\u7D27\u6025\u60C5\u51B5\u4E0B\u89E6\u53D1 AZ-5',
  'EQUIPMENT_DESTROYED': '\u8BBE\u5907\u5B8C\u5168\u635F\u574F',
};

var FIELD_NAMES = {};

export function registerFieldName(fieldId, cn) {
  FIELD_NAMES[fieldId] = cn;
}

export function generateRemarks(scores, trackers) {
  var remarks = [];

  if (scores.procedure < 0.8) {
    if (trackers.procedure && trackers.procedure.getOrderErrors) {
      var orderErrors = trackers.procedure.getOrderErrors();
      for (var i = 0; i < orderErrors.length; i++) {
        remarks.push('\u64CD\u4F5C\u987A\u5E8F\u9519\u8BEF: ' + orderErrors[i].description);
      }
    }
  }

  if (scores.safety < 0.8) {
    if (trackers.safety && trackers.safety.getWorstViolations) {
      var violations = trackers.safety.getWorstViolations(3);
      for (var j = 0; j < violations.length; j++) {
        remarks.push(violations[j].paramName + ' \u8D85\u51FA\u6B63\u5E38\u8303\u56F4 ' + violations[j].duration + 's');
      }
    }
  }

  if (scores.response < 0.8) {
    if (trackers.response && trackers.response.getSlowResponses) {
      var slow = trackers.response.getSlowResponses(30);
      for (var k = 0; k < slow.length; k++) {
        remarks.push(slow[k].code + ' \u62A5\u8B66\u54CD\u5E94\u65F6\u95F4 ' + slow[k].seconds + '\u0441, \u8D85\u51FA\u6807\u51C6');
      }
    }
  }

  if (scores.equipment < 0.9) {
    if (trackers.equipment && trackers.equipment.events) {
      for (var m = 0; m < trackers.equipment.events.length; m++) {
        var text = EQUIPMENT_REMARK_TEXT[trackers.equipment.events[m].type];
        if (text) remarks.push(text);
      }
    }
  }

  if (scores.completeness < 1.0) {
    if (trackers.completeness && trackers.completeness.getMissing) {
      var missing = trackers.completeness.getMissing();
      for (var n = 0; n < missing.length; n++) {
        var name = FIELD_NAMES[missing[n]] || missing[n];
        remarks.push('\u672A\u8BB0\u5F55: ' + name);
      }
    }
  }

  if (remarks.length === 0) {
    remarks.push('\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0439 \u043D\u0435\u0442.');
  }

  return remarks;
}

// ================== Report Generation ==================

export function generateReport(scores, ratings, remarks, context) {
  context = context || {};
  var lines = [];
  var line = function(t) { lines.push(t); };
  var pad = function(s, len) {
    s = String(s);
    while (s.length < len) s += ' ';
    return s;
  };

  line('\u250C' + '\u2500'.repeat(53) + '\u2510');
  line('\u2502  \u0427\u0415\u0420\u041D\u041E\u0411\u042B\u041B\u042C\u0421\u041A\u0410\u042F \u042D\u0421 \u0438\u043C. \u0412.\u0418. \u041B\u0435\u043D\u0438\u043D\u0430' + ' '.repeat(6) + '\u2502');
  line('\u2502  \u0411\u043B\u043E\u043A \u21164' + ' '.repeat(39) + '\u2502');
  line('\u2502' + ' '.repeat(53) + '\u2502');
  line('\u2502  \u0421\u041C\u0415\u041D\u041D\u042B\u0419 \u0420\u0410\u041F\u041E\u0420\u0422' + ' '.repeat(22) + '\u2502');
  line('\u2502  \u0414\u0430\u0442\u0430: ' + (context.date || '26.04.1986') + '    \u0421\u043C\u0435\u043D\u0430: ' + (context.shift || '3') + ' '.repeat(17) + '\u2502');
  line('\u2502  \u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440: ' + (context.operator || '\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0411\u0429\u0423') + ' '.repeat(12) + '\u2502');
  line('\u2502' + ' '.repeat(53) + '\u2502');
  line('\u2502  ' + '\u2500'.repeat(51) + '\u2502');
  line('\u2502' + ' '.repeat(53) + '\u2502');

  var dimNames = {
    procedure: '\u0421\u043E\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u0435 \u0440\u0435\u0433\u043B\u0430\u043C\u0435\u043D\u0442\u0430',
    safety: '\u0417\u0430\u043F\u0430\u0441 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u0438',
    response: '\u0412\u0440\u0435\u043C\u044F \u0440\u0435\u0430\u043A\u0446\u0438\u0438',
    equipment: '\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F',
    completeness: '\u041F\u043E\u043B\u043D\u043E\u0442\u0430 \u0437\u0430\u043F\u0438\u0441\u0435\u0439',
  };

  var dimKeys = ['procedure', 'safety', 'response', 'equipment', 'completeness'];
  for (var i = 0; i < dimKeys.length; i++) {
    var k = dimKeys[i];
    if (scores[k] === undefined) continue;
    var r = ratings[k];
    var label = pad(dimNames[k], 34);
    var ratingStr = pad(r ? r.rating : '-', 18);
    line('\u2502  ' + label + ratingStr + '\u2502');
  }

  line('\u2502' + ' '.repeat(53) + '\u2502');
  line('\u2502  ' + '\u2500'.repeat(51) + '\u2502');
  line('\u2502' + ' '.repeat(53) + '\u2502');
  line('\u2502  \u0417\u0410\u041C\u0415\u0427\u0410\u041D\u0418\u042F:' + ' '.repeat(30) + '\u2502');

  for (var j = 0; j < remarks.length; j++) {
    var rText = '\u00B7 ' + remarks[j];
    while (rText.length > 51) {
      var part = rText.substring(0, 51);
      var rest = rText.substring(51);
      line('\u2502  ' + part + ' '.repeat(53 - 2 - part.length) + '\u2502');
      rText = '  ' + rest;
    }
    line('\u2502  ' + rText + ' '.repeat(Math.max(0, 53 - 2 - rText.length)) + '\u2502');
  }

  line('\u2502' + ' '.repeat(53) + '\u2502');
  line('\u2502  \u041D\u0430\u0447\u0430\u043B\u044C\u043D\u0438\u043A \u0441\u043C\u0435\u043D\u044B: _______________' + ' '.repeat(8) + '\u2502');
  line('\u2502' + ' '.repeat(53) + '\u2502');
  line('\u2514' + '\u2500'.repeat(53) + '\u2518');

  return lines.join('\n');
}

// ================== ScenarioScore ==================

export function createScoreResult(scenarioId, dimensions, trackers, context) {
  var ratings = {};
  var dimKeys = Object.keys(dimensions);
  for (var i = 0; i < dimKeys.length; i++) {
    ratings[dimKeys[i]] = ratingFromScore(dimensions[dimKeys[i]]);
  }

  var remarks = generateRemarks(dimensions, trackers || {});

  return {
    scenarioId: scenarioId,
    timestamp: Date.now(),
    dimensions: Object.assign({}, dimensions),
    ratings: ratings,
    remarks: remarks,
    hidden: {
      iodinePitDepth: (trackers && trackers.iodinePitDepth) || 0,
      unnecessaryActions: (trackers && trackers.unnecessaryActions) || 0,
      hesitationTime: (trackers && trackers.hesitationTime) || 0,
    },
    outcome: context.outcome || 'normal',
    report: generateReport(dimensions, ratings, remarks, context),
  };
}

// ================== Campaign Scoring ==================

export function generateCampaignReport(scenarioScores) {
  if (!scenarioScores || scenarioScores.length < 3) return null;
  var lines = [];
  var line = function(t) { lines.push(t); };

  line('\u250C' + '\u2500'.repeat(53) + '\u2510');
  line('\u2502  \u0418\u0422\u041E\u0413\u041E\u0412\u042B\u0419 \u0420\u0410\u041F\u041E\u0420\u0422 \u0417\u0410 \u0421\u041C\u0415\u041D\u0423' + ' '.repeat(4) + '\u2502');
  line('\u2502' + ' '.repeat(53) + '\u2502');

  var avgScore = 0;
  var scenarioNames = ['\u0421\u043D\u0438\u0436\u0435\u043D\u0438\u0435 \u043C\u043E\u0449\u043D\u043E\u0441\u0442\u0438', '\u0418\u0441\u043F\u044B\u0442\u0430\u043D\u0438\u0435 \u0432\u044B\u0431\u0435\u0433\u0430', '\u0410\u0432\u0430\u0440\u0438\u044F'];

  for (var i = 0; i < scenarioScores.length && i < 3; i++) {
    var s = scenarioScores[i];
    var avg = 0;
    var count = 0;
    for (var k in s.dimensions) {
      if (s.dimensions.hasOwnProperty(k)) { avg += s.dimensions[k]; count++; }
    }
    avg = count > 0 ? avg / count : 0;
    avgScore += avg;

    var rating = ratingFromScore(avg);
    var namePad = scenarioNames[i] + ' '.repeat(30 - scenarioNames[i].length);
    line('\u2502  ' + (i + 1) + '. ' + namePad + pad(rating.rating, 18) + '\u2502');
  }

  line('\u2502' + ' '.repeat(53) + '\u2502');
  var overallAvg = avgScore / Math.min(scenarioScores.length, 3);
  var overallRating = ratingFromScore(overallAvg);
  line('\u2502  \u041E\u0431\u0449\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430 \u0441\u043C\u0435\u043D\u044B: ' + pad(overallRating.rating, 23) + '\u2502');

  var recommendation;
  if (overallAvg >= 0.8) {
    recommendation = '\u0414\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043A \u0441\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u0435 \u043D\u0430 \u0411\u0429\u0423.';
  } else if (overallAvg >= 0.6) {
    recommendation = '\u041D\u0430\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0435 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435.';
  } else {
    recommendation = '\u041E\u0442\u0441\u0442\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0442 \u0440\u0430\u0431\u043E\u0442\u044B \u043D\u0430 \u0411\u0429\u0423.';
  }

  line('\u2502  \u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u044F: ' + recommendation + ' '.repeat(Math.max(0, 11)) + '\u2502');
  line('\u2502' + ' '.repeat(53) + '\u2502');
  line('\u2514' + '\u2500'.repeat(53) + '\u2518');

  return {
    report: lines.join('\n'),
    overallScore: overallAvg,
    overallRating: overallRating,
    recommendation: recommendation,
  };
}
