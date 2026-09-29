/**
 * compile-wxml.js - 把 WXML 编译为返回 VDOM 描述对象的 JS 模板函数
 *
 * 支持的本项目用到的语法：
 *   {{ expr }}            插值（属性 / 文本）
 *   wx:if / wx:elif / wx:else
 *   wx:for / wx:for-item / wx:for-index / wx:key
 *   bindtap / catchtap / bindinput / bindconfirm / bindblur ...
 *   data-*（透传 dataset）
 *   class / style 动态绑定（{{}} 内插值）
 *   block（透明容器）
 *   自定义组件标签（recipe-card / cal-ring / macro-bar）→ 交给运行时按 tag 渲染
 *
 * 输出：一个字符串形式的函数体，形如
 *   function (data, h, page) { return h.el('div', {...}, [ ... ]); }
 */

'use strict';

/* ---------------- 极简 WXML 解析器 ---------------- */

const VOID_TAGS = new Set(['image', 'input', 'img', 'br', 'hr', 'meta', 'link']);

function parseWXML(src) {
  src = src.replace(/<!--[\s\S]*?-->/g, '');
  let i = 0;
  const root = { tag: '#root', children: [] };
  const stack = [root];

  function top() { return stack[stack.length - 1]; }

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      pushText(src.slice(i));
      break;
    }
    if (lt > i) pushText(src.slice(i, lt));

    const gt = findTagEnd(src, lt);
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;

    if (raw[0] === '/') {
      // 闭合标签
      const name = raw.slice(1).trim();
      closeTag(name);
    } else {
      const selfClose = raw.endsWith('/');
      const body = selfClose ? raw.slice(0, -1) : raw;
      const node = parseTagOpen(body);
      top().children.push(node);
      if (!selfClose && !VOID_TAGS.has(node.tag)) {
        stack.push(node);
        node.children = node.children || [];
      } else {
        node.children = node.children || [];
      }
    }
  }
  return root;

  function pushText(t) {
    if (!t) return;
    top().children.push({ tag: '#text', text: t });
  }

  function closeTag(name) {
    for (let s = stack.length - 1; s > 0; s--) {
      if (stack[s].tag === name) {
        stack.length = s; // 弹到该标签（移除自身及之后）
        return;
      }
    }
    // 未匹配则忽略
  }
}

function findTagEnd(src, start) {
  let quote = null;
  for (let j = start + 1; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return j;
    }
  }
  return src.length;
}

function parseTagOpen(body) {
  body = body.trim();
  const m = /^([\w-:]+)/.exec(body);
  const tag = m ? m[1] : 'div';
  const rest = body.slice(tag.length);

  const attrs = {};
  // 逐属性解析：key="value" / key='value' / key={{expr}} / key（裸）
  const attrRe = /([\w:.-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g;
  let am;
  while ((am = attrRe.exec(rest))) {
    const name = am[1];
    let value = '';
    if (am[2] !== undefined) {
      value = am[3] !== undefined ? am[3] : am[4];
    } else {
      value = true; // 裸属性，如 lazy-load
    }
    attrs[name] = value;
  }
  return { tag, attrs, children: [] };
}

/* ---------------- 代码生成 ---------------- */

function esc(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/** 把含 {{}} 的字符串编译为 JS 表达式片段 */
function compileInterp(str, ctx) {
  // 纯插值：{{ expr }}
  const pure = /^\s*\{\{([\s\S]*)\}\}\s*$/.exec(str);
  if (pure) {
    return '(' + transformExpr(pure[1]) + ')';
  }
  // 混合文本：拼接
  const parts = [];
  let last = 0;
  const re = /\{\{([\s\S]*?)\}\}/g;
  let m;
  while ((m = re.exec(str))) {
    if (m.index > last) parts.push(JSON.stringify(str.slice(last, m.index)));
    parts.push('(' + transformExpr(m[1]) + ')');
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push(JSON.stringify(str.slice(last)));
  if (!parts.length) return JSON.stringify(str);
  return '(' + parts.join(' + ') + ')';
}

/** 表达式转换：去掉 {{ }} 包裹，本项目 WXML 表达式基本可直接用 JS 求值 */
function transformExpr(expr) {
  var s = String(expr).trim();
  var pure = /^\s*\{\{([\s\S]*)\}\}\s*$/.exec(s);
  if (pure) return pure[1].trim();
  // 混合文本/表达式：走 compileInterp 生成拼接表达式
  if (s.indexOf('{{') > -1) return compileInterp(s, {});
  return s;
}

const EVT_MAP = {
  bindtap: 'click',
  catchtap: 'click',
  bindinput: 'input',
  catchinput: 'input',
  bindconfirm: 'confirm',
  bindblur: 'blur',
  bindchange: 'change',
  bindlongpress: 'longpress'
};

function compileAttributes(node, ctx) {
  const attrs = node.attrs || {};
  const staticAttrs = {};   // 编译期常量
  const exprAttrs = [];     // 运行期表达式
  const evBindings = [];    // 事件 { wxmlName, domEvent, handler, mode }

  Object.keys(attrs).forEach((name) => {
    const val = attrs[name];

    // 事件（bind*/catch*前缀）
    if (/^(bind|catch)/.test(name) && (name in EVT_MAP || /^(bind|catch)[a-z]+$/.test(name))) {
      const evType = name.replace(/^(bind|catch)/, '');
      const mode = name.indexOf('catch') === 0 ? 'catch' : 'bind';
      evBindings.push({ wxmlName: name, domEvent: EVT_MAP[name] || evType, handler: String(val).trim(), mode });
      return;
    }

    // dataset / 普通属性
    if (typeof val === 'string' && val.indexOf('{{') > -1) {
      exprAttrs.push({ name, expr: compileInterp(val, ctx) });
    } else {
      staticAttrs[name] = val;
    }
  });

  return { staticAttrs, exprAttrs, evBindings };
}

let uid = 0;

function compileNode(node, ctx) {
  if (node.tag === '#text') {
    const t = node.text;
    if (t.indexOf('{{') === -1) {
      // 纯静态文本
      if (!t.trim() && t.indexOf(' ') > -1 && t.replace(/\s/g, '') === '') return '';
      return `h.text(${JSON.stringify(t)})`;
    }
    return `h.text(${compileInterp(t, ctx)})`;
  }

  if (node.tag === '#root') {
    return '[' + (node.children || []).map((c) => compileNode(c, ctx)).filter(Boolean).join(',') + ']';
  }

  // 处理 wx:if / wx:for —— 它们包裹在父级子节点数组里处理
  return compilePlainNode(node, ctx);
}

function compilePlainNode(node, ctx) {
  const attrs = node.attrs || {};
  const hasIf = 'wx:if' in attrs;
  const hasFor = 'wx:for' in attrs;

  // 先剥掉指令属性，其余属性正常处理
  const cleanNode = { tag: node.tag, attrs: {}, children: node.children };
  Object.keys(attrs).forEach((k) => {
    if (k === 'wx:if' || k === 'wx:elif' || k === 'wx:else' || k === 'wx:for'
      || k === 'wx:for-item' || k === 'wx:for-index' || k === 'wx:key') return;
    cleanNode.attrs[k] = attrs[k];
  });

  const { staticAttrs, exprAttrs, evBindings } = compileAttributes(cleanNode, ctx);

  // class / style 可能是静态、纯插值或混合，从静态与表达式中各自抽取
  let classExpr = staticAttrs.class !== undefined ? JSON.stringify(staticAttrs.class) : 'undefined';
  let styleExpr = staticAttrs.style !== undefined ? JSON.stringify(staticAttrs.style) : 'undefined';
  exprAttrs.forEach((a) => {
    if (a.name === 'class') classExpr = a.expr;
    else if (a.name === 'style') styleExpr = a.expr;
  });

  // 生成 props 对象（普通属性 + 事件）
  const propPairs = [];
  Object.keys(staticAttrs).forEach((k) => {
    if (k === 'class' || k === 'style') return;
    const v = staticAttrs[k];
    propPairs.push(`${JSON.stringify(k)}: ${typeof v === 'boolean' ? v : JSON.stringify(v)}`);
  });
  exprAttrs.forEach((a) => {
    if (a.name === 'class' || a.name === 'style') return;
    propPairs.push(`${JSON.stringify(a.name)}: ${a.expr}`);
  });
  evBindings.forEach((ev) => {
    propPairs.push(`${JSON.stringify('on' + ev.domEvent)}: h.ev(${JSON.stringify(ev.handler)}${ev.mode === 'catch' ? ",'catch'" : ''})`);
  });

  const childrenCode = '[' + compileChildren(node.children || [], ctx).filter(Boolean).join(',') + ']';

  const propsObj = '{' + propPairs.join(',') + '}';

  return `h.el(${JSON.stringify(node.tag)}, ${propsObj}, ${classExpr}, ${styleExpr}, ${childrenCode})`;
}

function compileChild(node, ctx) {
  if (node.tag === '#text') return compileNode(node, ctx);

  const attrs = node.attrs || {};

  // wx:if / wx:elif / wx:else 链需要兄弟级处理，这里用 __prevState 简化：
  // 简化策略：wx:if → cond ? node : null；wx:else → 依赖上一步结果
  // 由于本项目 wx:else 均紧跟 wx:if，采用「就近配对」方式在数组层处理（见 compileChildren）。
  return compilePlainNode(node, ctx);
}

/** 处理带 wx:if / wx:for 的子节点数组 */
function compileChildren(children, ctx) {
  const out = [];
  let branchStack = []; // 用于 wx:if/elif/else

  for (let idx = 0; idx < children.length; idx++) {
    const node = children[idx];
    if (node.tag === '#text') {
      const code = compileNode(node, ctx);
      if (code) out.push({ code, cond: null });
      continue;
    }

    const attrs = node.attrs || {};

    // wx:for 与 wx:if 可能同时存在：先循环，再对每个 item 应用条件
    if ('wx:for' in attrs) {
      const listExpr = transformExpr(attrs['wx:for']);
      const itemName = attrs['wx:for-item'] ? String(attrs['wx:for-item']) : 'item';
      const indexName = attrs['wx:for-index'] ? String(attrs['wx:for-index']) : 'index';
      const condExpr = ('wx:if' in attrs) ? transformExpr(attrs['wx:if']) : null;
      // 剥掉指令后编译节点
      const clone = { tag: node.tag, attrs: {}, children: node.children };
      Object.keys(attrs).forEach((k) => {
        if (['wx:for', 'wx:for-item', 'wx:for-index', 'wx:key', 'wx:if', 'wx:elif', 'wx:else'].indexOf(k) === -1) {
          clone.attrs[k] = attrs[k];
        }
      });
      const inner = compilePlainNode(clone, ctx);
      const body = condExpr ? `(${condExpr} ? ${inner} : null)` : inner;
      out.push({
        code: `h.each(${listExpr}, function(${itemName}, ${indexName}) { return ${body}; })`,
        cond: null
      });
      // 若后面紧跟 elif/else，则不再处理（与 for 同级极少见）
      continue;
    }

    // 处理 if / elif / else
    if ('wx:if' in attrs) {
      const cond = transformExpr(attrs['wx:if']);
      const inner = compilePlainNode(node, ctx);
      // 收集后续 elif/else
      const chain = [{ cond: `(${cond})`, code: inner }];
      let j = idx + 1;
      while (j < children.length) {
        const nxt = children[j];
        const na = nxt.attrs || {};
        if ('wx:elif' in na) {
          chain.push({ cond: `(${transformExpr(na['wx:elif'])})`, code: compilePlainNode(nxt, ctx) });
          j++;
        } else if ('wx:else' in na) {
          chain.push({ cond: 'true', code: compilePlainNode(nxt, ctx) });
          j++;
        } else break;
      }
      idx = j - 1;
      // 生成三目表达式
      let expr = 'null';
      for (let c = chain.length - 1; c >= 0; c--) {
        expr = `(${chain[c].cond} ? ${chain[c].code} : ${expr})`;
      }
      out.push({ code: expr, cond: null });
      continue;
    }
    if ('wx:elif' in attrs || 'wx:else' in attrs) {
      // 独立出现（无前置 if）：忽略，交由上方分支处理
      continue;
    }

    out.push({ code: compilePlainNode(node, ctx), cond: null });
  }

  return out.map((o) => o.code);
}

/* ---------------- 对外接口 ---------------- */

function compile(source, pageName) {
  const ast = parseWXML(source);
  const ctx = {};
  const nodes = compileChildren(ast.children, ctx);

  // 顶层可能返回数组或单节点
  const body = nodes.length === 1 ? nodes[0] : '[' + nodes.join(',') + ']';

  // 用 with(scope) 让模板里的裸标识符（nut / item / index …）解析到页面 data。
  // scope 由运行时用 Proxy 包装：未声明的 key 返回 undefined，避免 ReferenceError。
  return `function __tpl(data, h, page, __scope) {
  var __s = __scope || data || {};
  with (__s) {
    return ${body};
  }
}`;
}

module.exports = { compile, parseWXML };
