/**
 * nutrition.js - 智能营养测算核心算法
 *
 * 公式说明（业内通用）：
 * 1) BMR 基础代谢 — Mifflin-St Jeor 公式（公认精度较高）
 *    男：BMR = 10*体重(kg) + 6.25*身高(cm) - 5*年龄 + 5
 *    女：BMR = 10*体重(kg) + 6.25*身高(cm) - 5*年龄 - 161
 * 2) TDEE 每日总消耗 = BMR * 活动系数（依据每周运动次数估算）
 * 3) 推荐摄入热量：依据目标做热量盈余/缺口调整
 *    增肌 +12% ；减脂 -18% ；维持 0%
 * 4) 三大营养素配比（按目标）：
 *    增肌  蛋白 2.0g/kg · 脂肪 25% · 其余碳水
 *    减脂  蛋白 2.2g/kg · 脂肪 25% · 其余碳水
 *    维持  蛋白 1.6g/kg · 脂肪 30% · 其余碳水
 */

const GOAL_LABELS = {
  muscle: '增肌',
  fatloss: '减脂',
  maintain: '日常健康维持'
};

const ACTIVITY_LEVELS = {
  0: { factor: 1.2,   label: '久坐（几乎不运动）' },
  1: { factor: 1.30,  label: '轻度活动（每周1次）' },
  2: { factor: 1.375, label: '轻度活动（每周2次）' },
  3: { factor: 1.465, label: '中度活动（每周3次）' },
  4: { factor: 1.55,  label: '中度活动（每周4次）' },
  5: { factor: 1.635, label: '高度活动（每周5次）' },
  6: { factor: 1.725, label: '高度活动（每周6次）' },
  7: { factor: 1.8,   label: '运动员（每天训练）' }
};

function activityFactor(weeklyExercise) {
  const n = Math.max(0, Math.min(7, Number(weeklyExercise) || 0));
  return (ACTIVITY_LEVELS[n] || ACTIVITY_LEVELS[0]).factor;
}

function activityLabel(weeklyExercise) {
  const n = Math.max(0, Math.min(7, Number(weeklyExercise) || 0));
  return (ACTIVITY_LEVELS[n] || ACTIVITY_LEVELS[0]).label;
}

/**
 * 计算 BMR（Mifflin-St Jeor）
 */
function calcBMR({ gender, height, weight, age }) {
  const base = 10 * Number(weight) + 6.25 * Number(height) - 5 * Number(age);
  return Math.round(gender === 'male' ? base + 5 : base - 161);
}

/**
 * 主入口：根据资料计算完整营养方案
 * @returns {{
 *   bmr:number, tdee:number, targetCalories:number, activityFactor:number,
 *   macros:{protein:number, carb:number, fat:number, proteinCal:number, carbCal:number, fatCal:number},
 *   bmi:number, bmiLabel:string, goal:string, goalLabel:string, water:number
 * }}
 */
function calcNutrition(profile) {
  const p = profile || {};
  const bmr = calcBMR(p);
  const factor = activityFactor(p.weeklyExercise);
  const tdee = Math.round(bmr * factor);

  let target = tdee;
  if (p.goal === 'muscle') target = Math.round(tdee * 1.12);
  else if (p.goal === 'fatloss') target = Math.round(tdee * 0.82);

  // 安全下限：不低于 BMR（避免过度节食）
  target = Math.max(target, bmr);

  const weight = Number(p.weight) || 0;
  let proteinPerKg = 1.6;
  let fatRatio = 0.3;
  if (p.goal === 'muscle') { proteinPerKg = 2.0; fatRatio = 0.25; }
  else if (p.goal === 'fatloss') { proteinPerKg = 2.2; fatRatio = 0.25; }

  const protein = Math.round(weight * proteinPerKg);          // g
  const fat = Math.round((target * fatRatio) / 9);            // 9 kcal/g
  const carbCal = Math.max(0, target - protein * 4 - fat * 9);
  const carb = Math.round(carbCal / 4);                       // 4 kcal/g

  const hM = Number(p.height) / 100;
  const bmi = hM > 0 ? +(weight / (hM * hM)).toFixed(1) : 0;

  return {
    bmr,
    tdee,
    targetCalories: target,
    activityFactor: factor,
    activityLabel: activityLabel(p.weeklyExercise),
    goal: p.goal || 'maintain',
    goalLabel: GOAL_LABELS[p.goal] || GOAL_LABELS.maintain,
    macros: {
      protein,
      carb,
      fat,
      proteinCal: protein * 4,
      carbCal: carb * 4,
      fatCal: fat * 9
    },
    bmi,
    bmiLabel: bmiLabel(bmi),
    water: Math.round(weight * 35) // ml，每公斤 35ml
  };
}

function bmiLabel(bmi) {
  if (!bmi) return '--';
  if (bmi < 18.5) return '偏瘦';
  if (bmi < 24) return '正常';
  if (bmi < 28) return '偏胖';
  return '肥胖';
}

/**
 * 按营养标准生成三餐+加餐的推荐热量分配比例
 * 早餐 25% · 午餐 35% · 晚餐 30% · 加餐 10%
 */
const MEAL_SPLIT = [
  { key: 'breakfast', label: '早餐', ratio: 0.25, icon: '🌅' },
  { key: 'lunch',     label: '午餐', ratio: 0.35, icon: '☀️' },
  { key: 'dinner',    label: '晚餐', ratio: 0.30, icon: '🌙' },
  { key: 'snack',     label: '加餐', ratio: 0.10, icon: '🍎' }
];

function mealSplit(targetCalories) {
  return MEAL_SPLIT.map(m => Object.assign({}, m, {
    calories: Math.round(targetCalories * m.ratio)
  }));
}

module.exports = {
  GOAL_LABELS,
  ACTIVITY_LEVELS,
  MEAL_SPLIT,
  calcBMR,
  calcNutrition,
  bmiLabel,
  activityFactor,
  activityLabel,
  mealSplit
};
