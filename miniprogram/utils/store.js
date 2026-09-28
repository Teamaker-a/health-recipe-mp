/**
 * store.js - 本地持久化存储封装
 * 统一管理用户资料 / 收藏 / 打卡等数据，方便后续替换为服务端接口。
 */

const KEYS = {
  PROFILE: 'hr_profile',       // 身体数据
  FAVORITES: 'hr_favorites',   // 收藏的食谱 id 列表
  CHECKINS: 'hr_checkins',     // 打卡记录 { 'YYYY-MM-DD': {...} }
  PLAN: 'hr_plan',             // 最近生成的一日食谱方案
  WEEKPLAN: 'hr_weekplan',     // 周计划 { scene, days:[{date, meals:[{key,id}]}] }
  INITED: 'hr_inited'
};

function get(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    return (v === '' || v === null || v === undefined) ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function remove(key) {
  try { wx.removeStorageSync(key); } catch (e) { /* noop */ }
}

/** 首次启动初始化存储结构 */
function init() {
  if (get(KEYS.INITED, false)) return;
  set(KEYS.FAVORITES, []);
  set(KEYS.CHECKINS, {});
  set(KEYS.INITED, true);
}

/* ---------------- 用户资料 ---------------- */

const DEFAULT_PROFILE = {
  gender: 'female',        // male | female
  height: 165,             // cm
  weight: 55,              // kg
  age: 25,
  weeklyExercise: 3,       // 每周运动次数 0-7
  goal: 'maintain',        // muscle | fatloss | maintain
  activityAuto: true       // 是否用运动次数自动估算活动系数
};

function getProfile() {
  return Object.assign({}, DEFAULT_PROFILE, get(KEYS.PROFILE, {}));
}

function setProfile(profile) {
  const merged = Object.assign({}, DEFAULT_PROFILE, profile);
  set(KEYS.PROFILE, merged);
  return merged;
}

function hasProfile() {
  const p = get(KEYS.PROFILE, null);
  return !!(p && p.height && p.weight && p.age);
}

/* ---------------- 收藏 ---------------- */

function getFavorites() {
  const list = get(KEYS.FAVORITES, []);
  return Array.isArray(list) ? list : [];
}

function isFavorite(id) {
  return getFavorites().indexOf(id) > -1;
}

function toggleFavorite(id) {
  const list = getFavorites();
  const i = list.indexOf(id);
  if (i > -1) list.splice(i, 1);
  else list.unshift(id);
  set(KEYS.FAVORITES, list);
  return i === -1; // true 表示已收藏
}

/* ---------------- 打卡 ---------------- */

function dateKey(d) {
  const dt = d ? new Date(d) : new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCheckins() {
  const v = get(KEYS.CHECKINS, {});
  return (v && typeof v === 'object') ? v : {};
}

/**
 * 打卡/更新当日记录
 * @param {string} date  YYYY-MM-DD，默认今天
 * @param {object} patch 要合并的字段，如 { meals: [...], note: '' }
 */
function upsertCheckin(date, patch) {
  const all = getCheckins();
  const key = date || dateKey();
  const prev = all[key] || { date: key, meals: [], note: '', mealsDone: {} };
  all[key] = Object.assign({}, prev, patch, { date: key });
  set(KEYS.CHECKINS, all);
  return all[key];
}

function getCheckin(date) {
  const all = getCheckins();
  return all[date || dateKey()] || null;
}

/* ---------------- 最近方案 ---------------- */

function getPlan() {
  return get(KEYS.PLAN, null);
}

function setPlan(plan) {
  set(KEYS.PLAN, plan);
  return plan;
}

/* ---------------- 周计划 ---------------- */

function getWeekPlan() {
  return get(KEYS.WEEKPLAN, null);
}

function setWeekPlan(plan) {
  set(KEYS.WEEKPLAN, plan);
  return plan;
}

/** 取本周一的 0 点（按周一为一周开始） */
function mondayOfWeek(base) {
  const d = base ? new Date(base) : new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

module.exports = {
  KEYS,
  init,
  get,
  set,
  remove,
  DEFAULT_PROFILE,
  getProfile,
  setProfile,
  hasProfile,
  getFavorites,
  isFavorite,
  toggleFavorite,
  dateKey,
  getCheckins,
  getCheckin,
  upsertCheckin,
  getPlan,
  setPlan,
  getWeekPlan,
  setWeekPlan,
  mondayOfWeek
};
