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

/**
 * body 上的安全区内边距（= 刘海屏 inset）。
 *
 * 为什么必须扣掉：visualViewport 给的是「整块可视区」，而 body 是 flex 居中容器、
 * 左右各吃了 `--safe-left/right`。不扣这两块，横屏刘海机上舞台会被 padding 挤出去、
 * 再被 `overflow:hidden` 裁边（左边一截看不见，右边空一条）。
 */
function bodyPadding(): { padX: number; padY: number } {
  const cs = getComputedStyle(document.body);
  const px = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    padX: px(cs.paddingLeft) + px(cs.paddingRight),
    padY: px(cs.paddingTop) + px(cs.paddingBottom),
  };
}

/**
 * 从「可用宽高」算出舞台缩放倍数（纯函数，可单测）。
 *
 * 为什么不直接 `min(vw/1024, vh/768)`：body 上吃了安全区 padding（刘海屏横屏
 * 左右各 44–59px），那时真正的可用区比 `visualViewport` 报的小。不扣掉这块，
 * 舞台会被 flex 居中再挤出 `overflow:hidden` 的边界（左边一截看不见）。
 *
 * 下限 0.2 防止极端小窗算出 0 导致不可见；上限 3 防止超宽屏把像素糊成马赛克。
 */
export function fitScale(vw: number, vh: number, padX = 0, padY = 0): number {
  const availW = Math.max(1, vw - padX);
  const availH = Math.max(1, vh - padY);
  const raw = Math.min(availW / STAGE_W, availH / STAGE_H);
  return Math.max(0.2, Math.min(raw, 3));
}

export function computeViewport(): ViewportInfo {
  const { vw, vh } = viewportSize();
  const { padX, padY } = bodyPadding();
  return { scale: fitScale(vw, vh, padX, padY), mode: modeOf(vw), portrait: vh > vw, vw, vh };
}

/**
 * 在用户手势里尝试「全屏 + 锁横屏」（P550）。
 *
 * 为什么要绑手势：`requestFullscreen()` 与 `screen.orientation.lock()` 都要求
 * 用户激活（transient activation），在定时器/加载回调里调用会被直接拒。
 *
 * 为什么全部 try/catch 吞掉：iPhone 不支持元素级 Fullscreen API
 * （`documentElement.requestFullscreen` 直接抛 TypeError），iOS 也不实现
 * `screen.orientation.lock`；桌面浏览器多半也拒。失败就是「什么都不发生」，
 * 玩家仍然能用现有布局，没有降级成本。
 */
export async function enterFullscreenLandscape(): Promise<boolean> {
  let locked = false;
  try {
    if (!document.fullscreenElement && typeof document.documentElement.requestFullscreen === "function") {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    /* NotAllowedError / TypeError（iPhone）→ 静默 */
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    if (typeof orientation?.lock === "function") {
      await orientation.lock("landscape");
      locked = true;
    }
  } catch {
    /* 未安装 / 非全屏上下文 / iOS → 静默 */
  }
  return locked || document.fullscreenElement !== null;
}

/**
 * 竖屏时顶部那枚「点我一键横屏」的按钮（P550）。
 *
 * 为什么要有它：竖屏 9:16 里塞 4:3 的舞台，只能用 42% 的屏高（实测 375×667
 * 舞台只有 375×281，上下各留 170px 黑）。原先这里是一条 `::after` 假提示，
 * 位置固定在底部、正好压在配菜格与灶台上 —— 既没帮上忙，又挡了信息。
 *
 * 为什么挂在 document.body 而不是 #hud 里：#hud 整体在 #stage 内部，
 * 会跟着 `transform: scale()` 一起缩；按钮若在里面，44px 又会被缩成 16px。
 * 挂 body 上它就是「屏幕坐标系」，44px 真的是 44px。
 */
function mountRotateHint(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rotatehint";
  btn.textContent = "点我一键横屏";
  btn.addEventListener("click", () => {
    void enterFullscreenLandscape();
  });
  document.body.appendChild(btn);
  return btn;
}

/**
 * 挂上适配：返回一个「立即重算」函数，方便在 HUD 重建后手动触发。
 */
export function initViewport(onChange?: (info: ViewportInfo) => void): () => void {
  const root = document.documentElement;
  let lastKey = "";
  let hintBtn: HTMLButtonElement | null = null;

  const apply = (): void => {
    const info = computeViewport();
    const key = `${info.vw}x${info.vh}`;
    if (key === lastKey) return;
    lastKey = key;
    root.style.setProperty("--stage-scale", info.scale.toFixed(4));
    root.dataset.viewport = info.mode;
    root.dataset.orientation = info.portrait ? "portrait" : "landscape";
    // 竖屏手机才提示横屏；平板竖屏空间够用，不打扰
    const hint = info.mode === "phone" && info.portrait;
    document.body.classList.toggle("hint-rotate", hint);
    if (hint) {
      hintBtn ??= mountRotateHint();
      hintBtn.hidden = false;
    } else if (hintBtn) {
      hintBtn.hidden = true;
    }
    onChange?.(info);
  };

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  window.visualViewport?.addEventListener("resize", apply);
  return apply;
}
