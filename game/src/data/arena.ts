/**
 * 落场（M4）—— 一天里最热闹的六十分钟。
 *
 * 照开的骨架（`English.lproj__help.txt`）：
 *   Ramen Arena 1：`Judges will give you a score, so try to get the most points
 *                   within the time limit to win. You can get a variety of prizes.`
 *   Ramen Arena 2：`The flavor of the ramen you enter into a contest is converted to
 *                   popularity, while its appeal is converted to charisma.`
 *   Ramen Arena 3：三条命令 —— `Pop Up`（涨人气）/ `Charisma Up`（涨魅力 + 给一位客人 aura）
 *                  / `Spirit Bowl`（全场 aura）
 *   Ramen Arena 4：`Each arena rates richness, aroma, volume and charisma differently.`
 *
 * 我们的做法：挑一个场地、端上你现在卖的这碗粉，60 秒里靠三条命令攒分，
 * 跟本区最强的同行比。分数不是凭空涨，而是**这碗粉在四条轴（味道 / 镬气 / 份量 / 人气）
 * 上的底子**乘出来的 —— 粉做得越好，同一个按钮按下去越值钱。
 *
 * 三条命令全换成本地动作：支摊吆喝 / 端碗露一手 / 一锅端。
 * 名字、文案、画面一律重做，不复用任何原作名词。
 */

/** 场地：不同场地看重的轴不一样（开罗 Arena 4 的原意） */
export type ArenaId = "market" | "river" | "ring";

export interface ArenaAxes {
  /** 味道：这碗粉的总分 */
  taste: number;
  /** 镬气：酸笋 / 辣 / 蒜的浓度 */
  aroma: number;
  /** 份量：二两还是三两 */
  volume: number;
  /** 人气：口碑换算 */
  charm: number;
}

export interface ArenaDef {
  id: ArenaId;
  name: string;
  pitch: string;
  /** 四条轴的分量，和为 1 */
  weight: ArenaAxes;
  /** 门槛：要评到第几段才准上场 */
  minGrade: number;
  /** 对手在这个场地的基础加值（场地越大，来的同行越硬） */
  rivalEdge: number;
  /** 赢了给多少现金（人情与口碑另算） */
  prizeYuan: number;
  /** 南宁话 */
  line: string;
  /** 开罗原句（只进开发注记，不渲染） */
  kairo: string;
}

export const ARENAS: ArenaDef[] = [
  {
    id: "market",
    name: "菜市口早场",
    pitch: "天没亮就摆开，赶早的、上班的、买完菜的，一溜排到摊子前。看的是这碗够不够实在。",
    weight: { taste: 0.4, aroma: 0.15, volume: 0.3, charm: 0.15 },
    minGrade: 0,
    rivalEdge: 0,
    prizeYuan: 800,
    line: "菜市口就认一个「够不够饱」，二两在这里不顶事。",
    kairo: "Ramen Arena 1 — judges score within the time limit",
  },
  {
    id: "river",
    name: "邕江边夜摊",
    pitch: "灯一挂，江风一吹，来的人图个香。镬气和酸笋味越冲，越有人围过来。",
    weight: { taste: 0.25, aroma: 0.4, volume: 0.1, charm: 0.25 },
    minGrade: 3,
    rivalEdge: 6,
    prizeYuan: 1_500,
    line: "江边这摊子不看份量，看你这锅炒得香不香。",
    kairo: "Ramen Arena 4 — each arena rates richness/aroma differently",
  },
  {
    id: "ring",
    name: "老友擂台",
    pitch: "一年到头就开那么几回，敢上台的都是这条街上有名有姓的。样样都得拿得出手。",
    weight: { taste: 0.3, aroma: 0.2, volume: 0.2, charm: 0.3 },
    minGrade: 6,
    rivalEdge: 14,
    prizeYuan: 3_500,
    line: "上擂台不讲情面，四样少一样都被人拿住。",
    kairo: "Ramen Arena 2 — flavor→popularity, appeal→charisma",
  },
];

export const ARENA_BY_ID = new Map(ARENAS.map((a) => [a.id, a]));

/** 键盘 1 / 2 / 3 对应三条命令（写在一处，界面提示也从这里取） */
export const COMMAND_KEY_MAP: Record<string, CommandId> = {
  "1": "holler",
  "2": "show",
  "3": "pot",
};
export function arenaById(id: string): ArenaDef | null {
  return ARENA_BY_ID.get(id as ArenaId) ?? null;
}

/** 三条命令（开罗 Arena 3 的三条，全部换成本地动作） */
export type CommandId = "holler" | "show" | "pot";

export interface CommandDef {
  id: CommandId;
  name: string;
  /** 界面上显示的键位 */
  key: string;
  /** 冷却（毫秒，真实时间） */
  cdMs: number;
  /** 基础分 */
  base: number;
  /** 这条命令吃哪条轴 */
  axis: keyof ArenaAxes;
  /** 出招时的台词（本地句子，不走 AI） */
  line: string;
  kairo: string;
}

export const COMMANDS: CommandDef[] = [
  {
    id: "holler",
    name: "支摊吆喝",
    key: "1",
    cdMs: 2_200,
    base: 14,
    axis: "charm",
    line: "「老友粉——热的——」",
    kairo: "Pop Up: Raise popularity",
  },
  {
    id: "show",
    name: "端碗露一手",
    key: "2",
    cdMs: 3_400,
    base: 16,
    axis: "taste",
    line: "一碗端过去，酸笋豆豉往上一压。",
    kairo: "Charisma Up: raise charisma, aura for one customer",
  },
  {
    id: "pot",
    name: "一锅端",
    key: "3",
    cdMs: 9_000,
    base: 30,
    axis: "aroma",
    line: "锅一掀，半条街都闻到。",
    kairo: "Spirit Bowl: auras for all customers",
  },
];

export const COMMAND_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));
export function commandById(id: string): CommandDef | null {
  return COMMAND_BY_ID.get(id as CommandId) ?? null;
}

/** 一局多长（真实秒数） */
export const ARENA_SECONDS = 60;
/** 一次推进的粒度 */
export const ARENA_TICK_MS = 100;

/** 对手：匀速涨 + 两次爆发（对应开罗「对手会突然发力」的手感） */
export const RIVAL_RATE_PER_SEC = 9.5;
export const RIVAL_BURST_AT = [18_000, 40_000];
export const RIVAL_BURST_GAIN = 26;

/** 一天只能落一次场；再想上就花人情加练 */
export const ARENA_PER_DAY = 1;
export const ARENA_RETRY_FAVOR = 6;
export const ARENA_RETRY_MAX = 1;

/** 赢了给的东西 */
export const ARENA_REWARD = {
  repWin: 0.12,
  repLose: 0.03,
  favorWin: 6,
  favorLose: 2,
  /** 赢的判定：我方分数高出对手这个比例才算赢 */
  winMargin: 0.02,
};

/** 这一碗在四条轴上的底子（0–100 左右，可以超） */
export interface AxisSource {
  total: number;
  soup: readonly number[];
  portion: number;
  reputation: number;
}

export function axesOf(src: AxisSource): ArenaAxes {
  const soup = src.soup;
  // 镬气 = 酸笋 + 辣 + 蒜 的平均浓度（老友粉的「香」全靠这三样）
  const aroma = ((soup[0] ?? 0) + (soup[5] ?? 0) + (soup[6] ?? 0)) / 3;
  return {
    taste: src.total,
    aroma,
    volume: src.portion >= 3 ? 90 : 60,
    charm: Math.max(0, Math.min(100, src.reputation * 20)),
  };
}

/** 场地加权后的「这碗粉值多少」—— 用来算每条命令打出去的分 */
export function baseValueOf(def: ArenaDef, ax: ArenaAxes): number {
  const w = def.weight;
  const weighted =
    ax.taste * w.taste + ax.aroma * w.aroma + ax.volume * w.volume + ax.charm * w.charm;
  return weighted;
}

/**
 * 一条命令打出去得多少分：
 *   基础分 ×（这碗在该轴的底子 / 60）×（1 + 服务手艺 / 200） × 场地加权系数
 * 60 分左右的一碗粉、没人帮忙、三条命令都按到冷却就按，60 秒大概 700–900；
 * 本区同行同期 700–950（看它招牌多硬），所以「粉做得好」和「手快」都得有。
 */
export function commandScore(
  def: ArenaDef,
  cmd: CommandDef,
  ax: ArenaAxes,
  serveSkill: number,
): number {
  const axis = ax[cmd.axis];
  const craft = Math.max(0.35, axis / 60);
  const staff = 1 + Math.max(0, serveSkill) / 200;
  const place = 0.85 + baseValueOf(def, ax) / 400;
  return Math.round(cmd.base * craft * staff * place);
}
