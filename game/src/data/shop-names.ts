/**
 * 店名生成器（建店仪式的第二步）。
 *
 * 设计约束：
 *   - **纯本地、确定性**：同一个种子必得同一组候选，离线也能用；AI 只是可选改写。
 *   - **南宁口吻**：前缀用真实地名/称呼（建政、中山、南铁、三姐、阿婆…），
 *     后缀用「老友粉」这类真实业态词，不造「香飘飘美食城」这种商场味。
 *   - 不做「随机洗牌到玩家满意」：给 5 个，可换一批，最多三批 —— 选择本身要有点成本。
 */

const PREFIXES = [
  "建政",
  "中山",
  "南铁",
  "望州",
  "三姐",
  "阿婆",
  "老友",
  "水街",
  "秀灵",
  "五里亭",
  "共和",
  "邕江",
] as const;

const SUFFIXES = ["老友粉", "老友粉店", "粉店", "粉铺", "饮食店", "老友粉铺"] as const;

/** 简单稳定的字符串哈希（FNV-1a），避免依赖 sim/rng 造成循环引用 */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 一批候选店名（5 个）。batch 递增即「换一批」。 */
export function nameCandidates(seed: string, batch = 0, count = 5): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  let salt = batch;
  while (out.length < count && salt < batch + 200) {
    const h = hash(`${seed}:${salt}`);
    const p = PREFIXES[h % PREFIXES.length]!;
    const s = SUFFIXES[(h >>> 8) % SUFFIXES.length]!;
    const name = `${p}${s}`;
    if (!used.has(name)) {
      used.add(name);
      out.push(name);
    }
    salt += 1;
  }
  return out;
}

/** 店名合法性：2–12 字，允许中文/数字/· 与常见符号，不许空、不许纯空白 */
export function validShopName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 12) return false;
  return /^[\u4e00-\u9fa5A-Za-z0-9·\-（）()]+$/.test(trimmed);
}
