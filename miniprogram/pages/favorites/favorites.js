const store = require('../../utils/store.js');
const rs = require('../../utils/recipeService.js');

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
