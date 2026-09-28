/**
 * foods.js - 常见食材营养数据库
 * 每 100g(ml) 可食部分的营养值（热量 kcal / 蛋白 g / 碳水 g / 脂肪 g）
 * 大众食材常用参考值，用于食谱能量计算与食材替换。
 *
 * category 用于替换匹配（同类才可平替）：
 *   staple 主食 | protein 优质蛋白 | veg 蔬菜 | fruit 水果
 *   dairy 乳制品 | nut 坚果油脂 | egg 蛋类 | bean 豆制品
 */

const FOODS = {
  /* ---------------- 主食 (staple) ---------------- */
  '白米饭': { category: 'staple', kcal: 116, protein: 2.6, carb: 25.9, fat: 0.3, unit: 'g' },
  '糙米饭': { category: 'staple', kcal: 112, protein: 2.8, carb: 23.0, fat: 0.9, unit: 'g' },
  '杂粮饭': { category: 'staple', kcal: 110, protein: 3.2, carb: 22.5, fat: 0.9, unit: 'g' },
  '藜麦饭': { category: 'staple', kcal: 120, protein: 4.4, carb: 21.3, fat: 1.9, unit: 'g' },
  '全麦面包': { category: 'staple', kcal: 246, protein: 9.0, carb: 45.0, fat: 3.3, unit: 'g' },
  '燕麦片': { category: 'staple', kcal: 367, protein: 15.0, carb: 61.0, fat: 6.7, unit: 'g' },
  '玉米': { category: 'staple', kcal: 112, protein: 4.0, carb: 22.8, fat: 1.2, unit: 'g' },
  '红薯': { category: 'staple', kcal: 99, protein: 1.1, carb: 24.7, fat: 0.2, unit: 'g' },
  '紫薯': { category: 'staple', kcal: 106, protein: 1.6, carb: 24.0, fat: 0.2, unit: 'g' },
  '土豆': { category: 'staple', kcal: 81, protein: 2.6, carb: 17.8, fat: 0.2, unit: 'g' },
  '荞麦面': { category: 'staple', kcal: 110, protein: 4.1, carb: 21.4, fat: 0.7, unit: 'g' },
  '意大利面': { category: 'staple', kcal: 158, protein: 5.8, carb: 30.9, fat: 0.9, unit: 'g' },
  '小米粥': { category: 'staple', kcal: 46, protein: 1.4, carb: 8.4, fat: 0.7, unit: 'g' },
  '山药': { category: 'staple', kcal: 57, protein: 1.9, carb: 12.4, fat: 0.2, unit: 'g' },
  '南瓜': { category: 'staple', kcal: 23, protein: 0.7, carb: 5.3, fat: 0.1, unit: 'g' },

  /* ---------------- 优质蛋白 (protein) ---------------- */
  '鸡胸肉': { category: 'protein', kcal: 133, protein: 19.4, carb: 2.5, fat: 5.0, unit: 'g' },
  '鸡腿肉（去皮）': { category: 'protein', kcal: 145, protein: 19.0, carb: 0, fat: 7.5, unit: 'g' },
  '牛肉（瘦）': { category: 'protein', kcal: 106, protein: 20.2, carb: 1.2, fat: 2.3, unit: 'g' },
  '猪里脊': { category: 'protein', kcal: 155, protein: 20.2, carb: 1.5, fat: 7.9, unit: 'g' },
  '三文鱼': { category: 'protein', kcal: 139, protein: 17.2, carb: 0, fat: 7.8, unit: 'g' },
  '鳕鱼': { category: 'protein', kcal: 88, protein: 20.4, carb: 0, fat: 0.5, unit: 'g' },
  '虾仁': { category: 'protein', kcal: 87, protein: 16.4, carb: 2.4, fat: 1.0, unit: 'g' },
  '龙利鱼': { category: 'protein', kcal: 83, protein: 17.7, carb: 0.5, fat: 1.2, unit: 'g' },
  '金枪鱼（水浸）': { category: 'protein', kcal: 116, protein: 25.0, carb: 0, fat: 1.0, unit: 'g' },
  '瘦羊肉': { category: 'protein', kcal: 118, protein: 20.5, carb: 0.2, fat: 3.9, unit: 'g' },

  /* ---------------- 蛋类 (egg) ---------------- */
  '鸡蛋': { category: 'egg', kcal: 144, protein: 13.3, carb: 2.8, fat: 8.8, unit: 'g' },
  '蛋白': { category: 'egg', kcal: 52, protein: 11.6, carb: 3.1, fat: 0.1, unit: 'g' },
  '鹌鹑蛋': { category: 'egg', kcal: 160, protein: 12.8, carb: 2.1, fat: 11.1, unit: 'g' },

  /* ---------------- 豆制品 (bean) ---------------- */
  '北豆腐': { category: 'bean', kcal: 116, protein: 12.2, carb: 3.8, fat: 6.0, unit: 'g' },
  '南豆腐': { category: 'bean', kcal: 76, protein: 8.1, carb: 3.3, fat: 3.7, unit: 'g' },
  '无糖豆浆': { category: 'bean', kcal: 31, protein: 3.0, carb: 1.2, fat: 1.6, unit: 'ml' },
  '毛豆': { category: 'bean', kcal: 131, protein: 13.1, carb: 10.5, fat: 5.0, unit: 'g' },
  '鹰嘴豆': { category: 'bean', kcal: 164, protein: 8.9, carb: 27.4, fat: 2.6, unit: 'g' },

  /* ---------------- 乳制品 (dairy) ---------------- */
  '无糖希腊酸奶': { category: 'dairy', kcal: 59, protein: 10.0, carb: 3.6, fat: 0.4, unit: 'g' },
  '低脂牛奶': { category: 'dairy', kcal: 42, protein: 3.4, carb: 5.0, fat: 1.0, unit: 'ml' },
  '脱脂牛奶': { category: 'dairy', kcal: 34, protein: 3.4, carb: 5.0, fat: 0.1, unit: 'ml' },
  '低脂奶酪': { category: 'dairy', kcal: 240, protein: 28.0, carb: 3.0, fat: 12.0, unit: 'g' },

  /* ---------------- 蔬菜 (veg) ---------------- */
  '西兰花': { category: 'veg', kcal: 34, protein: 2.8, carb: 6.6, fat: 0.4, unit: 'g' },
  '菠菜': { category: 'veg', kcal: 23, protein: 2.9, carb: 3.6, fat: 0.3, unit: 'g' },
  '生菜': { category: 'veg', kcal: 15, protein: 1.4, carb: 2.9, fat: 0.2, unit: 'g' },
  '番茄': { category: 'veg', kcal: 18, protein: 0.9, carb: 3.9, fat: 0.2, unit: 'g' },
  '黄瓜': { category: 'veg', kcal: 15, protein: 0.7, carb: 3.6, fat: 0.1, unit: 'g' },
  '胡萝卜': { category: 'veg', kcal: 41, protein: 0.9, carb: 9.6, fat: 0.2, unit: 'g' },
  '芦笋': { category: 'veg', kcal: 20, protein: 2.2, carb: 3.9, fat: 0.1, unit: 'g' },
  '彩椒': { category: 'veg', kcal: 26, protein: 1.0, carb: 6.0, fat: 0.2, unit: 'g' },
  '蘑菇': { category: 'veg', kcal: 22, protein: 3.1, carb: 3.3, fat: 0.3, unit: 'g' },

  /* ---------------- 水果 (fruit) ---------------- */
  '苹果': { category: 'fruit', kcal: 52, protein: 0.3, carb: 13.8, fat: 0.2, unit: 'g' },
  '香蕉': { category: 'fruit', kcal: 89, protein: 1.1, carb: 22.8, fat: 0.3, unit: 'g' },
  '蓝莓': { category: 'fruit', kcal: 57, protein: 0.7, carb: 14.5, fat: 0.3, unit: 'g' },
  '猕猴桃': { category: 'fruit', kcal: 61, protein: 1.1, carb: 14.7, fat: 0.5, unit: 'g' },
  '橙子': { category: 'fruit', kcal: 47, protein: 0.9, carb: 11.8, fat: 0.1, unit: 'g' },
  '牛油果': { category: 'fruit', kcal: 160, protein: 2.0, carb: 8.5, fat: 14.7, unit: 'g' },
  '圣女果': { category: 'fruit', kcal: 18, protein: 0.9, carb: 3.9, fat: 0.2, unit: 'g' },

  /* ---------------- 坚果油脂 (nut) ---------------- */
  '杏仁': { category: 'nut', kcal: 579, protein: 21.2, carb: 21.7, fat: 49.9, unit: 'g' },
  '核桃': { category: 'nut', kcal: 654, protein: 15.2, carb: 13.7, fat: 65.2, unit: 'g' },
  '花生': { category: 'nut', kcal: 567, protein: 25.8, carb: 16.1, fat: 49.2, unit: 'g' },
  '腰果': { category: 'nut', kcal: 553, protein: 18.2, carb: 30.2, fat: 43.9, unit: 'g' },
  '橄榄油': { category: 'nut', kcal: 884, protein: 0, carb: 0, fat: 100, unit: 'ml' },
  '奇亚籽': { category: 'nut', kcal: 486, protein: 16.5, carb: 42.1, fat: 30.7, unit: 'g' },
  '花生酱': { category: 'nut', kcal: 588, protein: 25.0, carb: 20.0, fat: 50.0, unit: 'g' },

  /* ---------------- 调味 / 其他 ---------------- */
  '蒜': { category: 'seasoning', kcal: 128, protein: 4.5, carb: 27.6, fat: 0.2, unit: 'g' },
  '姜': { category: 'seasoning', kcal: 46, protein: 1.3, carb: 10.3, fat: 0.6, unit: 'g' },
  '洋葱': { category: 'veg', kcal: 40, protein: 1.1, carb: 9.0, fat: 0.2, unit: 'g' },
  '番茄酱': { category: 'seasoning', kcal: 81, protein: 1.5, carb: 18.0, fat: 0.2, unit: 'g' },
  '柠檬': { category: 'fruit', kcal: 37, protein: 1.1, carb: 6.2, fat: 1.2, unit: 'g' }
};

/** 单位换算：部分食材用「个/只」等自然单位，折算成克 */
const UNIT_GRAM = {
  '鸡蛋': 50, '蛋白': 33, '鹌鹑蛋': 10, '香蕉': 100, '苹果': 180, '橙子': 150,
  '猕猴桃': 80, '牛油果': 150, '番茄': 150, '圣女果': 15
};

/** 食材别名 → 标准名（用于识别用户输入） */
const ALIASES = {
  '米饭': '白米饭', '大米饭': '白米饭', '糙米': '糙米饭', '藜麦': '藜麦饭',
  '面包': '全麦面包', '燕麦': '燕麦片', '鸡胸': '鸡胸肉', '鸡腿': '鸡腿肉（去皮）',
  '牛肉': '牛肉（瘦）', '酸奶': '无糖希腊酸奶', '牛奶': '低脂牛奶',
  '豆浆': '无糖豆浆', '豆腐': '北豆腐', '金枪鱼': '金枪鱼（水浸）'
};

function resolveName(name) {
  if (!name) return '';
  const n = String(name).trim();
  if (FOODS[n]) return n;
  if (ALIASES[n]) return ALIASES[n];
  return n;
}

function getFood(name) {
  const n = resolveName(name);
  return FOODS[n] || null;
}

/** 计算指定重量(克/ml)的营养值 */
function nutritionOf(name, grams) {
  const f = getFood(name);
  if (!f) return { kcal: 0, protein: 0, carb: 0, fat: 0 };
  const k = (Number(grams) || 0) / 100;
  return {
    kcal: +(f.kcal * k).toFixed(1),
    protein: +(f.protein * k).toFixed(1),
    carb: +(f.carb * k).toFixed(1),
    fat: +(f.fat * k).toFixed(1)
  };
}

/** 列出某个分类下的所有食材名 */
function byCategory(category) {
  return Object.keys(FOODS).filter(k => FOODS[k].category === category);
}

module.exports = {
  FOODS,
  UNIT_GRAM,
  ALIASES,
  resolveName,
  getFood,
  nutritionOf,
  byCategory
};
