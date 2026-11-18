/**
 * 图标图集（24×24 像素网格，单 sprite 内联，零网络请求）
 *
 * 用法：`icon("coin")` → `<svg class="ic"><use href="#ic-coin"/></svg>`
 * 颜色跟 `currentColor`，所以外面套 `.chip.money` 就是金色。
 *
 * 为什么不用字体图标 / 外链 svg：离线优先，且 24×24 网格用 rect 拼块最省事，
 * `shape-rendering: crispEdges` 保证不糊。
 */

export type IconName =
  | "bowl"
  | "coin"
  | "star"
  | "heart"
  | "people"
  | "grade"
  | "street"
  | "pan"
  | "clock"
  | "flag"
  | "pot"
  | "cup";

const R = (x: number, y: number, w: number, h: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;

const SHAPES: Record<IconName, string> = {
  // 一碗粉：碗沿 + 碗身 + 两根粉条
  bowl:
    R(3, 4, 18, 2) +
    R(5, 6, 14, 3) +
    R(6, 9, 12, 3) +
    R(8, 12, 8, 3) +
    R(10, 15, 4, 3) +
    R(6, 2, 2, 2) +
    R(11, 1, 2, 3) +
    R(16, 2, 2, 2),
  // 铜钱：外圆内方
  coin:
    R(9, 2, 6, 2) +
    R(6, 4, 12, 2) +
    R(4, 6, 16, 2) +
    R(2, 8, 20, 8) +
    R(4, 16, 16, 2) +
    R(6, 18, 12, 2) +
    R(9, 20, 6, 2) +
    R(9, 9, 6, 6),
  // 口碑：五角星（像素化）
  star:
    R(10, 2, 4, 6) +
    R(8, 8, 8, 3) +
    R(2, 8, 20, 3) +
    R(5, 11, 14, 3) +
    R(4, 14, 5, 4) +
    R(15, 14, 5, 4) +
    R(6, 18, 4, 4) +
    R(14, 18, 4, 4),
  // 人情：像素心
  heart:
    R(6, 4, 4, 4) +
    R(14, 4, 4, 4) +
    R(4, 8, 16, 4) +
    R(6, 12, 12, 4) +
    R(8, 16, 8, 2) +
    R(10, 18, 4, 2),
  // 客流：两个人
  people:
    R(3, 4, 5, 5) +
    R(3, 10, 5, 6) +
    R(16, 4, 5, 5) +
    R(16, 10, 5, 6) +
    R(9, 8, 6, 6) +
    R(9, 15, 6, 8),
  // 段位：三级台阶
  grade:
    R(2, 16, 6, 6) +
    R(9, 11, 6, 11) +
    R(16, 6, 6, 16),
  // 街面：路面 + 中线
  street:
    R(2, 4, 20, 3) +
    R(2, 17, 20, 3) +
    R(4, 9, 3, 6) +
    R(10, 9, 4, 6) +
    R(17, 9, 3, 6),
  // 炒锅 + 手柄
  pan:
    R(2, 10, 14, 4) +
    R(4, 14, 10, 3) +
    R(6, 17, 6, 2) +
    R(16, 9, 6, 3),
  // 钟
  clock:
    R(9, 2, 6, 2) +
    R(5, 4, 14, 2) +
    R(3, 6, 18, 14) +
    R(5, 20, 14, 2) +
    R(9, 8, 2, 6) +
    R(11, 12, 5, 2),
  // 旗
  flag:
    R(4, 2, 2, 20) +
    R(6, 4, 12, 3) +
    R(6, 7, 9, 3) +
    R(6, 10, 12, 3) +
    R(2, 20, 8, 2),
  // 砂锅：锅 + 盖 + 双耳
  pot:
    R(6, 8, 12, 2) +
    R(4, 10, 16, 8) +
    R(6, 18, 12, 3) +
    R(2, 11, 2, 4) +
    R(20, 11, 2, 4) +
    R(10, 4, 4, 2),
  // 豆浆杯 + 吸管
  cup:
    R(6, 6, 12, 3) +
    R(7, 9, 10, 11) +
    R(8, 20, 8, 2) +
    R(13, 1, 2, 6),
};

let mounted = false;

/** 把 sprite 挂到 body（只挂一次） */
export function mountIcons(): void {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const symbols = Object.entries(SHAPES)
    .map(([name, body]) => `<symbol id="ic-${name}" viewBox="0 0 24 24">${body}</symbol>`)
    .join("");
  document.body.insertAdjacentHTML(
    "beforeend",
    `<svg id="icon-sprite" width="0" height="0" aria-hidden="true" style="position:absolute">${symbols}</svg>`,
  );
}

/** 内联图标；name 不合法时给个空 svg，不抛错（界面不能因为图标挂掉） */
export function icon(name: IconName, cls = ""): string {
  const extra = cls ? ` ${cls}` : "";
  return `<svg class="ic${extra}" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
}

export const ICON_NAMES = Object.keys(SHAPES) as IconName[];
