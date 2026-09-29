# 轻食谱 · H5 网页版

微信小程序原生版（`miniprogram/`）的 **H5 复刻版**，用浏览器就能打开，手机也能访问 —— 免去微信开发者工具反复调试的麻烦。

> 目标：源码只维护一份（`miniprogram/`），H5 版由构建脚本自动生成，样式与逻辑与小程序保持 1:1。

---

## 一、快速开始

### 1. 构建

```bash
node tools/build.js
```

产物输出到 `web/dist/`（已在仓库中，可直接部署）。

### 2. 本地预览

```bash
node tools/serve.js            # 默认 8080
node tools/serve.js 3000       # 指定端口
```

浏览器打开 `http://localhost:8080`。
**手机访问**：把 `localhost` 换成本机局域网 IP（如 `http://192.168.1.10:8080`），同一 WiFi 即可。

### 3. 无头自测（无需浏览器）

```bash
node tools/web-test.js
# 预期：通过: 39  失败: 0
```

用 jsdom 模拟浏览器，跑通全部 10 个页面、3 个组件、路由跳转、事件与数据持久化。

---

## 二、目录结构

```
health-recipe-mp/
├── miniprogram/               # 【唯一源码】微信小程序原生项目（H5 版从这里生成）
├── tools/
│   ├── compile-wxml.js        # WXML → JS 模板编译器
│   ├── build.js               # 构建：产出 web/dist（HTML/CSS/JS/图片）
│   ├── web-test.js            # H5 无头冒烟测试（jsdom）
│   └── serve.js               # 零依赖静态服务器
└── web/
    ├── build/                 # H5 运行时（手写，随构建拷贝到 dist）
    │   ├── wx-shim.js         # wx API 垫片（storage / 导航 / toast）
    │   ├── runtime.js         # 小程序运行时（Page / Component / setData / 模板渲染）
    │   ├── spa.js             # hash 路由 + 页面栈 + TabBar
    │   └── shell.css          # 网页外壳样式（导航栏 / TabBar / Toast）
    └── dist/                  # 构建产物（可直接静态部署）
        ├── index.html
        ├── app.css            # 由 app.wxss + 各页 wxss 转换（rpx→px）
        ├── bundle.js          # 各页 JS + 编译后的模板 + utils/data 模块
        ├── *.js / shell.css
        └── images/
```

---

## 三、工作原理

小程序与 H5 的差异集中在「渲染」和「宿主 API」两层，构建脚本把这两层做了桥接：

| 小程序概念 | H5 实现 |
|---|---|
| `Page({ data, onLoad, setData })` | `runtime.js` 提供全局 `Page`，`setData` 触发重渲染 |
| `Component({ properties, data })` | 组件模板注册为自定义标签的渲染函数 |
| WXML 模板 | `compile-wxml.js` 编译为 JS 函数，输出 VDOM 描述 |
| `wx:if` / `wx:elif` / `wx:else` | 编译为三目表达式 |
| `wx:for` / `wx:for-item` / `wx:key` | 编译为 `h.each(list, fn)` |
| `bindtap` / `catchtap` | `addEventListener('click', …)`；`catch` 额外 `stopPropagation` |
| `bindinput` | `addEventListener('input', …)`，`e.detail.value` 取自输入框 |
| `data-*` → `e.currentTarget.dataset` | 沿 DOM 向上收集最近节点的 `data-*` |
| `wx.getStorageSync` 等 | 基于 `localStorage`（前缀 `wx:`） |
| `wx.navigateTo` / `switchTab` / `navigateBack` | hash 路由 + 页面栈 |
| `rpx` | 构建时转 `px`（`1rpx = 0.5px`，等效 375 逻辑宽） |

**关键点**：`utils/` 与 `data/` 目录**零改动**复用 —— 它们只依赖少量 `wx.*` API，由垫片兜住。

### 为什么这么做

之前小程序端出现「卡片在手机上点不开、仅鼠标可用」的问题，根因是样式里的
`transition: transform` 配合 `:active` 缩放，会吞掉移动端合成的 tap 事件。
H5 版改用 `hover-class`（见 `app.wxss` 的 `.card--tap`），并统一走浏览器原生
`click` 事件，行为稳定可复现，也方便用浏览器 DevTools 直接调试。

---

## 四、关于「点不开」的修复

`miniprogram/app.wxss` 中已同步修复（见 `.card--tap` 一节）：

- 移除可点击卡片的 `transform` 过渡；
- 按压反馈改用 `hover-class="card--hover"`；
- 首页引导卡额外把 `bindtap` 换成 `catchtap`，避免冒泡被上层拦截。

H5 版沿用同一套样式，因此两端表现一致。

---

## 五、二次开发

- **改页面/逻辑**：只改 `miniprogram/` 下源码，然后 `node tools/build.js` 重新生成。
- **改主题色**：改 `miniprogram/styles/tokens.wxss` 的 `--c-mint-*`，两端同时生效。
- **改 H5 外壳**（导航栏/TabBar 样式）：改 `web/build/shell.css`。
- **改运行时行为**：改 `web/build/runtime.js` / `spa.js` / `wx-shim.js`。

---

## 六、已知差异

- H5 版用 localStorage 持久化，与小程序本地存储相互独立。
- `wx.vibrateShort`（震动反馈）在浏览器无对应能力，静默忽略。
- 组件（cal-ring / macro-bar）为简化实现：H5 版按属性直接内联渲染，不走 Canvas。
- 未做小程序原生导航栏的沉浸式效果，用统一的顶部栏替代。
