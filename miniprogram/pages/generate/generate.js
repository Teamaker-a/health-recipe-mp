const store = require('../../utils/store.js');
const nutrition = require('../../utils/nutrition.js');
const rs = require('../../utils/recipeService.js');

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
