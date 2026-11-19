/**
 * 家当搭配（D 批）：八组「两件凑一块才有的那点好处」
 *
 * 出处与本地化取舍：
 *   开罗 `build_combo.txt` 38 行 = 10 个组合名 × 若干「件 A + 件 B」对，
 *   列形如 `7  Comfy Corner  1  2  2  -1  199  2  -1  184  10`，
 *   末尾那个 1/2/8/10 是这一组要求的店铺等级。
 *   → 结构照抄（一组可以由多对达成、要等级），内容全换：
 *     开罗的 Corner 是「摆出个角落」，我们这八组都取自店里真会挨着放的东西，
 *     名字用南宁话的说法，不再是「Plant Corner / Gym Style」式的英文格子。
 *
 * 三条纪律：
 *   ① 每组只吃「已经存在的两件家当」，不新增可买件（P73 的缺口就是这么补的）；
 *   ② 加成落在既有八个乘数上（`sim/gear.ts`），不新开入口；
 *   ③ 八组全凑齐的总量有上限（见 `sim/combo.ts` 的 CAP），免得叠成无敌。
 */
import type { GearId } from "./gear";

export type ComboId =
  | "tank"
  | "stools"
  | "clean"
  | "wash"
  | "breeze"
  | "manners"
  | "street"
  | "front";

export interface ComboEffect {
  attractPct?: number;
  servePct?: number;
  costPct?: number;
  satBonus?: number;
  patiencePct?: number;
  drinkPct?: number;
  fatiguePct?: number;
  rivalShieldPct?: number;
}

export interface ComboDef {
  id: ComboId;
  name: string;
  /** 任一对凑齐即算成立（对应开罗同一组合名多行件对） */
  pairs: [GearId, GearId][];
  note: string;
  line: string;
  effect: ComboEffect;
  kairo: string;
}

export const COMBOS: ComboDef[] = [
  {
    id: "tank",
    name: "一坛一缸",
    pairs: [["sour_plum", "freezer"]],
    note: "冰柜镇着，酸梅汤桶就敢多备；客人要冻的、要冰的，都有。",
    line: "天热的时候，一桶酸梅汤见底比粉还快。",
    effect: { drinkPct: 0.08, costPct: 0.02 },
    kairo: "Comfy Corner（199+184，Lv10）",
  },
  {
    id: "stools",
    name: "凳子管够",
    pairs: [["plastic_stool", "bamboo_chair"]],
    note: "矮凳给人坐，躺椅给等久了的人靠；站着等的火气消一半。",
    line: "有得坐就没人催，催的都是没位子的。",
    effect: { patiencePct: 0.06 },
    kairo: "Basic Corner（185+195，Lv1）",
  },
  {
    id: "clean",
    name: "灶前清爽",
    pairs: [["hood", "aroma_fan"]],
    note: "油烟抽走、热气排掉，灶前站得住人，出碗就顺。",
    line: "灶前不呛人，人才待得住。",
    effect: { patiencePct: 0.05, servePct: 0.03 },
    kairo: "Green Corner（214+213，Lv2）",
  },
  {
    id: "wash",
    name: "洗得干净",
    pairs: [["wash_sink", "big_board"]],
    note: "碗随手冲、案板随手刮；一件不占地，一件不返工。",
    line: "碗要现洗，案板要现刮，客人才看得下去。",
    effect: { servePct: 0.04, costPct: 0.02 },
    kairo: "Stall Corner（195+197，Lv2）",
  },
  {
    id: "breeze",
    name: "风对流",
    pairs: [["wall_fan", "aroma_fan"]],
    note: "一个往人身上吹，一个往外头抽；夏天这两件是配套的。",
    line: "南宁的六月，风不对流，人就坐不住。",
    effect: { fatiguePct: 0.08 },
    kairo: "Audio System（191+190，Lv2）",
  },
  {
    id: "manners",
    name: "会做人",
    pairs: [["serve_manual", "banner"]],
    note: "记着老客的口味，门口还有街坊送的锦旗；两样都是「人」的事。",
    line: "会做生意的，先会做人。",
    effect: { satBonus: 1, patiencePct: 0.04 },
    kairo: "Leaflet Corner（209+210，Lv2）",
  },
  {
    id: "street",
    name: "这条街都认",
    pairs: [["banner", "lucky_statue"]],
    note: "锦旗是街坊给的，祖师像是同行都服的；挂一起，别家就少来抢客。",
    line: "这条街的人，认你这块牌子。",
    effect: { rivalShieldPct: 0.08 },
    kairo: "Art Festival（199+198，Lv8）",
  },
  {
    id: "front",
    name: "开门见山",
    pairs: [["lucky_statue", "serve_manual"]],
    note: "门口摆祖师像、柜上放待客笔记；进门头一眼就知道这家做什么的。",
    line: "门口一亮，人就知道里头有粉吃。",
    effect: { attractPct: 0.05, satBonus: 1 },
    kairo: "Park Style（196+201，Lv2）",
  },
];

export const COMBO_BY_ID = new Map<string, ComboDef>(COMBOS.map((c) => [c.id, c]));
export const COMBO_TOTAL = COMBOS.length;

export function comboById(id: string): ComboDef | null {
  return COMBO_BY_ID.get(id) ?? null;
}
