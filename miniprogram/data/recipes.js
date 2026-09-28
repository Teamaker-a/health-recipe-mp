/**
 * recipes.js - 食谱数据库
 *
 * 每条食谱：
 *   id          唯一标识
 *   name        食谱名
 *   scene       muscle(增肌) | fatloss(减脂) | gentle(养生) —— 标记适配场景
 *   meals       breakfast | lunch | dinner | snack
 *   tags        分类标签，用于浏览筛选：quick 快手 / lowfat 低脂减脂 /
 *               highprotein 高蛋白增肌 / mild 清淡养生
 *   cookTime    烹饪时长（分钟）
 *   difficulty  1-3 星
 *   servings    份数（默认 1 人份）
 *   ingredients [{name, amount(克/ml), text(展示用)}]
 *   steps       [字符串]
 *   tip         小贴士
 *
 * 营养值不写死，运行时由 nutrition.js 依据 ingredients 实时计算，
 * 这样食材替换后可即时重算，保证数据一致。
 */

const RECIPES = [
  /* ==================== 早餐 breakfast ==================== */
  {
    id: 'b01',
    name: '燕麦牛奶鸡蛋早餐碗',
    image: '/images/recipes/b01.jpg',
    scene: ['gentle', 'fatloss', 'muscle'],
    meals: 'breakfast',
    tags: ['quick', 'lowfat', 'highprotein'],
    cookTime: 8,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '燕麦片', amount: 40, text: '40g' },
      { name: '低脂牛奶', amount: 200, text: '200ml' },
      { name: '鸡蛋', amount: 50, text: '1个' },
      { name: '蓝莓', amount: 50, text: '50g' },
      { name: '杏仁', amount: 10, text: '约10g' }
    ],
    steps: [
      '鸡蛋冷水下锅，水开煮 6 分钟，捞出过冷水剥壳备用。',
      '燕麦片倒入碗中，加入低脂牛奶，微波炉高火 1 分钟（或小锅小火煮 2 分钟）。',
      '放上剥好的水煮蛋，撒上蓝莓与杏仁即可。',
      '喜欢温热口感可再微波 20 秒。'
    ],
    tip: '燕麦选纯燕麦片（非即食含糖款），饱腹感更强、升糖更平缓。'
  },
  {
    id: 'b02',
    name: '全麦鸡蛋蔬菜三明治',
    image: '/images/recipes/b02.jpg',
    scene: ['fatloss', 'muscle', 'gentle'],
    meals: 'breakfast',
    tags: ['quick', 'highprotein', 'lowfat'],
    cookTime: 10,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '全麦面包', amount: 70, text: '2片' },
      { name: '鸡蛋', amount: 100, text: '2个' },
      { name: '生菜', amount: 30, text: '2片' },
      { name: '番茄', amount: 60, text: '半个' },
      { name: '橄榄油', amount: 3, text: '约半勺' }
    ],
    steps: [
      '平底锅刷一层薄橄榄油，中小火煎两个鸡蛋（可做成少油滑蛋）。',
      '全麦面包放入锅边或空锅烘 1 分钟至微脆。',
      '生菜洗净沥干，番茄切片。',
      '面包铺上生菜、番茄、煎蛋，对折或盖上另一片即可。',
      '对半切开更易入口。'
    ],
    tip: '想更低脂可只用 1 全蛋 + 2 蛋白，蛋白质不减、热量更省。'
  },
  {
    id: 'b03',
    name: '小米南瓜养胃粥',
    image: '/images/recipes/b03.jpg',
    scene: ['gentle'],
    meals: 'breakfast',
    tags: ['mild', 'quick'],
    cookTime: 25,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '小米粥', amount: 300, text: '1碗' },
      { name: '南瓜', amount: 100, text: '100g' },
      { name: '鸡蛋', amount: 50, text: '1个' },
      { name: '菠菜', amount: 40, text: '一小把' }
    ],
    steps: [
      '南瓜去皮切小块，与小米一同下锅加水煮 20 分钟至软烂。',
      '菠菜焯水 30 秒后切段（去草酸）。',
      '鸡蛋打散，粥将好时沿锅边淋入成蛋花，搅匀。',
      '最后放入菠菜，煮 1 分钟即可。'
    ],
    tip: '早起胃口差、肠胃敏感的人非常适合，温和好消化。'
  },
  {
    id: 'b04',
    name: '希腊酸奶水果坚果杯',
    image: '/images/recipes/b04.jpg',
    scene: ['gentle', 'fatloss'],
    meals: 'breakfast',
    tags: ['quick', 'lowfat', 'mild'],
    cookTime: 5,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '无糖希腊酸奶', amount: 200, text: '200g' },
      { name: '香蕉', amount: 100, text: '1根' },
      { name: '蓝莓', amount: 40, text: '40g' },
      { name: '核桃', amount: 10, text: '2颗' },
      { name: '奇亚籽', amount: 8, text: '1小勺' }
    ],
    steps: [
      '希腊酸奶倒入杯中。',
      '香蕉切片，蓝莓洗净。',
      '依次铺上香蕉片、蓝莓、核桃碎，撒上奇亚籽。',
      '想要更冰凉可冷藏 10 分钟再吃。'
    ],
    tip: '零烹饪、高蛋白，赶时间的早晨首选。'
  },

  /* ==================== 午餐 lunch ==================== */
  {
    id: 'l01',
    name: '香煎鸡胸时蔬糙米饭',
    image: '/images/recipes/l01.jpg',
    scene: ['fatloss', 'muscle'],
    meals: 'lunch',
    tags: ['highprotein', 'lowfat'],
    cookTime: 25,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '鸡胸肉', amount: 150, text: '150g' },
      { name: '糙米饭', amount: 150, text: '1小碗' },
      { name: '西兰花', amount: 120, text: '120g' },
      { name: '胡萝卜', amount: 50, text: '半根' },
      { name: '橄榄油', amount: 5, text: '1小勺' },
      { name: '蒜', amount: 5, text: '2瓣' }
    ],
    steps: [
      '鸡胸肉横切成厚片，用少许盐、黑胡椒、蒜末腌制 10 分钟。',
      '西兰花掰小朵、胡萝卜切片，沸水加少许盐焯 2 分钟捞出。',
      '平底锅中火放橄榄油，鸡胸肉每面煎 3-4 分钟至金黄全熟。',
      '同一锅下蒜末快炒时蔬 1 分钟。',
      '糙米饭盛盘，摆上鸡胸与蔬菜即可。'
    ],
    tip: '鸡胸不要煎太久，全熟即出锅，否则会柴。'
  },
  {
    id: 'l02',
    name: '番茄牛肉意面',
    image: '/images/recipes/l02.jpg',
    scene: ['muscle'],
    meals: 'lunch',
    tags: ['highprotein'],
    cookTime: 25,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '意大利面', amount: 100, text: '100g（生重）' },
      { name: '牛肉（瘦）', amount: 120, text: '120g' },
      { name: '番茄', amount: 150, text: '1个' },
      { name: '洋葱', amount: 50, text: '小半个' },
      { name: '橄榄油', amount: 8, text: '1勺' },
      { name: '番茄酱', amount: 20, text: '1勺' }
    ],
    steps: [
      '意面下沸水煮 8-10 分钟至有嚼劲，捞出备用（留一点面汤）。',
      '牛肉切丝，用少许盐、黑胡椒抓匀；番茄、洋葱切丁。',
      '锅中放橄榄油，先炒洋葱出香，再下牛肉快速炒变色盛出。',
      '下番茄丁炒出汁，加番茄酱与 2 勺面汤，小火收浓。',
      '倒回牛肉与意面翻拌均匀，收汁即可。'
    ],
    tip: '牛肉炒到变色即盛出，最后再回锅，避免变老。'
  },
  {
    id: 'l03',
    name: '虾仁滑蛋藜麦饭',
    image: '/images/recipes/l03.jpg',
    scene: ['fatloss', 'gentle'],
    meals: 'lunch',
    tags: ['highprotein', 'lowfat', 'quick'],
    cookTime: 15,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '虾仁', amount: 120, text: '120g' },
      { name: '藜麦饭', amount: 150, text: '1小碗' },
      { name: '鸡蛋', amount: 100, text: '2个' },
      { name: '黄瓜', amount: 80, text: '半根' },
      { name: '橄榄油', amount: 5, text: '1小勺' }
    ],
    steps: [
      '虾仁去虾线，用少许盐、料酒腌 5 分钟。',
      '鸡蛋加少许盐打散；黄瓜切丁。',
      '热锅放油，虾仁炒至变色盛出。',
      '倒入蛋液，半凝固时加入虾仁，快速滑炒成嫩滑蛋块。',
      '藜麦饭盛碗，放上虾仁滑蛋与黄瓜丁即可。'
    ],
    tip: '滑蛋要嫩，火别太大，蛋液八成熟就关火。'
  },
  {
    id: 'l04',
    name: '清蒸龙利鱼豆腐煲',
    image: '/images/recipes/l04.jpg',
    scene: ['gentle', 'fatloss'],
    meals: 'lunch',
    tags: ['mild', 'lowfat', 'highprotein'],
    cookTime: 20,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '龙利鱼', amount: 150, text: '150g' },
      { name: '南豆腐', amount: 150, text: '150g' },
      { name: '菠菜', amount: 60, text: '一小把' },
      { name: '姜', amount: 5, text: '3片' },
      { name: '橄榄油', amount: 3, text: '几滴' }
    ],
    steps: [
      '龙利鱼解冻切块，用姜片、少许盐腌 5 分钟去腥。',
      '豆腐切块铺在盘底，放上鱼块。',
      '水开后上锅蒸 8 分钟。',
      '菠菜焯水后围边，淋几滴橄榄油与少许生抽即可。'
    ],
    tip: '蒸鱼时间以厚度为准，8 分钟左右鱼肉刚熟最嫩。'
  },

  /* ==================== 晚餐 dinner ==================== */
  {
    id: 'd01',
    name: '低脂番茄豆腐鸡胸煲',
    image: '/images/recipes/d01.jpg',
    scene: ['fatloss', 'muscle'],
    meals: 'dinner',
    tags: ['highprotein', 'lowfat'],
    cookTime: 20,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '鸡胸肉', amount: 120, text: '120g' },
      { name: '北豆腐', amount: 100, text: '100g' },
      { name: '番茄', amount: 150, text: '1个' },
      { name: '西兰花', amount: 80, text: '80g' },
      { name: '橄榄油', amount: 5, text: '1小勺' }
    ],
    steps: [
      '鸡胸切小块，用盐、黑胡椒腌 10 分钟；豆腐切块，番茄切块。',
      '少油热锅，鸡胸块煎至表面变白。',
      '下番茄块炒出汁，加半碗热水煮开。',
      '放入豆腐与西兰花，加盖小火焖 6-8 分钟。',
      '收汁到喜欢的浓度，调味出锅。'
    ],
    tip: '番茄的天然酸甜能减少用盐，减脂期更友好。'
  },
  {
    id: 'd02',
    name: '香煎三文鱼芦笋',
    image: '/images/recipes/d02.jpg',
    scene: ['muscle', 'gentle'],
    meals: 'dinner',
    tags: ['highprotein', 'mild'],
    cookTime: 18,
    difficulty: 2,
    servings: 1,
    ingredients: [
      { name: '三文鱼', amount: 130, text: '130g' },
      { name: '芦笋', amount: 100, text: '100g' },
      { name: '紫薯', amount: 120, text: '1个' },
      { name: '橄榄油', amount: 5, text: '1小勺' },
      { name: '柠檬', amount: 20, text: '2片' }
    ],
    steps: [
      '紫薯洗净蒸 15 分钟至软。',
      '三文鱼用盐、黑胡椒腌 5 分钟；芦笋去老根。',
      '平底锅中火放油，三文鱼皮朝下煎 3 分钟，翻面再煎 2 分钟。',
      '用余油把芦笋煎 2 分钟至断生。',
      '装盘挤上柠檬汁，配蒸好的紫薯。'
    ],
    tip: '三文鱼富含 Omega-3，每周吃 2 次对心血管有益。'
  },
  {
    id: 'd03',
    name: '杂粮鸡丝蔬菜拌饭',
    image: '/images/recipes/d03.jpg',
    scene: ['fatloss'],
    meals: 'dinner',
    tags: ['lowfat', 'quick', 'highprotein'],
    cookTime: 15,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '杂粮饭', amount: 120, text: '1小碗' },
      { name: '鸡胸肉', amount: 100, text: '100g' },
      { name: '菠菜', amount: 80, text: '一小把' },
      { name: '胡萝卜', amount: 50, text: '半根' },
      { name: '橄榄油', amount: 3, text: '几滴' }
    ],
    steps: [
      '鸡胸冷水下锅，加姜片煮 10 分钟至熟，晾凉后手撕成丝。',
      '菠菜、胡萝卜丝分别焯水 1 分钟捞出。',
      '杂粮饭盛碗，铺上鸡丝与蔬菜。',
      '淋几滴橄榄油、少许生抽拌匀即可。'
    ],
    tip: '水煮鸡胸手撕更入味，配杂粮饭饱腹又控卡。'
  },
  {
    id: 'd04',
    name: '山药排骨清汤',
    image: '/images/recipes/d04.jpg',
    scene: ['gentle'],
    meals: 'dinner',
    tags: ['mild'],
    cookTime: 40,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '猪里脊', amount: 100, text: '100g' },
      { name: '山药', amount: 120, text: '120g' },
      { name: '胡萝卜', amount: 60, text: '半根' },
      { name: '玉米', amount: 80, text: '半根' },
      { name: '姜', amount: 5, text: '3片' }
    ],
    steps: [
      '里脊切块冷水下锅焯水，撇去浮沫捞出。',
      '山药、胡萝卜去皮切块，玉米切段。',
      '所有材料加姜片、适量清水，大火烧开转小火炖 30 分钟。',
      '出锅前加少许盐调味即可。'
    ],
    tip: '山药健脾、汤清味鲜，适合日常养生与肠胃虚弱者。'
  },

  /* ==================== 加餐 snack ==================== */
  {
    id: 's01',
    name: '水煮蛋 + 圣女果',
    image: '/images/recipes/s01.jpg',
    scene: ['fatloss', 'muscle', 'gentle'],
    meals: 'snack',
    tags: ['quick', 'highprotein', 'lowfat'],
    cookTime: 8,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '鸡蛋', amount: 100, text: '2个' },
      { name: '圣女果', amount: 100, text: '约7颗' }
    ],
    steps: [
      '鸡蛋冷水下锅，水开煮 8 分钟。',
      '捞出过冷水，剥壳。',
      '圣女果洗净，与鸡蛋搭配食用。'
    ],
    tip: '加餐优先补蛋白，避免血糖大起大落。'
  },
  {
    id: 's02',
    name: '无糖酸奶坚果杯',
    image: '/images/recipes/s02.jpg',
    scene: ['gentle', 'fatloss'],
    meals: 'snack',
    tags: ['quick', 'lowfat', 'mild'],
    cookTime: 3,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '无糖希腊酸奶', amount: 150, text: '150g' },
      { name: '杏仁', amount: 10, text: '约10g' },
      { name: '蓝莓', amount: 30, text: '30g' }
    ],
    steps: [
      '酸奶倒入杯中。',
      '撒上杏仁与蓝莓即可。'
    ],
    tip: '坚果控制在一小把，优质脂肪也要算热量。'
  },
  {
    id: 's03',
    name: '香蕉花生酱全麦吐司',
    image: '/images/recipes/s03.jpg',
    scene: ['muscle'],
    meals: 'snack',
    tags: ['quick', 'highprotein'],
    cookTime: 5,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '全麦面包', amount: 35, text: '1片' },
      { name: '香蕉', amount: 100, text: '1根' },
      { name: '花生', amount: 15, text: '1勺花生酱' },
      { name: '低脂牛奶', amount: 200, text: '200ml' }
    ],
    steps: [
      '全麦面包烤至微脆。',
      '抹上一层花生酱。',
      '香蕉切片铺上，搭配一杯牛奶。'
    ],
    tip: '训练后 1 小时内的优质加餐，碳蛋脂均衡。'
  },
  {
    id: 's04',
    name: '苹果胡萝卜条',
    image: '/images/recipes/s04.jpg',
    scene: ['gentle'],
    meals: 'snack',
    tags: ['quick', 'mild', 'lowfat'],
    cookTime: 5,
    difficulty: 1,
    servings: 1,
    ingredients: [
      { name: '苹果', amount: 180, text: '1个' },
      { name: '胡萝卜', amount: 80, text: '1根' }
    ],
    steps: [
      '苹果、胡萝卜洗净。',
      '分别切成条状。',
      '直接食用，清脆爽口。'
    ],
    tip: '低热量高纤维，想吃零食时的健康替代。'
  }
];

module.exports = { RECIPES };
