# 飘测试账本（FLAKY）

一行一条，写在「现在怎么办」上，不写「看起来像什么」。这份账是为了让下一个接手的人**不用重新踩一遍**，也是让「把跑测试的次数堆上去」这种自欺欺人的做法无处可藏。

## 规矩

1. `npm test` 一律带 `--no-file-parallelism`（老友粉店实测：并行跑 worker 抢 CPU，`customer.test.ts` / `events.test.ts` 里按「真实秒数」跑模拟的用例会假红）。
2. 任何用例若需要「等一会儿」，用 `vi.useFakeTimers()` 推时间，**不许** `sleep`。唯一的例外是真要量浏览器（`tools/gate/*_probe.py` 与长跑门）。
3. 一条用例连红两次且代码没动过 → 记到这张表，并当场二选一：要么改成确定的（首选），要么删掉（次选）。**不许靠重跑过关**。
4. 只有一件东西允许「不通过就是通过」——长跑门 `tools/gate/playthrough_gate.py` 里的 `heap_bounded` 在无 `performance.memory` 时可返回 `None`（浏览器不支持就量不了，别假装量到了）。

## 已记账

| 用例 / 脚本 | 症状 | 根因 | 现在怎么办 |
| --- | --- | --- | --- |
| `src/sim/customer.test.ts`、`src/sim/events.test.ts`（整文件） | 并行跑时偶发超时假红 | 用例里推进真实分钟数，worker 抢 CPU 时 wall clock 被拖长 | 跑测试一律 `--no-file-parallelism`（已写进 `AGENTS.md` 与 `docs/ACCEPTANCE.md`） |
| `src/ai/lines-cooldown.test.ts` 里「连败翻倍」那条 | 首跑 `expected 1 to be 2` | 用 `resetLineCooldown()` 当「时间过去」用，而它等于重连、会把 `failStreak` 清零 | 用 `vi.useFakeTimers()` + `vi.advanceTimersByTime(61_000)`，别调 reset |
| `tools/gate/fold_probe.py` 的「窄屏只留两条」 | 首跑读到 4 行、判据红 | 之前那段把折叠点开过（`whyOpen` 记在 prefs 里，跨 `refresh()` 还在） | 先点一次收回，再 `set_viewport_size` + `refresh()` |
| `tools/gate/framediff_probe.py` 的三视口 | 首跑基准与比对「同一份代码也差 1269–5293 px」 | 开局那条 toast 上的店名是**随机**取的（`秀灵老友粉铺` / `中山路…`），截图时还在屏幕上 | PIN 脚本里清空 `#toasts` 并隐藏容器（已修，现为逐点相同） |
| `tools/gate/eye_gate.py` | 跑完探针的截图证据全没了 | 它按 slug 清 `game/data/evidence/<slug>` | `eye_gate` 之后再重跑对应探针补证据（写进 `AGENTS.md`） |

## 不算飘、但会被误当成飘的三件

- **`phase` 不是 `playing`**：报账单挂着时契约就返回 `won`，这是设计。长跑门改成「连续 40 拍（约 4 秒）都不是 playing 才算卡住」。
- **一行 4xx**：预览环境没有 `/laoyou-api/`，`Failed to load resource` 是必然。判据是「4xx 只许出现在 `/laoyou-api/` 下」，而不是「一条 4xx 都不许有」。
- **四种子逐位相同**：界面/文案/门 这几类改动**必须**逐位相同；只有改了「替身会不会用某个系统」才允许变。判据写在 `docs/ACCEPTANCE.md` 第三节，别把它当成「没生效」。
