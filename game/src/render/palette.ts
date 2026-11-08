/** 美术规范 §14.2：16 色板。Web 层用 CSS 字符串，Phaser 层用 toPhaserColor() 转换。 */
export const PALETTE = {
  paper: "#fff8e6",
  paperDark: "#f5e9cc",
  brick: "#d05b4f",
  bamboo: "#5fa34f",
  riceWhite: "#fdf6e3",
  mustard: "#ffc845",
  wood: "#8a5a3b",
  sky: "#3f8bc9",
  ink: "#3b2b1d",
  shadow: "#c3ad84",
  chili: "#c8442f",
  sourSauce: "#7fa650",
  douchi: "#4a3324",
  warmOrange: "#f2a33c",
  porkOffal: "#e0a08a",
  concrete: "#b8b3a6",
} as const;

/** 逻辑分辨率：1024×768 视口按 2× 整数放大 */
export const TILE = 32;
export const VIEW_W = 512;
export const VIEW_H = 384;
export const PIXEL_SCALE = 2;

export function toPhaserColor(css: string): number {
  return Number.parseInt(css.slice(1), 16);
}
