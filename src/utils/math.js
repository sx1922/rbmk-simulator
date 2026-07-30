// utils/math.js — 数学工具函数

const Utils = {};

Utils.clamp = function(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
};

Utils.lerp = function(a, b, t) {
  return a + (b - a) * t;
};

// 4 阶龙格-库塔
Utils.rk4 = function(f, y0, t, dt) {
  var k1 = f(t, y0);
  var k2 = f(t + dt / 2, y0.map(function(v, i) { return v + 0.5 * dt * k1[i]; }));
  var k3 = f(t + dt / 2, y0.map(function(v, i) { return v + 0.5 * dt * k2[i]; }));
  var k4 = f(t + dt, y0.map(function(v, i) { return v + dt * k3[i]; }));
  return y0.map(function(v, i) {
    return v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  });
};

Utils.sum = function(arr) {
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s;
};

Utils.avg = function(arr) {
  if (arr.length === 0) return 0;
  return Utils.sum(arr) / arr.length;
};
