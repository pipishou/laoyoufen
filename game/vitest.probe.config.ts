import { defineConfig } from "vitest/config";

/**
 * 探针专用配置：只跑 `src/**\/*.probe.ts`，不进 `npm test` 的主套件。
 * 用 `npm run probe:rent` 触发；跑出来的数字就是账本行 13 的证据。
 */
export default defineConfig({
  test: {
    include: ["src/**/*.probe.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
