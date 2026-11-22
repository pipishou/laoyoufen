/**
 * 街坊报（A11）：每天一条，报上写的就是这条街上发生的事。
 *
 * 三条纪律：
 * 1. **只写发生过的事**：每条模板都挂在一个真实条件上（开了几家店、段位到哪、
 *    落场赢没赢、街上修了什么），不凭空夸，也不报玩家没做过的成就。
 * 2. **不加任何机制**：报纸是读的，不是按钮。加成就、加奖励都会让「看报」
 *    变成刷的任务。
 * 3. **南宁口吻，写到具体地方**：水街、中山路、琅西、望州岭、邕江边 ——
 *    街坊看报认的是地名和人名，不是「本店今日营业额创新高」。
 *
 * 开罗 `news.txt` 24 行 + `topics.txt` 9 行是同一件事：让世界在自己转。
 * 我们只做「一条」，因为玩家每天只打开一次。
 */

export type NewsKind = "open" | "grade" | "contest" | "rival" | "street" | "pack" | "skill" | "plain";

export interface NewsDef {
  id: string;
  kind: NewsKind;
  /** 报上印的那一行。{店} {街} {段} {同行} 会被替换成真实名字 */
  line: string;
  kairo: string;
}

export const NEWS: NewsDef[] = [
  // 开张与生意
  { id: "n_open", kind: "open", line: "{街}新开一间粉店，老板凌晨四点就起来熬汤。", kairo: "news：开店报道" },
  { id: "n_open2", kind: "open", line: "街口那家粉店挂招牌了，红纸还没撕干净。", kairo: "news：开店报道" },
  { id: "n_open3", kind: "open", line: "有人说{街}这家新店的酸笋是自己腌的。", kairo: "news：开店报道" },
  // 手上的功夫练出来了
  { id: "n_skill", kind: "skill", line: "{店}的老板把一手功夫练成了，{街}有人专门跑来学。", kairo: "news：技艺报道" },
  { id: "n_skill2", kind: "skill", line: "听说{店}那口灶现在闭着眼也烧得稳，隔壁店的人来看了两回。", kairo: "news：技艺报道" },
  // 段位
  { id: "n_grade", kind: "grade", line: "{店}评上了「{段}」，街坊说早就该评。", kairo: "news：评级报道" },
  { id: "n_grade2", kind: "grade", line: "「{段}」的牌子挂出来了，红底金字。", kairo: "news：评级报道" },
  // 赛事
  { id: "n_contest", kind: "contest", line: "{店}在市里的比赛上拿了名次，回来请街坊吃了一轮。", kairo: "news：赛事报道" },
  { id: "n_contest2", kind: "contest", line: "比赛的评委说，今年的老友味比往年正。", kairo: "news：赛事报道" },
  // 同行
  { id: "n_rival", kind: "rival", line: "{同行}那边最近人少了些，老板站在门口抽烟。", kairo: "news：同行风波" },
  { id: "n_rival2", kind: "rival", line: "{同行}换了新锅，说是要从火候上找回来。", kairo: "news：同行风波" },
  { id: "n_rival3", kind: "rival", line: "有人看见{同行}的老板半夜还在洗灶台。", kairo: "news：同行风波" },
  // 街面
  { id: "n_street", kind: "street", line: "{街}的路灯修好了，晚上收摊的人说亮堂多了。", kairo: "news：街区变化" },
  { id: "n_street2", kind: "street", line: "街坊凑钱修的那段路，雨天终于不积水。", kairo: "news：街区变化" },
  { id: "n_street3", kind: "street", line: "巷口的公告栏换了新玻璃，贴的还是有线电视通知。", kairo: "news：街区变化" },
  // 袋装
  { id: "n_pack", kind: "pack", line: "外地的亲戚打电话来，问能不能寄两袋老友粉。", kairo: "news：袋装出货" },
  { id: "n_pack2", kind: "pack", line: "车站那边有人拎着一整箱粉上车，说是带给同事。", kairo: "news：袋装出货" },
  // 兜底
  { id: "n_plain1", kind: "plain", line: "天要转凉了，街上喝汤的人多起来。", kairo: "news：日常" },
  { id: "n_plain2", kind: "plain", line: "菜市的酸笋今天涨价，几个老板在摊前讲价。", kairo: "news：日常" },
  { id: "n_plain3", kind: "plain", line: "修车摊的老陈说，这条街今年比去年热闹。", kairo: "news：日常" },
  { id: "n_plain4", kind: "plain", line: "下午下了半场雨，撑伞来的客人鞋都湿了。", kairo: "news：日常" },
  { id: "n_plain5", kind: "plain", line: "隔壁铺子的小孩放学又来问有没有剩下的粉。", kairo: "news：日常" },
];

export const NEWS_BY_ID: Map<string, NewsDef> = new Map(NEWS.map((n) => [n.id, n]));
export const NEWS_TOTAL = NEWS.length;
export function newsById(id: string): NewsDef | undefined {
  return NEWS_BY_ID.get(id);
}

/** 报纸上最多留几天。再多玩家也不会往回翻。 */
export const NEWS_KEEP = 5;
