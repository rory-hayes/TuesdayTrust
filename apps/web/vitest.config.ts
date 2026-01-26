import { defineConfig } from "vitest/config"
import { baseCoverageConfig, baseTestConfig } from "../../vitest.base.config"

export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      ...baseCoverageConfig,
      include: ["**/lib/**/*.ts", "**/components/**/*.tsx"],
      exclude: [
        "**/components/app-shell.tsx",
        "**/lib/supabase.ts",
        "**/lib/sample-data.ts"
      ]
    }
  }
})
