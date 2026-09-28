Component({
  properties: {
    protein: { type: Number, value: 0 },
    carb: { type: Number, value: 0 },
    fat: { type: Number, value: 0 },
    proteinCal: { type: Number, value: 0 },
    carbCal: { type: Number, value: 0 },
    fatCal: { type: Number, value: 0 },
    compact: { type: Boolean, value: false }
  },
  data: {
    pctP: 0, pctC: 0, pctF: 0
  },
  observers: {
    'proteinCal, carbCal, fatCal': function (p, c, f) {
      const total = (p + c + f) || 1;
      this.setData({
        pctP: Math.round((p / total) * 100),
        pctC: Math.round((c / total) * 100),
        pctF: Math.round((f / total) * 100)
      });
    }
  }
});
