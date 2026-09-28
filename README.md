# 轻食谱 · 智能健康食谱管理平台

> 面向健身人群、减脂人群与追求健康生活的普通用户的微信小程序。解决饮食结构混乱、不会科学搭配三餐、健身无方案、养生无依据的痛点，提供**个性化、数据化、场景化**的智能食谱服务。

主色调：**薄荷绿 + 米白**，低饱和、简约高级、健康治愈风。

---

## 一、快速开始

本项目为 **微信小程序原生** 项目，无需构建、无第三方依赖，克隆即可运行。

1. 打开 **微信开发者工具**（建议 ≥ 1.06）
2. 选择「导入项目」，目录选择本仓库根目录 `health-recipe-mp/`
3. AppID 选择「测试号」（项目已内置 `touristappid`，可直接预览）
4. 编译运行 ✅

> `project.config.json` 中 `miniprogramRoot` 已指向 `miniprogram/`，导入后无需额外配置。

### 逻辑自测（可选，无需开发者工具）

项目附带一套无头 smoke test，用 Node 模拟 `wx` API 跑通全部页面/组件逻辑：

```bash
node docs/smoke-test.js
# 预期：通过: 22  失败: 0  ✅ 全部逻辑测试通过
```

---

## 二、目录结构

```
health-recipe-mp/
├── project.config.json          # 项目配置
├── project.private.config.json
├── docs/
│   ├── smoke-test.js            # 逻辑自测脚本
│   └── ALGORITHM.md             # 营养算法说明
└── miniprogram/
    ├── app.js / app.json / app.wxss
    ├── sitemap.json
    ├── styles/
    │   └── tokens.wxss          # 设计变量（颜色/圆角/间距/阴影/动效）
    ├── utils/
    │   ├── store.js             # 本地持久化（资料/收藏/打卡/方案）
    │   ├── nutrition.js         # 营养测算核心算法（BMR/TDEE/宏量）
    │   └── recipeService.js     # 食谱业务逻辑（计算/生成/替换/筛选）
    ├── data/
    │   ├── foods.js             # 食材营养数据库（100+ 项）
    │   └── recipes.js           # 食谱数据库（16 道，含三餐+加餐）
    ├── components/
    │   ├── cal-ring/            # 热量环形图（Canvas 2D）
    │   ├── macro-bar/           # 三大营养素供能比条
    │   └── recipe-card/         # 食谱卡片
    └── pages/
        ├── index/               # 首页（概览 + 场景入口 + 推荐）
        ├── profile/             # 个人信息 & 身体数据录入
        ├── nutrition/           # 智能营养测算 & 可视化
        ├── generate/            # 三场景一日食谱生成
        ├── weekplan/            # 一周食谱计划
        ├── recipe-detail/       # 食谱详情 + 食材替换
        ├── browse/              # 食谱分类浏览/筛选/搜索
        ├── checkin/             # 每日饮食打卡 + 摄入进度对比
        ├── stats/               # 饮食数据统计
        └── favorites/           # 我的收藏
```

**分层清晰**：`data`（数据）→ `utils`（逻辑）→ `components`（复用 UI）→ `pages`（页面）。
新增食谱只需在 `data/recipes.js` 加一条，新增食材只需在 `data/foods.js` 加一行，其余全自动。

---

## 三、核心功能清单

| # | 功能 | 实现位置 |
|---|------|---------|
| 1 | 个人信息 & 身体数据录入（性别/身高/体重/年龄/每周运动/目标） | `pages/profile` |
| 2 | 智能营养测算：BMR·TDEE·推荐摄入·蛋白/碳水/脂肪 + 可视化 | `utils/nutrition.js` · `pages/nutrition` |
| 3 | 三场景一键生成一日三餐+加餐（增肌/减脂/养生） | `utils/recipeService.js#generatePlan` · `pages/generate` |
| 4 | 智能食材替换（同类别、热量/营养持平、自动折算用量） | `utils/recipeService.js#findSubstitutes` · `pages/recipe-detail` |
| 5 | 食谱分类浏览（快手/低脂/高蛋白/清淡 + 早午晚加餐） | `pages/browse` |
| 6 | 收藏 · 每日打卡 · 饮食数据统计 | `pages/favorites` `pages/checkin` `pages/stats` |
| 7 | 一周食谱计划（7 天不重样，自动轮换） | `utils/recipeService.js#generateWeekPlan` · `pages/weekplan` |
| 8 | 今日营养摄入进度对比（按已打卡餐次） | `pages/checkin` |
| 9 | 食谱配图（16 道食谱壁纸图，卡片/详情/列表均展示） | `miniprogram/images/recipes/` |

---

## 四、营养算法说明（简述）

- **BMR**：Mifflin-St Jeor 公式
  - 男：`10×体重 + 6.25×身高 − 5×年龄 + 5`
  - 女：`10×体重 + 6.25×身高 − 5×年龄 − 161`
- **TDEE**：`BMR × 活动系数`（按每周运动 0–7 次映射 1.2–1.8）
- **推荐摄入**：增肌 `×1.12` / 减脂 `×0.82` / 维持 `×1.0`，并保证 **不低于 BMR**
- **三大营养素**：
  - 增肌：蛋白 2.0g/kg、脂肪 25%、余为碳水
  - 减脂：蛋白 2.2g/kg、脂肪 25%、余为碳水
  - 维持：蛋白 1.6g/kg、脂肪 30%、余为碳水
- **三餐分配**：早餐 25% / 午餐 35% / 晚餐 30% / 加餐 10%
- **食材替换**：同类别内，按「等热量折算用量」后计算营养差，以热量偏差为主的综合评分排序（偏差 >12% 不达标），保证替换后能量与营养基本持平。

详见 `docs/ALGORITHM.md`。

---

## 五、数据存储

所有用户数据通过 `wx.setStorageSync` 保存在**本机**，无需后端即可完整运行：

| Key | 内容 |
|-----|------|
| `hr_profile` | 身体数据 |
| `hr_favorites` | 收藏的食谱 id 列表 |
| `hr_checkins` | 打卡记录（按日期） |
| `hr_plan` | 最近生成的一日方案 |

> 后续接入后端时，只需替换 `utils/store.js` 中的读写实现，页面无需改动。

---

## 六、二次开发指引

- **改主题色**：只改 `styles/tokens.wxss` 里的 `--c-mint-*` 等变量，全站生效。
- **加食谱**：在 `data/recipes.js` 追加对象即可（id 唯一、`ingredients[].name` 必须存在于 `data/foods.js`）。
- **加食材**：在 `data/foods.js` 追加 `{ category, kcal, protein, carb, fat, unit }`。
- **加场景**：在 `utils/recipeService.js` 的 `GOAL_SCENE` 与 `generatePlan` 的 `sceneLabel` 扩展。
- **换后端**：替换 `utils/store.js` 的实现为 `wx.request` 封装。
- **换图片**：直接替换 `miniprogram/images/recipes/<id>.jpg` 即可，保持文件名不变；或在 `data/recipes.js` 里改 `image` 字段指向新路径。

---

## 六·一、图片说明

食谱配图取自 **Unsplash**（免费可商用），已下载到本地避免外链失效。每张图与菜品语义对应（如鸡胸饭→烤鸡沙拉、三文鱼→香煎三文鱼等）。
后续如需替换为真实拍摄图或定制图，直接覆盖 `miniprogram/images/recipes/` 下的同名文件即可。

---

## 七、设计规范

- 主色 `#4FB6A0`（薄荷绿），背景 `#F7FBF9`，卡片白 + 柔和投影
- 圆角 12–40rpx，卡片式布局，移动端优先
- 交互：卡片按压缩放、进度条宽度过渡、面板上滑弹出、加载旋转
- 营养配色：蛋白 `#6FB7E0` / 碳水 `#F0C36D` / 脂肪 `#E8A08A`（低饱和）
