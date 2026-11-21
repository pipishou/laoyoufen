/**
 * 这碗粉叫什么 · 运行时推导（读 state，不改 state）。
 *
 * P46 起主料是**玩家选的 SKU**（`state.main`），不再从在架加料反推 ——
 * 真店菜单上「老友牛肉粉」是固定的一行，跟今天挂不挂牛肉加料无关。
 * 份量同理（`state.portion`：二两 / 三两）。
 */

import { dishName, dishNoteOf, methodOfNoodle, type DishParts, type DishNote } from "../data/dish-name";
import { DEFAULT_PORTION, mainById, portionOf, type MainId, type Portion } from "../data/mains";
import { noodleById } from "../data/noodles";
import { noodleKindOf } from "./noodles";
import { scoreRecipe, type RecipeScore } from "./score";
import { activeSides } from "./sides";
import type { GameState, MenuItem } from "./state";

/** 三件基础味型（酸笋/豆豉/辣椒）是「老友」的本分，不写进名字 */
const BASE_SIDES = new Set(["suansun", "douchi", "lazhi"]);

/** 这碗的主料（玩家在配方页选的） */
export function mainOf(state: GameState): MainId {
  const m = mainById(state.main ?? "pork");
  return (m?.id ?? "pork") as MainId;
}

/** 这碗的份量 */
export function portionSizeOf(state: GameState): Portion {
  return portionOf(state.portion ?? DEFAULT_PORTION).size;
}

/** 除基础味型之外、还挂在架上的加料（写成名尾的「＋」） */
export function extrasOf(state: GameState): string[] {
  return activeSides(state)
    .filter((s) => s.kind === "topping" && !BASE_SIDES.has(s.id))
    .map((s) => s.name.replace(/^加/, ""));
}

export function dishPartsOf(state: GameState): DishParts {
  const noodle = noodleKindOf(state);
  return {
    method: methodOfNoodle(noodle),
    main: mainOf(state),
    noodle,
    portion: portionSizeOf(state),
    extras: extrasOf(state),
    meal: state.sides.mealDeal === true,
  };
}

/** 这一局当前的实时评分（把粉型、主料、份量一起算进去） */
export function scoreOf(state: GameState): RecipeScore {
  return scoreRecipe(state.recipe, state.price, noodleKindOf(state), {
    main: state.main,
    portion: state.portion,
    rice: state.rice,
    bone: state.bone,
  });
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

/**
 * 菜单里某一款叫什么（P47）。
 *
 * 和 `dishNameOf(state)` 的区别：那个读**编辑缓冲**（玩家正在调的那碗），
 * 这个读某一款的存档值 —— 菜单卡片上要同时看到五六款各自的品名。
 */
export function dishNameOfItem(state: GameState, item: MenuItem): string {
  const noodle = item.noodle as Parameters<typeof methodOfNoodle>[0];
  return dishName({
    method: methodOfNoodle(noodle),
    main: (mainById(item.main ?? "pork")?.id ?? "pork") as MainId,
    noodle,
    portion: portionOf(item.portion ?? DEFAULT_PORTION).size,
    extras: extrasOf(state),
    meal: state.sides.mealDeal === true,
  });
}
