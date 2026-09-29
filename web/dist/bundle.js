(function(){
var MODULES = {};
function __define(name, factory){ MODULES[name] = { factory: factory, exports: null }; }
function __req(name){
  var m = MODULES[name];
  if (!m) throw new Error("module not found: " + name);
  if (!m.exports) { m.exports = {}; var mod = { exports: m.exports }; m.factory(mod, m.exports, __req); m.exports = mod.exports; }
  return m.exports;
}

__define("utils/store", function(module, exports, __req){
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

});
__define("utils/nutrition", function(module, exports, __req){
/**
 * nutrition.js - 智能营养测算核心算法
 *
 * 公式说明（业内通用）：
 * 1) BMR 基础代谢 — Mifflin-St Jeor 公式（公认精度较高）
 *    男：BMR = 10*体重(kg) + 6.25*身高(cm) - 5*年龄 + 5
 *    女：BMR = 10*体重(kg) + 6.25*身高(cm) - 5*年龄 - 161
 * 2) TDEE 每日总消耗 = BMR * 活动系数（依据每周运动次数估算）
 * 3) 推荐摄入热量：依据目标做热量盈余/缺口调整
 *    增肌 +12% ；减脂 -18% ；维持 0%
 * 4) 三大营养素配比（按目标）：
 *    增肌  蛋白 2.0g/kg · 脂肪 25% · 其余碳水
 *    减脂  蛋白 2.2g/kg · 脂肪 25% · 其余碳水
 *    维持  蛋白 1.6g/kg · 脂肪 30% · 其余碳水
 */

const GOAL_LABELS = {
  muscle: '增肌',
  fatloss: '减脂',
  maintain: '日常健康维持'
};

const ACTIVITY_LEVELS = {
  0: { factor: 1.2,   label: '久坐（几乎不运动）' },
  1: { factor: 1.30,  label: '轻度活动（每周1次）' },
  2: { factor: 1.375, label: '轻度活动（每周2次）' },
  3: { factor: 1.465, label: '中度活动（每周3次）' },
  4: { factor: 1.55,  label: '中度活动（每周4次）' },
  5: { factor: 1.635, label: '高度活动（每周5次）' },
  6: { factor: 1.725, label: '高度活动（每周6次）' },
  7: { factor: 1.8,   label: '运动员（每天训练）' }
};

function activityFactor(weeklyExercise) {
  const n = Math.max(0, Math.min(7, Number(weeklyExercise) || 0));
  return (ACTIVITY_LEVELS[n] || ACTIVITY_LEVELS[0]).factor;
}

function activityLabel(weeklyExercise) {
  const n = Math.max(0, Math.min(7, Number(weeklyExercise) || 0));
  return (ACTIVITY_LEVELS[n] || ACTIVITY_LEVELS[0]).label;
}

/**
 * 计算 BMR（Mifflin-St Jeor）
 */
function calcBMR({ gender, height, weight, age }) {
  const base = 10 * Number(weight) + 6.25 * Number(height) - 5 * Number(age);
  return Math.round(gender === 'male' ? base + 5 : base - 161);
}

/**
 * 主入口：根据资料计算完整营养方案
 * @returns {{
 *   bmr:number, tdee:number, targetCalories:number, activityFactor:number,
 *   macros:{protein:number, carb:number, fat:number, proteinCal:number, carbCal:number, fatCal:number},
 *   bmi:number, bmiLabel:string, goal:string, goalLabel:string, water:number
 * }}
 */
function calcNutrition(profile) {
  const p = profile || {};
  const bmr = calcBMR(p);
  const factor = activityFactor(p.weeklyExercise);
  const tdee = Math.round(bmr * factor);

  let target = tdee;
  if (p.goal === 'muscle') target = Math.round(tdee * 1.12);
  else if (p.goal === 'fatloss') target = Math.round(tdee * 0.82);

  // 安全下限：不低于 BMR（避免过度节食）
  target = Math.max(target, bmr);

  const weight = Number(p.weight) || 0;
  let proteinPerKg = 1.6;
  let fatRatio = 0.3;
  if (p.goal === 'muscle') { proteinPerKg = 2.0; fatRatio = 0.25; }
  else if (p.goal === 'fatloss') { proteinPerKg = 2.2; fatRatio = 0.25; }

  const protein = Math.round(weight * proteinPerKg);          // g
  const fat = Math.round((target * fatRatio) / 9);            // 9 kcal/g
  const carbCal = Math.max(0, target - protein * 4 - fat * 9);
  const carb = Math.round(carbCal / 4);                       // 4 kcal/g

  const hM = Number(p.height) / 100;
  const bmi = hM > 0 ? +(weight / (hM * hM)).toFixed(1) : 0;

  return {
    bmr,
    tdee,
    targetCalories: target,
    activityFactor: factor,
    activityLabel: activityLabel(p.weeklyExercise),
    goal: p.goal || 'maintain',
    goalLabel: GOAL_LABELS[p.goal] || GOAL_LABELS.maintain,
    macros: {
      protein,
      carb,
      fat,
      proteinCal: protein * 4,
      carbCal: carb * 4,
      fatCal: fat * 9
    },
    bmi,
    bmiLabel: bmiLabel(bmi),
    water: Math.round(weight * 35) // ml，每公斤 35ml
  };
}

function bmiLabel(bmi) {
  if (!bmi) return '--';
  if (bmi < 18.5) return '偏瘦';
  if (bmi < 24) return '正常';
  if (bmi < 28) return '偏胖';
  return '肥胖';
}

/**
 * 按营养标准生成三餐+加餐的推荐热量分配比例
 * 早餐 25% · 午餐 35% · 晚餐 30% · 加餐 10%
 */
const MEAL_SPLIT = [
  { key: 'breakfast', label: '早餐', ratio: 0.25, icon: '🌅' },
  { key: 'lunch',     label: '午餐', ratio: 0.35, icon: '☀️' },
  { key: 'dinner',    label: '晚餐', ratio: 0.30, icon: '🌙' },
  { key: 'snack',     label: '加餐', ratio: 0.10, icon: '🍎' }
];

function mealSplit(targetCalories) {
  return MEAL_SPLIT.map(m => Object.assign({}, m, {
    calories: Math.round(targetCalories * m.ratio)
  }));
}

module.exports = {
  GOAL_LABELS,
  ACTIVITY_LEVELS,
  MEAL_SPLIT,
  calcBMR,
  calcNutrition,
  bmiLabel,
  activityFactor,
  activityLabel,
  mealSplit
};

});
__define("utils/recipeService", function(module, exports, __req){
/**
 * recipeService.js - 食谱业务逻辑层
 * 负责：营养计算、场景方案生成、食材替换、分类筛选。
 */

const { RECIPES } = __req("data/recipes");
const foods = __req("data/foods");
const nutrition = __req("utils/nutrition");

/** 分类标签字典（用于浏览页筛选展示） */
const CATEGORIES = [
  { key: 'all',         label: '全部' },
  { key: 'quick',       label: '快手食谱' },
  { key: 'lowfat',      label: '低脂减脂' },
  { key: 'highprotein', label: '高蛋白增肌' },
  { key: 'mild',        label: '清淡养生' }
];

const MEAL_FILTERS = [
  { key: 'all',       label: '全部' },
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch',     label: '午餐' },
  { key: 'dinner',    label: '晚餐' },
  { key: 'snack',     label: '加餐' }
];

const MEAL_LABEL = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐'
};

const DIFFICULTY_TEXT = { 1: '零基础', 2: '简单', 3: '进阶' };

/**
 * 计算单条食谱总营养（依据食材实际克数）
 * @returns {{kcal, protein, carb, fat}} 保留 1 位小数
 */
function calcRecipeNutrition(recipe) {
  const total = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  (recipe.ingredients || []).forEach(ing => {
    const n = foods.nutritionOf(ing.name, ing.amount);
    total.kcal += n.kcal;
    total.protein += n.protein;
    total.carb += n.carb;
    total.fat += n.fat;
  });
  total.kcal = Math.round(total.kcal);
  total.protein = +total.protein.toFixed(1);
  total.carb = +total.carb.toFixed(1);
  total.fat = +total.fat.toFixed(1);
  return total;
}

/** 给食谱附加营养与展示字段，返回新对象 */
function decorate(recipe) {
  const n = calcRecipeNutrition(recipe);
  return Object.assign({}, recipe, {
    nutrition: n,
    mealLabel: MEAL_LABEL[recipe.meals] || '',
    difficultyText: DIFFICULTY_TEXT[recipe.difficulty] || '简单',
    tagLabels: (recipe.tags || []).map(t => {
      const c = CATEGORIES.find(x => x.key === t);
      return c ? c.label : t;
    })
  });
}

function getAll() {
  return RECIPES.map(decorate);
}

function getById(id) {
  const r = RECIPES.find(x => x.id === id);
  return r ? decorate(r) : null;
}

/**
 * 按条件筛选食谱
 * @param {{category?:string, meal?:string, keyword?:string}} opt
 */
function filter(opt) {
  opt = opt || {};
  let list = getAll();
  if (opt.category && opt.category !== 'all') {
    list = list.filter(r => (r.tags || []).indexOf(opt.category) > -1);
  }
  if (opt.meal && opt.meal !== 'all') {
    list = list.filter(r => r.meals === opt.meal);
  }
  if (opt.keyword) {
    const k = String(opt.keyword).trim();
    list = list.filter(r =>
      r.name.indexOf(k) > -1 ||
      (r.ingredients || []).some(i => i.name.indexOf(k) > -1)
    );
  }
  return list;
}

/**
 * 场景同义词：把目标映射到食谱 scene
 *   muscle → 增肌 ; fatloss → 减脂 ; maintain → 养生
 */
const GOAL_SCENE = {
  muscle: 'muscle',
  fatloss: 'fatloss',
  maintain: 'gentle'
};

/** 根据场景取候选食谱 */
function byScene(scene) {
  return getAll().filter(r => (r.scene || []).indexOf(scene) > -1);
}

/**
 * 生成一日三餐 + 加餐方案
 * @param {string} scene  muscle | fatloss | gentle
 * @param {object} opt    { seed } 可传入随机种子便于复现
 * @returns {{scene, meals:[{key,label,icon,recipe,nutrition}]}}
 */
function generatePlan(scene, opt) {
  opt = opt || {};
  const slots = nutrition.MEAL_SPLIT;
  const picked = [];
  const usedTags = {};

  slots.forEach(slot => {
    let candidates = byScene(scene).filter(r => r.meals === slot.key);
    if (!candidates.length) candidates = getAll().filter(r => r.meals === slot.key);
    // 轻量随机：避免每次都一样，但同场景内营养接近
    const idx = opt.seed != null
      ? (opt.seed + slot.key.length) % candidates.length
      : Math.floor(Math.random() * candidates.length);
    const recipe = candidates[idx] || candidates[0];
    usedTags[slot.key] = recipe.id;
    picked.push(Object.assign({}, slot, { recipe }));
  });

  return {
    scene,
    sceneLabel: { muscle: '健身增肌', fatloss: '健身减脂', gentle: '日常养生' }[scene] || scene,
    createdAt: Date.now(),
    meals: picked
  };
}

/** 汇总整份方案营养 */
function planSummary(plan) {
  const total = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  (plan.meals || []).forEach(m => {
    const n = calcRecipeNutrition(m.recipe);
    total.kcal += n.kcal;
    total.protein += n.protein;
    total.carb += n.carb;
    total.fat += n.fat;
  });
  total.kcal = Math.round(total.kcal);
  total.protein = +total.protein.toFixed(1);
  total.carb = +total.carb.toFixed(1);
  total.fat = +total.fat.toFixed(1);
  return total;
}

/**
 * 生成一周（7 天）食谱计划 —— 每天三餐+加餐，尽量不重复
 * @param {string} scene muscle | fatloss | gentle
 * @returns {{scene, sceneLabel, createdAt, days:[{date, weekday, meals:[{key,label,icon,recipe}]}]}}
 */
function generateWeekPlan(scene) {
  const slots = nutrition.MEAL_SPLIT;
  const weekNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const pool = {};
  slots.forEach(s => {
    pool[s.key] = byScene(scene).filter(r => r.meals === s.key);
    if (!pool[s.key].length) pool[s.key] = getAll().filter(r => r.meals === s.key);
  });

  const days = [];
  const monday = mondayOfThisWeek();
  const slotCursor = {};
  slots.forEach(s => { slotCursor[s.key] = 0; });
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const meals = slots.map(s => {
      const cands = pool[s.key];
      // 每个餐次独立轮转，保证同类中尽量多道不同的菜
      const recipe = cands[slotCursor[s.key] % cands.length] || cands[0];
      slotCursor[s.key]++;
      return Object.assign({}, s, { recipeId: recipe.id, recipe });
    });
    days.push({
      date: storeDateKey(d),
      weekday: weekNames[i],
      isToday: storeDateKey(d) === storeDateKey(new Date()),
      meals
    });
  }

  return {
    scene,
    sceneLabel: { muscle: '健身增肌', fatloss: '健身减脂', gentle: '日常养生' }[scene] || scene,
    createdAt: Date.now(),
    days
  };
}

function mondayOfThisWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function storeDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 汇总一周方案的大致日均营养 */
function weekPlanSummary(weekPlan) {
  const total = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  let n = 0;
  (weekPlan.days || []).forEach(day => {
    day.meals.forEach(m => {
      const x = calcRecipeNutrition(m.recipe);
      total.kcal += x.kcal; total.protein += x.protein;
      total.carb += x.carb; total.fat += x.fat;
      n++;
    });
  });
  const days = (weekPlan.days || []).length || 1;
  return {
    kcal: Math.round(total.kcal / days),
    protein: +(total.protein / days).toFixed(1),
    carb: +(total.carb / days).toFixed(1),
    fat: +(total.fat / days).toFixed(1)
  };
}

/* ============================================================
 * 智能食材替换
 * 规则：仅在相同 category 内替换，并按「热量最接近 + 蛋白最接近」
 *       打分排序，保证替换后营养、热量基本持平。
 * 同时输出按克数折算后的建议用量，使热量尽可能对齐原食材。
 * ============================================================ */

/**
 * 为某个食材寻找替代品
 * @param {string} name 原食材名
 * @param {number} amount 原食材克数
 * @param {object} opt { exclude:[], scenePrefer:string }
 * @returns {Array<{name, category, amount, unit, nutrition, kcalDiff, kcalDiffPct, score, reason}>}
 */
function findSubstitutes(name, amount, opt) {
  opt = opt || {};
  const origin = foods.getFood(name);
  const originNutrition = foods.nutritionOf(name, amount);
  if (!origin) return [];

  const exclude = (opt.exclude || []).concat([foods.resolveName(name)]);
  const originKcal = originNutrition.kcal || 1;

  let pool = foods.byCategory(origin.category).filter(n => exclude.indexOf(n) === -1);

  // 场景偏好：增肌优先高蛋白、减脂优先低脂
  const scored = pool.map(candName => {
    const c = foods.getFood(candName);
    // 以「等热量」为目标折算用量：新克数 = 原热量 / 新每克热量 * 100
    let grams = amount;
    if (c.kcal > 0 && origin.kcal > 0) {
      grams = Math.round((origin.kcal * amount) / c.kcal);
    }
    grams = Math.max(5, grams);
    const cn = foods.nutritionOf(candName, grams);

    const kcalDiff = +(cn.kcal - originNutrition.kcal).toFixed(1);
    const kcalDiffPct = +Math.abs(kcalDiff / originKcal * 100).toFixed(1);
    const proteinDiff = +(cn.protein - originNutrition.protein).toFixed(1);

    // 综合评分：热量差权重最高（越接近越好）
    let score = 100 - kcalDiffPct * 1.6 - Math.abs(proteinDiff) * 1.2;
    if (opt.scenePrefer === 'muscle') score += c.protein * 0.5;
    if (opt.scenePrefer === 'fatloss') score -= c.fat * 0.6;
    score = +score.toFixed(1);

    let reason = '营养构成接近，可平替';
    if (c.protein > origin.protein + 2) reason = '蛋白更高，适合增肌';
    else if (c.fat < origin.fat - 2) reason = '脂肪更低，适合减脂';
    else if (Math.abs(c.kcal - origin.kcal) < 20) reason = '热量几乎一致';

    return {
      name: candName,
      category: c.category,
      amount: grams,
      unit: c.unit,
      nutrition: cn,
      kcalDiff,
      kcalDiffPct,
      proteinDiff,
      score,
      reason
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6);
}

/**
 * 对整条食谱应用一次替换，返回替换后的新食谱（不改原数据）
 * @param {object} recipe 已 decorate 的食谱
 * @param {number} index  要替换的食材下标
 * @param {string} newName 新食材名
 * @param {number} newAmount 新食材克数
 */
function applySubstitution(recipe, index, newName, newAmount) {
  const ingredients = recipe.ingredients.map((ing, i) => {
    if (i !== index) return ing;
    return {
      name: newName,
      amount: newAmount,
      text: newAmount + (ing.text && ing.text.indexOf('ml') > -1 ? 'ml' : 'g')
    };
  });
  const next = Object.assign({}, recipe, { ingredients });
  next.nutrition = calcRecipeNutrition(next);
  return next;
}

module.exports = {
  CATEGORIES,
  MEAL_FILTERS,
  MEAL_LABEL,
  DIFFICULTY_TEXT,
  GOAL_SCENE,
  calcRecipeNutrition,
  decorate,
  getAll,
  getById,
  filter,
  byScene,
  generatePlan,
  planSummary,
  generateWeekPlan,
  weekPlanSummary,
  findSubstitutes,
  applySubstitution
};

});
__define("data/foods", function(module, exports, __req){
/**
 * foods.js - 常见食材营养数据库
 * 每 100g(ml) 可食部分的营养值（热量 kcal / 蛋白 g / 碳水 g / 脂肪 g）
 * 大众食材常用参考值，用于食谱能量计算与食材替换。
 *
 * category 用于替换匹配（同类才可平替）：
 *   staple 主食 | protein 优质蛋白 | veg 蔬菜 | fruit 水果
 *   dairy 乳制品 | nut 坚果油脂 | egg 蛋类 | bean 豆制品
 */

const FOODS = {
  /* ---------------- 主食 (staple) ---------------- */
  '白米饭': { category: 'staple', kcal: 116, protein: 2.6, carb: 25.9, fat: 0.3, unit: 'g' },
  '糙米饭': { category: 'staple', kcal: 112, protein: 2.8, carb: 23.0, fat: 0.9, unit: 'g' },
  '杂粮饭': { category: 'staple', kcal: 110, protein: 3.2, carb: 22.5, fat: 0.9, unit: 'g' },
  '藜麦饭': { category: 'staple', kcal: 120, protein: 4.4, carb: 21.3, fat: 1.9, unit: 'g' },
  '全麦面包': { category: 'staple', kcal: 246, protein: 9.0, carb: 45.0, fat: 3.3, unit: 'g' },
  '燕麦片': { category: 'staple', kcal: 367, protein: 15.0, carb: 61.0, fat: 6.7, unit: 'g' },
  '玉米': { category: 'staple', kcal: 112, protein: 4.0, carb: 22.8, fat: 1.2, unit: 'g' },
  '红薯': { category: 'staple', kcal: 99, protein: 1.1, carb: 24.7, fat: 0.2, unit: 'g' },
  '紫薯': { category: 'staple', kcal: 106, protein: 1.6, carb: 24.0, fat: 0.2, unit: 'g' },
  '土豆': { category: 'staple', kcal: 81, protein: 2.6, carb: 17.8, fat: 0.2, unit: 'g' },
  '荞麦面': { category: 'staple', kcal: 110, protein: 4.1, carb: 21.4, fat: 0.7, unit: 'g' },
  '意大利面': { category: 'staple', kcal: 158, protein: 5.8, carb: 30.9, fat: 0.9, unit: 'g' },
  '小米粥': { category: 'staple', kcal: 46, protein: 1.4, carb: 8.4, fat: 0.7, unit: 'g' },
  '山药': { category: 'staple', kcal: 57, protein: 1.9, carb: 12.4, fat: 0.2, unit: 'g' },
  '南瓜': { category: 'staple', kcal: 23, protein: 0.7, carb: 5.3, fat: 0.1, unit: 'g' },

  /* ---------------- 优质蛋白 (protein) ---------------- */
  '鸡胸肉': { category: 'protein', kcal: 133, protein: 19.4, carb: 2.5, fat: 5.0, unit: 'g' },
  '鸡腿肉（去皮）': { category: 'protein', kcal: 145, protein: 19.0, carb: 0, fat: 7.5, unit: 'g' },
  '牛肉（瘦）': { category: 'protein', kcal: 106, protein: 20.2, carb: 1.2, fat: 2.3, unit: 'g' },
  '猪里脊': { category: 'protein', kcal: 155, protein: 20.2, carb: 1.5, fat: 7.9, unit: 'g' },
  '三文鱼': { category: 'protein', kcal: 139, protein: 17.2, carb: 0, fat: 7.8, unit: 'g' },
  '鳕鱼': { category: 'protein', kcal: 88, protein: 20.4, carb: 0, fat: 0.5, unit: 'g' },
  '虾仁': { category: 'protein', kcal: 87, protein: 16.4, carb: 2.4, fat: 1.0, unit: 'g' },
  '龙利鱼': { category: 'protein', kcal: 83, protein: 17.7, carb: 0.5, fat: 1.2, unit: 'g' },
  '金枪鱼（水浸）': { category: 'protein', kcal: 116, protein: 25.0, carb: 0, fat: 1.0, unit: 'g' },
  '瘦羊肉': { category: 'protein', kcal: 118, protein: 20.5, carb: 0.2, fat: 3.9, unit: 'g' },

  /* ---------------- 蛋类 (egg) ---------------- */
  '鸡蛋': { category: 'egg', kcal: 144, protein: 13.3, carb: 2.8, fat: 8.8, unit: 'g' },
  '蛋白': { category: 'egg', kcal: 52, protein: 11.6, carb: 3.1, fat: 0.1, unit: 'g' },
  '鹌鹑蛋': { category: 'egg', kcal: 160, protein: 12.8, carb: 2.1, fat: 11.1, unit: 'g' },

  /* ---------------- 豆制品 (bean) ---------------- */
  '北豆腐': { category: 'bean', kcal: 116, protein: 12.2, carb: 3.8, fat: 6.0, unit: 'g' },
  '南豆腐': { category: 'bean', kcal: 76, protein: 8.1, carb: 3.3, fat: 3.7, unit: 'g' },
  '无糖豆浆': { category: 'bean', kcal: 31, protein: 3.0, carb: 1.2, fat: 1.6, unit: 'ml' },
  '毛豆': { category: 'bean', kcal: 131, protein: 13.1, carb: 10.5, fat: 5.0, unit: 'g' },
  '鹰嘴豆': { category: 'bean', kcal: 164, protein: 8.9, carb: 27.4, fat: 2.6, unit: 'g' },

  /* ---------------- 乳制品 (dairy) ---------------- */
  '无糖希腊酸奶': { category: 'dairy', kcal: 59, protein: 10.0, carb: 3.6, fat: 0.4, unit: 'g' },
  '低脂牛奶': { category: 'dairy', kcal: 42, protein: 3.4, carb: 5.0, fat: 1.0, unit: 'ml' },
  '脱脂牛奶': { category: 'dairy', kcal: 34, protein: 3.4, carb: 5.0, fat: 0.1, unit: 'ml' },
  '低脂奶酪': { category: 'dairy', kcal: 240, protein: 28.0, carb: 3.0, fat: 12.0, unit: 'g' },

  /* ---------------- 蔬菜 (veg) ---------------- */
  '西兰花': { category: 'veg', kcal: 34, protein: 2.8, carb: 6.6, fat: 0.4, unit: 'g' },
  '菠菜': { category: 'veg', kcal: 23, protein: 2.9, carb: 3.6, fat: 0.3, unit: 'g' },
  '生菜': { category: 'veg', kcal: 15, protein: 1.4, carb: 2.9, fat: 0.2, unit: 'g' },
  '番茄': { category: 'veg', kcal: 18, protein: 0.9, carb: 3.9, fat: 0.2, unit: 'g' },
  '黄瓜': { category: 'veg', kcal: 15, protein: 0.7, carb: 3.6, fat: 0.1, unit: 'g' },
  '胡萝卜': { category: 'veg', kcal: 41, protein: 0.9, carb: 9.6, fat: 0.2, unit: 'g' },
  '芦笋': { category: 'veg', kcal: 20, protein: 2.2, carb: 3.9, fat: 0.1, unit: 'g' },
  '彩椒': { category: 'veg', kcal: 26, protein: 1.0, carb: 6.0, fat: 0.2, unit: 'g' },
  '蘑菇': { category: 'veg', kcal: 22, protein: 3.1, carb: 3.3, fat: 0.3, unit: 'g' },

  /* ---------------- 水果 (fruit) ---------------- */
  '苹果': { category: 'fruit', kcal: 52, protein: 0.3, carb: 13.8, fat: 0.2, unit: 'g' },
  '香蕉': { category: 'fruit', kcal: 89, protein: 1.1, carb: 22.8, fat: 0.3, unit: 'g' },
  '蓝莓': { category: 'fruit', kcal: 57, protein: 0.7, carb: 14.5, fat: 0.3, unit: 'g' },
  '猕猴桃': { category: 'fruit', kcal: 61, protein: 1.1, carb: 14.7, fat: 0.5, unit: 'g' },
  '橙子': { category: 'fruit', kcal: 47, protein: 0.9, carb: 11.8, fat: 0.1, unit: 'g' },
  '牛油果': { category: 'fruit', kcal: 160, protein: 2.0, carb: 8.5, fat: 14.7, unit: 'g' },
  '圣女果': { category: 'fruit', kcal: 18, protein: 0.9, carb: 3.9, fat: 0.2, unit: 'g' },

  /* ---------------- 坚果油脂 (nut) ---------------- */
  '杏仁': { category: 'nut', kcal: 579, protein: 21.2, carb: 21.7, fat: 49.9, unit: 'g' },
  '核桃': { category: 'nut', kcal: 654, protein: 15.2, carb: 13.7, fat: 65.2, unit: 'g' },
  '花生': { category: 'nut', kcal: 567, protein: 25.8, carb: 16.1, fat: 49.2, unit: 'g' },
  '腰果': { category: 'nut', kcal: 553, protein: 18.2, carb: 30.2, fat: 43.9, unit: 'g' },
  '橄榄油': { category: 'nut', kcal: 884, protein: 0, carb: 0, fat: 100, unit: 'ml' },
  '奇亚籽': { category: 'nut', kcal: 486, protein: 16.5, carb: 42.1, fat: 30.7, unit: 'g' },
  '花生酱': { category: 'nut', kcal: 588, protein: 25.0, carb: 20.0, fat: 50.0, unit: 'g' },

  /* ---------------- 调味 / 其他 ---------------- */
  '蒜': { category: 'seasoning', kcal: 128, protein: 4.5, carb: 27.6, fat: 0.2, unit: 'g' },
  '姜': { category: 'seasoning', kcal: 46, protein: 1.3, carb: 10.3, fat: 0.6, unit: 'g' },
  '洋葱': { category: 'veg', kcal: 40, protein: 1.1, carb: 9.0, fat: 0.2, unit: 'g' },
  '番茄酱': { category: 'seasoning', kcal: 81, protein: 1.5, carb: 18.0, fat: 0.2, unit: 'g' },
  '柠檬': { category: 'fruit', kcal: 37, protein: 1.1, carb: 6.2, fat: 1.2, unit: 'g' }
};

/** 单位换算：部分食材用「个/只」等自然单位，折算成克 */
const UNIT_GRAM = {
  '鸡蛋': 50, '蛋白': 33, '鹌鹑蛋': 10, '香蕉': 100, '苹果': 180, '橙子': 150,
  '猕猴桃': 80, '牛油果': 150, '番茄': 150, '圣女果': 15
};

/** 食材别名 → 标准名（用于识别用户输入） */
const ALIASES = {
  '米饭': '白米饭', '大米饭': '白米饭', '糙米': '糙米饭', '藜麦': '藜麦饭',
  '面包': '全麦面包', '燕麦': '燕麦片', '鸡胸': '鸡胸肉', '鸡腿': '鸡腿肉（去皮）',
  '牛肉': '牛肉（瘦）', '酸奶': '无糖希腊酸奶', '牛奶': '低脂牛奶',
  '豆浆': '无糖豆浆', '豆腐': '北豆腐', '金枪鱼': '金枪鱼（水浸）'
};

function resolveName(name) {
  if (!name) return '';
  const n = String(name).trim();
  if (FOODS[n]) return n;
  if (ALIASES[n]) return ALIASES[n];
  return n;
}

function getFood(name) {
  const n = resolveName(name);
  return FOODS[n] || null;
}

/** 计算指定重量(克/ml)的营养值 */
function nutritionOf(name, grams) {
  const f = getFood(name);
  if (!f) return { kcal: 0, protein: 0, carb: 0, fat: 0 };
  const k = (Number(grams) || 0) / 100;
  return {
    kcal: +(f.kcal * k).toFixed(1),
    protein: +(f.protein * k).toFixed(1),
    carb: +(f.carb * k).toFixed(1),
    fat: +(f.fat * k).toFixed(1)
  };
}

/** 列出某个分类下的所有食材名 */
function byCategory(category) {
  return Object.keys(FOODS).filter(k => FOODS[k].category === category);
}

module.exports = {
  FOODS,
  UNIT_GRAM,
  ALIASES,
  resolveName,
  getFood,
  nutritionOf,
  byCategory
};

});
__define("data/recipes", function(module, exports, __req){
/**
 * recipes.js - 食谱数据库
 *
 * 每条食谱：
 *   id          唯一标识
 *   name        食谱名
 *   scene       muscle(增肌) | fatloss(减脂) | gentle(养生) —— 标记适配场景
 *   meals       breakfast | lunch | dinner | snack
 *   tags        分类标签，用于浏览筛选：quick 快手 / lowfat 低脂减脂 /
 *               highprotein 高蛋白增肌 / mild 清淡养生
 *   cookTime    烹饪时长（分钟）
 *   difficulty  1-3 星
 *   servings    份数（默认 1 人份）
 *   ingredients [{name, amount(克/ml), text(展示用)}]
 *   steps       [字符串]
 *   tip         小贴士
 *
 * 营养值不写死，运行时由 nutrition.js 依据 ingredients 实时计算，
 * 这样食材替换后可即时重算，保证数据一致。
 */

const RECIPES = [
  /* ==================== 早餐 breakfast ==================== */
  {
    id: 'b01',
    name: '燕麦牛奶鸡蛋早餐碗',
    image: '/images/recipes/b01.jpg',
    scene: ['gentle', 'fatloss', 'muscle'],
    meals: 'breakfast',
    tags: ['quick', 'lowfat', 'highprotein'],
    cookTime: 8,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '燕麦片', amount: 40, text: '40g' },
      { name: '低脂牛奶', amount: 200, text: '200ml' },
      { name: '鸡蛋', amount: 50, text: '1个' },
      { name: '蓝莓', amount: 50, text: '50g' },
      { name: '杏仁', amount: 10, text: '约10g' }
    ],
    steps: [
      '鸡蛋冷水下锅，水开煮 6 分钟，捞出过冷水剥壳备用。',
      '燕麦片倒入碗中，加入低脂牛奶，微波炉高火 1 分钟（或小锅小火煮 2 分钟）。',
      '放上剥好的水煮蛋，撒上蓝莓与杏仁即可。',
      '喜欢温热口感可再微波 20 秒。'
    ],
    tip: '燕麦选纯燕麦片（非即食含糖款），饱腹感更强、升糖更平缓。'
  },
  {
    id: 'b02',
    name: '全麦鸡蛋蔬菜三明治',
    image: '/images/recipes/b02.jpg',
    scene: ['fatloss', 'muscle', 'gentle'],
    meals: 'breakfast',
    tags: ['quick', 'highprotein', 'lowfat'],
    cookTime: 10,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '全麦面包', amount: 70, text: '2片' },
      { name: '鸡蛋', amount: 100, text: '2个' },
      { name: '生菜', amount: 30, text: '2片' },
      { name: '番茄', amount: 60, text: '半个' },
      { name: '橄榄油', amount: 3, text: '约半勺' }
    ],
    steps: [
      '平底锅刷一层薄橄榄油，中小火煎两个鸡蛋（可做成少油滑蛋）。',
      '全麦面包放入锅边或空锅烘 1 分钟至微脆。',
      '生菜洗净沥干，番茄切片。',
      '面包铺上生菜、番茄、煎蛋，对折或盖上另一片即可。',
      '对半切开更易入口。'
    ],
    tip: '想更低脂可只用 1 全蛋 + 2 蛋白，蛋白质不减、热量更省。'
  },
  {
    id: 'b03',
    name: '小米南瓜养胃粥',
    image: '/images/recipes/b03.jpg',
    scene: ['gentle'],
    meals: 'breakfast',
    tags: ['mild', 'quick'],
    cookTime: 25,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '小米粥', amount: 300, text: '1碗' },
      { name: '南瓜', amount: 100, text: '100g' },
      { name: '鸡蛋', amount: 50, text: '1个' },
      { name: '菠菜', amount: 40, text: '一小把' }
    ],
    steps: [
      '南瓜去皮切小块，与小米一同下锅加水煮 20 分钟至软烂。',
      '菠菜焯水 30 秒后切段（去草酸）。',
      '鸡蛋打散，粥将好时沿锅边淋入成蛋花，搅匀。',
      '最后放入菠菜，煮 1 分钟即可。'
    ],
    tip: '早起胃口差、肠胃敏感的人非常适合，温和好消化。'
  },
  {
    id: 'b04',
    name: '希腊酸奶水果坚果杯',
    image: '/images/recipes/b04.jpg',
    scene: ['gentle', 'fatloss'],
    meals: 'breakfast',
    tags: ['quick', 'lowfat', 'mild'],
    cookTime: 5,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '无糖希腊酸奶', amount: 200, text: '200g' },
      { name: '香蕉', amount: 100, text: '1根' },
      { name: '蓝莓', amount: 40, text: '40g' },
      { name: '核桃', amount: 10, text: '2颗' },
      { name: '奇亚籽', amount: 8, text: '1小勺' }
    ],
    steps: [
      '希腊酸奶倒入杯中。',
      '香蕉切片，蓝莓洗净。',
      '依次铺上香蕉片、蓝莓、核桃碎，撒上奇亚籽。',
      '想要更冰凉可冷藏 10 分钟再吃。'
    ],
    tip: '零烹饪、高蛋白，赶时间的早晨首选。'
  },

  /* ==================== 午餐 lunch ==================== */
  {
    id: 'l01',
    name: '香煎鸡胸时蔬糙米饭',
    image: '/images/recipes/l01.jpg',
    scene: ['fatloss', 'muscle'],
    meals: 'lunch',
    tags: ['highprotein', 'lowfat'],
    cookTime: 25,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '鸡胸肉', amount: 150, text: '150g' },
      { name: '糙米饭', amount: 150, text: '1小碗' },
      { name: '西兰花', amount: 120, text: '120g' },
      { name: '胡萝卜', amount: 50, text: '半根' },
      { name: '橄榄油', amount: 5, text: '1小勺' },
      { name: '蒜', amount: 5, text: '2瓣' }
    ],
    steps: [
      '鸡胸肉横切成厚片，用少许盐、黑胡椒、蒜末腌制 10 分钟。',
      '西兰花掰小朵、胡萝卜切片，沸水加少许盐焯 2 分钟捞出。',
      '平底锅中火放橄榄油，鸡胸肉每面煎 3-4 分钟至金黄全熟。',
      '同一锅下蒜末快炒时蔬 1 分钟。',
      '糙米饭盛盘，摆上鸡胸与蔬菜即可。'
    ],
    tip: '鸡胸不要煎太久，全熟即出锅，否则会柴。'
  },
  {
    id: 'l02',
    name: '番茄牛肉意面',
    image: '/images/recipes/l02.jpg',
    scene: ['muscle'],
    meals: 'lunch',
    tags: ['highprotein'],
    cookTime: 25,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '意大利面', amount: 100, text: '100g（生重）' },
      { name: '牛肉（瘦）', amount: 120, text: '120g' },
      { name: '番茄', amount: 150, text: '1个' },
      { name: '洋葱', amount: 50, text: '小半个' },
      { name: '橄榄油', amount: 8, text: '1勺' },
      { name: '番茄酱', amount: 20, text: '1勺' }
    ],
    steps: [
      '意面下沸水煮 8-10 分钟至有嚼劲，捞出备用（留一点面汤）。',
      '牛肉切丝，用少许盐、黑胡椒抓匀；番茄、洋葱切丁。',
      '锅中放橄榄油，先炒洋葱出香，再下牛肉快速炒变色盛出。',
      '下番茄丁炒出汁，加番茄酱与 2 勺面汤，小火收浓。',
      '倒回牛肉与意面翻拌均匀，收汁即可。'
    ],
    tip: '牛肉炒到变色即盛出，最后再回锅，避免变老。'
  },
  {
    id: 'l03',
    name: '虾仁滑蛋藜麦饭',
    image: '/images/recipes/l03.jpg',
    scene: ['fatloss', 'gentle'],
    meals: 'lunch',
    tags: ['highprotein', 'lowfat', 'quick'],
    cookTime: 15,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '虾仁', amount: 120, text: '120g' },
      { name: '藜麦饭', amount: 150, text: '1小碗' },
      { name: '鸡蛋', amount: 100, text: '2个' },
      { name: '黄瓜', amount: 80, text: '半根' },
      { name: '橄榄油', amount: 5, text: '1小勺' }
    ],
    steps: [
      '虾仁去虾线，用少许盐、料酒腌 5 分钟。',
      '鸡蛋加少许盐打散；黄瓜切丁。',
      '热锅放油，虾仁炒至变色盛出。',
      '倒入蛋液，半凝固时加入虾仁，快速滑炒成嫩滑蛋块。',
      '藜麦饭盛碗，放上虾仁滑蛋与黄瓜丁即可。'
    ],
    tip: '滑蛋要嫩，火别太大，蛋液八成熟就关火。'
  },
  {
    id: 'l04',
    name: '清蒸龙利鱼豆腐煲',
    image: '/images/recipes/l04.jpg',
    scene: ['gentle', 'fatloss'],
    meals: 'lunch',
    tags: ['mild', 'lowfat', 'highprotein'],
    cookTime: 20,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '龙利鱼', amount: 150, text: '150g' },
      { name: '南豆腐', amount: 150, text: '150g' },
      { name: '菠菜', amount: 60, text: '一小把' },
      { name: '姜', amount: 5, text: '3片' },
      { name: '橄榄油', amount: 3, text: '几滴' }
    ],
    steps: [
      '龙利鱼解冻切块，用姜片、少许盐腌 5 分钟去腥。',
      '豆腐切块铺在盘底，放上鱼块。',
      '水开后上锅蒸 8 分钟。',
      '菠菜焯水后围边，淋几滴橄榄油与少许生抽即可。'
    ],
    tip: '蒸鱼时间以厚度为准，8 分钟左右鱼肉刚熟最嫩。'
  },

  /* ==================== 晚餐 dinner ==================== */
  {
    id: 'd01',
    name: '低脂番茄豆腐鸡胸煲',
    image: '/images/recipes/d01.jpg',
    scene: ['fatloss', 'muscle'],
    meals: 'dinner',
    tags: ['highprotein', 'lowfat'],
    cookTime: 20,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '鸡胸肉', amount: 120, text: '120g' },
      { name: '北豆腐', amount: 100, text: '100g' },
      { name: '番茄', amount: 150, text: '1个' },
      { name: '西兰花', amount: 80, text: '80g' },
      { name: '橄榄油', amount: 5, text: '1小勺' }
    ],
    steps: [
      '鸡胸切小块，用盐、黑胡椒腌 10 分钟；豆腐切块，番茄切块。',
      '少油热锅，鸡胸块煎至表面变白。',
      '下番茄块炒出汁，加半碗热水煮开。',
      '放入豆腐与西兰花，加盖小火焖 6-8 分钟。',
      '收汁到喜欢的浓度，调味出锅。'
    ],
    tip: '番茄的天然酸甜能减少用盐，减脂期更友好。'
  },
  {
    id: 'd02',
    name: '香煎三文鱼芦笋',
    image: '/images/recipes/d02.jpg',
    scene: ['muscle', 'gentle'],
    meals: 'dinner',
    tags: ['highprotein', 'mild'],
    cookTime: 18,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '三文鱼', amount: 130, text: '130g' },
      { name: '芦笋', amount: 100, text: '100g' },
      { name: '紫薯', amount: 120, text: '1个' },
      { name: '橄榄油', amount: 5, text: '1小勺' },
      { name: '柠檬', amount: 20, text: '2片' }
    ],
    steps: [
      '紫薯洗净蒸 15 分钟至软。',
      '三文鱼用盐、黑胡椒腌 5 分钟；芦笋去老根。',
      '平底锅中火放油，三文鱼皮朝下煎 3 分钟，翻面再煎 2 分钟。',
      '用余油把芦笋煎 2 分钟至断生。',
      '装盘挤上柠檬汁，配蒸好的紫薯。'
    ],
    tip: '三文鱼富含 Omega-3，每周吃 2 次对心血管有益。'
  },
  {
    id: 'd03',
    name: '杂粮鸡丝蔬菜拌饭',
    image: '/images/recipes/d03.jpg',
    scene: ['fatloss'],
    meals: 'dinner',
    tags: ['lowfat', 'quick', 'highprotein'],
    cookTime: 15,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '杂粮饭', amount: 120, text: '1小碗' },
      { name: '鸡胸肉', amount: 100, text: '100g' },
      { name: '菠菜', amount: 80, text: '一小把' },
      { name: '胡萝卜', amount: 50, text: '半根' },
      { name: '橄榄油', amount: 3, text: '几滴' }
    ],
    steps: [
      '鸡胸冷水下锅，加姜片煮 10 分钟至熟，晾凉后手撕成丝。',
      '菠菜、胡萝卜丝分别焯水 1 分钟捞出。',
      '杂粮饭盛碗，铺上鸡丝与蔬菜。',
      '淋几滴橄榄油、少许生抽拌匀即可。'
    ],
    tip: '水煮鸡胸手撕更入味，配杂粮饭饱腹又控卡。'
  },
  {
    id: 'd04',
    name: '山药排骨清汤',
    image: '/images/recipes/d04.jpg',
    scene: ['gentle'],
    meals: 'dinner',
    tags: ['mild'],
    cookTime: 40,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '猪里脊', amount: 100, text: '100g' },
      { name: '山药', amount: 120, text: '120g' },
      { name: '胡萝卜', amount: 60, text: '半根' },
      { name: '玉米', amount: 80, text: '半根' },
      { name: '姜', amount: 5, text: '3片' }
    ],
    steps: [
      '里脊切块冷水下锅焯水，撇去浮沫捞出。',
      '山药、胡萝卜去皮切块，玉米切段。',
      '所有材料加姜片、适量清水，大火烧开转小火炖 30 分钟。',
      '出锅前加少许盐调味即可。'
    ],
    tip: '山药健脾、汤清味鲜，适合日常养生与肠胃虚弱者。'
  },

  /* ==================== 加餐 snack ==================== */
  {
    id: 's01',
    name: '水煮蛋 + 圣女果',
    image: '/images/recipes/s01.jpg',
    scene: ['fatloss', 'muscle', 'gentle'],
    meals: 'snack',
    tags: ['quick', 'highprotein', 'lowfat'],
    cookTime: 8,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '鸡蛋', amount: 100, text: '2个' },
      { name: '圣女果', amount: 100, text: '约7颗' }
    ],
    steps: [
      '鸡蛋冷水下锅，水开煮 8 分钟。',
      '捞出过冷水，剥壳。',
      '圣女果洗净，与鸡蛋搭配食用。'
    ],
    tip: '加餐优先补蛋白，避免血糖大起大落。'
  },
  {
    id: 's02',
    name: '无糖酸奶坚果杯',
    image: '/images/recipes/s02.jpg',
    scene: ['gentle', 'fatloss'],
    meals: 'snack',
    tags: ['quick', 'lowfat', 'mild'],
    cookTime: 3,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '无糖希腊酸奶', amount: 150, text: '150g' },
      { name: '杏仁', amount: 10, text: '约10g' },
      { name: '蓝莓', amount: 30, text: '30g' }
    ],
    steps: [
      '酸奶倒入杯中。',
      '撒上杏仁与蓝莓即可。'
    ],
    tip: '坚果控制在一小把，优质脂肪也要算热量。'
  },
  {
    id: 's03',
    name: '香蕉花生酱全麦吐司',
    image: '/images/recipes/s03.jpg',
    scene: ['muscle'],
    meals: 'snack',
    tags: ['quick', 'highprotein'],
    cookTime: 5,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '全麦面包', amount: 35, text: '1片' },
      { name: '香蕉', amount: 100, text: '1根' },
      { name: '花生', amount: 15, text: '1勺花生酱' },
      { name: '低脂牛奶', amount: 200, text: '200ml' }
    ],
    steps: [
      '全麦面包烤至微脆。',
      '抹上一层花生酱。',
      '香蕉切片铺上，搭配一杯牛奶。'
    ],
    tip: '训练后 1 小时内的优质加餐，碳蛋脂均衡。'
  },
  {
    id: 's04',
    name: '苹果胡萝卜条',
    image: '/images/recipes/s04.jpg',
    scene: ['gentle'],
    meals: 'snack',
    tags: ['quick', 'mild', 'lowfat'],
    cookTime: 5,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '苹果', amount: 180, text: '1个' },
      { name: '胡萝卜', amount: 80, text: '1根' }
    ],
    steps: [
      '苹果、胡萝卜洗净。',
      '分别切成条状。',
      '直接食用，清脆爽口。'
    ],
    tip: '低热量高纤维，想吃零食时的健康替代。'
  }
];

module.exports = { RECIPES };

});

var PAGE_TEMPLATES = {};
var PAGE_DEFS = {};
function __registerPageTemplate(p, fn){ PAGE_TEMPLATES[p] = fn; }
function __registerPage(p, factory){
  var captured = null;
  var origPage = window.Page;
  window.Page = function(def){ captured = def; };
  try { factory(__req); } finally { window.Page = origPage; }
  if (captured) PAGE_DEFS[p] = captured;
}


// ---- components ----
window.__COMPONENT_TEMPLATES__ = window.__COMPONENT_TEMPLATES__ || {};
window.__COMPONENT_DEFS__ = window.__COMPONENT_DEFS__ || {};
function __registerComponentTemplate(name, fn){ window.__COMPONENT_TEMPLATES__[name] = fn; }
function __registerComponent(name, factory){
  var captured = null;
  var orig = window.Component;
  window.Component = function(def){ captured = def; };
  try { factory(__req); } finally { window.Component = orig; }
  if (captured) window.__COMPONENT_DEFS__[name] = captured;
}


// 把组件模板注册成自定义标签的渲染函数
// 组件内部使用 properties 接收父级传入的 props；此处直接以「传入 props + 组件 data」为作用域渲染
(function(){
  var tags = window.__COMPONENT_TEMPLATES__ || {};
  Object.keys(tags).forEach(function(name){
    var tpl = tags[name];
    var def = window.__COMPONENT_DEFS__[name] || {};
    window.__MP.registerComponent(name, function(node){
      var props = node.props || {};
      var data = Object.assign({}, def.data || {}, props);
      var h = window.__H__;
      var inner = tpl(data, h, null, window.__MP.makeScope(data, h, null));
      // 组件根：把 children（slot 内容）附加进去
      var wrap = document.createElement("div");
      wrap.className = "mp-component mp-component--" + name;
      var dom = window.__MP.__createNode(inner);
      wrap.appendChild(dom);
      if (node.children && node.children.length) {
        var slot = document.createElement("div");
        slot.className = "mp-slot";
        node.children.forEach(function(c){ slot.appendChild(window.__MP.__createNode(c)); });
        wrap.appendChild(slot);
      }
      return wrap;
    });
  });
})();

/* ===== page: pages/index/index ===== */
__registerPageTemplate("pages/index/index", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [h.el("view", {}, "page-wrap page-wrap--flat", undefined, [h.el("view", {}, "hero row-between", undefined, [h.el("view", {}, "col", undefined, [h.el("text", {}, "hero__hello t-xl t-bold", undefined, [h.text("你好呀 👋")]),h.el("text", {}, "hero__sub t-sm t-muted", undefined, [h.text("今天也要好好吃饭 · 健康一点")])]),h.el("view", {}, "hero__leaf center", undefined, [h.el("text", {}, "hero__leaf-emoji", undefined, [h.text("🌿")])])]),((!hasProfile) ? h.el("view", {"hover-class": "card--hover","hover-start-time": "0","hover-stay-time": "80","onclick": h.ev("goProfile",'catch')}, "card card--tap cta mt-4", undefined, [h.el("view", {}, "row-between", undefined, [h.el("view", {}, "col grow", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text("先录入身体数据")]),h.el("text", {}, "t-sm t-muted mt-1", undefined, [h.text("30秒生成你的专属营养方案")])]),h.el("view", {}, "cta__arrow center", undefined, [h.el("text", {}, "t-lg", undefined, [h.text("→")])])])]) : null),((hasProfile) ? h.el("block", {}, undefined, undefined, [h.el("view", {"onclick": h.ev("goNutrition")}, "card mt-4 dash", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text("今日营养目标")]),h.el("text", {}, "t-sm t-mint", undefined, [h.text("查看详情 →")])]),h.el("view", {}, "row mt-3", undefined, [h.el("cal-ring", {"size": "220","thickness": "18","value": (nut.targetCalories),"max": (nut.tdee)}, undefined, undefined, [h.el("text", {}, "ring-kcal t-lg t-bold t-mint", undefined, [h.text((nut.targetCalories))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("目标 kcal")])]),h.el("view", {}, "col grow gap-2 ml", undefined, [h.el("view", {}, "dash__item row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("基础代谢 BMR")]),h.el("text", {}, "t-sm t-bold", undefined, [h.text(((nut.bmr) + " kcal"))])]),h.el("view", {}, "dash__item row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("每日总消耗")]),h.el("text", {}, "t-sm t-bold", undefined, [h.text(((nut.tdee) + " kcal"))])]),h.el("view", {}, "dash__item row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("蛋白 / 碳水 / 脂肪")]),h.el("text", {}, "t-sm t-bold", undefined, [h.text(((nut.macros.protein) + "/" + (nut.macros.carb) + "/" + (nut.macros.fat) + "g"))])]),h.el("view", {}, "dash__item row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("目标")]),h.el("text", {}, "t-sm t-bold t-mint", undefined, [h.text((nut.goalLabel))])])])])]),h.el("view", {"onclick": h.ev("goCheckin")}, "card card--tap mt-3", undefined, [h.el("view", {}, "row-between", undefined, [h.el("view", {}, "col", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text("今日饮食打卡")]),h.el("text", {}, "t-sm t-muted mt-1", undefined, [h.text(("已完成 " + (todayDone) + " / " + (todayTotal) + " 餐"))])]),h.el("view", {}, "progress-mini", undefined, [h.el("view", {}, "progress-mini__fill", ("width:" + (todayDone / todayTotal * 100) + "%"), [])])])])]) : null),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("一键生成食谱")]),h.el("text", {"onclick": h.ev("goBrowse")}, "section-more", undefined, [h.text("食谱库 →")])]),h.el("view", {}, "scenes col gap-3", undefined, [h.each(scenes, function(item, index) { return h.el("view", {"data-scene": (item.key),"onclick": h.ev("goGenerate")}, "scene card card--tap row-between", undefined, [h.el("view", {}, "row", undefined, [h.el("view", {}, ("scene__icon center scene__icon--" + (item.color)), undefined, [h.el("text", {}, "scene__emoji", undefined, [h.text((item.emoji))])]),h.el("view", {}, "col ml", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text((item.label))]),h.el("text", {}, "t-xs t-muted mt-1", undefined, [h.text((item.desc))])])]),h.el("text", {}, "t-lg t-mint", undefined, [h.text("›")])]); })]),h.el("view", {"onclick": h.ev("goWeekPlan")}, "card card--tap week-entry mt-3 row-between", undefined, [h.el("view", {}, "row", undefined, [h.el("view", {}, "week-entry__icon center", undefined, [h.el("text", {}, "t-lg", undefined, [h.text("🗓️")])]),h.el("view", {}, "col ml", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text("生成一周食谱计划")]),h.el("text", {}, "t-xs t-muted mt-1", undefined, [h.text("7 天不重样 · 自动配好三餐+加餐")])])]),h.el("text", {}, "t-lg t-white", undefined, [h.text("›")])]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("为你推荐")]),h.el("text", {"onclick": h.ev("goBrowse")}, "section-more", undefined, [h.text("更多 →")])]),h.each(recommend, function(item, index) { return h.el("recipe-card", {"recipe": (item),"onclick": h.ev("goRecipe")}, undefined, undefined, []); }),h.el("view", {}, "foot-tip t-xs t-muted t-center mt-4", undefined, [h.text("\n    轻食谱 · 用数据吃得更健康\n  ")]),h.text("\n")]),h.text("\n")];
  }
});
__registerPage("pages/index/index", function(__req){
const store = __req("utils/store");
const nutrition = __req("utils/nutrition");
const rs = __req("utils/recipeService");

Page({
  data: {
    hasProfile: false,
    profile: null,
    nut: null,
    todayDone: 0,
    todayTotal: 4,
    todayStr: '',
    recommend: [],
    scenes: [
      { key: 'muscle', label: '健身增肌', desc: '高蛋白 · 热量盈余', emoji: '💪', color: 'mint' },
      { key: 'fatloss', label: '健身减脂', desc: '低脂 · 控卡饱腹', emoji: '🔥', color: 'carb' },
      { key: 'gentle', label: '日常养生', desc: '清淡 · 温和调理', emoji: '🌿', color: 'fat' }
    ]
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const hasProfile = store.hasProfile();
    const profile = hasProfile ? store.getProfile() : null;
    const nut = hasProfile ? nutrition.calcNutrition(profile) : null;

    const today = store.dateKey();
    const checkin = store.getCheckin(today) || {};
    const mealsDone = checkin.mealsDone || {};
    const todayDone = Object.keys(mealsDone).filter(k => mealsDone[k]).length;

    // 推荐：根据目标场景取 2 条
    let recommend = [];
    if (hasProfile) {
      const scene = rs.GOAL_SCENE[profile.goal] || 'gentle';
      recommend = rs.byScene(scene).slice(0, 3);
    } else {
      recommend = rs.getAll().slice(0, 3);
    }

    this.setData({
      hasProfile, profile, nut, todayDone, todayTotal: 4,
      todayStr: today, recommend
    });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  goNutrition() {
    if (!this.data.hasProfile) {
      wx.navigateTo({ url: '/pages/profile/profile?from=nutrition' });
      return;
    }
    wx.navigateTo({ url: '/pages/nutrition/nutrition' });
  },

  goGenerate(e) {
    const scene = e.currentTarget.dataset.scene;
    wx.navigateTo({ url: '/pages/generate/generate?scene=' + scene });
  },

  goWeekPlan() {
    const goal = store.hasProfile() ? store.getProfile().goal : 'maintain';
    const scene = rs.GOAL_SCENE[goal] || 'gentle';
    wx.navigateTo({ url: '/pages/weekplan/weekplan?scene=' + scene });
  },

  goBrowse() {
    wx.switchTab({ url: '/pages/browse/browse' });
  },

  goCheckin() {
    wx.switchTab({ url: '/pages/checkin/checkin' });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  goRecipe(e) {
    wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?id=' + e.detail.id });
  }
});

});
/* ===== page: pages/profile/profile ===== */
__registerPageTemplate("pages/profile/profile", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [h.el("view", {}, "page-wrap", undefined, [h.el("view", {}, "intro", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text("填写你的身体数据")]),h.el("text", {}, "t-sm t-muted mt-1", undefined, [h.text("用于精准计算你的代谢与营养需求，仅保存在本机")])]),h.el("view", {}, "card mt-4", undefined, [h.el("text", {}, "field-label", undefined, [h.text("性别")]),h.el("view", {}, "seg row mt-2", undefined, [h.el("view", {"data-value": "female","onclick": h.ev("pickGender")}, ("seg__item " + (profile.gender === 'female' ? 'seg__item--on' : '')), undefined, [h.text("女生")]),h.el("view", {"data-value": "male","onclick": h.ev("pickGender")}, ("seg__item " + (profile.gender === 'male' ? 'seg__item--on' : '')), undefined, [h.text("男生")])])]),h.el("view", {}, "card mt-3", undefined, [h.el("view", {}, "num-row row-between", undefined, [h.el("text", {}, "field-label", undefined, [h.text("身高")]),h.el("view", {}, "num-input row", undefined, [h.el("input", {"type": "digit","data-field": "height","placeholder": "0","value": (profile.height),"oninput": h.ev("onInput")}, "num-input__el", undefined, []),h.el("text", {}, "num-input__unit t-sm t-muted", undefined, [h.text("cm")])])]),h.el("view", {}, "divider", undefined, []),h.el("view", {}, "num-row row-between", undefined, [h.el("text", {}, "field-label", undefined, [h.text("体重")]),h.el("view", {}, "num-input row", undefined, [h.el("input", {"type": "digit","data-field": "weight","placeholder": "0","value": (profile.weight),"oninput": h.ev("onInput")}, "num-input__el", undefined, []),h.el("text", {}, "num-input__unit t-sm t-muted", undefined, [h.text("kg")])])]),h.el("view", {}, "divider", undefined, []),h.el("view", {}, "num-row row-between", undefined, [h.el("text", {}, "field-label", undefined, [h.text("年龄")]),h.el("view", {}, "num-input row", undefined, [h.el("input", {"type": "number","data-field": "age","placeholder": "0","value": (profile.age),"oninput": h.ev("onInput")}, "num-input__el", undefined, []),h.el("text", {}, "num-input__unit t-sm t-muted", undefined, [h.text("岁")])])])]),h.el("view", {}, "card mt-3", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "field-label", undefined, [h.text("每周运动次数")]),h.el("text", {}, "t-sm t-mint", undefined, [h.text(((profile.weeklyExercise) + " 次 / 周"))])]),h.el("view", {}, "stepper row-between mt-3", undefined, [h.el("view", {"data-delta": "-1","onclick": h.ev("stepExercise")}, "stepper__btn center", undefined, [h.text("−")]),h.el("view", {}, "stepper__track grow", undefined, [h.el("view", {}, "stepper__fill", ("width:" + (profile.weeklyExercise / 7 * 100) + "%"), [])]),h.el("view", {"data-delta": "1","onclick": h.ev("stepExercise")}, "stepper__btn center", undefined, [h.text("+")])]),h.el("text", {}, "t-xs t-muted mt-2", undefined, [h.text("用于估算日常活动消耗，0 次 = 久坐少动")])]),h.el("view", {}, "card mt-3", undefined, [h.el("text", {}, "field-label", undefined, [h.text("身体目标")]),h.el("view", {}, "goals col gap-2 mt-2", undefined, [h.each(goals, function(item, index) { return h.el("view", {"data-value": (item.key),"onclick": h.ev("pickGoal")}, ("goal row " + (profile.goal === item.key ? 'goal--on' : '')), undefined, [h.el("text", {}, "goal__emoji", undefined, [h.text((item.emoji))]),h.el("view", {}, "col ml-2 grow", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text((item.label))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text((item.desc))])]),h.el("view", {}, "goal__check center", undefined, [((profile.goal === item.key) ? h.el("text", {}, undefined, undefined, [h.text("✓")]) : null)])]); })])]),((preview) ? h.el("view", {}, "card preview mt-3", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text("实时测算预览")]),h.el("view", {}, "preview__grid mt-3", undefined, [h.el("view", {}, "preview__cell", undefined, [h.el("text", {}, "preview__num t-lg t-bold t-mint", undefined, [h.text((preview.bmr))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("基础代谢 BMR")])]),h.el("view", {}, "preview__cell", undefined, [h.el("text", {}, "preview__num t-lg t-bold t-mint", undefined, [h.text((preview.tdee))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("总消耗 kcal")])]),h.el("view", {}, "preview__cell", undefined, [h.el("text", {}, "preview__num t-lg t-bold t-mint", undefined, [h.text((preview.targetCalories))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("推荐摄入 kcal")])]),h.el("view", {}, "preview__cell", undefined, [h.el("text", {}, "preview__num t-lg t-bold t-mint", undefined, [h.text((preview.bmi))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("BMI · " + (preview.bmiLabel)))])])]),h.el("view", {}, "mt-3 row wrap gap-2", undefined, [h.el("text", {}, "tag tag--protein", undefined, [h.text(("蛋白 " + (preview.macros.protein) + "g"))]),h.el("text", {}, "tag tag--carb", undefined, [h.text(("碳水 " + (preview.macros.carb) + "g"))]),h.el("text", {}, "tag tag--fat", undefined, [h.text(("脂肪 " + (preview.macros.fat) + "g"))])])]) : null),h.el("view", {}, "save-bar", undefined, [h.el("button", {"disabled": (!canSave),"onclick": h.ev("save")}, "btn btn--primary btn--block", undefined, [h.text("保存并计算")])]),h.text("\n")]),h.text("\n")];
  }
});
__registerPage("pages/profile/profile", function(__req){
const store = __req("utils/store");
const nutrition = __req("utils/nutrition");

Page({
  data: {
    profile: null,
    from: '',
    goals: [
      { key: 'muscle',   label: '增肌',     desc: '热量盈余 · 高蛋白', emoji: '💪' },
      { key: 'fatloss',  label: '减脂',     desc: '热量缺口 · 控脂',   emoji: '🔥' },
      { key: 'maintain', label: '健康维持', desc: '保持体重 · 均衡',   emoji: '🌿' }
    ],
    preview: null,
    canSave: false
  },

  onLoad(options) {
    const p = store.getProfile();
    this.setData({
      profile: p,
      from: options.from || ''
    });
    this.updatePreview(p);
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    let val = e.detail.value;
    const profile = Object.assign({}, this.data.profile);
    profile[field] = (field === 'height' || field === 'weight' || field === 'age' || field === 'weeklyExercise')
      ? (val === '' ? '' : Number(val))
      : val;
    this.setData({ profile });
    this.updatePreview(profile);
  },

  pickGender(e) {
    const gender = e.currentTarget.dataset.value;
    const profile = Object.assign({}, this.data.profile, { gender });
    this.setData({ profile });
    this.updatePreview(profile);
  },

  pickGoal(e) {
    const goal = e.currentTarget.dataset.value;
    const profile = Object.assign({}, this.data.profile, { goal });
    this.setData({ profile });
    this.updatePreview(profile);
  },

  stepExercise(e) {
    const delta = Number(e.currentTarget.dataset.delta);
    let n = Number(this.data.profile.weeklyExercise) || 0;
    n = Math.max(0, Math.min(7, n + delta));
    const profile = Object.assign({}, this.data.profile, { weeklyExercise: n });
    this.setData({ profile });
    this.updatePreview(profile);
  },

  updatePreview(p) {
    const valid = p && Number(p.height) > 0 && Number(p.weight) > 0 && Number(p.age) > 0;
    let preview = null;
    if (valid) {
      preview = nutrition.calcNutrition(p);
    }
    this.setData({ preview, canSave: valid });
  },

  save() {
    if (!this.data.canSave) {
      wx.showToast({ title: '请完整填写身体数据', icon: 'none' });
      return;
    }
    const p = store.setProfile(this.data.profile);
    this.setData({ profile: p });
    wx.showToast({ title: '已保存', icon: 'success' });

    setTimeout(() => {
      if (this.data.from === 'nutrition') {
        wx.redirectTo({ url: '/pages/nutrition/nutrition' });
      } else {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
      }
    }, 600);
  }
});

});
/* ===== page: pages/nutrition/nutrition ===== */
__registerPageTemplate("pages/nutrition/nutrition", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [((nut) ? h.el("view", {}, "page-wrap", undefined, [h.el("view", {}, "card hero-card", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text("每日推荐摄入")]),h.el("text", {}, "tag", undefined, [h.text((nut.goalLabel))])]),h.el("view", {}, "center col mt-3", undefined, [h.el("cal-ring", {"size": "400","thickness": "22","value": (nut.targetCalories),"max": (nut.tdee)}, undefined, undefined, [h.el("text", {}, "hero-num t-2xl t-bold t-mint", undefined, [h.text((nut.targetCalories))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("kcal / 天")]),h.el("text", {}, "t-xs t-muted mt-1", undefined, [h.text(("总消耗 " + (nut.tdee)))])])]),h.el("view", {}, "row-between mt-4 stats-strip", undefined, [h.el("view", {}, "strip-cell col center", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text((nut.bmr))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("BMR 基础代谢")])]),h.el("view", {}, "strip-line", undefined, []),h.el("view", {}, "strip-cell col center", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text((nut.activityFactor))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("活动系数")])]),h.el("view", {}, "strip-line", undefined, []),h.el("view", {}, "strip-cell col center", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text((nut.bmi))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("BMI · " + (nut.bmiLabel)))])])])]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("三大营养素标准")])]),h.el("view", {}, "card", undefined, [h.el("macro-bar", {"protein": (nut.macros.protein),"carb": (nut.macros.carb),"fat": (nut.macros.fat),"proteinCal": (nut.macros.proteinCal),"carbCal": (nut.macros.carbCal),"fatCal": (nut.macros.fatCal)}, undefined, undefined, []),h.el("view", {}, "divider", undefined, []),h.el("view", {}, "macro-detail row", undefined, [h.el("view", {}, "md-cell col center grow md-cell--p", undefined, [h.el("text", {}, "md-num t-xl t-bold", undefined, [h.text(((nut.macros.protein) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("蛋白质")]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("约 " + (nut.macros.proteinCal) + " kcal"))])]),h.el("view", {}, "md-cell col center grow md-cell--c", undefined, [h.el("text", {}, "md-num t-xl t-bold", undefined, [h.text(((nut.macros.carb) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("碳水化合物")]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("约 " + (nut.macros.carbCal) + " kcal"))])]),h.el("view", {}, "md-cell col center grow md-cell--f", undefined, [h.el("text", {}, "md-num t-xl t-bold", undefined, [h.text(((nut.macros.fat) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("脂肪")]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("约 " + (nut.macros.fatCal) + " kcal"))])])])]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("三餐 + 加餐 热量分配")])]),h.el("view", {}, "card", undefined, [h.each(meals, function(item, index) { return h.el("view", {}, "meal-split row-between", undefined, [h.el("view", {}, "row", undefined, [h.el("text", {}, "meal-split__icon", undefined, [h.text((item.icon))]),h.el("text", {}, "t-md", undefined, [h.text((item.label))])]),h.el("view", {}, "row gap-3", undefined, [h.el("view", {}, "meal-split__bar", undefined, [h.el("view", {}, "meal-split__fill", ("width:" + (item.ratio * 100 / 0.35) + "%"), [])]),h.el("text", {}, "t-sm t-bold t-mint meal-split__num", undefined, [h.text(((item.calories) + " kcal"))])])]); })]),h.el("view", {}, "card--flat card mt-3 row-between", undefined, [h.el("view", {}, "row gap-2", undefined, [h.el("text", {}, "t-lg", undefined, [h.text("💧")]),h.el("view", {}, "col", undefined, [h.el("text", {}, "t-sm t-bold", undefined, [h.text("建议每日饮水")]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("按体重每公斤 35ml 估算")])])]),h.el("text", {}, "t-md t-bold t-mint", undefined, [h.text(((nut.water) + " ml"))])]),h.el("view", {}, "tip-note t-xs t-muted mt-3", undefined, [h.text("\n    说明：BMR 采用 Mifflin-St Jeor 公式；TDEE = BMR × 活动系数；增肌 +12%、减脂 −18% 热量调整，且保证不低于基础代谢。\n  ")]),h.el("view", {}, "bottom-actions", undefined, [h.el("button", {"onclick": h.ev("goProfile")}, "btn btn--ghost", undefined, [h.text("修改数据")]),h.el("button", {"onclick": h.ev("goGenerate")}, "btn btn--primary grow", undefined, [h.text("生成今日食谱")])]),h.text("\n")]) : null),h.text("\n")];
  }
});
__registerPage("pages/nutrition/nutrition", function(__req){
const store = __req("utils/store");
const nutrition = __req("utils/nutrition");

Page({
  data: {
    nut: null,
    profile: null,
    meals: [],
    bmrPct: 0
  },

  onShow() {
    if (!store.hasProfile()) {
      wx.redirectTo({ url: '/pages/profile/profile?from=nutrition' });
      return;
    }
    const profile = store.getProfile();
    const nut = nutrition.calcNutrition(profile);
    const meals = nutrition.mealSplit(nut.targetCalories);
    // BMR 占总消耗比例（用于环形图展示）
    const bmrPct = Math.round((nut.bmr / nut.tdee) * 100);
    this.setData({ profile, nut, meals, bmrPct });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  goGenerate() {
    const scene = __req("utils/recipeService").GOAL_SCENE[this.data.profile.goal] || 'gentle';
    wx.navigateTo({ url: '/pages/generate/generate?scene=' + scene });
  }
});

});
/* ===== page: pages/generate/generate ===== */
__registerPageTemplate("pages/generate/generate", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [h.el("view", {}, "page-wrap page-wrap--flat", undefined, [h.el("view", {}, "tabs row", undefined, [h.each(sceneTabs, function(item, index) { return h.el("view", {"data-scene": (item.key),"onclick": h.ev("switchScene")}, ("tabs__item " + (scene === item.key ? 'tabs__item--on' : '')), undefined, [h.el("text", {}, "tabs__emoji", undefined, [h.text((item.emoji))]),h.el("text", {}, "tabs__label", undefined, [h.text((item.label))])]); })]),((!hasProfile) ? h.el("view", {"onclick": h.ev("goProfile")}, "card card--tap mt-3 row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("未录入身体数据，营养对比不可用 · 点击去录入")]),h.el("text", {}, "t-mint", undefined, [h.text("→")])]) : null),((plan && !loading) ? h.el("view", {}, "card summary mt-3", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text(((plan.sceneLabel) + " · 一日方案"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("点击可重生成")])]),h.el("view", {}, "row mt-3 summary__row", undefined, [h.el("view", {}, "col center grow", undefined, [h.el("text", {}, "t-xl t-bold t-mint", undefined, [h.text((summary.kcal))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("总热量 kcal")])]),h.el("view", {}, "col center grow", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((summary.protein) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("蛋白质")])]),h.el("view", {}, "col center grow", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((summary.carb) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("碳水")])]),h.el("view", {}, "col center grow", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((summary.fat) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("脂肪")])])]),((target) ? h.el("view", {}, "mt-3", undefined, [h.el("macro-bar", {"compact": true,"protein": (summary.protein),"carb": (summary.carb),"fat": (summary.fat),"proteinCal": (summary.protein * 4),"carbCal": (summary.carb * 4),"fatCal": (summary.fat * 9)}, undefined, undefined, []),h.el("view", {}, "diff-row row wrap gap-2 mt-3", undefined, [h.el("text", {}, ("tag " + (diff.kcal > 0 ? 'tag--carb' : 'tag--protein')), undefined, [h.text(("\n          热量 " + (diff.kcal > 0 ? '+' : '') + (diff.kcal) + " kcal\n        "))]),h.el("text", {}, "tag", undefined, [h.text(("蛋白 " + (diff.protein > 0 ? '+' : '') + (diff.protein) + "g"))]),h.el("text", {}, "tag", undefined, [h.text(("碳水 " + (diff.carb > 0 ? '+' : '') + (diff.carb) + "g"))]),h.el("text", {}, "tag", undefined, [h.text(("脂肪 " + (diff.fat > 0 ? '+' : '') + (diff.fat) + "g"))])])]) : null)]) : null),((loading) ? h.el("view", {}, "loading center col", undefined, [h.el("view", {}, "loading__dot", undefined, []),h.el("text", {}, "t-sm t-muted mt-3", undefined, [h.text("正在为你智能搭配…")])]) : null),((plan && !loading) ? h.el("block", {}, undefined, undefined, [h.each(plan.meals, function(item, index) { return h.el("view", {}, "meal-block", undefined, [h.el("view", {}, "meal-head row-between", undefined, [h.el("view", {}, "row", undefined, [h.el("text", {}, "meal-head__icon", undefined, [h.text((item.icon))]),h.el("text", {}, "meal-head__title t-md t-bold", undefined, [h.text((item.label))])]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("建议 " + (item.calories) + " kcal"))])]),h.el("view", {"data-id": (item.recipe.id),"onclick": h.ev("goDetail")}, "dish card card--tap", undefined, [h.el("view", {}, "dish__row row", undefined, [h.el("image", {"mode": "aspectFill","lazy-load": true,"src": (item.recipe.image)}, "dish__thumb", undefined, []),h.el("view", {}, "dish__main grow col", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-md t-bold grow t-ellipsis", undefined, [h.text((item.recipe.name))]),h.el("text", {}, "dish__chev", undefined, [h.text("›")])]),h.el("view", {}, "row wrap gap-1 mt-2", undefined, [h.el("text", {}, "tag tag--soft", undefined, [h.text(("⏱ " + (item.recipe.cookTime) + "分钟"))]),h.el("text", {}, "tag tag--soft", undefined, [h.text((item.recipe.difficultyText))])])])]),h.el("view", {}, "row-between mt-3 dish__nut", undefined, [h.el("text", {}, "t-sm t-bold t-mint", undefined, [h.text(((item.nutrition.kcal) + " kcal"))]),h.el("view", {}, "row gap-2", undefined, [h.el("text", {}, "t-xs t-muted", undefined, [h.text(("蛋 " + (item.nutrition.protein) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("碳 " + (item.nutrition.carb) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("脂 " + (item.nutrition.fat) + "g"))])])])])]); }),h.el("view", {}, "bottom-actions", undefined, [h.el("button", {"onclick": h.ev("regenerate")}, "btn btn--ghost", undefined, [h.text("换一批")]),h.el("button", {"onclick": h.ev("saveAll")}, "btn btn--primary grow", undefined, [h.text("收藏整套")])])]) : null),h.text("\n")]),h.text("\n")];
  }
});
__registerPage("pages/generate/generate", function(__req){
const store = __req("utils/store");
const nutrition = __req("utils/nutrition");
const rs = __req("utils/recipeService");

Page({
  data: {
    scene: 'gentle',
    sceneTabs: [
      { key: 'muscle', label: '健身增肌', emoji: '💪' },
      { key: 'fatloss', label: '健身减脂', emoji: '🔥' },
      { key: 'gentle', label: '日常养生', emoji: '🌿' }
    ],
    plan: null,
    summary: null,
    target: null,
    diff: null,
    loading: false,
    hasProfile: false
  },

  onLoad(options) {
    const scene = options.scene || 'gentle';
    const hasProfile = store.hasProfile();
    const target = hasProfile ? nutrition.calcNutrition(store.getProfile()) : null;
    this.setData({ scene, hasProfile, target });
    this.generate(scene);
  },

  switchScene(e) {
    const scene = e.currentTarget.dataset.scene;
    this.setData({ scene });
    this.generate(scene);
  },

  generate(scene) {
    this.setData({ loading: true });
    const plan = rs.generatePlan(scene);
    const summary = rs.planSummary(plan);
    const target = this.data.target;
    let diff = null;
    if (target) {
      diff = {
        kcal: summary.kcal - target.targetCalories,
        protein: +(summary.protein - target.macros.protein).toFixed(1),
        carb: +(summary.carb - target.macros.carb).toFixed(1),
        fat: +(summary.fat - target.macros.fat).toFixed(1)
      };
    }
    // 附加每条食谱营养，并按目标热量给出建议分配（早餐25%/午餐35%/晚餐30%/加餐10%）
    const ratios = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
    plan.meals = plan.meals.map(m => Object.assign({}, m, {
      nutrition: rs.calcRecipeNutrition(m.recipe),
      calories: target
        ? Math.round(target.targetCalories * (ratios[m.key] || m.ratio || 0.25))
        : Math.round(rs.calcRecipeNutrition(m.recipe).kcal)
    }));

    setTimeout(() => {
      this.setData({ plan, summary, diff, loading: false });
      store.setPlan({
        scene,
        createdAt: plan.createdAt,
        mealIds: plan.meals.map(m => ({ key: m.key, id: m.recipe.id }))
      });
    }, 260);
  },

  regenerate() {
    this.generate(this.data.scene);
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?id=' + id });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  saveAll() {
    let count = 0;
    (this.data.plan.meals || []).forEach(m => {
      if (!store.isFavorite(m.recipe.id)) {
        store.toggleFavorite(m.recipe.id);
        count++;
      }
    });
    wx.showToast({ title: count ? `已收藏 ${count} 道` : '已全部收藏', icon: 'none' });
  }
});

});
/* ===== page: pages/weekplan/weekplan ===== */
__registerPageTemplate("pages/weekplan/weekplan", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [h.el("view", {}, "page-wrap page-wrap--flat", undefined, [h.el("view", {}, "tabs row", undefined, [h.each(sceneTabs, function(item, index) { return h.el("view", {"data-scene": (item.key),"onclick": h.ev("switchScene")}, ("tabs__item " + (scene === item.key ? 'tabs__item--on' : '')), undefined, [h.el("text", {}, "tabs__emoji", undefined, [h.text((item.emoji))]),h.el("text", {}, "tabs__label", undefined, [h.text((item.label))])]); })]),((avg) ? h.el("view", {}, "card avg mt-3", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text("本周日均营养")]),((target) ? h.el("text", {}, "t-xs t-muted", undefined, [h.text(("目标 " + (target.targetCalories) + " kcal"))]) : null)]),h.el("view", {}, "row mt-3 avg__row", undefined, [h.el("view", {}, "col center grow", undefined, [h.el("text", {}, "t-xl t-bold t-mint", undefined, [h.text((avg.kcal))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("热量 kcal")])]),h.el("view", {}, "col center grow", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((avg.protein) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("蛋白")])]),h.el("view", {}, "col center grow", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((avg.carb) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("碳水")])]),h.el("view", {}, "col center grow", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((avg.fat) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("脂肪")])])])]) : null),h.el("scroll-view", {"scroll-x": true,"enhanced": true,"show-scrollbar": (false)}, "daytabs", undefined, [h.el("view", {}, "daytabs__inner row", undefined, [h.each(days, function(item, index) { return h.el("view", {"data-idx": (index),"onclick": h.ev("pickDay")}, ("daytab " + (activeDay === index ? 'daytab--on' : '') + " " + (item.isToday ? 'daytab--today' : '')), undefined, [h.el("text", {}, "daytab__w", undefined, [h.text((item.weekday))]),h.el("text", {}, "daytab__d", undefined, [h.text((item.date))])]); })])]),((days.length) ? h.el("block", {}, undefined, undefined, [h.each(days, function(item, index) { return (activeDay === index ? h.el("view", {}, "card day-sum", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text((("item.weekday}} · {{item.date")))]),h.el("text", {}, "t-sm t-bold t-mint", undefined, [h.text(((item.total.kcal) + " kcal"))])]),h.el("view", {}, "row wrap gap-2 mt-2", undefined, [h.el("text", {}, "tag tag--protein", undefined, [h.text(("蛋白 " + (item.total.protein) + "g"))]),h.el("text", {}, "tag tag--carb", undefined, [h.text(("碳水 " + (item.total.carb) + "g"))]),h.el("text", {}, "tag tag--fat", undefined, [h.text(("脂肪 " + (item.total.fat) + "g"))])])]) : null); }),h.each(days, function(item, index) { return (activeDay === index ? h.el("view", {}, "meal-block", undefined, [h.each(item.meals, function(m, index) { return h.el("view", {}, undefined, undefined, [h.el("view", {}, "day-meal row-between", undefined, [h.el("text", {}, "day-meal__icon", undefined, [h.text((m.icon))]),h.el("text", {}, "t-sm t-sub nowrap", undefined, [h.text((m.label))]),h.el("text", {}, "t-xs t-muted nowrap", undefined, [h.text(((m.calories) + " kcal"))])]),h.el("view", {"data-id": (m.recipe.id),"onclick": h.ev("goDetail")}, "dish card card--tap row", undefined, [h.el("image", {"mode": "aspectFill","lazy-load": true,"src": (m.recipe.image)}, "dish__thumb", undefined, []),h.el("view", {}, "dish__main grow col", undefined, [h.el("text", {}, "t-md t-bold t-ellipsis", undefined, [h.text((m.recipe.name))]),h.el("view", {}, "row gap-2 mt-2", undefined, [h.el("text", {}, "t-xs t-muted", undefined, [h.text(("⏱ " + (m.recipe.cookTime) + "分钟"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("蛋" + (m.nutrition.protein) + " 碳" + (m.nutrition.carb) + " 脂" + (m.nutrition.fat)))])])]),h.el("text", {}, "dish__chev", undefined, [h.text("›")])])]); })]) : null); })]) : null),h.el("view", {}, "foot-tip t-xs t-muted t-center mt-4", undefined, [h.text("\n    一周计划已保存 · 每天可点开查看详情\n  ")]),h.text("\n")]),h.text("\n")];
  }
});
__registerPage("pages/weekplan/weekplan", function(__req){
const store = __req("utils/store");
const nutrition = __req("utils/nutrition");
const rs = __req("utils/recipeService");

Page({
  data: {
    scene: 'gentle',
    sceneTabs: [
      { key: 'muscle', label: '增肌', emoji: '💪' },
      { key: 'fatloss', label: '减脂', emoji: '🔥' },
      { key: 'gentle', label: '养生', emoji: '🌿' }
    ],
    days: [],
    activeDay: 0,
    avg: null,
    target: null,
    hasProfile: false
  },

  onLoad(options) {
    const hasProfile = store.hasProfile();
    let scene = options.scene;
    if (!scene && hasProfile) {
      scene = rs.GOAL_SCENE[store.getProfile().goal] || 'gentle';
    }
    this.setData({
      scene: scene || 'gentle',
      hasProfile,
      target: hasProfile ? nutrition.calcNutrition(store.getProfile()) : null
    });
    this.build();
  },

  switchScene(e) {
    this.setData({ scene: e.currentTarget.dataset.scene, activeDay: 0 });
    this.build();
  },

  build() {
    const wk = rs.generateWeekPlan(this.data.scene);
    const avg = rs.weekPlanSummary(wk);
    const target = this.data.target;
    const ratios = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
    // 给每天附加营养汇总
    const days = wk.days.map(d => {
      const total = { kcal: 0, protein: 0, carb: 0, fat: 0 };
      d.meals = d.meals.map(m => {
        const n = rs.calcRecipeNutrition(m.recipe);
        total.kcal += n.kcal; total.protein += n.protein;
        total.carb += n.carb; total.fat += n.fat;
        return Object.assign({}, m, {
          nutrition: n,
          calories: target
            ? Math.round(target.targetCalories * (ratios[m.key] || m.ratio || 0.25))
            : Math.round(n.kcal)
        });
      });
      total.kcal = Math.round(total.kcal);
      total.protein = +total.protein.toFixed(1);
      total.carb = +total.carb.toFixed(1);
      total.fat = +total.fat.toFixed(1);
      return Object.assign({}, d, { total });
    });
    this.setData({ days, avg });
    store.setWeekPlan({ scene: this.data.scene, createdAt: wk.createdAt });
  },

  pickDay(e) {
    this.setData({ activeDay: Number(e.currentTarget.dataset.idx) });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?id=' + e.currentTarget.dataset.id });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  }
});

});
/* ===== page: pages/recipe-detail/recipe-detail ===== */
__registerPageTemplate("pages/recipe-detail/recipe-detail", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [((recipe) ? h.el("view", {}, "page-wrap", undefined, [h.el("view", {}, "cover", undefined, [h.el("image", {"mode": "aspectFill","src": (recipe.image)}, "cover__img", undefined, []),h.el("view", {}, "cover__grad", undefined, []),h.el("view", {}, "cover__title col", undefined, [h.el("text", {}, "t-xl t-bold cover__name", undefined, [h.text((recipe.name))]),h.el("view", {}, "row wrap gap-1 mt-2", undefined, [h.el("text", {}, "cover__chip", undefined, [h.text((recipe.mealLabel))]),h.el("text", {}, "cover__chip", undefined, [h.text(("🔥 " + (recipe.nutrition.kcal) + " kcal"))]),h.el("text", {}, "cover__chip", undefined, [h.text(("⏱ " + (recipe.cookTime) + "分钟"))]),h.el("text", {}, "cover__chip", undefined, [h.text((recipe.difficultyText))])])]),h.el("view", {"onclick": h.ev("toggleFav")}, ("cover__fav center " + (isFav ? 'cover__fav--on' : '')), undefined, [h.el("text", {}, undefined, undefined, [h.text((isFav ? '❤️' : '🤍'))])])]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("营养成分")]),((changed) ? h.el("text", {"onclick": h.ev("resetRecipe")}, "section-more", undefined, [h.text("恢复原食谱")]) : null)]),h.el("view", {}, "card", undefined, [h.el("view", {}, "row-between nut-top", undefined, [h.el("view", {}, "col center", undefined, [h.el("text", {}, "t-xl t-bold t-mint", undefined, [h.text((recipe.nutrition.kcal))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("总热量 kcal")])]),h.el("view", {}, "strip-line", undefined, []),h.el("view", {}, "col center", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((recipe.nutrition.protein) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("蛋白质")])]),h.el("view", {}, "strip-line", undefined, []),h.el("view", {}, "col center", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((recipe.nutrition.carb) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("碳水")])]),h.el("view", {}, "strip-line", undefined, []),h.el("view", {}, "col center", undefined, [h.el("text", {}, "t-lg t-bold", undefined, [h.text(((recipe.nutrition.fat) + "g"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("脂肪")])])]),h.el("view", {}, "divider", undefined, []),h.el("macro-bar", {"compact": true,"protein": (recipe.nutrition.protein),"carb": (recipe.nutrition.carb),"fat": (recipe.nutrition.fat),"proteinCal": (recipe.nutrition.protein * 4),"carbCal": (recipe.nutrition.carb * 4),"fatCal": (recipe.nutrition.fat * 9)}, undefined, undefined, [])]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("食材清单")]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("点食材可一键替换")])]),h.el("view", {}, "card ing-list", undefined, [h.each(recipe.ingredients, function(item, index) { return h.el("view", {"data-index": (index),"onclick": h.ev("openSub")}, "ing row-between", undefined, [h.el("view", {}, "row", undefined, [h.el("view", {}, "ing__dot", undefined, []),h.el("text", {}, "t-md", undefined, [h.text((item.name))])]),h.el("view", {}, "row gap-2", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text((item.text))]),h.el("text", {}, "ing__swap", undefined, [h.text("⇄")])])]); })]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("详细步骤")])]),h.el("view", {}, "card", undefined, [h.each(recipe.steps, function(item, index) { return h.el("view", {}, "step row", undefined, [h.el("view", {}, "step__no center", undefined, [h.text((index + 1))]),h.el("text", {}, "step__text t-sm grow", undefined, [h.text((item))])]); })]),((recipe.tip) ? h.el("view", {}, "card--flat card mt-3", undefined, [h.el("view", {}, "row", undefined, [h.el("text", {}, "t-md", undefined, [h.text("💡")]),h.el("text", {}, "t-sm t-sub grow ml-2", undefined, [h.text((recipe.tip))])])]) : null),h.el("view", {}, "bottom-actions", undefined, [h.el("button", {"onclick": h.ev("toggleFav")}, ("btn " + (isFav ? 'btn--ghost' : 'btn--primary') + " btn--block"), undefined, [h.text((isFav ? '已收藏' : '收藏这道菜'))])]),((subVisible) ? h.el("view", {"onclick": h.ev("closeSub")}, "mask", undefined, []) : null),h.el("view", {"onclick": h.ev("noop",'catch')}, ("sheet " + (subVisible ? 'sheet--open' : '')), undefined, [h.el("view", {}, "sheet__handle", undefined, []),h.el("view", {}, "sheet__head", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text(("替换「" + (subOriginName) + "」"))]),h.el("text", {}, "t-xs t-muted mt-1", undefined, [h.text("已自动折算用量，让热量/营养尽量持平")])]),h.el("view", {}, "sheet__origin row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text(("原食材 " + (subOriginAmount) + "g"))]),h.el("text", {}, "t-sm t-mint", undefined, [h.text(((subOriginKcal) + " kcal"))])]),h.el("scroll-view", {"scroll-y": true}, "sheet__list", undefined, [h.each(substitutes, function(item, index) { return h.el("view", {"data-idx": (index),"onclick": h.ev("applySub")}, ("sub-item row-between " + (item.name === subOriginName ? 'sub-item--cur' : '')), undefined, [h.el("view", {}, "col grow", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text((item.name))]),h.el("text", {}, "t-xs t-muted mt-1", undefined, [h.text(("建议 " + (item.amount) + (item.unit) + " · " + (item.reason)))])]),h.el("view", {}, "col center sub-item__right", undefined, [h.el("text", {}, "t-sm t-bold t-mint", undefined, [h.text(((item.nutrition.kcal) + " kcal"))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(("\n            蛋" + (item.nutrition.protein) + " 碳" + (item.nutrition.carb) + " 脂" + (item.nutrition.fat) + "\n          "))])])]); })])]),h.text("\n")]) : null),h.text("\n")];
  }
});
__registerPage("pages/recipe-detail/recipe-detail", function(__req){
const store = __req("utils/store");
const rs = __req("utils/recipeService");

Page({
  data: {
    recipe: null,
    original: null,
    isFav: false,
    // 替换面板
    subVisible: false,
    subIndex: -1,
    subOriginName: '',
    subOriginAmount: 0,
    substitutes: [],
    changed: false
  },

  onLoad(options) {
    const id = options.id;
    const base = rs.getById(id);
    if (!base) {
      wx.showToast({ title: '食谱不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.baseId = id;
    this.setData({
      recipe: base,
      original: JSON.parse(JSON.stringify(base)),
      isFav: store.isFavorite(id)
    });
    wx.setNavigationBarTitle({ title: base.name });
  },

  toggleFav() {
    const fav = store.toggleFavorite(this.data.recipe.id);
    this.setData({ isFav: fav });
    wx.showToast({ title: fav ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  /* ---------- 食材替换 ---------- */
  openSub(e) {
    const index = Number(e.currentTarget.dataset.index);
    const ing = this.data.recipe.ingredients[index];
    const scene = this.data.recipe.scene && this.data.recipe.scene[0];
    const prefer = scene === 'muscle' ? 'muscle' : (scene === 'fatloss' ? 'fatloss' : '');
    const subs = rs.findSubstitutes(ing.name, ing.amount, { scenePrefer: prefer });
    if (!subs.length) {
      wx.showToast({ title: '暂无可替换食材', icon: 'none' });
      return;
    }
    const sub = this.data.recipe.nutrition;
    this.setData({
      subVisible: true,
      subIndex: index,
      subOriginName: ing.name,
      subOriginAmount: ing.amount,
      subOriginKcal: __req("data/foods").nutritionOf(ing.name, ing.amount).kcal,
      substitutes: subs,
      subCurrentNutrition: sub
    });
  },

  closeSub() {
    this.setData({ subVisible: false });
  },

  applySub(e) {
    const cand = this.data.substitutes[Number(e.currentTarget.dataset.idx)];
    const recipe = rs.applySubstitution(this.data.recipe, this.data.subIndex, cand.name, cand.amount);
    this.setData({
      recipe,
      subVisible: false,
      changed: true
    });
    wx.showToast({ title: '已替换 · 营养已重算', icon: 'none' });
  },

  resetRecipe() {
    this.setData({
      recipe: JSON.parse(JSON.stringify(this.data.original)),
      changed: false
    });
    wx.showToast({ title: '已恢复原始食谱', icon: 'none' });
  },

  noop() {}
});

});
/* ===== page: pages/browse/browse ===== */
__registerPageTemplate("pages/browse/browse", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [h.el("view", {}, "page-wrap page-wrap--flat", undefined, [h.el("view", {}, "search row", undefined, [h.el("text", {}, "search__icon", undefined, [h.text("🔍")]),h.el("input", {"placeholder": "搜索食谱或食材","placeholder-class": "ph","confirm-type": "search","value": (keyword),"oninput": h.ev("onSearch")}, "search__input grow", undefined, []),((keyword) ? h.el("text", {"onclick": h.ev("clearSearch")}, "search__clear", undefined, [h.text("✕")]) : null)]),h.el("scroll-view", {"scroll-x": true,"enhanced": true,"show-scrollbar": (false)}, "cats", undefined, [h.el("view", {}, "cats__inner row", undefined, [h.each(categories, function(item, index) { return h.el("view", {"data-key": (item.key),"onclick": h.ev("pickCat")}, ("chip " + (activeCat === item.key ? 'chip--on' : '')), undefined, [h.text((item.label))]); })])]),h.el("scroll-view", {"scroll-x": true,"enhanced": true,"show-scrollbar": (false)}, "meals", undefined, [h.el("view", {}, "meals__inner row", undefined, [h.each(mealFilters, function(item, index) { return h.el("view", {"data-key": (item.key),"onclick": h.ev("pickMeal")}, ("pill " + (activeMeal === item.key ? 'pill--on' : '')), undefined, [h.text((item.label))]); })])]),h.el("view", {}, "result-head row-between", undefined, [h.el("text", {}, "t-sm t-muted", undefined, [h.text(("共 " + (list.length) + " 道食谱"))])]),((list.length) ? h.el("block", {}, undefined, undefined, [h.each(list, function(item, index) { return h.el("recipe-card", {"recipe": (item),"onclick": h.ev("goDetail")}, undefined, undefined, []); })]) : null),h.text("\n")]),h.text("\n")];
  }
});
__registerPage("pages/browse/browse", function(__req){
const rs = __req("utils/recipeService");

Page({
  data: {
    categories: rs.CATEGORIES,
    mealFilters: rs.MEAL_FILTERS,
    activeCat: 'all',
    activeMeal: 'all',
    keyword: '',
    list: []
  },

  onLoad() {
    this.applyFilter();
  },

  pickCat(e) {
    this.setData({ activeCat: e.currentTarget.dataset.key });
    this.applyFilter();
  },

  pickMeal(e) {
    this.setData({ activeMeal: e.currentTarget.dataset.key });
    this.applyFilter();
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  applyFilter() {
    const list = rs.filter({
      category: this.data.activeCat,
      meal: this.data.activeMeal,
      keyword: this.data.keyword
    });
    this.setData({ list });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?id=' + e.detail.id });
  }
});

});
/* ===== page: pages/favorites/favorites ===== */
__registerPageTemplate("pages/favorites/favorites", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [h.el("view", {}, "page-wrap page-wrap--flat", undefined, [((list.length) ? h.el("view", {}, "head row-between", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text(("共收藏 " + (list.length) + " 道食谱"))])]) : null),((list.length) ? h.el("block", {}, undefined, undefined, [h.each(list, function(item, index) { return h.el("recipe-card", {"recipe": (item),"onclick": h.ev("goDetail")}, undefined, undefined, []); })]) : null),h.text("\n")]),h.text("\n")];
  }
});
__registerPage("pages/favorites/favorites", function(__req){
const store = __req("utils/store");
const rs = __req("utils/recipeService");

Page({
  data: {
    list: []
  },

  onShow() {
    const ids = store.getFavorites();
    const list = ids
      .map(id => rs.getById(id))
      .filter(Boolean);
    this.setData({ list });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?id=' + e.detail.id });
  },

  goBrowse() {
    wx.switchTab({ url: '/pages/browse/browse' });
  }
});

});
/* ===== page: pages/checkin/checkin ===== */
__registerPageTemplate("pages/checkin/checkin", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [h.el("view", {}, "page-wrap page-wrap--flat", undefined, [h.el("view", {}, "card hero", undefined, [h.el("view", {}, "row-between", undefined, [h.el("view", {}, "col", undefined, [h.el("text", {}, "t-sm t-muted", undefined, [h.text("今天是")]),h.el("text", {}, "t-md t-bold mt-1", undefined, [h.text((today))])]),h.el("view", {}, "streak col center", undefined, [h.el("text", {}, "streak__num t-xl t-bold", undefined, [h.text((streak))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("连续打卡（天）")])])]),h.el("view", {}, "hero__progress mt-3", undefined, [h.el("view", {}, "hero__bar", undefined, [h.el("view", {}, "hero__fill", ("width:" + (doneCount / 4 * 100) + "%"), [])]),h.el("text", {}, "t-xs t-muted mt-2", undefined, [h.text(("今日已完成 " + (doneCount) + " / 4 餐"))])])]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("本周打卡")]),h.el("text", {"onclick": h.ev("goStats")}, "section-more", undefined, [h.text("数据统计 →")])]),h.el("view", {}, "card week row-between", undefined, [h.each(weekDots, function(item, index) { return h.el("view", {}, "week__day col center", undefined, [h.el("text", {}, "t-xs t-muted", undefined, [h.text((item.label))]),h.el("view", {}, ("week__dot week__dot--" + (item.level) + " " + (item.isToday ? 'week__dot--today' : '') + " center"), undefined, [h.el("text", {}, "week__dot-num", undefined, [h.text((item.day))])]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(((item.count) + "餐"))])]); })]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("今日饮食")])]),h.el("view", {}, "meals col gap-2", undefined, [h.each(meals, function(item, index) { return h.el("view", {"data-key": (item.key),"onclick": h.ev("toggleMeal")}, ("meal card card--tap row-between " + (item.done ? 'meal--done' : '')), undefined, [h.el("view", {}, "row", undefined, [h.el("view", {}, "meal__icon center", undefined, [h.el("text", {}, "meal__emoji", undefined, [h.text((item.icon))])]),h.el("text", {}, "t-md t-bold ml-2", undefined, [h.text((item.label))])]),h.el("view", {}, ("meal__check center " + (item.done ? 'meal__check--on' : '')), undefined, [((item.done) ? h.el("text", {}, undefined, undefined, [h.text("✓")]) : null)])]); })]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("今日饮食备注")])]),h.el("view", {}, "card", undefined, [h.el("textarea", {"placeholder": "记录今天的饮食感受，如饥饿度、状态…","placeholder-class": "ph","maxlength": "200","auto-height": true,"value": (note),"oninput": h.ev("onNote")}, "note", undefined, []),h.el("view", {}, "row-between mt-2", undefined, [h.el("text", {}, "t-xs t-muted", undefined, [h.text(((note.length) + "/200"))]),h.el("button", {"onclick": h.ev("saveNote")}, "btn btn--ghost btn--sm", undefined, [h.text("保存备注")])])]),((intake) ? h.el("block", {}, undefined, undefined, [h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("今日摄入进度")]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("按已打卡餐次估算")])]),h.el("view", {}, "card", undefined, [h.el("view", {}, "cmp-item", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("热量")]),h.el("text", {}, "t-sm t-bold", undefined, [h.text(((intake.kcal) + " / " + (target.targetCalories) + " kcal"))])]),h.el("view", {}, "cmp-bar", undefined, [h.el("view", {}, "cmp-bar__fill cmp-bar__fill--kcal", ("width:" + (intake.kcalPct > 100 ? 100 : intake.kcalPct) + "%"), [])]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(((intake.kcalPct) + "%"))])]),h.el("view", {}, "cmp-item", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("蛋白质")]),h.el("text", {}, "t-sm t-bold", undefined, [h.text(((intake.protein) + " / " + (target.macros.protein) + " g"))])]),h.el("view", {}, "cmp-bar", undefined, [h.el("view", {}, "cmp-bar__fill cmp-bar__fill--p", ("width:" + (intake.proteinPct > 100 ? 100 : intake.proteinPct) + "%"), [])]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(((intake.proteinPct) + "%"))])]),h.el("view", {}, "cmp-item", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("碳水化合物")]),h.el("text", {}, "t-sm t-bold", undefined, [h.text(((intake.carb) + " / " + (target.macros.carb) + " g"))])]),h.el("view", {}, "cmp-bar", undefined, [h.el("view", {}, "cmp-bar__fill cmp-bar__fill--c", ("width:" + (intake.carbPct > 100 ? 100 : intake.carbPct) + "%"), [])]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(((intake.carbPct) + "%"))])]),h.el("view", {}, "cmp-item", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("脂肪")]),h.el("text", {}, "t-sm t-bold", undefined, [h.text(((intake.fat) + " / " + (target.macros.fat) + " g"))])]),h.el("view", {}, "cmp-bar", undefined, [h.el("view", {}, "cmp-bar__fill cmp-bar__fill--f", ("width:" + (intake.fatPct > 100 ? 100 : intake.fatPct) + "%"), [])]),h.el("text", {}, "t-xs t-muted", undefined, [h.text(((intake.fatPct) + "%"))])])])]) : null),((target) ? h.el("view", {}, "card--flat card mt-3", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("今日推荐摄入")]),h.el("text", {}, "t-sm t-bold t-mint", undefined, [h.text(((target.targetCalories) + " kcal"))])]),h.el("view", {}, "row-between mt-2", undefined, [h.el("text", {}, "t-sm t-sub", undefined, [h.text("蛋白 / 碳水 / 脂肪")]),h.el("text", {}, "t-sm t-bold", undefined, [h.text(((target.macros.protein) + " / " + (target.macros.carb) + " / " + (target.macros.fat) + " g"))])])]) : null),h.text("\n")]),h.text("\n")];
  }
});
__registerPage("pages/checkin/checkin", function(__req){
const store = __req("utils/store");
const nutrition = __req("utils/nutrition");
const rs = __req("utils/recipeService");

const MEALS = [
  { key: 'breakfast', label: '早餐', icon: '🌅' },
  { key: 'lunch', label: '午餐', icon: '☀️' },
  { key: 'dinner', label: '晚餐', icon: '🌙' },
  { key: 'snack', label: '加餐', icon: '🍎' }
];

Page({
  data: {
    today: '',
    meals: [],
    doneCount: 0,
    note: '',
    streak: 0,
    weekDots: [],
    target: null,
    intake: null
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const today = store.dateKey();
    const checkin = store.getCheckin(today) || { mealsDone: {}, note: '' };
    const mealsDone = checkin.mealsDone || {};
    const meals = MEALS.map(m => Object.assign({}, m, { done: !!mealsDone[m.key] }));
    const doneCount = meals.filter(m => m.done).length;

    const hasProfile = store.hasProfile();
    const target = hasProfile ? nutrition.calcNutrition(store.getProfile()) : null;

    this.setData({
      today,
      meals,
      doneCount,
      note: checkin.note || '',
      streak: this.calcStreak(),
      weekDots: this.calcWeek(),
      target,
      intake: this.calcIntake(mealsDone, target)
    });
  },

  /**
   * 计算今日「已打卡餐次」对应的推荐营养摄入
   * 优先用当前目标的场景方案；未录入资料时返回 null
   */
  calcIntake(mealsDone, target) {
    if (!target) return null;
    const profile = store.getProfile();
    const scene = rs.GOAL_SCENE[profile.goal] || 'gentle';
    const plan = rs.generatePlan(scene, { seed: 1 });
    const total = { kcal: 0, protein: 0, carb: 0, fat: 0 };
    plan.meals.forEach(m => {
      if (!mealsDone[m.key]) return;
      const n = rs.calcRecipeNutrition(m.recipe);
      total.kcal += n.kcal; total.protein += n.protein;
      total.carb += n.carb; total.fat += n.fat;
    });
    total.kcal = Math.round(total.kcal);
    total.protein = +total.protein.toFixed(1);
    total.carb = +total.carb.toFixed(1);
    total.fat = +total.fat.toFixed(1);

    const pct = (cur, goal) => (goal > 0 ? Math.min(200, Math.round((cur / goal) * 100)) : 0);
    return {
      kcal: total.kcal, protein: total.protein, carb: total.carb, fat: total.fat,
      kcalPct: pct(total.kcal, target.targetCalories),
      proteinPct: pct(total.protein, target.macros.protein),
      carbPct: pct(total.carb, target.macros.carb),
      fatPct: pct(total.fat, target.macros.fat)
    };
  },

  toggleMeal(e) {
    const key = e.currentTarget.dataset.key;
    const checkin = store.getCheckin() || { mealsDone: {}, note: '' };
    const mealsDone = Object.assign({}, checkin.mealsDone || {});
    mealsDone[key] = !mealsDone[key];
    store.upsertCheckin(null, { mealsDone, note: this.data.note });
    this.refresh();
    if (mealsDone[key]) wx.vibrateShort({ type: 'light' });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  saveNote() {
    store.upsertCheckin(null, { note: this.data.note });
    wx.showToast({ title: '已保存备注', icon: 'none' });
  },

  /** 连续打卡天数 */
  calcStreak() {
    const all = store.getCheckins();
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = store.dateKey(d);
      const rec = all[key];
      const has = rec && rec.mealsDone && Object.keys(rec.mealsDone).some(k => rec.mealsDone[k]);
      if (has) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        // 今天未打卡不影响历史连续（从昨天继续算）
        if (i === 0) { d.setDate(d.getDate() - 1); continue; }
        break;
      }
    }
    return streak;
  },

  /** 最近 7 天打卡情况 */
  calcWeek() {
    const all = store.getCheckins();
    const days = [];
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = store.dateKey(d);
      const rec = all[key];
      const n = rec && rec.mealsDone ? Object.keys(rec.mealsDone).filter(k => rec.mealsDone[k]).length : 0;
      days.push({
        key,
        label: weekNames[d.getDay()],
        day: d.getDate(),
        count: n,
        isToday: i === 0,
        level: n === 0 ? 0 : (n <= 1 ? 1 : (n <= 3 ? 2 : 3))
      });
    }
    return days;
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  }
});

});
/* ===== page: pages/stats/stats ===== */
__registerPageTemplate("pages/stats/stats", function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return [h.el("view", {}, "page-wrap", undefined, [h.el("view", {}, "grid", undefined, [h.el("view", {}, "stat card col center", undefined, [h.el("text", {}, "stat__num t-xl t-bold t-mint", undefined, [h.text((totalDays))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("累计打卡天数")])]),h.el("view", {}, "stat card col center", undefined, [h.el("text", {}, "stat__num t-xl t-bold t-mint", undefined, [h.text((streak))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("连续打卡")])]),h.el("view", {}, "stat card col center", undefined, [h.el("text", {}, "stat__num t-xl t-bold t-mint", undefined, [h.text((totalMeals))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("累计记录餐次")])]),h.el("view", {"onclick": h.ev("goFavorites")}, "stat card col center", undefined, [h.el("text", {}, "stat__num t-xl t-bold t-mint", undefined, [h.text((favCount))]),h.el("text", {}, "t-xs t-muted", undefined, [h.text("收藏食谱 →")])])]),h.el("view", {}, "card mt-3", undefined, [h.el("view", {}, "row-between", undefined, [h.el("text", {}, "t-md t-bold", undefined, [h.text("饮食计划完成率")]),h.el("text", {}, "t-md t-bold t-mint", undefined, [h.text(((completionRate) + "%"))])]),h.el("view", {}, "rate-bar mt-3", undefined, [h.el("view", {}, "rate-bar__fill", ("width:" + (completionRate) + "%"), [])]),h.el("text", {}, "t-xs t-muted mt-2", undefined, [h.text("按每日 4 餐计算，坚持得越多越接近 100%")])]),h.el("view", {}, "section-head", undefined, [h.el("text", {}, "section-title", undefined, [h.text("近 14 天打卡")])]),h.el("view", {}, "card", undefined, [h.el("view", {}, "chart row-between", undefined, [h.each(last14, function(item, index) { return h.el("view", {}, "bar col center", undefined, [h.el("view", {}, "bar__track", undefined, [h.el("view", {}, "bar__fill", ("height:" + (item.pct) + "%"), [])]),h.el("text", {}, "t-xs t-muted bar__label", undefined, [h.text((item.day))])]); })])]),((totalDays === 0) ? h.el("view", {}, "empty", undefined, [h.el("view", {}, "empty__icon", undefined, [h.text("📊")]),h.el("text", {}, "t-sm", undefined, [h.text("还没有打卡记录")]),h.el("text", {}, "t-xs t-muted mt-2", undefined, [h.text("去「打卡」页记录今天的饮食吧")])]) : null),h.text("\n")]),h.text("\n")];
  }
});
__registerPage("pages/stats/stats", function(__req){
const store = __req("utils/store");

Page({
  data: {
    totalDays: 0,
    totalMeals: 0,
    streak: 0,
    favCount: 0,
    last14: [],
    maxCount: 4,
    completionRate: 0
  },

  onShow() {
    this.build();
  },

  build() {
    const all = store.getCheckins();
    const keys = Object.keys(all);

    let totalMeals = 0;
    keys.forEach(k => {
      const rec = all[k];
      if (rec && rec.mealsDone) {
        totalMeals += Object.keys(rec.mealsDone).filter(x => rec.mealsDone[x]).length;
      }
    });
    const totalDays = keys.filter(k => {
      const rec = all[k];
      return rec && rec.mealsDone && Object.keys(rec.mealsDone).some(x => rec.mealsDone[x]);
    }).length;

    // 最近 14 天
    const last14 = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = store.dateKey(d);
      const rec = all[key];
      const count = rec && rec.mealsDone ? Object.keys(rec.mealsDone).filter(x => rec.mealsDone[x]).length : 0;
      last14.push({
        key,
        day: d.getDate(),
        count,
        pct: Math.round((count / 4) * 100)
      });
    }

    // 连续打卡
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = store.dateKey(d);
      const rec = all[key];
      const has = rec && rec.mealsDone && Object.keys(rec.mealsDone).some(x => rec.mealsDone[x]);
      if (has) { streak++; d.setDate(d.getDate() - 1); }
      else { if (i === 0) { d.setDate(d.getDate() - 1); continue; } break; }
    }

    this.setData({
      totalDays,
      totalMeals,
      streak,
      favCount: store.getFavorites().length,
      last14,
      completionRate: totalDays ? Math.round((totalMeals / (totalDays * 4)) * 100) : 0
    });
  },

  goFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  }
});

});

// 组装 __PAGES__ 供 spa.js 使用
var __PAGES__ = {};
Object.keys(PAGE_DEFS).forEach(function(p){ __PAGES__[p] = { def: PAGE_DEFS[p], template: PAGE_TEMPLATES[p] }; });
window.__PAGES__ = __PAGES__;
window.__TABBAR__ = [{"pagePath":"pages/index/index","text":"首页"},{"pagePath":"pages/browse/browse","text":"食谱库"},{"pagePath":"pages/checkin/checkin","text":"打卡"},{"pagePath":"pages/profile/profile","text":"我的"}];
})();