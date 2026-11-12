import { describe, expect, it } from "vitest";
import {
  DISTRICTS,
  DISTRICT_MIX,
  TRAFFIC_PER_GDP_YI,
  WALLETS,
  avgWalletOf,
  dailyTrafficOf,
  districtById,
  districtsByTraffic,
  priceVerdict,
  walletOf,
} from "./nanning";

describe("南宁行政区 → 客流", () => {
  it("12 个区县 GDP 合计等于全市 5,995.36 亿", () => {
    expect(DISTRICTS).toHaveLength(12);
    const total = DISTRICTS.reduce((s, d) => s + d.gdpYi, 0);
    expect(total).toBeCloseTo(5995.36, 1);
  });

  it("兴宁区（起步区）日客流约 71 人 —— 正好等于 4 座店产能", () => {
    expect(dailyTrafficOf("xingning")).toBe(71);
    expect(442.63 * TRAFFIC_PER_GDP_YI).toBeCloseTo(70.8, 1);
  });

  it("客流随 GDP 单调：青秀 > 西乡塘 > 兴宁 > 马山", () => {
    expect(dailyTrafficOf("qingxiu")).toBeGreaterThan(dailyTrafficOf("xixiangtang"));
    expect(dailyTrafficOf("xixiangtang")).toBeGreaterThan(dailyTrafficOf("xingning"));
    expect(dailyTrafficOf("xingning")).toBeGreaterThan(dailyTrafficOf("mashan"));
  });

  it("districtsByTraffic 按客流升序，首尾是马山与青秀", () => {
    const sorted = districtsByTraffic();
    expect(sorted[0]!.id).toBe("mashan");
    expect(sorted[sorted.length - 1]!.id).toBe("qingxiu");
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.gdpYi).toBeGreaterThanOrEqual(sorted[i - 1]!.gdpYi);
    }
  });

  it("转让费与客流同向：起步区为 0，青秀最贵", () => {
    expect(districtById("xingning").transferFeeYuan).toBe(0);
    const maxFee = Math.max(...DISTRICTS.map((d) => d.transferFeeYuan));
    expect(districtById("qingxiu").transferFeeYuan).toBe(maxFee);
  });
});

describe("顾客钱包 → 客单价", () => {
  it("钱包全部落在 8.4–14 元（开罗 840–1400 × 0.01）", () => {
    expect(WALLETS).toHaveLength(10);
    const min = Math.min(...WALLETS.map((w) => w.walletYuan));
    const max = Math.max(...WALLETS.map((w) => w.walletYuan));
    expect(min).toBeCloseTo(8.4, 5);
    expect(max).toBeCloseTo(14, 5);
  });

  it("钱包顺序：细蚊仔 = 中学生 < 阿婆 < 白领 < 老板", () => {
    expect(walletOf("kid")).toBe(walletOf("student"));
    expect(walletOf("student")).toBeLessThan(walletOf("auntie"));
    expect(walletOf("auntie")).toBeLessThan(walletOf("office"));
    expect(walletOf("office")).toBeLessThan(walletOf("boss"));
  });

  it("每个区的人群权重和为 1", () => {
    for (const d of DISTRICTS) {
      const sum = Object.values(DISTRICT_MIX[d.id]).reduce((s, v) => s + (v ?? 0), 0);
      expect(sum, d.name).toBeCloseTo(1, 6);
    }
  });

  it("平均钱包：青秀 > 兴宁 > 西乡塘（人多但学生多）", () => {
    expect(avgWalletOf("qingxiu")).toBeGreaterThan(avgWalletOf("xingning"));
    expect(avgWalletOf("xingning")).toBeGreaterThan(avgWalletOf("xixiangtang"));
    expect(avgWalletOf("xixiangtang")).toBeLessThan(10.5);
  });

  // 下面这组数字是「先量再断」，全部来自实测矩阵，不是估的：
  //   兴宁 8.4→100% 9→70% 9.5→48% 10→48% 11→40% 12→26% 14→8%
  //   马山 8.4→100% 9→72% 9.5→40% 10→32% 11→8%  12→8%  14→0%
  //   青秀 8.4→100% 9→92% 9.5→92% 10→72% 11→66% 12→52% 14→18%
  it("8.4 元人人吃得起，9 元是「街坊价」（兴宁 70% / 马山 72%）", () => {
    for (const d of DISTRICTS) {
      expect(priceVerdict(d.id, 8.4).shareCanAfford, d.name).toBeCloseTo(1, 6);
    }
    expect(priceVerdict("xingning", 9).shareCanAfford).toBeCloseTo(0.7, 6);
    expect(priceVerdict("mashan", 9).shareCanAfford).toBeCloseTo(0.72, 6);
  });

  it("12 元只在一线区过半（青秀 52%），其余区 8–26% —— 现有默认价必须下调", () => {
    expect(priceVerdict("qingxiu", 12).shareCanAfford).toBeCloseTo(0.52, 6);
    expect(priceVerdict("xingning", 12).shareCanAfford).toBeCloseTo(0.26, 6);
    expect(priceVerdict("mashan", 12).shareCanAfford).toBeCloseTo(0.08, 6);
    const over50 = DISTRICTS.filter((d) => priceVerdict(d.id, 12).shareCanAfford >= 0.5);
    expect(over50.map((d) => d.id).sort()).toEqual(["liangqing", "qingxiu"]);
  });

  it("14 元只有老板/白领能吃：青秀 18%，县域 0%", () => {
    expect(priceVerdict("qingxiu", 14).shareCanAfford).toBeCloseTo(0.18, 6);
    expect(priceVerdict("mashan", 14).shareCanAfford).toBe(0);
  });

  it("价格越高买得起的人越少（12 个区全部单调）", () => {
    for (const d of DISTRICTS) {
      const seq = [8.4, 9, 9.5, 10, 11, 12, 14].map(
        (p) => priceVerdict(d.id, p).shareCanAfford,
      );
      for (let i = 1; i < seq.length; i += 1) {
        expect(seq[i]!, `${d.name} @${i}`).toBeLessThanOrEqual(seq[i - 1]!);
      }
    }
  });

  it("涨价超平均钱包时 shortageYuan 给出缺口", () => {
    const v = priceVerdict("xingning", 15);
    expect(v.shortageYuan).toBeGreaterThan(4);
    expect(priceVerdict("xingning", 9).shortageYuan).toBe(0);
  });
});
