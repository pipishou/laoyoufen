import type { RpnProgram } from "../sim/rpn";

export type CalcGroup = "soup" | "noodle";

export interface CalcProgram {
  id: string;
  label: string;
  group: CalcGroup;
  /** 该子项在组内权重 */
  weight: number;
  expr: RpnProgram;
}

/**
 * 配方评分程序表。
 *
 * 形状照搬 REA 的 ramencalc：栈式后缀、一参一曲线、允许惩罚项（减法/绝对值）。
 * 全部常数都是**本项目按南宁老友粉重推的**，不是原作取数：
 * 原作的 30/50/150/260/370/500 那套断点对应的是日式拉面的口味分布，
 * 老友粉的酸笋/豆豉接受区间窄得多，直接套会得到「越酸越好吃」的错曲线。
 *
 * 值域约定：每条程序输出 0-100，聚合时再钳位。
 */
export const RAMEN_CALC: readonly CalcProgram[] = [
  // ---- 汤 ----
  {
    id: "soup.sour",
    label: "酸香",
    group: "soup",
    weight: 1.4,
    // 酸笋发酵度越靠近 55 越顺口，偏离即扣分（两端都是惩罚项）
    expr: ["100", "s0", "55", "-", "abs", "2", "*", "-"],
  },
  {
    id: "soup.douchi",
    label: "豆豉咸鲜",
    group: "soup",
    weight: 1.3,
    expr: ["100", "s1", "50", "-", "abs", "2", "*", "-"],
  },
  {
    id: "soup.depth",
    label: "汤厚",
    group: "soup",
    weight: 1.2,
    // 猪骨浓度与汤浊度必须同向：清汤配浓骨 = 假厚
    expr: ["s2", "s7", "*", "100", "/"],
  },
  {
    id: "soup.salt",
    label: "咸度",
    group: "soup",
    weight: 1.0,
    expr: ["100", "s3", "45", "-", "abs", "2", "*", "-"],
  },
  {
    id: "soup.umami",
    label: "鲜度",
    group: "soup",
    weight: 1.0,
    expr: ["s4"],
  },
  {
    id: "soup.chili",
    label: "辣度",
    group: "soup",
    weight: 0.8,
    // 辣要挂在酸上：纯辣无酸在老友粉里是「桂林米粉走错门」
    expr: ["s5", "s0", "*", "100", "/"],
  },
  {
    id: "soup.garlic",
    label: "蒜香",
    group: "soup",
    weight: 0.7,
    expr: ["s6"],
  },

  // ---- 粉 ----
  {
    id: "noodle.ferment",
    label: "发酵酸",
    group: "noodle",
    weight: 1.0,
    expr: ["100", "n1", "40", "-", "abs", "2", "*", "-"],
  },
  {
    id: "noodle.aroma",
    label: "米香",
    group: "noodle",
    weight: 1.2,
    expr: ["n2"],
  },
  {
    id: "noodle.chew",
    label: "韧性",
    group: "noodle",
    weight: 1.3,
    expr: ["n3"],
  },
  {
    id: "noodle.ratio",
    label: "汤水比",
    group: "noodle",
    weight: 1.0,
    // n4 是 20-50 的绝对值区间，35 为南宁老友粉基准，每偏 1 分扣 7
    expr: ["100", "n4", "35", "-", "abs", "7", "*", "-"],
  },
  {
    id: "noodle.width",
    label: "粉宽",
    group: "noodle",
    weight: 0.7,
    // n5 0-4，老友粉以宽切粉（1）为基准
    expr: ["100", "n5", "1", "-", "abs", "50", "*", "-"],
  },
  {
    id: "noodle.shape",
    label: "粉型",
    group: "noodle",
    weight: 0.6,
    // n6 0 切粉 / 1 圆粉 / 2 细切粉，切粉为基准
    expr: ["100", "n6", "0", "-", "abs", "50", "*", "-"],
  },
];
