const store = require('../../utils/store.js');
const nutrition = require('../../utils/nutrition.js');

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
