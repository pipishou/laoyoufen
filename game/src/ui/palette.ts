/**
 * 12 色板（像素层唯一的颜色来源）
 *
 * 规则：
 *  1. 界面上不许再出现字面色值 —— 一律 `var(--xxx)`；canvas / Phaser 里用 `COLOR.xxx`。
 *  2. 十二个色相，每相最多两阶（亮 `-soft` / 暗 `-deep`），总变量不超过 24 个。
 *  3. 新增颜色 = 改这张表，不许在组件里临时加。
 *
 * 这 12 个色是「暖纸 + 深墨 + 老友粉的红绿金」：南宁老街的招牌、酸笋的绿、辣椒的红、
 * 灯箱的金。不是通用调色板，换主题要整张换。
 */

/** CSS 变量名 → 色值。key 就是变量名去掉 `--` 的部分 */
export const PALETTE = {
  ink: "#2f2118", // 最深：正文、像素描边
  ink2: "#5a4632", // 次深：次级文字、木色
  wood: "#8a6f52", // 木褐：说明文字、摆件
  sand: "#c9b28f", // 土黄：地面、进度槽底
  cream: "#e8dcc4", // 米黄：浅底、分隔
  paper2: "#fff8e6", // 纸黄：卡片底
  paper: "#fffdf6", // 纸白：卡片高亮底
  red: "#b5493a", // 红：价格、失败、自己的比分
  orange: "#d97b52", // 橙：提醒、熟客
  green: "#2f7d4f", // 绿：选中、成功、员工
  gold: "#b8912f", // 金：钱、段位、客人
  blue: "#4a6f8a", // 蓝：街面、场外信息
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** canvas / Phaser 用：'#2f2118' → 0x2f2118 */
export function hex(key: PaletteKey): number {
  return parseInt(PALETTE[key].slice(1), 16);
}

/** 把 12 色写进 :root，运行时也保持一致（CSS 里另有同值声明，这里只做自检兜底） */
export function applyPalette(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(PALETTE)) {
    if (!root.style.getPropertyValue(`--${k}`)) root.style.setProperty(`--${k}`, v);
  }
}

/** 像素网格：一切尺寸都是它的整数倍，避免半像素发虚 */
export const PX = 4;

/** 字号只允许四档 —— 新像素层遵守，旧界面不动（全站重排风险大于收益） */
export const FONT_SIZE = { sm: 12, md: 14, lg: 16, xl: 20 } as const;
