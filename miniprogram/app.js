const store = require('./utils/store.js');

App({
  globalData: {
    version: '1.0.0'
  },

  onLaunch() {
    // 初始化本地存储结构（首次启动写入默认值）
    store.init();
  }
});
