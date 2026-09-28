/**
 * cal-ring - 热量环形进度（Canvas 2D 实现，兼容性好）
 */
Component({
  properties: {
    value: { type: Number, value: 0 },       // 当前值
    max: { type: Number, value: 2000 },      // 目标值
    size: { type: Number, value: 380 },      // 尺寸 rpx
    color: { type: String, value: '#4FB6A0' },
    trackColor: { type: String, value: '#EAF1EE' },
    thickness: { type: Number, value: 16 }   // 线宽（相对尺寸比例 * size）
  },
  data: {
    displayPct: 0
  },
  observers: {
    'value, max': function (v, m) {
      const total = m || 1;
      const pct = Math.min(1.3, Math.max(0, v / total));
      this.setData({ displayPct: Math.round((v / total) * 100) });
      this._ratio = pct;
      this.draw();
    }
  },
  lifetimes: {
    ready() {
      this.initCanvas();
    }
  },
  methods: {
    initCanvas() {
      const q = wx.createSelectorQuery().in(this);
      q.select('#ring').fields({ node: true, size: true }).exec(res => {
        if (!res || !res[0]) return;
        const node = res[0].node;
        const ctx = node.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        node.width = res[0].width * dpr;
        node.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        this._node = node;
        this._ctx = ctx;
        this._w = res[0].width;
        this._h = res[0].height;
        this.draw();
      });
    },
    draw() {
      const ctx = this._ctx;
      if (!ctx) return;
      const w = this._w;
      const h = this._h;
      const cx = w / 2;
      const cy = h / 2;
      const lw = Math.max(6, (this.data.thickness / 380) * w);
      const r = Math.min(w, h) / 2 - lw / 2 - 2;
      const ratio = this._ratio == null ? 0 : this._ratio;

      ctx.clearRect(0, 0, w, h);

      // 轨道
      ctx.beginPath();
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.data.trackColor;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // 进度
      if (ratio > 0) {
        const start = -Math.PI / 2;
        const end = start + Math.PI * 2 * Math.min(ratio, 1);
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#6FCBB6');
        grad.addColorStop(1, this.data.color);
        ctx.beginPath();
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.strokeStyle = grad;
        ctx.arc(cx, cy, r, start, end);
        ctx.stroke();
      }
    }
  }
});
