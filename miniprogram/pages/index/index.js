const store = require('../../utils/store.js');
const nutrition = require('../../utils/nutrition.js');
const rs = require('../../utils/recipeService.js');

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
