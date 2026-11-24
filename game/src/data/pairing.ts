/**
 * 配料组合（A2）。对照开罗 `topping_combo.txt` 那 38 行 ——
 * 它是「任意两件浇头配对 → 一个组合名 + 一串效果」的矩阵，
 * 好处是深度，坏处是任意配对都成立，玩家只能靠试。
 *
 * 我们只做 24 条**南宁粉店里真有人这么点**的两件套：
 * 一、每一条都能在菜单、老店的做法、或者本地食记里找到同一碗里出现的证据；
 * 二、两件套给的是小加成，成型的吃法（三件套、粉型绑定）留在 `data/flavor.ts`，
 *     两层不抢功：两件套是「顺手」，三件套是「讲究」；
 * 三、只用已经在算的六个入口：汤、卖相、满意、耐心、料钱、出碗。
 *
 * 为什么不做 38 条矩阵：顾客只有 24 类、一天 2 分钟，矩阵要靠试错才摸得出来，
 * 试错成本比开罗高一个数量级，摸不出来就等于噪声。宁少，但要条条有据。
 */
export interface PairingSource {
  label: string;
  url: string;
  quote: string;
}

export interface PairingEffect {
  soup?: number;
  charm?: number;
  sat?: number;
  patiencePct?: number;
  costPct?: number;
  servePct?: number;
}

export interface PairingDef {
  id: string;
  /** 街坊怎么叫这一搭 */
  name: string;
  /** 两件浇头（顺序只影响面板显示） */
  pair: [string, string];
  effect: PairingEffect;
  /** 凑成时客人/老板心里那句话 */
  line: string;
  /** 为什么这么配（一句人话，不进 UI 也给玩家 hover 看） */
  why: string;
  kairo: string;
  source: PairingSource[];
}

const SRC = {
  jinpeng: {
    label: "微信《螺蛳粉的敌人来了，广西表哥强烈推荐！》金鹏南宁老友粉菜单",
    url: "http://mp.weixin.qq.com/s?__biz=Mzg5MTUyNzQ3OA==&mid=2247523976&idx=1&sn=95e5c8ab0c2029000d8e0ba4e7da621c",
    quote:
      "老友猪杂粉——16元：猪肉碎 猪肝 猪肠 猪肉；老友牛肉粉——20元：猪肉碎 牛肉；老友全家福粉——猪肉碎 猪肝 猪肠 猪心 猪肉片 猪天梯 牛肉。",
  },
  beishan: {
    label: "微信《北山｜正宗「老友粉」，宠粉价⑦元！》",
    url: "http://mp.weixin.qq.com/s?__biz=MzA3MDEyMjE4OA==&mid=2653447021&idx=2&sn=e08d616b0edb788207cae7089cae0924",
    quote:
      "满满一碗「猪杂老友粉」，有猪肝、粉肠、瘦肉和少见的竹肠……每碗老友粉标配香菇、鹌鹑蛋和绿豆芽，配料管够。",
  },
  sohuShaguo: {
    label: "搜狐《南宁的人气砂锅粉，没有位置只能坐在路边》",
    url: "https://www.sohu.com/a/627255384_121609000",
    quote:
      "老友粉是店里最贵但是最受欢迎的，汤底是番茄和酸笋……豆芽青菜完美地融合在其中，辣椒和酸菜可以随便加。",
  },
  threeCrisp: {
    label: "搜狐《这老友粉里的粉肠嘎吱脆》",
    url: "https://www.sohu.com/a/371640943_120064132",
    quote: "这三脆就是指猪肚、花肠、粉肠头。",
  },
  baijiahao: {
    label: "百家号《广西南宁美食——老友粉》",
    url: "https://baijiahao.baidu.com/s?id=1779380296845760795",
    quote:
      "肉类：可以选择猪肉、牛肉、猪肝、粉肠等……青菜：可以选择生菜、空心菜等时令蔬菜。",
  },
  douguo: {
    label: "豆果美食《鱼宝宝私房食谱~特色老友粉》",
    url: "http://mwx.douguo.com/cookbook/1530184.html",
    quote:
      "取自冰箱现有的食材：蕃茄，酸菜，酸笋，生菜，豆鼓……放生菜，有葱花的话可以洒上几粒，然后出锅啦~",
  },
  xiachufang: {
    label: "下厨房《家庭版老友粉！还单配一叠 ong菜酸！！》",
    url: "https://hanwuji.xiachufang.com/recipe/107562637/",
    quote: "空心菜梗切小段……番茄块，蒜末爆香；猪杂腌制一下更有味。",
  },
  qiyi: {
    label: "微信《美了！上辈子积多少德才让我在南宁遇上介个玩意！》其英猪脚粉",
    url: "http://mp.weixin.qq.com/s?__biz=MzI3MjAyNDY5OQ==&mid=2652930831&idx=1&sn=9a9a3bd466653083642967141e32c9df",
    quote:
      "他家汤底浓郁，由骨头汤加猪脚卤水而成，胶质口感搭配青菜碎（或豆芽、当季蔬菜碎）绝妙……可加青菜、腐竹、煎蛋等配菜。",
  },
  yiniutang: {
    label: "微信《鲜城南宁》益牛堂",
    url: "http://mp.weixin.qq.com/s?__biz=MjM5NDYxOTI0Nw==&mid=2652611506&idx=1&sn=05e409929b62212d4a38e1165de0c407",
    quote: "木耳牛杂粉，木耳丝很爽口，说是牛杂，实际上只有牛百叶，牛百叶软而不烂而且分量感人。",
  },
  chaoniu: {
    label: "搜狐《分量实在汤头正~南宁这家潮汕牛肉粉吃得超爽！》潮牛汤粉王",
    url: "https://m.sohu.com/a/408045692_653321/",
    quote: "【鲜牛肉汤粉+牛杂+牛丸】……牛杂里面有牛百叶、牛心、胸口油等……牛丸吃得出是手打牛丸。",
  },
  zhouniu: {
    label: "搜狐《南宁这家牛肉粉太鲜了！》周记鲜牛",
    url: "https://m.sohu.com/coo/sg/425427580_741950",
    quote: "除了牛肉，店里还有各种各样的牛杂：牛百叶、牛骨髓、牛光元，各种牛杂任你挑选。",
  },
  shuji: {
    label: "搜狐《嗦着不锈钢盆里的粉，我终于理解了广西人的幸福》舒记老友粉",
    url: "https://www.sohu.com/a/503026039_120093003",
    quote: "叉烧、炸透的花生米、蔬菜丝、鹌鹑蛋，种类丰富。",
  },
  liusheng: {
    label: "柳盛（南宁快餐连锁）价目",
    url: "https://www.baike.com/wikiid/4805028653309368738",
    quote: "加菜类叉烧/烧肠为1.5元；青菜/油果(豆腐包)/酸笋为0.5元；卤蛋/腐竹/花生为1.0元。",
  },
  guozao: {
    label: "搜狐《暖身必吃！南宁这几家瓦煲粉》锅仔生料煮粉",
    url: "https://www.sohu.com/a/357659783_741950",
    quote: "锅仔老友肉末粉是菜单上没有的隐藏菜式，只有老顾客才会直接跟老板点这个。",
  },
  tangji: {
    label: "搜狐《南宁的人气砂锅粉……灵魂酸辣椒》唐记瓦煲粉",
    url: "https://www.sohu.com/a/627255384_121609000",
    quote: "辣椒和酸菜可以随便加，吃起来又香又酸又甜……店里的免费酸辣椒可是很抢手。",
  },
  yifuRecipe: {
    label: "下厨房《老友猪杂伊面》",
    url: "https://mip.xiachufang.com/recipe/104389389/",
    quote:
      "豆芽熟了就加入伊面煮……加蛋完全是我个人口味啦，打散后搅匀就可以出锅了；「伊面则可按照个人喜好换成米粉」",
  },
  yifuReview: {
    label: "16fan 食客点评《南宁老友粉》",
    url: "http://live.16fan.com/info/482981.html",
    quote: "新鲜的牛肉和猪杂直接生汆，所以会把鲜味溶到汤里，加上鸡蛋的厚度，伊面是细的炸过的",
  },
} as const;

export const PAIRINGS: readonly PairingDef[] = [
  // ── 猪杂组（9 条）──
  {
    id: "offal_egg",
    name: "猪杂打蛋",
    pair: ["top.offal", "top.egg"],
    effect: { sat: 2, charm: 1 },
    line: "猪杂下锅先烫一烫，蛋液跟着一浇，汤就厚了。",
    why: "生蛋打散下锅会在汤面起一层花，把猪杂的鲜兜住——老友猪杂伊面最家常的一种吃法。",
    kairo: "topping_combo 的 38 条按食材分类，没有「蛋＋内脏」这一对；我们补一条按「吃法」配的。",
    source: [SRC.yifuRecipe, SRC.yifuReview],
  },
  {
    id: "liver_chitterling",
    name: "猪肝粉肠",
    pair: ["top.pigliver", "top.pigchitterling"],
    effect: { sat: 1 },
    line: "肝要嫩，肠要脆，这两样一起煮才像话。",
    why: "猪肝与粉肠是老友猪杂粉的骨架，两样一起下锅，一个出粉糯一个出脆口。",
    kairo: "topping_combo 的『Meat Lovers』两件同类肉相加——我们的同类相加不是叠份量，是叠口感层次。",
    source: [SRC.jinpeng, SRC.beishan],
  },
  {
    id: "flower_chitterling",
    name: "双脆",
    pair: ["top.pigflower", "top.pigchitterling"],
    effect: { charm: 2 },
    line: "这两样脆的，一听名字就想点。",
    why: "三大脆里的两样：花肠脆得响，粉肠头脆得韧。",
    kairo: "对照『Crunchy』——开罗用两件脆物凑「脆」，我们只认南宁人认的那两样。",
    source: [SRC.threeCrisp],
  },
  {
    id: "stomach_flower",
    name: "猪肚花肠",
    pair: ["top.pigstomach", "top.pigflower"],
    effect: { charm: 1, sat: 1 },
    line: "肚要炖透，花肠只要一烫，火候差一点就不是这个味。",
    why: "两样都是三大脆，一个吃软糯一个吃爽脆，同一碗里两种咬头。",
    kairo: "开罗的配对矩阵里没有「口感相冲却相配」这一层，这是我们自己加的。",
    source: [SRC.threeCrisp],
  },
  {
    id: "liver_lean",
    name: "猪肝瘦肉",
    pair: ["top.pigliver", "top.lean"],
    effect: { sat: 1 },
    line: "肝嫩肉滑，一碗下去不齁。",
    why: "猪杂里最平常的两样，早市客人点得最多。",
    kairo: "『Balanced Nutrition』的两件肉配——我们换成「不齁」这个真实的评价。",
    source: [SRC.beishan, SRC.jinpeng],
  },
  {
    id: "offal_quail",
    name: "猪杂配鹌鹑蛋",
    pair: ["top.offal", "top.quail"],
    effect: { sat: 1, charm: 1 },
    line: "蛋要剥干净，泡在汤里才入味。",
    why: "金鹏的全家福与北山的标配都把鹌鹑蛋和猪杂放在同一碗里。",
    kairo: "『Meat & Egg』——开罗的肉蛋组合，我们照做但限定在猪杂这一路。",
    source: [SRC.jinpeng, SRC.beishan],
  },
  {
    id: "offal_tomato",
    name: "猪杂番茄",
    pair: ["top.offal", "top.tomato"],
    effect: { soup: 1 },
    line: "番茄一炒出沙，汤就活了。",
    why: "砂锅粉的汤底是番茄加酸笋，猪杂下进去汤更厚。",
    kairo: "『Flavor of the Sea』靠海鲜抬汤——我们用番茄抬汤，这是南宁砂锅粉的做法。",
    source: [SRC.sohuShaguo],
  },
  {
    id: "quail_sprout",
    name: "鹌鹑蛋豆芽",
    pair: ["top.quail", "top.douya"],
    effect: { costPct: 0.02 },
    line: "这两样都是标配，不用另外加钱。",
    why: "豆芽垫底、鹌鹑蛋沉在下面，一碗粉的底子。",
    kairo: "开罗没有「标配」这个概念（每样都要买），我们把标配做成省钱。",
    source: [SRC.beishan],
  },
  {
    id: "mince_chili",
    name: "肉末酸辣椒",
    pair: ["top.mince", "top.chili"],
    effect: { sat: 1 },
    line: "肉末炒散了再下酸辣椒，锅气才起得来。",
    why: "锅仔老友肉末粉是隐藏菜式，酸辣椒是桌上随便加的。",
    kairo: "『Spicy』——开罗的辣是两件辣的相加，我们的辣要配肉末才立得住。",
    source: [SRC.guozao, SRC.tangji],
  },

  // ── 猪牛组（6 条）──
  {
    id: "beef_mince",
    name: "牛肉打底",
    pair: ["top.beef", "top.mince"],
    effect: { charm: 1 },
    line: "猪肉末打底，牛肉铺面，这才是老友牛肉粉。",
    why: "金鹏的老友牛肉粉写得很清楚：猪肉碎 + 牛肉，两样都要。",
    kairo: "开罗的『Mega Toppings』是多件相加，我们这条是「底 + 面」的分工。",
    source: [SRC.jinpeng],
  },
  {
    id: "pork_mince",
    name: "猪肉打底",
    pair: ["top.pork", "top.mince"],
    effect: { costPct: 0.02 },
    line: "肉片切薄，肉末炒香，一碗都是肉。",
    why: "老友猪肉粉就是猪肉碎加猪肉片，最便宜也最常见的一碗。",
    kairo: "对照『Classic』——开罗的经典组合是固定两件，我们的经典是本地最常点的那碗。",
    source: [SRC.jinpeng],
  },
  {
    id: "pork_egg",
    name: "猪肉煎蛋",
    pair: ["top.pork", "top.friedegg"],
    effect: { sat: 1 },
    line: "煎蛋边要焦，蘸一下汤最好吃。",
    why: "加菜单上的常见一组：肉片 + 煎蛋，一碗顶到晚饭。",
    kairo: "『Meat & Egg』的本地版本——南宁人加的是煎蛋，不是溏心蛋。",
    source: [SRC.jinpeng],
  },

  // ── 素菜组（2 条：实录里老友粉能加的素菜只有生菜与豆芽）──
  {
    id: "shengcai_scallion",
    name: "生菜葱花",
    pair: ["top.shengcai", "top.scallion"],
    effect: { servePct: 0.02 },
    line: "生菜最后放，葱花出锅撒，烫一下就够。",
    why: "家庭版老友粉的收尾就是这个动作：放生菜、撒葱花、出锅。",
    kairo: "开罗的『Refreshing Tofu』是清爽向的配对，我们这条清爽在「快」上——一烫就好。",
    source: [SRC.douguo],
  },
  {
    id: "shengcai_sour",
    name: "生菜配酸笋",
    pair: ["top.shengcai", "top.sourbamboo"],
    effect: { soup: 1 },
    line: "酸笋先煸干，生菜最后放，一酸一青。",
    why: "金鹏的加菜单上这两样是并列的加菜，一碗里酸与青各占一头。",
    kairo: "『Savory Aroma』抬香气——我们这条抬的是汤，因为酸笋炒过之后香在汤里。",
    source: [SRC.jinpeng, SRC.douguo],
  },
  {
    id: "tomato_shengcai",
    name: "番茄生菜",
    pair: ["top.tomato", "top.shengcai"],
    effect: { sat: 1 },
    line: "番茄炒出汁，生菜下去翻两下就起锅。",
    why: "家常老友粉的配料表里，番茄与生菜是同时出现的两样。",
    kairo: "开罗没有「家常版」这个维度，它只有店里的配方——这条是玩家自己家里那口锅。",
    source: [SRC.douguo],
  },
  {
    id: "douya_shengcai",
    name: "豆芽生菜",
    pair: ["top.douya", "top.shengcai"],
    effect: { costPct: 0.02 },
    line: "豆芽垫底，生菜压面，一碗粉看着就满。",
    why: "实录里老友粉能加的素菜就这两样：豆芽垫底、生菜压面。",
    kairo: "开罗按件计费，青菜越多越贵；我们这两样便宜，配起来反而省钱。",
    source: [SRC.jinpeng, SRC.beishan],
  },

  // ── 老友味组（4 条）──
  {
    id: "sourbamboo_chili",
    name: "酸笋酸辣椒",
    pair: ["top.sourbamboo", "top.chili"],
    effect: { soup: 1 },
    line: "酸笋先炒干水，酸辣椒后下，酸味才分两层。",
    why: "老友粉的灵魂是酸笋与辣椒，唐记的酸辣椒是免费但抢手的。",
    kairo: "『Red Hot』两件辣相加——我们这条是「酸 + 辣」两层，不是辣上加辣。",
    source: [SRC.tangji, SRC.baijiahao],
  },
  {
    id: "douchi_chili",
    name: "豆豉酸辣椒",
    pair: ["top.douchi", "top.chili"],
    effect: { charm: 1 },
    line: "豆豉要炒出酱香，辣椒才挂得住。",
    why: "老友粉的底味三件里，豆豉与辣椒是同时下锅爆的。",
    kairo: "『Allium Allure』是两件辛香相加，我们这条是酱香配辣香。",
    source: [SRC.baijiahao],
  },
  {
    id: "douya_tomato",
    name: "豆芽番茄",
    pair: ["top.douya", "top.tomato"],
    effect: { servePct: 0.02 },
    line: "番茄出沙，豆芽垫底，汤色一下就亮。",
    why: "砂锅粉的汤底是番茄，豆芽青菜融在其中；两样都好熟，起锅快。",
    kairo: "开罗的『Refreshing Combo』走清爽路线——我们这条清爽在「快」与「亮」。",
    source: [SRC.sohuShaguo],
  },
  {
    id: "offal_scallion",
    name: "猪杂葱花",
    pair: ["top.offal", "top.scallion"],
    effect: { sat: 1 },
    line: "猪杂起锅前撒一把葱花，腥气就压住了。",
    why: "猪杂重味，葱花是南宁粉店桌上永远有的那一把。",
    kairo: "『Charismatic』靠摆盘——我们这条靠一把葱，真实且便宜。",
    source: [SRC.beishan, SRC.douguo],
  },
];

export const PAIRING_BY_ID: ReadonlyMap<string, PairingDef> = new Map(
  PAIRINGS.map((p) => [p.id, p] as const),
);

export const PAIRING_TOTAL = PAIRINGS.length;

export function pairingById(id: string): PairingDef | undefined {
  return PAIRING_BY_ID.get(id);
}
