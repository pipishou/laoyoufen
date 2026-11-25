# 当期验收指针（ACCEPTANCE）

> **这一份是唯一的「现在算什么算过关」入口。** 以后每跑一次整体验收，只改这一份里的日期、数字与文档链接，不再新开一份 `三维度整体验收-*.md`（解 P415：验收文档越攒越多，谁也说不清哪份是当期）。

## 一、当期是哪一份

- **当期整体验收**：[三维度整体验收-终版-2026-11-25](三维度整体验收-终版-2026-11-25.md)
- **当期最后一批**：[替身会开袋装线与部署对账AI′-2026-11-25](替身会开袋装线与部署对账AI′-2026-11-25.md)（P374 + P389 + P420）
- **下一批候选**：P422–P425（替身开袋装线不看回本 / 换底只记成功不记被挡 / `gen:server` 只在部署时跑 / 包装机与扩建谁先买靠代码顺序）、P417（只改说法的批次四种子恒定，回归锁只能靠探针）、P418 / P419 / P421（小账）
- 历史文档按批次留在 `docs/`，**不再逐份维护**；要查某批细节看账本 `.junshi/ledger.md` 对应行。

## 二、五门（跑法固定）

```powershell
cd D:\项目\REA\REA\重构\老友粉店\game
npx tsc --noEmit
npx vitest run --no-file-parallelism
npm run -s build
cd ..
python -X utf8 tools/gate/copy_gate.py
python -X utf8 tools/gate/eye_gate.py shot --slug accept3
python -X utf8 tools/gate/ai_gate.py        # 跑完必须 npm run -s build
```

`--no-file-parallelism` 不是可选项：并行跑时 `customer.test.ts` / `events.test.ts` 会因超时假红。
`eye_gate` 会清 `game/data/evidence/<slug>`，跑完要把探针重跑一遍补截图。

## 三、当期数字（2026-11-25，批 AI′ 之后）

| 项 | 值 |
| --- | --- |
| `tsc` | 0 |
| `vitest --no-file-parallelism` | **94 文件 1004 用例** |
| `vitest --config vitest.gen.config.ts` | 1 / 1（`server/events.json` 与 `EVENTS` 八十三件一致） |
| `copy_gate` | ok（玩家可见文案 0 处别的作品名） |
| `eye_gate` | stamp **173** 条（控制台 10 条 error 为预览环境 `/laoyou-api/` 404，良性）；交付包与 AH′ 同哈希（本批不动前端） |
| `ai_gate` | `"ok": true` |
| `audit_counts` | **54 文件 668 条 id** |
| `audit_pixel` | 字面色值 **0**；12 色 token；图标 **21**；`@keyframes` 14（`steps(` 8）；`prefers-reduced-motion` 2；`sechd` 59；`icon(` 55；`data-act` 46 |
| `audit_ai` | 线上 **29 / 29 remote** |
| 替身四种子 | **¥134,450 · 227.9 碗 · 37.3% · 期末 ¥1,028,840**（替身开袋装线之后；换底 1–4 次、四局都开了线） |
| 构建 | `index-svl58Mrm.js` 1,739,525 B / `index-Cyd0u8tu.css` 55,916 B（AI′ 只改替身与发布脚本，前端产物逐位不变） |
| 线上 | `http://8.134.86.249/laoyoufen/` 与本地逐位一致；health `events 83 / playtests 97` |

四种子基线口径：`npm run -s probe:standin`，四个月种子各跑 36 个月，取月均营收 / 日均碗数 / 总流失率 / 期末现金的平均。**只动说法不动数值的批次（AE′、AF′、AG′、AH′）四种子恒定，此时判据只能靠探针**（P417）。反过来，**动了「替身会不会用一个系统」的批次（AI′ 开袋装线）数字必须动** —— 不动就说明那个系统还是死的。

## 四、探针清单（每个都对应一个真判据）

| 探针 | 端口 | 管什么 |
| --- | --- | --- |
| `soupbase_probe.py` | 4243 | 汤底三底、骨汤打底、打底徽章、三段工序一句话（`step_same_on_shop` 比字面） |
| `fold_probe.py` | 4244 | 打烊单折叠：三条上限、340 宽只留两条、**开合记住**（`fold_state_remembered`） |
| `manualread_probe.py` | 4244 | 手册「读过」：十六页、抬头进度、开一页记一个、设置里四条操作一览也算 |
| `accept_probe.py` | 4244 | 设置里操作一览点开算翻过、与图鉴手册同一本账 |
| `shopname_probe.py` | 4240 | 招牌改名、四个操作页、图鉴 16 页五章 |
| `rally_probe.py` / `pack_probe.py` / `store_probe.py` / `stage_probe` 等 | 4235–4238 | 各批各自的回归锁 |

## 五、还剩什么（按要不要做）

1. **P422 / P425** 替身开袋装线是一步到位的、与扩建阶梯没有互相引用 —— 谁先买只是代码顺序，没有回本判据（与 P361 同型）。
2. **P423** 报尾「换底 N 次」只记成功，没记「想换但钱不够」被挡了几次 —— P400 守卫的真实压力看不见。
3. **P424** `gen:server` 挂在部署脚本里，`npm test` 抓不到表走散（只有发布时才炸）。
4. **P417** 只动说法的批次四种子恒定 —— 需要一个不靠经济数字的回归锁（现在是靠每个探针）。
5. **P418 / P419 / P421** 折行记忆不出机器、挂汤三档分界是拍的、手册那本账跨设备未验 —— 都是小账，不急。

## 六、维护规矩

- 每次整体验收在**这一份**里改三处：日期、第三节数字、第一节链到的新一份批次文档；
- 不再新增 `三维度整体验收-<日期>.md`；
- 账本 `.junshi/ledger.md` 仍是逐批正本，`### 行 N · 日期 · 标题`，一行一批。
