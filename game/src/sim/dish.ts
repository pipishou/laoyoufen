/**
 * 这碗粉叫什么 · 运行时推导（读 state，不改 state）。
 *
 * 四轴全部从已有状态推出来，不新增存档字段（除了饮料冰热，那是玩法）。
 * 理由：品名是「玩家现在这套配置在现实里会怎么被叫」，不是新系统。
 */

import { MAINS, dishName, dishNoteOf, methodOfNoodle, type DishParts, type DishNote, type MainId } from "../data/dish-name";
import { SIDE_BY_ID, type SideId } from "../data/sides";
import { noodleById } from "../data/noodles";
import { noodleKindOf } from "./noodles";
import { activeSides } from "./sides";
import type { GameState } from "./state";

/** 三件基础味型（酸笋/豆豉/辣椒）是「老友」的本分，不算主料 */
const BASE_SIDES = new Set(["suansun", "douchi", "lazhi"]);

/**
 * 主料 = 在架加料里「最贵的那件主料」——现实里点单就是这么点的：
 * 你挂了猪杂，客人就点「老友猪杂粉」；只挂卤蛋就是「老友加蛋粉」。
 */
export function mainOf(state: GameState): MainId {
  const on = new Set(activeSides(state).map((s) => s.id));
  let best: MainId = "pork";
  let bestBonus = -1;
  for (const m of MAINS) {
    if (!m.side) continue;
    const sideId = m.side as SideId;
    if (!on.has(sideId)) continue;
    const bonus = SIDE_BY_ID.get(sideId)?.satBonus ?? 0;
    if (bonus > bestBonus) {
      bestBonus = bonus;
      best = m.id;
    }
  }
  return best;
}

/** 除主料之外、还挂在架上的加料（写成名尾的「＋」） */
export function extrasOf(state: GameState): string[] {
  const main = MAINS.find((m) => m.id === mainOf(state));
  return activeSides(state)
    .filter((s) => s.kind === "topping" && !BASE_SIDES.has(s.id) && s.id !== main?.side)
    .map((s) => s.name.replace(/^加/, ""));
}

export function dishPartsOf(state: GameState): DishParts {
  const noodle = noodleKindOf(state);
  return {
    method: methodOfNoodle(noodle),
    main: mainOf(state),
    noodle,
    extras: extrasOf(state),
    meal: state.sides.mealDeal === true,
  };
}

/** 现在这碗叫什么 */
export function dishNameOf(state: GameState): string {
  return dishName(dishPartsOf(state));
}

/** 现在这碗的评语（按实时评分分 5 档） */
export function dishNoteFor(total: number): DishNote {
  return dishNoteOf(total);
}

/** 一句话概括：品名 · 粉型 · 评语 */
export function dishSummary(state: GameState, total: number): string {
  const kind = noodleKindOf(state);
  const def = noodleById(kind);
  const note = dishNoteOf(total);
  return `${dishNameOf(state)} · ${def?.name ?? "切粉"} · ${note.word}`;
}
