# 当期验收指针（ACCEPTANCE）

> **这一份是唯一的「现在算什么算过关」入口。** 以后每跑一次整体验收，只改这一份里的日期、数字与文档链接，不再新开一份 `三维度整体验收-*.md`（解 P415：验收文档越攒越多，谁也说不清哪份是当期）。

## 一、当期是哪一份

- **当期整体验收**：[三维度整体验收-终版-2026-11-25](三维度整体验收-终版-2026-11-25.md)
- **当期最后一批**：[三段工序一句话AF′-2026-11-25](三段工序一句话AF′-2026-11-25.md)（P408 + P409）
- **下一批候选**：P415 已解（这一份自己）、P413 已解（操作一览算翻过）；剩 P405 / P412 / P416 / P417 与三条进程派缺口（P344 / P374 / P389）
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

## 三、当期数字（2026-11-25，批 AF′ 之后）

| 项 | 值 |
| --- | --- |
| `tsc` | 0 |
| `vitest --no-file-parallelism` | **93 文件 999 用例** |
| `copy_gate` | ok（玩家可见文案 0 处别的作品名） |
| `eye_gate` | stamp **171** 条（控制台 10 条 error 为预览环境 `/laoyou-api/` 404，良性） |
| `ai_gate` | `"ok": true` |
| `audit_counts` | **54 文件 668 条 id** |
| `audit_pixel` | 字面色值 **0**；12 色 token；图标 **21**；`@keyframes` 14（`steps(` 8）；`prefers-reduced-motion` 2；`sechd` 59；`icon(` 55；`data-act` 46 |
| `audit_ai` | 线上 **29 / 29 remote** |
| 替身四种子 | **¥106,534 · 199.5 碗 · 42.3% · 期末 ¥469,495** |
| 构建 | `index-BbFQW5wj.js` 1,738,537 B / `index-BREpkhCi.css` 55,638 B |
| 线上 | `http://8.134.86.249/laoyoufen/` 与本地逐位一致；health `events 83 / playtests 97` |

四种子基线口径：`npm run -s probe:standin`，四个月种子各跑 36 个月，取月均营收 / 日均碗数 / 总流失率 / 期末现金的平均。**界面批次（AE′、AF′）四种子恒定，此时判据只能靠探针**（P417）。

## 四、探针清单（每个都对应一个真判据）

| 探针 | 端口 | 管什么 |
| --- | --- | --- |
| `soupbase_probe.py` | 4243 | 汤底三底、骨汤打底、打底徽章、三段工序一句话（`step_same_on_shop` 比字面） |
| `fold_probe.py` | 4243 | 打烊单折叠（含 340 宽只留两条）、手册「读过」 |
| `accept_probe.py` | 4244 | 设置里操作一览点开算翻过、与图鉴手册同一本账 |
| `shopname_probe.py` | 4240 | 招牌改名、四个操作页、图鉴 16 页五章 |
| `rally_probe.py` / `pack_probe.py` / `store_probe.py` / `stage_probe` 等 | 4235–4238 | 各批各自的回归锁 |

## 五、还剩什么（按要不要做）

1. **P405** AI 上下文写死（`broth_thick_voice` 只说「挂得住 / 黏」）—— 可以让它读当天实际口味分。
2. **P412** 打烊单折叠开合不记忆 —— 存进 prefs 即可，改动小。
3. **P416** 探针越攒越胖（`fold_probe` 同时管折叠与手册，与 P344 同型）—— 想拆就拆，不急。
4. **P344** 服务端事件表 `server/events.json` 与游戏内容靠手工重导 —— 迟早要写个 `npm run -s gen:server`。
5. **P374 / P389** 替身不买包装机、换底几乎不触发 —— 影响的是「替身能不能替我们验证收益」，不是玩家体验。

## 六、维护规矩

- 每次整体验收在**这一份**里改三处：日期、第三节数字、第一节链到的新一份批次文档；
- 不再新增 `三维度整体验收-<日期>.md`；
- 账本 `.junshi/ledger.md` 仍是逐批正本，`### 行 N · 日期 · 标题`，一行一批。
