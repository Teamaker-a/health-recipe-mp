/**
 * wx-shim.js - 浏览器端 wx API 垫片
 *
 * 目标：让小程序原生的 utils/ 与 pages/ 逻辑在浏览器中零改动运行。
 * 只实现本项目实际用到的 wx API：
 *   storage  : getStorageSync / setStorageSync / removeStorageSync
 *   navigate : navigateTo / redirectTo / switchTab / navigateBack / setNavigationBarTitle
 *   ui       : showToast / vibrateShort
 */
(function (global) {
  'use strict';

  var PREFIX = 'wx:';

  /* ---------------- Storage 垫片（基于 localStorage） ---------------- */

  function safeParse(raw) {
    if (raw === null || raw === undefined) return undefined;
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }

  function getStorageSync(key) {
    try {
      var raw = global.localStorage.getItem(PREFIX + key);
      if (raw === null) return '';           // 小程序未命中时返回空字符串
      var v = safeParse(raw);
      return v === undefined ? '' : v;
    } catch (e) {
      return '';
    }
  }

  function setStorageSync(key, value) {
    try {
      global.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeStorageSync(key) {
    try { global.localStorage.removeItem(PREFIX + key); } catch (e) { /* noop */ }
  }

  /* ---------------- 导航垫片 ---------------- */

  var router = null; // 由 spa.js 注入 { navigateTo, redirectTo, switchTab, navigateBack, setTitle }

  function noop() {}

  var wx = {
    // storage
    getStorageSync: getStorageSync,
    setStorageSync: setStorageSync,
    removeStorageSync: removeStorageSync,
    getStorageInfoSync: function () {
      var keys = [];
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) keys.push(k.slice(PREFIX.length));
      }
      return { keys: keys, currentSize: 0, limitSize: 10240 };
    },

    // 导航（转发到 router）
    navigateTo: function (o) { router && router.navigateTo(o && o.url); },
    redirectTo: function (o) { router && router.redirectTo(o && o.url); },
    switchTab: function (o) { router && router.switchTab(o && o.url); },
    navigateBack: function (o) {
      var done = router && router.navigateBack();
      if (!done && o && typeof o.fail === 'function') o.fail();
    },
    reLaunch: function (o) { router && router.redirectTo(o && o.url); },
    setNavigationBarTitle: function (o) { router && router.setTitle(o && o.title); },

    // UI
    showToast: function (o) { showToast(o || {}); },
    hideToast: noop,
    showLoading: function (o) { showLoading(o || {}); },
    hideLoading: noop,
    showModal: function (o) { return showModal(o || {}); },
    vibrateShort: function () { /* 浏览器无对应能力，静默 */ },
    vibrateLong: noop,

    // 系统信息（部分页面可能读取）
    getSystemInfoSync: function () {
      return {
        windowWidth: global.innerWidth,
        windowHeight: global.innerHeight,
        pixelRatio: global.devicePixelRatio || 1,
        platform: 'devtools'
      };
    },

    // 路由栈（兼容 setData 之外偶发使用）
    canIUse: function () { return false; },
    nextTick: function (fn) { setTimeout(fn, 0); }
  };

  /* ---------------- 轻量 UI 实现 ---------------- */

  function ensureToastHost() {
    var el = document.getElementById('wx-toast-host');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wx-toast-host';
      document.body.appendChild(el);
    }
    return el;
  }

  function showToast(opt) {
    var host = ensureToastHost();
    var icon = opt.icon || '';
    var symbol = icon === 'success' ? '✓'
      : icon === 'error' ? '✕'
        : icon === 'loading' ? '' : '';
    host.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'wx-toast';
    var inner = '';
    if (symbol) inner += '<div class="wx-toast__icon">' + symbol + '</div>';
    inner += '<div class="wx-toast__text"></div>';
    box.innerHTML = inner;
    box.querySelector('.wx-toast__text').textContent = opt.title || '';
    host.appendChild(box);
    requestAnimationFrame(function () { box.classList.add('wx-toast--in'); });
    clearTimeout(host._timer);
    host._timer = setTimeout(function () {
      box.classList.remove('wx-toast--in');
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 220);
    }, opt.duration || 1500);
  }

  function showLoading(opt) {
    showToast({ title: opt.title || '加载中…', duration: 100000 });
  }

  function showModal(opt) {
    return new Promise(function (resolve) {
      var ok = global.confirm(opt.content || opt.title || '');
      resolve({ confirm: ok, cancel: !ok });
    });
  }

  global.wx = wx;
  global.__setRouter = function (r) { router = r; };
})(window);
