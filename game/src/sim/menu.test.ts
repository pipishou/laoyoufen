/**
 * 多款粉同时上菜单（P47）的回归锁。
 *
 * 这一套的核心是两件事：
 * ① **菜单位跟段位走** —— 小摊只挂得起一款，评到第 10 段才有六款；
 * ② **编辑缓冲** —— 配方页的滑块改的是「正在调的那一款」，
 *    切款时必须先落笔，否则改了半天是改空气。
 */

import { describe, expect, it } from "vitest";
import { menuCapOf, MENU_MAX } from "../data/menu";
import { START_MAIN } from "../data/mains";
import { START_NOODLE } from "../data/noodles";
import { priceTolerance } from "./score";
import {
  addDish,
  cheapestPrice,
  currentDish,
  dishPrice,
  menuCap,
  menuStoreScore,
  menuSummary,
  menuViews,
  pickDish,
  removeDish,
  scoreDish,
  selectDish,
  syncEditing,
  toggleDish,
} from "./menu";
import { createInitialState, SAVE_VERSION, type GameState } from "./state";
import { deserialize, serialize } from "./save";
import { openForBusiness } from "./setup";

function fresh(): GameState {
  const s = createInitialState("menu-test", 7);
  // 必须真开张：存档校验要求 setup 之外有 site/shopName，否则 deserialize 直接判废
  openForBusiness(s, "alley", "测试老友粉");
  s.gradeLevel = 10; // 菜单位开满，便于测边界
  return s;
}

describe("菜单位（P47）", () => {
  it("菜单位跟段位走：0 段 1 款，10 段 6 款", () => {
    expect(menuCapOf(0)).toBe(1);
    expect(menuCapOf(1)).toBe(1);
    expect(menuCapOf(2)).toBe(2);
    expect(menuCapOf(9)).toBe(5);
    expect(menuCapOf(10)).toBe(MENU_MAX);
    expect(menuCapOf(99)).toBe(MENU_MAX);
  });

  it("新局只有一款，而且就是编辑缓冲那一款", () => {
    const s = createInitialState("menu-test", 7);
    expect(s.menu).toHaveLength(1);
    expect(s.editing).toBe(0);
    const d = currentDish(s);
    expect(d.noodle).toBe(START_NOODLE);
    expect(d.main).toBe(START_MAIN);
    expect(d.on).toBe(true);
  });

  it("加款：复制当前款、价 +1、自动切到新款", () => {
    const s = fresh();
    s.price = 10;
    s.menu[0]!.price = 10;
    const r = addDish(s);
    expect(r.ok).toBe(true);
    expect(s.menu).toHaveLength(2);
    expect(s.menu[1]!.price).toBe(11);
    expect(s.menu[1]!.sold).toBe(0);
    expect(s.editing).toBe(1);
    expect(s.price).toBe(11);
  });

  it("菜单位满了就加不了", () => {
    const s = fresh();
    s.gradeLevel = 0;
    expect(menuCap(s)).toBe(1);
    const r = addDish(s);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("菜单位满了");
  });

  it("至少留一款在卖：删到最后一款要拒绝，下架最后一款也要拒绝", () => {
    const s = fresh();
    addDish(s);
    addDish(s);
    expect(s.menu).toHaveLength(3);
    toggleDish(s, 1);
    toggleDish(s, 2);
    // 只剩第 0 款在架，再下架就该拒绝
    expect(toggleDish(s, 0).ok).toBe(false);
    // 删掉两款之后只剩一款，再删就该拒绝
    removeDish(s, 2);
    removeDish(s, 1);
    expect(s.menu).toHaveLength(1);
    expect(removeDish(s, 0).ok).toBe(false);
  });

  it("删掉正在编辑的那款，编辑指针要落到合法的款上", () => {
    const s = fresh();
    addDish(s);
    addDish(s);
    selectDish(s, 2);
    expect(s.editing).toBe(2);
    removeDish(s, 2);
    expect(s.menu).toHaveLength(2);
    expect(s.editing).toBeGreaterThanOrEqual(0);
    expect(s.editing).toBeLessThan(s.menu.length);
  });
});

describe("编辑缓冲（P47）", () => {
  it("改缓冲不落笔，切款就丢；syncEditing 落笔后切回来还在", () => {
    const s = fresh();
    const before = s.menu[0]!.price;
    s.price = before + 3;
    // 没落笔直接切款 —— 这一款的价不该被改
    selectDish(s, 0);
    expect(s.menu[0]!.price).toBe(before);

    s.price = before + 3;
    syncEditing(s);
    addDish(s); // 加款会自动切到新款
    expect(s.menu[0]!.price).toBe(before + 3);
    selectDish(s, 0);
    expect(s.price).toBe(before + 3);
  });

  it("切款会把选中款的配方读进缓冲", () => {
    const s = fresh();
    addDish(s);
    s.recipe.soup[0] = 77;
    syncEditing(s);
    selectDish(s, 0);
    expect(s.recipe.soup[0]).not.toBe(77);
  });
});

describe("客人挑款（P47）", () => {
  it("钱包太薄时一款都买不起，返回 null", () => {
    const s = fresh();
    s.price = 20;
    s.menu[0]!.price = 20;
    const tol = priceTolerance(scoreDish(s.menu[0]!).total);
    const tooThin = Math.floor(20 / tol) - 1;
    expect(pickDish(s, tooThin, 0.5)).toBeNull();
    expect(cheapestPrice(s)).toBe(20);
  });

  it("两百次挑款里，便宜款被点到的次数明显更多", () => {
    const s = fresh();
    s.price = 10;
    s.menu[0]!.price = 8;
    addDish(s);
    s.menu[1]!.price = 18;
    const counts = [0, 0];
    for (let i = 0; i < 200; i++) {
      const d = pickDish(s, 30, (i + 0.5) / 200);
      if (!d) continue;
      const idx = s.menu.findIndex((x) => x.id === d.id);
      if (idx >= 0) counts[idx]! += 1;
    }
    expect(counts[0]! + counts[1]!).toBeGreaterThan(150);
    expect(counts[0]!).toBeGreaterThan(counts[1]!);
  });

  it("下架的款不会被点到", () => {
    const s = fresh();
    addDish(s);
    toggleDish(s, 1);
    for (let i = 0; i < 40; i++) {
      const d = pickDish(s, 40, (i + 0.5) / 40);
      expect(d?.id).not.toBe(s.menu[1]!.id);
    }
  });

  it("多挂一款，店铺吸引力略涨（开罗：人气按菜单聚合）", () => {
    const s = fresh();
    const one = menuStoreScore(s);
    addDish(s);
    const two = menuStoreScore(s);
    expect(two).toBeGreaterThan(one);
    expect(two / one).toBeLessThan(1.06);
  });

  it("菜单价 = 基础价 + 份量加价", () => {
    const s = fresh();
    s.menu[0]!.price = 10;
    s.menu[0]!.portion = 3;
    expect(dishPrice(s.menu[0]!)).toBe(12);
  });

  it("menuSummary 说清在架几款、卖了几碗", () => {
    const s = fresh();
    addDish(s);
    s.menu[0]!.sold = 12;
    s.menu[1]!.sold = 5;
    const txt = menuSummary(s);
    expect(txt).toContain("2/");
    expect(txt).toContain("17");
  });

  it("menuViews 标出正在编辑的那款", () => {
    const s = fresh();
    addDish(s);
    selectDish(s, 0);
    const views = menuViews(s);
    expect(views[0]!.editing).toBe(true);
    expect(views[1]!.editing).toBe(false);
    expect(views[1]!.canRemove).toBe(true);
  });
});

describe("存档 v18（P47）", () => {
  it("菜单存得住：两款、价格、累计卖出、编辑指针", () => {
    const s = fresh();
    s.price = 10;
    s.menu[0]!.price = 10;
    addDish(s);
    s.menu[1]!.price = 13;
    s.menu[1]!.sold = 9;
    const back = deserialize(serialize(s))!;
    expect(back.saveVersion).toBe(SAVE_VERSION);
    expect(back.menu).toHaveLength(2);
    expect(back.menu[1]!.price).toBe(13);
    expect(back.menu[1]!.sold).toBe(9);
    expect(back.editing).toBe(1);
  });

  it("v17 老档没有 menu：把那一碗变成菜单第一款", () => {
    const s = fresh();
    s.price = 11;
    const raw = JSON.parse(serialize(s));
    raw.saveVersion = 17;
    delete raw.menu;
    delete raw.editing;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.menu).toHaveLength(1);
    expect(back.menu[0]!.price).toBe(11);
    expect(back.menu[0]!.on).toBe(true);
    expect(back.editing).toBe(0);
  });

  it("存档里的款有坏值：主料回碎肉、份量回二两、销量回 0", () => {
    const s = fresh();
    addDish(s);
    const raw = JSON.parse(serialize(s));
    raw.menu[1].main = "不存在的主料";
    raw.menu[1].portion = 5;
    raw.menu[1].sold = "很多";
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.menu[1]!.main).toBe(START_MAIN);
    expect(back.menu[1]!.portion).toBe(2);
    expect(back.menu[1]!.sold).toBe(0);
  });
});
