# 老友粉店 · 广西老友粉模拟器

一个跑在浏览器里的广西老友粉店经营模拟器。灵感与数值方法论来自开罗拉面店（The Ramen Sensei）的静态资源逆向分析；不含任何开罗原始素材。

- **目标玩家**：真实玩家，免费游玩、无内购
- **平台**：手机 + PC 双端浏览器（H5）
- **技术栈**：TypeScript + Phaser 3.90 + Vite；DOM HUD
- **差异化三元素**：前端 UI 手感 / 广西本土化 / AI 能力（离线预生成 + AI 审核官）

## 目录

```
game/                 游戏本体（Vite + Phaser 3.90）
  src/sim/            确定性模拟核心（状态、顾客、常客、事件、评分、存档、大赛）
  src/render/         程序化绘制（无 tilemap 资产，world.ts 手绘像素风）
  src/ui/             DOM HUD / 面板 / HUD 样式
  src/ai/             AI 叙事层（默认离线模板；配置 VITE_AI_PROXY_URL 后走代理）
  data/               数值与文案表（事件、顾客、食材、大赛 34 省对手等）
tools/reviewer/       AI 审核官管线（离线脚本，不进 bundle）
美术/风格锚/           风格锚图与 HUD 样稿
.junshi/              决策账本与拍板件（decision-cards/、brainstorm/）
docs：需求-老友粉店-MVP-v1.0.md / 评估报告 / AI 审核官与数据飞轮 / 差异化三元素深化
```

## 开发

```bash
cd game
npm install
npm run dev        # 本地开发
npm run typecheck  # tsc --noEmit
npm run test       # vitest run（89 用例）
npm run build      # vite build → dist/
```

三绿（typecheck / test / build）为提交底线。

## 设计红线

1. 免费、无内购
2. 数值与文案优先本地化（广西/南宁）
3. **AI 不产数字**——一切数值来自确定性模拟，AI 只产文字
4. 逆向只做静态资源分析，不复制原始美术/音频
5. 事件弹窗必须暂停时钟

## 决策记录

所有拍板件在 [`.junshi/decision-cards/`](.junshi/decision-cards/)，决策账本在 [`.junshi/ledger.md`](.junshi/ledger.md)，发散树在 [`.junshi/brainstorm/`](.junshi/brainstorm/)。账本 append-only。

## License

代码 MIT。美术风格锚图仅作内部风格参照，不作发布资产。
