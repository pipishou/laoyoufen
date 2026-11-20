/**
 * 碗（A4）。对照开罗 `bowl.txt` 那五行 —— 它做的是「五只碗各抬一个评分轴」
 * （Lacquer→charisma / Porcelain→volume / Ancient→aroma / Potter's→richness），
 * 我们这边本土化成南宁粉店真在用的五种盛具：
 *
 *   steel    统一消毒的不锈钢碗（现在全城的默认，粉店不用自己洗碗）
 *   enamel   搪瓷碗（九十年代那批，白底与肉色两种）
 *   bigpan   大盆，广西话叫「pang」，装着能多些
 *   claypot  瓦煲（冬天的暖身法宝，煮得滚烫端上来）
 *   takeaway 打包碗（塑料袋套碗 / 打包盒，加收打包费）
 *
 * 三条纪律（与家当、搭配、门面同一套）：
 *   1. 不加新的结算分支——只用 serve / sat / patience / cost 四个已经在算的入口；
 *   2. 同一时间只有一只碗在用，所以不做总量封顶：单只的数值就是上限；
 *   3. 每只碗都得有出处：南宁的粉碗本身是有制度的（统一消毒），不是美术选择。
 *
 * 出处都是可点开的原文，`quote` 是原句，不许改写。
 */
export type BowlId = "steel" | "enamel" | "bigpan" | "claypot" | "takeaway";

export interface BowlSource {
  label: string;
  url: string;
  quote: string;
}

export interface BowlEffect {
  /** 出碗时间：正数＝更快，负数＝更慢（瓦煲要现煮） */
  servePct?: number;
  /** 满意度点数 */
  sat?: number;
  /** 耐心：正数＝更愿意等 */
  patiencePct?: number;
  /** 料钱：正数＝更费（装得多 / 打包盒钱） */
  costPct?: number;
}

export interface BowlDef {
  id: BowlId;
  name: string;
  /** 长什么样（面板与图鉴都用这句） */
  look: string;
  /** 现实里在哪儿见得到 */
  where: string;
  costYuan: number;
  /** 免费的默认碗 */
  free?: boolean;
  effect: BowlEffect;
  effectText: string;
  /** 客人端着这只碗说的一句 */
  line: string;
  kairo: string;
  source: BowlSource[];
}

export const BOWLS: readonly BowlDef[] = [
  {
    id: "steel",
    name: "消毒不锈钢碗",
    look: "亮闪闪的钢碗，碗沿贴一张「已消毒」的小纸签",
    where: "现在南宁几乎所有粉店的默认碗，由消毒中心统一回收配送",
    costYuan: 0,
    free: true,
    effect: { servePct: 0.03 },
    effectText: "出碗快 3%（不用自己洗碗，吃完就走）",
    line: "钢碗好，烫手才知道是刚出锅的。",
    kairo: "bowl.txt 第 0 行 Normal Bowl：『A regular bowl you can fill with delicious ramen.』——开罗的默认碗没有加成，我们的默认碗有一个很小的好处：不用洗。",
    source: [
      {
        label: "知乎《为什么螺蛳粉总是用不锈钢碗盛着？》",
        url: "https://www.zhihu.com/question/31292350",
        quote:
          "南宁粉店都是用统一消毒的碗的。就你现在看到的是不锈钢板的，更早以前是搪瓷碗……这是统一的消毒碗，不能重复用，用完要回收到消毒中心统一消毒。",
      },
      {
        label: "网易《外地人好奇为何螺蛳粉必须用不锈钢碗装？》",
        url: "https://www.163.com/dy/article/KT2HGU6G0548B7QF.html",
        quote:
          "此举还能为店家节省洗碗的人力成本，于餐饮店而言，这可是一项不低的开支节约。",
      },
    ],
  },
  {
    id: "enamel",
    name: "搪瓷碗",
    look: "白底带一圈蓝边的搪瓷碗，磕掉瓷的地方露出黑铁",
    where: "九十年代那批粉店的碗，老店还留着几只",
    costYuan: 600,
    effect: { sat: 1, patiencePct: 0.03 },
    effectText: "满意 +1 · 耐心 +3%（老碗有老碗的味道）",
    line: "这个碗我认得，我妈那时候就是用这种。",
    kairo: "bowl.txt 第 4 行 Potter's Bowl：陶艺师傅做的碗会「mysteriously boost richness」——我们换成搪瓷碗抬满意：它抬的不是味道，是记忆。",
    source: [
      {
        label: "知乎《为什么螺蛳粉总是用不锈钢碗盛着？》",
        url: "https://www.zhihu.com/question/31292350",
        quote: "更早以前是搪瓷碗，我记得有白色和肉色两种哈哈……",
      },
    ],
  },
  {
    id: "bigpan",
    name: "大盆（pang）",
    look: "比脸还大的不锈钢盆，汤能多舀两勺",
    where: "广西人家里与粉摊都这么叫，「pang」就是盆",
    costYuan: 1_200,
    effect: { sat: 2, costPct: 0.03 },
    effectText: "满意 +2 · 料钱 +3%（装得多，也给得多）",
    line: "这么一大盆，吃得饱。",
    kairo: "bowl.txt 第 2 行 Porcelain Bowl 抬 volume（份量）——我们不直接改份量（那是配方的事），改成「装得多→吃得满足」，代价是多给料。",
    source: [
      {
        label: "网易《外地人好奇为何螺蛳粉必须用不锈钢碗装？》",
        url: "https://www.163.com/dy/article/KT2HGU6G0548B7QF.html",
        quote:
          "在广西不叫不锈钢盆，叫「pang」，用这个装还能装多些，像粉粉汤汤这些，容量大才方便，也吃的爽。",
      },
    ],
  },
  {
    id: "claypot",
    name: "瓦煲",
    look: "黑砂瓦煲，端上桌还在冒泡，耳朵上垫一块布",
    where: "人民路、北二里那些只卖早市午市的瓦煲粉店",
    costYuan: 2_600,
    effect: { patiencePct: 0.12, sat: 1, servePct: -0.06 },
    effectText: "耐心 +12% · 满意 +1 · 出碗慢 6%（现煮，等得久但值得）",
    line: "烫的，慢慢来，这个要趁热吃。",
    kairo: "bowl.txt 第 3 行 Ancient Bowl 抬 aroma——瓦煲抬的是「热」：开罗没有温度这一维，我们用耐心与出碗时间表达「现煮」的代价。",
    source: [
      {
        label: "搜狐《暖身必吃！南宁这几家瓦煲粉》",
        url: "https://www.sohu.com/a/357659783_741950",
        quote:
          "瓦煲老友粉可是冬天暖身的法宝，老友味酸辣刺激，加上瓦煲更是双倍暖身！",
      },
      {
        label: "搜狐《南宁的人气砂锅粉……灵魂酸辣椒》",
        url: "https://www.sohu.com/a/627255384_121609000",
        quote: "他们家的汤底因为是用沙煲熬出来的，所以汤底很鲜美……",
      },
    ],
  },
  {
    id: "takeaway",
    name: "打包碗",
    look: "一次性碗，外面再套一层塑料袋，盖子扣得严实",
    where: "赶时间的上班族、外卖、夜市收摊前的最后一单",
    costYuan: 900,
    effect: { servePct: 0.05, costPct: 0.02, sat: -1 },
    effectText: "出碗快 5% · 料钱 +2%（盒子钱）· 满意 −1（汤容易洒）",
    line: "打包，带走，路上吃。",
    kairo: "bowl.txt 没有外带这一档（开罗的客人都在店里吃）——这是我们多出来的一只，对应南宁粉店真实存在的「套袋打包」与打包费。",
    source: [
      {
        label: "南宁晚报《塑料制品盛热食 健康隐患要当心》",
        url: "http://nnwb.nnnews.net:8080/nnwb/20250628/html/page_04_content_000.htm",
        quote:
          "「老板，打包一碗二两老友粉，用袋子就行。」……只见老板拿起一个塑料袋套到碗里，将刚煮好、滚烫的老友粉倒入塑料袋中。",
      },
      {
        label: "柳盛（南宁快餐连锁）价目",
        url: "https://www.baike.com/wikiid/4805028653309368738",
        quote: "另外，柳盛分类打包需要加收 0.2 元打包费，快餐类打包需要加收 0.5 元打包费。",
      },
    ],
  },
];

export const BOWL_BY_ID: ReadonlyMap<string, BowlDef> = new Map(
  BOWLS.map((b) => [b.id, b] as const),
);

export const BOWL_TOTAL = BOWLS.length;

/** 开局就有的那只 */
export const DEFAULT_BOWL_ID: BowlId = "steel";

export function bowlById(id: string): BowlDef | undefined {
  return BOWL_BY_ID.get(id);
}
