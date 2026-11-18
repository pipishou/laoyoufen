/**
 * 开发者视图开关。
 *
 * 数据层里的 `kairo` 字段是**我们与开罗拉面店对齐的取证依据**（哪条机制抄的是它的哪一句），
 * 它必须留在代码里，否则以后没法复核；但它**不能给玩家看**——既是剧透，也容易惹麻烦。
 *
 * 规则：只有地址栏带 `?dev=1` 时才渲染这些注解。
 * 用法：`${devNote("开罗：" + v.def.kairo)}`
 */
const params = new URLSearchParams(
  typeof location === "undefined" ? "" : location.search,
);

export const devMode: boolean =
  params.get("dev") === "1" || params.get("dev") === "true";

/** 开发者注解：非 dev 模式返回空串（不占位、不影响布局） */
export function devNote(text: string): string {
  return devMode ? `<span class="devnote">｜${text}</span>` : "";
}
