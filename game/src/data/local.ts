/**
 * 三处物产（批次九）：南宁各区的真东西，落到已有的三个出口上。
 *
 * 为什么要做这一层：地图此前只是一张「你在哪、谁在抢」的静态图，
 * 十二个区的差别只有人流与转让费两个数。开罗 `region` 表也只有 7 行，
 * 但每一行都带当地物产与用它做出来的那一样东西 —— 地区因此有性格。
 *
 * 三条纪律：
 *   1. **只落在已有出口上**：料钱、饮料成本、耐心，一个新系统都不加。
 *   2. **每一处都要有出处**（见 `source`），不许编。
 *   3. **幅度小**：最多 3% —— 物产是「本地拿货便宜一点」，
 *      不是「换个区换一套数值」。
 */

export type LocalId = "mashan_star_anise" | "wuming_orange" | "hengzhou_jasmine";

export interface LocalSource {
  label: string;
  url: string;
  quote: string;
}

export interface LocalDef {
  id: LocalId;
  /** 物产名：马山八角 */
  name: string;
  /** 用在哪：煸香料 */
  use: string;
  /** 哪个区的 */
  district: string;
  /** 一句话：老板会怎么说这东西 */
  line: string;
  /** 落点与幅度 */
  effect: {
    costPct?: number;
    sideCostPct?: number;
    patiencePct?: number;
  };
  why: string;
  source: readonly LocalSource[];
}

export const LOCALS: readonly LocalDef[] = [
  {
    id: "mashan_star_anise",
    name: "马山八角",
    use: "煸香料",
    district: "mashan",
    line: "山里的八角晒得干，一抓下去香得冲鼻子。",
    effect: { costPct: -0.02 },
    why: "本县就产八角，鲜果按斤收、自家晒场杀青晾晒，少一道外运与批发，香料这一项能省两个点。",
    source: [
      {
        label: "南宁新闻网《马山县古零镇：八角飘香迎丰收》",
        url: "http://www.nnnews.net/p/3227644.html",
        quote: "每年的8月至10月是八角秋果采收季节……全镇种植八角有几千亩。",
      },
      {
        label: "马山电视台《里民秋色浓 八角正飘香》",
        url: "http://www.mashantv.com/content/2026-10/16/009216.html",
        quote: "每年我们晒场能晒500吨左右的八角……长期跟河南「十三香」品牌有合作。",
      },
    ],
  },
  {
    id: "wuming_orange",
    name: "武鸣沃柑",
    use: "做饮料",
    district: "wuming",
    line: "沃柑汁是本地厂里做的，一件比外地运来的便宜。",
    effect: { sideCostPct: -0.03 },
    why: "武鸣是全国最大沃柑产区，本地已有纯沃柑汁与沃柑饮料生产线，进货比外省调的果汁少一段运费与经销层级。",
    source: [
      {
        label: "南宁市水果站《武鸣沃柑》",
        url: "http://ny.nanning.gov.cn/ggbmfw/yzncpcxfw/t6758071.html",
        quote: "武鸣区2025年沃柑种植面积达46万亩，产量超150万吨，占全国沃柑产量的1／5。",
      },
      {
        label: "新华网《2025/2026年销售季武鸣沃柑开市》",
        url: "http://www.gx.news.cn/20260109/b9361316e61745ffb06c7f316f3d4e22/c.html",
        quote: "引进4家沃柑深加工企业，成功研发纯沃柑汁、沃柑饮料、小青柑茶等多元化产品。",
      },
    ],
  },
  {
    id: "hengzhou_jasmine",
    name: "横州茉莉",
    use: "泡茶待客",
    district: "hengzhou",
    line: "花是当天收的，抓一撮冲开，坐下来的人就不催了。",
    effect: { patiencePct: 0.03 },
    why: "横州鲜花产量占全国八成、世界六成，本地买花便宜且新鲜；一碗粉配一杯花茶，等人的火气小一点。",
    source: [
      {
        label: "中国网《广西横州市推动「茉莉花+」多元化发展》",
        url: "https://www.163.com/dy/article/JPVBVSVD05328VPM.html",
        quote: "横州市茉莉鲜花产量占中国总产量80%以上，占世界总量60%以上，被中国花卉协会命名为「中国茉莉之乡」。",
      },
    ],
  },
] as const;

export const LOCAL_TOTAL = LOCALS.length;

export const LOCAL_BY_ID: ReadonlyMap<string, LocalDef> = new Map(LOCALS.map((l) => [l.id, l]));

export function localById(id: string): LocalDef | null {
  return LOCAL_BY_ID.get(id) ?? null;
}

/** 哪个区有什么物产（一个区最多一处，没有就返回 null） */
export function localOfDistrict(district: string): LocalDef | null {
  return LOCALS.find((l) => l.district === district) ?? null;
}
