/**
 * spa.js - 单页应用路由与启动
 *
 * 用 hash 路由模拟小程序的页面栈：
 *   #/pages/index/index          → 首页
 *   #/pages/recipe-detail/recipe-detail?id=b01
 *
 * tabBar 页面（index / browse / checkin / profile）用 switchTab 切换，
 * 其余页面 navigateTo 入栈，navigateBack 出栈。
 */
(function (global) {
  'use strict';

  var PAGES = global.__PAGES__ || {};       // { 'pages/index/index': { def, template } }
  var TABBAR = global.__TABBAR__ || [];     // [{ pagePath, text, icon? }]

  var stack = [];    // 页面实例栈
  var current = null;

  var rootEl, viewEl, tabEl;

  function parseHash() {
    var hash = location.hash.replace(/^#/, '') || '/pages/index/index';
    var qIdx = hash.indexOf('?');
    var path = qIdx > -1 ? hash.slice(0, qIdx) : hash;
    var query = {};
    if (qIdx > -1) {
      hash.slice(qIdx + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('=');
        query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    if (path.charAt(0) === '/') path = path.slice(1);
    return { path: path, query: query };
  }

  function isTab(path) {
    return TABBAR.some(function (t) { return t.pagePath === path; });
  }

  function loadPage(path, query) {
    var entry = PAGES[path];
    if (!entry) {
      viewEl.innerHTML = '<div class="mp-missing">页面不存在：' + path + '</div>';
      return null;
    }
    var inst = global.__MP.makePageInstance(entry.def);
    inst.__template = entry.template;
    inst.__path = path;
    inst.__query = query || {};
    return inst;
  }

  function renderTabBar() {
    if (!tabEl) return;
    tabEl.innerHTML = '';
    TABBAR.forEach(function (t) {
      var b = document.createElement('div');
      b.className = 'mp-tab' + (current && current.__path === t.pagePath ? ' mp-tab--on' : '');
      b.innerHTML = '<span class="mp-tab__text"></span>';
      b.querySelector('.mp-tab__text').textContent = t.text;
      b.addEventListener('click', function () { router.switchTab('/' + t.pagePath); });
      tabEl.appendChild(b);
    });
  }

  function show(inst) {
    current = inst;
    viewEl.innerHTML = '';
    var pageEl = document.createElement('div');
    pageEl.className = 'mp-page';
    viewEl.appendChild(pageEl);
    inst.__root = pageEl;

    document.body.classList.toggle('has-tabbar', isTab(inst.__path));
    renderTabBar();

    // 生命周期先于首次渲染（与小程序一致：onLoad → 首次渲染 → onShow）
    if (typeof inst.onLoad === 'function') inst.onLoad(inst.__query || {});
    global.__MP.renderTree(inst);
    if (typeof inst.onShow === 'function') inst.onShow();
    global.__MP.renderTree(inst);

    viewEl.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  var router = {
    navigateTo: function (url) {
      var p = parseUrl(url);
      var inst = loadPage(p.path, p.query);
      if (!inst) return;
      if (current && typeof current.onHide === 'function') current.onHide();
      stack.push(current);
      location.hash = '#' + url;   // 触发 hashchange → 渲染
    },
    redirectTo: function (url) {
      var p = parseUrl(url);
      var inst = loadPage(p.path, p.query);
      if (!inst) return;
      if (current && typeof current.onUnload === 'function') current.onUnload();
      if (current) stack.pop();
      location.hash = '#' + url;
    },
    switchTab: function (url) {
      var p = parseUrl(url);
      if (current && current.__path === p.path) return;
      stack = [];
      current = null;
      location.hash = '#' + url;
    },
    navigateBack: function () {
      if (!stack.length) return false;
      var prev = stack.pop();
      current = null;
      var url = '/' + prev.__path;
      location.hash = '#' + url;
      return true;
    },
    setTitle: function (title) {
      if (title) document.title = title + ' · 轻食谱';
    }
  };

  function parseUrl(url) {
    url = String(url || '');
    var qIdx = url.indexOf('?');
    var path = qIdx > -1 ? url.slice(0, qIdx) : url;
    var query = {};
    if (qIdx > -1) {
      url.slice(qIdx + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('=');
        query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    if (path.charAt(0) === '/') path = path.slice(1);
    return { path: path, query: query };
  }

  function onHashChange() {
    var h = parseHash();
    if (current && current.__path === h.path && !stack.length) {
      // 同页刷新
      if (typeof current.onShow === 'function') current.onShow();
      global.__MP.renderTree(current);
      return;
    }
    var inst = loadPage(h.path, h.query);
    if (!inst) return;
    if (isTab(h.path)) stack = [];
    show(inst);
  }

  function boot() {
    rootEl = document.getElementById('app');
    viewEl = document.getElementById('mp-view');
    tabEl = document.getElementById('mp-tabbar');

    // 注入 router 到 wx 垫片
    global.__setRouter(router);

    // 生命周期：App.onLaunch
    var appDef = global.__APP_DEF;
    if (appDef && typeof appDef.onLaunch === 'function') {
      appDef.onLaunch.call(appDef);
    }

    if (!location.hash) location.hash = '#/pages/index/index';
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
  }

  global.__SPA__ = { boot: boot, router: router };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
