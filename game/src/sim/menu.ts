import { MAINS, portionOf } from "../data/mains";
import { menuCapOf } from "../data/menu";
import { priceTolerance, scoreRecipe, type RecipeScore } from "./score";
import { recipeSaleFavor } from "../data/favor";
import type { NoodleId } from "../data/noodles";
import type { GameState, MenuItem } from "./state";

/**
 * 菜单（P47）：同时卖多款粉。
 *
 * 结构上只做一件事——把「一碗」变成「一排」。剩下的都从这里长出来：
 * 客人进店自己挑、每款各算各的成本与满意、菜单里的人气是各款聚合
 * （开罗 `Shop Stats`：「popularity and charisma are calculated based on the
 * total values of the dishes it sells」）。
 *
 * 编辑模型：`state.recipe / price / noodle / main / portion` 是**当前编辑款**的
 * 缓冲，配方页的滑块改缓冲，落笔时 `syncEditing()` 写回 `menu[editing]`。
 * 这样 200 多条既有测试与三个探针都不用改。
 */

/** 这一段（第 `gradeLevel` 段）能挂几款 */
export function menuCap(state: GameState): number {
  return menuCapOf(state.gradeLevel);
}

/** 正在编辑的那一款；索引越界时退回第一款（存档坏了也不崩） */
export function currentDish(state: GameState): MenuItem {
  const i = state.editing;
  const item = state.menu[i] ?? state.menu[0];
  if (item) return item;
  // 理论上不会到这：menu 至少有一款。真到了就造一个临时的，别让调用方炸。
  return {
    id: 0,
    recipe: state.recipe,
    noodle: state.noodle,
    main: state.main,
    portion: state.portion,
    price: state.price,
    on: true,
    sold: 0,
  };
}

/** 在架的款（客人只能点这些） */
export function activeDishes(state: GameState): MenuItem[] {
  return state.menu.filter((d) => d.on);
}

/** 这款的一碗价：菜单价 + 份量加成（三两 +¥2，见 `data/mains.ts`） */
export function dishPrice(item: MenuItem): number {
  return item.price + portionOf(item.portion).priceDelta;
}

/**
 * 这款的评分（成本里含主料与份量的料钱）。
 *
 * `state` 只用来读进货档（A5 的米与骨）：缺省时走默认档，历史断言全部不变。
 */
export function scoreDish(item: MenuItem, state?: GameState): RecipeScore {
  return scoreRecipe(item.recipe, item.price, item.noodle as NoodleId, {
    main: item.main,
    portion: item.portion,
    rice: state?.rice,
    bone: state?.bone,
  });
}

/** 把编辑缓冲写回当前款（改完滑块/换粉/换主料/改价都要落一次笔） */
export function syncEditing(state: GameState): void {
  const item = state.menu[state.editing];
  if (!item) return;
  item.price = state.price;
  item.noodle = state.noodle;
  item.main = state.main;
  item.portion = state.portion;
  item.recipe = {
    soup: state.recipe.soup.slice() as typeof state.recipe.soup,
    noodle: state.recipe.noodle.slice() as typeof state.recipe.noodle,
    toppings: state.recipe.toppings.slice(),
  };
}

/** 切到另一款编辑：先把当前款的改动落笔，再把新款读进缓冲 */
export function selectDish(state: GameState, index: number): { ok: boolean; reason?: string } {
  if (!Number.isInteger(index) || index < 0 || index >= state.menu.length) {
    return { ok: false, reason: "没有这一款" };
  }
  if (index === state.editing) return { ok: true };
  syncEditing(state);
  const item = state.menu[index] as MenuItem;
  state.editing = index;
  state.price = item.price;
  state.noodle = item.noodle;
  state.main = item.main;
  state.portion = item.portion;
  state.recipe = {
    soup: item.recipe.soup.slice() as typeof state.recipe.soup,
    noodle: item.recipe.noodle.slice() as typeof state.recipe.noodle,
    toppings: item.recipe.toppings.slice(),
  };
  return { ok: true };
}

/** 菜单款的展示数据 */
export interface MenuView {
  index: number;
  item: MenuItem;
  score: RecipeScore;
  price: number;
  sold: number;
  editing: boolean;
  /** 第一款永远能下架，最后一款不行（店里总得有一款在卖） */
  canRemove: boolean;
  canToggle: boolean;
}

export function menuViews(state: GameState): MenuView[] {
  const onCount = state.menu.filter((d) => d.on).length;
  return state.menu.map((item, index) => {
    const sc = scoreDish(item, state);
    return {
      index,
      item,
      score: sc,
      price: dishPrice(item),
      sold: item.sold,
      editing: index === state.editing,
      canRemove: state.menu.length > 1,
      canToggle: !item.on || onCount > 1,
    };
  });
}

/**
 * 加一款：复制当前编辑的配方（灵感是老店推新品：先照着卖得好的改）。
 * 新款默认价 +1，先上架；菜单位不够就拒绝。
 */
export function addDish(state: GameState): { ok: boolean; reason?: string } {
  const cap = menuCap(state);
  if (state.menu.length >= cap) {
    const need = state.gradeLevel + 2;
    return { ok: false, reason: `菜单位满了（${state.menu.length}/${cap}）—— 评到第 ${need} 段能再挂一款` };
  }
  syncEditing(state);
  const src = currentDish(state);
  const nextId = state.menu.reduce((m, d) => Math.max(m, d.id), 0) + 1;
  /**
   * 新款默认换一个菜单里还没人用的主料。
   *
   * 不然点「加一款」出来的是两碗一模一样的老友粉，玩家还得自己点主料卡才分得开 ——
   * 真店的菜单也不是这么长的：老友粉 / 老友猪杂粉 / 老友牛肉粉，
   * 每加一行就换一样东西（开罗买新店同理，加的是「新的一行」）。
   */
  const usedMains = new Set(state.menu.map((d) => d.main));
  const spareMain =
    MAINS.filter((m) => m.needCustomers <= state.totalCustomers && !usedMains.has(m.id)).sort(
      (a, b) => b.satBonus - a.satBonus || a.costYuan - b.costYuan,
    )[0] ?? null;
  state.menu.push({
    id: nextId,
    recipe: {
      soup: src.recipe.soup.slice() as typeof src.recipe.soup,
      noodle: src.recipe.noodle.slice() as typeof src.recipe.noodle,
      toppings: src.recipe.toppings.slice(),
    },
    noodle: src.noodle,
    main: spareMain?.id ?? src.main,
    portion: src.portion,
    price: Math.min(src.price + 1, 30),
    on: true,
    sold: 0,
  });
  return selectDish(state, state.menu.length - 1);
}

/** 删掉一款（至少留一款） */
export function removeDish(state: GameState, index: number): { ok: boolean; reason?: string } {
  if (state.menu.length <= 1) return { ok: false, reason: "至少要留一款在卖" };
  if (!Number.isInteger(index) || index < 0 || index >= state.menu.length) {
    return { ok: false, reason: "没有这一款" };
  }
  state.menu.splice(index, 1);
  // 编辑指针跟着收：删的是当前款或前面的款，索引都可能越界
  const next = Math.max(0, Math.min(state.editing > index ? state.editing - 1 : state.editing, state.menu.length - 1));
  state.editing = -1; // 强制 selectDish 走一次全量加载
  return selectDish(state, next);
}

/**
 * 转手：把这一款卖掉（开罗 `▼Ramen Lab 1`：`You can sell unneeded ramen recipes here. …
 * Get Spirit Points`）。和「下架」不同 —— 下架只是收进柜子，转手是真的给出去了，
 * 换来的是人情，而且这一款就从菜单上消失了。
 */
export function sellRecipe(
  state: GameState,
  index: number,
): { ok: boolean; reason?: string; favor?: number } {
  const item = state.menu[index];
  if (!item) return { ok: false, reason: "没有这一款" };
  if (state.menu.length <= 1) return { ok: false, reason: "至少要留一款在卖，转不了" };
  const favor = recipeSaleFavor(scoreDish(item, state).total, item.sold ?? 0);
  const removed = removeDish(state, index);
  if (!removed.ok) return { ok: false, reason: removed.reason };
  // 成就（B 批）要记「转过一次方子」，这个计数只增不减，跟着存档走。
  state.tally.recipesSold = (state.tally.recipesSold ?? 0) + 1;
  // 人情在这里只算不落账：`sim/menu.ts` 不依赖 `sim/favor.ts`，
  // 由调用方（main.ts）拿去 `addFavorFree` 并发提示。
  return { ok: true, favor };
}

/** 上架 / 下架（至少留一款在卖） */
export function toggleDish(state: GameState, index: number): { ok: boolean; reason?: string } {
  const item = state.menu[index];
  if (!item) return { ok: false, reason: "没有这一款" };
  if (item.on && state.menu.filter((d) => d.on).length <= 1) {
    return { ok: false, reason: "至少留一款在卖，不然今天没东西卖" };
  }
  item.on = !item.on;
  return { ok: true };
}

/**
 * 客人挑款（开罗：客人到售卖机前按钱包和喜好选一张券）。
 *
 * `wallet` 是他的预算；`roll` 是他这一下的随机（用 state.rng 的 nextFloat）。
 * 规则：
 *  1. 只看得起在架款中**他买得起**的（价 ≤ 钱包 × 品质溢价）；
 *  2. 买得起但明显超出钱包的款，权重打折（开罗 `Customers 1`：超出钱包的更难卖）；
 *  3. 味道好的款权重更高 —— 但别做成「永远点最好的那款」，否则菜单等于 1 款。
 */
export function pickDish(state: GameState, wallet: number, roll: number): MenuItem | null {
  const dishes = activeDishes(state);
  if (dishes.length === 0) return null;
  /**
   * 容忍价按**店里最好的那碗**算，不按这一款自己的味道算。
   *
   * 客人在门口看到的是「这家店手艺怎么样」，不是逐款体检 ——
   * 按款算会把便宜款判成「没资格卖贵」（味道低 → 容忍 1.0），
   * 于是同一家店的贵款全被挡回来，菜单做多反而摊薄客单价（P47 替身实测）。
   */
  const shopTolerance = priceTolerance(menuBestTaste(state));
  const affordable: { item: MenuItem; weight: number }[] = [];
  for (const item of dishes) {
    const sc = scoreDish(item, state);
    const price = dishPrice(item);
    if (price > wallet * shopTolerance) continue;
    // 味道 0–100 → 权重 0.1–1.0；价格相对钱包越贵，权重越低
    const tasteW = Math.max(0.1, sc.total / 100);
    const priceW = Math.max(0.25, Math.min(1, (wallet * 1.6 - price) / (wallet * 1.6)));
    affordable.push({ item, weight: tasteW * priceW });
  }
  if (affordable.length === 0) return null;
  const total = affordable.reduce((n, x) => n + x.weight, 0);
  let acc = 0;
  const target = roll * total;
  for (const x of affordable) {
    acc += x.weight;
    if (target <= acc) return x.item;
  }
  return (affordable[affordable.length - 1] as { item: MenuItem }).item;
}

/** 最便宜的在架款价格（没人买得起时，流失原因要说出这个数） */
export function cheapestPrice(state: GameState): number {
  const dishes = activeDishes(state);
  if (dishes.length === 0) return 0;
  return dishes.reduce((m, d) => Math.min(m, dishPrice(d)), Infinity);
}

/**
 * 菜单的「门面分」= 各款店分里最高的那款。
 * 开罗是各款聚合（total values of the dishes it sells）；我们取最高再
 * 加一点「款数」奖励 —— 卖得多款的店，路过的人更容易被吸引。
 */
export function menuStoreScore(state: GameState): number {
  let best = 0;
  for (const item of activeDishes(state)) {
    const sc = scoreDish(item, state);
    if (sc.storeScore > best) best = sc.storeScore;
  }
  const n = activeDishes(state).length;
  return best * (1 + Math.min(0.15, (n - 1) * 0.03));
}

/** 菜单里味道最好的那碗（HUD/日结用） */
export function menuBestTaste(state: GameState): number {
  let best = 0;
  for (const item of activeDishes(state)) {
    const sc = scoreDish(item, state);
    if (sc.total > best) best = sc.total;
  }
  return best;
}

export function menuSummary(state: GameState): string {
  const on = activeDishes(state);
  const cap = menuCap(state);
  const sold = on.reduce((n, d) => n + d.sold, 0);
  return `${on.length}/${cap} 款在架 · 累计卖出 ${sold} 碗`;
}

/** 把某一款卖出一碗记到账上（顾客结账时调） */
export function recordDishSale(state: GameState, dishId: number): void {
  const item = state.menu.find((d) => d.id === dishId);
  if (item) item.sold += 1;
}
