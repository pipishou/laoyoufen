/**
 * 店里的手册（批 N′ 十二页 + 批 Y′ 四页）：讲「这间店是怎么运转的」与「手该怎么动」。
 *
 * 为什么要有这一层：开罗 `help.txt` 有 57 节说明书（Game Flow / Making Noodles /
 * Making Soup / Sales Areas / Investment Types / Customer Fullness …），
 * 玩家随时能在菜单里翻。本作原来只有 `notebook.ts` 的十二张阿婆纸片 ——
 * 那是**口气**，不是**规则**：纸片告诉你怎么想，手册告诉你怎么算。
 *
 * 两条纪律：
 *   1. **只说本作真有的东西** —— 每一页都要能指到一条已存在的表或函数，
 *      不写「以后可能会有的系统」；
 *   2. **一页一件事** —— 前十二页对上十二个出口：客流、钱包、座位、出碗、
 *      味道、浇头、人情、段位、同行、行情、门路、杂货（分四章：一天的生意 / 这一碗 /
 *      这条街 / 手里的牌）；
 *      批 Y′ 补的第五章「怎么操作」四页对上四件手上的事：点单、出碗、页签、设置。
 *      合计 16 页 5 章 —— 页数与章数**由本文件自己数出来**（`MANUAL_TOTAL` /
 *      `manualSections()`），探针也从这里读（批 BB1′：`manual_probe` 原先写死 12 页 4 章，
 *      批 Y′ 加完四页之后它一直在报假红）。
 *
 * 来源：结构与「一页一件事」的写法照开罗 `help.txt`（57 节，按玩法分段），
 * 内容全部是本作的南宁口径。
 */

export interface ManualPage {
  id: string;
  /** 分章（手册目录按这个分组） */
  section: string;
  title: string;
  /** 一句话：这页讲什么 */
  gist: string;
  /** 正文：两到四句，讲清机制与玩家该看哪里 */
  body: string;
  /** 这一页对着哪张表 / 哪个函数（给维护者看） */
  where: string;
}

export const MANUAL_PAGES: readonly ManualPage[] = [
  {
    id: "m.traffic",
    section: "一天的生意",
    title: "客人是从哪儿来的",
    gist: "客流先看区，再看日子。",
    body: "每个区的人流是按地区生产总值折算的，起步的兴宁区一天大约七十位。换区就是把整个客流池换掉，贵的地方人多、租金也贵。日子还有一层：月初月末、雨天热天，进店的人会被加减一成上下。",
    where: "data/nanning.ts 的 DISTRICTS · sim/customer.ts 的 spawnChance",
  },
  {
    id: "m.wallet",
    section: "一天的生意",
    title: "他兜里有多少钱",
    gist: "钱包决定点几两、加不加料。",
    body: "每位客人有自己的钱包，最穷的那位也够买一碗最便宜的粉 —— 这是硬地板，所以「贵到没人买得起」不会发生。钱包薄的人多半点二两、不加料；钱包厚的人才容易加浇头、配饮料。",
    where: "sim/customer.ts 的 walletFloor · sim/menu.ts 的 pickDish",
  },
  {
    id: "m.seats",
    section: "一天的生意",
    title: "座位才是真的瓶颈",
    gist: "一碗要吃六分多钟，位子转不过来就走人。",
    body: "出碗再快，也得有位子坐。一天能接多少碗，先看几张桌、每碗吃多久。门口站满而走掉的人最多 —— 打烊单上的「为什么」会直接告诉你今天卡在座位还是卡在灶。",
    where: "sim/bottleneck.ts 的 capacityOf / EAT_MINUTES",
  },
  {
    id: "m.serve",
    section: "一天的生意",
    title: "一碗粉要几分钟",
    gist: "三段：炒料、煮粉、过篓；取最慢那段。",
    body: "出碗时间由最慢的一段决定。设备升一段，慢的那段就短一截；三样设备一起升才有用。左下角那行「一碗约几分」是你现在真实的出碗速度，不是设备标称值。",
    where: "sim/equipment.ts 的 stageMinutes",
  },
  {
    id: "m.taste",
    section: "这一碗",
    title: "味道分是怎么算的",
    gist: "四个维度，各自管一件事。",
    body: "香、鲜、料、相四维合成味道分。香管回味，鲜管汤底，料管浇头，相管卖相与魅力。味道分决定客人的满意与口碑，也决定比赛里的基准分。",
    where: "sim/score.ts · data/flavor.ts",
  },
  {
    id: "m.topping",
    section: "这一碗",
    title: "浇头与熟练度",
    gist: "常做的浇头会越做越熟。",
    body: "每份浇头点一次就记一次熟练度，做到一定次数升一级：味道末段加一点、料钱省一点、识食的客人少挑一点。熟练度是店里的事，不跟师傅走。",
    where: "sim/topping-xp.ts · data/ingredients.ts",
  },
  {
    id: "m.favor",
    section: "这条街",
    title: "人情怎么攒、怎么花",
    gist: "做完一碗给一点，日上限按碗数走。",
    body: "人情不是钱，是街坊记你的好。做完一碗加一点，日上限按当天出碗数封顶。人情花在杂货铺和某些门路上 —— 花掉的是关系，不是现金。",
    where: "data/favor.ts · sim/favor.ts",
  },
  {
    id: "m.grade",
    section: "这条街",
    title: "段位与评定费",
    gist: "门槛看累计人次，评定费一次比一次贵。",
    body: "段位不是经验值，是「接待过多少位」的门槛加一笔评定费。越往上，费越贵，但能开的门越多：更高的比赛档、更远的区、更贵的设备。",
    where: "data/grades.ts · sim/grade.ts",
  },
  {
    id: "m.rivals",
    section: "这条街",
    title: "同行在抢你的客",
    gist: "比价看全街均价，也看最近那几家。",
    body: "这条街上的同行有自己的招牌粉与价格。你比他贵，客人会犹豫；比他便宜，进店的人多一些。近处那几家算得更重 —— 街坊走两步就能到。",
    where: "sim/price-war.ts · data/rivals.ts",
  },
  {
    id: "m.market",
    section: "这条街",
    title: "行情：天时与街面",
    gist: "每条行情都有代价。",
    body: "回南天、暴雨、高温、修路、停水、发薪日、开学、东博会 —— 每条都把进店、耐心、钱包、料钱里的几项加减一点，没有一条是纯赚的。同时最多叠几条，总幅度也是夹住的。",
    where: "data/market.ts · sim/market.ts 的 MARKET_CAP",
  },
  {
    id: "m.invest",
    section: "手里的牌",
    title: "街上的门路",
    gist: "买的是今天多做几碗、多进几个人，不买乘数。门路位满了就撤一条。",
    body: "料商留货、老师傅来看一天、美食号写一篇、夜市亮灯、中央厨房送一批 …… 这些都是按天算的。另有两路是买行情的：一路把坏行情挡在门外，一路把好行情叫到门口 —— 它们只改「今天抽到哪一条」，不加任何倍率。同时能挂几条叫「门路位」：一开局两位，评到第五段三位、第八段四位。位子满了按钮会写「先撤一条」，撤掉不退钱，只把位子空出来。它们只加量、加一点点时间，不往上叠乘数。",
    where: "data/invest.ts · sim/invest.ts",
  },
  {
    id: "m.goods",
    section: "手里的牌",
    title: "杂货铺与人情",
    gist: "用关系换当场就见效的小东西。",
    body: "多备一筐粉、借三台电扇、现炸一筐油条、冰一箱豆奶、熬一锅绿豆沙、门口多亮一盏灯、门口铺两张矮凳、挂块价牌、请人帮半天 —— 全是用人情换，管当天。第二天自动没了。",
    where: "data/goods.ts · sim/goods.ts",
  },
  {
    id: "m.how-order",
    section: "怎么操作",
    title: "怎么点一碗",
    gist: "配方页挑三样，出碗就照这个出。",
    body: "配方页里选粉型、主料、浇头，一碗的价钱和味道就定了。同一天里改配方，下一碗就按新的算；改到菜单上有多款时，客人按价钱和口味自己挑。份量在二两与三两之间选，三两多给钱也多费时间。",
    where: "sim/menu.ts · sim/dish.ts 的 dishName",
  },
  {
    id: "m.how-serve",
    section: "怎么操作",
    title: "怎么把碗端出去",
    gist: "点一下托盘就出一批，锅在位子上自己走。",
    body: "炉子亮着就一直在出碗，不用一直按；托盘上的数字是这一批能出几碗。设备和灶眼决定「多久出一批」，座位决定「一碗吃多久」，两头任何一头堵住，门口就会站满人。",
    where: "sim/customer.ts 的 serveBank · sim/bottleneck.ts 的 capacityOf",
  },
  {
    id: "m.how-tabs",
    section: "怎么操作",
    title: "面板上那七个页签",
    gist: "配方、员工、店铺、比赛、图鉴、账本、手艺。",
    body: "店铺页管设备、家当、内装格局、门路、杂货与袋装线；手艺页花段位给的点，四条线各管一头；图鉴页有地图、行情、街坊报与这十六页手册。页签多的时候可以横向划。",
    where: "data/perk.ts 的 PERKS · sim/perk.ts 的 perkViews",
  },
  {
    id: "m.how-prefs",
    section: "怎么操作",
    title: "设置与存档",
    gist: "音乐音效音量、高对比、大字，只记在这台机器上。",
    body: "右上角「设置」里有六项：音乐、音效、音量三档、高对比、大字、恢复默认。这些不进存档，换台设备就回到默认；存档本身是自动的，一天结束就写一次。",
    where: "sim/save.ts 的 serialize · data/manual.ts",
  },
] as const;

export const MANUAL_TOTAL = MANUAL_PAGES.length;

export const MANUAL_BY_ID: ReadonlyMap<string, ManualPage> = new Map(
  MANUAL_PAGES.map((p) => [p.id, p]),
);

export function manualPageById(id: string | null | undefined): ManualPage | null {
  if (!id) return null;
  return MANUAL_BY_ID.get(id) ?? null;
}

/** 目录用的分章顺序（按首次出现排） */
export function manualSections(): readonly { section: string; pages: readonly ManualPage[] }[] {
  const order: string[] = [];
  for (const p of MANUAL_PAGES) if (!order.includes(p.section)) order.push(p.section);
  return order.map((section) => ({
    section,
    pages: MANUAL_PAGES.filter((p) => p.section === section),
  }));
}
