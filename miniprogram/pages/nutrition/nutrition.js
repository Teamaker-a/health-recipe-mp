const store = require('../../utils/store.js');
const nutrition = require('../../utils/nutrition.js');

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
    const scene = require('../../utils/recipeService.js').GOAL_SCENE[this.data.profile.goal] || 'gentle';
    wx.navigateTo({ url: '/pages/generate/generate?scene=' + scene });
  }
});
