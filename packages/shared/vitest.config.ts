import { defineConfig } from "vitest/config"
import { baseCoverageConfig, baseTestConfig } from "../../vitest.base.config"

export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: "node",
    coverage: {
      ...baseCoverageConfig,
      exclude: ["**/src/index.ts", "**/src/types.ts"]
    }
  }
})
