import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    globals: true,
    environment: "node",
    include: ["src/**/*.e2e.test.ts"],
    coverage: {
      enabled: false,
    },
  },
});
