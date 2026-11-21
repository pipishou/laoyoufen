import { describe, expect, it } from "vitest";
import { dishName, dishNoteOf, methodOfNoodle, DISH_NOTES } from "../data/dish-name";
import { tempFitOf, DRINK_TEMP_BONUS } from "../data/sides";
import { dishNameOf, extrasOf, mainOf } from "./dish";
import { setDrinkTemp, drinkTempSummary } from "./sides";
import { createInitialState, SAVE_VERSION, type GameState } from "./state";
import { openForBusiness } from "./setup";
import { serialize, deserialize } from "./save";

function fresh(): GameState {
  const s = createInitialState("dish-test", 7);
  openForBusiness(s, "alley", "测试老友粉");
  s.totalCustomers = 3000; // 加料全部解锁
  return s;
}

describe("这碗粉叫什么（P43）", () => {
  it("默认配置就是「老友粉」——汤粉、切粉、碎肉，一个字都不多", () => {
    const s = fresh();
    expect(mainOf(s)).toBe("pork");
    expect(dishNameOf(s)).toBe("老友粉");
  });

  it("选了猪杂做主料就叫「老友猪杂粉」（P46 起主料是选的，不从加料反推）", () => {
    const s = fresh();
    s.main = "offal";
    s.sides.active = ["suansun", "douchi", "lazhi", "fuzhu"];
    expect(mainOf(s)).toBe("offal");
    expect(dishNameOf(s)).toBe("老友猪杂粉＋腐竹");
  });

  it("主料是碎肉时，猪杂只是加料，名字里挂在＋尾巴上", () => {
    const s = fresh();
    s.sides.active = ["suansun", "douchi", "lazhi", "zhuzai"];
    expect(mainOf(s)).toBe("pork");
    expect(dishNameOf(s)).toBe("老友粉＋猪杂");
  });

  it("粉型把名字改掉：干捞 / 砂锅 / 圆粉 / 伊面 / 湿面", () => {
    const s = fresh();
    s.sides.active = ["suansun", "douchi", "lazhi", "ludan"];
    s.noodle = "dry";
    expect(dishNameOf(s)).toBe("干捞老友粉＋卤蛋");
    s.noodle = "claypot";
    expect(dishNameOf(s)).toBe("砂锅老友粉＋卤蛋");
    s.noodle = "round";
    expect(dishNameOf(s)).toBe("老友圆粉＋卤蛋");
    s.noodle = "yifu";
    expect(dishNameOf(s)).toBe("老友伊面＋卤蛋");
    s.noodle = "wetchow";
    expect(dishNameOf(s)).toBe("老友湿面＋卤蛋");
  });

  it("套餐写进括号，主料与尾巴都不重复", () => {
    const s = fresh();
    s.sides.mealDeal = true;
    expect(dishNameOf(s)).toBe("老友粉（配饮料）");
  });

  it("主料与加料分开：选牛腩做主料，卤蛋/猪杂都在＋尾巴上", () => {
    const s = fresh();
    s.main = "brisket";
    s.sides.active = ["suansun", "douchi", "lazhi", "ludan", "zhuzai"];
    expect(mainOf(s)).toBe("brisket");
    expect(extrasOf(s)).toEqual(["卤蛋", "猪杂"]);
    expect(dishNameOf(s)).toBe("老友牛腩粉＋卤蛋＋猪杂");
  });

  it("三两写进名字尾巴（P46 份量）", () => {
    const s = fresh();
    s.main = "offal";
    s.portion = 3;
    expect(dishNameOf(s)).toBe("老友猪杂粉（三两）");
  });

  it("三件基础味型（酸笋/豆豉/辣椒）不算主料、也不算额外加料", () => {
    const s = fresh();
    expect(extrasOf(s)).toEqual([]);
    expect(dishNameOf(s)).toBe("老友粉");
  });

  it("粉型 → 做法：干捞粉、砂锅粉自带做法，其余都是汤粉", () => {
    expect(methodOfNoodle("dry")).toBe("dry");
    expect(methodOfNoodle("claypot")).toBe("sandpot");
    for (const k of ["flat", "round", "yifu", "wetchow"] as const) {
      expect(methodOfNoodle(k)).toBe("soup");
    }
  });

  it("评语 5 档按分数落在对的档上", () => {
    expect(dishNoteOf(90).word).toBe("镇店之宝");
    expect(dishNoteOf(85).word).toBe("镇店之宝");
    expect(dishNoteOf(80).word).toBe("街坊都识");
    expect(dishNoteOf(70).word).toBe("酸笋够镬气");
    expect(dishNoteOf(60).word).toBe("老友味正");
    expect(dishNoteOf(0).word).toBe("家常水平");
    expect(DISH_NOTES).toHaveLength(5);
  });

  it("品名拼接对默认项敏感：不写默认，只写偏离", () => {
    const parts = { method: "soup" as const, main: "pork" as const, noodle: "flat" as const, extras: [], meal: false };
    expect(dishName(parts)).toBe("老友粉");
    expect(dishName({ ...parts, method: "dry" })).toBe("干捞老友粉");
    expect(dishName({ ...parts, main: "offal" })).toBe("老友猪杂粉");
    expect(dishName({ ...parts, extras: ["腐竹", "油条"] })).toBe("老友粉＋腐竹＋油条");
  });
});

describe("饮料冰热（P43）", () => {
  it("夏天冰的、冬天热的才对味，反过来扣分，春秋不管", () => {
    expect(tempFitOf("ice", "summer")).toBe(DRINK_TEMP_BONUS);
    expect(tempFitOf("hot", "summer")).toBe(-DRINK_TEMP_BONUS);
    expect(tempFitOf("hot", "winter")).toBe(DRINK_TEMP_BONUS);
    expect(tempFitOf("ice", "winter")).toBe(-DRINK_TEMP_BONUS);
    expect(tempFitOf("ice", null)).toBe(0);
    expect(tempFitOf("hot", null)).toBe(0);
  });

  it("setDrinkTemp 只认 ice / hot，其余拒绝且不改状态", () => {
    const s = fresh();
    expect(s.sides.drinkTemp).toBe("ice");
    expect(setDrinkTemp(s, "warm" as never).ok).toBe(false);
    expect(s.sides.drinkTemp).toBe("ice");
    expect(setDrinkTemp(s, "hot").ok).toBe(true);
    expect(s.sides.drinkTemp).toBe("hot");
    expect(drinkTempSummary(s)).toContain("热");
  });

  it("存档存得住冰热，老档补成冰的", () => {
    const s = fresh();
    s.sides.drinkTemp = "hot";
    const back = deserialize(serialize(s))!;
    expect(back.sides.drinkTemp).toBe("hot");
    expect(SAVE_VERSION).toBe(29);

    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.saveVersion = 15;
    delete (raw.sides as Record<string, unknown>).drinkTemp;
    const old = deserialize(JSON.stringify(raw))!;
    expect(old.sides.drinkTemp).toBe("ice");
  });
});
