# 交接模板

> 复制这份到 `.junshi/handoff/<你的窗名>.md`，把尖括号里的东西换掉。
> 时间一律写 `2026-11-27 18:00` 这种带日期的完整形式；只写「刚才」对方没法判断新旧。

```markdown
# <窗名>

- Session: `session-xxxxxxxx-...`（或 `fork of session-9d96182c...`）
- 更新: 2026-11-27 18:00
- 状态: 进行中 / 已完成 / 等对方 / 已停手

## 我现在在做什么

<一句话。例：在做 BE′ 之后的下一批，主题是 P514（历史月份的门路格是假的）。>

## 我写到了哪

- 改了：`game/src/sim/invest.ts`、`game/src/ui/panels.ts`
- git：<`git status --short` 的实际输出；有 commit 就写 sha 和 subject>
- 没 commit / 已 commit / 已 push / 已部署

## 我需要你给什么

- <具体到文件、句子、数字。例：需要你在 `docs/ACCEPTANCE.md` 第三节把 vitest 那行的「1136」改成「1145」，我这边不动 ACCEPTANCE。>

## 我不碰什么

- 这段时间我不动：`docs/ACCEPTANCE.md`、`.junshi/ledger.md`、`game/data/evidence/*`、`deploy/`
- 你可以放心改：`<列出空出来的范围>`
```

## 收工时的写法

把 `状态` 改成 `已完成`，并在最上面加一行结论式摘要：

```markdown
**收工结论**：<一句话，含关键数字。例：P514 修完，vitest 112 文件 1145 用例全过，四种子逐位不变，commit `abc1234`，未部署。>
```

然后追加一节「留给下一个窗的坑」——这一节最重要，没有它下一窗会重踩。
