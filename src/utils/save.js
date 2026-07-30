// utils/save.js — 存档(localStorage)

const Save = {};

Save.save = function() {
  try {
    var data = JSON.stringify(STATE);
    localStorage.setItem('rbmk_save', data);
    return true;
  } catch (e) {
    console.warn('Save failed:', e);
    return false;
  }
};

Save.load = function() {
  try {
    var data = localStorage.getItem('rbmk_save');
    if (!data) return false;
    var parsed = JSON.parse(data);
    Object.assign(STATE, parsed);
    return true;
  } catch (e) {
    console.warn('Load failed:', e);
    return false;
  }
};

Save.exists = function() {
  return localStorage.getItem('rbmk_save') !== null;
};

Save.remove = function() {
  localStorage.removeItem('rbmk_save');
};
