/**
 * 双端视口适配（骨架版）。
 *
 * 设计取舍：舞台内部一切坐标仍按 1024×768 写死（hud.css 1160 行都是绝对像素，
 * 内部改坐标系的收益远小于风险），适配只做「整体等比缩放」：
 * 算出一个 --stage-scale，由 CSS 用 transform 同时缩放 canvas 与 HUD，
 * 保证像素对齐、HUD 与画面永不脱层。
 *
 * 不选 Phaser Scale.FIT 的原因：FIT 只缩 canvas，HUD 是独立 DOM，会与画面脱层；
 * 两套缩放再各自对齐，误差会以「点了没反应」的形式出现，最难查。
 */

const STAGE_W = 1024;
const STAGE_H = 768;

export type ViewportMode = "desktop" | "tablet" | "phone";

export interface ViewportInfo {
  scale: number;
  mode: ViewportMode;
  portrait: boolean;
  vw: number;
  vh: number;
}

function modeOf(vw: number): ViewportMode {
  if (vw >= 1280) return "desktop";
  if (vw >= 768) return "tablet";
  return "phone";
}

/** 用 visualViewport 的尺寸（移动端地址栏收起时 innerHeight 会滞后） */
function viewportSize(): { vw: number; vh: number } {
  const vv = window.visualViewport;
  return {
    vw: Math.round(vv?.width ?? window.innerWidth),
    vh: Math.round(vv?.height ?? window.innerHeight),
  };
}

export function computeViewport(): ViewportInfo {
  const { vw, vh } = viewportSize();
  const raw = Math.min(vw / STAGE_W, vh / STAGE_H);
  // 下限 0.2 防止极端小窗算出 0 导致不可见；上限 3 防止超宽屏把像素糊成马赛克
  const scale = Math.max(0.2, Math.min(raw, 3));
  return { scale, mode: modeOf(vw), portrait: vh > vw, vw, vh };
}

/**
 * 挂上适配：返回一个「立即重算」函数，方便在 HUD 重建后手动触发。
 */
export function initViewport(onChange?: (info: ViewportInfo) => void): () => void {
  const root = document.documentElement;
  let lastKey = "";

  const apply = (): void => {
    const info = computeViewport();
    const key = `${info.vw}x${info.vh}`;
    if (key === lastKey) return;
    lastKey = key;
    root.style.setProperty("--stage-scale", info.scale.toFixed(4));
    root.dataset.viewport = info.mode;
    root.dataset.orientation = info.portrait ? "portrait" : "landscape";
    // 竖屏手机才提示横屏；平板竖屏空间够用，不打扰
    document.body.classList.toggle("hint-rotate", info.mode === "phone" && info.portrait);
    onChange?.(info);
  };

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  window.visualViewport?.addEventListener("resize", apply);
  return apply;
}
