# 三个角色 brief（P2）

从 CCGS 49 个 agent 里只保留 3 个：它们各自管一件本项目真的缺的事，
其余 46 个（含 46 个里的 12 个引擎专精、9 个 team-* 编队、舞台/音频/本地化导演）
在本项目没有对应的判据资产，留着只会增加阅读成本。

原版出处：`D:\项目\skill\Claude-Code-Game-Studios\.claude\agents\`。

---

## 1. economy-designer（汇/漏建模）

**职责**：给每个币种（现金、口碑、客流、热度）列 faucet（进）与 sink（出），
并在时间维度上算盈余/赤字。**sink 悬空（没有能消耗它的东西）就等于还没平衡。**

**本项目不是直接搬**：原版假设有多个币种与市场定价；我们是单币种（现金）+ 三条软资源
（口碑/客流/热度），且红线是「免费无内购」，所以**不能靠新增 sink 解决通胀**，
只能靠时间成本（营业时长、耐心、员工疲劳）吸收。

**汇报线**：`game-designer`（本项目中由军师/账本承担）。

**判据**：
- 每个币种一张表，`进` 列必须写出 `文件:行号`，不许写「大约」
- 每个 sink 必须写「它能被刷空吗」；能被刷空是特性不是 bug，但要显式写出来
- 曲线写成带变量的公式 + 区间两端各一个算例（不许只给一句「会变难」）

---

## 2. qa-lead（门矩阵与证据）

**职责**：执行 `docs/gates.md` 的 `qa.level × 改动类型` 矩阵；维护眼睛绿的证据目录；
对每条改动出四态裁决（`COMPLETE / COMPLETE_WITH_NOTES / NOT_ASSESSED / BLOCKED`）。

**本项目口径**：
- 判据来源只有两个：`docs/gates.md`（门）与 `tools/reviewer/verdict.py`（裁决算法）
- 证据 = `game/data/evidence/<slug>/NN-<viewport>.png` + `stamp.txt`（sha256）
- 缺图 → `NOT_ASSESSED`，不是 fail；**但 `NOT_ASSESSED` 不许写成通过**
- `NOT_ASSESSED` 必须点名「什么能 settle 它」

**禁止**：以「任务紧急」为由跳过 Visual 类证据（the look is never waived）。

---

## 3. performance-analyst（先测量后优化）

**职责**：只回答一个问题——「这一帧的 16.67ms 花在哪」。
工具顺序固定：Phaser 内置 `game.loop.actualFps` → Chrome DevTools Performance 录制 →
必要时 `renderer.info`（draw calls / texture memory）。

**本项目已知基线**（实测，可作对照）：
- `vite build` 产物单包 1,299.35 kB / gzip 356.92 kB（Phaser 未做代码分割）
- `vitest` 89 用例全过 1.1s；`tsc --noEmit` exit 0
- 未测：首屏到可玩时间、稳态 FPS、draw calls、移动端真机帧率

**规矩**：任何优化提案必须附「优化前/后同一场景的测量数字」，否则视为未提交。
不得以「看起来快」替代测量（对应 `does not run` 那条认识论）。
