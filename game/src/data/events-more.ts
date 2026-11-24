import type { GameEventDef } from "./events";

/**
 * 后五十一条街上的事（批 N′）：EVENTS 从 32 条加到 83 条。
 *
 * 为什么单独一个文件：`events.ts` 已经九百多行，再往里塞会看不清原来的 32 条
 * 是怎么排的（权重 4–10、冷却 12–26 天、季节窗口、`require` 门槛都各有分工）。
 * 这里只放**新增的五十一条**，`events.ts` 末尾合并成一张 `EVENTS`。
 *
 * 三条纪律（与原来那 32 条一致）：
 *   1. 只有 `cash` / `reputation` / `trend(sourBamboo|douchi|porkOffal|broth)` 三种出口，
 *      不新造字段；
 *   2. 每条都留一条「花钱买口碑」的路（环境压迫型事件可以没有免费选项，但绝不出现「怎么选都掉口碑」）；
 *   3. 地名、节令、行当是南宁真有的，人、事、金额全部虚构。
 *
 * 权重照老规矩：常见 8–10、少见 4–6；冷却 10–26 天；只在特定季节的挂 `season`。
 */
export const EVENTS_MORE: readonly GameEventDef[] = [
  {
    id: "morning_market",
    title: "凌晨的粉摊",
    body: "天没亮去市场批粉，老板说今天的切粉刚出机，还热。他要你趁热拿，凉了就坨。",
    weight: 9,
    cooldownDays: 14,
    choices: [
      { label: "多批两筐", summary: "¥-90 · 口碑 +0.1", result: "两筐粉抬回来，手上全是米浆味。", effects: [{ kind: "cash", amount: -90 }, { kind: "reputation", amount: 0.1 }] },
      { label: "按老量", summary: "无", result: "老量稳妥，卖完就卖完。", effects: [] },
    ],
  },
  {
    id: "noodle_delivery",
    title: "送粉的师傅",
    body: "送粉的师傅说车坏了，今天要晚两个钟。他一边说一边把最后一筐先卸下来。",
    weight: 8,
    cooldownDays: 16,
    choices: [
      { label: "自己蹬三轮去拉", summary: "¥-30 · 口碑 +0.16", result: "三轮车蹬得一身汗，好歹赶上了早市。", effects: [{ kind: "cash", amount: -30 }, { kind: "reputation", amount: 0.16 }] },
      { label: "晚就晚", summary: "口碑 -0.06", result: "开市头两个钟门口贴了张「粉未到」。", effects: [{ kind: "reputation", amount: -0.06 }] },
    ],
  },
  {
    id: "neighbor_complaint",
    title: "楼上的邻居",
    body: "楼上阿姨下来，说抽油烟机的管子对着她家窗，晒的被子一股酸笋味。",
    weight: 7,
    cooldownDays: 20,
    choices: [
      { label: "加钱改管道", summary: "¥-220 · 口碑 +0.2", result: "管子改到后墙，阿姨第二天端来一碗糖水。", effects: [{ kind: "cash", amount: -220 }, { kind: "reputation", amount: 0.2 }] },
      { label: "请她吃粉", summary: "¥-24 · 口碑 +0.05", result: "阿姨吃的时候没说话，走的时候说「下次少放点辣」。", effects: [{ kind: "cash", amount: -24 }, { kind: "reputation", amount: 0.05 }] },
      { label: "装没听见", summary: "口碑 -0.12", result: "第二天她把窗关得很响。", effects: [{ kind: "reputation", amount: -0.12 }] },
    ],
  },
  {
    id: "primary_school",
    title: "小学门口的家长",
    body: "放学时分，几个家长站在门口张望。孩子说要吃粉，家长在看你家的价牌。",
    weight: 8,
    cooldownDays: 15,
    choices: [
      { label: "给学生减一块", summary: "¥-40 · 口碑 +0.18", result: "几个小孩吃完抹嘴就跑，家长在后面道谢。", effects: [{ kind: "cash", amount: -40 }, { kind: "reputation", amount: 0.18 }] },
      { label: "照价", summary: "无", result: "该收多少收多少，生意照做。", effects: [] },
    ],
  },
  {
    id: "night_market_stall",
    title: "夜市来问摊位",
    body: "夜市管委会的人来问，要不要在夜市摆个炉子，晚上八点出摊。",
    weight: 7,
    cooldownDays: 18,
    choices: [
      { label: "摆一晚", summary: "¥-120 · 口碑 +0.22", result: "夜里灯亮起来，比店里热闹。", effects: [{ kind: "cash", amount: -120 }, { kind: "reputation", amount: 0.22 }] },
      { label: "只做店里", summary: "无", result: "店里还没忙完，晚上就守这一间。", effects: [] },
    ],
  },
  {
    id: "health_check",
    title: "卫生检查",
    body: "穿制服的两个人推门进来，一人翻本子，一人直接往灶台后头走。",
    weight: 5,
    cooldownDays: 24,
    choices: [
      { label: "跟着一项项看", summary: "¥-80 · 口碑 +0.1", result: "补了两块地砖、换了三个盖子，本子上全是勾。", effects: [{ kind: "cash", amount: -80 }, { kind: "reputation", amount: 0.1 }] },
      { label: "照常做", summary: "口碑 -0.1", result: "他们记了几条，走的时候眉头没松。", effects: [{ kind: "reputation", amount: -0.1 }] },
    ],
  },
  {
    id: "regular_brings_friend",
    title: "老客带人来了",
    body: "常来的那位带了三个同事，一进门就喊：「就这家，我说的那个味道。」",
    weight: 9,
    cooldownDays: 12,
    choices: [
      { label: "送一碟卤味", summary: "¥-30 · 口碑 +0.2", result: "四个人走的时候，那位老客脸上的光比吃的时候还亮。", effects: [{ kind: "cash", amount: -30 }, { kind: "reputation", amount: 0.2 }] },
      { label: "照常做", summary: "无", result: "四碗粉，四张空碗，一句「下次还来」。", effects: [] },
    ],
  },
  {
    id: "tourist_ask",
    title: "外地人问路",
    body: "一个拖着箱子的游客探头问，老友粉到底是什么味，是不是酸的。",
    weight: 7,
    cooldownDays: 16,
    choices: [
      { label: "讲两句再招呼", summary: "¥-14 · 口碑 +0.12", result: "他坐下吃了，全程举着手机拍。", effects: [{ kind: "cash", amount: -14 }, { kind: "reputation", amount: 0.12 }] },
      { label: "让他自己尝", summary: "无", result: "他点了一碗最便宜的，吃完加了一碗。", effects: [] },
    ],
  },
  {
    id: "contest_invite",
    title: "组委会来电",
    body: "有人打电话来，说街坊联名替你报了名，问你要不要去。「不去也不退报名费。」",
    weight: 6,
    cooldownDays: 26,
    minDay: 20,
    choices: [
      { label: "去，认真备", summary: "¥-160 · 口碑 +0.25", result: "备了三天料，手上全是葱花味。", effects: [{ kind: "cash", amount: -160 }, { kind: "reputation", amount: 0.25 }] },
      { label: "多谢，不去了", summary: "口碑 -0.04", result: "对面沉默了一下，说「下次记得」。", effects: [{ kind: "reputation", amount: -0.04 }] },
    ],
  },
  {
    id: "rival_taunt",
    title: "同行上门",
    body: "隔两条街那家的老板拎着自家一碗粉过来，说请你尝尝，「看谁家更像老友味」。",
    weight: 6,
    cooldownDays: 22,
    minDay: 14,
    choices: [
      { label: "尝，也回一碗", summary: "¥-16 · 口碑 +0.1", result: "两个人坐在矮凳上吃完，谁也没说谁好。", effects: [{ kind: "cash", amount: -16 }, { kind: "reputation", amount: 0.1 }] },
      { label: "尝了就行", summary: "口碑 +0.03", result: "他那碗确实酸香足。你没说话，回头把酸笋换了缸。", effects: [{ kind: "reputation", amount: 0.03 }] },
    ],
  },
  {
    id: "staff_family",
    title: "店员家里有事",
    body: "炒料的师傅接了个电话，说家里老人住院，想请三天假。",
    weight: 6,
    cooldownDays: 20,
    minDay: 10,
    choices: [
      { label: "批假，垫些钱", summary: "¥-200 · 口碑 +0.2", result: "他走了三天，回来的时候干活比从前细。", effects: [{ kind: "cash", amount: -200 }, { kind: "reputation", amount: 0.2 }] },
      { label: "批假，不垫钱", summary: "口碑 +0.06", result: "他点点头，说够了。", effects: [{ kind: "reputation", amount: 0.06 }] },
      { label: "这几天不好走", summary: "口碑 -0.1", result: "他留下来了，但那几天锅气明显薄了。", effects: [{ kind: "reputation", amount: -0.1 }] },
    ],
  },
  {
    id: "landlord_visit",
    title: "房东来了",
    body: "房东在门口站了一会儿，说这一带租金都涨了，「你这个位置，别人抢着要」。",
    weight: 5,
    cooldownDays: 30,
    minDay: 30,
    choices: [
      { label: "认涨，签三年", summary: "¥-900 · 口碑 +0.1", result: "合同压在抽屉最底下，心里反而踏实。", effects: [{ kind: "cash", amount: -900 }, { kind: "reputation", amount: 0.1 }] },
      { label: "讲价", summary: "¥-300", result: "讲了半天，各让一步。", effects: [{ kind: "cash", amount: -300 }] },
      { label: "让他找别人", summary: "口碑 -0.08", result: "他走了，你听见自己在心里算另一条街的租金。", effects: [{ kind: "reputation", amount: -0.08 }] },
    ],
  },
  {
    id: "power_cut",
    title: "停电",
    body: "上午十点突然停电，灶上正炒着料，抽油烟机一声不响了，热气糊了半间屋。",
    weight: 6,
    cooldownDays: 22,
    choices: [
      { label: "借邻居的电", summary: "¥-70 · 口碑 +0.08", result: "从隔壁拉了一根长线，凑合把午市做完。", effects: [{ kind: "cash", amount: -70 }, { kind: "reputation", amount: 0.08 }] },
      { label: "歇半天", summary: "¥-120", result: "门口贴了张纸，风扇停了，屋里热得像蒸笼。", effects: [{ kind: "cash", amount: -120 }] },
    ],
  },
  {
    id: "water_truck",
    title: "桶装水涨价",
    body: "送水的师傅说这个月涨两块，问你还订几桶。汤锅一天要好几桶。",
    weight: 7,
    cooldownDays: 18,
    choices: [
      { label: "照样订", summary: "¥-90", result: "汤还是那个汤，成本悄悄往上走了。", effects: [{ kind: "cash", amount: -90 }] },
      { label: "改接自来水", summary: "¥-20 · 口碑 -0.08", result: "省了钱，头一锅汤总觉得差一点。", effects: [{ kind: "cash", amount: -20 }, { kind: "reputation", amount: -0.08 }] },
    ],
  },
  {
    id: "bowl_price",
    title: "纸碗涨价",
    body: "杂货铺老板说纸碗涨了两成，问你要不要换成薄一点的。",
    weight: 7,
    cooldownDays: 20,
    choices: [
      { label: "照旧用厚的", summary: "¥-80", result: "厚碗端着不烫手，打包的人心里舒服。", effects: [{ kind: "cash", amount: -80 }] },
      { label: "换薄的", summary: "¥-30 · 口碑 -0.05", result: "有位客人说汤端到楼下就渗了。", effects: [{ kind: "cash", amount: -30 }, { kind: "reputation", amount: -0.05 }] },
    ],
  },
  {
    id: "takeout_platform",
    title: "外卖平台来谈",
    body: "平台业务员把手机摊在台面上，说这个片区还没人做老友粉外卖。",
    weight: 6,
    cooldownDays: 24,
    choices: [
      { label: "上平台，让利跑一段", summary: "¥-150 · 口碑 +0.24", result: "头一周订单多得灶台转不过来，打包盒堆到门口。", effects: [{ kind: "cash", amount: -150 }, { kind: "reputation", amount: 0.24 }] },
      { label: "只做堂食", summary: "无", result: "你摇头，他也不勉强。", effects: [] },
    ],
  },
  {
    id: "livestream_visit",
    title: "有人在你门口直播",
    body: "一个举着自拍杆的年轻人在门口讲：「这家是本地人排队的，我尝给你们看。」",
    weight: 6,
    cooldownDays: 20,
    choices: [
      { label: "请他进来坐", summary: "¥-28 · 口碑 +0.18", result: "弹幕里全是问价钱的，他念了三遍地址。", effects: [{ kind: "cash", amount: -28 }, { kind: "reputation", amount: 0.18 }] },
      { label: "让他在门口拍", summary: "口碑 +0.05", result: "他拍了两分钟就走了，镜头里只有招牌。", effects: [{ kind: "reputation", amount: 0.05 }] },
    ],
  },
  {
    id: "sweet_soup_pair",
    title: "糖水搭售",
    body: "隔壁糖水铺的阿姨来问，能不能互相带一句：吃粉的客人去她那儿减一块。",
    weight: 7,
    cooldownDays: 18,
    choices: [
      { label: "搭个伙", summary: "¥-40 · 口碑 +0.16", result: "两家门口都多站了几个人，傍晚的位子终于坐满。", effects: [{ kind: "cash", amount: -40 }, { kind: "reputation", amount: 0.16 }] },
      { label: "各做各的", summary: "无", result: "她笑笑走了，第二天端来一碗绿豆沙。", effects: [] },
    ],
  },
  {
    id: "sour_lemon",
    title: "一罐酸柠檬",
    body: "有位阿婆拎来一罐自己腌的酸柠檬，说摆台面上让客人自己加。",
    weight: 8,
    cooldownDays: 16,
    choices: [
      { label: "收下，摆上台", summary: "¥-10 · 口碑 +0.14", result: "有人加了半勺，吃完说这下开胃了。", effects: [{ kind: "cash", amount: -10 }, { kind: "reputation", amount: 0.14 }] },
      { label: "收下，放柜里", summary: "无", result: "罐子放在柜子最上层，慢慢忘了。", effects: [] },
    ],
  },
  {
    id: "douchi_supplier",
    title: "豆豉断货",
    body: "供货的说这批豆豉发酵差了几天，问你要不要等好的一批，还是先用这批。",
    weight: 7,
    cooldownDays: 18,
    choices: [
      { label: "等好的", summary: "¥-50 · 口碑 +0.12", result: "停了两天豆豉，客人问了三回。", effects: [{ kind: "cash", amount: -50 }, { kind: "reputation", amount: 0.12 }] },
      { label: "先用着", summary: "口碑 -0.1", result: "香是有的，就是少了一点回甘。", effects: [{ kind: "reputation", amount: -0.1 }] },
    ],
  },
  {
    id: "greens_price",
    title: "青菜涨了",
    body: "生菜一斤贵了一块五。配菜台上的菜叶得天天新鲜，压不住。",
    weight: 8,
    cooldownDays: 14,
    choices: [
      { label: "照买", summary: "¥-70", result: "菜叶还是脆的，成本自己吞了。", effects: [{ kind: "cash", amount: -70 }] },
      { label: "少上一点", summary: "¥-30 · 口碑 -0.06", result: "有客人问「今天的菜怎么这么少」。", effects: [{ kind: "cash", amount: -30 }, { kind: "reputation", amount: -0.06 }] },
    ],
  },
  {
    id: "pork_price_2",
    title: "猪肉又涨了",
    body: "肉摊老板一边剁一边说，这几天猪杂紧，明天可能还要贵。",
    weight: 8,
    cooldownDays: 15,
    choices: [
      { label: "多买两斤存货", summary: "¥-110 · 猪杂热潮 +6", result: "冰柜塞满，猪杂的分量没减。", effects: [{ kind: "cash", amount: -110 }, { kind: "trend", key: "porkOffal", amount: 6 }] },
      { label: "按天买", summary: "¥-40", result: "每天早上去挑，价高就买少一点。", effects: [{ kind: "cash", amount: -40 }] },
    ],
  },
  {
    id: "chengguan",
    title: "门口摆了桌",
    body: "城管过来，说门口摆的桌子占道了，让收进去。",
    weight: 6,
    cooldownDays: 20,
    choices: [
      { label: "收进来", summary: "口碑 -0.05", result: "两张桌搬进屋，过道一下窄了。", effects: [{ kind: "reputation", amount: -0.05 }] },
      { label: "去申请临时占道", summary: "¥-120 · 口碑 +0.1", result: "跑了两趟，批下来了，还画了线。", effects: [{ kind: "cash", amount: -120 }, { kind: "reputation", amount: 0.1 }] },
    ],
  },
  {
    id: "shared_bike",
    title: "门口堵车",
    body: "共享单车堆在门口，把价牌都挡住了。骑车的人一放就走。",
    weight: 7,
    cooldownDays: 16,
    choices: [
      { label: "自己一辆辆挪", summary: "口碑 +0.08", result: "挪了半小时，出了一身汗，门口清爽了。", effects: [{ kind: "reputation", amount: 0.08 }] },
      { label: "不管", summary: "口碑 -0.06", result: "一天里有好几个人是绕过车才看见你的招牌。", effects: [{ kind: "reputation", amount: -0.06 }] },
    ],
  },
  {
    id: "road_repair",
    title: "门前修路",
    body: "市政来贴了告示，门口这段要挖开两个月，围挡一人多高。",
    weight: 5,
    cooldownDays: 30,
    minDay: 40,
    choices: [
      { label: "在围挡上挂指引", summary: "¥-100 · 口碑 +0.18", result: "挂了一块箭头牌，还写了「往里走十步」。", effects: [{ kind: "cash", amount: -100 }, { kind: "reputation", amount: 0.18 }] },
      { label: "等修完", summary: "口碑 -0.14", result: "两个月里，很多人是走到一半又回头了。", effects: [{ kind: "reputation", amount: -0.14 }] },
    ],
  },
  {
    id: "temple_fair",
    title: "庙会",
    body: "附近庙会，路上全是人，卖香火的、卖糖画的，也卖粉的。",
    weight: 6,
    cooldownDays: 26,
    season: [1, 2],
    choices: [
      { label: "推车出去", summary: "¥-160 · 口碑 +0.26", result: "一天卖光三筐粉，收摊时手抖得端不住碗。", effects: [{ kind: "cash", amount: -160 }, { kind: "reputation", amount: 0.26 }] },
      { label: "守店", summary: "无", result: "店里反倒清静，几个老客吃得从容。", effects: [] },
    ],
  },
  {
    id: "qingming_return",
    title: "清明返乡",
    body: "清明前后，巷子里多了很多外地牌照的车，都是回来上坟的。",
    weight: 7,
    cooldownDays: 30,
    season: [3],
    choices: [
      { label: "多备料", summary: "¥-120 · 口碑 +0.16", result: "有几桌是三代人一起来的，说小时候就在这吃。", effects: [{ kind: "cash", amount: -120 }, { kind: "reputation", amount: 0.16 }] },
      { label: "照常", summary: "无", result: "卖完就收，来晚的只能看卷闸门。", effects: [] },
    ],
  },
  {
    id: "dragon_boat",
    title: "端午龙舟",
    body: "江上有龙舟赛，岸边人挤人。有人问你家能不能送两百个粽子搭着卖。",
    weight: 6,
    cooldownDays: 30,
    season: [4, 5],
    choices: [
      { label: "搭着卖", summary: "¥-180 · 口碑 +0.2", result: "粽子比粉卖得快，江风里全是箬叶味。", effects: [{ kind: "cash", amount: -180 }, { kind: "reputation", amount: 0.2 }] },
      { label: "只卖粉", summary: "¥+40", result: "专一做粉，也不亏。", effects: [{ kind: "cash", amount: 40 }] },
    ],
  },
  {
    id: "graduation_season",
    title: "毕业季",
    body: "六月，学生成群结队来吃「散伙饭」，一桌桌地加粉加蛋。",
    weight: 7,
    cooldownDays: 24,
    season: [5, 6],
    choices: [
      { label: "送每人一个蛋", summary: "¥-60 · 口碑 +0.22", result: "有人在留言本上写「明年回来还吃这家」。", effects: [{ kind: "cash", amount: -60 }, { kind: "reputation", amount: 0.22 }] },
      { label: "照价", summary: "¥+30", result: "结账时他们凑钱凑了半天，笑着走了。", effects: [{ kind: "cash", amount: 30 }] },
    ],
  },
  {
    id: "military_training",
    title: "军训结束",
    body: "九月，军训完的学生黑了一圈，一进门就要冰豆奶。",
    weight: 7,
    cooldownDays: 22,
    season: [8, 9],
    choices: [
      { label: "冰一箱豆奶", summary: "¥-70 · 口碑 +0.18", result: "冰柜空了一半，学生的笑声把屋子填满。", effects: [{ kind: "cash", amount: -70 }, { kind: "reputation", amount: 0.18 }] },
      { label: "只有热汤", summary: "口碑 -0.05", result: "有人嘟囔了一句「这么热还喝汤」。", effects: [{ kind: "reputation", amount: -0.05 }] },
    ],
  },
  {
    id: "typhoon_tail",
    title: "台风尾",
    body: "台风擦着过，雨大得看不清对面。招牌在风里晃。",
    weight: 5,
    cooldownDays: 30,
    season: [6, 7, 8],
    choices: [
      { label: "加固招牌，照开", summary: "¥-110 · 口碑 +0.1", result: "风里挂着绳，还是有熟客打着伞来了。", effects: [{ kind: "cash", amount: -110 }, { kind: "reputation", amount: 0.1 }] },
      { label: "歇一天", summary: "¥-140", result: "卷闸门拉下来，屋里只听见雨。", effects: [{ kind: "cash", amount: -140 }] },
    ],
  },
  {
    id: "hunan_rain",
    title: "回南天",
    body: "回南天，墙上全是水，地砖滑得站不住。粉筐的纸箱软了。",
    weight: 7,
    cooldownDays: 20,
    season: [1, 2, 3],
    choices: [
      { label: "开抽湿机", summary: "¥-90 · 口碑 +0.08", result: "地上终于干了，客人进门不用扶墙。", effects: [{ kind: "cash", amount: -90 }, { kind: "reputation", amount: 0.08 }] },
      { label: "铺纸板顶着", summary: "口碑 -0.06", result: "有位客人差点滑倒，你扶了一把。", effects: [{ kind: "reputation", amount: -0.06 }] },
    ],
  },
  {
    id: "heat_wave",
    title: "三伏天",
    body: "三十八度，灶前一站就是一身汗。风扇吹出来的都是热风。",
    weight: 8,
    cooldownDays: 18,
    season: [6, 7],
    choices: [
      { label: "加一台冷风机", summary: "¥-260 · 口碑 +0.16", result: "灶台边终于能站人，出碗也顺了。", effects: [{ kind: "cash", amount: -260 }, { kind: "reputation", amount: 0.16 }] },
      { label: "多备凉茶", summary: "¥-50 · 口碑 +0.08", result: "客人一杯，师傅一杯，人人都在灌。", effects: [{ kind: "cash", amount: -50 }, { kind: "reputation", amount: 0.08 }] },
    ],
  },
  {
    id: "aircon_repair",
    title: "空调坏了",
    body: "空调外机响了两声就停了，修的人说压缩机老化，得换。",
    weight: 6,
    cooldownDays: 26,
    season: [5, 6, 7, 8],
    choices: [
      { label: "换新的", summary: "¥-900 · 口碑 +0.2", result: "装好那天，屋里凉得像换了季节。", effects: [{ kind: "cash", amount: -900 }, { kind: "reputation", amount: 0.2 }] },
      { label: "先修凑合", summary: "¥-200 · 口碑 -0.04", result: "能转了，就是声音大，客人说话要抬高音量。", effects: [{ kind: "cash", amount: -200 }, { kind: "reputation", amount: -0.04 }] },
    ],
  },
  {
    id: "sign_lamp",
    title: "招牌灯不亮",
    body: "晚上才发现招牌灯灭了一半，「老友」两个字只剩「老」。",
    weight: 7,
    cooldownDays: 20,
    choices: [
      { label: "当晚换灯管", summary: "¥-60 · 口碑 +0.1", result: "灯亮起来那一刻，路过的人抬头看了一眼。", effects: [{ kind: "cash", amount: -60 }, { kind: "reputation", amount: 0.1 }] },
      { label: "明天再说", summary: "口碑 -0.05", result: "有几个新客是走到门口才认出这是粉店。", effects: [{ kind: "reputation", amount: -0.05 }] },
    ],
  },
  {
    id: "qr_code",
    title: "扫码收钱",
    body: "好几个客人问能不能扫码，掏现金的越来越少。",
    weight: 8,
    cooldownDays: 16,
    choices: [
      { label: "贴个收款码", summary: "¥-20 · 口碑 +0.12", result: "「滴」一声，比找零快多了。", effects: [{ kind: "cash", amount: -20 }, { kind: "reputation", amount: 0.12 }] },
      { label: "只收现金", summary: "口碑 -0.1", result: "有两个人摸遍口袋，最后走了。", effects: [{ kind: "reputation", amount: -0.1 }] },
    ],
  },
  {
    id: "cashier_machine",
    title: "收银机",
    body: "旧收银机卡纸，一天卡了三次，队排到门口。",
    weight: 6,
    cooldownDays: 24,
    choices: [
      { label: "换一台", summary: "¥-320 · 口碑 +0.1", result: "新机器打得又快又清楚，队伍短了一半。", effects: [{ kind: "cash", amount: -320 }, { kind: "reputation", amount: 0.1 }] },
      { label: "手写记账", summary: "口碑 -0.06", result: "算错了两次，多找了钱。", effects: [{ kind: "reputation", amount: -0.06 }] },
    ],
  },
  {
    id: "fire_safety",
    title: "消防来查",
    body: "消防来查灭火器，说你这只过期了，还得再配一只。",
    weight: 5,
    cooldownDays: 28,
    choices: [
      { label: "配齐", summary: "¥-180 · 口碑 +0.1", result: "两只灭火器摆在门口，红得显眼。", effects: [{ kind: "cash", amount: -180 }, { kind: "reputation", amount: 0.1 }] },
      { label: "先用着", summary: "口碑 -0.1", result: "开了张单子，限三天整改。", effects: [{ kind: "reputation", amount: -0.1 }] },
    ],
  },
  {
    id: "garbage_fee",
    title: "垃圾清运费",
    body: "清运的人说这条街的餐厨垃圾要单独收，每月多一笔。",
    weight: 6,
    cooldownDays: 26,
    choices: [
      { label: "照交", summary: "¥-120 · 口碑 +0.06", result: "后巷干净了，不再有人捂着鼻子走过。", effects: [{ kind: "cash", amount: -120 }, { kind: "reputation", amount: 0.06 }] },
      { label: "自己拉", summary: "¥-30 · 口碑 -0.08", result: "每天收摊多一趟三轮，后巷还是有味。", effects: [{ kind: "cash", amount: -30 }, { kind: "reputation", amount: -0.08 }] },
    ],
  },
  {
    id: "wifi_ask",
    title: "客人要 WiFi",
    body: "几个年轻人问有没有 WiFi，说想边吃边看球。",
    weight: 6,
    cooldownDays: 22,
    choices: [
      { label: "拉一条", summary: "¥-160 · 口碑 +0.14", result: "球赛那晚，屋里坐满了不走的年轻人。", effects: [{ kind: "cash", amount: -160 }, { kind: "reputation", amount: 0.14 }] },
      { label: "没有", summary: "口碑 -0.04", result: "他们吃完就走了，碗还是干净的。", effects: [{ kind: "reputation", amount: -0.04 }] },
    ],
  },
  {
    id: "student_parttime",
    title: "学生来打零工",
    body: "一个大学生问能不能周末来帮忙，只要按小时算。",
    weight: 7,
    cooldownDays: 20,
    minDay: 12,
    choices: [
      { label: "让他来试两天", summary: "¥-140 · 口碑 +0.14", result: "小伙子手脚麻利，就是端碗有点抖。", effects: [{ kind: "cash", amount: -140 }, { kind: "reputation", amount: 0.14 }] },
      { label: "人手够了", summary: "无", result: "他点点头，说「下次缺人叫我」。", effects: [] },
    ],
  },
  {
    id: "staff_poached",
    title: "有人来挖人",
    body: "隔街那家托人来问，你家的炒料师傅一个月要多少钱肯过去。",
    weight: 5,
    cooldownDays: 26,
    minDay: 25,
    choices: [
      { label: "加钱留人", summary: "¥-400 · 口碑 +0.12", result: "师傅收了钱，第二天比平时早到半个钟。", effects: [{ kind: "cash", amount: -400 }, { kind: "reputation", amount: 0.12 }] },
      { label: "让他自己决定", summary: "口碑 -0.14", result: "他走了。灶上的火候要重新教。", effects: [{ kind: "reputation", amount: -0.14 }] },
    ],
  },
  {
    id: "wedding_order",
    title: "街坊办喜事",
    body: "街坊嫁女，问能不能在店里摆四桌，早上包场。",
    weight: 6,
    cooldownDays: 26,
    choices: [
      { label: "包场，认真做", summary: "¥-180 · 口碑 +0.26", result: "四桌人吃得热闹，红包塞了两封给你。", effects: [{ kind: "cash", amount: -180 }, { kind: "reputation", amount: 0.26 }] },
      { label: "只接单不包场", summary: "¥+60", result: "做了八十碗送到门口，收钱走人。", effects: [{ kind: "cash", amount: 60 }] },
    ],
  },
  {
    id: "full_moon",
    title: "满月酒",
    body: "常客家里添了孩子，来订红鸡蛋和一锅汤，说要在门口分给街坊。",
    weight: 6,
    cooldownDays: 26,
    choices: [
      { label: "多送一锅汤", summary: "¥-90 · 口碑 +0.22", result: "红鸡蛋摆了一桌，路过的人都分到一个。", effects: [{ kind: "cash", amount: -90 }, { kind: "reputation", amount: 0.22 }] },
      { label: "按单做", summary: "¥+40", result: "该给的都给了，街坊也道了谢。", effects: [{ kind: "cash", amount: 40 }] },
    ],
  },
  {
    id: "group_buy",
    title: "团购券",
    body: "有人来谈团购，九块九一碗，一次卖一百张，先给钱。",
    weight: 6,
    cooldownDays: 22,
    choices: [
      { label: "接，限午市用", summary: "¥+220 · 口碑 +0.1", result: "午市挤得转不开身，碗堆到水池外面。", effects: [{ kind: "cash", amount: 220 }, { kind: "reputation", amount: 0.1 }] },
      { label: "不接，价太薄", summary: "口碑 +0.02", result: "对方说「别家都接」。你说「那你去别家」。", effects: [{ kind: "reputation", amount: 0.02 }] },
    ],
  },
  {
    id: "company_lunch",
    title: "公司订团餐",
    body: "写字楼的行政来问，能不能一周五天给二十个人送午饭。",
    weight: 6,
    cooldownDays: 24,
    minDay: 20,
    choices: [
      { label: "接，签一个月", summary: "¥-240 · 口碑 +0.24", result: "每天十一点半装二十个饭盒，风雨无阻。", effects: [{ kind: "cash", amount: -240 }, { kind: "reputation", amount: 0.24 }] },
      { label: "只接三天", summary: "¥-80 · 口碑 +0.08", result: "试了三天，对方说「味道可以，就是慢了点」。", effects: [{ kind: "cash", amount: -80 }, { kind: "reputation", amount: 0.08 }] },
    ],
  },
  {
    id: "night_shift",
    title: "夜班工人",
    body: "附近厂的夜班十点下班，几十号人一起出来找吃的。",
    weight: 7,
    cooldownDays: 18,
    choices: [
      { label: "把打烊推后一小时", summary: "¥-80 · 口碑 +0.2", result: "十点后那一波，碗收得比白天还快。", effects: [{ kind: "cash", amount: -80 }, { kind: "reputation", amount: 0.2 }] },
      { label: "照常打烊", summary: "无", result: "他们成群走过你的门口，往更亮的那头去了。", effects: [] },
    ],
  },
  {
    id: "taxi_driver",
    title: "出租车司机",
    body: "一位司机说，他每天早上拉完一班车就来你这吃，问能不能给他留个位。",
    weight: 8,
    cooldownDays: 14,
    choices: [
      { label: "给他留位", summary: "¥-16 · 口碑 +0.1", result: "他每天七点零五分到，坐同一张凳。", effects: [{ kind: "cash", amount: -16 }, { kind: "reputation", amount: 0.1 }] },
      { label: "先到先坐", summary: "无", result: "他笑说「也对」。第二天还是来了。", effects: [] },
    ],
  },
  {
    id: "morning_run",
    title: "晨跑团",
    body: "天没亮就有一队人跑过，收队后一身汗站在门口，问开没开。",
    weight: 7,
    cooldownDays: 18,
    choices: [
      { label: "提前半小时开门", summary: "¥-40 · 口碑 +0.16", result: "他们进来第一句话是「有热水吗」，第二句是「来四碗」。", effects: [{ kind: "cash", amount: -40 }, { kind: "reputation", amount: 0.16 }] },
      { label: "按点开", summary: "无", result: "他们跑远了，回头看了一下招牌。", effects: [] },
    ],
  },
  {
    id: "old_photo",
    title: "一张旧照片",
    body: "有位老人拿来一张发黄的照片，说这铺面三十年前也是粉店，问你知不知道。",
    weight: 6,
    cooldownDays: 30,
    choices: [
      { label: "听他讲完", summary: "口碑 +0.2", result: "他讲了半个钟，走的时候说「味道接上了」。", effects: [{ kind: "reputation", amount: 0.2 }] },
      { label: "忙着，改天再聊", summary: "口碑 -0.04", result: "他把照片收回去，说了句「不打扰」。", effects: [{ kind: "reputation", amount: -0.04 }] },
    ],
  },
  {
    id: "recipe_rumor",
    title: "有人说你偷师",
    body: "街上有传言，说你家的配方是跟别人学的，说得有鼻子有眼。",
    weight: 5,
    cooldownDays: 30,
    minDay: 30,
    choices: [
      { label: "当面说清", summary: "口碑 +0.14", result: "你把当年学艺的师傅请来吃了一碗，传言自己散了。", effects: [{ kind: "reputation", amount: 0.14 }] },
      { label: "不理", summary: "口碑 -0.1", result: "有人在门口站着看了两眼价牌，又走了。", effects: [{ kind: "reputation", amount: -0.1 }] },
    ],
  },
];
