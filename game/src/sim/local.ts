/**
 * 物产的取数（批次九）。
 *
 * 只读 `state.district` —— 你人在哪个区，就拿哪个区的货。
 * 不新增存档字段：换区就换货，搬走就没了。
 */

import { localOfDistrict, type LocalDef } from "../data/local";
import type { GameState } from "./state";

/** 你现在这个区的物产（没有就 null） */
export function localNow(state: GameState): LocalDef | null {
  return localOfDistrict(String(state.district ?? ""));
}

/** 料钱乘数（马山八角：煸香料便宜两个点） */
export function localCostFactor(state: GameState): number {
  const def = localNow(state);
  return 1 + (def?.effect.costPct ?? 0);
}

/** 饮料成本乘数（武鸣沃柑：本地果汁便宜三个点） */
export function localSideCostFactor(state: GameState): number {
  const def = localNow(state);
  return 1 + (def?.effect.sideCostPct ?? 0);
}

/** 耐心乘数（横州茉莉：一杯花茶，人不催） */
export function localPatienceMult(state: GameState): number {
  const def = localNow(state);
  return 1 + (def?.effect.patiencePct ?? 0);
}

/** 「马山八角 · 煸香料 · 料钱 −2%」 */
export function localWords(def: LocalDef): string {
  const parts: string[] = [];
  if (def.effect.costPct) parts.push(`料钱 ${pct(def.effect.costPct)}`);
  if (def.effect.sideCostPct) parts.push(`饮料成本 ${pct(def.effect.sideCostPct)}`);
  if (def.effect.patiencePct) parts.push(`耐心 ${pct(def.effect.patiencePct)}`);
  return `${def.name} · ${def.use} · ${parts.join(" / ")}`;
}

function pct(v: number): string {
  const n = Math.round(v * 100);
  return `${n > 0 ? "+" : ""}${String(n).replace("-", "−")}%`;
}

/** 「这一片产马山八角，香料便宜些」/「这一片没什么特别的物产」 */
export function localSummary(state: GameState): string {
  const def = localNow(state);
  return def ? `这一片产${def.name}，${def.use}便宜些` : "这一片没什么特别的物产";
}
