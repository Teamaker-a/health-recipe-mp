/**
 * smoke-test.js - 无头环境下模拟 wx API，跑通所有页面/组件逻辑
 * 用途：在无微信开发者工具环境时，提前发现运行时错误。
 */
const path = require('path');
const Module = require('module');

/* ---------- 内存版 storage ---------- */
const mem = {};
global.wx = {
  getStorageSync: k => (k in mem ? mem[k] : ''),
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: k => { delete mem[k]; },
  showToast: () => {},
  vibrateShort: () => {},
  navigateTo: () => {},
  redirectTo: () => {},
  switchTab: () => {},
  navigateBack: () => {},
  setNavigationBarTitle: () => {},
  createSelectorQuery: () => ({
    in: () => ({ select: () => ({ fields: () => ({ exec: cb => cb([null]) }) }) })
  }),
  getSystemInfoSync: () => ({ pixelRatio: 2 })
};

// 让页面内的 setTimeout（模拟异步）在测试中同步执行，便于断言
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn) => { try { fn(); } catch (e) { /* noop */ } return 0; };

/* ---------- 捕获 Page / Component 定义 ---------- */
const pages = {};
const comps = {};
let captured = {};
global.Page = cfg => { captured.page = cfg; };
global.Component = cfg => { captured.component = cfg; };

const ROOT = path.join(__dirname, '..', 'miniprogram');

function loadModule(rel) {
  const p = path.join(ROOT, rel);
  delete require.cache[require.resolve(p)];
  return require(p);
}

/* ---------- 断言工具 ---------- */
let passed = 0, failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
}

/* ---------- 1. 工具层 ---------- */
console.log('\n[1] 工具层');
const store = loadModule('utils/store.js');
const nutrition = loadModule('utils/nutrition.js');
const rs = loadModule('utils/recipeService.js');
const foods = loadModule('data/foods.js');

check('store.init + hasProfile', () => {
  store.init();
  if (store.hasProfile()) throw new Error('初始不应有资料');
  store.setProfile({ gender: 'male', height: 178, weight: 72, age: 28, weeklyExercise: 4, goal: 'muscle' });
  if (!store.hasProfile()) throw new Error('保存后应有资料');
});

check('calcNutrition 数值合理', () => {
  const n = nutrition.calcNutrition(store.getProfile());
  if (n.bmr < 1000 || n.bmr > 2500) throw new Error('BMR 异常: ' + n.bmr);
  if (n.targetCalories < n.bmr) throw new Error('摄入不应低于 BMR');
  if (n.macros.protein <= 0 || n.macros.carb < 0 || n.macros.fat <= 0) throw new Error('营养素异常');
});

check('收藏 toggle', () => {
  const a = store.toggleFavorite('l01');
  if (!a || !store.isFavorite('l01')) throw new Error('收藏失败');
  store.toggleFavorite('l01');
  if (store.isFavorite('l01')) throw new Error('取消收藏失败');
});

check('打卡 upsert + streak', () => {
  store.upsertCheckin(null, { mealsDone: { breakfast: true, lunch: true } });
  const c = store.getCheckin();
  if (!c || !c.mealsDone.breakfast) throw new Error('打卡失败');
});

check('所有食谱食材均可解析', () => {
  let bad = [];
  rs.getAll().forEach(r => r.ingredients.forEach(i => {
    if (!foods.getFood(i.name)) bad.push(r.id + ':' + i.name);
  }));
  if (bad.length) throw new Error('未知食材 ' + bad.join(','));
});

check('食谱营养 > 0', () => {
  rs.getAll().forEach(r => {
    if (!(r.nutrition.kcal > 0)) throw new Error(r.id + ' 热量为0');
    if (!(r.nutrition.protein >= 0)) throw new Error(r.id + ' 蛋白异常');
  });
});

check('三场景均能生成完整方案', () => {
  ['muscle', 'fatloss', 'gentle'].forEach(s => {
    const plan = rs.generatePlan(s, { seed: 1 });
    if (plan.meals.length !== 4) throw new Error(s + ' 未生成4餐');
    plan.meals.forEach(m => {
      if (!m.recipe) throw new Error(s + ' 某餐无食谱');
      if (!(rs.calcRecipeNutrition(m.recipe).kcal > 0)) throw new Error(s + ' 营养为0');
    });
    const sum = rs.planSummary(plan);
    if (!(sum.kcal > 500)) throw new Error(s + ' 总热量异常');
  });
});

check('食材替换热量基本持平', () => {
  const subs = rs.findSubstitutes('鸡胸肉', 150, { scenePrefer: 'muscle' });
  if (subs.length < 3) throw new Error('替换候选太少');
  subs.forEach(s => {
    if (s.kcalDiffPct > 12) throw new Error(s.name + ' 热量偏差过大 ' + s.kcalDiffPct + '%');
    if (!(s.amount > 0)) throw new Error(s.name + ' 用量异常');
  });
});

check('applySubstitution 重算营养', () => {
  const r = rs.getById('l01');
  const subs = rs.findSubstitutes(r.ingredients[0].name, r.ingredients[0].amount, {});
  const next = rs.applySubstitution(r, 0, subs[0].name, subs[0].amount);
  if (next.ingredients[0].name !== subs[0].name) throw new Error('替换未生效');
  if (!(next.nutrition.kcal > 0)) throw new Error('未重算');
  if (r.ingredients[0].name === subs[0].name) throw new Error('原食谱被污染');
});

check('分类筛选', () => {
  if (!rs.filter({ category: 'all' }).length) throw new Error('全部为空');
  if (!rs.filter({ category: 'lowfat' }).length) throw new Error('低脂为空');
  if (!rs.filter({ meal: 'breakfast' }).length) throw new Error('早餐为空');
  if (!rs.filter({ keyword: '鸡' }).length) throw new Error('关键词搜索失败');
});

check('每条食谱都有图片字段', () => {
  rs.getAll().forEach(r => {
    if (!r.image) throw new Error(r.id + ' 缺少 image');
    if (r.image.indexOf('/images/recipes/') !== 0) throw new Error(r.id + ' 图片路径不规范');
  });
});

check('生成一周计划（7天×4餐）', () => {
  ['muscle', 'fatloss', 'gentle'].forEach(s => {
    const wk = rs.generateWeekPlan(s);
    if (wk.days.length !== 7) throw new Error(s + ' 天数错误');
    wk.days.forEach(d => {
      if (d.meals.length !== 4) throw new Error(s + ' ' + d.weekday + ' 餐数错误');
      d.meals.forEach(m => {
        if (!m.recipe) throw new Error('某餐无食谱');
        if (!(rs.calcRecipeNutrition(m.recipe).kcal > 0)) throw new Error('营养为0');
      });
    });
    const avg = rs.weekPlanSummary(wk);
    if (!(avg.kcal > 800)) throw new Error(s + ' 日均为0');
  });
});

check('一周内菜色有变化（非每日完全相同）', () => {
  const wk = rs.generateWeekPlan('fatloss');
  const day0 = wk.days[0].meals.map(m => m.recipe.id).join(',');
  const day1 = wk.days[1].meals.map(m => m.recipe.id).join(',');
  if (day0 === day1) throw new Error('相邻两天菜色完全相同');
});

/* ---------- 2. 页面逻辑 ---------- */
console.log('\n[2] 页面逻辑（模拟 onLoad/onShow）');

function fakeSetData(obj) {
  Object.assign(this.data, obj);
}
function makePage(rel, opts) {
  captured = {};
  const modPath = path.join(ROOT, rel);
  delete require.cache[require.resolve(modPath)];
  require(modPath);
  const cfg = captured.page;
  if (!cfg) throw new Error(rel + ' 未定义 Page');
  const inst = Object.assign({}, cfg, {
    data: Object.assign({}, cfg.data),
    setData: fakeSetData,
    baseId: null
  });
  if (opts) Object.assign(inst, opts);
  if (cfg.onLoad) cfg.onLoad.call(inst, (opts && opts.__query) || {});
  if (cfg.onShow) cfg.onShow.call(inst);
  return inst;
}

check('index 页', () => {
  const p = makePage('pages/index/index.js');
  if (p.data.scenes.length !== 3) throw new Error('场景数错误');
  if (!p.data.recommend.length) throw new Error('无推荐');
});

check('profile 页 - 输入与预览', () => {
  const p = makePage('pages/profile/profile.js');
  p.onInput({ currentTarget: { dataset: { field: 'height' } }, detail: { value: '170' } });
  p.onInput({ currentTarget: { dataset: { field: 'weight' } }, detail: { value: '65' } });
  p.onInput({ currentTarget: { dataset: { field: 'age' } }, detail: { value: '26' } });
  if (!p.data.canSave) throw new Error('应可保存');
  if (!p.data.preview) throw new Error('无预览');
  p.pickGoal({ currentTarget: { dataset: { value: 'fatloss' } } });
  if (p.data.profile.goal !== 'fatloss') throw new Error('目标切换失败');
  p.stepExercise({ currentTarget: { dataset: { delta: '1' } } });
  p.save();
});

check('nutrition 页', () => {
  const p = makePage('pages/nutrition/nutrition.js');
  if (!p.data.nut) throw new Error('无营养数据');
  if (p.data.meals.length !== 4) throw new Error('餐次分配错误');
});

check('generate 页 - 三场景切换', () => {
  const p = makePage('pages/generate/generate.js', { __query: { scene: 'muscle' } });
  if (p.data.scene !== 'muscle') throw new Error('场景未设置');
  if (!p.data.plan) throw new Error('无方案');
  if (p.data.plan.meals.length !== 4) throw new Error('方案餐数错误');
  p.switchScene({ currentTarget: { dataset: { scene: 'fatloss' } } });
  if (p.data.plan.scene !== 'fatloss') throw new Error('切换场景失败');
  p.regenerate();
  p.saveAll();
});

check('browse 页 - 筛选', () => {
  const p = makePage('pages/browse/browse.js');
  if (!p.data.list.length) throw new Error('列表为空');
  p.pickCat({ currentTarget: { dataset: { key: 'lowfat' } } });
  if (!p.data.list.length) throw new Error('低脂筛选为空');
  p.pickCat({ currentTarget: { dataset: { key: 'all' } } });
  p.pickMeal({ currentTarget: { dataset: { key: 'dinner' } } });
  p.onSearch({ detail: { value: '鸡' } });
  p.clearSearch();
});

check('recipe-detail 页 - 替换流程', () => {
  const p = makePage('pages/recipe-detail/recipe-detail.js', { __query: { id: 'l01' } });
  if (!p.data.recipe) throw new Error('无食谱');
  if (!p.data.recipe.image) throw new Error('详情页无图片');
  p.toggleFav();
  p.openSub({ currentTarget: { dataset: { index: 0 } } });
  if (!p.data.subVisible) throw new Error('替换面板未打开');
  if (!p.data.substitutes.length) throw new Error('无替换候选');
  p.applySub({ currentTarget: { dataset: { idx: 0 } } });
  if (!p.data.changed) throw new Error('替换未标记');
  p.resetRecipe();
  if (p.data.changed) throw new Error('重置失败');
});

check('checkin 页', () => {
  const p = makePage('pages/checkin/checkin.js');
  if (p.data.meals.length !== 4) throw new Error('餐次错误');
  p.toggleMeal({ currentTarget: { dataset: { key: 'breakfast' } } });
  p.onNote({ detail: { value: '今天状态不错' } });
  p.saveNote();
  if (p.data.weekDots.length !== 7) throw new Error('周视图错误');
  if (!p.data.intake) throw new Error('缺少摄入对比数据');
  if (!(p.data.intake.kcal > 0)) throw new Error('打卡后摄入应为正');
  if (p.data.intake.kcalPct <= 0) throw new Error('热量完成率异常');
});

check('weekplan 页', () => {
  const p = makePage('pages/weekplan/weekplan.js', { __query: { scene: 'muscle' } });
  if (p.data.days.length !== 7) throw new Error('周计划天数错误');
  if (!p.data.avg) throw new Error('缺少日均');
  p.switchScene({ currentTarget: { dataset: { scene: 'gentle' } } });
  if (p.data.scene !== 'gentle') throw new Error('场景切换失败');
  p.pickDay({ currentTarget: { dataset: { idx: '3' } } });
  if (p.data.activeDay !== 3) throw new Error('选日失败');
  p.data.days.forEach(d => {
    if (!(d.total.kcal > 0)) throw new Error('某天营养为0');
  });
});

check('stats 页', () => {
  const p = makePage('pages/stats/stats.js');
  if (p.data.last14.length !== 14) throw new Error('14天数据错误');
  if (typeof p.data.completionRate !== 'number') throw new Error('完成率异常');
});

check('favorites 页', () => {
  store.toggleFavorite('b01');
  const p = makePage('pages/favorites/favorites.js');
  if (!p.data.list.some(x => x.id === 'b01')) {
    throw new Error('收藏未展示，当前收藏=' + JSON.stringify(store.getFavorites()) + ' 渲染=' + p.data.list.length);
  }
});

/* ---------- 3. 组件 ---------- */
console.log('\n[3] 组件逻辑');
function makeComp(rel) {
  captured = {};
  const modPath = path.join(ROOT, rel);
  delete require.cache[require.resolve(modPath)];
  require(modPath);
  const cfg = captured.component;
  if (!cfg) throw new Error(rel + ' 未定义 Component');
  const inst = Object.assign({}, cfg.methods || {}, {
    data: Object.assign({}, cfg.data),
    properties: cfg.properties,
    setData: function (o) { Object.assign(this.data, o); },
    triggerEvent: () => {}
  });
  return { cfg, inst };
}

check('macro-bar 供能比计算', () => {
  const { cfg, inst } = makeComp('components/macro-bar/macro-bar.js');
  const obs = cfg.observers['proteinCal, carbCal, fatCal'];
  obs.call(inst, 400, 800, 300);
  const total = inst.data.pctP + inst.data.pctC + inst.data.pctF;
  if (Math.abs(total - 100) > 2) throw new Error('供能比不合计 100: ' + total);
});

check('recipe-card 表情映射', () => {
  const { cfg, inst } = makeComp('components/recipe-card/recipe-card.js');
  cfg.observers.recipe.call(inst, { meals: 'dinner' });
  if (inst.data.emoji !== '🌙') throw new Error('表情映射错误');
});

check('cal-ring 属性接收', () => {
  const { cfg, inst } = makeComp('components/cal-ring/cal-ring.js');
  if (cfg.properties.value.type !== Number) throw new Error('value 属性类型错误');
  if (!cfg.methods.draw) throw new Error('缺少 draw 方法');
});

/* ---------- 结果 ---------- */
console.log('\n================ 结果 ================');
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) process.exit(1);
console.log('✅ 全部逻辑测试通过');
