const store = require('../../utils/store.js');
const rs = require('../../utils/recipeService.js');

Page({
  data: {
    recipe: null,
    original: null,
    isFav: false,
    // 替换面板
    subVisible: false,
    subIndex: -1,
    subOriginName: '',
    subOriginAmount: 0,
    substitutes: [],
    changed: false
  },

  onLoad(options) {
    const id = options.id;
    const base = rs.getById(id);
    if (!base) {
      wx.showToast({ title: '食谱不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.baseId = id;
    this.setData({
      recipe: base,
      original: JSON.parse(JSON.stringify(base)),
      isFav: store.isFavorite(id)
    });
    wx.setNavigationBarTitle({ title: base.name });
  },

  toggleFav() {
    const fav = store.toggleFavorite(this.data.recipe.id);
    this.setData({ isFav: fav });
    wx.showToast({ title: fav ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  /* ---------- 食材替换 ---------- */
  openSub(e) {
    const index = Number(e.currentTarget.dataset.index);
    const ing = this.data.recipe.ingredients[index];
    const scene = this.data.recipe.scene && this.data.recipe.scene[0];
    const prefer = scene === 'muscle' ? 'muscle' : (scene === 'fatloss' ? 'fatloss' : '');
    const subs = rs.findSubstitutes(ing.name, ing.amount, { scenePrefer: prefer });
    if (!subs.length) {
      wx.showToast({ title: '暂无可替换食材', icon: 'none' });
      return;
    }
    const sub = this.data.recipe.nutrition;
    this.setData({
      subVisible: true,
      subIndex: index,
      subOriginName: ing.name,
      subOriginAmount: ing.amount,
      subOriginKcal: require('../../data/foods.js').nutritionOf(ing.name, ing.amount).kcal,
      substitutes: subs,
      subCurrentNutrition: sub
    });
  },

  closeSub() {
    this.setData({ subVisible: false });
  },

  applySub(e) {
    const cand = this.data.substitutes[Number(e.currentTarget.dataset.idx)];
    const recipe = rs.applySubstitution(this.data.recipe, this.data.subIndex, cand.name, cand.amount);
    this.setData({
      recipe,
      subVisible: false,
      changed: true
    });
    wx.showToast({ title: '已替换 · 营养已重算', icon: 'none' });
  },

  resetRecipe() {
    this.setData({
      recipe: JSON.parse(JSON.stringify(this.data.original)),
      changed: false
    });
    wx.showToast({ title: '已恢复原始食谱', icon: 'none' });
  },

  noop() {}
});
