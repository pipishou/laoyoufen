# 三条工程规则（Phaser 3.90 + TypeScript 直译版）

来源：Claude Code Game Studios `.claude/rules/{gameplay-code,ui-code,ai-code}.md`。
原版按 GDScript/C#/C++ 写示例，这里逐条换成我们这套（Phaser 3 + Vite + TS + 纯函数模拟层）。
**不做成 skill，写成规则**：规则是审查时拿来对照的，skill 是要被加载的一段流程，两者不该混。

## 1. gameplay（`game/src/sim/**`）

- 所有可调数值必须来自 `game/src/data/**` 或 `sim/state.ts` 的常量，**不得散落硬编码**。
  现状：`START_CASH=5000`、`START_CAPACITY=40`、`START_MONTH_TARGET=3600`、`START_SEATS=4`、
  `START_STOVES=1`、`TARGET_GROWTH=1.02` 已集中，注释已标明「占位，待真实流水校准」。
- 时间推进只用「分钟/天数」这类离散量（`advanceMinute`），**不得依赖 `Date.now()` 做模拟**；
  真实时钟只允许出现在 `main.ts` 的调度与存档节流。
- 模拟层不引用渲染/UI（`sim/**` 不得 import `render/**`、`ui/**`）；信号通过 `state.flow.*` 单向传给 UI。
- 随机只走 `state.rng`；**同种子必须可复现**（`determinism.test.ts` 1000 局摘要一致就是这条的守门）。
- 状态机（顾客流程）必须有显式状态与转移表，不写 `if` 嵌套猜状态。
- 不得用模块级可变单例存游戏状态（唯一允许的是 `main.ts` 里的 `state` 引用）。

## 2. ui（`game/src/ui/**` + `hud.css`）

- UI **不拥有**游戏状态：只读 `state`，只通过回调（`onToggleTopping` 等）请求变更。
- 所有玩家可见文案走本地化层（当前为内联中文常量 + `ai/director.ts` 模板），
  **不得在渲染代码里拼接面向玩家的句子**。
- 键鼠与触摸**都要能用**；触摸热区 ≥44×44（见 `hud.responsive.css` 的 `pointer: coarse` 分支）。
- 动效必须可跳过，并尊重 `prefers-reduced-motion`。
- UI 不得阻塞主循环：禁止在 render 路径里做同步 DOM 查询/布局读取。
- 每屏必须验证最小与最大视口（375×667 与 1440×900），证据落 `game/data/evidence/`。
- 文字必须可缩放且不截断；断点只改外框与热区，**不改内部 1024×768 坐标系**。

## 3. ai（`game/src/ai/**` 与审核管线）

- AI 每帧预算 2ms；**须有测量证据**（`perf` 记录或 profiler 截图），不许口头声称。
- 参数（模型、超时、并发、阈值）必须外部可配，不写死在调用点。
- 生成内容一律 **离线预生成 + 缓存池 + 空池回落本地模板**（对应红线：AI 不产数字、免费无内购）。
- 输入（玩家输入、网络响应、模型输出）一律视为不可信：结构校验不过就回落，不猜。
- 每次调用必须留下可审计记录（`game/data/review/review_log.jsonl`：模型、耗时、token、裁决、`gate_verdict`）。
- 失败必须 fail-closed：判据报错 → `NOT_ASSESSED`，绝不当成通过。

## 4. data（`game/src/data/**`、`game/data/review/**`）

- 静态表改动视为 **Config/Data 类改动**：`full` 档默认 blocking（见 `docs/gates.md` §2）。
- 数字红线：AI 产出的文案不得含数字/金额（L0 规则 R2），数字只允许出现在人类手写表里。
- 表格结构必须可被 `tools/reviewer/extract_candidates.py` 解析；解析不出＝改动没生效。
