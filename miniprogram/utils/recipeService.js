/**
 * recipeService.js - 食谱业务逻辑层
 * 负责：营养计算、场景方案生成、食材替换、分类筛选。
 */

const { RECIPES } = require('../data/recipes.js');
const foods = require('../data/foods.js');
const nutrition = require('./nutrition.js');

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
