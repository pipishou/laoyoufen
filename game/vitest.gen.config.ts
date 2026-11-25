import { defineConfig } from "vitest/config";

/**
 * 生成器专用配置（批 AH′，解 P344）：只跑 `tools/**\/*.gen.ts`，不进 `npm test` 的主套件。
 * 用 `npm run -s gen:server` 触发 —— 它把游戏里的 `EVENTS` 重导到 `server/events.json`，
 * 只在内容真变了的时候才写盘。
 */
export default defineConfig({
  test: {
    include: ["tools/**/*.gen.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
