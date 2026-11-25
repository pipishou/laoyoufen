/**
 * 「今天只动这一件」—— 把店里四处会各自亮起来的地方收到同一个裁定下（批 AK′，解 P430）。
 *
 * 试玩 1619 三局两周的实测：第 10 天买完隔墙，店铺页改口「汤锅」，打烊单改口「壁扇」；
 * 第 13 天买完壁扇，店铺页改口「排风扇」，打烊单又改口「汤锅」；第 15 天「巷口老铺」
 * 那颗按钮已经亮了，钩子却还在攒 ¥35,000 做后厨扩容。玩家的原话是「跟红按钮就被带走」。
 *
 * 病灶不是哪一处的算法错，而是**有四处各算各的**：
 *  ① 打烊单那一行 ← `nextHook`
 *  ② 店面 / 设备 / 家当三个段头的红标 ← 各自再问一次 `nextHook`，还各自加条件
 *  ③ 设备段那个「最慢：炒锅 2.2 分」 ← `slowestStation`，与钩子毫无关系
 *  ④ 段位那颗「交费评定」+ HUD 的「可评定」 ← `checkGrade().ready`，与钩子毫无关系
 *
 * 开罗的做法是同一时刻只指一件事（见 `today.ts` 文件头）。这一批把「只指哪一件」
 * 收成**一个函数**：`todayFocus` 说今天那一件，`alignMarks` 说其余三处该怎么降级。
 * 界面只读这两个东西，不再自己算 —— 以后再加一个会亮的地方，也得来问这里。
 *
 * 纪律：**这里不产生任何数值**。它读的仍是 `nextHook` 与 `checkGrade`，
 * 所以「只改说法」的批次替身四种子必须逐位不变（见 AGENTS.md 的数值纪律）。
 */

import type { GameState } from "./state";
import { nextHook, type HookKind } from "./hook";
import { todayLine } from "./today";
import { checkGrade } from "./grade";
import { slowestStation } from "./equipment";
import { gearViews } from "./gear";
import { expansionLevel, expansionLockReason, expansionNextCost, nextExpansion } from "./expansion";
import { STATION_EQUIP, type StationId } from "../data/equipment";

/** 今天那一件落在哪一段（面板里的段名，界面据此标红） */
export type FocusSec = "seat" | "equip" | "expand" | "gear" | "grade" | "price" | "street" | "arena" | "none";

export interface Focus {
  kind: HookKind;
  /** 这一段该红 */
  sec: FocusSec;
  /** 如果指的就是某件家当 / 某件设备 */
  gearId?: string;
  equipId?: string;
  /** 指的是哪一段工序（炒锅 / 汤锅 / 粉篓） */
  station?: StationId;
  /** 打烊单那一行的主句与副句（原样带过来，界面别再算一遍） */
  main: string;
  detail: string;
}

export interface AlignMarks {
  focus: Focus;
  /** 店面那一段该不该红（座位） */
  seatHot: boolean;
  /** 设备段该不该红 */
  equipHot: boolean;
  /** 扩建阶梯该不该红 */
  expandHot: boolean;
  /** 家当段该不该红 */
  gearHot: boolean;
  /**
   * 设备段那行「最慢：X」该不该高亮。
   * 只有今天这一件说的就是「最慢那一段」时才亮；否则它只是参考（P430 第 ①②③ 处）。
   */
  slowHot: boolean;
  /** 段位那颗「交费评定」该不该当主推 */
  gradeHot: boolean;
  /** HUD 顶上那颗「可评定」小牌该不该出现 */
  hudGradeChip: boolean;
  /** 今天不主张、但确实做得到的事 —— 写成一行灰字，不许再亮 */
  demoted: string[];
}

/** 钩子的细分键 → 哪一段工序 */
const STATION_OF_KEY: Record<string, StationId> = {
  "capacity:stove": "wok",
  "capacity:pot": "pot",
  "capacity:basket": "basket",
};

const SEC_WORD: Record<FocusSec, string> = {
  seat: "多坐几个人",
  equip: "厨房设备",
  expand: "扩店",
  gear: "家当",
  grade: "评定段位",
  price: "价签",
  street: "街上",
  arena: "落场",
  none: "店里的事",
};

/** 今天那一件（唯一裁定） */
export function todayFocus(state: GameState): Focus {
  const plan = nextHook(state);
  const line = todayLine(state);
  const main = line?.main ?? plan.text;
  const detail = line?.detail ?? "";
  const head = { kind: plan.kind, main, detail };

  if (plan.kind === "capacity") {
    const station = STATION_OF_KEY[plan.key];
    if (plan.key === "capacity:seat") {
      return { ...head, sec: "seat", gearId: plan.ref?.gearId };
    }
    if (station) {
      return { ...head, sec: "equip", equipId: STATION_EQUIP[station], station };
    }
    if (plan.ref?.equipId) {
      return { ...head, sec: "equip", equipId: String(plan.ref.equipId) };
    }
    // 名额落在扩建上时，钩子句子里说的是「打通隔墙」这类整件，指到扩建阶梯那一段
    return { ...head, sec: "expand" };
  }

  if (plan.kind === "gear") return { ...head, sec: "gear", gearId: plan.ref?.gearId };
  if (plan.kind === "price") return { ...head, sec: "price" };
  if (plan.kind === "grade") return { ...head, sec: "grade" };
  if (plan.kind === "street") return { ...head, sec: "street" };
  if (plan.kind === "arena") return { ...head, sec: "arena" };
  return { ...head, sec: "none" };
}

/**
 * 四处的红标怎么分。
 *
 * 只有一处是 red：`focus.sec`。其余该能做的事退成灰字（`demoted`），
 * 按钮仍可点（玩家想干别的不能被拦），只是不喊。
 */
export function alignMarks(state: GameState): AlignMarks {
  const focus = todayFocus(state);
  const slow = slowestStation(state);
  const slowEquip = STATION_EQUIP[slow.station];
  const gc = checkGrade(state);

  const slowHot = focus.sec === "equip" && focus.equipId === slowEquip;
  const gradeHot = focus.sec === "grade";

  const demoted: string[] = [];

  if (gc.next && gc.ready && !gradeHot) {
    demoted.push(`「评${gc.next.title}」已经够格了，今天先记着`);
  }

  if (!slowHot && focus.sec !== "equip") {
    demoted.push(`最慢的是${SEC_WORD.equip}那一环（${slow.minutes.toFixed(1)} 分），今天先不动它`);
  }

  const gear = gearViews(state).filter((v) => !v.owned && v.affordable);
  if (gear.length > 0 && focus.sec !== "gear" && focus.sec !== "seat") {
    demoted.push(`家当里还有买得起的小件，今天先不买`);
  }

  const ex = nextExpansion(state);
  if (ex && !expansionLockReason(state) && state.cash >= expansionNextCost(state) && focus.sec !== "expand") {
    demoted.push(`「${ex.name}」的钱也够了（第 ${expansionLevel(state) + 1} 步），今天不急`);
  }

  return {
    focus,
    seatHot: focus.sec === "seat",
    equipHot: focus.sec === "equip",
    expandHot: focus.sec === "expand",
    gearHot: focus.sec === "gear",
    slowHot,
    gradeHot,
    hudGradeChip: gradeHot,
    demoted,
  };
}

/** 界面上那句「今天只动这一件」的抬头用词（面板与探针共用） */
export function focusWords(focus: Focus): string {
  if (focus.sec === "none") return "";
  if (focus.sec === "equip" && focus.station) {
    return `设备 · ${SEC_WORD.equip}`;
  }
  return SEC_WORD[focus.sec];
}

/** 降级那几行的小字（一处一句，界面按行显示） */
export function demotedWords(marks: AlignMarks): string {
  return marks.demoted.join("；");
}
