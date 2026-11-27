/**
 * 手艺树（P39）——对应开罗 `rank.txt` 的 17 行奖励。
 *
 * 开罗原文（`English.lproj__rank.txt`，19 项里空间/配方/操作三类）：
 *   Ramen Hall Expansion「Expand the Ramen Hall's land.」
 *   Ramen Hall Road Work「Improve the Ramen Hall's road.」
 *   More Line Tiles「Get more Ramen Hall line tiles.」
 *   Buy Small/Normal/Big/Amazing Shop「Buy a ... Ramen Hall shop.」
 *   More Toppings「Increase max toppings.」／More Active Items「Increase simultaneous items.」
 *   More Investments「Invest in more things at once.」
 * 它靠 rank XP（做面 / 打敌店 / 赢比赛）逐级解锁，**解锁的是新动词，不是数字**。
 *
 * 我们的等价物挂在自己的 11 级段位上（`GRADES`）：段位本来就要求交费 + 累计接待，
 * 而且已经有评定入口 —— 再叠一套 XP 只会让玩家算不清。
 * 「升一段 → 多一个能做的事」这一条照抄开罗；具体做什么按南宁的粉店来。
 */

export interface UnlockDef {
  id: string;
  /** 需要评到第几段（GRADES[].level，1-11） */
  grade: number;
  name: string;
  /** 这一下具体解锁了什么（给 UI 一行） */
  effect: string;
  /** 开罗对应的那一行奖励 */
  kairo: string;
  /** 一句南宁话（AI 改造预留：将来由 /event 代理改写，本地模板先兜底） */
  line: string;
  /**
   * true = 只在上海报里预告，数值尚未接到模拟里（不许假装生效）。
   *
   * **批 AZ′（解 GAP 四轮 A 条）之后这一格是空的** —— 十条全部接进了模拟：
   * `queue2`/`queue4` 改排队位、`roadwork` 乘客流、`hall_back`/`second_floor` 是扩建档、
   * `topping4` 改浇头上限、`stove5` 开第五档设备、`takeaway` 开打包窗口、
   * `branch` 让分店并入总账（`sim/branches.ts` 早就在跑）、`legend` 停本区能量衰减。
   *
   * 字段留着：以后加新条目时先写 `pending: true` 预告，接进模拟再删 —— 界面会把 pending 标成「预告」。
   */
  pending?: boolean;
}

export const UNLOCKS: readonly UnlockDef[] = [
  {
    id: "queue2",
    grade: 2,
    name: "门口摆两张塑料凳",
    effect: "排队位 12 → 14",
    kairo: "More Line Tiles（更多排队位）",
    line: "凳仔摆门口，客人宁可坐低等一阵，都不去隔壁。",
  },
  {
    id: "hall_back",
    grade: 3,
    name: "后巷搭个雨棚",
    effect: "第三档扩建：座位 +3、日上限 +120（¥60,000）",
    kairo: "Ramen Hall Expansion（扩建店面）",
    line: "后巷原来堆煤渣，搭起棚就是三张台，落雨都坐得。",
  },
  {
    id: "topping4",
    grade: 4,
    name: "浇头台加一格",
    effect: "每碗可加 2 → 3 件，钱包宽的 3 → 4 件",
    kairo: "More Toppings（更多浇头）",
    line: "多一格就多种搭法，酸笋同花生可以一齐落。",
  },
  {
    id: "roadwork",
    grade: 5,
    name: "巷口立块灯箱",
    effect: "本区客流 +15%（永久）",
    kairo: "Ramen Hall Road Work（修路引流）",
    line: "灯箱一亮，行到巷口就闻见酸笋味。",
  },
  {
    id: "second_floor",
    grade: 6,
    name: "二楼摆四张台",
    effect: "第四档扩建：座位 +4、灶位 +1、日上限 +160（¥110,000）",
    kairo: "Buy Big Shop（买更大的店）",
    line: "楼上原先是房东放杂物，清出来摆四张台，午市不用等。",
  },
  {
    id: "queue4",
    grade: 7,
    name: "人行道上划等候线",
    effect: "排队位 14 → 18",
    kairo: "More Line Tiles（更多排队位）",
    line: "划条黄线，队尾排到榕树脚，街坊都知这家旺。",
  },
  {
    id: "stove5",
    grade: 8,
    name: "第五档·黄金灶",
    effect: "设备上限 4 → 5 档（黄金灶 ¥68,000）",
    kairo: "More Active Items（同时操作更多）",
    line: "灶眼烧到发白，一碗接一碗都不断火。",
  },
  {
    id: "takeaway",
    grade: 9,
    name: "开个打包窗口",
    effect: "每分钟有一成客人打包带走（不占座）",
    kairo: "More Active Items（并行更多）",
    line: "窗口一开，骑手同上班族都从侧边拿粉走。",
  },
  {
    id: "branch",
    grade: 10,
    name: "到别区开第二家",
    effect: "分店营收并入总账",
    kairo: "Buy Amazing Shop（买顶级店）",
    line: "招牌挂到第二个区，老友粉就唔止一条街识。",
  },
  {
    id: "legend",
    grade: 11,
    name: "全区连锁 · 总店",
    effect: "所有区能量不再衰减",
    kairo: "More Investments（更多投资位）",
    line: "做到这一步，系人都知你是老友粉，唔系一间铺咁简单。",
  },
] as const;

export const UNLOCK_BY_ID: ReadonlyMap<string, UnlockDef> = new Map(
  UNLOCKS.map((u) => [u.id, u]),
);

/** 真正接到模拟里、会改数值的解锁（pending 的不算） */
export const LIVE_UNLOCK_IDS: readonly string[] = UNLOCKS.filter((u) => !u.pending).map(
  (u) => u.id,
);
