// 条目条数的「代码事实」这一侧（批 AL′，解 P344 的同型毛病：文档说 16 条、代码里有 20 条，没人当场知道）。
//
// 只读各表的权威出口：能读到 `*_TOTAL` 就读它（那是对外承诺过的数），读不到才数数组长度。
// 不碰 node:fs —— 写盘在 entry-counts.gen.ts，只读对账在 entry-counts.test.ts。
import { TOPPINGS } from "../src/data/ingredients";
import { SIDES } from "../src/data/sides";
import { PAIRING_TOTAL } from "../src/data/pairing";
import { CUSTOMER_ARCHETYPES } from "../src/data/customers";
import { EVENTS } from "../src/data/events";
import { TOURNEY_TOTAL } from "../src/data/tourneys";
import { RIVALS } from "../src/data/rivals";
import { MARKET_TOTAL } from "../src/data/market";
import { GEARS } from "../src/data/gear";
import { EQUIPMENT } from "../src/data/equipment";
import { TROPHY_TOTAL } from "../src/data/trophies";
import { NOTE_TOTAL } from "../src/data/notebook";
import { PLACES_TOTAL } from "../src/data/places";
import { MANUAL_TOTAL } from "../src/data/manual";
import { TALKS, TALK_TOTAL } from "../src/data/talk";
import { NOODLES } from "../src/data/noodles";
import { MAINS } from "../src/data/mains";
import { INVEST_TOTAL } from "../src/data/invest";
import { GOOD_TOTAL } from "../src/data/goods";
import { SLOT_SET_TOTAL, STORE_AREAS } from "../src/data/slots";
import { QUALITY_TOTAL } from "../src/data/quality";
import { FLAVOR_TOTAL } from "../src/data/flavor";
import { COMBO_TOTAL } from "../src/data/combo";
import { STREETS } from "../src/data/streets";
import { PERK_TOTAL, PERK_POINT_TOTAL } from "../src/data/perk";
import { STAFF_SKILL_TOTAL, FINISH_SKILL_TOTAL } from "../src/data/staff-skill";
import { STAFF_POOL } from "../src/data/staff";
import { SCRIPT_TOTAL } from "../src/data/script-days";
import { PACK_SKU_TOTAL } from "../src/data/pack";
import { RALLY_TOTAL } from "../src/data/rally";
import { SOUP_BASE_TOTAL, SOUP_PIPELINE } from "../src/data/soupbase";
import { EXPANSIONS } from "../src/data/expansion";
import { LOCAL_TOTAL } from "../src/data/local";
import { NEWS_TOTAL } from "../src/data/news";
import { RETAIL_TOTAL, CHANNEL_TOTAL } from "../src/data/retail";
import { SPECIALTY_TOTAL } from "../src/data/specialty";
import { BOWL_TOTAL } from "../src/data/bowl";

export const ENTRY_COUNTS_PATH = "../data/entry-counts.json";

/** 键名就是给人看的名字；顺序固定，好让清单文件 diff 干净。 */
export function entryCounts(): Record<string, number> {
  return {
    浇头: TOPPINGS.length,
    加菜: SIDES.length,
    浇头搭配: PAIRING_TOTAL,
    客型: CUSTOMER_ARCHETYPES.length,
    事件: EVENTS.length,
    赛事: TOURNEY_TOTAL,
    同行: RIVALS.length,
    行情: MARKET_TOTAL,
    家当: GEARS.length,
    设备: EQUIPMENT.length,
    奖杯: TROPHY_TOTAL,
    笔记: NOTE_TOTAL,
    地名: PLACES_TOTAL,
    手册: MANUAL_TOTAL,
    长对白类: TALK_TOTAL,
    长对白句: TALKS.reduce((n, t) => n + t.lines.length, 0),
    粉型: NOODLES.length,
    主料: MAINS.length,
    门路: INVEST_TOTAL,
    杂货: GOOD_TOTAL,
    成套: SLOT_SET_TOTAL,
    铺面档位: STORE_AREAS.length,
    扩建档位: EXPANSIONS.length,
    品质: QUALITY_TOTAL,
    风味: FLAVOR_TOTAL,
    家当搭配: COMBO_TOTAL,
    街型: STREETS.length,
    手艺: PERK_TOTAL,
    手艺点数: PERK_POINT_TOTAL,
    店员手艺: STAFF_SKILL_TOTAL,
    毕业技: FINISH_SKILL_TOTAL,
    店员模板: STAFF_POOL.length,
    剧本幕: SCRIPT_TOTAL,
    速食档: PACK_SKU_TOTAL,
    劝留路: RALLY_TOTAL,
    汤底: SOUP_BASE_TOTAL,
    工序: SOUP_PIPELINE.length,
    本地说法: LOCAL_TOTAL,
    街坊报道: NEWS_TOTAL,
    零售: RETAIL_TOTAL,
    进货渠道: CHANNEL_TOTAL,
    招牌菜: SPECIALTY_TOTAL,
    碗型: BOWL_TOTAL,
  };
}

/** 只比数，不比名字之外的东西；返回差在哪几项。 */
export function diffCounts(
  want: Record<string, number>,
  got: Record<string, number>,
): string[] {
  const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
  const out: string[] = [];
  for (const k of [...keys].sort()) {
    const a = want[k];
    const b = got[k];
    if (a === b) continue;
    if (a === undefined) out.push(`${k}：清单里没有，代码里是 ${b}`);
    else if (b === undefined) out.push(`${k}：清单写 ${a}，代码里已经没有这一项`);
    else out.push(`${k}：清单写 ${a}，代码里是 ${b}`);
  }
  return out;
}

