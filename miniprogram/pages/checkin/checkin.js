const store = require('../../utils/store.js');
const nutrition = require('../../utils/nutrition.js');
const rs = require('../../utils/recipeService.js');

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
