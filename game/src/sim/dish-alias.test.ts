import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { DISH_ALIAS_MAX, dishNameOfItem, renameDish } from "./dish";
import { addDish } from "./menu";

function fresh() {
  const s = createInitialState("alias-test", 11);
  s.gradeLevel = 6;
  return s;
}

describe("菜单改名（批 M′，对应开罗 ramen_name）", () => {
  it("改完卡片名就变，系统名还在 dishNameOf 里", () => {
    const s = fresh();
    addDish(s);
    const item = s.menu[0]!;
    const before = dishNameOfItem(s, item);
    const r = renameDish(s, item.id, "阿婆那碗");
    expect(r.ok).toBe(true);
    expect(r.line).toContain("阿婆那碗");
    expect(dishNameOfItem(s, item)).toBe("阿婆那碗");
    expect(before).not.toBe("阿婆那碗");
  });

  it("留空就改回系统名，别名彻底删掉（存档里不留空字符串）", () => {
    const s = fresh();
    addDish(s);
    const item = s.menu[0]!;
    const sys = dishNameOfItem(s, item);
    renameDish(s, item.id, "试试");
    const back = renameDish(s, item.id, "   ");
    expect(back.ok).toBe(true);
    expect(back.line).toContain("改回");
    expect(dishNameOfItem(s, item)).toBe(sys);
    expect(s.menuAlias?.[String(item.id)]).toBeUndefined();
  });

  it("最多八个字，尖括号与换行去掉", () => {
    const s = fresh();
    addDish(s);
    const item = s.menu[0]!;
    renameDish(s, item.id, "一二三四五六七八九十");
    expect(dishNameOfItem(s, item)).toBe("一二三四五六七八九十".slice(0, DISH_ALIAS_MAX));
    renameDish(s, item.id, "<b>坏</b>");
    expect(dishNameOfItem(s, item)).not.toContain("<");
    expect(dishNameOfItem(s, item)).not.toContain(">");
  });

  it("只改这一款，别的款不动；删掉的 id 不会串名", () => {
    const s = fresh();
    addDish(s);
    addDish(s);
    const a = s.menu[0]!;
    const b = s.menu[1]!;
    const bName = dishNameOfItem(s, b);
    renameDish(s, a.id, "第一款");
    expect(dishNameOfItem(s, a)).toBe("第一款");
    expect(dishNameOfItem(s, b)).toBe(bName);
  });

  it("菜单上没有的 id 直接拒，不改状态", () => {
    const s = fresh();
    addDish(s);
    const r = renameDish(s, 99999, "无中生有");
    expect(r.ok).toBe(false);
    expect(r.reason.length).toBeGreaterThan(2);
    expect(Object.keys(s.menuAlias ?? {}).length).toBe(0);
  });

  it("存档往返带上别名（不升 saveVersion，字段是可选的）", () => {
    const s = fresh();
    addDish(s);
    const item = s.menu[0]!;
    renameDish(s, item.id, "老板真传");
    expect(s.menuAlias).toBeTruthy();
    expect(s.menuAlias?.[String(item.id)]).toBe("老板真传");
  });
});
