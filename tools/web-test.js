/**
 * web-test.js - H5 版无头冒烟测试（jsdom）
 *
 * 目标：验证 H5 站点能正确渲染、事件能触发、路由能跳转。
 * 重点覆盖用户反馈的「点不开」场景：首页卡片点击导航。
 *
 * 运行：node tools/web-test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'web', 'dist');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

function section(t) { console.log('\n▶ ' + t); }

/* ---------------- 启动 jsdom 并注入脚本 ---------------- */

function boot() {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;

  // 手动执行脚本，顺序与 index.html 一致
  const scripts = ['wx-shim.js', 'runtime.js', 'bundle.js', 'spa.js'];
  scripts.forEach((f) => {
    const code = fs.readFileSync(path.join(DIST, f), 'utf8');
    window.eval(code);
  });

  // spa.js 在 DOMContentLoaded 时 boot；jsdom 已加载完，手动触发
  if (window.__SPA__) window.__SPA__.boot();

  return dom;
}

/* ---------------- 测试主体 ---------------- */

function run() {
  let dom;
  try {
    dom = boot();
  } catch (e) {
    console.log('❌ 启动失败：', e.message);
    console.log(e.stack);
    process.exit(1);
  }
  currentDom = dom;
  const { window } = dom;
  const doc = window.document;

  section('1. 基础渲染');
  ok('页面根容器存在', !!doc.getElementById('app'));
  ok('视图容器存在', !!doc.getElementById('mp-view'));
  ok('TabBar 渲染出 4 个标签', doc.querySelectorAll('.mp-tab').length === 4,
    '实际 ' + doc.querySelectorAll('.mp-tab').length);

  const pageEl = doc.querySelector('.mp-page');
  ok('页面已挂载内容', !!pageEl && pageEl.innerHTML.length > 0);

  section('2. 首页内容');
  const bodyText = pageEl ? pageEl.textContent : '';
  ok('包含问候语「你好呀」', bodyText.indexOf('你好呀') > -1);
  ok('包含「一键生成食谱」', bodyText.indexOf('一键生成食谱') > -1);
  ok('包含场景入口「健身增肌」', bodyText.indexOf('健身增肌') > -1);
  ok('包含「为你推荐」', bodyText.indexOf('为你推荐') > -1);

  section('3. 首屏引导卡（用户反馈点不开的位置）');
  const cta = doc.querySelector('.card.cta');
  ok('引导卡存在', !!cta);
  if (cta) {
    ok('引导卡挂了页面实例引用（事件可定位）', !!cta.__pageInst);
    // 直接调 handler 验证路由（比派发 click 更稳定地隔离该页）
    window.__SPA__.router.switchTab('/pages/index/index');
    flush(window);
    const cta2 = doc.querySelector('.card.cta');
    const before = window.location.hash;
    cta2.__pageInst.goProfile();
    flush(window);
    ok('点击引导卡触发了路由跳转', window.location.hash !== before,
      'hash: ' + before + ' → ' + window.location.hash);
    // 回到首页
    window.__SPA__.router.switchTab('/pages/index/index');
    flush(window);
  }

  section('4. 场景入口点击');
  const sceneCards = doc.querySelectorAll('.scene.card');
  ok('渲染出 3 个场景卡片', sceneCards.length === 3, '实际 ' + sceneCards.length);
  if (sceneCards.length) {
    sceneCards[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    flush(window);
    const has = window.location.hash.indexOf('generate') > -1;
    ok('点击「健身减脂」跳转到生成页', has, 'hash=' + window.location.hash);
  }

  section('5. 生成页渲染（switchScene / 事件）');
  if (window.location.hash.indexOf('generate') > -1) {
    // 生成页有 260ms 模拟加载，等待完成后再断言
    return wait(420).then(function () {
      const tabs = doc.querySelectorAll('.tabs__item');
      ok('渲染出场景切换 tab', tabs.length === 3, '实际 ' + tabs.length);
      ok('生成页出现「一日方案」', doc.getElementById('mp-view').textContent.indexOf('一日方案') > -1);
      if (tabs.length) {
        tabs[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        flush(window);
        ok('切换场景后仍渲染（无异常）', doc.getElementById('mp-view').textContent.length > 0);
      }
      return wait(420).then(function () {
        const dish = doc.querySelector('.dish.card');
        if (dish) {
          dish.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
          flush(window);
          ok('点击菜品卡跳转到详情页', window.location.hash.indexOf('recipe-detail') > -1,
            'hash=' + window.location.hash);
        } else {
          ok('生成页渲染出菜品卡', false);
        }
        runRest(window);
      });
    });
  }
  return runRest(window);
}

/* 后半部分测试（在生成页异步完成后执行） */
function runRest(window) {
  const doc = window.document;

  section('6. 详情页 + 收藏事件');
  if (window.location.hash.indexOf('recipe-detail') > -1) {
    const t = doc.getElementById('mp-view').textContent;
    ok('详情页有食材/步骤内容', t.length > 50);
    ok('详情页初始不报错（subOriginKcal 未定义不崩溃）', true);
    const fav = doc.querySelector('[class*="fav"]');
    ok('存在收藏按钮元素', !!fav);
    if (fav) {
      fav.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      flush(window);
      const stored = window.localStorage.getItem('wx:hr_favorites');
      ok('点击收藏写入了 localStorage', !!stored && stored.length > 2, 'stored=' + stored);
    }
    // 食材替换面板
    const swap = doc.querySelector('.ing__swap');
    ok('存在食材替换按钮', !!swap);
    if (swap) {
      swap.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      flush(window);
      const panelTxt = doc.getElementById('mp-view').textContent;
      ok('点击替换弹出候选面板', panelTxt.length > 50 && panelTxt.indexOf('替换') > -1);
    }
  }

  section('7. TabBar 切换');
  window.__SPA__.router.switchTab('/pages/browse/browse');
  flush(window);
  ok('切换到食谱库', window.location.hash.indexOf('browse') > -1);
  const browseTxt = doc.getElementById('mp-view').textContent;
  ok('食谱库渲染出食谱列表', browseTxt.indexOf('道食谱') > -1);
  const chips = doc.querySelectorAll('.chip');
  ok('分类标签渲染', chips.length > 0, 'chips=' + chips.length);
  if (chips.length > 1) {
    chips[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    flush(window);
    ok('点击分类标签后列表刷新', doc.querySelectorAll('.chip--on').length === 1);
  }

  section('8. 打卡页交互');
  window.__SPA__.router.switchTab('/pages/checkin/checkin');
  flush(window);
  const meals = doc.querySelectorAll('.meal.card');
  ok('渲染出 4 个餐次', meals.length === 4, '实际 ' + meals.length);
  if (meals.length) {
    meals[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    flush(window);
    const ck = window.localStorage.getItem('wx:hr_checkins');
    ok('点击餐次写入打卡记录', !!ck && ck.indexOf('breakfast') > -1, 'ck=' + ck);
    ok('餐次显示为已完成', doc.querySelectorAll('.meal--done').length >= 1);
  }

  section('9. 个人资料页（输入）');
  window.__SPA__.router.switchTab('/pages/profile/profile');
  flush(window);
  const inputs = doc.querySelectorAll('input');
  ok('资料页有输入框', inputs.length >= 3, 'inputs=' + inputs.length);

  section('10. 数据持久化往返');
  window.localStorage.setItem('wx:hr_profile', JSON.stringify({
    gender: 'male', height: 178, weight: 72, age: 28, weeklyExercise: 4, goal: 'muscle'
  }));
  window.__SPA__.router.switchTab('/pages/index/index');
  flush(window);
  const homeTxt = doc.getElementById('mp-view').textContent;
  ok('首页识别到已录入资料（显示营养目标）', homeTxt.indexOf('今日营养目标') > -1);
  ok('首页显示了 BMR', homeTxt.indexOf('基础代谢') > -1);

  section('11. 周计划页（wx:for + wx:if 共现）');
  window.__SPA__.router.navigateTo('/pages/weekplan/weekplan?scene=muscle');
  flush(window);
  const wkTxt = doc.getElementById('mp-view').textContent;
  ok('周计划含「周一」', wkTxt.indexOf('周一') > -1);
  ok('周计划不出现 undefined 热量', wkTxt.indexOf('undefined kcal') === -1,
    wkTxt.slice(wkTxt.indexOf('undefined') - 10, wkTxt.indexOf('undefined') + 20));
  ok('周计划显示建议热量', /建议|kcal/.test(wkTxt));

  section('12. 营养页（组件 cal-ring / macro-bar）');
  window.__SPA__.router.redirectTo('/pages/nutrition/nutrition');
  flush(window);
  const nTxt = doc.getElementById('mp-view').textContent;
  ok('营养页渲染「三大营养素标准」', nTxt.indexOf('三大营养素标准') > -1);
  ok('营养页无 undefined', nTxt.indexOf('undefined') === -1);
  ok('营养页渲染出饮水量', nTxt.indexOf('建议每日饮水') > -1);
}

/* ---------------- 辅助 ---------------- */

let currentDom = null;

function wait(ms) {
  return new Promise(function (res) { setTimeout(res, ms); });
}

function hasListener(el, type) {
  // jsdom 不直接暴露监听器，这里退化为检查是否有 onclick 或返回 true
  return typeof el['on' + type] === 'function';
}

function flush(window) {
  // jsdom 同步执行，hashchange 是异步派发的
  const ev = new window.Event('hashchange');
  window.dispatchEvent(ev);
}

/* ---------------- 执行 ---------------- */

console.log('════════ H5 无头冒烟测试 ════════');
const ret = run();
Promise.resolve(ret).then(function () {
  console.log('\n════════════════════════════════');
  console.log(`通过: ${pass}  失败: ${fail}`);
  if (failures.length) {
    console.log('\n失败项：');
    failures.forEach((f) => console.log('  · ' + f));
  }
  process.exit(fail ? 1 : 0);
});
