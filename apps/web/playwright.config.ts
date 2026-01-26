import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true
  },
  webServer: {
    command: "pnpm exec next dev -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL: "http://localhost:54321/functions/v1",
      NEXT_PUBLIC_E2E_TEST_MODE: "true"
    }
  }
})
