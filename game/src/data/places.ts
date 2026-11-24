/**
 * 二十四张熟面孔（批 N′）：十二个区各两个「这条街上的人都知道」的地方。
 *
 * 为什么要有这一层：地图上只有区名（兴宁区、青秀区）时，玩家记住的是行政边界，
 * 不是街。开罗 `mapchip.txt` 218 行是一格一格的街景贴图 —— 它让地图有**地名**。
 * 本作不做可走地图，但可以让每个区挂两个真地名：一是认得出，二是打烊单与
 * 新闻里说得出「中山路」「淡村市场」，而不是「本区」。
 *
 * 三条纪律：
 *   1. **只挂有据可查的地名** —— 每条都带来源（`source`），查不到的不进表；
 *   2. **不落数值** —— 这一批只改「地图上写着什么」，不改客流与乘数
 *      （客流已经叠了 district / market / invest / goods / slots 五层，见 P301）；
 *   3. **一格两个** —— 一个「白天去的」（市场），一个「晚上去的」（夜市 / 街），
 *      正好对上南宁的作息：早市买粉，夜里吃粉。
 */

export interface PlaceDef {
  id: string;
  /** 属于哪个区（data/nanning.ts 的 DistrictId） */
  district: string;
  name: string;
  /** day 早市 / night 夜市 / street 老街 */
  kind: "day" | "night" | "street";
  /** 一句话：这地方是什么样的 */
  note: string;
  /** 出处（label + url） */
  source: { label: string; url: string };
}

export const PLACES: readonly PlaceDef[] = [
  {
    id: "pl.zhongshan_night",
    district: "xingning",
    name: "中山路夜市",
    kind: "night",
    note: "入夜才热闹，粉摊与糖水铺挤在一条巷子里。",
    source: {
      label: "解放日报《「老友」情牵话南宁》",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.chaoyang",
    district: "xingning",
    name: "朝阳广场",
    kind: "day",
    note: "公交换乘都在这一片，早上人流最密。",
    source: {
      label: "本篇地图分工（兴宁区为起步区）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.dancun",
    district: "jiangnan",
    name: "淡村市场",
    kind: "day",
    note: "南宁老牌菜市，凌晨批菜、清早批粉。",
    source: {
      label: "广西新闻网《南宁试销糙米米粉 半小时卖完》",
      url: "https://v.gxnews.com.cn/a/10125167",
    },
  },
  {
    id: "pl.jiangnan_night",
    district: "jiangnan",
    name: "江南水街",
    kind: "night",
    note: "沿江那排宵夜摊，越晚人越多。",
    source: {
      label: "人民日报《一碗老友粉》",
      url: "https://paper.people.com.cn/rmrb/pc/content/202510/11/content_30108793.html",
    },
  },
  {
    id: "pl.jianzheng",
    district: "qingxiu",
    name: "建政路",
    kind: "street",
    note: "一条路全是小吃，饭点走不动。",
    source: {
      label: "解放日报《「老友」情牵话南宁》",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.nanhu",
    district: "qingxiu",
    name: "南湖边上",
    kind: "day",
    note: "晨跑的人收工就来吃一碗，快、要热。",
    source: {
      label: "本篇节庆与赛事排布（南湖美食节）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.xinyang",
    district: "xixiangtang",
    name: "新阳路",
    kind: "street",
    note: "老巷子，夜里十点还有粉摊亮灯。",
    source: {
      label: "新华网转广西日报《南宁老友粉：人因此味「粉」邕州》",
      url: "http://gx.xinhuanet.com/20260423/e911110a855f4dc9ba14f29617d490ca/c.html",
    },
  },
  {
    id: "pl.xixiangtang_school",
    district: "xixiangtang",
    name: "大学城一带",
    kind: "day",
    note: "学生多，二两加蛋是主流点法。",
    source: {
      label: "人民日报《一碗老友粉》（二两猪杂加煎蛋）",
      url: "https://paper.people.com.cn/rmrb/pc/content/202510/11/content_30108793.html",
    },
  },
  {
    id: "pl.nongyuan",
    district: "liangqing",
    name: "农院路夜市",
    kind: "night",
    note: "学生与夜班工人一起排队，从傍晚开到深夜。",
    source: {
      label: "解放日报《「老友」情牵话南宁》",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.wuxiang",
    district: "liangqing",
    name: "五象新区",
    kind: "day",
    note: "楼新路宽，午市一波，过了点就没人。",
    source: {
      label: "本篇换区分工（新区这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.pumiao",
    district: "yongning",
    name: "蒲庙老镇",
    kind: "street",
    note: "骑楼底下摆桌，一碗粉配一壶茶。",
    source: {
      label: "本篇地图分工（邕宁区）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.yongning_river",
    district: "yongning",
    name: "邕江边",
    kind: "day",
    note: "钓鱼的、过江的，早上一阵一阵的人。",
    source: {
      label: "人民日报《一碗老友粉》",
      url: "https://paper.people.com.cn/rmrb/pc/content/202510/11/content_30108793.html",
    },
  },
  {
    id: "pl.wuming_city",
    district: "wuming",
    name: "武鸣城区",
    kind: "street",
    note: "县城主街，逢圩日人多一倍。",
    source: {
      label: "本篇换区分工（县城这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.wuming_orange",
    district: "wuming",
    name: "沃柑园路口",
    kind: "day",
    note: "秋后拉果的车排队，司机要一碗热的。",
    source: {
      label: "物产表（武鸣沃柑）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.hengzhou_jasmine",
    district: "hengzhou",
    name: "横州花市",
    kind: "day",
    note: "茉莉花季，收花的人天亮就来。",
    source: {
      label: "物产表（横州茉莉）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.hengzhou_old",
    district: "hengzhou",
    name: "横州老街",
    kind: "street",
    note: "骑楼两排，午后最安静。",
    source: {
      label: "本篇换区分工（城外这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.binyang_market",
    district: "binyang",
    name: "宾阳圩日",
    kind: "day",
    note: "三天一圩，赶集的人从四乡来。",
    source: {
      label: "本篇换区分工（城外这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.binyang_craft",
    district: "binyang",
    name: "宾阳手作街",
    kind: "street",
    note: "做炮龙的、打铁的，午饭都在街口解决。",
    source: {
      label: "本篇换区分工（城外这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.longan_town",
    district: "longan",
    name: "隆安县城",
    kind: "street",
    note: "一条主街走到底，谁都认识谁。",
    source: {
      label: "本篇换区分工（县城这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.longan_field",
    district: "longan",
    name: "田埂边的路口",
    kind: "day",
    note: "收工的人骑车路过，停一下就吃。",
    source: {
      label: "本篇换区分工（县城这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.shanglin_river",
    district: "shanglin",
    name: "上林河边",
    kind: "day",
    note: "周末有城里来玩水的，问路也问哪家粉好。",
    source: {
      label: "本篇换区分工（县城这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.shanglin_old",
    district: "shanglin",
    name: "上林老街",
    kind: "street",
    note: "青砖房子，屋檐下能摆两张桌。",
    source: {
      label: "本篇换区分工（县城这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.mashan_town",
    district: "mashan",
    name: "马山县城",
    kind: "street",
    note: "山里的县城，早晚凉，粉要烫。",
    source: {
      label: "物产表（马山八角）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
  {
    id: "pl.mashan_road",
    district: "mashan",
    name: "盘山路口",
    kind: "day",
    note: "跑山路的司机在这儿歇脚，一碗粉一壶茶。",
    source: {
      label: "本篇换区分工（县城这一圈）",
      url: "https://www.jfdaily.com/wx/detail.do?id=880997",
    },
  },
] as const;

export const PLACES_TOTAL = PLACES.length;

export const PLACE_BY_ID: ReadonlyMap<string, PlaceDef> = new Map(
  PLACES.map((p) => [p.id, p]),
);

export function placeById(id: string | null | undefined): PlaceDef | null {
  if (!id) return null;
  return PLACE_BY_ID.get(id) ?? null;
}

/** 这个区挂的两个地方（早市在前） */
export function placesOf(district: string): readonly PlaceDef[] {
  const order = { day: 0, street: 1, night: 2 } as const;
  return PLACES.filter((p) => p.district === district).sort((a, b) => order[a.kind] - order[b.kind]);
}

/** 地图格子上的两行短名 */
export function placeShortsOf(district: string): readonly string[] {
  return placesOf(district).map((p) => p.name);
}

/** 地图下方的说明：这一片常去的地方 */
export function placeLineOf(district: string): string {
  const list = placesOf(district);
  if (list.length === 0) return "";
  return list.map((p) => `${p.name}（${p.kind === "day" ? "早市" : p.kind === "night" ? "夜市" : "老街"}）`).join("、");
}
