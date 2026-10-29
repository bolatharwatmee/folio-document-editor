import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/test/**/*.test.ts"],
    environment: "node",
    hookTimeout: 20_000,
    testTimeout: 20_000,
    restoreMocks: true,
  },
});
