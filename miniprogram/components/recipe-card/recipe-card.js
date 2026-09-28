Component({
  properties: {
    recipe: { type: Object, value: {} },
    showMeal: { type: Boolean, value: true }
  },
  data: {
    emoji: '🥗'
  },
  observers: {
    recipe(r) {
      if (r && r.meals) {
        const map = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };
        this.setData({ emoji: map[r.meals] || '🥗' });
      }
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.recipe.id });
    }
  }
});
