// utils/format.js — 数值格式化

const Format = {};

Format.money = function(n) {
  var s = Math.abs(Math.round(n)).toString();
  var out = '';
  for (var i = s.length - 1, j = 0; i >= 0; i--, j++) {
    if (j > 0 && j % 3 === 0) out = ',' + out;
    out = s[i] + out;
  }
  return (n < 0 ? '-' : '') + out + ' ₽';
};

Format.pct = function(v, decimals) {
  decimals = decimals || 1;
  return (v * 100).toFixed(decimals) + '%';
};

Format.temp = function(c) {
  return Math.round(c) + '°C';
};

Format.power = function(mwt) {
  if (mwt >= 1000) return (mwt / 1000).toFixed(2) + ' GWt';
  return Math.round(mwt) + ' MWt';
};

Format.time = function(h, m, d, mo, y) {
  return y + '/' + mo + '/' + d + ' ' + ('0' + h).slice(-2) + ':00';
};
