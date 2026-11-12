import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/finance/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 180000,
  },
});
