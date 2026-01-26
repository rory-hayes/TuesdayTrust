import { defineConfig } from "vitest/config"
import { baseCoverageConfig, baseTestConfig } from "../../vitest.base.config"

export default defineConfig({
  test: {
    ...baseTestConfig,
    environment: "node",
    coverage: {
      ...baseCoverageConfig,
      exclude: [
        "**/tests/**",
        "**/src/index.ts",
        "**/src/datastore/supabase.ts",
        "**/src/datastore/types.ts",
        "**/src/storage/supabase.ts",
        "**/src/storage/types.ts"
      ]
    }
  }
})
