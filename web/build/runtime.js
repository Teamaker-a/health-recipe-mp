/**
 * runtime.js - 小程序运行时（浏览器实现）
 *
 * 提供：
 *   - 全局 Page / Component / App 构造器
 *   - setData + 差量渲染
 *   - 模板帮助函数 h.el / h.text / h.each / h.ev
 *   - 事件 dataset 解析
 *
 * 模板由 compile-wxml.js 生成，形如：
 *   function __tpl(data, h, page) { return h.el('div', {...}, classExpr, styleExpr, [ ... ]); }
 */
(function (global) {
  'use strict';

  /* ============================================================
   * 通用工具
   * ============================================================ */

  function isObj(v) { return v !== null && typeof v === 'object'; }

  function deepClone(v) {
    if (Array.isArray(v)) return v.map(deepClone);
    if (isObj(v)) {
      var o = {};
      for (var k in v) o[k] = deepClone(v[k]);
      return o;
    }
    return v;
  }

  function setByPath(obj, path, value) {
    var parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      if (cur[p] === undefined || cur[p] === null) cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function datasetKey(attrName) {
    var k = attrName.slice(5); // 去掉 'data-'
    return k.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }

  /* ============================================================
   * VDOM → 真实 DOM
   *
   * 节点描述：
   *   { t:'el', tag, props, class, style, children }
   *   { t:'text', text }
   * ============================================================ */

  var CUSTOM_TAGS = {}; // { 'recipe-card': renderFn }

  function createNode(node) {
    if (node === null || node === undefined || node === false || node === true) {
      return document.createComment('empty');
    }
    if (Array.isArray(node)) {
      var frag = document.createDocumentFragment();
      node.forEach(function (n) { frag.appendChild(createNode(n)); });
      return frag;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      return document.createTextNode(String(node));
    }
    if (node.t === 'text') {
      return document.createTextNode(node.text == null ? '' : String(node.text));
    }

    // 自定义组件：交给注册的渲染函数
    if (node.tag && CUSTOM_TAGS[node.tag]) {
      return CUSTOM_TAGS[node.tag](node);
    }

    // 小程序标签 → HTML 标签映射
    var tag = TAG_MAP[node.tag] || node.tag || 'div';
    var el = document.createElement(tag);

    if (node.className) el.className = node.className;
    if (node.style) el.setAttribute('style', node.style);

    var props = node.props || {};
    for (var p in props) {
      if (p.indexOf('on') === 0 && typeof props[p] === 'function') {
        el.addEventListener(p.slice(2).toLowerCase(), props[p]);
      } else if (p === 'value' && (tag === 'input' || tag === 'textarea')) {
        if (el.value !== props[p]) el.value = props[p] == null ? '' : props[p];
      } else if (props[p] === true) {
        el.setAttribute(p, '');
      } else if (props[p] === false || props[p] == null) {
        // skip
      } else {
        el.setAttribute(p, props[p]);
      }
    }

    (node.children || []).forEach(function (c) {
      el.appendChild(createNode(c));
    });

    return el;
  }

  var TAG_MAP = {
    view: 'div',
    text: 'span',
    image: 'img',
    'scroll-view': 'div',
    input: 'input',
    textarea: 'textarea',
    button: 'button',
    navigator: 'a',
    'rich-text': 'div',
    swiper: 'div',
    'swiper-item': 'div',
    block: 'div'
  };

  /* ============================================================
   * 模板帮助函数 h
   * ============================================================ */

  var h = {
    el: function (tag, props, className, style, children) {
      return { t: 'el', tag: tag, props: props || {}, className: className, style: style, children: children || [] };
    },
    text: function (v) {
      return { t: 'text', text: v };
    },
    each: function (list, fn) {
      if (!Array.isArray(list)) return [];
      var out = [];
      for (var i = 0; i < list.length; i++) out.push(fn(list[i], i));
      return out;
    },
    ev: function (handlerName, mode) {
      return function (e) {
        var inst = e.currentTarget && e.currentTarget.__pageInst;
        if (!inst) {
          // 回退：沿 DOM 向上找带 __pageInst 的节点
          var n = e.target;
          while (n && !inst) { inst = n.__pageInst; n = n.parentNode; }
        }
        var ctx = buildCtx(e);
        var fn = inst && inst[handlerName];
        if (typeof fn === 'function') fn.call(inst, ctx);
        if (mode === 'catch') e.stopPropagation();
      };
    }
  };

  /* ============================================================
   * 事件上下文构造
   * ============================================================ */

  function buildCtx(e) {
    var dataset = {};
    var node = e.target;
    var guard = 0;
    while (node && node.getAttribute && guard++ < 30) {
      var attrs = node.attributes || [];
      var found = false;
      for (var i = 0; i < attrs.length; i++) {
        var at = attrs[i];
        if (at.name.indexOf('data-') === 0) {
          dataset[datasetKey(at.name)] = at.value;
          found = true;
        }
      }
      if (found) break;
      node = node.parentNode;
    }
    return {
      currentTarget: { dataset: dataset },
      target: { dataset: dataset },
      detail: {}
    };
  }

  /* ============================================================
   * Page 构造器
   * ============================================================ */

  function Page(def) {
    def.__isPage = true;
    (global.__PENDING_PAGES__ = global.__PENDING_PAGES__ || []).push(def);
  }

  function makePageInstance(def, template) {
    var inst = {};
    // 方法绑定
    Object.keys(def).forEach(function (k) {
      if (typeof def[k] === 'function') {
        inst[k] = def[k].bind(inst);
      }
    });
    inst.__def = def;
    inst.__template = template;
    inst.data = deepClone(def.data || {});

    inst.setData = function (obj, cb) {
      if (!isObj(obj)) return;
      var self = this;
      Object.keys(obj).forEach(function (k) {
        if (k.indexOf('.') > -1 || k.indexOf('[') > -1) setByPath(self.data, k, obj[k]);
        else self.data[k] = obj[k];
      });
      renderTree(self);
      if (typeof cb === 'function') setTimeout(cb, 0);
    };

    ['onLoad', 'onShow', 'onHide', 'onUnload', 'onReady'].forEach(function (lc) {
      if (typeof inst[lc] !== 'function') inst[lc] = function () {};
    });

    return inst;
  }

  function renderTree(inst) {
    var container = inst.__root;
    if (!container || typeof inst.__template !== 'function') return;

    // 记录当前焦点元素的状态，重渲染后恢复（避免输入被打断）
    var active = document.activeElement;
    var focusInfo = null;
    if (active && container.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      var keyAttr = active.getAttribute('data-focus-key');
      focusInfo = {
        key: keyAttr,
        selStart: active.selectionStart,
        selEnd: active.selectionEnd
      };
    }
    container.__focusInfo = focusInfo;

    var tree = inst.__template(inst.data, h, inst, makeScope(inst.data, h, inst));
    while (container.firstChild) container.removeChild(container.firstChild);
    var dom = createNode(tree);
    // 先标记 page 引用（fragment 会被 appendChild 消费清空，必须先标）
    markPageRef(dom, inst);
    container.appendChild(dom);

    // 兜底：container 自身也挂引用，保证事件冒泡到容器时仍可定位
    container.__pageInst = inst;

    // 恢复焦点
    if (focusInfo && focusInfo.key) {
      var next = container.querySelector('[data-focus-key="' + focusInfo.key + '"]');
      if (next) {
        next.focus();
        try { next.setSelectionRange(focusInfo.selStart, focusInfo.selEnd); } catch (err) { /* noop */ }
      }
    }
  }

  /** 构造模板作用域：未知 key 返回 undefined（对应小程序行为），并注入 h / page */
  function makeScope(data, hHelpers, pageInst) {
    var base = Object.assign({}, data || {});
    base.h = hHelpers;
    base.page = pageInst;
    return new Proxy(base, {
      has: function () { return true; },
      get: function (t, k) {
        if (k === Symbol.unscopables) return undefined;
        return t[k];
      }
    });
  }

  function markPageRef(node, inst) {
    if (!node) return;
    if (node.nodeType === 1) node.__pageInst = inst;
    // 元素节点与 DocumentFragment(11) 都递归子节点
    if (node.nodeType === 1 || node.nodeType === 11 || node.nodeType === 9) {
      for (var i = 0; i < node.childNodes.length; i++) markPageRef(node.childNodes[i], inst);
    }
  }

  function mountPage(inst, container) {
    inst.__root = container;
    renderTree(inst);
  }

  /* ============================================================
   * Component 构造器（简化：仅属性 + 模板，无独立生命周期）
   * ============================================================ */

  function Component(def) {
    (global.__PENDING_COMPONENTS__ = global.__PENDING_COMPONENTS__ || []).push(def);
  }

  /** 注册自定义组件的渲染函数 */
  function registerComponent(name, renderFn) {
    CUSTOM_TAGS[name] = renderFn;
  }

  /* ============================================================
   * App
   * ============================================================ */

  function App(def) {
    global.__APP_DEF = def;
  }

  /* ============================================================
   * 暴露
   * ============================================================ */

  global.Page = Page;
  global.Component = Component;
  global.App = App;
  global.__H__ = h;
  global.__MP = {
    mountPage: mountPage,
    makePageInstance: makePageInstance,
    renderTree: renderTree,
    deepClone: deepClone,
    registerComponent: registerComponent,
    createNode: createNode,
    buildCtx: buildCtx,
    makeScope: makeScope,
    TAG_MAP: TAG_MAP
  };
})(window);
