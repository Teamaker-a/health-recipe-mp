const rs = require('../../utils/recipeService.js');

Page({
  data: {
    categories: rs.CATEGORIES,
    mealFilters: rs.MEAL_FILTERS,
    activeCat: 'all',
    activeMeal: 'all',
    keyword: '',
    list: []
  },

  onLoad() {
    this.applyFilter();
  },

  pickCat(e) {
    this.setData({ activeCat: e.currentTarget.dataset.key });
    this.applyFilter();
  },

  pickMeal(e) {
    this.setData({ activeMeal: e.currentTarget.dataset.key });
    this.applyFilter();
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  applyFilter() {
    const list = rs.filter({
      category: this.data.activeCat,
      meal: this.data.activeMeal,
      keyword: this.data.keyword
    });
    this.setData({ list });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?id=' + e.detail.id });
  }
});
