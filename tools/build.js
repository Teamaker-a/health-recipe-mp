#!/usr/bin/env node
/**
 * build.js - 把 miniprogram/ 源码编译为可静态部署的 H5 站点（web/dist/）
 *
 * 处理内容：
 *  1. 收集 app.json 的 pages / tabBar / window
 *  2. 每个页面：*.js（Page 定义）+ *.wxml（编译为模板）+ *.wxss（CSS 转换）
 *  3. 每个组件：*.js（Component 定义）+ *.wxml + *.wxss
 *  4. rpx → px（按 750 设计稿、基准宽度 375 折算，1rpx = 0.5px，用 vw 更佳；见 convertWXSS）
 *  5. 组装 index.html / app.css / bundle.js
 *
 * 运行：node tools/build.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { compile } = require('./compile-wxml.js');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const DIST = path.join(ROOT, 'web', 'dist');

/* ---------------- 工具 ---------------- */

function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeFile(p, c) { ensureDir(path.dirname(p)); fs.writeFileSync(p, c); }

/* ---------------- WXSS → CSS ---------------- */

/**
 * 尺寸换算：rpx → vw
 * 小程序 rpx：750rpx = 屏幕宽度。网页用 vw：1rpx = (100/750)vw = 0.13333vw。
 * 但桌面浏览时 100vw 很宽，页面会“撑大”。为贴近移动端观感：
 *   - 用 px 基准：1rpx = 0.5px（等效 375 逻辑宽），配合 .mp-page max-width 限制。
 * 这里采用 px 方案，简单可靠。
 */
function rpxToPx(css) {
  return css.replace(/(-?\d*\.?\d+)rpx/g, (m, num) => {
    const px = parseFloat(num) * 0.5;
    return (Number.isInteger(px) ? px : px.toFixed(2)) + 'px';
  });
}

/** 处理 WXSS 中的 @import，合并为单文件 */
function inlineImports(cssPath, seen) {
  seen = seen || new Set();
  if (seen.has(cssPath)) return '';
  seen.add(cssPath);
  let css = read(cssPath);
  css = css.replace(/@import\s+["']([^"']+)["']\s*;/g, (m, rel) => {
    const target = path.resolve(path.dirname(cssPath), rel);
    if (exists(target)) return inlineImports(target, seen) + '\n';
    const wxssTarget = target.replace(/\.wxss$/, '.wxss');
    if (exists(wxssTarget)) return inlineImports(wxssTarget, seen) + '\n';
    return m;
  });
  return css;
}

function convertWXSS(cssPath) {
  let css = inlineImports(cssPath);
  css = rpxToPx(css);
  css = wxSelectorsToHTML(css);
  return css;
}

/**
 * 小程序标签选择器 → HTML 等价物
 * 关键：`page` 在小程序里代表页面根节点（设计变量都挂在它上面），
 * 浏览器没有该元素，必须改写为 :root / html / body，否则所有 var(--x) 失效。
 */
function wxSelectorsToHTML(css) {
  // page { ... } / page,xxx { ... } → :root,body
  return css.replace(/(^|[\s,}])page(?=\s*(,|\{))/g, (m, pre) => pre + ':root,body');
}

/* ---------------- Page / Component JS 包装 ---------------- */

/**
 * 页面 JS 里使用 `require('../../utils/xxx.js')` 与 `Page({...})`。
 * 浏览器里我们提供 CommonJS 风格的 require（在 bundle 中注册模块），
 * 并把 Page({...}) 收集起来。这里对页面 JS 做最小改写：
 *   - 去掉 `const x = require('...')` 的相对路径问题 → 统一替换为 __req('utils/xxx')
 */
function rewriteRequire(src, fromDir) {
  return src.replace(/require\(\s*['"]([^'"]+)['"]\s*\)/g, (m, p) => {
    let target;
    if (p.charAt(0) === '.') {
      // 相对路径：相对当前模块所在目录解析到 miniprogram 根
      target = path.posix.normalize(path.posix.join(fromDir, p));
    } else {
      target = p;
    }
    target = target.replace(/\.js$/, '');
    return `__req(${JSON.stringify(target)})`;
  });
}

function wrapPageJS(js, key, fromDir) {
  js = rewriteRequire(js, fromDir || '');
  return `__registerPage(${JSON.stringify(key)}, function(__req){\n${js}\n});`;
}

function wrapComponentJS(js, name, fromDir) {
  js = rewriteRequire(js, fromDir || '');
  return `__registerComponent(${JSON.stringify(name)}, function(__req){\n${js}\n});`;
}

/* ---------------- 主流程 ---------------- */

function build() {
  const appJson = JSON.parse(read(path.join(MP, 'app.json')));
  const pages = appJson.pages || [];
  const tabBar = (appJson.tabBar && appJson.tabBar.list) || [];

  ensureDir(DIST);

  /* 1) 组件 */
  const compDir = path.join(MP, 'components');
  const componentFiles = exists(compDir) ? fs.readdirSync(compDir) : [];
  const componentRegs = [];
  const componentCss = [];

  componentFiles.forEach((name) => {
    const dir = path.join(compDir, name);
    if (!fs.statSync(dir).isDirectory()) return;
    const jsPath = path.join(dir, name + '.js');
    const wxmlPath = path.join(dir, name + '.wxml');
    const wxssPath = path.join(dir, name + '.wxss');
    const fromDir = 'components/' + name;

    if (exists(wxmlPath)) {
      const tplCode = compile(read(wxmlPath), 'component:' + name);
      // 组件模板直接注册为渲染函数
      componentRegs.push(
        `__registerComponentTemplate(${JSON.stringify(name)}, ${tplCode});`
      );
    }
    if (exists(jsPath)) {
      componentRegs.push(wrapComponentJS(read(jsPath), name, fromDir));
    }
    if (exists(wxssPath)) {
      componentCss.push(convertWXSS(wxssPath));
    }
  });

  /* 2) 页面 */
  const pageRegs = [];
  const pageCss = [];

  pages.forEach((p) => {
    const base = path.basename(p);            // index
    const dir = path.join(MP, path.dirname(p)); // miniprogram/pages/index
    const jsPath = path.join(MP, p + '.js');
    const wxmlPath = path.join(MP, p + '.wxml');
    const wxssPath = path.join(MP, p + '.wxss');

    const tplCode = exists(wxmlPath) ? compile(read(wxmlPath), p) : 'function(){return null;}';
    const jsCode = exists(jsPath)
      ? wrapPageJS(read(jsPath), p, path.dirname(p))
      : '__registerPage(' + JSON.stringify(p) + ', function(){});';

    pageRegs.push(`/* ===== page: ${p} ===== */`);
    pageRegs.push(`__registerPageTemplate(${JSON.stringify(p)}, ${tplCode});`);
    pageRegs.push(jsCode);

    if (exists(wxssPath)) pageCss.push(`/* ${p} */\n` + convertWXSS(wxssPath));
  });

  /* 3) 全局样式 */
  const appWxss = path.join(MP, 'app.wxss');
  const globalCss = exists(appWxss) ? convertWXSS(appWxss) : '';

  /* 4) 组装 CSS */
  const css = [
    '/* === global === */',
    globalCss,
    '/* === components === */',
    componentCss.join('\n'),
    '/* === pages === */',
    pageCss.join('\n')
  ].join('\n\n');
  writeFile(path.join(DIST, 'app.css'), css);

  /* 5) 组装 JS bundle */
  const head = [
    '(function(){',
    'var MODULES = {};',
    'function __define(name, factory){ MODULES[name] = { factory: factory, exports: null }; }',
    'function __req(name){',
    '  var m = MODULES[name];',
    '  if (!m) throw new Error("module not found: " + name);',
    '  if (!m.exports) { m.exports = {}; var mod = { exports: m.exports }; m.factory(mod, m.exports, __req); m.exports = mod.exports; }',
    '  return m.exports;',
    '}',
    ''
  ].join('\n');

  // 注册 utils / data 模块
  const moduleDefs = [];
  ['utils/store.js', 'utils/nutrition.js', 'utils/recipeService.js', 'data/foods.js', 'data/recipes.js'].forEach((rel) => {
    const full = path.join(MP, rel);
    if (!exists(full)) return;
    const modName = rel.replace(/\.js$/, '');
    let src = read(full);
    // 模块内部 require 也改写为 __req（按模块所在目录解析）
    src = rewriteRequire(src, path.dirname(rel));
    moduleDefs.push(`__define(${JSON.stringify(modName)}, function(module, exports, __req){\n${src}\n});`);
  });

  // 页面/组件注册 API
  const registry = [
    '',
    'var PAGE_TEMPLATES = {};',
    'var PAGE_DEFS = {};',
    'function __registerPageTemplate(p, fn){ PAGE_TEMPLATES[p] = fn; }',
    'function __registerPage(p, factory){',
    '  var captured = null;',
    '  var origPage = window.Page;',
    '  window.Page = function(def){ captured = def; };',
    '  try { factory(__req); } finally { window.Page = origPage; }',
    '  if (captured) PAGE_DEFS[p] = captured;',
    '}',
    ''
  ].join('\n');

  const tail = [
    '',
    '// 组装 __PAGES__ 供 spa.js 使用',
    'var __PAGES__ = {};',
    'Object.keys(PAGE_DEFS).forEach(function(p){ __PAGES__[p] = { def: PAGE_DEFS[p], template: PAGE_TEMPLATES[p] }; });',
    'window.__PAGES__ = __PAGES__;',
    'window.__TABBAR__ = ' + JSON.stringify(tabBar.map(t => ({ pagePath: t.pagePath, text: t.text }))) + ';',
    '})();'
  ].join('\n');

  // 组件注册函数（模板 + 渲染）
  const compRegistry = [
    '',
    '// ---- components ----',
    'window.__COMPONENT_TEMPLATES__ = window.__COMPONENT_TEMPLATES__ || {};',
    'window.__COMPONENT_DEFS__ = window.__COMPONENT_DEFS__ || {};',
    'function __registerComponentTemplate(name, fn){ window.__COMPONENT_TEMPLATES__[name] = fn; }',
    'function __registerComponent(name, factory){',
    '  var captured = null;',
    '  var orig = window.Component;',
    '  window.Component = function(def){ captured = def; };',
    '  try { factory(__req); } finally { window.Component = orig; }',
    '  if (captured) window.__COMPONENT_DEFS__[name] = captured;',
    '}',
    ''
  ].join('\n');

  // 组件模板 → 自定义标签渲染函数（在 runtime 的 CUSTOM_TAGS 中注册）
  const compRenderer = [
    '',
    '// 把组件模板注册成自定义标签的渲染函数',
    '// 组件内部使用 properties 接收父级传入的 props；此处直接以「传入 props + 组件 data」为作用域渲染',
    '(function(){',
    '  var tags = window.__COMPONENT_TEMPLATES__ || {};',
    '  Object.keys(tags).forEach(function(name){',
    '    var tpl = tags[name];',
    '    var def = window.__COMPONENT_DEFS__[name] || {};',
    '    window.__MP.registerComponent(name, function(node){',
    '      var props = node.props || {};',
    '      var data = Object.assign({}, def.data || {}, props);',
    '      var h = window.__H__;',
    '      var inner = tpl(data, h, null, window.__MP.makeScope(data, h, null));',
    '      // 组件根：把 children（slot 内容）附加进去',
    '      var wrap = document.createElement("div");',
    '      wrap.className = "mp-component mp-component--" + name;',
    '      var dom = window.__MP.createNode(inner);',
    '      wrap.appendChild(dom);',
    '      if (node.children && node.children.length) {',
    '        var slot = document.createElement("div");',
    '        slot.className = "mp-slot";',
    '        node.children.forEach(function(c){ slot.appendChild(window.__MP.createNode(c)); });',
    '        wrap.appendChild(slot);',
    '      }',
    '      return wrap;',
    '    });',
    '  });',
    '})();',
    ''
  ].join('\n');

  const bundle = [
    head,
    moduleDefs.join('\n'),
    registry,
    compRegistry,
    componentRegs.join('\n'),   // 组件模板 + 组件 JS 注册调用
    compRenderer,
    pageRegs.join('\n'),
    tail
  ].join('\n');

  writeFile(path.join(DIST, 'bundle.js'), bundle);

  /* 6) index.html */
  const html = renderHTML(appJson, pages, tabBar);
  writeFile(path.join(DIST, 'index.html'), html);

  /* 7) 复制图片资源 */
  const imgSrc = path.join(MP, 'images');
  const imgDst = path.join(DIST, 'images');
  if (exists(imgSrc)) copyDir(imgSrc, imgDst);

  /* 8) 复制运行时静态脚本 */
  ['wx-shim.js', 'runtime.js', 'spa.js'].forEach((f) => {
    const src = path.join(ROOT, 'web', 'build', f);
    if (exists(src)) fs.copyFileSync(src, path.join(DIST, f));
  });
  // 外壳样式
  const shellCss = path.join(ROOT, 'web', 'build', 'shell.css');
  if (exists(shellCss)) fs.copyFileSync(shellCss, path.join(DIST, 'shell.css'));

  // 9) .nojekyll —— 让 GitHub Pages 不做 Jekyll 处理（否则会忽略 _ 开头的文件）
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  console.log('✅ build done →', path.relative(ROOT, DIST));
  console.log('   pages:', pages.length, '| tabbar:', tabBar.length, '| components:', componentFiles.length);
}

function copyDir(src, dst) {
  ensureDir(dst);
  fs.readdirSync(src).forEach((f) => {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  });
}

function renderHTML(appJson, pages, tabBar) {
  const title = (appJson.window && appJson.window.navigationBarTitleText) || '轻食谱';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#4FB6A0" />
<title>${title}</title>
<link rel="stylesheet" href="./shell.css" />
<link rel="stylesheet" href="./app.css" />
</head>
<body>
  <div id="app">
    <header class="mp-navbar"><span class="mp-navbar__title">${title}</span></header>
    <main id="mp-view"></main>
    <nav id="mp-tabbar" class="mp-tabbar"></nav>
  </div>
  <script src="./wx-shim.js"></script>
  <script src="./runtime.js"></script>
  <script src="./bundle.js"></script>
  <script src="./spa.js"></script>
</body>
</html>`;
}

/* ---------------- 运行 ---------------- */

build();
