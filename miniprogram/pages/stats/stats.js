const store = require('../../utils/store.js');

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
