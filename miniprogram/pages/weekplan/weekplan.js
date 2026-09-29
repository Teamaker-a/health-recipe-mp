const store = require('../../utils/store.js');
const nutrition = require('../../utils/nutrition.js');
const rs = require('../../utils/recipeService.js');

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
